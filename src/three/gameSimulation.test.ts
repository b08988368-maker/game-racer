import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { EA_TRAX_PLAYLIST } from '../audio/musicEngine';
import { DEFAULT_AI_SETTINGS, DIFFICULTY_AI_PROFILES } from '../config/aiConfig';
import { AIR_GRAVITY_MPS2, FIXED_PHYSICS_DT, HANDLING_PRESETS } from '../config/physicsConfig';
import {
  BLACKLIST_RIVALS,
  CARS,
  computeEffectiveStats,
  getDefaultCarConfig,
  getDefaultCareerProfile,
  getMissionsForTier,
  isTierBossUnlocked,
  MAX_UPGRADE_LEVEL,
  NFS_MISSIONS,
  TOTAL_BLACKLIST_RANKS,
  TRACKS,
} from '../data/gameData';
import {
  AiRacerView,
  buildFairAiConfig,
  computeAiCornerSafeSpeedMs,
  createAiBrainState,
  stepAiRacerPhysics,
} from './aiDriver';
import {
  BuiltTrack,
  computeTrackSampledCorridors,
  getControlPoints,
  getTrackRoadHalfWidth,
} from './trackBuilder';
import {
  createVehicleDynamicsState,
  stepVehiclePhysics,
  VehicleStepInput,
  VehicleStepOutput,
} from './vehiclePhysics';

function makeBaseStepInput(overrides: Partial<VehicleStepInput> = {}): VehicleStepInput {
  const preset = HANDLING_PRESETS.balanced;
  return {
    dt: FIXED_PHYSICS_DT,
    rawDt: FIXED_PHYSICS_DT,
    forwardSpeed: 40,
    lateralSpeed: 0,
    steerAngle: 0,
    rawSteerInput: 0,
    throttleInput: true,
    brakeInput: false,
    handbrakeInput: false,
    throttleAxis: 1,
    brakeAxis: 0,
    nosActive: false,
    driftBoostActive: false,
    drafting: false,
    airborne: false,
    spikedTimer: 0,
    isSpeedbreaker: false,
    baseMaxMs: 75,
    maxForwardMs: 75,
    accelStat: 72,
    handlingStat: 70,
    bodyStyle: 'coupe',
    upcomingTurnSeverity: 0,
    lateralOffset: 0,
    roadHalfWidth: 14,
    inShortcut: false,
    shortcutLateral: 0,
    shortcutHalfWidth: 7,
    environment: 'noon_clear',
    trackId: 'rockport_loop',
    roadWetness: 0,
    slopePitch: 0,
    bankAngle: 0,
    landingVelMps: 0,
    damageDragFactor: 0,
    alignmentPull: 0,
    wheelRadiusM: 0.35,
    tuning: preset.tuning,
    assists: preset.defaultAssists,
    ...overrides,
  };
}

function makeOutput(): VehicleStepOutput {
  return {
    forwardSpeed: 0,
    lateralSpeed: 0,
    yawRate: 0,
    heaveOffset: 0,
    targetPitch: 0,
    targetRoll: 0,
    wheelspinIntensity: 0,
    surface: 'asphalt',
    absActive: false,
    tcsActive: false,
  };
}

test('Straight-line zero-steer stability produces zero lateral drift or yaw pull', () => {
  const dyn = createVehicleDynamicsState();
  const inp = makeBaseStepInput({ forwardSpeed: 55, lateralSpeed: 0, steerAngle: 0, rawSteerInput: 0 });
  const out = makeOutput();

  for (let i = 0; i < 120; i++) {
    stepVehiclePhysics(dyn, inp, out);
    inp.forwardSpeed = out.forwardSpeed;
    inp.lateralSpeed = out.lateralSpeed;
  }

  assert.equal(out.yawRate, 0, 'yawRate should stay strictly 0 with zero steer input');
  assert.equal(out.lateralSpeed, 0, 'lateralSpeed should stay strictly 0 on flat straight road');
  assert.ok(out.forwardSpeed > 55, 'car should accelerate cleanly down the straight');
});

test('Slope pitch gravity accelerates downhill and resists uphill', () => {
  const dynFlat = createVehicleDynamicsState();
  const dynDown = createVehicleDynamicsState();
  const dynUp = createVehicleDynamicsState();

  const outFlat = makeOutput();
  const outDown = makeOutput();
  const outUp = makeOutput();

  const inFlat = makeBaseStepInput({ forwardSpeed: 30, throttleInput: false, slopePitch: 0 });
  const inDown = makeBaseStepInput({ forwardSpeed: 30, throttleInput: false, slopePitch: -0.18 });
  const inUp = makeBaseStepInput({ forwardSpeed: 30, throttleInput: false, slopePitch: 0.18 });

  for (let i = 0; i < 60; i++) {
    stepVehiclePhysics(dynFlat, inFlat, outFlat);
    inFlat.forwardSpeed = outFlat.forwardSpeed;

    stepVehiclePhysics(dynDown, inDown, outDown);
    inDown.forwardSpeed = outDown.forwardSpeed;

    stepVehiclePhysics(dynUp, inUp, outUp);
    inUp.forwardSpeed = outUp.forwardSpeed;
  }

  assert.ok(outDown.forwardSpeed > outFlat.forwardSpeed, 'downhill coasting must preserve/gain speed vs flat');
  assert.ok(outFlat.forwardSpeed > outUp.forwardSpeed, 'uphill coasting must lose more speed than flat');
});

test('Banked road angle creates inward lateral support & Stage 5 upgrades beat Stage 1', () => {
  const dynBank = createVehicleDynamicsState();
  const outBank = makeOutput();
  const inBank = makeBaseStepInput({ forwardSpeed: 45, throttleInput: true, bankAngle: 0.16 });
  stepVehiclePhysics(dynBank, inBank, outBank);
  assert.ok(outBank.lateralSpeed < 0, 'positive bankAngle (+right higher) should pull car toward -right');

  assert.equal(MAX_UPGRADE_LEVEL, 5, 'Max upgrade stage must be 5');
  const cobalt = CARS[0];
  const stage1 = getDefaultCarConfig(cobalt.id);
  const stage5 = {
    ...stage1,
    engineLevel: MAX_UPGRADE_LEVEL,
    turboLevel: MAX_UPGRADE_LEVEL,
    nitrousLevel: MAX_UPGRADE_LEVEL,
    tiresLevel: MAX_UPGRADE_LEVEL,
  };
  const s1Stats = computeEffectiveStats(cobalt, stage1);
  const s5Stats = computeEffectiveStats(cobalt, stage5);

  assert.ok(s5Stats.topSpeedKmh >= s1Stats.topSpeedKmh + 80, 'Stage 5 car should gain substantial top speed');
  assert.ok(s5Stats.accel > s1Stats.accel, 'Stage 5 car should gain strong acceleration');
});

test('buildFairAiConfig scales competitively with player Stage 1-5 upgrades while keeping rubber-banding bounded', () => {
  const cobalt = CARS[0];
  const stage5Player = {
    ...getDefaultCarConfig(cobalt.id),
    engineLevel: MAX_UPGRADE_LEVEL,
    turboLevel: MAX_UPGRADE_LEVEL,
    nitrousLevel: MAX_UPGRADE_LEVEL,
    tiresLevel: MAX_UPGRADE_LEVEL,
  };
  const stage1Player = getDefaultCarConfig(cobalt.id);

  const aiVsStage5 = buildFairAiConfig(cobalt, stage5Player, 'Medium', 1, false, 0);
  const aiVsStage1 = buildFairAiConfig(cobalt, stage1Player, 'Medium', 1, false, 0);

  assert.ok(
    aiVsStage5.engineLevel > aiVsStage1.engineLevel,
    `AI vs Stage 5 (${aiVsStage5.engineLevel}) must scale competitively higher than vs Stage 1 (${aiVsStage1.engineLevel})`,
  );
  assert.ok(aiVsStage5.engineLevel <= MAX_UPGRADE_LEVEL, 'AI engine level must remain clamped within MAX_UPGRADE_LEVEL');
  assert.ok(aiVsStage1.tiresLevel >= 2, 'Competitive AI maintains strong tire grip even against Stage 1');
  assert.ok(DIFFICULTY_AI_PROFILES.Easy.baseSkill >= 1.0, 'Easy AI remains competitive without sandbagging');
  assert.ok(DIFFICULTY_AI_PROFILES.Easy.catchupMax <= 1.22, 'Easy catchup remains competitive without absurd speeds');
  assert.ok(DIFFICULTY_AI_PROFILES.Expert.catchupMax <= 1.28, 'Expert rubber banding must remain capped');
});

test('15-rank Blacklist progression, 28 cars, 80 missions, and endurance maxDamagePercent gates work accurately', () => {
  assert.equal(TOTAL_BLACKLIST_RANKS, 15);
  assert.equal(BLACKLIST_RIVALS.length, 15);
  assert.equal(CARS.length, 28);
  assert.equal(CARS.filter((c) => c.bossOnly).length, 15);
  assert.equal(CARS.filter((c) => !c.bossOnly).length, 13);
  assert.equal(NFS_MISSIONS.length, 80);

  const tier8 = getMissionsForTier(8);
  const tier1 = getMissionsForTier(1);
  assert.equal(tier8.length, 6);
  assert.equal(tier1.length, 6);

  const cleanStorm = tier8.find((m) => m.id === 'm_8_6');
  const finalGauntlet = tier1.find((m) => m.id === 'm_1_6');
  assert.equal(cleanStorm?.maxDamagePercent, 30);
  assert.equal(finalGauntlet?.maxDamagePercent, 20);

  const rival15 = BLACKLIST_RIVALS.find((r) => r.rank === 15)!;
  const profile = getDefaultCareerProfile();
  const initialGate = isTierBossUnlocked(rival15, profile);
  assert.equal(initialGate.unlocked, false);
  assert.equal(initialGate.rankReached, true);
  assert.equal(initialGate.missionsTotal, 5);

  const clearedProfile = {
    ...profile,
    totalBounty: rival15.requiredBounty,
    copsTakedowns: rival15.requiredTakedowns,
    completedMissionIds: getMissionsForTier(15).map((m) => m.id),
  };
  const clearedGate = isTierBossUnlocked(rival15, clearedProfile);
  assert.equal(clearedGate.unlocked, true);

  const rival10 = BLACKLIST_RIVALS.find((r) => r.rank === 10)!;
  const rank10Blocked = isTierBossUnlocked(rival10, {
    ...profile,
    totalBounty: rival10.requiredBounty,
    copsTakedowns: rival10.requiredTakedowns,
    completedMissionIds: getMissionsForTier(10).map((m) => m.id),
  });
  assert.equal(rank10Blocked.rankReached, false);
  assert.equal(rank10Blocked.unlocked, false);
});

test('AI corner speed stays fast through moderate sweepers without lane-change double-braking', () => {
  const gripBudget = 21.8 * 1.14 * 1.09 * 1.05; // ~28.4 m/s^2
  const sweeperSpeedMs = computeAiCornerSafeSpeedMs(140, 999, gripBudget, 0.18, 1.0);
  assert.ok(sweeperSpeedMs > 60, `Expected sweeper speed > 60 m/s (216 km/h), got ${sweeperSpeedMs.toFixed(1)}`);

  const laneChangeSpeedMs = computeAiCornerSafeSpeedMs(140, 999, gripBudget, 0.28, 1.0);
  assert.equal(laneChangeSpeedMs, sweeperSpeedMs, 'Moderate lane-change steering must not trigger double-braking');

  const tightHairpinMs = computeAiCornerSafeSpeedMs(28, 999, gripBudget, 0.52, 1.0);
  assert.ok(tightHairpinMs < 30 && tightHairpinMs > 20, `Tight hairpin speed should stay realistic (${tightHairpinMs.toFixed(1)} m/s)`);
});

test('Counter-steering actively hooks up and damps lateral slide faster than drifting passively', () => {
  const dynPassive = createVehicleDynamicsState();
  const dynCounter = createVehicleDynamicsState();
  const outPassive = makeOutput();
  const outCounter = makeOutput();

  const inPassive = makeBaseStepInput({ forwardSpeed: 48, lateralSpeed: 8.5, rawSteerInput: 0.4, steerAngle: 0.16 });
  const inCounter = makeBaseStepInput({ forwardSpeed: 48, lateralSpeed: 8.5, rawSteerInput: -0.6, steerAngle: -0.22 });

  for (let i = 0; i < 12; i++) {
    stepVehiclePhysics(dynPassive, inPassive, outPassive);
    inPassive.forwardSpeed = outPassive.forwardSpeed;
    inPassive.lateralSpeed = outPassive.lateralSpeed;

    stepVehiclePhysics(dynCounter, inCounter, outCounter);
    inCounter.forwardSpeed = outCounter.forwardSpeed;
    inCounter.lateralSpeed = outCounter.lateralSpeed;
  }

  assert.ok(
    Math.abs(outCounter.lateralSpeed) < Math.abs(outPassive.lateralSpeed),
    'Counter-steering must recover lateral slip noticeably faster than steering into the slide',
  );
});

test('Grounded gravity and high-speed front understeer saturation enforce realistic cornering', () => {
  assert.ok(AIR_GRAVITY_MPS2 >= 50, `Expected high grounded gravity >= 50 m/s^2, got ${AIR_GRAVITY_MPS2}`);

  const dynFast = createVehicleDynamicsState();
  const dynTrail = createVehicleDynamicsState();
  const outFast = makeOutput();
  const outTrail = makeOutput();

  const inFast = makeBaseStepInput({
    forwardSpeed: 74,
    throttleInput: true,
    brakeInput: false,
    rawSteerInput: 1.0,
    steerAngle: 0.42,
  });
  const inTrail = makeBaseStepInput({
    forwardSpeed: 38,
    throttleInput: false,
    brakeInput: true,
    rawSteerInput: 0.85,
    steerAngle: 0.36,
  });

  for (let i = 0; i < 20; i++) {
    stepVehiclePhysics(dynFast, inFast, outFast);
    inFast.forwardSpeed = outFast.forwardSpeed;
    inFast.lateralSpeed = outFast.lateralSpeed;

    stepVehiclePhysics(dynTrail, inTrail, outTrail);
    inTrail.forwardSpeed = outTrail.forwardSpeed;
    inTrail.lateralSpeed = outTrail.lateralSpeed;
  }

  assert.ok(
    Math.abs(outTrail.yawRate) > Math.abs(outFast.yawRate) * 1.15,
    `Trail-braked corner entry (${outTrail.yawRate.toFixed(2)}) must bite harder than overloaded 265 km/h full-lock understeer (${outFast.yawRate.toFixed(2)})`,
  );
});

test('Only 2 tracks are wide high-speed circuits and all 10 tracks have clean upper/lower decks without bay submergence', () => {
  const wideTracks = TRACKS.filter((t) => getTrackRoadHalfWidth(t.id) >= 13.0);
  assert.equal(wideTracks.length, 2, 'Exactly 2 tracks must remain wide fast circuits');
  assert.deepEqual(
    wideTracks.map((t) => t.id).sort(),
    ['gray_point_bay', 'hwy99_speedway'],
  );

  for (const trk of TRACKS) {
    const pts = getControlPoints(trk.id);
    const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.48);
    const spaced = curve.getSpacedPoints(720);

    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let minX = Infinity;
    let maxX = -Infinity;

    for (const p of spaced) {
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
      if (p.z < minZ) minZ = p.z;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
    }

    assert.ok(maxY - minY >= 19, `${trk.id} must have >= 19m elevation swing (got ${(maxY - minY).toFixed(1)}m)`);

    // Check any multi-level crossing has >= 15m vertical clearance
    let maxDeckSeparation = 0;
    for (let i = 0; i < 720; i++) {
      const a = spaced[i];
      for (let j = i + 40; j < 720 - 40; j++) {
        const b = spaced[j];
        const horizDist = Math.hypot(a.x - b.x, a.z - b.z);
        if (horizDist < 12) {
          const dy = Math.abs(a.y - b.y);
          assert.ok(
            dy >= 15,
            `${trk.id} has an unsafe co-planar crossing (horiz=${horizDist.toFixed(1)}m, dy=${dy.toFixed(1)}m at samples ${i}/${j})`,
          );
          if (dy > maxDeckSeparation) maxDeckSeparation = dy;
        }
      }
    }
    assert.ok(
      maxDeckSeparation >= 15,
      `${trk.id} must feature an overlapping upper/lower bridge deck (got ${maxDeckSeparation.toFixed(1)}m)`,
    );

    // Harbor bay tracks must stay cleanly above ocean level (-2.8m) in bay water region
    const hasHarborBay = trk.id === 'rockport_loop' || trk.id === 'camden_coast' || trk.id === 'gray_point_bay';
    if (hasHarborBay) {
      for (const p of spaced) {
        if (p.z < minZ + 380 && p.x > minX - 100 && p.x < maxX + 180) {
          assert.ok(
            p.y >= 1.5,
            `${trk.id} bay road sample at z=${p.z.toFixed(1)} dipped too close to water (y=${p.y.toFixed(2)})`,
          );
        }
      }
    }
  }
});

test('Soundtrack and track music labels contain zero NEFFEX tracks', () => {
  assert.ok(EA_TRAX_PLAYLIST.length >= 10, 'Expected full non-NEFFEX racing soundtrack');
  for (const song of EA_TRAX_PLAYLIST) {
    assert.ok(!/neffex/i.test(song.title), `Unexpected NEFFEX title: ${song.title}`);
    assert.ok(!/neffex/i.test(song.artist), `Unexpected NEFFEX artist: ${song.artist}`);
    assert.ok(!/^nf_/i.test(song.id), `Unexpected NEFFEX track id: ${song.id}`);
  }
  for (const trk of TRACKS) {
    assert.ok(
      !/neffex/i.test(trk.musicTrackName),
      `Track ${trk.id} still references NEFFEX (${trk.musicTrackName})`,
    );
  }
});

test('All 10 tracks keep shortcut roadways cleanly separated from main lanes without merging', () => {
  let totalShortcuts = 0;
  for (const trk of TRACKS) {
    const corridor = computeTrackSampledCorridors(trk.id);
    if (trk.id !== 'hwy99_speedway') {
      assert.ok(corridor.shortcuts.length >= 1, `${trk.id} must define at least 1 shortcut`);
    }
    totalShortcuts += corridor.shortcuts.length;

    for (const sc of corridor.shortcuts) {
      const sEntry = corridor.samples[sc.entryCutStartIdx];
      const sExit = corridor.samples[sc.exitCutEndIdx];

      const entryLat = sc.entryPos.clone().sub(sEntry.point).dot(sEntry.right) * sc.def.side;
      const exitLat = sc.exitPos.clone().sub(sExit.point).dot(sExit.right) * sc.def.side;
      assert.ok(
        entryLat - sc.scHalfW >= corridor.roadHalfWidth - 1.0,
        `${trk.id} (${sc.def.label}) entry mouth overlaps main lane (inner edge at ${(entryLat - sc.scHalfW).toFixed(2)} vs roadHalfWidth ${corridor.roadHalfWidth})`,
      );
      assert.ok(
        exitLat - sc.scHalfW >= corridor.roadHalfWidth - 1.0,
        `${trk.id} (${sc.def.label}) exit mouth overlaps main lane (inner edge at ${(exitLat - sc.scHalfW).toFixed(2)} vs roadHalfWidth ${corridor.roadHalfWidth})`,
      );

      // Interior shortcut points (j = 7..scSegs-7) must stay well clear of co-planar main track barriers
      const minAllowedDist = corridor.barrierHalfWidth + sc.scHalfW + 1.5;
      for (let j = 7; j <= sc.scSegs - 7; j++) {
        const pt = sc.scPts[j];
        let minHorizDist = Infinity;
        for (const tp of corridor.samples) {
          if (Math.abs(pt.y - tp.point.y) >= 13.5) continue;
          const d = Math.hypot(pt.x - tp.point.x, pt.z - tp.point.z);
          if (d < minHorizDist) minHorizDist = d;
        }
        assert.ok(
          minHorizDist >= minAllowedDist,
          `${trk.id} (${sc.def.label}) sample j=${j} merged toward main lane (dist=${minHorizDist.toFixed(2)}m < ${minAllowedDist.toFixed(2)}m)`,
        );
      }
    }
  }
  assert.ok(totalShortcuts >= 9, `Expected >= 9 total shortcuts across tracks, got ${totalShortcuts}`);
});

test('Easy mode AI stays closely competitive and surges to close trailing gaps without fading', () => {
  const trkId = 'rockport_loop';
  const corridor = computeTrackSampledCorridors(trkId);
  const samples = corridor.samples;
  let totalLength = 0;
  for (let i = 0; i < samples.length; i++) {
    const next = samples[(i + 1) % samples.length];
    totalLength += samples[i].point.distanceTo(next.point);
  }

  const fakeTrack = {
    id: trkId,
    samples,
    totalLength,
    roadHalfWidth: corridor.roadHalfWidth,
    barrierHalfWidth: corridor.barrierHalfWidth,
    shortcuts: [],
    queryShortcut: () => null,
    getClosestTrackInfo: (x: number, z: number, hintIdx?: number, hintY?: number) => {
      const idx = hintIdx ?? 0;
      const s = samples[idx % samples.length];
      const dx = x - s.point.x;
      const dz = z - s.point.z;
      const lat = dx * s.right.x + dz * s.right.z;
      const elevY =
        hintY !== undefined && Math.abs(hintY - s.point.y) < 12
          ? s.point.y + lat * Math.sin(s.bankAngle)
          : s.point.y + lat * Math.sin(s.bankAngle);
      return {
        sample: s,
        lateralOffset: lat,
        elevationY: elevY,
        slopePitch: s.slopePitch,
        bankAngle: s.bankAngle,
        forwardAngle: Math.atan2(-s.tangent.x, -s.tangent.z),
      };
    },
  } as unknown as BuiltTrack;

  const spec = CARS[12]; // upper-tier street machine
  const playerStage5 = {
    ...getDefaultCarConfig(spec.id),
    engineLevel: MAX_UPGRADE_LEVEL,
    turboLevel: MAX_UPGRADE_LEVEL,
    nitrousLevel: MAX_UPGRADE_LEVEL,
    tiresLevel: MAX_UPGRADE_LEVEL,
  };
  const preset = HANDLING_PRESETS.balanced;
  const brain = createAiBrainState(
    0,
    spec,
    playerStage5,
    'Easy',
    0,
    false,
    0,
    preset.tuning,
    preset.defaultAssists,
    'noon_clear',
    trkId,
  );
  assert.ok(brain.simConfig.engineLevel >= 4, `Easy AI vs Stage 5 must stay Stage 4+, got ${brain.simConfig.engineLevel}`);

  const s0 = samples[0];
  const aiRacer: AiRacerView = {
    id: 'ai_0',
    name: 'Test Rival',
    isPlayer: false,
    spec,
    pos: s0.point.clone(),
    heading: Math.atan2(-s0.tangent.x, -s0.tangent.z),
    forwardSpeed: 42,
    lateralSpeed: 0,
    steerAngle: 0,
    pitch: 0,
    roll: 0,
    airHeight: 0,
    trackIdx: 0,
    totalProgress: 0.25,
    laneTarget: 0,
    aiSkill: 1.0,
    activeShortcutId: null,
    copSlowdownTimer: 0,
    finished: false,
    knockedOut: false,
    busted: false,
  };
  const playerAhead: AiRacerView = {
    ...aiRacer,
    id: 'player',
    isPlayer: true,
    totalProgress: 0.33, // ~400m ahead
  };

  for (let step = 0; step < 60; step++) {
    stepAiRacerPhysics(
      aiRacer,
      brain,
      fakeTrack,
      playerAhead,
      [playerAhead, aiRacer],
      [],
      [],
      'Easy',
      DEFAULT_AI_SETTINGS,
      preset.tuning,
      preset.defaultAssists,
      'noon_clear',
      FIXED_PHYSICS_DT,
      FIXED_PHYSICS_DT,
      0,
      [],
      playerStage5,
    );
  }

  assert.ok(brain.adaptiveMult > 1.08, `Expected Easy AI catchup multiplier > 1.08 when 400m behind, got ${brain.adaptiveMult.toFixed(3)}`);
  assert.ok(brain.targetSpeedMs > 55, `Expected Easy AI to maintain fast pursuit target speed, got ${brain.targetSpeedMs.toFixed(1)} m/s`);
});


