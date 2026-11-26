import * as THREE from 'three';
import {
  AI_PERSONALITY_TRAITS,
  AI_TUNING_CONFIG,
  AiPersonality,
  AiSettings,
  clampSkillForDifficulty,
  computeRubberBandTargetMultiplier,
  computeTargetPaceFromSkill,
  DIFFICULTY_AI_PROFILES,
  loadAdaptiveAiState,
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

export interface AiRaceContext {
  totalLaps?: number;
  aiLap?: number;
  raceElapsedSec?: number;
}

export type AiMistakeKind = 'none' | 'late_brake' | 'line_drift' | 'slow_exit';

export interface AiBrainState {
  personality: AiPersonality;
  skill: number; // 0..1 adaptive driver skill within difficulty bounds
  simConfig: GarageCarConfig;
  dyn: VehicleDynamicsState;
  stepIn: VehicleStepInput;
  stepOut: VehicleStepOutput;
  nitrous: number;
  nosBurstTimer: number;
  actionTag: string;
  targetSpeedMs: number;
  smoothedLane: number;
  rubberMult: number;
  adaptiveMult: number; // alias of smoothed rubberMult for telemetry compatibility
  currentLap: number;
  lapRandomMult: number;
  mistakeCount: number;
  mistakeKind: AiMistakeKind;
  mistakeExitThrottle: number;
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
    difficulty === 'Easy' ? -0.15 : difficulty === 'Medium' ? 0.05 : difficulty === 'Hard' ? 0.3 : 0.55;
  const tierBase =
    Math.max(1.5, playerAvg * 0.96 + 0.15) +
    aiTierBoost * 0.35 +
    (isBoss ? 0.35 : 0) +
    diffOffset +
    slotOffset * 0.2;
  const clamped = Math.max(1, Math.min(MAX_UPGRADE_LEVEL, Math.round(tierBase)));
  const tireBoost = Math.max(1, Math.min(MAX_UPGRADE_LEVEL, Math.round(tierBase + 0.45)));
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
  initialSkill?: number,
): AiBrainState {
  const personalities: AiPersonality[] = ['aggressive', 'cautious', 'consistent'];
  const personality: AiPersonality = isBoss ? 'aggressive' : personalities[index % personalities.length];
  const simConfig = buildFairAiConfig(spec, playerConfig, difficulty, aiTierBoost, isBoss, index === 0 ? 1 : 0);

  const adaptiveRecord = loadAdaptiveAiState();
  const slotSkillJitter = isBoss ? 0.02 : index === 0 ? 0.02 : index === 1 ? 0 : -0.02;
  const baseSkill = initialSkill ?? adaptiveRecord.skills[difficulty] + slotSkillJitter;
  const skill = clampSkillForDifficulty(difficulty, baseSkill);

  return {
    personality,
    skill,
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
    rubberMult: 1.0,
    adaptiveMult: 1.0,
    currentLap: 0,
    lapRandomMult: 1.0,
    mistakeCount: 0,
    mistakeKind: 'none',
    mistakeExitThrottle: 1.0,
    mistakeTimer: 0,
    mistakeSteerBias: 0,
    mistakeCooldown: 5.5 + index * 2.2,
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

export function resetAiBrainState(
  brain: AiBrainState,
  initialLane: number,
  initialSkill?: number,
  difficulty?: TrackDifficulty,
): void {
  brain.dyn = createVehicleDynamicsState();
  brain.nitrous = 100;
  brain.nosBurstTimer = 0;
  brain.actionTag = 'GRID';
  brain.targetSpeedMs = 0;
  brain.smoothedLane = initialLane;
  brain.rubberMult = 1.0;
  brain.adaptiveMult = 1.0;
  brain.currentLap = 0;
  brain.lapRandomMult = 1.0;
  brain.mistakeCount = 0;
  brain.mistakeKind = 'none';
  brain.mistakeExitThrottle = 1.0;
  brain.mistakeTimer = 0;
  brain.mistakeSteerBias = 0;
  brain.mistakeCooldown = 5.5;
  brain.stuckTimer = 0;
  brain.reverseRecoveryTimer = 0;
  brain.heaveOffset = 0;
  brain.wheelspinIntensity = 0;
  brain.braking = false;
  brain.nosActive = false;
  brain.isDrifting = false;
  if (initialSkill !== undefined && difficulty) {
    brain.skill = clampSkillForDifficulty(difficulty, initialSkill);
  }
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
const MAX_AI_THREATS = 64;
const _threatLat = new Float64Array(MAX_AI_THREATS);
const _threatClearRad = new Float64Array(MAX_AI_THREATS);
const _threatCostScale = new Float64Array(MAX_AI_THREATS);

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
  playerConfig?: GarageCarConfig,
  raceContext?: AiRaceContext,
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

  const totalLaps = Math.max(1, raceContext?.totalLaps ?? 2);
  const aiLap = Math.max(1, raceContext?.aiLap ?? Math.floor(ai.totalProgress) + 1);
  const raceElapsedSec = raceContext?.raceElapsedSec ?? 20;
  const isFinalLap = totalLaps > 1 ? aiLap >= totalLaps : ai.totalProgress >= 0.72;

  // Per-lap pace randomness (±1-2% scaled by driver personality) so AI never runs identical laps
  if (aiLap !== brain.currentLap) {
    brain.currentLap = aiLap;
    const jitterSpan = AI_TUNING_CONFIG.LAP_RANDOMNESS_PCT * traits.lapVarianceMult;
    brain.lapRandomMult = 1 + (Math.random() * 2 - 1) * jitterSpan;
  }

  // 1. Multi-Horizon Circumcircle Curvature & Outside-Apex-Outside Line Planner
  let targetX = 0;
  let targetZ = 0;
  let curvatureNear = 0;
  let curvatureMid = 0;
  let minFutureRadius = 999;
  let aimingShortcut = false;

  const gapMeters = (player.totalProgress - ai.totalProgress) * track.totalLength;

  const baseDryMu = environment === 'overcast_rain' ? 0.98 : 1.15;
  const surfMu = THREE.MathUtils.lerp(baseDryMu, 0.92, THREE.MathUtils.clamp(roadWetness, 0, 1));
  const bankGripBonus = 1 + Math.min(0.22, Math.abs(info.bankAngle) * 0.95);
  const gripBudget =
    14.8 *
    surfMu *
    bankGripBonus *
    tuning.tireGripMultiplier *
    profile.cornerConfidence *
    traits.cornerAttack;
  const maxBrakeDecel = 23.5 * surfMu * profile.brakingPrecision;

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
    // Check shortcut entry opportunity cleanly: stage inside asphalt before cutout opens, then cut into mouth inside cutout span
    let shortcutApproach: { sc: BuiltTrack['shortcuts'][number]; inCutout: boolean } | null = null;
    if (track.shortcuts.length > 0 && traits.shortcutAffinity * (0.65 + brain.skill * 0.5) > 0.32) {
      for (let i = 0; i < track.shortcuts.length; i++) {
        const sc = track.shortcuts[i];
        const cutSpan = (sc.entryCutEndIdx - sc.entryCutStartIdx + nSamples) % nSamples;
        const sinceCutStart = (ai.trackIdx - sc.entryCutStartIdx + nSamples) % nSamples;
        const ahead = (sc.entryCutStartIdx - ai.trackIdx + nSamples) % nSamples;
        if (sinceCutStart <= cutSpan) {
          shortcutApproach = { sc, inCutout: true };
          aimingShortcut = true;
          brain.actionTag = 'SHORTCUT';
          break;
        } else if (ahead <= 30) {
          shortcutApproach = { sc, inCutout: false };
          brain.actionTag = 'SHORTCUT';
          break;
        }
      }
    }

    const sNow = samples[ai.trackIdx];
    const sNear = samples[(ai.trackIdx + 6) % nSamples];
    const sMid = samples[(ai.trackIdx + 14) % nSamples];
    const sFar = samples[(ai.trackIdx + 24) % nSamples];

    // Dense near + mid + far curvature scan so double hairpins & switchbacks brake early and accurately
    const scanWindows = [2, 4, 6, 9, 13, 18, 24, 32, 42, 54];
    for (let w = 0; w < scanWindows.length; w++) {
      const offset = scanWindows[w];
      const pA = samples[(ai.trackIdx + Math.max(0, offset - 6)) % nSamples].point;
      const pB = samples[(ai.trackIdx + offset) % nSamples].point;
      const pC = samples[(ai.trackIdx + offset + 6) % nSamples].point;
      const kCurv = circumcircleCurvatureXZ(pA.x, pA.z, pB.x, pB.z, pC.x, pC.z);

      const tA = samples[(ai.trackIdx + Math.max(0, offset - 3)) % nSamples].point;
      const tC = samples[(ai.trackIdx + offset + 3) % nSamples].point;
      const kTight = circumcircleCurvatureXZ(tA.x, tA.z, pB.x, pB.z, tC.x, tC.z);
      const effCurv = Math.max(kCurv, kTight * 0.94);

      const rCurve = effCurv > 0.0014 ? Math.max(12, 1 / effCurv) : 999;
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

    if (shortcutApproach && shortcutApproach.inCutout) {
      const sc = shortcutApproach.sc;
      ai.laneTarget = sc.side * (track.roadHalfWidth + 1.8);
      brain.smoothedLane = THREE.MathUtils.damp(brain.smoothedLane, ai.laneTarget, 9.0, rawFixedDt);
      const entryPtIdx = Math.min(sc.points.length - 1, Math.max(4, Math.floor(sc.points.length * 0.12)));
      targetX = sc.points[entryPtIdx].x;
      targetZ = sc.points[entryPtIdx].z;

      brain.debugPoints[0].x = ai.pos.x;
      brain.debugPoints[0].y = ai.pos.y + 0.55;
      brain.debugPoints[0].z = ai.pos.z;
      for (let k = 1; k <= 5; k++) {
        const ptIdx = Math.min(sc.points.length - 1, k * 2);
        brain.debugPoints[k].x = sc.points[ptIdx].x;
        brain.debugPoints[k].y = sc.points[ptIdx].y + 0.55;
        brain.debugPoints[k].z = sc.points[ptIdx].z;
      }
    } else {
      const usableHalf = Math.max(3.6, track.roadHalfWidth - 1.9);
      const dirRightNear = sNear.tangent.x * sNow.right.x + sNear.tangent.z * sNow.right.z;
      const dirRightMid = sMid.tangent.x * sNow.right.x + sMid.tangent.z * sNow.right.z;
      const dirRightFar = sFar.tangent.x * sMid.right.x + sFar.tangent.z * sMid.right.z;

      let idealLane = 0;
      if (shortcutApproach && !shortcutApproach.inCutout) {
        // Stage on the shortcut side of the asphalt without scraping upstream barriers
        idealLane = shortcutApproach.sc.side * Math.max(2.5, track.roadHalfWidth - 1.5);
        brain.actionTag = 'SHORTCUT';
      } else if (Math.abs(dirRightNear) > 0.075 || Math.abs(dirRightMid) > 0.11) {
        // Clip inside apex cleanly while staying off wall curbs
        const apexDir = Math.abs(dirRightNear) >= Math.abs(dirRightMid) ? dirRightNear : dirRightMid;
        idealLane = THREE.MathUtils.clamp(apexDir * usableHalf * 2.8, -usableHalf * 0.62, usableHalf * 0.62);
        brain.actionTag = 'APEX';
      } else if (Math.abs(dirRightFar) > 0.085) {
        // Outside setup before corner entry
        idealLane = THREE.MathUtils.clamp(-dirRightFar * usableHalf * 2.2, -usableHalf * 0.68, usableHalf * 0.68);
        brain.actionTag = 'SETUP';
      } else {
        idealLane = 0;
        brain.actionTag = 'CRUISE';
      }

      // Apply line-drift mistake offset if triggered on this corner
      if (brain.mistakeTimer > 0 && brain.mistakeKind === 'line_drift') {
        idealLane = THREE.MathUtils.clamp(
          idealLane + brain.mistakeSteerBias * 14,
          -usableHalf * 0.84,
          usableHalf * 0.84,
        );
      }

      // 2. AI Races Every Rival (Player + Other AI Opponents): Slipstream, Overtake & Defend
      if (!shortcutApproach && allRacers.length > 1) {
        let closestAhead: AiRacerView | null = null;
        let closestAheadDist = Infinity;
        let closestBehind: AiRacerView | null = null;
        let closestBehindDist = Infinity;

        for (let i = 0; i < allRacers.length; i++) {
          const other = allRacers[i];
          if (other.id === ai.id || other.finished || other.knockedOut || other.busted) continue;
          const distM = (other.totalProgress - ai.totalProgress) * track.totalLength;
          if (distM > 3.5 && distM < 44 && distM < closestAheadDist) {
            closestAheadDist = distM;
            closestAhead = other;
          } else if (distM < -2.5 && distM > -18 && -distM < closestBehindDist) {
            closestBehindDist = -distM;
            closestBehind = other;
          }
        }

        if (closestAhead) {
          const oInfo = track.getClosestTrackInfo(
            closestAhead.pos.x,
            closestAhead.pos.z,
            closestAhead.trackIdx,
            closestAhead.pos.y,
          );
          const relClosing = ai.forwardSpeed - closestAhead.forwardSpeed;
          if (closestAheadDist > 17 && relClosing < 7.5 && Math.abs(dirRightNear) < 0.10) {
            idealLane = THREE.MathUtils.clamp(oInfo.lateralOffset, -usableHalf * 0.70, usableHalf * 0.70);
            brain.actionTag = 'DRAFT';
          } else if (closestAheadDist <= 17 || relClosing >= 7.5) {
            const leftRoom = usableHalf + oInfo.lateralOffset;
            const rightRoom = usableHalf - oInfo.lateralOffset;
            const passSide = rightRoom >= leftRoom ? 1 : -1;
            idealLane = THREE.MathUtils.clamp(
              oInfo.lateralOffset + passSide * 4.1,
              -usableHalf * 0.84,
              usableHalf * 0.84,
            );
            brain.actionTag = 'PASS';
          }
        } else if (
          closestBehind &&
          aiSettings.aggression > 0.25 &&
          Math.abs(dirRightNear) < 0.10
        ) {
          const blockStrength = traits.blockTendency * aiSettings.aggression;
          if (blockStrength > 0.35) {
            const bInfo = track.getClosestTrackInfo(
              closestBehind.pos.x,
              closestBehind.pos.z,
              closestBehind.trackIdx,
              closestBehind.pos.y,
            );
            idealLane = THREE.MathUtils.lerp(
              idealLane,
              THREE.MathUtils.clamp(bInfo.lateralOffset, -usableHalf * 0.62, usableHalf * 0.62),
              blockStrength * 0.62,
            );
            brain.actionTag = 'DEFEND';
          }
        }
      }

      // 3. Track-Frame Multi-Candidate Simultaneous Lane Scoring (Zero-GC, curvature & yaw invariant)
      const horizonDist = Math.max(26, absSpeed * 1.15);
      let threatCount = 0;

      const pushThreat = (wx: number, wz: number, fwdD: number, clearRad: number, weight: number) => {
        if (threatCount >= MAX_AI_THREATS) return;
        const obsIdx = (ai.trackIdx + Math.max(0, Math.round(fwdD / segLen))) % nSamples;
        const os = samples[obsIdx];
        const obsLat = (wx - os.point.x) * os.right.x + (wz - os.point.z) * os.right.z;
        _threatLat[threatCount] = obsLat;
        _threatClearRad[threatCount] = clearRad;
        _threatCostScale[threatCount] = weight / Math.max(4, fwdD);
        threatCount++;
      };

      for (let i = 0; i < traffic.length; i++) {
        const tr = traffic[i];
        const dx = tr.pos.x - ai.pos.x;
        const dz = tr.pos.z - ai.pos.z;
        const fwdD = dx * aiFwdX + dz * aiFwdZ;
        if (fwdD > 0.5 && fwdD < horizonDist && Math.abs(dx * aiRightX + dz * aiRightZ) < track.roadHalfWidth) {
          pushThreat(tr.pos.x, tr.pos.z, fwdD, tr.isTruck ? 3.8 : 3.2, 160);
        }
      }
      for (let i = 0; i < cops.length; i++) {
        const cp = cops[i];
        if (cp.wrecked) continue;
        const dx = cp.pos.x - ai.pos.x;
        const dz = cp.pos.z - ai.pos.z;
        const fwdD = dx * aiFwdX + dz * aiFwdZ;
        if (fwdD > 0.5 && fwdD < (cp.isRoadblock ? 60 : 34) && Math.abs(dx * aiRightX + dz * aiRightZ) < track.roadHalfWidth) {
          pushThreat(cp.pos.x, cp.pos.z, fwdD, cp.isRoadblock ? 4.4 : 3.5, 190);
        }
      }
      for (let i = 0; i < spikeStrips.length; i++) {
        const sp = spikeStrips[i];
        if (sp.hit) continue;
        const dx = sp.pos.x - ai.pos.x;
        const dz = sp.pos.z - ai.pos.z;
        const fwdD = dx * aiFwdX + dz * aiFwdZ;
        if (fwdD > 0.5 && fwdD < 44 && Math.abs(dx * aiRightX + dz * aiRightZ) < track.roadHalfWidth) {
          pushThreat(sp.pos.x, sp.pos.z, fwdD, 3.6, 220);
        }
      }
      for (let i = 0; i < allRacers.length; i++) {
        const other = allRacers[i];
        if (other.id === ai.id || other.knockedOut || other.finished) continue;
        const dx = other.pos.x - ai.pos.x;
        const dz = other.pos.z - ai.pos.z;
        const fwdD = dx * aiFwdX + dz * aiFwdZ;
        if (fwdD > -1 && fwdD < 15 && Math.abs(dx * aiRightX + dz * aiRightZ) < 6.5) {
          pushThreat(other.pos.x, other.pos.z, Math.max(1, fwdD), 2.9, 110);
        }
      }

      if (threatCount > 0) {
        let bestLane = idealLane;
        let bestCost = Infinity;
        for (let ci = 0; ci < CANDIDATE_LANE_FRACS.length; ci++) {
          const candLane = CANDIDATE_LANE_FRACS[ci] * usableHalf;
          const laneShift = candLane - info.lateralOffset;
          let cost = Math.abs(candLane - idealLane) * 0.45 + Math.abs(laneShift) * 0.18;

          for (let ti = 0; ti < threatCount; ti++) {
            const clearRad = _threatClearRad[ti];
            const distFromObs = Math.abs(_threatLat[ti] - candLane);
            if (distFromObs < clearRad) {
              cost += ((clearRad - distFromObs) / clearRad) * _threatCostScale[ti];
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

      // Wall-Escape Guard: never hug/pin into outer barriers outside an open shortcut cutout
      if (Math.abs(info.lateralOffset) > track.roadHalfWidth - 0.85) {
        const wallSign = Math.sign(info.lateralOffset);
        idealLane = THREE.MathUtils.clamp(-wallSign * usableHalf * 0.45, -usableHalf * 0.65, usableHalf * 0.65);
        if (brain.mistakeSteerBias * wallSign > 0) {
          brain.mistakeSteerBias = 0;
        }
      }

      ai.laneTarget = idealLane;

      brain.smoothedLane = THREE.MathUtils.damp(
        brain.smoothedLane,
        ai.laneTarget,
        shortcutApproach ? 7.8 : 5.4 + aiSettings.aggression * 1.6,
        rawFixedDt,
      );

      // Shorten lookahead dynamically in consecutive hairpins/switchbacks so bots slice apex cleanly
      const isTightSwitchback = minFutureRadius < 65 || curvatureNear > 0.14;
      const lookOffsetSamples = isTightSwitchback
        ? THREE.MathUtils.clamp(Math.round(2.5 + absSpeed * 0.055), 2, 8)
        : THREE.MathUtils.clamp(Math.round(4 + absSpeed * 0.10), 4, 12);
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
  }

  // 4. Skill-Based Pace + Smooth Bounded Rubber Banding + Race Flow + Hard Top-Speed Cap
  const targetRubber = computeRubberBandTargetMultiplier(gapMeters, difficulty, aiSettings.rubberBanding);
  brain.rubberMult = THREE.MathUtils.damp(
    brain.rubberMult,
    targetRubber,
    AI_TUNING_CONFIG.RUBBER_LERP_RATE,
    rawFixedDt,
  );
  brain.adaptiveMult = brain.rubberMult;

  const baseTargetPace = computeTargetPaceFromSkill(difficulty, brain.skill);
  const startFlowBonus =
    raceElapsedSec < AI_TUNING_CONFIG.RACE_FLOW.startBoostDurationSec &&
    ai.totalProgress < AI_TUNING_CONFIG.RACE_FLOW.startBoostProgressEnd
      ? AI_TUNING_CONFIG.RACE_FLOW.startPaceBonus
      : 0;
  const finalLapBonus = isFinalLap ? AI_TUNING_CONFIG.RACE_FLOW.finalLapPaceBonus : 0;

  const playerTopSpeedMs =
    computeEffectiveStats(player.spec, playerConfig ?? brain.simConfig).topSpeedKmh / 3.6;
  const hardTopCapMs = playerTopSpeedMs * AI_TUNING_CONFIG.MAX_TOP_SPEED_OVER_PLAYER_RATIO;

  const rawPaceMult =
    (baseTargetPace + traits.paceOffset + startFlowBonus + finalLapBonus) *
    brain.lapRandomMult *
    aiSettings.pace *
    brain.rubberMult *
    (ai.copSlowdownTimer > 0 ? 0.86 : 1.0);
  const rawTargetBaseMs = (stats.topSpeedKmh / 3.6) * rawPaceMult;
  const baseMaxMs = Math.min(rawTargetBaseMs, hardTopCapMs);

  // 5. Kinematic Corner Speed Budget + Drafting + Tactical Exit NOS + Skill-Based Mistakes
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
    (gapMeters > 10 || drafting || brain.personality === 'aggressive' || isFinalLap)
  ) {
    if (Math.random() < profile.nosUsageBias * (0.72 + aiSettings.aggression * 0.65) * rawFixedDt * 4.2) {
      brain.nosBurstTimer = 1.4 + Math.random() * 1.0;
    }
  }
  const nosActive = brain.nosBurstTimer > 0 && brain.nitrous > 2;
  if (nosActive) {
    brain.nitrous = Math.max(0, brain.nitrous - rawFixedDt * 17);
    if (brain.actionTag !== 'PASS' && brain.actionTag !== 'DRAFT') {
      brain.actionTag = 'NOS';
    }
  } else {
    brain.nitrous = Math.min(100, brain.nitrous + rawFixedDt * (5.0 + (drafting ? 8.5 : 0)));
  }

  // Skill-driven corner mistakes: late braking, drifting off racing line, or slow corner exit
  const mistakeCfg = AI_TUNING_CONFIG.MISTAKE_RATES;
  const skillMistakeProb = THREE.MathUtils.lerp(
    mistakeCfg.maxFreqAtZeroSkill,
    mistakeCfg.minFreqAtMaxSkill,
    THREE.MathUtils.clamp(brain.skill, 0, 1),
  );
  const effectiveMistakeProb = THREE.MathUtils.clamp(
    skillMistakeProb *
      traits.mistakeMult *
      aiSettings.mistakeRate *
      (isFinalLap ? AI_TUNING_CONFIG.RACE_FLOW.finalLapMistakeScale : 1.0),
    0,
    0.95,
  );

  if (brain.mistakeTimer > 0) {
    brain.mistakeTimer = Math.max(0, brain.mistakeTimer - rawFixedDt);
    if (brain.mistakeTimer <= 0) {
      brain.mistakeKind = 'none';
      brain.mistakeExitThrottle = 1.0;
      brain.mistakeSteerBias = 0;
    } else {
      brain.actionTag = 'SLIP';
    }
  } else {
    brain.mistakeKind = 'none';
    brain.mistakeExitThrottle = 1.0;
    brain.mistakeCooldown = Math.max(0, brain.mistakeCooldown - rawFixedDt);
    if (
      brain.mistakeCooldown <= 0 &&
      effectiveMistakeProb > 0.02 &&
      (curvatureNear > 0.14 || curvatureMid > 0.18) &&
      absSpeed > 32
    ) {
      brain.mistakeCooldown =
        mistakeCfg.cooldownMinSec +
        Math.random() * (mistakeCfg.cooldownMaxSec - mistakeCfg.cooldownMinSec);
      if (Math.random() < effectiveMistakeProb) {
        brain.mistakeCount++;
        brain.mistakeTimer =
          mistakeCfg.durationMinSec +
          Math.random() * (mistakeCfg.durationMaxSec - mistakeCfg.durationMinSec);
        const kindRoll = Math.random();
        const dirSign = Math.random() > 0.5 ? 1 : -1;
        if (kindRoll < 0.36) {
          brain.mistakeKind = 'late_brake';
          brain.mistakeSteerBias = dirSign * 0.13;
        } else if (kindRoll < 0.72) {
          brain.mistakeKind = 'line_drift';
          brain.mistakeSteerBias = dirSign * (mistakeCfg.lineDriftOffsetM / 14);
        } else {
          brain.mistakeKind = 'slow_exit';
          brain.mistakeExitThrottle = mistakeCfg.slowExitThrottle;
          brain.mistakeSteerBias = 0;
        }
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

  const steerMistake =
    brain.mistakeTimer > 0 && brain.mistakeKind === 'late_brake' ? brain.mistakeSteerBias : 0;
  let steerGain = THREE.MathUtils.clamp(angleDiff * 2.85 + steerMistake, -1, 1);
  ai.steerAngle = THREE.MathUtils.damp(ai.steerAngle, steerGain * 0.50, 24, rawFixedDt);

  const lateBrakeBias =
    brain.mistakeTimer > 0 && brain.mistakeKind === 'late_brake' ? 1.15 : 1.0;
  const safeCornerMs = computeAiCornerSafeSpeedMs(
    minFutureRadius,
    horizonBrakeCapMs,
    gripBudget,
    angleDiff,
    traits.brakeBias * lateBrakeBias,
  );
  const shortcutEntryCapMs = aimingShortcut ? 62 : 999;

  const nosHeadroomMs = Math.min(nosActive ? baseMaxMs * 1.1 : baseMaxMs, hardTopCapMs);
  const targetSpeedMs = Math.min(nosHeadroomMs, safeCornerMs, shortcutEntryCapMs);
  brain.targetSpeedMs = targetSpeedMs;

  const speedErr = targetSpeedMs - ai.forwardSpeed;
  let throttleInput = true;
  let brakeInput = false;
  let throttleAxis = 1.0;
  let brakeAxis = 0.0;

  const needTurnRotationBrake = Math.abs(angleDiff) > 0.72 && absSpeed > 26;
  if (brain.reverseRecoveryTimer > 0) {
    throttleInput = false;
    brakeInput = true;
    brakeAxis = 0.95;
    const wallSide = Math.abs(info.lateralOffset) > track.roadHalfWidth * 0.55 ? Math.sign(info.lateralOffset) : 0;
    steerGain =
      wallSide !== 0
        ? ai.forwardSpeed < -0.2
          ? -wallSide
          : wallSide
        : -Math.sign(angleDiff || 1);
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
    const baseThrottle = THREE.MathUtils.clamp(speedErr / 4.2 + 0.85, 0.62, 1.0);
    throttleAxis = baseThrottle * (brain.mistakeTimer > 0 ? brain.mistakeExitThrottle : 1.0);
  }
  const handbrakeInput =
    !inShortcut &&
    brain.reverseRecoveryTimer <= 0 &&
    Math.abs(angleDiff) > 0.98 &&
    absSpeed > 28 &&
    curvatureNear > 0.22;

  brain.braking = brakeInput || handbrakeInput;
  brain.nosActive = nosActive;

  // Hard cap: AI top forward speed NEVER exceeds player top speed by > 4%
  const maxForwardMs = Math.min(
    nosActive ? baseMaxMs * 1.08 : drafting ? baseMaxMs * 1.04 : baseMaxMs,
    hardTopCapMs,
  );

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
  sIn.accelStat = Math.min(100, stats.accel * (0.9 + baseTargetPace * 0.12) * aiSettings.pace);
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
