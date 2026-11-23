import assert from 'node:assert/strict';
import test from 'node:test';
import { DIFFICULTY_AI_PROFILES } from '../config/aiConfig';
import { FIXED_PHYSICS_DT, HANDLING_PRESETS } from '../config/physicsConfig';
import {
  BLACKLIST_RIVALS,
  CARS,
  computeEffectiveStats,
  getDefaultCarConfig,
  getDefaultCareerProfile,
  getMissionsForTier,
  isTierBossUnlocked,
} from '../data/gameData';
import { buildFairAiConfig, computeAiCornerSafeSpeedMs } from './aiDriver';
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

test('Banked road angle creates inward lateral support & Stage 4 upgrades beat Stage 1', () => {
  const dynBank = createVehicleDynamicsState();
  const outBank = makeOutput();
  const inBank = makeBaseStepInput({ forwardSpeed: 45, throttleInput: true, bankAngle: 0.16 });
  stepVehiclePhysics(dynBank, inBank, outBank);
  assert.ok(outBank.lateralSpeed < 0, 'positive bankAngle (+right higher) should pull car toward -right');

  const cobalt = CARS[0];
  const stage1 = getDefaultCarConfig(cobalt.id);
  const stage4 = { ...stage1, engineLevel: 4, turboLevel: 4, nitrousLevel: 4, tiresLevel: 4 };
  const s1Stats = computeEffectiveStats(cobalt, stage1);
  const s4Stats = computeEffectiveStats(cobalt, stage4);

  assert.ok(s4Stats.topSpeedKmh >= s1Stats.topSpeedKmh + 60, 'Stage 4 car should gain substantial top speed');
  assert.ok(s4Stats.accel > s1Stats.accel, 'Stage 4 car should gain strong acceleration');
});

test('buildFairAiConfig stays grounded by tier instead of matching a Stage-4 player car', () => {
  const cobalt = CARS[0];
  const stage4Player = {
    ...getDefaultCarConfig(cobalt.id),
    engineLevel: 4,
    turboLevel: 4,
    nitrousLevel: 4,
    tiresLevel: 4,
  };
  const stage1Player = getDefaultCarConfig(cobalt.id);

  const aiVsStage4 = buildFairAiConfig(cobalt, stage4Player, 'Medium', 1, false, 0);
  const aiVsStage1 = buildFairAiConfig(cobalt, stage1Player, 'Medium', 1, false, 0);

  assert.equal(aiVsStage4.engineLevel, aiVsStage1.engineLevel, 'AI tier engine must not scale up to chase player upgrades');
  assert.ok(aiVsStage4.engineLevel <= 2, 'Tier 1 AI on Medium should remain Stage 2 or lower');
  assert.ok(DIFFICULTY_AI_PROFILES.Easy.catchupMax <= 1.05, 'Easy rubber banding must remain fair');
  assert.ok(DIFFICULTY_AI_PROFILES.Expert.catchupMax <= 1.15, 'Expert rubber banding must remain capped');
});

test('Tricky endurance missions exist with maxDamagePercent and gate Blacklist boss unlock accurately', () => {
  const tier8 = getMissionsForTier(8);
  const tier1 = getMissionsForTier(1);
  assert.equal(tier8.length, 6);
  assert.equal(tier1.length, 6);

  const cleanStorm = tier8.find((m) => m.id === 'm_8_6');
  const finalGauntlet = tier1.find((m) => m.id === 'm_1_6');
  assert.equal(cleanStorm?.maxDamagePercent, 30);
  assert.equal(finalGauntlet?.maxDamagePercent, 20);

  const rival10 = BLACKLIST_RIVALS.find((r) => r.rank === 10)!;
  const profile = getDefaultCareerProfile();
  const initialGate = isTierBossUnlocked(rival10, profile);
  assert.equal(initialGate.unlocked, false);
  assert.equal(initialGate.missionsTotal, 5);

  const clearedProfile = {
    ...profile,
    totalBounty: rival10.requiredBounty,
    copsTakedowns: rival10.requiredTakedowns,
    completedMissionIds: getMissionsForTier(10).map((m) => m.id),
  };
  const clearedGate = isTierBossUnlocked(rival10, clearedProfile);
  assert.equal(clearedGate.unlocked, true);
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

