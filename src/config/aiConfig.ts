import type { TrackDifficulty } from '../types/game';

export type RubberBandingMode = 'off' | 'light' | 'classic';
export type AiPersonality = 'aggressive' | 'cautious' | 'consistent';

export interface AiSettings {
  pace: number; // Global user pace modifier (default 1.0)
  aggression: number; // 0.0 .. 1.0 overtaking & defensive blocking aggression
  mistakeRate: number; // 0.0 .. 1.0 global mistake scaler
  rubberBanding: RubberBandingMode;
  adaptiveIntensity: boolean;
}

export interface SkillRange {
  min: number;
  max: number;
  initial: number;
}

export interface PaceRange {
  min: number;
  max: number;
}

/**
 * Centralized AI tuning constants — adjust values here to tune AI competitiveness.
 */
export const AI_TUNING_CONFIG = {
  /** Distance (m) at which rubber banding reaches full strength (keeps packs tight, never multi-km). */
  MAX_GAP_METERS: 150,

  /** Catch-up speed boost strength when AI is behind the player (gap > 0). */
  RUBBER_STRENGTH: {
    Easy: 0.07,
    Medium: 0.10,
    Hard: 0.13,
    Expert: 0.15,
  } as Record<TrackDifficulty, number>,

  /** Multiplier on RUBBER_STRENGTH when AI is ahead of the player (gap < 0) so slowdown is gentler. */
  RUBBER_AHEAD_SCALE: 0.45,

  /** Exponential smoothing rate (1/s) for rubber-band multiplier changes (prevents sudden speed jumps). */
  RUBBER_LERP_RATE: 3.5,

  /** Hard cap: AI top speed never exceeds player's car top speed by more than +4% (within 3-5%). */
  MAX_TOP_SPEED_OVER_PLAYER_RATIO: 1.04,

  /** Per-difficulty adaptive skill bounds (0..1) so Easy never morphs into Hard. */
  SKILL_RANGES: {
    Easy: { min: 0.15, max: 0.42, initial: 0.28 },
    Medium: { min: 0.42, max: 0.68, initial: 0.55 },
    Hard: { min: 0.68, max: 0.90, initial: 0.78 },
    Expert: { min: 0.80, max: 1.00, initial: 0.90 },
  } as Record<TrackDifficulty, SkillRange>,

  /** Target pace fraction relative to ideal lap pace mapped across each difficulty's skill range. */
  PACE_RANGES: {
    Easy: { min: 0.92, max: 0.95 },
    Medium: { min: 0.96, max: 0.98 },
    Hard: { min: 0.99, max: 1.01 },
    Expert: { min: 1.01, max: 1.03 },
  } as Record<TrackDifficulty, PaceRange>,

  /** Per-lap random pace jitter (±1.5%) so AI never runs identical laps. */
  LAP_RANDOMNESS_PCT: 0.015,

  /** Skill-scaled corner mistake frequencies & effects (late braking, line drift, slow exit). */
  MISTAKE_RATES: {
    /** Probability multiplier scaling from high skill -> low skill. */
    minFreqAtMaxSkill: 0.14,
    maxFreqAtZeroSkill: 0.62,
    cooldownMinSec: 6.5,
    cooldownMaxSec: 12.0,
    durationMinSec: 0.42,
    durationMaxSec: 0.82,
    slowExitThrottle: 0.74,
    lineDriftOffsetM: 2.3,
  },

  /** Between-race adaptive skill adjustment & persistence. */
  ADAPTIVE_DIFFICULTY: {
    targetMarginSec: 3.0,
    skillStepPerSec: 0.02,
    storageKey: 'blacklist_rockport_ai_adaptive_v1',
  },

  /** Race flow pacing: early launch competitiveness + final-lap pressure. */
  RACE_FLOW: {
    startBoostDurationSec: 7.5,
    startBoostProgressEnd: 0.12,
    startPaceBonus: 0.035,
    finalLapPaceBonus: 0.025,
    finalLapMistakeScale: 0.65,
  },
};

export interface DifficultyAiProfile {
  label: string;
  cornerConfidence: number;
  brakingPrecision: number;
  nosUsageBias: number;
  upgradeOffset: number;
}

export const DIFFICULTY_AI_PROFILES: Record<TrackDifficulty, DifficultyAiProfile> = {
  Easy: {
    label: 'Street Pack',
    cornerConfidence: 0.98,
    brakingPrecision: 0.97,
    nosUsageBias: 0.88,
    upgradeOffset: 0,
  },
  Medium: {
    label: 'Rockport Hunter',
    cornerConfidence: 1.02,
    brakingPrecision: 1.00,
    nosUsageBias: 0.98,
    upgradeOffset: 0,
  },
  Hard: {
    label: 'Blacklist Contender',
    cornerConfidence: 1.05,
    brakingPrecision: 1.03,
    nosUsageBias: 1.08,
    upgradeOffset: 1,
  },
  Expert: {
    label: 'Most Wanted Ace',
    cornerConfidence: 1.08,
    brakingPrecision: 1.06,
    nosUsageBias: 1.15,
    upgradeOffset: 1,
  },
};

export const DEFAULT_AI_SETTINGS: AiSettings = {
  pace: 1.0,
  aggression: 0.78,
  mistakeRate: 1.0,
  rubberBanding: 'light',
  adaptiveIntensity: true,
};

export const RUBBER_BANDING_LABELS: Record<RubberBandingMode, { label: string; desc: string }> = {
  off: {
    label: 'Off',
    desc: 'Pure skill pace — AI drives strictly from skill and upgrades without catch-up.',
  },
  light: {
    label: 'Competitive (Default)',
    desc: 'Keeps rivals within ~150m with smooth rubber banding and hard speed caps.',
  },
  classic: {
    label: 'Classic MW',
    desc: 'Stronger Most Wanted catch-up for intense pack battles.',
  },
};

export interface AiPersonalityTrait {
  label: string;
  shortTag: string;
  brakeBias: number; // >1 brakes later
  cornerAttack: number;
  paceOffset: number; // subtle pace modifier
  mistakeMult: number; // mistake frequency multiplier
  lapVarianceMult: number; // per-lap randomness scale
  blockTendency: number;
  shortcutAffinity: number;
}

export const AI_PERSONALITY_TRAITS: Record<AiPersonality, AiPersonalityTrait> = {
  aggressive: {
    label: 'Aggressive',
    shortTag: 'AGG',
    brakeBias: 1.05,
    cornerAttack: 1.04,
    paceOffset: 0.008,
    mistakeMult: 1.45,
    lapVarianceMult: 1.15,
    blockTendency: 0.85,
    shortcutAffinity: 0.90,
  },
  cautious: {
    label: 'Cautious',
    shortTag: 'CAU',
    brakeBias: 0.94,
    cornerAttack: 0.97,
    paceOffset: -0.006,
    mistakeMult: 0.55,
    lapVarianceMult: 0.85,
    blockTendency: 0.35,
    shortcutAffinity: 0.45,
  },
  consistent: {
    label: 'Consistent',
    shortTag: 'CON',
    brakeBias: 1.0,
    cornerAttack: 1.01,
    paceOffset: 0.002,
    mistakeMult: 0.70,
    lapVarianceMult: 0.35,
    blockTendency: 0.55,
    shortcutAffinity: 0.65,
  },
};

export interface AdaptiveAiRecord {
  skills: Record<TrackDifficulty, number>;
  lastWinMarginSec: number | null;
  lastDifficulty: TrackDifficulty;
  lastLapTimesMs: number[];
  lastMistakeCount: number;
  racesRecorded: number;
}

export function getDefaultAdaptiveAiState(): AdaptiveAiRecord {
  return {
    skills: {
      Easy: AI_TUNING_CONFIG.SKILL_RANGES.Easy.initial,
      Medium: AI_TUNING_CONFIG.SKILL_RANGES.Medium.initial,
      Hard: AI_TUNING_CONFIG.SKILL_RANGES.Hard.initial,
      Expert: AI_TUNING_CONFIG.SKILL_RANGES.Expert.initial,
    },
    lastWinMarginSec: null,
    lastDifficulty: 'Medium',
    lastLapTimesMs: [],
    lastMistakeCount: 0,
    racesRecorded: 0,
  };
}

export function clampSkillForDifficulty(difficulty: TrackDifficulty, skill: number): number {
  const range = AI_TUNING_CONFIG.SKILL_RANGES[difficulty];
  return Math.max(range.min, Math.min(range.max, skill));
}

/** Maps an AI driver's skill [0..1] into the difficulty's target pace fraction (e.g. 0.92-0.95 Easy). */
export function computeTargetPaceFromSkill(difficulty: TrackDifficulty, skill: number): number {
  const sRange = AI_TUNING_CONFIG.SKILL_RANGES[difficulty];
  const pRange = AI_TUNING_CONFIG.PACE_RANGES[difficulty];
  const span = Math.max(0.001, sRange.max - sRange.min);
  const t = Math.max(0, Math.min(1, (skill - sRange.min) / span));
  return pRange.min + t * (pRange.max - pRange.min);
}

/**
 * Exact bounded rubber-banding speed multiplier from gap to player:
 * gap = player_distance - ai_distance (positive = player is ahead)
 * boost = clamp(gap / MAX_GAP, -1, 1)
 * ai_speed_multiplier = 1.0 + boost * strength (weaker when AI is ahead)
 */
export function computeRubberBandTargetMultiplier(
  gapMeters: number,
  difficulty: TrackDifficulty,
  mode: RubberBandingMode,
): number {
  if (mode === 'off') return 1.0;
  const maxGap = AI_TUNING_CONFIG.MAX_GAP_METERS;
  const boost = Math.max(-1, Math.min(1, gapMeters / maxGap));
  const modeScale = mode === 'classic' ? 1.25 : 1.0;
  const baseStrength = AI_TUNING_CONFIG.RUBBER_STRENGTH[difficulty] * modeScale;
  const strength = boost < 0 ? baseStrength * AI_TUNING_CONFIG.RUBBER_AHEAD_SCALE : baseStrength;
  return 1.0 + boost * strength;
}

/** Pure adaptive skill update after a race: error = actual_margin - 3.0; skill += error * 0.02 */
export function computeUpdatedAdaptiveSkill(
  currentSkill: number,
  difficulty: TrackDifficulty,
  actualWinMarginSec: number,
): number {
  const { targetMarginSec, skillStepPerSec } = AI_TUNING_CONFIG.ADAPTIVE_DIFFICULTY;
  const error = actualWinMarginSec - targetMarginSec;
  return clampSkillForDifficulty(difficulty, currentSkill + error * skillStepPerSec);
}

export function loadAdaptiveAiState(): AdaptiveAiRecord {
  const fallback = getDefaultAdaptiveAiState();
  if (typeof window === 'undefined' || !window.localStorage) return fallback;
  try {
    const raw = window.localStorage.getItem(AI_TUNING_CONFIG.ADAPTIVE_DIFFICULTY.storageKey);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<AdaptiveAiRecord>;
    return {
      skills: {
        Easy: clampSkillForDifficulty('Easy', Number(parsed.skills?.Easy ?? fallback.skills.Easy)),
        Medium: clampSkillForDifficulty('Medium', Number(parsed.skills?.Medium ?? fallback.skills.Medium)),
        Hard: clampSkillForDifficulty('Hard', Number(parsed.skills?.Hard ?? fallback.skills.Hard)),
        Expert: clampSkillForDifficulty('Expert', Number(parsed.skills?.Expert ?? fallback.skills.Expert)),
      },
      lastWinMarginSec:
        typeof parsed.lastWinMarginSec === 'number' && Number.isFinite(parsed.lastWinMarginSec)
          ? parsed.lastWinMarginSec
          : null,
      lastDifficulty:
        parsed.lastDifficulty === 'Easy' ||
        parsed.lastDifficulty === 'Medium' ||
        parsed.lastDifficulty === 'Hard' ||
        parsed.lastDifficulty === 'Expert'
          ? parsed.lastDifficulty
          : 'Medium',
      lastLapTimesMs: Array.isArray(parsed.lastLapTimesMs) ? parsed.lastLapTimesMs.slice(0, 12) : [],
      lastMistakeCount: typeof parsed.lastMistakeCount === 'number' ? parsed.lastMistakeCount : 0,
      racesRecorded: typeof parsed.racesRecorded === 'number' ? parsed.racesRecorded : 0,
    };
  } catch {
    return fallback;
  }
}

export function saveAdaptiveAiState(state: AdaptiveAiRecord): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(AI_TUNING_CONFIG.ADAPTIVE_DIFFICULTY.storageKey, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

export function recordRaceAndAdjustAdaptiveSkill(
  difficulty: TrackDifficulty,
  actualWinMarginSec: number,
  aiLapTimesMs: number[],
  aiMistakeCount: number,
): AdaptiveAiRecord {
  const prev = loadAdaptiveAiState();
  const nextSkill = computeUpdatedAdaptiveSkill(prev.skills[difficulty], difficulty, actualWinMarginSec);
  const nextState: AdaptiveAiRecord = {
    skills: {
      ...prev.skills,
      [difficulty]: Math.round(nextSkill * 10000) / 10000,
    },
    lastWinMarginSec: Math.round(actualWinMarginSec * 100) / 100,
    lastDifficulty: difficulty,
    lastLapTimesMs: aiLapTimesMs.map((t) => Math.round(t)),
    lastMistakeCount: aiMistakeCount,
    racesRecorded: prev.racesRecorded + 1,
  };
  saveAdaptiveAiState(nextState);
  return nextState;
}

/** 5-second rewind ring buffer @ 60Hz */
export const REWIND_BUFFER_SECONDS = 5;
export const REWIND_SAMPLE_HZ = 60;
export const REWIND_BUFFER_CAPACITY = REWIND_BUFFER_SECONDS * REWIND_SAMPLE_HZ;
export const REWIND_RACE_MAX_USES = 3;

/** Ghost recording frequency (Hz) */
export const GHOST_RECORD_HZ = 15;
