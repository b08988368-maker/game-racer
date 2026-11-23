export type RubberBandingMode = 'off' | 'light' | 'classic';
export type AiPersonality = 'aggressive' | 'clean' | 'defensive';

export interface AiSettings {
  pace: number; // 0.75 .. 1.25 global pace multiplier
  aggression: number; // 0.0 .. 1.0 overtaking & defensive blocking aggression
  mistakeRate: number; // 0.0 .. 1.0 probability/size of human-sized corner errors
  rubberBanding: RubberBandingMode;
  adaptiveIntensity: boolean; // prevents AI from lagging a lap behind, even on Easy
}

export interface DifficultyAiProfile {
  label: string;
  baseSkill: number;
  cornerConfidence: number;
  brakingPrecision: number;
  mistakeScale: number;
  nosUsageBias: number;
  catchupMin: number;
  catchupMax: number;
  upgradeOffset: number; // relative to player's average upgrade level
}

export const DIFFICULTY_AI_PROFILES: Record<'Easy' | 'Medium' | 'Hard' | 'Expert', DifficultyAiProfile> = {
  Easy: {
    label: 'Street Challenger (Fair Pack)',
    baseSkill: 0.94,
    cornerConfidence: 1.02,
    brakingPrecision: 1.02,
    mistakeScale: 0.35,
    nosUsageBias: 0.78,
    catchupMin: 0.91,
    catchupMax: 1.04,
    upgradeOffset: -1,
  },
  Medium: {
    label: 'Rockport Veteran',
    baseSkill: 0.99,
    cornerConfidence: 1.09,
    brakingPrecision: 1.07,
    mistakeScale: 0.2,
    nosUsageBias: 0.9,
    catchupMin: 0.95,
    catchupMax: 1.08,
    upgradeOffset: 0,
  },
  Hard: {
    label: 'Blacklist Contender',
    baseSkill: 1.03,
    cornerConfidence: 1.15,
    brakingPrecision: 1.12,
    mistakeScale: 0.1,
    nosUsageBias: 0.98,
    catchupMin: 0.97,
    catchupMax: 1.11,
    upgradeOffset: 0,
  },
  Expert: {
    label: 'Most Wanted Apex Ace',
    baseSkill: 1.06,
    cornerConfidence: 1.22,
    brakingPrecision: 1.18,
    mistakeScale: 0.04,
    nosUsageBias: 1.05,
    catchupMin: 0.99,
    catchupMax: 1.14,
    upgradeOffset: 1,
  },
};

export const DEFAULT_AI_SETTINGS: AiSettings = {
  pace: 1.0,
  aggression: 0.65,
  mistakeRate: 0.3,
  rubberBanding: 'light',
  adaptiveIntensity: true,
};

export const RUBBER_BANDING_LABELS: Record<RubberBandingMode, { label: string; desc: string }> = {
  off: {
    label: 'Off',
    desc: 'Pure pace — AI obeys car upgrades and line skill with zero catch-up boost.',
  },
  light: {
    label: 'Light (Default)',
    desc: 'Keeps pack racing tight and exciting without fake teleporting or absurd speeds.',
  },
  classic: {
    label: 'Classic MW',
    desc: 'Strong Most Wanted catch-up so rivals push relentlessly on straights to fight back.',
  },
};

export const AI_PERSONALITY_TRAITS: Record<
  AiPersonality,
  {
    label: string;
    shortTag: string;
    brakeBias: number; // >1 brakes later
    cornerAttack: number;
    blockTendency: number;
    shortcutAffinity: number;
  }
> = {
  aggressive: {
    label: 'Aggressive',
    shortTag: 'AGG',
    brakeBias: 1.05,
    cornerAttack: 1.04,
    blockTendency: 0.85,
    shortcutAffinity: 0.9,
  },
  clean: {
    label: 'Apex Clean',
    shortTag: 'CLN',
    brakeBias: 1.0,
    cornerAttack: 1.02,
    blockTendency: 0.25,
    shortcutAffinity: 0.55,
  },
  defensive: {
    label: 'Defensive',
    shortTag: 'DEF',
    brakeBias: 0.96,
    cornerAttack: 0.98,
    blockTendency: 0.95,
    shortcutAffinity: 0.4,
  },
};

/** 5-second rewind ring buffer @ 60Hz */
export const REWIND_BUFFER_SECONDS = 5;
export const REWIND_SAMPLE_HZ = 60;
export const REWIND_BUFFER_CAPACITY = REWIND_BUFFER_SECONDS * REWIND_SAMPLE_HZ;
export const REWIND_RACE_MAX_USES = 3;

/** Ghost recording frequency (Hz) */
export const GHOST_RECORD_HZ = 15;
