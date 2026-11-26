export type HandlingMode = 'arcade' | 'balanced' | 'sim_lite';

export type SurfaceType = 'asphalt' | 'wet_asphalt' | 'gravel' | 'dirt' | 'sand' | 'grass';

export interface AssistSettings {
  tcs: boolean;
  abs: boolean;
  stabilityControl: boolean;
  steerAssist: boolean;
  brakeAssist: boolean;
}

export interface PhysicsTuningParams {
  tireGripMultiplier: number;
  pacejkaStiffness: number;
  pacejkaShape: number;
  suspensionStiffness: number;
  suspensionDamping: number;
  aeroDownforce: number;
  aeroDrag: number;
  weightTransfer: number;
  driftSlipEase: number;
  steerSpeedSensitivity: number;
}

export interface SurfacePhysicsSpec {
  id: SurfaceType;
  label: string;
  gripMultiplier: number;
  rollingResistance: number;
  lateralDamping: number;
  bumpAmplitude: number;
  particleColor: string;
}

export interface TuningSliderDef {
  key: keyof PhysicsTuningParams;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  explanation: string;
}

/** Fixed simulation step: 120 Hz for anti-tunneling collision & stiff suspension stability */
export const FIXED_PHYSICS_DT = 1 / 120;

/** Clamp incoming frame delta so tab switches or hitches never explode physics */
export const MAX_FRAME_DELTA_SEC = 0.036;

/** Hard cap on physics substeps per render frame to prevent CPU spiral-of-death */
export const MAX_PHYSICS_SUBSTEPS = 4;

/** Continuous collision substep displacement threshold (meters) */
export const CONTINUOUS_STEP_DISTANCE_M = 0.45;

/** Heavy downward gravity acceleration (m/s^2) keeping high-speed chassis planted on crests */
export const AIR_GRAVITY_MPS2 = 56.0;

/** Standard gravitational acceleration for normal tire load calculations */
export const STANDARD_GRAVITY_MPS2 = 9.81;

/** 6-speed gearbox speed upper thresholds (km/h) & per-gear torque punch multipliers */
export const GEAR_THRESHOLDS_KMH = [0, 58, 112, 168, 224, 284, 405] as const;
export const GEAR_TORQUE_MULTIPLIERS = [1.0, 1.38, 1.22, 1.08, 0.96, 0.87, 0.80] as const;

export function computeGearboxDriveState(
  forwardSpeedMs: number,
  throttle: boolean,
): { gear: number; rpm: number; torqueMult: number } {
  const speedKmh = Math.abs(forwardSpeedMs) * 3.6;
  if (forwardSpeedMs < -0.5) {
    return {
      gear: -1,
      rpm: Math.min(0.95, Math.max(0.2, (speedKmh / 72) * 0.72 + 0.22)),
      torqueMult: 0.88,
    };
  }
  if (speedKmh < 2.5) {
    return { gear: 0, rpm: throttle ? 0.56 : 0.16, torqueMult: 1.28 };
  }
  let gear = 1;
  for (let g = 1; g <= 6; g++) {
    if (speedKmh <= GEAR_THRESHOLDS_KMH[g] || g === 6) {
      gear = g;
      break;
    }
  }
  const low = GEAR_THRESHOLDS_KMH[gear - 1];
  const high = GEAR_THRESHOLDS_KMH[gear];
  const ratio = Math.min(1, Math.max(0, (speedKmh - low) / Math.max(1, high - low)));
  // Power band peaks around 45%..85% of each gear before shifting
  const powerBand = 0.88 + 0.22 * Math.sin(ratio * Math.PI * 0.92);
  return {
    gear,
    rpm: Math.min(0.97, Math.max(0.24, 0.32 + ratio * 0.65)),
    torqueMult: GEAR_TORQUE_MULTIPLIERS[gear] * powerBand,
  };
}

export const SURFACE_MODIFIERS: Record<SurfaceType, SurfacePhysicsSpec> = {
  asphalt: {
    id: 'asphalt',
    label: 'DRY ASPHALT',
    gripMultiplier: 1.0,
    rollingResistance: 0.44,
    lateralDamping: 1.0,
    bumpAmplitude: 0.0,
    particleColor: '#CBD5E1',
  },
  wet_asphalt: {
    id: 'wet_asphalt',
    label: 'WET ASPHALT',
    gripMultiplier: 0.84,
    rollingResistance: 0.51,
    lateralDamping: 0.88,
    bumpAmplitude: 0.008,
    particleColor: '#BAE6FD',
  },
  gravel: {
    id: 'gravel',
    label: 'GRAVEL SHOULDER',
    gripMultiplier: 0.67,
    rollingResistance: 0.96,
    lateralDamping: 0.76,
    bumpAmplitude: 0.045,
    particleColor: '#94A3B8',
  },
  dirt: {
    id: 'dirt',
    label: 'CANYON DIRT',
    gripMultiplier: 0.61,
    rollingResistance: 1.12,
    lateralDamping: 0.70,
    bumpAmplitude: 0.058,
    particleColor: '#D97706',
  },
  sand: {
    id: 'sand',
    label: 'COASTAL SAND',
    gripMultiplier: 0.50,
    rollingResistance: 1.52,
    lateralDamping: 0.63,
    bumpAmplitude: 0.04,
    particleColor: '#FDE68A',
  },
  grass: {
    id: 'grass',
    label: 'TURF VERGE',
    gripMultiplier: 0.55,
    rollingResistance: 1.24,
    lateralDamping: 0.68,
    bumpAmplitude: 0.036,
    particleColor: '#86EFAC',
  },
};

export const HANDLING_PRESETS: Record<
  HandlingMode,
  {
    label: string;
    tagline: string;
    tuning: PhysicsTuningParams;
    defaultAssists: AssistSettings;
  }
> = {
  arcade: {
    label: 'Arcade',
    tagline: 'Responsive turn-in with forgiving slide catch, still requires braking for tight hairpins.',
    tuning: {
      tireGripMultiplier: 1.08,
      pacejkaStiffness: 10.2,
      pacejkaShape: 1.28,
      suspensionStiffness: 46,
      suspensionDamping: 7.8,
      aeroDownforce: 1.12,
      aeroDrag: 0.94,
      weightTransfer: 1.08,
      driftSlipEase: 1.24,
      steerSpeedSensitivity: 0.52,
    },
    defaultAssists: {
      tcs: true,
      abs: true,
      stabilityControl: true,
      steerAssist: true,
      brakeAssist: false,
    },
  },
  balanced: {
    label: 'Balanced',
    tagline: 'Demanding street physics: brake before hairpins, transfer weight into apexes, control rear slip.',
    tuning: {
      tireGripMultiplier: 0.96,
      pacejkaStiffness: 9.4,
      pacejkaShape: 1.36,
      suspensionStiffness: 43,
      suspensionDamping: 7.3,
      aeroDownforce: 1.02,
      aeroDrag: 0.96,
      weightTransfer: 1.28,
      driftSlipEase: 1.12,
      steerSpeedSensitivity: 0.54,
    },
    defaultAssists: {
      tcs: true,
      abs: true,
      stabilityControl: true,
      steerAssist: false,
      brakeAssist: false,
    },
  },
  sim_lite: {
    label: 'Sim-Lite',
    tagline: 'Sharp understeer push at the limit, heavy trail-braking load shift, zero training wheels.',
    tuning: {
      tireGripMultiplier: 0.88,
      pacejkaStiffness: 8.4,
      pacejkaShape: 1.48,
      suspensionStiffness: 40,
      suspensionDamping: 7.2,
      aeroDownforce: 0.88,
      aeroDrag: 1.02,
      weightTransfer: 1.32,
      driftSlipEase: 0.92,
      steerSpeedSensitivity: 0.58,
    },
    defaultAssists: {
      tcs: false,
      abs: true,
      stabilityControl: false,
      steerAssist: false,
      brakeAssist: false,
    },
  },
};

export const TUNING_SLIDER_DEFS: TuningSliderDef[] = [
  {
    key: 'tireGripMultiplier',
    label: 'Peak Tire Grip (D)',
    min: 0.65,
    max: 1.5,
    step: 0.02,
    unit: 'x',
    explanation: 'Scales maximum Pacejka tire friction before the car begins to slide.',
  },
  {
    key: 'pacejkaStiffness',
    label: 'Corner Bite (B)',
    min: 5.0,
    max: 14.0,
    step: 0.2,
    unit: '',
    explanation: 'Controls how sharply lateral grip builds at small steering angles.',
  },
  {
    key: 'pacejkaShape',
    label: 'Slip Breakaway (C)',
    min: 1.05,
    max: 1.85,
    step: 0.02,
    unit: '',
    explanation: 'Higher values make tire grip drop off more abruptly past peak slip.',
  },
  {
    key: 'suspensionStiffness',
    label: 'Spring Stiffness',
    min: 22,
    max: 68,
    step: 1,
    unit: 'kN/m',
    explanation: 'Stiffer springs reduce body roll and keep camber flat over curbs.',
  },
  {
    key: 'suspensionDamping',
    label: 'Damper Control',
    min: 3.5,
    max: 12.0,
    step: 0.2,
    unit: '',
    explanation: 'Absorbs suspension bounce after landing jumps or hitting shoulders.',
  },
  {
    key: 'weightTransfer',
    label: 'Weight Transfer',
    min: 0.3,
    max: 1.6,
    step: 0.05,
    unit: 'x',
    explanation: 'Shifts vertical tire load under braking, launch, and hard cornering.',
  },
  {
    key: 'aeroDownforce',
    label: 'Aero Downforce',
    min: 0.3,
    max: 1.8,
    step: 0.05,
    unit: 'x',
    explanation: 'Presses tires harder into the asphalt as speed rises above 140 km/h.',
  },
  {
    key: 'aeroDrag',
    label: 'Aero Drag',
    min: 0.7,
    max: 1.35,
    step: 0.02,
    unit: 'x',
    explanation: 'Air resistance opposing top speed at 250+ km/h.',
  },
  {
    key: 'driftSlipEase',
    label: 'Drift Angle Bias',
    min: 0.55,
    max: 1.55,
    step: 0.05,
    unit: 'x',
    explanation: 'Makes sustaining rear power-slides easier or tighter during handbrake turns.',
  },
  {
    key: 'steerSpeedSensitivity',
    label: 'Speed Steer Damp',
    min: 0.25,
    max: 0.8,
    step: 0.02,
    unit: '',
    explanation: 'Reduces front wheel angle at highway speed to prevent twitchy steering.',
  },
];

export const ASSIST_LABELS: {
  key: keyof AssistSettings;
  label: string;
  explanation: string;
}[] = [
  {
    key: 'tcs',
    label: 'TCS (Traction Control)',
    explanation: 'Limits launch and corner-exit wheelspin on low-grip surfaces.',
  },
  {
    key: 'abs',
    label: 'ABS (Anti-Lock Brakes)',
    explanation: 'Prevents wheel lockup under hard braking so steering stays responsive.',
  },
  {
    key: 'stabilityControl',
    label: 'ESC (Stability Control)',
    explanation: 'Applies subtle corrective yaw damping to catch unexpected spinouts.',
  },
  {
    key: 'steerAssist',
    label: 'Steer Assist',
    explanation: 'Adds gentle counter-steer guidance and input smoothing during slides.',
  },
  {
    key: 'brakeAssist',
    label: 'Brake Assist',
    explanation: 'Lightly trims excess entry speed before sharp blind hairpins.',
  },
];
