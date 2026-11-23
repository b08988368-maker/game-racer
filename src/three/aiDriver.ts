import * as THREE from 'three';
import {
  AI_PERSONALITY_TRAITS,
  AiPersonality,
  AiSettings,
  DIFFICULTY_AI_PROFILES,
} from '../config/aiConfig';
import { AssistSettings, PhysicsTuningParams } from '../config/physicsConfig';
import { computeEffectiveStats } from '../data/gameData';
import { CarSpec, EnvironmentId, GarageCarConfig, TrackDifficulty, TrackId } from '../types/game';
import { BuiltTrack } from './trackBuilder';
import {
  createVehicleDynamicsState,
  stepVehiclePhysics,
  VehicleDynamicsState,
  VehicleStepInput,
  VehicleStepOutput,
} from './vehiclePhysics';

export interface AiRacerView {
  id: string;
  name: string;
  isPlayer: boolean;
  spec: CarSpec;
  pos: THREE.Vector3;
  heading: number;
  forwardSpeed: number;
  lateralSpeed: number;
  steerAngle: number;
  pitch: number;
  roll: number;
  airHeight: number;
  trackIdx: number;
  totalProgress: number;
  laneTarget: number;
  aiSkill: number;
  activeShortcutId: number | null;
  copSlowdownTimer: number;
  finished: boolean;
  knockedOut: boolean;
}

export interface AiDebugPoint {
  x: number;
  y: number;
  z: number;
}

export interface AiBrainState {
  personality: AiPersonality;
  simConfig: GarageCarConfig;
  dyn: VehicleDynamicsState;
  stepIn: VehicleStepInput;
  stepOut: VehicleStepOutput;
  nitrous: number;
  nosBurstTimer: number;
  actionTag: string;
  targetSpeedMs: number;
  smoothedLane: number;
  adaptiveMult: number;
  mistakeTimer: number;
  mistakeSteerBias: number;
  mistakeCooldown: number;
  heaveOffset: number;
  wheelspinIntensity: number;
  braking: boolean;
  nosActive: boolean;
  isDrifting: boolean;
  debugPoints: [
    AiDebugPoint,
    AiDebugPoint,
    AiDebugPoint,
    AiDebugPoint,
    AiDebugPoint,
    AiDebugPoint,
  ];
}

export function buildFairAiConfig(
  spec: CarSpec,
  playerConfig: GarageCarConfig,
  difficulty: TrackDifficulty,
  aiTierBoost: number,
  isBoss: boolean,
  slotOffset: number,
): GarageCarConfig {
  const playerAvg =
    (playerConfig.engineLevel +
      playerConfig.turboLevel +
      playerConfig.nitrousLevel +
      playerConfig.tiresLevel) *
    0.25;
  const profile = DIFFICULTY_AI_PROFILES[difficulty];
  // Match player's upgrade parity closely + mission/difficulty offset so stock vs upgraded races stay competitive
  const baseLvl = Math.max(
    playerAvg + profile.upgradeOffset,
    1 + Math.min(3, aiTierBoost * 0.72 + (isBoss ? 0.6 : 0)),
  );
  const clamped = Math.max(1, Math.min(4, Math.round(baseLvl + slotOffset * 0.25)));
  const tireBoost = Math.max(1, Math.min(4, Math.round(baseLvl + (difficulty === 'Expert' ? 1 : 0))));
  return {
    ownerId: 'ai',
    carId: spec.id,
    engineLevel: clamped,
    turboLevel: clamped,
    nitrousLevel: clamped,
    tiresLevel: tireBoost,
    paintHex: spec.defaultPaint,
    livery: spec.defaultLivery,
    rimStyle: 'chrome',
  };
}

export function createAiBrainState(
  index: number,
  spec: CarSpec,
  playerConfig: GarageCarConfig,
  difficulty: TrackDifficulty,
  aiTierBoost: number,
  isBoss: boolean,
  initialLane: number,
  tuning: PhysicsTuningParams,
  assists: AssistSettings,
  environment: Exclude<EnvironmentId, 'auto'>,
  trackId: TrackId,
): AiBrainState {
  const personalities: AiPersonality[] = ['aggressive', 'clean', 'defensive'];
  const personality: AiPersonality = isBoss ? 'aggressive' : personalities[index % personalities.length];
  const simConfig = buildFairAiConfig(spec, playerConfig, difficulty, aiTierBoost, isBoss, index === 0 ? 1 : 0);

  return {
    personality,
    simConfig,
    dyn: createVehicleDynamicsState(),
    stepIn: {
      dt: 1 / 120,
      rawDt: 1 / 120,
      forwardSpeed: 0,
      lateralSpeed: 0,
      steerAngle: 0,
      rawSteerInput: 0,
      throttleInput: true,
      brakeInput: false,
      handbrakeInput: false,
      throttleAxis: 1,
      brakeAxis: 1,
      nosActive: false,
      driftBoostActive: false,
      drafting: false,
      airborne: false,
      spikedTimer: 0,
      isSpeedbreaker: false,
      baseMaxMs: 65,
      maxForwardMs: 75,
      accelStat: 65,
      handlingStat: 65,
      bodyStyle: spec.bodyStyle,
      upcomingTurnSeverity: 0,
      lateralOffset: initialLane,
      roadHalfWidth: 14,
      inShortcut: false,
      shortcutLateral: 0,
      shortcutHalfWidth: 7,
      environment,
      trackId,
      tuning,
      assists,
    },
    stepOut: {
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
    },
    nitrous: 100,
    nosBurstTimer: 0,
    actionTag: 'GRID',
    targetSpeedMs: 0,
    smoothedLane: initialLane,
    adaptiveMult: 1.0,
    mistakeTimer: 0,
    mistakeSteerBias: 0,
    mistakeCooldown: 5 + index * 2.5,
    heaveOffset: 0,
    wheelspinIntensity: 0,
    braking: false,
    nosActive: false,
    isDrifting: false,
    debugPoints: [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
    ],
  };
}

export function resetAiBrainState(brain: AiBrainState, initialLane: number): void {
  brain.dyn = createVehicleDynamicsState();
  brain.nitrous = 100;
  brain.nosBurstTimer = 0;
  brain.actionTag = 'GRID';
  brain.targetSpeedMs = 0;
  brain.smoothedLane = initialLane;
  brain.adaptiveMult = 1.0;
  brain.mistakeTimer = 0;
  brain.mistakeSteerBias = 0;
  brain.mistakeCooldown = 5;
  brain.heaveOffset = 0;
  brain.wheelspinIntensity = 0;
  brain.braking = false;
  brain.nosActive = false;
  brain.isDrifting = false;
}

export interface AiCopObstacle {
  pos: THREE.Vector3;
  wrecked: boolean;
  isRoadblock: boolean;
}

export interface AiTrafficObstacle {
  pos: THREE.Vector3;
  laneOffset: number;
  isTruck: boolean;
}

export function stepAiRacerPhysics(
  ai: AiRacerView,
  brain: AiBrainState,
  track: BuiltTrack,
  player: AiRacerView,
  allRacers: AiRacerView[],
  traffic: AiTrafficObstacle[],
  cops: AiCopObstacle[],
  difficulty: TrackDifficulty,
  aiSettings: AiSettings,
  tuning: PhysicsTuningParams,
  assists: AssistSettings,
  environment: Exclude<EnvironmentId, 'auto'>,
  dt: number,
  rawFixedDt: number,
  roadWetness = 0,
): void {
  const samples = track.samples;
  const nSamples = samples.length;
  const profile = DIFFICULTY_AI_PROFILES[difficulty];
  const traits = AI_PERSONALITY_TRAITS[brain.personality];
  const stats = computeEffectiveStats(ai.spec, brain.simConfig);

  const info = track.getClosestTrackInfo(ai.pos.x, ai.pos.z, ai.trackIdx);
  const scHit =
    ai.activeShortcutId !== null ? track.queryShortcut(ai.pos.x, ai.pos.z, ai.activeShortcutId) : null;
  const inShortcut = Boolean(scHit && ai.activeShortcutId !== null && scHit.shortcut.id === ai.activeShortcutId);

  const aiFwdX = -Math.sin(ai.heading);
  const aiFwdZ = -Math.cos(ai.heading);
  const aiRightX = Math.cos(ai.heading);
  const aiRightZ = -Math.sin(ai.heading);

  const absSpeed = Math.abs(ai.forwardSpeed);
  const segLen = track.totalLength / nSamples;

  // 1. Multi-point lookahead curvature & outside-apex-outside racing line calculation
  let targetX = 0;
  let targetZ = 0;
  let curvatureSharp = 0;
  let curvatureMid = 0;
  let aimingShortcut = false;

  if (inShortcut && scHit) {
    const pts = scHit.shortcut.points;
    const lookIdx = Math.min(pts.length - 1, scHit.ptIndex + 6);
    targetX = pts[lookIdx].x;
    targetZ = pts[lookIdx].z;
    brain.actionTag = 'SHORTCUT';

    // Populate debug points along shortcut
    brain.debugPoints[0].x = ai.pos.x;
    brain.debugPoints[0].y = ai.pos.y + 0.55;
    brain.debugPoints[0].z = ai.pos.z;
    for (let k = 1; k <= 5; k++) {
      const idx = Math.min(pts.length - 1, scHit.ptIndex + k * 2);
      brain.debugPoints[k].x = pts[idx].x;
      brain.debugPoints[k].y = pts[idx].y + 0.55;
      brain.debugPoints[k].z = pts[idx].z;
    }
  } else {
    // Check shortcut entry opportunity
    if (track.shortcuts.length > 0 && traits.shortcutAffinity * ai.aiSkill > 0.42) {
      for (let i = 0; i < track.shortcuts.length; i++) {
        const sc = track.shortcuts[i];
        const ahead = (sc.entryCutStartIdx - ai.trackIdx + nSamples) % nSamples;
        if (ahead <= 22) {
          ai.laneTarget = sc.side * (track.roadHalfWidth + 1.15);
          aimingShortcut = true;
          brain.actionTag = 'SHORTCUT';
          break;
        }
      }
    }

    const sNow = samples[ai.trackIdx];
    const sNear = samples[(ai.trackIdx + 6) % nSamples];
    const sMid = samples[(ai.trackIdx + 14) % nSamples];
    const sFar = samples[(ai.trackIdx + 24) % nSamples];

    // Signed cross-product reveals turn direction (+ = right turn, - = left turn)
    const turnNear = sNow.tangent.x * sNear.tangent.z - sNow.tangent.z * sNear.tangent.x;
    const turnMid = sNear.tangent.x * sMid.tangent.z - sNear.tangent.z * sMid.tangent.x;
    const turnFar = sMid.tangent.x * sFar.tangent.z - sMid.tangent.z * sFar.tangent.x;

    curvatureSharp = Math.max(Math.abs(turnNear), Math.abs(turnMid) * 0.92);
    curvatureMid = Math.max(Math.abs(turnMid), Math.abs(turnFar));

    if (!aimingShortcut) {
      const usableHalf = Math.max(3.8, track.roadHalfWidth - 2.3);
      // Outside entry on straight before curve, clip inside apex on mid/near turn
      let idealLane = 0;
      if (Math.abs(turnNear) > 0.08) {
        // Clip inside apex! Left turn -> negative right vector if right is +side? Let's verify sign:
        // tangent x nextTangent = tx*nz - tz*nx. Wait: right = (-tz, tx) or (tz, -tx).
        // Compute directly using dot(sNear.tangent, sNow.right) so sign is guaranteed coordinate-consistent!
        const dirRight = sNear.tangent.x * sNow.right.x + sNear.tangent.z * sNow.right.z;
        idealLane = THREE.MathUtils.clamp(dirRight * usableHalf * 3.1, -usableHalf * 0.78, usableHalf * 0.78);
        brain.actionTag = 'APEX';
      } else if (Math.abs(turnFar) > 0.1) {
        // Set up on outside edge approaching a corner
        const dirRightFar = sFar.tangent.x * sMid.right.x + sFar.tangent.z * sMid.right.z;
        idealLane = THREE.MathUtils.clamp(-dirRightFar * usableHalf * 2.1, -usableHalf * 0.65, usableHalf * 0.65);
        brain.actionTag = 'SETUP';
      } else {
        idealLane = 0;
        brain.actionTag = 'CRUISE';
      }

      // 2. Slipstream hunting & Defensive Blocking vs Player / Rivals
      const gapToPlayerProg = player.totalProgress - ai.totalProgress;
      const distMetersToPlayer = gapToPlayerProg * track.totalLength;
      if (distMetersToPlayer > 6 && distMetersToPlayer < 42 && !player.finished && !player.knockedOut) {
        // Check player's lateral offset on track to tuck into slipstream or pass cleanly
        const pInfo = track.getClosestTrackInfo(player.pos.x, player.pos.z, player.trackIdx);
        if (distMetersToPlayer > 14 && Math.abs(turnNear) < 0.12) {
          idealLane = THREE.MathUtils.clamp(pInfo.lateralOffset, -usableHalf * 0.7, usableHalf * 0.7);
          brain.actionTag = 'DRAFT';
        } else if (distMetersToPlayer <= 14) {
          const passSide = pInfo.lateralOffset >= 0 ? -1 : 1;
          idealLane = THREE.MathUtils.clamp(
            pInfo.lateralOffset + passSide * 4.2,
            -usableHalf * 0.85,
            usableHalf * 0.85,
          );
          brain.actionTag = 'PASS';
        }
      } else if (
        distMetersToPlayer < -3 &&
        distMetersToPlayer > -22 &&
        aiSettings.aggression > 0.25 &&
        Math.abs(turnNear) < 0.12
      ) {
        // Defensive blocking if player is closing from behind on a straight
        const blockStrength = traits.blockTendency * aiSettings.aggression;
        if (blockStrength > 0.35) {
          const pInfo = track.getClosestTrackInfo(player.pos.x, player.pos.z, player.trackIdx);
          idealLane = THREE.MathUtils.lerp(
            idealLane,
            THREE.MathUtils.clamp(pInfo.lateralOffset, -usableHalf * 0.62, usableHalf * 0.62),
            blockStrength * 0.65,
          );
          brain.actionTag = 'DEFEND';
        }
      }

      // 3. Obstacle Avoidance: Civilian Traffic, Police/Roadblocks & Neighboring Racers
      for (let i = 0; i < traffic.length; i++) {
        const tr = traffic[i];
        const dx = tr.pos.x - ai.pos.x;
        const dz = tr.pos.z - ai.pos.z;
        const fwdD = dx * aiFwdX + dz * aiFwdZ;
        if (fwdD > 2 && fwdD < 40) {
          const latD = dx * aiRightX + dz * aiRightZ;
          const avoidRad = tr.isTruck ? 3.9 : 3.4;
          if (Math.abs(latD) < avoidRad) {
            const dodgeDir = tr.laneOffset >= 0 ? -1 : 1;
            idealLane = THREE.MathUtils.clamp(
              tr.laneOffset + dodgeDir * (avoidRad + 1.4),
              -usableHalf * 0.88,
              usableHalf * 0.88,
            );
            brain.actionTag = 'DODGE';
            break;
          }
        }
      }

      for (let i = 0; i < cops.length; i++) {
        const cp = cops[i];
        if (cp.wrecked) continue;
        const dx = cp.pos.x - ai.pos.x;
        const dz = cp.pos.z - ai.pos.z;
        const fwdD = dx * aiFwdX + dz * aiFwdZ;
        if (fwdD > 2 && fwdD < (cp.isRoadblock ? 55 : 28)) {
          const latD = dx * aiRightX + dz * aiRightZ;
          if (Math.abs(latD) < 3.5) {
            const shoulderSide = info.lateralOffset >= 0 ? -1 : 1;
            idealLane = shoulderSide * (usableHalf * 0.88);
            brain.actionTag = 'DODGE';
            break;
          }
        }
      }

      for (let i = 0; i < allRacers.length; i++) {
        const other = allRacers[i];
        if (other.id === ai.id || other.knockedOut || other.finished) continue;
        const dx = other.pos.x - ai.pos.x;
        const dz = other.pos.z - ai.pos.z;
        const fwdD = dx * aiFwdX + dz * aiFwdZ;
        if (fwdD > -1.5 && fwdD < 10) {
          const latD = dx * aiRightX + dz * aiRightZ;
          if (Math.abs(latD) < 2.9) {
            const push = latD >= 0 ? -3.4 : 3.4;
            idealLane = THREE.MathUtils.clamp(
              info.lateralOffset + push,
              -usableHalf * 0.88,
              usableHalf * 0.88,
            );
          }
        }
      }

      ai.laneTarget = idealLane;
    }

    brain.smoothedLane = THREE.MathUtils.damp(
      brain.smoothedLane,
      ai.laneTarget,
      aimingShortcut ? 7.5 : 4.6 + aiSettings.aggression * 1.4,
      rawFixedDt,
    );

    const lookOffsetSamples = THREE.MathUtils.clamp(Math.round(6 + absSpeed * 0.14), 6, 15);
    const targetSample = samples[(ai.trackIdx + lookOffsetSamples) % nSamples];
    targetX = targetSample.point.x + targetSample.right.x * brain.smoothedLane;
    targetZ = targetSample.point.z + targetSample.right.z * brain.smoothedLane;

    // Update 6 debug points (zero allocation) for F4 visualization
    brain.debugPoints[0].x = ai.pos.x;
    brain.debugPoints[0].y = ai.pos.y + 0.55;
    brain.debugPoints[0].z = ai.pos.z;
    for (let k = 1; k <= 5; k++) {
      const stepIdx = (ai.trackIdx + Math.round((k / 5) * lookOffsetSamples * 1.6)) % nSamples;
      const ds = samples[stepIdx];
      const laneFrac = k / 5;
      const dLane = THREE.MathUtils.lerp(info.lateralOffset, brain.smoothedLane, laneFrac);
      brain.debugPoints[k].x = ds.point.x + ds.right.x * dLane;
      brain.debugPoints[k].y = ds.point.y + 0.55;
      brain.debugPoints[k].z = ds.point.z + ds.right.z * dLane;
    }
  }

  // 4. Adaptive Intensity & Difficulty Physics Ceiling Calibration
  const gapLaps = player.totalProgress - ai.totalProgress;
  let targetRubber = 1.0;
  if (aiSettings.rubberBanding === 'off') {
    if (aiSettings.adaptiveIntensity && gapLaps > 0.28) {
      // Gentle floor ONLY if AI is more than ~28% of a lap behind so races never turn into empty lonely laps
      targetRubber = THREE.MathUtils.clamp(1 + (gapLaps - 0.28) * 0.55, 1.0, 1.12);
    }
  } else if (aiSettings.rubberBanding === 'classic') {
    targetRubber = THREE.MathUtils.clamp(
      1 + gapLaps * 1.65,
      profile.catchupMin * 0.96,
      profile.catchupMax + 0.08,
    );
  } else {
    // 'light' (default) — intense close pack racing even on Easy!
    const adaptiveBoost = aiSettings.adaptiveIntensity && gapLaps > 0.03 ? 1.55 : 0.95;
    targetRubber = THREE.MathUtils.clamp(1 + gapLaps * adaptiveBoost, profile.catchupMin, profile.catchupMax);
  }
  brain.adaptiveMult = THREE.MathUtils.damp(brain.adaptiveMult, targetRubber, 3.2, rawFixedDt);

  // 5. Physics-Derived Corner Speed Budget + Human Mistakes
  const sinTurn = Math.max(0.015, curvatureSharp);
  const estRadius = Math.max(16, (segLen * 7.5) / sinTurn);
  const baseDryMu = environment === 'overcast_rain' ? 0.86 : 1.04;
  const surfMu = THREE.MathUtils.lerp(baseDryMu, 0.84, THREE.MathUtils.clamp(roadWetness, 0, 1));
  const gripBudget = 13.8 * surfMu * tuning.tireGripMultiplier * profile.cornerConfidence * traits.cornerAttack;
  const physicsCornerCapMs = Math.sqrt(gripBudget * estRadius);

  const playerStats = computeEffectiveStats(player.spec, {
    ...brain.simConfig,
    engineLevel: 2,
    turboLevel: 2,
    nitrousLevel: 2,
    tiresLevel: 2,
  });
  const refTopKmh = Math.max(stats.topSpeedKmh, playerStats.topSpeedKmh * 0.96);
  const baseMaxMs =
    (refTopKmh / 3.6) *
    profile.baseSkill *
    aiSettings.pace *
    (0.95 + (ai.aiSkill - 0.9) * 0.45) *
    brain.adaptiveMult *
    (ai.copSlowdownTimer > 0 ? 0.7 : 1.0);

  // Drafting check for AI
  let drafting = false;
  if (absSpeed > 28) {
    for (let i = 0; i < allRacers.length && !drafting; i++) {
      const other = allRacers[i];
      if (other.id === ai.id || other.knockedOut) continue;
      const dx = other.pos.x - ai.pos.x;
      const dz = other.pos.z - ai.pos.z;
      const f = dx * aiFwdX + dz * aiFwdZ;
      if (f > 5 && f < 36 && Math.abs(dx * aiRightX + dz * aiRightZ) < 3.4) {
        drafting = true;
      }
    }
  }

  // Smart Nitrous Trigger (straights + overtaking/chasing)
  if (brain.nosBurstTimer > 0) {
    brain.nosBurstTimer = Math.max(0, brain.nosBurstTimer - rawFixedDt);
  }
  const straightEnough = curvatureSharp < 0.085 && curvatureMid < 0.11;
  if (
    brain.nosBurstTimer <= 0 &&
    brain.nitrous > 42 &&
    straightEnough &&
    absSpeed > 24 &&
    (gapLaps > 0.008 || drafting || brain.personality === 'aggressive')
  ) {
    if (Math.random() < profile.nosUsageBias * (0.25 + aiSettings.aggression * 0.75) * rawFixedDt * 2.2) {
      brain.nosBurstTimer = 1.1 + Math.random() * 1.1;
    }
  }
  const nosActive = brain.nosBurstTimer > 0 && brain.nitrous > 2;
  if (nosActive) {
    brain.nitrous = Math.max(0, brain.nitrous - rawFixedDt * 18);
    brain.actionTag = 'NOS';
  } else {
    brain.nitrous = Math.min(100, brain.nitrous + rawFixedDt * (4.0 + (drafting ? 7.5 : 0)));
  }

  // Human-sized mistake injection under heavy corner load or pack pressure
  const effectiveMistake = aiSettings.mistakeRate * profile.mistakeScale;
  if (brain.mistakeTimer > 0) {
    brain.mistakeTimer = Math.max(0, brain.mistakeTimer - rawFixedDt);
  } else {
    brain.mistakeCooldown = Math.max(0, brain.mistakeCooldown - rawFixedDt);
    if (
      brain.mistakeCooldown <= 0 &&
      effectiveMistake > 0.02 &&
      curvatureSharp > 0.15 &&
      absSpeed > 32
    ) {
      brain.mistakeCooldown = 7 + Math.random() * 8;
      if (Math.random() < effectiveMistake * 0.55) {
        brain.mistakeTimer = 0.45 + Math.random() * 0.35;
        brain.mistakeSteerBias = (Math.random() > 0.5 ? 1 : -1) * (0.18 + effectiveMistake * 0.25);
        brain.actionTag = 'SLIP';
      }
    }
  }

  // 6. Steering, Throttle & Braking Commands -> Real 120 Hz Vehicle Physics!
  const dx = targetX - ai.pos.x;
  const dz = targetZ - ai.pos.z;
  const desiredHeading = Math.atan2(-dx, -dz);
  let angleDiff = desiredHeading - ai.heading;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

  const steerGain = THREE.MathUtils.clamp(angleDiff * 2.25 + (brain.mistakeTimer > 0 ? brain.mistakeSteerBias : 0), -1, 1);
  ai.steerAngle = THREE.MathUtils.damp(ai.steerAngle, steerGain * 0.48, 16, rawFixedDt);

  const safeCornerMs =
    physicsCornerCapMs *
    traits.brakeBias *
    (brain.mistakeTimer > 0 ? 1.12 : 1.0) *
    (1 - Math.min(0.32, Math.abs(angleDiff) * 0.35));

  const targetSpeedMs = Math.min(
    nosActive ? baseMaxMs * 1.16 : baseMaxMs,
    safeCornerMs,
  );
  brain.targetSpeedMs = targetSpeedMs;

  const speedErr = targetSpeedMs - ai.forwardSpeed;
  let throttleInput = true;
  let brakeInput = false;
  let throttleAxis = 1.0;
  let brakeAxis = 0.0;

  if (speedErr < -4.2) {
    throttleInput = false;
    brakeInput = true;
    brakeAxis = THREE.MathUtils.clamp((-speedErr - 3.5) / 14, 0.28, 1.0);
    brain.actionTag = 'BRAKE';
  } else if (speedErr < -1.0) {
    throttleInput = false;
    brakeInput = false;
  } else {
    throttleInput = true;
    throttleAxis = THREE.MathUtils.clamp(speedErr / 6.0 + 0.65, 0.45, 1.0);
  }
  const handbrakeInput = !inShortcut && Math.abs(angleDiff) > 0.65 && absSpeed > 26 && brain.personality === 'aggressive';

  brain.braking = brakeInput || handbrakeInput;
  brain.nosActive = nosActive;

  const maxForwardMs = nosActive
    ? baseMaxMs * 1.18
    : drafting
      ? baseMaxMs * 1.06
      : baseMaxMs;

  const sIn = brain.stepIn;
  sIn.dt = dt;
  sIn.rawDt = rawFixedDt;
  sIn.forwardSpeed = ai.forwardSpeed;
  sIn.lateralSpeed = ai.lateralSpeed;
  sIn.steerAngle = ai.steerAngle;
  sIn.rawSteerInput = steerGain;
  sIn.throttleInput = throttleInput;
  sIn.brakeInput = brakeInput;
  sIn.handbrakeInput = handbrakeInput;
  sIn.throttleAxis = throttleAxis;
  sIn.brakeAxis = brakeAxis;
  sIn.nosActive = nosActive;
  sIn.driftBoostActive = false;
  sIn.drafting = drafting;
  sIn.airborne = ai.airHeight > 0.12;
  sIn.spikedTimer = ai.copSlowdownTimer > 0 ? 1 : 0;
  sIn.isSpeedbreaker = false;
  sIn.baseMaxMs = baseMaxMs;
  sIn.maxForwardMs = maxForwardMs;
  sIn.accelStat = Math.min(100, stats.accel * profile.baseSkill * aiSettings.pace * brain.adaptiveMult);
  sIn.handlingStat = Math.min(100, stats.handling * profile.cornerConfidence);
  sIn.bodyStyle = ai.spec.bodyStyle;
  sIn.upcomingTurnSeverity = THREE.MathUtils.clamp(curvatureSharp * 2.4, 0, 1);
  sIn.lateralOffset = info.lateralOffset;
  sIn.roadHalfWidth = track.roadHalfWidth;
  sIn.inShortcut = inShortcut;
  sIn.shortcutLateral = scHit ? scHit.lateral : 0;
  sIn.shortcutHalfWidth = scHit ? scHit.shortcut.halfWidth : 7;
  sIn.environment = environment;
  sIn.trackId = track.id;
  sIn.roadWetness = roadWetness;
  sIn.tuning = tuning;
  sIn.assists = assists;

  stepVehiclePhysics(brain.dyn, sIn, brain.stepOut);

  const sOut = brain.stepOut;
  ai.forwardSpeed = sOut.forwardSpeed;
  ai.lateralSpeed = sOut.lateralSpeed;
  ai.heading += sOut.yawRate * dt;
  brain.heaveOffset = sOut.heaveOffset;
  brain.wheelspinIntensity = sOut.wheelspinIntensity;
  brain.isDrifting = ai.airHeight <= 0.12 && Math.abs(ai.lateralSpeed) > 2.2 && absSpeed > 15;

  ai.pitch = THREE.MathUtils.damp(ai.pitch, sOut.targetPitch, 11, rawFixedDt);
  ai.roll = THREE.MathUtils.damp(ai.roll, sOut.targetRoll, 11, rawFixedDt);
}
