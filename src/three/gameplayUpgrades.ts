import type { EaTraxEntry } from '../audio/musicEngine';
import type { CarSpec, EngineSoundProfile } from '../types/game';

export interface RampLaunchInput {
  forwardSpeedMs: number;
  launchAngleRad: number;
  nosActive: boolean;
}

export interface PatrolTriggerInput {
  speedKmh: number;
  distSq: number;
  detectRadiusM: number;
  speedTriggerKmh: number;
  bumped: boolean;
  recklessTrigger?: boolean;
}

export interface TrafficSpawnSlot {
  trackIdx: number;
  laneOffset: number;
  isTruck: boolean;
  specIndex: number;
  paintHex: string;
  cruiseSpeedMs: number;
}

export const TRAFFIC_PAINT_PALETTE = [
  '#E2E8F0',
  '#94A3B8',
  '#334155',
  '#1E293B',
  '#1E3A8A',
  '#2563EB',
  '#065F46',
  '#991B1B',
  '#D97706',
  '#78350F',
  '#475569',
  '#F8FAFC',
] as const;

export const POLICE_PATROL_DETECT_RADIUS_M = 105;
export const POLICE_PATROL_SPEED_TRIGGER_KMH = 95;
export const POLICE_PATROL_EASY_SPEED_TRIGGER_KMH = 105;

/**
 * Concave stunt-ramp elevation profile so cars transition smoothly onto the kicker lip
 * and catch high upward trajectory off the tip.
 */
export function computeRampDeckHeight(alongM: number, lengthM: number, heightM: number): number {
  if (lengthM <= 0 || alongM <= 0) return 0;
  const t = Math.min(1, Math.max(0, alongM / lengthM));
  // Smooth concave parabola blending linear slope + quadratic kicker lip
  return (t * 0.42 + t * t * 0.58) * heightM;
}

/**
 * Computes controlled arcade vertical launch velocity when hitting a ramp lip.
 * Produces a snappy, weighty ~0.40s to 0.64s arc (~2.1m-3.25m peak height) that lands inside the road.
 */
export function computeRampLaunchVerticalVel({
  forwardSpeedMs,
  launchAngleRad,
  nosActive,
}: RampLaunchInput): number {
  const safeSpeed = Math.max(0, forwardSpeedMs);
  const slopeImpulse = safeSpeed * Math.sin(launchAngleRad) * 0.70;
  const lipKick = safeSpeed * 0.032 + (nosActive ? 1.1 : 0.45);
  return Math.min(9.85, Math.max(5.45, slopeImpulse + lipKick));
}

/**
 * Firm downward gravity scaling so cars track a planted, weighty parabolic trajectory onto the landing pad.
 */
export function computeAirGravityScale(forwardSpeedMs: number, nosActive: boolean): number {
  const speedRatio = Math.min(1, Math.max(0, forwardSpeedMs) / 90);
  const nosLift = nosActive ? 0.03 : 0;
  return Math.max(0.86, 0.95 - speedRatio * 0.06 - nosLift);
}

/**
 * Computes suspension bottom-out jounce impulse on touchdown from vertical velocity.
 */
export function computeLandingJounceVel(verticalVelMps: number): number {
  return Math.min(9.5, Math.max(2.2, Math.abs(verticalVelMps) * 0.68));
}

/**
 * Easy-to-trigger patrol pursuit detection:
 * triggers on nearby speeding (>= 95 km/h within 105m), ramming a cruiser,
 * or reckless street infractions (traffic crash, smashing props, speed traps).
 */
export function evaluatePatrolPursuitTrigger({
  speedKmh,
  distSq,
  detectRadiusM,
  speedTriggerKmh,
  bumped,
  recklessTrigger = false,
}: PatrolTriggerInput): boolean {
  if (bumped) return true;
  const maxDetectSq = detectRadiusM * detectRadiusM;
  if (recklessTrigger && distSq <= maxDetectSq * 2.25) return true;
  return speedKmh >= speedTriggerKmh && distSq <= maxDetectSq;
}

/**
 * Accelerated Heat 1 -> Heat 5 escalation curve so pursuits ramp up quickly into
 * Interceptors, Roadblocks, Rhinos, and Chopper chases.
 */
export function computeEscalatedHeatLevel(sessionBounty: number, maxHeatCap: number): number {
  const rawHeat =
    sessionBounty >= 30000
      ? 5
      : sessionBounty >= 16500
        ? 4
        : sessionBounty >= 7800
          ? 3
          : sessionBounty >= 2800
            ? 2
            : 1;
  return Math.max(1, Math.min(maxHeatCap, rawHeat));
}

/**
 * Generates evenly distributed multi-lane civilian traffic slots around the circuit,
 * keeping the immediate starting grid zone clear so launches never pile up.
 */
export function generateTrafficSpawnSlots(
  count: number,
  totalSamples: number,
  roadHalfWidth: number,
): TrafficSpawnSlot[] {
  const slots: TrafficSpawnSlot[] = [];
  if (count <= 0 || totalSamples < 40) return slots;

  const usableStart = 12;
  const usableEnd = totalSamples - 16;
  const span = Math.max(1, usableEnd - usableStart);
  const maxLane = Math.max(4.4, roadHalfWidth - 1.9);
  const laneFracs = roadHalfWidth >= 12.5
    ? [-0.78, -0.46, -0.16, 0.16, 0.46, 0.78]
    : [-0.72, -0.24, 0.24, 0.72];

  // Deterministic sporty & daily-driver civilian spec indices (cars 0..6 excluding high-end exotics)
  const carSpecIndices = [0, 1, 2, 3, 4, 5];

  for (let i = 0; i < count; i++) {
    const frac = (i + 0.35 + ((i % 3) - 1) * 0.12) / count;
    const rawIdx = Math.floor(usableStart + Math.min(0.995, Math.max(0.005, frac)) * span);
    const trackIdx = ((rawIdx % totalSamples) + totalSamples) % totalSamples;
    const laneStep = (i * 3 + Math.floor(i / 2)) % laneFracs.length;
    const laneOffset = Number((laneFracs[laneStep] * maxLane).toFixed(2));
    const isTruck = i % 5 === 0;
    const specIndex = isTruck ? 1 : carSpecIndices[i % carSpecIndices.length];
    const paintHex = TRAFFIC_PAINT_PALETTE[(i * 5 + 3) % TRAFFIC_PAINT_PALETTE.length];
    const cruiseSpeedMs = isTruck
      ? 14 + (i % 3) * 1.4
      : 18 + (i % 5) * 1.9;

    slots.push({
      trackIdx,
      laneOffset,
      isTruck,
      specIndex,
      paintHex,
      cruiseSpeedMs,
    });
  }

  return slots;
}

/**
 * Verifies every soundtrack entry matches the Nightdrive / Hype Phonk energy profile.
 */
export function isNightdriveOrHypePhonkTrack(entry: EaTraxEntry): boolean {
  const combined = `${entry.title} ${entry.artist} ${entry.genre}`;
  const hasPhonkOrNightdrive = /(phonk|nightdrive|cowbell|drift|wave)/i.test(combined);
  const bannedGenre = /(synthwave|electro breakbeat|liquid drum|drum & bass|neffex)/i.test(combined);
  return hasPhonkOrNightdrive && !bannedGenre && entry.bpm >= 138;
}

export type LaunchGrade = 'perfect' | 'wheelspin' | 'standard';

export interface CountdownLaunchResult {
  grade: LaunchGrade;
  speedBoostMs: number;
  boostDurationSec: number;
  nosBonus: number;
  bountyBonus: number;
  wheelspinParticles: boolean;
  callout: string;
}

/**
 * Evaluates grid launch precision when countdown hits GO.
 * Holding RPM inside the 68%-88% sweet spot yields maximum traction + NOS boost;
 * pinning the rev limiter (> 88%) triggers dramatic wheelspin; below 68% rolls off cleanly.
 */
export function evaluateCountdownLaunch(
  rpm: number,
  throttleHeld: boolean,
  turboLevel: number,
): CountdownLaunchResult {
  const safeTurbo = Math.max(1, Math.min(5, turboLevel));
  if (!throttleHeld) {
    return {
      grade: 'standard',
      speedBoostMs: 0,
      boostDurationSec: 0,
      nosBonus: 0,
      bountyBonus: 0,
      wheelspinParticles: false,
      callout: 'GO!',
    };
  }
  if (rpm >= 0.68 && rpm <= 0.88) {
    return {
      grade: 'perfect',
      speedBoostMs: 17.5 + safeTurbo * 1.15,
      boostDurationSec: 1.35,
      nosBonus: 15,
      bountyBonus: 450,
      wheelspinParticles: false,
      callout: 'PERFECT LAUNCH! +15% NOS · +$450 BOUNTY',
    };
  }
  if (rpm > 0.88) {
    return {
      grade: 'wheelspin',
      speedBoostMs: 13.0 + safeTurbo * 0.9,
      boostDurationSec: 0.9,
      nosBonus: 5,
      bountyBonus: 150,
      wheelspinParticles: true,
      callout: 'WHEELSPIN LAUNCH! +$150 BOUNTY',
    };
  }
  return {
    grade: 'standard',
    speedBoostMs: 6.5 + safeTurbo * 0.5,
    boostDurationSec: 0.35,
    nosBonus: 0,
    bountyBonus: 0,
    wheelspinParticles: false,
    callout: 'CLEAN LAUNCH! GO!',
  };
}

export interface SlipstreamSlingshotState {
  charge: number; // 0..1
  boostTimer: number;
  cooldownTimer: number;
}

export function createSlipstreamSlingshotState(): SlipstreamSlingshotState {
  return { charge: 0, boostTimer: 0, cooldownTimer: 0 };
}

export interface SlipstreamSlingshotStep {
  triggered: boolean;
  nosBonus: number;
  bountyBonus: number;
  speedKickMs: number;
}

/**
 * Advances aerodynamic slipstream slingshot charge while drafting behind rivals or traffic.
 * Reaching 100% charge fires an automatic Slingshot overtake surge.
 */
export function stepSlipstreamSlingshot(
  state: SlipstreamSlingshotState,
  drafting: boolean,
  forwardSpeedMs: number,
  dt: number,
): SlipstreamSlingshotStep {
  const stepDt = Math.max(0, dt);
  if (state.boostTimer > 0) {
    state.boostTimer = Math.max(0, state.boostTimer - stepDt);
  }
  if (state.cooldownTimer > 0) {
    state.cooldownTimer = Math.max(0, state.cooldownTimer - stepDt);
  }

  if (drafting && forwardSpeedMs >= 26 && state.boostTimer <= 0 && state.cooldownTimer <= 0) {
    state.charge = Math.min(1, state.charge + stepDt * 0.88);
    if (state.charge >= 1) {
      state.charge = 0;
      state.boostTimer = 1.45;
      state.cooldownTimer = 2.0;
      return {
        triggered: true,
        nosBonus: 12,
        bountyBonus: 500,
        speedKickMs: 11.5,
      };
    }
  } else if (state.boostTimer <= 0) {
    state.charge = Math.max(0, state.charge - stepDt * 0.55);
  }

  return {
    triggered: false,
    nosBonus: 0,
    bountyBonus: 0,
    speedKickMs: 0,
  };
}

export type StyleComboEventType =
  | 'near_miss'
  | 'drift_exit'
  | 'mega_air'
  | 'smash'
  | 'shortcut'
  | 'roadblock'
  | 'takedown';

export interface StyleComboState {
  multiplier: number; // 1..5
  streak: number;
  points: number;
  timerSec: number;
  maxTimerSec: number;
}

export function createStyleComboState(): StyleComboState {
  return {
    multiplier: 1,
    streak: 0,
    points: 0,
    timerSec: 0,
    maxTimerSec: 5.5,
  };
}

export interface StyleComboStepResult {
  bountyAwarded: number;
  milestoneMult: number | null;
  expired: boolean;
}

const STYLE_EVENT_POINTS: Record<StyleComboEventType, { stylePts: number; baseBounty: number; streakWeight: number }> = {
  near_miss: { stylePts: 350, baseBounty: 350, streakWeight: 1 },
  drift_exit: { stylePts: 450, baseBounty: 300, streakWeight: 1 },
  mega_air: { stylePts: 700, baseBounty: 650, streakWeight: 2 },
  smash: { stylePts: 250, baseBounty: 300, streakWeight: 1 },
  shortcut: { stylePts: 800, baseBounty: 1500, streakWeight: 2 },
  roadblock: { stylePts: 900, baseBounty: 1500, streakWeight: 2 },
  takedown: { stylePts: 1200, baseBounty: 2500, streakWeight: 2 },
};

/**
 * Unified Street Style Combo state machine linking drifts, near-misses, stunts, shortcuts, and takedowns.
 */
export function stepStyleComboState(
  state: StyleComboState,
  event: StyleComboEventType | null,
  dt: number,
  customBaseBounty?: number,
): StyleComboStepResult {
  const stepDt = Math.max(0, dt);
  if (event) {
    const spec = STYLE_EVENT_POINTS[event];
    const prevMult = state.multiplier;
    state.streak += spec.streakWeight;
    state.multiplier = Math.min(5, 1 + Math.floor(state.streak / 2));
    state.points += spec.stylePts * state.multiplier;
    state.timerSec = state.maxTimerSec;
    const baseBounty = customBaseBounty ?? spec.baseBounty;
    return {
      bountyAwarded: Math.round(baseBounty * state.multiplier),
      milestoneMult: state.multiplier > prevMult ? state.multiplier : null,
      expired: false,
    };
  }

  if (state.timerSec > 0) {
    state.timerSec = Math.max(0, state.timerSec - stepDt);
    if (state.timerSec === 0) {
      state.multiplier = 1;
      state.streak = 0;
      state.points = 0;
      return { bountyAwarded: 0, milestoneMult: null, expired: true };
    }
  }

  return { bountyAwarded: 0, milestoneMult: null, expired: false };
}

export interface RedlineShiftZoneInfo {
  inRedline: boolean;
  shiftNow: boolean;
  ledCount: number; // 0..6
}

/**
 * Drives sequential 6-LED tachometer shift strip and redline shift cue.
 */
export function computeRedlineShiftZone(rpm: number, gear: number): RedlineShiftZoneInfo {
  const safeRpm = Number.isFinite(rpm) ? Math.max(0, Math.min(1, rpm)) : 0;
  const ledCount = Math.max(0, Math.min(6, Math.round(Math.max(0, (safeRpm - 0.58) / 0.36) * 6)));
  return {
    inRedline: safeRpm >= 0.85,
    shiftNow: safeRpm >= 0.88 && gear >= 1 && gear < 6,
    ledCount,
  };
}

export type ConcreteEngineSoundProfile = Exclude<EngineSoundProfile, 'auto'>;

export interface EngineSoundProfileMeta {
  id: ConcreteEngineSoundProfile;
  label: string;
  shortLabel: string;
  tagline: string;
  hasTurbo: boolean;
  isElectric: boolean;
}

export const ENGINE_SOUND_PROFILES: EngineSoundProfileMeta[] = [
  {
    id: 'i4_turbo',
    label: '2.0L Turbo Inline-4',
    shortLabel: 'I4 Turbo',
    tagline: 'Crisp spool & anti-lag rally flutter',
    hasTurbo: true,
    isElectric: false,
  },
  {
    id: 'v6_twin_turbo',
    label: '3.0L Twin-Turbo I6/V6',
    shortLabel: 'V6/I6 TT',
    tagline: 'Smooth twin-scroll boost & 2JZ howl',
    hasTurbo: true,
    isElectric: false,
  },
  {
    id: 'v8_muscle',
    label: '6.2L Cammed V8',
    shortLabel: 'V8 Muscle',
    tagline: 'Deep cross-plane chop & thunderous bark',
    hasTurbo: false,
    isElectric: false,
  },
  {
    id: 'v10_screamer',
    label: '5.2L V10 Screamer',
    shortLabel: 'V10 F1',
    tagline: 'Razor-sharp odd-fire supercar wail',
    hasTurbo: false,
    isElectric: false,
  },
  {
    id: 'v12_hyper',
    label: '6.5L V12 Hyper',
    shortLabel: 'V12 Hyper',
    tagline: 'Sky-high 9500 RPM Le Mans crescendo',
    hasTurbo: false,
    isElectric: false,
  },
  {
    id: 'rotary_brap',
    label: 'Twin-Rotor 13B Brap',
    shortLabel: 'Rotary 13B',
    tagline: 'Bridgeport idle chop & high-RPM buzz',
    hasTurbo: true,
    isElectric: false,
  },
  {
    id: 'flat6_gt',
    label: '4.0L Flat-6 GT3',
    shortLabel: 'Flat-6 GT',
    tagline: 'Metallic boxer bark & dry-sump rasp',
    hasTurbo: false,
    isElectric: false,
  },
  {
    id: 'electric_whine',
    label: 'Tri-Motor EV Hyper',
    shortLabel: 'EV Turbine',
    tagline: 'Silent exhaust with pure inverter sweep',
    hasTurbo: false,
    isElectric: true,
  },
];

export const CAR_AUTO_ENGINE_PROFILES: Record<string, ConcreteEngineSoundProfile> = {
  cobalt_gt: 'i4_turbo',
  golf_gti: 'i4_turbo',
  silvia_s15: 'i4_turbo',
  rx7_fd3s: 'rotary_brap',
  suprafd_mk4: 'v6_twin_turbo',
  m4_gts: 'v6_twin_turbo',
  apex_evo: 'i4_turbo',
  nissan_350z: 'v6_twin_turbo',
  skyline_r34: 'v6_twin_turbo',
  vipera_gts: 'v10_screamer',
  corvette_c6r: 'v8_muscle',
  gallardo_sv: 'v10_screamer',
  carrera_gtx: 'v12_hyper',
  boss_15_brz: 'flat6_gt',
  boss_14_wrx: 'i4_turbo',
  boss_13_370z: 'v6_twin_turbo',
  boss_12_rs4: 'v6_twin_turbo',
  boss_11_nsx: 'flat6_gt',
  boss_10_gti: 'i4_turbo',
  boss_9_taz: 'v6_twin_turbo',
  boss_8_vic: 'v6_twin_turbo',
  boss_7_izzy: 'rotary_brap',
  boss_6_jade: 'v8_muscle',
  boss_5_baron: 'flat6_gt',
  boss_4_earl: 'i4_turbo',
  boss_3_ming: 'v10_screamer',
  boss_2_bull: 'v8_muscle',
  m3_gtr: 'v8_muscle',
};

export function resolveCarEngineProfile(
  carId?: string,
  bodyStyle?: CarSpec['bodyStyle'],
  override?: EngineSoundProfile,
): ConcreteEngineSoundProfile {
  if (override && override !== 'auto') {
    return override;
  }
  if (carId && CAR_AUTO_ENGINE_PROFILES[carId]) {
    return CAR_AUTO_ENGINE_PROFILES[carId];
  }
  switch (bodyStyle) {
    case 'muscle':
      return 'v8_muscle';
    case 'gtr':
      return 'v6_twin_turbo';
    case 'exotic':
      return 'v10_screamer';
    case 'sedan':
    case 'coupe':
    default:
      return 'i4_turbo';
  }
}

/**
 * Checks whether circular sample index `idx` lies within `[cutStartIdx, cutEndIdx]`
 * (handles track wraparound around sample 0 cleanly).
 */
export function isSampleInsideBarrierCutout(
  idx: number,
  cutStartIdx: number,
  cutEndIdx: number,
  totalSamples: number,
): boolean {
  if (totalSamples <= 0) return false;
  const nIdx = ((idx % totalSamples) + totalSamples) % totalSamples;
  const nStart = ((cutStartIdx % totalSamples) + totalSamples) % totalSamples;
  const nEnd = ((cutEndIdx % totalSamples) + totalSamples) % totalSamples;
  if (nStart <= nEnd) {
    return nIdx >= nStart && nIdx <= nEnd;
  }
  return nIdx >= nStart || nIdx <= nEnd;
}

export interface MenuDynoState {
  speedKmh: number;
  peakSpeedKmh: number;
  topTargetKmh: number;
  accelStat: number;
  nitroStat: number;
  rpm: number;
  gear: number;
  elapsedPullSec: number;
  zeroTo100Sec: number | null;
  zeroTo200Sec: number | null;
  pullStarted: boolean;
}

export function createMenuDynoState(
  topTargetKmh: number,
  accelStat: number,
  nitroStat: number,
): MenuDynoState {
  return {
    speedKmh: 0,
    peakSpeedKmh: 0,
    topTargetKmh: Math.max(180, topTargetKmh),
    accelStat: Math.max(40, Math.min(100, accelStat)),
    nitroStat: Math.max(40, Math.min(100, nitroStat)),
    rpm: 0.2,
    gear: 1,
    elapsedPullSec: 0,
    zeroTo100Sec: null,
    zeroTo200Sec: null,
    pullStarted: false,
  };
}

const DYNO_GEAR_CAPS = [0, 0.23, 0.40, 0.57, 0.74, 0.90, 1.14];

export interface MenuDynoStepResult {
  upshifted: boolean;
  downshifted: boolean;
}

export function stepMenuDynoRun(
  state: MenuDynoState,
  dt: number,
  gasHeld: boolean,
  autoPull: boolean,
  nosHeld: boolean,
): MenuDynoStepResult {
  const safeDt = Math.max(0, Math.min(0.1, dt));
  const prevGear = state.gear;
  const accelerating = gasHeld || autoPull;
  const effectiveTopKmh = nosHeld ? state.topTargetKmh * 1.12 : state.topTargetKmh;

  if (accelerating) {
    if (!state.pullStarted) {
      state.pullStarted = true;
      state.elapsedPullSec = 0;
    }
    state.elapsedPullSec += safeDt;
    const speedFrac = Math.min(1, state.speedKmh / Math.max(1, effectiveTopKmh));
    // Strong launch punch tapering naturally into aero drag top-speed equilibrium
    const accelScale = (0.62 + (state.accelStat / 100) * 0.78) * (nosHeld ? 1.24 + (state.nitroStat / 100) * 0.14 : 1.0);
    const dragFactor = Math.max(0.035, 1.0 - Math.pow(speedFrac, 1.45));
    const gainRate = (effectiveTopKmh * 0.42) * accelScale * dragFactor;
    state.speedKmh = Math.min(effectiveTopKmh, state.speedKmh + gainRate * safeDt);
    if (effectiveTopKmh - state.speedKmh < 0.28) {
      state.speedKmh = effectiveTopKmh;
    }
  } else {
    // Engine braking + roller inertia coast-down
    const dragDecel = 14 + state.speedKmh * 0.19;
    state.speedKmh = Math.max(0, state.speedKmh - dragDecel * safeDt);
    if (state.speedKmh <= 0.1) {
      state.speedKmh = 0;
      state.pullStarted = false;
    }
  }

  if (state.speedKmh > state.peakSpeedKmh) {
    state.peakSpeedKmh = state.speedKmh;
  }
  if (state.zeroTo100Sec === null && state.speedKmh >= 100) {
    state.zeroTo100Sec = Number(state.elapsedPullSec.toFixed(2));
  }
  if (state.zeroTo200Sec === null && state.speedKmh >= 200) {
    state.zeroTo200Sec = Number(state.elapsedPullSec.toFixed(2));
  }

  // Compute realistic 6-speed gear & RPM from speed ratio against NA top target
  const naTop = Math.max(180, state.topTargetKmh);
  const ratio = state.speedKmh / naTop;
  let targetGear = 1;
  for (let g = 1; g <= 6; g++) {
    targetGear = g;
    if (ratio <= DYNO_GEAR_CAPS[g]) break;
  }
  state.gear = targetGear;

  const gearFloor = state.gear === 1 ? 0 : DYNO_GEAR_CAPS[state.gear - 1] * 0.82;
  const gearCeil = Math.max(gearFloor + 0.12, DYNO_GEAR_CAPS[state.gear]);
  const span = Math.max(0.05, gearCeil - gearFloor);
  const rawGearFrac = Math.max(0, Math.min(1, (ratio - gearFloor) / span));
  const idleRpm = accelerating ? 0.28 : 0.19;
  const targetRpm = Math.max(idleRpm, Math.min(0.985, 0.24 + rawGearFrac * 0.72 + (nosHeld ? 0.03 : 0)));
  state.rpm += (targetRpm - state.rpm) * Math.min(1, safeDt * 18);

  return {
    upshifted: state.gear > prevGear,
    downshifted: state.gear < prevGear,
  };
}


