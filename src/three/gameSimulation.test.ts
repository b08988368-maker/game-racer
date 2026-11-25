import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { EA_TRAX_PLAYLIST } from '../audio/musicEngine';
import {
  AI_PERSONALITY_TRAITS,
  AI_TUNING_CONFIG,
  clampSkillForDifficulty,
  computeRubberBandTargetMultiplier,
  computeTargetPaceFromSkill,
  computeUpdatedAdaptiveSkill,
  DEFAULT_AI_SETTINGS,
  DIFFICULTY_AI_PROFILES,
} from '../config/aiConfig';
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
  assert.ok(
    AI_TUNING_CONFIG.MAX_GAP_METERS >= 100 && AI_TUNING_CONFIG.MAX_GAP_METERS <= 200,
    `MAX_GAP_METERS must stay between 100 and 200m (got ${AI_TUNING_CONFIG.MAX_GAP_METERS})`,
  );
  assert.ok(
    AI_TUNING_CONFIG.MAX_TOP_SPEED_OVER_PLAYER_RATIO >= 1.03 &&
      AI_TUNING_CONFIG.MAX_TOP_SPEED_OVER_PLAYER_RATIO <= 1.05,
    'Hard top-speed cap must stay within 3-5% over player car top speed',
  );
  assert.ok(DIFFICULTY_AI_PROFILES.Easy.cornerConfidence >= 0.95);
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

  assert.ok(
    brain.rubberMult > 1.03 && brain.rubberMult <= 1 + AI_TUNING_CONFIG.RUBBER_STRENGTH.Easy + 0.005,
    `Expected smooth Easy rubber-band catchup between 1.03 and ${(1 + AI_TUNING_CONFIG.RUBBER_STRENGTH.Easy).toFixed(2)}, got ${brain.rubberMult.toFixed(3)}`,
  );
  assert.ok(brain.targetSpeedMs > 55, `Expected Easy AI to maintain fast pursuit target speed, got ${brain.targetSpeedMs.toFixed(1)} m/s`);
  const playerMaxMs = computeEffectiveStats(spec, playerStage5).topSpeedKmh / 3.6;
  assert.ok(
    brain.stepIn.maxForwardMs <= playerMaxMs * AI_TUNING_CONFIG.MAX_TOP_SPEED_OVER_PLAYER_RATIO + 0.01,
    `AI maxForwardMs (${brain.stepIn.maxForwardMs.toFixed(2)}) must obey hard cap <= ${(playerMaxMs * AI_TUNING_CONFIG.MAX_TOP_SPEED_OVER_PLAYER_RATIO).toFixed(2)}`,
  );
});

function makeCorridorTestTrack(trkId: (typeof TRACKS)[number]['id']) {
  const corridor = computeTrackSampledCorridors(trkId);
  const samples = corridor.samples;
  let totalLength = 0;
  for (let i = 0; i < samples.length; i++) {
    totalLength += samples[i].point.distanceTo(samples[(i + 1) % samples.length].point);
  }
  const trackShortcuts = corridor.shortcuts.map((sc, idx) => ({
    id: idx,
    label: sc.def.label,
    startIdx: sc.startIdx,
    endIdx: sc.endIdx,
    entryCutStartIdx: sc.entryCutStartIdx,
    entryCutEndIdx: sc.entryCutEndIdx,
    exitCutStartIdx: sc.exitCutStartIdx,
    exitCutEndIdx: sc.exitCutEndIdx,
    innerStartFrac: sc.innerStartFrac,
    innerEndFrac: sc.innerEndFrac,
    side: sc.def.side,
    halfWidth: sc.scHalfW,
    points: sc.scPts,
    tangents: sc.scTangents,
    slopePitches: sc.scSlopePitches,
    entryPos: sc.entryPos,
    exitPos: sc.exitPos,
    planks: [],
    minimapPoints: [],
  }));
  const fakeTrack = {
    id: trkId,
    samples,
    totalLength,
    roadHalfWidth: corridor.roadHalfWidth,
    barrierHalfWidth: corridor.barrierHalfWidth,
    shortcuts: trackShortcuts,
    queryShortcut: () => null,
    getClosestTrackInfo: (x: number, z: number, hintIdx?: number) => {
      const idx = ((hintIdx ?? 0) % samples.length + samples.length) % samples.length;
      const s = samples[idx];
      const dx = x - s.point.x;
      const dz = z - s.point.z;
      const lat = dx * s.right.x + dz * s.right.z;
      const elevY = s.point.y + lat * Math.sin(s.bankAngle);
      return {
        sample: s,
        lateralOffset: lat,
        elevationY: elevY,
        slopePitch: s.slopePitch,
        bankAngle: s.bankAngle,
        distanceSq: dx * dx + dz * dz,
      };
    },
  } as unknown as BuiltTrack;
  return { corridor, fakeTrack };
}

test('All shortcuts and main tracks maintain strict same-side alignment, deck-to-deck clearance, and bridge headroom across all 10 circuits', () => {
  const SAMPLE_COUNT = 720;
  for (const trk of TRACKS) {
    const corridor = computeTrackSampledCorridors(trk.id);
    const n = corridor.samples.length;
    const bhw = corridor.barrierHalfWidth;

    // 1. Main track never overlaps itself co-planarly
    for (let i = 0; i < n; i++) {
      const a = corridor.samples[i].point;
      for (let j = i + 18; j < n; j++) {
        if (n - (j - i) < 18) continue;
        const b = corridor.samples[j].point;
        const dy = Math.abs(a.y - b.y);
        if (dy < 14.5) {
          const d = Math.hypot(a.x - b.x, a.z - b.z);
          assert.ok(
            d >= bhw * 2 + 5.2,
            `${trk.id} main road co-planar pinch between idx ${i} and ${j}: d=${d.toFixed(2)}m`,
          );
        }
      }
    }

    // 2. Shortcut invariants
    for (const sc of corridor.shortcuts) {
      assert.ok(sc.scHalfW >= 6.0, `${trk.id} (${sc.def.label}) scHalfW too narrow: ${sc.scHalfW}`);
      const entryCutSpan = (sc.entryCutEndIdx - sc.entryCutStartIdx + n) % n;
      const exitCutSpan = (sc.exitCutEndIdx - sc.exitCutStartIdx + n) % n;
      assert.ok(entryCutSpan >= 9, `${trk.id} (${sc.def.label}) entry cutout too narrow: ${entryCutSpan}`);
      assert.ok(exitCutSpan >= 9, `${trk.id} (${sc.def.label}) exit cutout too narrow: ${exitCutSpan}`);
      assert.ok(
        sc.innerStartFrac > 0.04 && sc.innerStartFrac < sc.innerEndFrac && sc.innerEndFrac < 0.96,
        `${trk.id} (${sc.def.label}) invalid inner wall frac ${sc.innerStartFrac.toFixed(2)}..${sc.innerEndFrac.toFixed(2)}`,
      );

      // Full deck-to-deck outer edge requirement: main deck outer (bhw + 2.4) + shortcut deck outer (scHalfW + 2.2) + 1.5m gap
      const minDeckClearDist = bhw + sc.scHalfW + 6.1;
      const fullSpan = (sc.exitCutEndIdx - sc.entryCutStartIdx + SAMPLE_COUNT) % SAMPLE_COUNT;

      for (let j = 1; j < sc.scSegs; j++) {
        const p = sc.scPts[j];
        // Paired track sample check: shortcut must stay strictly on sc.def.side of its paired main span
        const fIdx = (sc.entryCutStartIdx + (j / sc.scSegs) * fullSpan) % SAMPLE_COUNT;
        const i0 = Math.floor(fIdx) % SAMPLE_COUNT;
        const i1 = (i0 + 1) % SAMPLE_COUNT;
        const frac = fIdx - Math.floor(fIdx);
        const refPt = new THREE.Vector3().lerpVectors(corridor.samples[i0].point, corridor.samples[i1].point, frac);
        const refRight = new THREE.Vector3()
          .lerpVectors(corridor.samples[i0].right, corridor.samples[i1].right, frac)
          .normalize();
        const pairedLat = (p.x - refPt.x) * refRight.x + (p.z - refPt.z) * refRight.z;
        assert.ok(
          pairedLat * sc.def.side > corridor.roadHalfWidth,
          `${trk.id} (${sc.def.label}) j=${j} crossed toward wrong side: pairedLat=${pairedLat.toFixed(2)} (side=${sc.def.side})`,
        );

        if (j >= 7 && j <= sc.scSegs - 7) {
          for (let ti = 0; ti < n; ti++) {
            const tp = corridor.samples[ti].point;
            const d = Math.hypot(p.x - tp.x, p.z - tp.z);
            const dyAbs = Math.abs(p.y - tp.y);
            if (dyAbs < 15.0) {
              assert.ok(
                d >= minDeckClearDist,
                `${trk.id} (${sc.def.label}) j=${j} deck overlap with main idx=${ti}: d=${d.toFixed(2)} < req=${minDeckClearDist.toFixed(2)} (dy=${dyAbs.toFixed(2)})`,
              );
            }
            const dyOverhead = tp.y - p.y;
            if (dyOverhead > 2.0 && dyOverhead < 15.0) {
              assert.ok(
                d >= bhw + sc.scHalfW + 3.0,
                `${trk.id} (${sc.def.label}) j=${j} low overpass clearance idx=${ti}: dy=${dyOverhead.toFixed(2)}, d=${d.toFixed(2)}`,
              );
            }
          }
        }
      }
    }
  }
});

test('Easy AI stages inside asphalt before shortcut mouths, dodges curved-road traffic, and avoids false braking', () => {
  const trkId = 'rockport_loop';
  const { corridor, fakeTrack } = makeCorridorTestTrack(trkId);
  const samples = corridor.samples;
  const n = samples.length;
  const sc = fakeTrack.shortcuts[0];
  assert.ok(sc, 'Expected rockport_loop to have at least one shortcut');

  const spec = CARS[12];
  const playerStage5 = {
    ...getDefaultCarConfig(spec.id),
    engineLevel: MAX_UPGRADE_LEVEL,
    turboLevel: MAX_UPGRADE_LEVEL,
    nitrousLevel: MAX_UPGRADE_LEVEL,
    tiresLevel: MAX_UPGRADE_LEVEL,
  };
  const preset = HANDLING_PRESETS.balanced;
  // Index 0 gives 'aggressive' personality with high shortcutAffinity
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

  const upstreamIdx = (sc.entryCutStartIdx - 12 + n) % n;
  const sUp = samples[upstreamIdx];
  const aiUpstream: AiRacerView = {
    id: 'ai_0',
    name: 'Test Rival',
    isPlayer: false,
    spec,
    pos: sUp.point.clone(),
    heading: Math.atan2(-sUp.tangent.x, -sUp.tangent.z),
    forwardSpeed: 48,
    lateralSpeed: 0,
    steerAngle: 0,
    pitch: 0,
    roll: 0,
    airHeight: 0,
    trackIdx: upstreamIdx,
    totalProgress: 0.2,
    laneTarget: 0,
    aiSkill: 1.0,
    activeShortcutId: null,
    copSlowdownTimer: 0,
    finished: false,
    knockedOut: false,
    busted: false,
  };
  const playerRef: AiRacerView = { ...aiUpstream, id: 'player', isPlayer: true, totalProgress: 0.21 };

  stepAiRacerPhysics(
    aiUpstream,
    brain,
    fakeTrack,
    playerRef,
    [playerRef, aiUpstream],
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

  assert.ok(
    Math.abs(aiUpstream.laneTarget) <= fakeTrack.roadHalfWidth - 1.0,
    `Upstream AI must stay on asphalt inside roadHalfWidth (${fakeTrack.roadHalfWidth}), got laneTarget=${aiUpstream.laneTarget.toFixed(2)}`,
  );

  // Inside cutout span, AI commits cleanly into the mouth
  const cutMidIdx = (sc.entryCutStartIdx + 2) % n;
  const sCut = samples[cutMidIdx];
  aiUpstream.trackIdx = cutMidIdx;
  aiUpstream.pos.copy(sCut.point);
  aiUpstream.heading = Math.atan2(-sCut.tangent.x, -sCut.tangent.z);
  stepAiRacerPhysics(
    aiUpstream,
    brain,
    fakeTrack,
    playerRef,
    [playerRef, aiUpstream],
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
  assert.equal(brain.actionTag, 'SHORTCUT');
  assert.ok(
    aiUpstream.laneTarget * sc.side > fakeTrack.roadHalfWidth,
    `AI inside cutout should commit into shortcut side (${sc.side}), got laneTarget=${aiUpstream.laneTarget.toFixed(2)}`,
  );

  // Curved-road obstacle avoidance: place traffic directly along track centerline 20m ahead
  const straightIdx = 420;
  const sStraight = samples[straightIdx];
  const sTraffic = samples[(straightIdx + 3) % n];
  const aiDodge: AiRacerView = {
    ...aiUpstream,
    trackIdx: straightIdx,
    pos: sStraight.point.clone(),
    heading: Math.atan2(-sStraight.tangent.x, -sStraight.tangent.z),
    forwardSpeed: 42,
    laneTarget: 0,
  };
  brain.reverseRecoveryTimer = 0;
  brain.stuckTimer = 0;
  stepAiRacerPhysics(
    aiDodge,
    brain,
    fakeTrack,
    playerRef,
    [playerRef, aiDodge],
    [{ pos: sTraffic.point.clone(), laneOffset: 0, isTruck: true }],
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
  assert.ok(
    Math.abs(aiDodge.laneTarget) >= 2.2,
    `AI must dodge traffic placed directly ahead on track centerline, got laneTarget=${aiDodge.laneTarget.toFixed(2)}`,
  );
  assert.equal(brain.stepIn.handbrakeInput, false, 'Easy AI must not handbrake-spin in moderate traffic dodging');
});

test('AI wall-pin reverse recovery steers nose toward road center cleanly in forward and reverse gear', () => {
  const { corridor, fakeTrack } = makeCorridorTestTrack('rockport_loop');
  const s0 = corridor.samples[0];
  const spec = CARS[12];
  const playerCfg = getDefaultCarConfig(spec.id);
  const preset = HANDLING_PRESETS.balanced;
  const brain = createAiBrainState(
    0,
    spec,
    playerCfg,
    'Easy',
    0,
    false,
    0,
    preset.tuning,
    preset.defaultAssists,
    'noon_clear',
    'rockport_loop',
  );

  // Pinned near right wall (+9.0m), reversing at -5 m/s -> rawSteerInput should be negative (-wallSide)
  brain.reverseRecoveryTimer = 0.5;
  const rightPinnedPos = s0.point.clone().addScaledVector(s0.right, 9.0);
  const aiRev: AiRacerView = {
    id: 'ai_rev',
    name: 'Rev Rival',
    isPlayer: false,
    spec,
    pos: rightPinnedPos,
    heading: Math.atan2(-s0.tangent.x, -s0.tangent.z),
    forwardSpeed: -5.0,
    lateralSpeed: 0,
    steerAngle: 0,
    pitch: 0,
    roll: 0,
    airHeight: 0,
    trackIdx: 0,
    totalProgress: 0.1,
    laneTarget: 0,
    aiSkill: 1.0,
    activeShortcutId: null,
    copSlowdownTimer: 0,
    finished: false,
    knockedOut: false,
    busted: false,
  };
  const playerRef: AiRacerView = { ...aiRev, id: 'player', isPlayer: true };
  stepAiRacerPhysics(
    aiRev,
    brain,
    fakeTrack,
    playerRef,
    [playerRef, aiRev],
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
    playerCfg,
  );
  assert.equal(brain.actionTag, 'RECOVER');
  assert.equal(brain.stepIn.rawSteerInput, -1, 'Right-wall reverse recovery must steer -1 while reversing');

  // Same right-wall pin while still rolling forward (+1.2 m/s) -> steers +1 so reversing tail swings away or brakes toward center cleanly
  brain.reverseRecoveryTimer = 0.5;
  aiRev.forwardSpeed = 1.2;
  stepAiRacerPhysics(
    aiRev,
    brain,
    fakeTrack,
    playerRef,
    [playerRef, aiRev],
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
    playerCfg,
  );
  assert.equal(brain.stepIn.rawSteerInput, 1, 'Right-wall recovery while creeping forward must mirror steering sign');
});

test('Skill-based target pace, bounded rubber banding, personalities, and post-race adaptive clamping work accurately', () => {
  // 1. Target pace ranges per difficulty
  assert.ok(Math.abs(computeTargetPaceFromSkill('Easy', AI_TUNING_CONFIG.SKILL_RANGES.Easy.min) - 0.92) < 0.005);
  assert.ok(Math.abs(computeTargetPaceFromSkill('Easy', AI_TUNING_CONFIG.SKILL_RANGES.Easy.max) - 0.95) < 0.005);
  assert.ok(Math.abs(computeTargetPaceFromSkill('Medium', AI_TUNING_CONFIG.SKILL_RANGES.Medium.min) - 0.96) < 0.005);
  assert.ok(Math.abs(computeTargetPaceFromSkill('Medium', AI_TUNING_CONFIG.SKILL_RANGES.Medium.max) - 0.98) < 0.005);
  assert.ok(Math.abs(computeTargetPaceFromSkill('Hard', AI_TUNING_CONFIG.SKILL_RANGES.Hard.min) - 0.99) < 0.005);
  assert.ok(Math.abs(computeTargetPaceFromSkill('Hard', AI_TUNING_CONFIG.SKILL_RANGES.Hard.max) - 1.01) < 0.005);

  // 2. Bounded rubber banding: asymmetric slowdown when AI is ahead vs catching up
  const catchup = computeRubberBandTargetMultiplier(150, 'Medium', 'light');
  const slowAhead = computeRubberBandTargetMultiplier(-150, 'Medium', 'light');
  assert.ok(Math.abs(catchup - 1.10) < 0.001, `Expected Medium +150m catchup = 1.10, got ${catchup}`);
  assert.ok(slowAhead < 1.0 && 1.0 - slowAhead < catchup - 1.0, 'AI ahead slowdown must be gentler than behind catchup');
  assert.equal(computeRubberBandTargetMultiplier(300, 'Medium', 'off'), 1.0);

  // 3. Adaptive skill update formula & difficulty isolation (Easy never becomes Hard)
  let easySkill = AI_TUNING_CONFIG.SKILL_RANGES.Easy.initial;
  for (let r = 0; r < 10; r++) {
    easySkill = computeUpdatedAdaptiveSkill(easySkill, 'Easy', 25.0);
  }
  assert.equal(easySkill, AI_TUNING_CONFIG.SKILL_RANGES.Easy.max);
  assert.ok(easySkill <= AI_TUNING_CONFIG.SKILL_RANGES.Medium.min, 'Easy max skill must never exceed Medium min skill');

  const reducedSkill = computeUpdatedAdaptiveSkill(0.55, 'Medium', -7.0); // lost by 7s => error = -10 => -0.20 clamped to Medium min
  assert.equal(reducedSkill, clampSkillForDifficulty('Medium', 0.55 - 10 * 0.02));

  // 4. Three distinct personalities with distinct mistake multipliers
  assert.ok(AI_PERSONALITY_TRAITS.aggressive.mistakeMult > AI_PERSONALITY_TRAITS.consistent.mistakeMult);
  assert.ok(AI_PERSONALITY_TRAITS.consistent.lapVarianceMult < AI_PERSONALITY_TRAITS.cautious.lapVarianceMult);
});

test('AI opponents race each other, roll per-lap randomness, and stay clear of walls', () => {
  const { corridor, fakeTrack } = makeCorridorTestTrack('rockport_loop');
  const samples = corridor.samples;
  const spec = CARS[12];
  const playerCfg = getDefaultCarConfig(spec.id);
  const preset = HANDLING_PRESETS.balanced;

  const brain0 = createAiBrainState(0, spec, playerCfg, 'Medium', 0, false, 0, preset.tuning, preset.defaultAssists, 'noon_clear', 'rockport_loop');
  const brain1 = createAiBrainState(1, spec, playerCfg, 'Medium', 0, false, 0, preset.tuning, preset.defaultAssists, 'noon_clear', 'rockport_loop');
  const brain2 = createAiBrainState(2, spec, playerCfg, 'Medium', 0, false, 0, preset.tuning, preset.defaultAssists, 'noon_clear', 'rockport_loop');

  assert.equal(brain0.personality, 'aggressive');
  assert.equal(brain1.personality, 'cautious');
  assert.equal(brain2.personality, 'consistent');

  const sStart = samples[400];
  const aiBack: AiRacerView = {
    id: 'ai_0',
    name: 'AI Back',
    isPlayer: false,
    spec,
    pos: sStart.point.clone(),
    heading: Math.atan2(-sStart.tangent.x, -sStart.tangent.z),
    forwardSpeed: 46,
    lateralSpeed: 0,
    steerAngle: 0,
    pitch: 0,
    roll: 0,
    airHeight: 0,
    trackIdx: 400,
    totalProgress: 0.50,
    laneTarget: 0,
    aiSkill: brain0.skill,
    activeShortcutId: null,
    copSlowdownTimer: 0,
    finished: false,
    knockedOut: false,
    busted: false,
  };
  const sAhead = samples[402];
  const aiFront: AiRacerView = {
    ...aiBack,
    id: 'ai_1',
    name: 'AI Front',
    pos: sAhead.point.clone(),
    trackIdx: 402,
    totalProgress: 0.50 + 12 / fakeTrack.totalLength, // 12m ahead of aiBack
    forwardSpeed: 40,
  };
  const playerFarBehind: AiRacerView = {
    ...aiBack,
    id: 'player',
    isPlayer: true,
    totalProgress: 0.1,
  };

  stepAiRacerPhysics(
    aiBack,
    brain0,
    fakeTrack,
    playerFarBehind,
    [playerFarBehind, aiBack, aiFront],
    [],
    [],
    'Medium',
    DEFAULT_AI_SETTINGS,
    preset.tuning,
    preset.defaultAssists,
    'noon_clear',
    FIXED_PHYSICS_DT,
    FIXED_PHYSICS_DT,
    0,
    [],
    playerCfg,
    { totalLaps: 2, aiLap: 1, raceElapsedSec: 30 },
  );
  assert.ok(
    brain0.actionTag === 'PASS' || brain0.actionTag === 'DRAFT',
    `AI must actively draft/pass other AI rivals even when player is far away, got ${brain0.actionTag}`,
  );
  const lap1Rand = brain0.lapRandomMult;
  stepAiRacerPhysics(
    aiBack,
    brain0,
    fakeTrack,
    playerFarBehind,
    [playerFarBehind, aiBack, aiFront],
    [],
    [],
    'Medium',
    DEFAULT_AI_SETTINGS,
    preset.tuning,
    preset.defaultAssists,
    'noon_clear',
    FIXED_PHYSICS_DT,
    FIXED_PHYSICS_DT,
    0,
    [],
    playerCfg,
    { totalLaps: 2, aiLap: 2, raceElapsedSec: 95 },
  );
  assert.equal(brain0.currentLap, 2);
  assert.notEqual(brain0.lapRandomMult, lap1Rand, 'Per-lap randomness should re-roll on new lap');
});

