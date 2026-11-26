import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { EA_TRAX_PLAYLIST } from '../audio/musicEngine';
import {
  clampAudioValue,
  MAX_CONCURRENT_SFX_VOICES,
  SFX_COOLDOWN_MS,
  shouldTriggerCooldown,
  stepMusicLookaheadWindow,
} from '../audio/audioSafety';
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
import {
  AIR_GRAVITY_MPS2,
  FIXED_PHYSICS_DT,
  HANDLING_PRESETS,
  MAX_FRAME_DELTA_SEC,
  MAX_PHYSICS_SUBSTEPS,
} from '../config/physicsConfig';
import { getDefaultDriverSettings, GRAPHICS_QUALITY_PRESETS } from '../config/settingsConfig';
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
import { buildCarMesh, resolveCarUpgradeVisualStage } from './carBuilder';
import { computeOutroDirective } from './outroDirector';
import {
  createVehicleDynamicsState,
  stepVehiclePhysics,
  VehicleStepInput,
  VehicleStepOutput,
} from './vehiclePhysics';
import {
  computeAirGravityScale,
  computeEscalatedHeatLevel,
  computeLandingJounceVel,
  computeRampDeckHeight,
  computeRampLaunchVerticalVel,
  computeRedlineShiftZone,
  createMenuDynoState,
  createSlipstreamSlingshotState,
  createStyleComboState,
  ENGINE_SOUND_PROFILES,
  evaluateCountdownLaunch,
  evaluatePatrolPursuitTrigger,
  generateTrafficSpawnSlots,
  isNightdriveOrHypePhonkTrack,
  isSampleInsideBarrierCutout,
  POLICE_PATROL_DETECT_RADIUS_M,
  POLICE_PATROL_SPEED_TRIGGER_KMH,
  resolveCarEngineProfile,
  stepMenuDynoRun,
  stepSlipstreamSlingshot,
  stepStyleComboState,
} from './gameplayUpgrades';

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

test('Stage 5 max upgrade visuals add quad exhaust/NOS hardware, exposed velocity stacks, twin NOS bottles, and GT wing', () => {
  const s1 = resolveCarUpgradeVisualStage({
    engineLevel: 1,
    turboLevel: 1,
    nitrousLevel: 1,
    tiresLevel: 1,
  });
  assert.equal(s1.isMaxed, false);
  assert.equal(s1.hasHighPower, false);
  assert.equal(s1.hasTwinNos, false);
  assert.equal(s1.hasProAero, false);

  const s5 = resolveCarUpgradeVisualStage({
    engineLevel: MAX_UPGRADE_LEVEL,
    turboLevel: MAX_UPGRADE_LEVEL,
    nitrousLevel: MAX_UPGRADE_LEVEL,
    tiresLevel: MAX_UPGRADE_LEVEL,
  });
  assert.equal(s5.isMaxed, true);
  assert.equal(s5.hasHighPower, true);
  assert.equal(s5.hasTwinNos, true);
  assert.equal(s5.hasProAero, true);
  assert.equal(s5.hasFullApexPack, true);

  // Stub minimal 2D canvas context so Three.js CanvasTexture helpers inside buildCarMesh run in Node
  const prevDoc = (globalThis as { document?: unknown }).document;
  const fakeCtx = {
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    fillRect: () => {},
    clearRect: () => {},
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
  };
  (globalThis as { document?: unknown }).document = {
    createElement: () => ({
      width: 128,
      height: 128,
      getContext: () => fakeCtx,
    }),
  };

  try {
    const spec = CARS.find((c) => c.bodyStyle === 'coupe') ?? CARS[0];
    const dummyShadow = new THREE.Texture();

    const stockCar = buildCarMesh({
      spec,
      paintHex: '#E11D48',
      livery: 'clean',
      rimStyle: 'chrome',
      shadowTexture: dummyShadow,
      maxAnisotropy: 1,
      isSoftwareGl: true,
      upgradeLevels: { engineLevel: 1, turboLevel: 1, nitrousLevel: 1, tiresLevel: 1 },
    });

    const maxCar = buildCarMesh({
      spec,
      paintHex: '#E11D48',
      livery: 'clean',
      rimStyle: 'chrome',
      shadowTexture: dummyShadow,
      maxAnisotropy: 1,
      isSoftwareGl: true,
      upgradeLevels: {
        engineLevel: MAX_UPGRADE_LEVEL,
        turboLevel: MAX_UPGRADE_LEVEL,
        nitrousLevel: MAX_UPGRADE_LEVEL,
        tiresLevel: MAX_UPGRADE_LEVEL,
      },
    });

    assert.equal(stockCar.isMaxStage, false);
    assert.equal(maxCar.isMaxStage, true);
    assert.equal(stockCar.nosFlames.length, 2, 'Stock coupe should have twin exhaust flames');
    assert.equal(maxCar.nosFlames.length, 4, 'Maxed Stage-5 coupe should have quad titanium exhaust flames');
    assert.ok(
      maxCar.root.children.length > stockCar.root.children.length,
      'Maxed car root should include Stage-5 Apex chassis underglow plane',
    );
    assert.ok(
      (maxCar.hoodGroup?.children.length ?? 0) > (stockCar.hoodGroup?.children.length ?? 0),
      'Maxed car hood should include exposed twin-turbo velocity stacks & plenum',
    );
    assert.ok(
      (maxCar.spoilerGroup?.children.length ?? 0) > (stockCar.spoilerGroup?.children.length ?? 0),
      'Maxed car spoiler should upgrade to dual-plane carbon GT wing with gold trim & Gurney lip',
    );
    assert.ok(
      maxCar.bodyGroup.children.length > stockCar.bodyGroup.children.length,
      'Maxed car bodyGroup should mount twin NOS cylinders, purge nozzles, and titanium exhaust collars',
    );

    stockCar.dispose();
    maxCar.dispose();
    dummyShadow.dispose();
  } finally {
    if (prevDoc === undefined) {
      delete (globalThis as { document?: unknown }).document;
    } else {
      (globalThis as { document?: unknown }).document = prevDoc;
    }
  }
});

test('Multi-beat outro director produces smooth non-NaN camera & showcase progressions for win, busted, and loss', () => {
  const win1 = computeOutroDirective('win', 0.25);
  const win2 = computeOutroDirective('win', 1.8);
  const win3 = computeOutroDirective('win', 3.4);
  assert.equal(win1.beat, 1);
  assert.equal(win2.beat, 2);
  assert.equal(win3.beat, 3);
  assert.equal(win1.nosBurst, true);
  assert.ok(win2.fireworkIntensity > win1.fireworkIntensity, 'Beat 2 should ramp up celebratory fireworks');
  assert.ok(win3.orbitAngleOffset > win2.orbitAngleOffset && win2.orbitAngleOffset > win1.orbitAngleOffset);

  const busted1 = computeOutroDirective('busted', 0.3);
  const busted2 = computeOutroDirective('busted', 2.0);
  assert.equal(busted1.beat, 1);
  assert.equal(busted2.beat, 2);
  assert.equal(busted1.nosBurst, false);
  assert.ok(busted1.camHeight > busted2.camHeight, 'Busted Beat 1 drops down from chopper altitude into Beat 2');
  assert.ok(Math.abs(busted2.camRoll) > 0.01, 'Busted maintains tense Dutch angle');

  const loss1 = computeOutroDirective('loss', 0.4);
  const loss2 = computeOutroDirective('loss', 2.2);
  assert.equal(loss1.beat, 1);
  assert.equal(loss2.beat, 2);
  assert.equal(loss1.nosBurst, false);
  for (const frame of [win1, win2, win3, busted1, busted2, loss1, loss2]) {
    assert.ok(Number.isFinite(frame.camDist) && frame.camDist > 2);
    assert.ok(Number.isFinite(frame.camHeight) && frame.camHeight > 0.5);
    assert.ok(Number.isFinite(frame.camFov) && frame.camFov >= 40 && frame.camFov <= 80);
    assert.ok(frame.slowScale > 0 && frame.slowScale <= 1);
  }
});

test('Audio safety clamps non-finite values, throttles substep SFX bursts, and caps music catch-up scheduling', () => {
  assert.equal(clampAudioValue(NaN, 0.5, 0, 1), 0.5);
  assert.equal(clampAudioValue(Infinity, 0.5, 0, 1), 0.5);
  assert.equal(clampAudioValue(-Infinity, 0.5, 0, 1), 0.5);
  assert.equal(clampAudioValue(-3, 0.5, 0, 1), 0);
  assert.equal(clampAudioValue(4.2, 0.5, 0, 1), 1);
  assert.equal(clampAudioValue(0.37, 0.5, 0, 1), 0.37);

  assert.equal(shouldTriggerCooldown(1000, 1008, SFX_COOLDOWN_MS.impact), false);
  assert.equal(shouldTriggerCooldown(1000, 1000 + SFX_COOLDOWN_MS.impact, SFX_COOLDOWN_MS.impact), true);
  assert.ok(MAX_CONCURRENT_SFX_VOICES <= 16);

  const stalled = stepMusicLookaheadWindow(10.0, 12.5, 0.25, 3);
  assert.equal(stalled.maxSteps, 3, 'Lag recovery must cap scheduled synth steps per tick');
  assert.ok(stalled.startTime >= 12.5, 'Stalled lookahead clock must fast-forward rather than re-bursting stale beats');

  assert.ok(MAX_PHYSICS_SUBSTEPS <= 4, 'Physics substeps per frame must be bounded to avoid spiral of death');
  assert.ok(MAX_FRAME_DELTA_SEC <= 0.04, 'Frame delta cap must remain tight for responsive pacing');
  assert.equal(getDefaultDriverSettings().graphicsQuality, 'medium');
  assert.equal(GRAPHICS_QUALITY_PRESETS.medium.bloomEnabled, false);
  assert.ok(GRAPHICS_QUALITY_PRESETS.medium.pixelRatioCap <= 1.25);
});

test('Soundtrack and track music labels strictly match Nightdrive & Hype Phonk energy', () => {
  assert.ok(EA_TRAX_PLAYLIST.length >= 10, 'Expected full Phonk/Nightdrive soundtrack');
  for (const song of EA_TRAX_PLAYLIST) {
    assert.ok(
      isNightdriveOrHypePhonkTrack(song),
      `Track "${song.title}" (${song.genre}, ${song.bpm} BPM) does not match Nightdrive / Hype Phonk profile`,
    );
  }
  const titles = new Set(EA_TRAX_PLAYLIST.map((s) => s.title));
  for (const trk of TRACKS) {
    assert.ok(
      titles.has(trk.musicTrackName),
      `Track ${trk.id} musicTrackName "${trk.musicTrackName}" must exist in Nightdrive/Phonk EA_TRAX_PLAYLIST`,
    );
  }
});

test('Big-air ramp profile, vertical launch impulse, aero lift, and landing jounce keep jump height bounded inside track', () => {
  const h0 = computeRampDeckHeight(0, 14.5, 1.85);
  const hMid = computeRampDeckHeight(7.25, 14.5, 1.85);
  const hLip = computeRampDeckHeight(14.5, 14.5, 1.85);
  assert.equal(h0, 0);
  assert.ok(hMid > 0 && hMid < 0.925, `Concave ramp midpoint (${hMid.toFixed(2)}m) should sit below linear 0.925m slope`);
  assert.ok(Math.abs(hLip - 1.85) < 0.001, 'Ramp lip must reach full 1.85m height');

  const slowLaunch = computeRampLaunchVerticalVel({ forwardSpeedMs: 25, launchAngleRad: 0.127, nosActive: false });
  const fastNosLaunch = computeRampLaunchVerticalVel({ forwardSpeedMs: 85, launchAngleRad: 0.127, nosActive: true });
  assert.ok(slowLaunch >= 5.4 && slowLaunch <= 7.0, `Expected controlled low-speed launch impulse, got ${slowLaunch}`);
  assert.ok(fastNosLaunch > slowLaunch && fastNosLaunch <= 11.6, `Top-speed launch must stay capped <= 11.6 m/s (got ${fastNosLaunch})`);

  const scaleLow = computeAirGravityScale(20, false);
  const scaleHighNos = computeAirGravityScale(85, true);
  assert.ok(scaleHighNos < scaleLow && scaleHighNos >= 0.82 && scaleLow <= 0.96);

  // Verify peak height above 1.85m ramp lip never exceeds ~3.5m total height (stays cleanly inside map!)
  const effG = AIR_GRAVITY_MPS2 * scaleHighNos;
  const maxPeakHeight = 1.85 + (fastNosLaunch * fastNosLaunch) / (2 * effG);
  assert.ok(maxPeakHeight <= 4.0, `Expected controlled peak jump height <= 4.0m, got ${maxPeakHeight.toFixed(2)}m`);

  const jounce = computeLandingJounceVel(-10);
  assert.ok(jounce > 6 && jounce <= 9.5);
});

test('Easy police patrol triggers and accelerated Heat 1-5 escalation work accurately', () => {
  assert.equal(
    evaluatePatrolPursuitTrigger({
      speedKmh: 98,
      distSq: 80 * 80,
      detectRadiusM: POLICE_PATROL_DETECT_RADIUS_M,
      speedTriggerKmh: POLICE_PATROL_SPEED_TRIGGER_KMH,
      bumped: false,
    }),
    true,
    '98 km/h within 80m must trigger patrol pursuit immediately',
  );
  assert.equal(
    evaluatePatrolPursuitTrigger({
      speedKmh: 60,
      distSq: 150 * 150,
      detectRadiusM: POLICE_PATROL_DETECT_RADIUS_M,
      speedTriggerKmh: POLICE_PATROL_SPEED_TRIGGER_KMH,
      bumped: false,
      recklessTrigger: true,
    }),
    true,
    'Reckless infraction within extended patrol awareness radius must trigger pursuit',
  );
  assert.equal(
    evaluatePatrolPursuitTrigger({
      speedKmh: 65,
      distSq: 50 * 50,
      detectRadiusM: POLICE_PATROL_DETECT_RADIUS_M,
      speedTriggerKmh: POLICE_PATROL_SPEED_TRIGGER_KMH,
      bumped: false,
    }),
    false,
  );

  assert.equal(computeEscalatedHeatLevel(1200, 5), 1);
  assert.equal(computeEscalatedHeatLevel(3000, 5), 2);
  assert.equal(computeEscalatedHeatLevel(8000, 5), 3);
  assert.equal(computeEscalatedHeatLevel(17000, 5), 4);
  assert.equal(computeEscalatedHeatLevel(32000, 5), 5);
  assert.equal(computeEscalatedHeatLevel(32000, 3), 3);
});

test('Dense civilian traffic generator populates multi-lane fleet while keeping starting grid clear', () => {
  const slots = generateTrafficSpawnSlots(46, 720, 11.5);
  assert.equal(slots.length, 46);
  const distinctLanes = new Set(slots.map((s) => s.laneOffset));
  const distinctPaints = new Set(slots.map((s) => s.paintHex));
  assert.ok(distinctLanes.size >= 4, `Expected >= 4 lanes populated, got ${distinctLanes.size}`);
  assert.ok(distinctPaints.size >= 6, `Expected >= 6 distinct civilian colors, got ${distinctPaints.size}`);
  for (const slot of slots) {
    assert.ok(slot.trackIdx >= 12 && slot.trackIdx < 704, `Traffic slot ${slot.trackIdx} encroached on starting grid`);
    assert.ok(slot.cruiseSpeedMs >= 14 && slot.cruiseSpeedMs <= 27);
  }
});

test('Countdown launch grading distinguishes perfect sweet spot, wheelspin over-rev, and idle start', () => {
  const perfect = evaluateCountdownLaunch(0.78, true, 3);
  assert.equal(perfect.grade, 'perfect');
  assert.equal(perfect.nosBonus, 15);
  assert.equal(perfect.bountyBonus, 450);
  assert.equal(perfect.wheelspinParticles, false);
  assert.ok(perfect.speedBoostMs > 20);

  const wheelspin = evaluateCountdownLaunch(0.95, true, 3);
  assert.equal(wheelspin.grade, 'wheelspin');
  assert.equal(wheelspin.wheelspinParticles, true);
  assert.ok(wheelspin.speedBoostMs < perfect.speedBoostMs);

  const standard = evaluateCountdownLaunch(0.52, true, 3);
  assert.equal(standard.grade, 'standard');
  assert.equal(standard.nosBonus, 0);

  const noGas = evaluateCountdownLaunch(0.78, false, 3);
  assert.equal(noGas.speedBoostMs, 0);
});

test('Slipstream slingshot charges while drafting at speed and triggers overtake surge at 100%', () => {
  const state = createSlipstreamSlingshotState();
  let triggeredCount = 0;
  let lastTriggerNos = 0;

  // Should not charge when too slow
  const slowStep = stepSlipstreamSlingshot(state, true, 18, 0.5);
  assert.equal(slowStep.triggered, false);
  assert.equal(state.charge, 0);

  // Charge while drafting at 38 m/s across 1.2s (> 1/0.88s)
  for (let i = 0; i < 24; i++) {
    const res = stepSlipstreamSlingshot(state, true, 38, 0.05);
    if (res.triggered) {
      triggeredCount += 1;
      lastTriggerNos = res.nosBonus;
    }
  }
  assert.equal(triggeredCount, 1);
  assert.equal(lastTriggerNos, 12);
  assert.ok(state.boostTimer > 0 && state.cooldownTimer > 0);
});

test('Style combo chains multipliers up to x5 and expires after timer decay', () => {
  const combo = createStyleComboState();
  const s1 = stepStyleComboState(combo, 'near_miss', 0);
  assert.equal(combo.multiplier, 1);
  assert.equal(s1.bountyAwarded, 350);

  const s2 = stepStyleComboState(combo, 'drift_exit', 0);
  assert.equal(combo.multiplier, 2);
  assert.equal(s2.milestoneMult, 2);
  assert.equal(s2.bountyAwarded, 600);

  stepStyleComboState(combo, 'mega_air', 0);
  assert.equal(combo.multiplier, 3);

  stepStyleComboState(combo, 'takedown', 0);
  stepStyleComboState(combo, 'shortcut', 0);
  stepStyleComboState(combo, 'roadblock', 0);
  assert.equal(combo.multiplier, 5);

  const midTick = stepStyleComboState(combo, null, 2.0);
  assert.equal(midTick.expired, false);
  assert.equal(combo.multiplier, 5);

  const expireTick = stepStyleComboState(combo, null, 4.0);
  assert.equal(expireTick.expired, true);
  assert.equal(combo.multiplier, 1);
  assert.equal(combo.points, 0);
});

test('Redline shift strip lights sequentially and cues SHIFT! at high RPM below 6th gear', () => {
  const low = computeRedlineShiftZone(0.5, 2);
  assert.equal(low.ledCount, 0);
  assert.equal(low.shiftNow, false);

  const peak3 = computeRedlineShiftZone(0.92, 3);
  assert.equal(peak3.ledCount, 6);
  assert.equal(peak3.inRedline, true);
  assert.equal(peak3.shiftNow, true);

  const topGear = computeRedlineShiftZone(0.94, 6);
  assert.equal(topGear.ledCount, 6);
  assert.equal(topGear.shiftNow, false, 'Top 6th gear should not ask player to shift higher');
});

test('All 28 cars resolve to 8 distinct engine sound profiles and obey explicit user sound swaps', () => {
  assert.equal(ENGINE_SOUND_PROFILES.length, 8);
  const validIds = new Set(ENGINE_SOUND_PROFILES.map((p) => p.id));

  for (const car of CARS) {
    const resolved = resolveCarEngineProfile(car.id, car.bodyStyle, 'auto');
    assert.ok(validIds.has(resolved), `Invalid auto profile for car ${car.id}: ${resolved}`);
  }

  assert.equal(resolveCarEngineProfile('rx7_fd3s', 'coupe', 'auto'), 'rotary_brap');
  assert.equal(resolveCarEngineProfile('m3_gtr', 'gtr', 'auto'), 'v8_muscle');
  assert.equal(resolveCarEngineProfile('carrera_gtx', 'exotic', 'auto'), 'v12_hyper');
  assert.equal(resolveCarEngineProfile('cobalt_gt', 'coupe', 'electric_whine'), 'electric_whine');
  assert.equal(resolveCarEngineProfile('cobalt_gt', 'coupe', 'v10_screamer'), 'v10_screamer');
});

test('Safe House menu dyno bench climbs gears 1-6, records 0-100/0-200 sprints, hits NOS +12% peak, and coasts down', () => {
  const dyno = createMenuDynoState(260, 82, 75);
  assert.equal(dyno.speedKmh, 0);
  assert.equal(dyno.gear, 1);

  let upshifts = 0;
  for (let i = 0; i < 360; i++) {
    const res = stepMenuDynoRun(dyno, 1 / 60, false, true, false);
    if (res.upshifted) upshifts += 1;
  }

  assert.ok(upshifts >= 4, `Expected at least 4 gear upshifts, got ${upshifts}`);
  assert.equal(dyno.gear, 6);
  assert.ok(dyno.speedKmh >= 245, `Expected near top target speed, got ${dyno.speedKmh}`);
  assert.ok(dyno.zeroTo100Sec !== null && dyno.zeroTo100Sec > 0 && dyno.zeroTo100Sec < 5);
  assert.ok(dyno.zeroTo200Sec !== null && dyno.zeroTo200Sec > dyno.zeroTo100Sec!);

  // Engaging NOS pushes past NA top target up toward +12% (~291 km/h)
  for (let i = 0; i < 180; i++) {
    stepMenuDynoRun(dyno, 1 / 60, false, true, true);
  }
  assert.ok(dyno.peakSpeedKmh > 275, `Expected NOS peak > 275 km/h, got ${dyno.peakSpeedKmh}`);

  // Releasing throttle should smoothly coast down
  const beforeCoast = dyno.speedKmh;
  for (let i = 0; i < 60; i++) {
    stepMenuDynoRun(dyno, 1 / 60, false, false, false);
  }
  assert.ok(dyno.speedKmh < beforeCoast);
});

test('Barrier cutout containment handles circular wraparound and all 10 tracks keep shortcut mouths open', () => {
  assert.equal(isSampleInsideBarrierCutout(5, 715, 8, 720), true);
  assert.equal(isSampleInsideBarrierCutout(717, 715, 8, 720), true);
  assert.equal(isSampleInsideBarrierCutout(15, 715, 8, 720), false);
  assert.equal(isSampleInsideBarrierCutout(42, 35, 50, 720), true);
  assert.equal(isSampleInsideBarrierCutout(51, 35, 50, 720), false);

  for (const track of TRACKS) {
    const corridor = computeTrackSampledCorridors(track.id);
    const total = corridor.samples.length;
    if (track.id === 'hwy99_speedway') {
      assert.equal(corridor.shortcuts.length, 0);
      continue;
    }
    assert.ok(corridor.shortcuts.length >= 1, `Track ${track.id} missing shortcuts`);
    for (const sc of corridor.shortcuts) {
      const entrySpan = (sc.entryCutEndIdx - sc.entryCutStartIdx + total) % total;
      const exitSpan = (sc.exitCutEndIdx - sc.exitCutStartIdx + total) % total;
      assert.ok(entrySpan >= 9, `Track ${track.id} shortcut ${sc.def.label} entry cutout too narrow: ${entrySpan}`);
      assert.ok(exitSpan >= 9, `Track ${track.id} shortcut ${sc.def.label} exit cutout too narrow: ${exitSpan}`);
      assert.ok(
        isSampleInsideBarrierCutout(sc.entryCutStartIdx, sc.entryCutStartIdx, sc.entryCutEndIdx, total),
      );
      assert.ok(
        isSampleInsideBarrierCutout(sc.exitCutEndIdx, sc.exitCutStartIdx, sc.exitCutEndIdx, total),
      );
    }
  }
});
