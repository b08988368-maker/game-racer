import * as THREE from 'three';
import {
  AI_PERSONALITY_TRAITS,
  AiPersonality,
  AiSettings,
  DIFFICULTY_AI_PROFILES,
} from '../config/aiConfig';
import { AssistSettings, PhysicsTuningParams } from '../config/physicsConfig';
import { computeEffectiveStats, MAX_UPGRADE_LEVEL } from '../data/gameData';
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
  slopePitch?: number;
  bankRoll?: number;
  lastLandingVelMps?: number;
  copSlowdownTimer: number;
  finished: boolean;
  knockedOut: boolean;
  busted: boolean;
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
  stuckTimer: number;
  reverseRecoveryTimer: number;
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
  const diffOffset =
    difficulty === 'Easy' ? 0.0 : difficulty === 'Medium' ? 0.25 : difficulty === 'Hard' ? 0.55 : 0.90;
  const tierBase =
    Math.max(1.5, playerAvg * 0.92 + 0.30) +
    aiTierBoost * 0.45 +
    (isBoss ? 0.55 : 0) +
    diffOffset +
    slotOffset * 0.25;
  const clamped = Math.max(1, Math.min(MAX_UPGRADE_LEVEL, Math.round(tierBase)));
  const tireBoost = Math.max(1, Math.min(MAX_UPGRADE_LEVEL, Math.round(tierBase + 0.5)));
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
      wheelRadiusM: spec.dimensions.wheelRadius,
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
    mistakeCooldown: 6 + index * 2.5,
    stuckTimer: 0,
    reverseRecoveryTimer: 0,
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
  brain.mistakeCooldown = 6;
  brain.stuckTimer = 0;
  brain.reverseRecoveryTimer = 0;
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

export interface AiSpikeObstacle {
  pos: THREE.Vector3;
  hit: boolean;
}

const CANDIDATE_LANE_FRACS = [-0.84, -0.56, -0.28, 0, 0.28, 0.56, 0.84];

function circumcircleCurvatureXZ(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
): number {
  const ab = Math.hypot(bx - ax, bz - az);
  const bc = Math.hypot(cx - bx, cz - bz);
  const ca = Math.hypot(ax - cx, az - cz);
  const denom = ab * bc * ca;
  if (denom < 0.001) return 0;
  const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
  return (2 * Math.abs(cross)) / denom;
}

export function computeAiCornerSafeSpeedMs(
  minRadiusM: number,
  horizonBrakeCapMs: number,
  gripBudget: number,
  angleDiffRad: number,
  brakeBias: number,
): number {
  const immediateCornerMs = minRadiusM < 450 ? Math.sqrt(gripBudget * minRadiusM) : 999;
  const physicsCornerCapMs = Math.min(immediateCornerMs, horizonBrakeCapMs);
  const absAngle = Math.abs(angleDiffRad);
  const steeringTrim = absAngle > 0.36 ? 1 - Math.min(0.16, (absAngle - 0.36) * 0.24) : 1.0;
  return physicsCornerCapMs * brakeBias * steeringTrim;
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
  spikeStrips: AiSpikeObstacle[] = [],
  _playerConfig?: GarageCarConfig,
): void {
  const samples = track.samples;
  const nSamples = samples.length;
  const profile = DIFFICULTY_AI_PROFILES[difficulty];
  const traits = AI_PERSONALITY_TRAITS[brain.personality];
  const stats = computeEffectiveStats(ai.spec, brain.simConfig);

  const info = track.getClosestTrackInfo(ai.pos.x, ai.pos.z, ai.trackIdx, ai.pos.y);

  // If busted by RPD, smoothly brake/coast to a stop along the shoulder
  if (ai.busted) {
    brain.actionTag = 'BUSTED';
    brain.braking = Math.abs(ai.forwardSpeed) > 1.2;
    brain.nosActive = false;
    brain.isDrifting = false;
    brain.targetSpeedMs = 0;

    const sIn = brain.stepIn;
    sIn.dt = dt;
    sIn.rawDt = rawFixedDt;
    sIn.forwardSpeed = ai.forwardSpeed;
    sIn.lateralSpeed = ai.lateralSpeed;
    sIn.steerAngle = THREE.MathUtils.damp(ai.steerAngle, 0, 8, rawFixedDt);
    ai.steerAngle = sIn.steerAngle;
    sIn.rawSteerInput = 0;
    sIn.throttleInput = false;
    sIn.brakeInput = ai.forwardSpeed > 0.6;
    sIn.handbrakeInput = Math.abs(ai.forwardSpeed) > 3;
    sIn.throttleAxis = 0;
    sIn.brakeAxis = 0.88;
    sIn.nosActive = false;
    sIn.driftBoostActive = false;
    sIn.drafting = false;
    sIn.airborne = ai.airHeight > 0.12;
    sIn.spikedTimer = 0;
    sIn.isSpeedbreaker = false;
    sIn.baseMaxMs = 20;
    sIn.maxForwardMs = 20;
    sIn.accelStat = stats.accel;
    sIn.handlingStat = stats.handling;
    sIn.bodyStyle = ai.spec.bodyStyle;
    sIn.upcomingTurnSeverity = 0;
    sIn.lateralOffset = info.lateralOffset;
    sIn.roadHalfWidth = track.roadHalfWidth;
    sIn.inShortcut = false;
    sIn.shortcutLateral = 0;
    sIn.shortcutHalfWidth = 7;
    sIn.environment = environment;
    sIn.trackId = track.id;
    sIn.roadWetness = roadWetness;
    sIn.wheelRadiusM = ai.spec.dimensions.wheelRadius;
    sIn.tuning = tuning;
    sIn.assists = assists;

    stepVehiclePhysics(brain.dyn, sIn, brain.stepOut);
    ai.forwardSpeed = brain.stepOut.forwardSpeed;
    ai.lateralSpeed = brain.stepOut.lateralSpeed;
    ai.heading += brain.stepOut.yawRate * dt;
    brain.heaveOffset = brain.stepOut.heaveOffset;
    brain.wheelspinIntensity = 0;
    ai.pitch = THREE.MathUtils.damp(ai.pitch, brain.stepOut.targetPitch, 11, rawFixedDt);
    ai.roll = THREE.MathUtils.damp(ai.roll, brain.stepOut.targetRoll, 11, rawFixedDt);
    return;
  }

  const scHit =
    ai.activeShortcutId !== null ? track.queryShortcut(ai.pos.x, ai.pos.z, ai.activeShortcutId) : null;
  const inShortcut = Boolean(scHit && ai.activeShortcutId !== null && scHit.shortcut.id === ai.activeShortcutId);

  const aiFwdX = -Math.sin(ai.heading);
  const aiFwdZ = -Math.cos(ai.heading);
  const aiRightX = Math.cos(ai.heading);
  const aiRightZ = -Math.sin(ai.heading);

  const absSpeed = Math.abs(ai.forwardSpeed);
  const segLen = track.totalLength / nSamples;

  // 1. Multi-Horizon Circumcircle Curvature & Outside-Apex-Outside Line Planner
  let targetX = 0;
  let targetZ = 0;
  let curvatureNear = 0;
  let curvatureMid = 0;
  let minFutureRadius = 999;
  let aimingShortcut = false;

  const gapLaps = player.totalProgress - ai.totalProgress;
  const gapMeters = gapLaps * track.totalLength;
  const trailCornerBoost =
    gapMeters > 60 ? 1 + Math.min(0.18, (gapMeters - 60) / 850) : 1.0;

  const baseDryMu = environment === 'overcast_rain' ? 0.98 : 1.15;
  const surfMu = THREE.MathUtils.lerp(baseDryMu, 0.92, THREE.MathUtils.clamp(roadWetness, 0, 1));
  const bankGripBonus = 1 + Math.min(0.22, Math.abs(info.bankAngle) * 0.95);
  const gripBudget =
    22.0 *
    surfMu *
    bankGripBonus *
    tuning.tireGripMultiplier *
    profile.cornerConfidence *
    trailCornerBoost *
    traits.cornerAttack;
  const maxBrakeDecel = 28.0 * surfMu * profile.brakingPrecision;

  let horizonBrakeCapMs = 999;

  if (inShortcut && scHit) {
    const pts = scHit.shortcut.points;
    const lookIdx = Math.min(pts.length - 1, scHit.ptIndex + 6);
    targetX = pts[lookIdx].x;
    targetZ = pts[lookIdx].z;
    brain.actionTag = 'SHORTCUT';

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
    if (track.shortcuts.length > 0 && traits.shortcutAffinity * ai.aiSkill > 0.34) {
      for (let i = 0; i < track.shortcuts.length; i++) {
        const sc = track.shortcuts[i];
        const ahead = (sc.entryCutStartIdx - ai.trackIdx + nSamples) % nSamples;
        if (ahead <= 26) {
          ai.laneTarget = sc.side * (track.roadHalfWidth + 1.1);
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

    // Smooth 6-sample AND tight 3-sample chord curvature scanning so double hairpins & switchbacks
    // ("make another turn") trigger crisp early apex entry instead of cutting straight across bends
    const scanWindows = [3, 5, 9, 14, 20, 28, 38];
    for (let w = 0; w < scanWindows.length; w++) {
      const offset = scanWindows[w];
      const pA = samples[(ai.trackIdx + Math.max(0, offset - 6)) % nSamples].point;
      const pB = samples[(ai.trackIdx + offset) % nSamples].point;
      const pC = samples[(ai.trackIdx + offset + 6) % nSamples].point;
      const kCurv = circumcircleCurvatureXZ(pA.x, pA.z, pB.x, pB.z, pC.x, pC.z);

      const tA = samples[(ai.trackIdx + Math.max(0, offset - 3)) % nSamples].point;
      const tC = samples[(ai.trackIdx + offset + 3) % nSamples].point;
      const kTight = circumcircleCurvatureXZ(tA.x, tA.z, pB.x, pB.z, tC.x, tC.z);
      const effCurv = Math.max(kCurv, kTight * 0.92);

      const rCurve = effCurv > 0.0014 ? Math.max(14, 1 / effCurv) : 999;
      if (offset <= 10) curvatureNear = Math.max(curvatureNear, effCurv * 5.2);
      if (offset <= 21) curvatureMid = Math.max(curvatureMid, effCurv * 5.2);
      if (rCurve < minFutureRadius && offset <= 21) minFutureRadius = rCurve;

      if (rCurve < 420) {
        const cornerSafeV = Math.sqrt(gripBudget * rCurve);
        const distToApex = Math.max(0, (offset - 2) * segLen);
        const brakeEntryV = Math.sqrt(cornerSafeV * cornerSafeV + 2 * maxBrakeDecel * distToApex);
        if (brakeEntryV < horizonBrakeCapMs) {
          horizonBrakeCapMs = brakeEntryV;
        }
      }
    }

    if (!aimingShortcut) {
      const usableHalf = Math.max(3.6, track.roadHalfWidth - 1.9);
      const dirRightNear = sNear.tangent.x * sNow.right.x + sNear.tangent.z * sNow.right.z;
      const dirRightMid = sMid.tangent.x * sNow.right.x + sMid.tangent.z * sNow.right.z;
      const dirRightFar = sFar.tangent.x * sMid.right.x + sFar.tangent.z * sMid.right.z;

      let idealLane = 0;
      if (Math.abs(dirRightNear) > 0.075 || Math.abs(dirRightMid) > 0.11) {
        // Clip inside apex aggressively!
        const apexDir = Math.abs(dirRightNear) >= Math.abs(dirRightMid) ? dirRightNear : dirRightMid;
        idealLane = THREE.MathUtils.clamp(apexDir * usableHalf * 3.4, -usableHalf * 0.82, usableHalf * 0.82);
        brain.actionTag = 'APEX';
      } else if (Math.abs(dirRightFar) > 0.085) {
        // Outside setup before corner entry
        idealLane = THREE.MathUtils.clamp(-dirRightFar * usableHalf * 2.5, -usableHalf * 0.75, usableHalf * 0.75);
        brain.actionTag = 'SETUP';
      } else {
        idealLane = 0;
        brain.actionTag = 'CRUISE';
      }

      // 2. Slipstream hunting & Smart Gap-Finding Overtake / Defensive Blocking vs Player
      const gapToPlayerProg = player.totalProgress - ai.totalProgress;
      const distMetersToPlayer = gapToPlayerProg * track.totalLength;
      if (distMetersToPlayer > 3.5 && distMetersToPlayer < 45 && !player.finished && !player.knockedOut) {
        const pInfo = track.getClosestTrackInfo(player.pos.x, player.pos.z, player.trackIdx, player.pos.y);
        const relClosing = ai.forwardSpeed - player.forwardSpeed;
        if (distMetersToPlayer > 18 && relClosing < 8 && Math.abs(dirRightNear) < 0.10) {
          idealLane = THREE.MathUtils.clamp(pInfo.lateralOffset, -usableHalf * 0.72, usableHalf * 0.72);
          brain.actionTag = 'DRAFT';
        } else if (distMetersToPlayer <= 18 || relClosing >= 8) {
          // Pick whichever side of the player offers wider asphalt clearance instead of rear-ending
          const leftRoom = usableHalf + pInfo.lateralOffset;
          const rightRoom = usableHalf - pInfo.lateralOffset;
          const passSide = rightRoom >= leftRoom ? 1 : -1;
          idealLane = THREE.MathUtils.clamp(
            pInfo.lateralOffset + passSide * 4.2,
            -usableHalf * 0.88,
            usableHalf * 0.88,
          );
          brain.actionTag = 'PASS';
        }
      } else if (
        distMetersToPlayer < -2.5 &&
        distMetersToPlayer > -20 &&
        aiSettings.aggression > 0.25 &&
        Math.abs(dirRightNear) < 0.10
      ) {
        const blockStrength = traits.blockTendency * aiSettings.aggression;
        if (blockStrength > 0.35) {
          const pInfo = track.getClosestTrackInfo(player.pos.x, player.pos.z, player.trackIdx, player.pos.y);
          idealLane = THREE.MathUtils.lerp(
            idealLane,
            THREE.MathUtils.clamp(pInfo.lateralOffset, -usableHalf * 0.65, usableHalf * 0.65),
            blockStrength * 0.65,
          );
          brain.actionTag = 'DEFEND';
        }
      }

      // 3. Multi-Candidate Simultaneous Lane Scoring (Traffic + Cops + Roadblocks + Spike Strips + Rivals)
      let hasObstacleThreat = false;
      const horizonDist = Math.max(26, absSpeed * 1.15);

      for (let i = 0; i < traffic.length && !hasObstacleThreat; i++) {
        const tr = traffic[i];
        const dx = tr.pos.x - ai.pos.x;
        const dz = tr.pos.z - ai.pos.z;
        const fwdD = dx * aiFwdX + dz * aiFwdZ;
        if (fwdD > 1 && fwdD < horizonDist && Math.abs(dx * aiRightX + dz * aiRightZ) < 6.5) {
          hasObstacleThreat = true;
        }
      }
      for (let i = 0; i < cops.length && !hasObstacleThreat; i++) {
        const cp = cops[i];
        if (cp.wrecked) continue;
        const dx = cp.pos.x - ai.pos.x;
        const dz = cp.pos.z - ai.pos.z;
        const fwdD = dx * aiFwdX + dz * aiFwdZ;
        if (fwdD > 1 && fwdD < (cp.isRoadblock ? 60 : 34) && Math.abs(dx * aiRightX + dz * aiRightZ) < 6.8) {
          hasObstacleThreat = true;
        }
      }
      for (let i = 0; i < spikeStrips.length && !hasObstacleThreat; i++) {
        const sp = spikeStrips[i];
        if (sp.hit) continue;
        const dx = sp.pos.x - ai.pos.x;
        const dz = sp.pos.z - ai.pos.z;
        const fwdD = dx * aiFwdX + dz * aiFwdZ;
        if (fwdD > 1 && fwdD < 44 && Math.abs(dx * aiRightX + dz * aiRightZ) < 6.0) {
          hasObstacleThreat = true;
        }
      }
      for (let i = 0; i < allRacers.length && !hasObstacleThreat; i++) {
        const other = allRacers[i];
        if (other.id === ai.id || other.knockedOut || other.finished) continue;
        const dx = other.pos.x - ai.pos.x;
        const dz = other.pos.z - ai.pos.z;
        const fwdD = dx * aiFwdX + dz * aiFwdZ;
        if (fwdD > -1 && fwdD < 14 && Math.abs(dx * aiRightX + dz * aiRightZ) < 4.0) {
          hasObstacleThreat = true;
        }
      }

      if (hasObstacleThreat) {
        let bestLane = idealLane;
        let bestCost = Infinity;
        for (let ci = 0; ci < CANDIDATE_LANE_FRACS.length; ci++) {
          const candLane = CANDIDATE_LANE_FRACS[ci] * usableHalf;
          const laneShift = candLane - info.lateralOffset;
          let cost = Math.abs(candLane - idealLane) * 0.45 + Math.abs(laneShift) * 0.22;

          for (let i = 0; i < traffic.length; i++) {
            const tr = traffic[i];
            const dx = tr.pos.x - ai.pos.x;
            const dz = tr.pos.z - ai.pos.z;
            const fwdD = dx * aiFwdX + dz * aiFwdZ;
            if (fwdD > 0 && fwdD < horizonDist) {
              const latD = dx * aiRightX + dz * aiRightZ;
              const clearRad = tr.isTruck ? 3.8 : 3.2;
              const distFromObs = Math.abs(latD - laneShift);
              if (distFromObs < clearRad) {
                cost += ((clearRad - distFromObs) / clearRad) * (160 / Math.max(4, fwdD));
              }
            }
          }

          for (let i = 0; i < cops.length; i++) {
            const cp = cops[i];
            if (cp.wrecked) continue;
            const dx = cp.pos.x - ai.pos.x;
            const dz = cp.pos.z - ai.pos.z;
            const fwdD = dx * aiFwdX + dz * aiFwdZ;
            if (fwdD > 0 && fwdD < (cp.isRoadblock ? 60 : 34)) {
              const latD = dx * aiRightX + dz * aiRightZ;
              const clearRad = cp.isRoadblock ? 4.4 : 3.5;
              const distFromObs = Math.abs(latD - laneShift);
              if (distFromObs < clearRad) {
                cost += ((clearRad - distFromObs) / clearRad) * (190 / Math.max(4, fwdD));
              }
            }
          }

          for (let i = 0; i < spikeStrips.length; i++) {
            const sp = spikeStrips[i];
            if (sp.hit) continue;
            const dx = sp.pos.x - ai.pos.x;
            const dz = sp.pos.z - ai.pos.z;
            const fwdD = dx * aiFwdX + dz * aiFwdZ;
            if (fwdD > 0 && fwdD < 44) {
              const latD = dx * aiRightX + dz * aiRightZ;
              const distFromObs = Math.abs(latD - laneShift);
              if (distFromObs < 3.6) {
                cost += ((3.6 - distFromObs) / 3.6) * (220 / Math.max(4, fwdD));
              }
            }
          }

          for (let i = 0; i < allRacers.length; i++) {
            const other = allRacers[i];
            if (other.id === ai.id || other.knockedOut || other.finished) continue;
            const dx = other.pos.x - ai.pos.x;
            const dz = other.pos.z - ai.pos.z;
            const fwdD = dx * aiFwdX + dz * aiFwdZ;
            if (fwdD > -1 && fwdD < 15) {
              const latD = dx * aiRightX + dz * aiRightZ;
              const distFromObs = Math.abs(latD - laneShift);
              if (distFromObs < 2.9) {
                cost += ((2.9 - distFromObs) / 2.9) * (110 / Math.max(3, fwdD + 3));
              }
            }
          }

          if (cost < bestCost) {
            bestCost = cost;
            bestLane = candLane;
          }
        }
        if (Math.abs(bestLane - idealLane) > 1.2) {
          brain.actionTag = 'DODGE';
        }
        idealLane = bestLane;
      }

      ai.laneTarget = idealLane;
    }

    brain.smoothedLane = THREE.MathUtils.damp(
      brain.smoothedLane,
      ai.laneTarget,
      aimingShortcut ? 8.2 : 5.4 + aiSettings.aggression * 1.6,
      rawFixedDt,
    );

    // Shorten lookahead dynamically in consecutive hairpins/switchbacks so bots slice apex 1 -> apex 2 cleanly
    const isTightSwitchback = minFutureRadius < 55 || curvatureNear > 0.18;
    const lookOffsetSamples = isTightSwitchback
      ? THREE.MathUtils.clamp(Math.round(3.5 + absSpeed * 0.085), 3, 10)
      : THREE.MathUtils.clamp(Math.round(5 + absSpeed * 0.13), 5, 14);
    const targetSample = samples[(ai.trackIdx + lookOffsetSamples) % nSamples];
    targetX = targetSample.point.x + targetSample.right.x * brain.smoothedLane;
    targetZ = targetSample.point.z + targetSample.right.z * brain.smoothedLane;

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

  // 4. Adaptive Intensity & True Tier-Grounded Speed Calibration (eliminates multi-km blowout gaps)
  let targetRubber = 1.0;
  if (aiSettings.rubberBanding === 'off') {
    if (aiSettings.adaptiveIntensity && gapLaps > 0.08) {
      targetRubber = THREE.MathUtils.clamp(1 + (gapLaps - 0.08) * 1.15, 1.0, 1.16);
    }
  } else if (aiSettings.rubberBanding === 'classic') {
    targetRubber = THREE.MathUtils.clamp(
      1 + gapLaps * 2.8,
      profile.catchupMin * 0.98,
      profile.catchupMax + 0.06,
    );
  } else {
    const adaptiveBoost = aiSettings.adaptiveIntensity && gapLaps > 0.005 ? 4.2 : 1.15;
    targetRubber = THREE.MathUtils.clamp(1 + gapLaps * adaptiveBoost, profile.catchupMin, profile.catchupMax);
  }
  brain.adaptiveMult = THREE.MathUtils.damp(brain.adaptiveMult, targetRubber, 6.2, rawFixedDt);

  let baseMaxMs =
    (stats.topSpeedKmh / 3.6) *
    profile.baseSkill *
    aiSettings.pace *
    (0.99 + (ai.aiSkill - 0.94) * 0.36) *
    brain.adaptiveMult *
    (ai.copSlowdownTimer > 0 ? 0.86 : 1.0);

  if (gapMeters > 150 && aiSettings.rubberBanding !== 'off') {
    const playerSpeedRef = Math.abs(player.forwardSpeed);
    const packTarget = playerSpeedRef * (gapMeters > 360 ? 1.14 : 1.07);
    baseMaxMs = Math.max(baseMaxMs, Math.min(baseMaxMs * 1.18, packTarget));
  }

  // 5. Kinematic Corner Speed Budget + Drafting + Tactical Exit NOS
  let drafting = false;
  if (absSpeed > 26) {
    for (let i = 0; i < allRacers.length && !drafting; i++) {
      const other = allRacers[i];
      if (other.id === ai.id || other.knockedOut || other.busted) continue;
      const dx = other.pos.x - ai.pos.x;
      const dz = other.pos.z - ai.pos.z;
      const f = dx * aiFwdX + dz * aiFwdZ;
      if (f > 5 && f < 40 && Math.abs(dx * aiRightX + dz * aiRightZ) < 3.4) {
        drafting = true;
      }
    }
  }

  const dx = targetX - ai.pos.x;
  const dz = targetZ - ai.pos.z;
  const desiredHeading = Math.atan2(-dx, -dz);
  let angleDiff = desiredHeading - ai.heading;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

  if (brain.nosBurstTimer > 0) {
    brain.nosBurstTimer = Math.max(0, brain.nosBurstTimer - rawFixedDt);
  }
  const straightEnough = curvatureNear < 0.13 && curvatureMid < 0.17 && Math.abs(angleDiff) < 0.24;
  if (
    brain.nosBurstTimer <= 0 &&
    brain.nitrous > 24 &&
    straightEnough &&
    absSpeed > 16 &&
    (gapLaps > 0.004 || drafting || brain.personality === 'aggressive')
  ) {
    if (Math.random() < profile.nosUsageBias * (0.72 + aiSettings.aggression * 0.65) * rawFixedDt * 4.2) {
      brain.nosBurstTimer = 1.5 + Math.random() * 1.0;
    }
  }
  const nosActive = brain.nosBurstTimer > 0 && brain.nitrous > 2;
  if (nosActive) {
    brain.nitrous = Math.max(0, brain.nitrous - rawFixedDt * 17);
    brain.actionTag = 'NOS';
  } else {
    brain.nitrous = Math.min(100, brain.nitrous + rawFixedDt * (5.0 + (drafting ? 8.5 : 0)));
  }

  const effectiveMistake = aiSettings.mistakeRate * profile.mistakeScale;
  if (brain.mistakeTimer > 0) {
    brain.mistakeTimer = Math.max(0, brain.mistakeTimer - rawFixedDt);
  } else {
    brain.mistakeCooldown = Math.max(0, brain.mistakeCooldown - rawFixedDt);
    if (
      brain.mistakeCooldown <= 0 &&
      effectiveMistake > 0.02 &&
      curvatureNear > 0.19 &&
      absSpeed > 40
    ) {
      brain.mistakeCooldown = 10 + Math.random() * 10;
      if (Math.random() < effectiveMistake * 0.35) {
        brain.mistakeTimer = 0.28 + Math.random() * 0.2;
        brain.mistakeSteerBias = (Math.random() > 0.5 ? 1 : -1) * (0.11 + effectiveMistake * 0.15);
        brain.actionTag = 'SLIP';
      }
    }
  }

  // 6. Stuck / Wall-Pin Recovery
  if (brain.reverseRecoveryTimer > 0) {
    brain.reverseRecoveryTimer = Math.max(0, brain.reverseRecoveryTimer - rawFixedDt);
  } else if (absSpeed < 3.6 && ai.airHeight <= 0.1) {
    brain.stuckTimer += rawFixedDt;
    if (brain.stuckTimer > 1.05) {
      brain.reverseRecoveryTimer = 0.6;
      brain.stuckTimer = 0;
    }
  } else {
    brain.stuckTimer = Math.max(0, brain.stuckTimer - rawFixedDt * 2);
  }

  let steerGain = THREE.MathUtils.clamp(angleDiff * 2.85 + (brain.mistakeTimer > 0 ? brain.mistakeSteerBias : 0), -1, 1);
  ai.steerAngle = THREE.MathUtils.damp(ai.steerAngle, steerGain * 0.50, 24, rawFixedDt);

  const safeCornerMs = computeAiCornerSafeSpeedMs(
    minFutureRadius,
    horizonBrakeCapMs,
    gripBudget,
    angleDiff,
    traits.brakeBias * (brain.mistakeTimer > 0 ? 1.08 : 1.0),
  );
  const shortcutEntryCapMs = aimingShortcut ? 68 : 999;

  const targetSpeedMs = Math.min(
    nosActive ? baseMaxMs * 1.15 : baseMaxMs,
    safeCornerMs,
    shortcutEntryCapMs,
  );
  brain.targetSpeedMs = targetSpeedMs;

  const speedErr = targetSpeedMs - ai.forwardSpeed;
  let throttleInput = true;
  let brakeInput = false;
  let throttleAxis = 1.0;
  let brakeAxis = 0.0;

  const needTurnRotationBrake = Math.abs(angleDiff) > 0.45 && absSpeed > 22;
  if (brain.reverseRecoveryTimer > 0) {
    throttleInput = false;
    brakeInput = true;
    brakeAxis = 0.95;
    steerGain = -Math.sign(angleDiff || 1);
    ai.steerAngle = steerGain * 0.50;
    brain.actionTag = 'RECOVER';
  } else if (speedErr < -3.2 || (needTurnRotationBrake && speedErr < 1.5)) {
    throttleInput = false;
    brakeInput = true;
    brakeAxis = THREE.MathUtils.clamp(
      Math.max((-speedErr - 2.4) / 12, needTurnRotationBrake ? 0.58 : 0.34),
      0.34,
      1.0,
    );
    brain.actionTag = 'BRAKE';
  } else if (speedErr < -0.7) {
    throttleInput = false;
    brakeInput = false;
  } else {
    throttleInput = true;
    throttleAxis = THREE.MathUtils.clamp(speedErr / 4.2 + 0.85, 0.62, 1.0);
  }
  const handbrakeInput =
    !inShortcut &&
    brain.reverseRecoveryTimer <= 0 &&
    Math.abs(angleDiff) > 0.56 &&
    absSpeed > 24;

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
  sIn.accelStat = Math.min(100, stats.accel * (0.94 + profile.baseSkill * 0.06) * aiSettings.pace);
  sIn.handlingStat = Math.min(100, stats.handling * profile.cornerConfidence);
  sIn.bodyStyle = ai.spec.bodyStyle;
  sIn.upcomingTurnSeverity = THREE.MathUtils.clamp(curvatureNear * 2.4, 0, 1);
  sIn.lateralOffset = info.lateralOffset;
  sIn.roadHalfWidth = track.roadHalfWidth;
  sIn.inShortcut = inShortcut;
  sIn.shortcutLateral = scHit ? scHit.lateral : 0;
  sIn.shortcutHalfWidth = scHit ? scHit.shortcut.halfWidth : 7;
  sIn.environment = environment;
  sIn.trackId = track.id;
  sIn.roadWetness = roadWetness;
  sIn.slopePitch = ai.slopePitch ?? info.slopePitch;
  sIn.bankAngle = ai.bankRoll ?? info.bankAngle;
  sIn.landingVelMps = ai.lastLandingVelMps ?? 0;
  ai.lastLandingVelMps = 0;
  sIn.wheelRadiusM = ai.spec.dimensions.wheelRadius;
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
