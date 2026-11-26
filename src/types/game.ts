import type { AiPersonality, AiSettings, RubberBandingMode } from '../config/aiConfig';
import type { AssistSettings, HandlingMode, PhysicsTuningParams, SurfaceType } from '../config/physicsConfig';
import type { ControlAction, ControlBindings, GraphicsQuality, TouchControlsMode } from '../config/settingsConfig';
import type { ActiveWeatherState, WeatherMode } from '../config/weatherConfig';

export type {
  ActiveWeatherState,
  AiPersonality,
  AiSettings,
  AssistSettings,
  ControlAction,
  ControlBindings,
  GraphicsQuality,
  HandlingMode,
  PhysicsTuningParams,
  RubberBandingMode,
  SurfaceType,
  TouchControlsMode,
  WeatherMode,
};

export type RaceMode =
  | 'circuit'
  | 'sprint'
  | 'knockout'
  | 'tollbooth'
  | 'speedtrap'
  | 'blacklist'
  | 'pursuit'
  | 'freeroam';

export type TrackId =
  | 'rockport_loop'
  | 'rosewood_park'
  | 'hwy99_speedway'
  | 'camden_coast'
  | 'rosewood_canyon'
  | 'heritage_forest'
  | 'gray_point_bay'
  | 'silverton_pass'
  | 'downtown_labyrinth'
  | 'blackridge_summit';

export type EnvironmentId =
  | 'auto'
  | 'golden_dusk'
  | 'midnight_neon'
  | 'overcast_rain'
  | 'noon_clear'
  | 'dawn_mist'
  | 'crimson_foundry'
  | 'canyon_sun'
  | 'mediterranean_day';

export type TrackDifficulty = 'Easy' | 'Medium' | 'Hard' | 'Expert';

export type LiveryStyle = 'clean' | 'stripes' | 'most_wanted' | 'boss_carbon';
export type RimStyle = 'chrome' | 'black' | 'gold' | 'bronze';
export type EngineSoundProfile =
  | 'auto'
  | 'i4_turbo'
  | 'v6_twin_turbo'
  | 'v8_muscle'
  | 'v10_screamer'
  | 'v12_hyper'
  | 'rotary_brap'
  | 'flat6_gt'
  | 'electric_whine';

export type CameraMode = 'chase_far' | 'chase_close' | 'hood' | 'bumper';
export type GarageCameraPreset = 'orbit' | 'front' | 'side' | 'rear';

export type PursuitState = 'none' | 'pursuit' | 'cooldown' | 'evaded' | 'busted';
export type CinematicPhase = 'intro' | 'countdown' | 'racing' | 'outro';

export type MissionType =
  | 'circuit'
  | 'sprint'
  | 'knockout'
  | 'tollbooth'
  | 'speedtrap'
  | 'pursuit_milestone'
  | 'shortcut_heist'
  | 'drift_showdown'
  | 'stunt_blitz'
  | 'interceptor';

export interface MissionChecklistItem {
  label: string;
  current: string;
  done: boolean;
}

export interface MissionDefinition {
  id: string;
  tierRank: number; // 15 down to 1
  order: number; // 1..6 within tier
  title: string;
  type: MissionType;
  modeTag: string;
  trackId: TrackId;
  environment: Exclude<EnvironmentId, 'auto'>;
  laps?: number;
  difficulty: TrackDifficulty;
  targetSpeedtrapKmh?: number;
  targetBounty?: number;
  targetTakedowns?: number;
  minHeat?: number;
  targetShortcuts?: number;
  targetDriftSec?: number;
  targetNearMisses?: number;
  targetAirtimeSec?: number;
  targetSmashables?: number;
  maxDamagePercent?: number;
  aiTierBoost: number; // 0..4 simulated AI upgrade/pace tier
  cashReward: number;
  bountyReward: number;
  objectiveSummary: string;
  winRules: string[];
  proTip: string;
  description: string;
}

export interface CarSpec {
  id: string;
  name: string;
  brand: string;
  tier: number;
  price: number;
  unlockRank: number; // 16 = starter/open, 15..1 = unlocked after defeating Blacklist #15..#1
  bossOnly?: boolean; // Exclusive Pink-Slip vehicle — cannot be purchased in dealership
  bossRank?: number; // 15..1 Blacklist rival rank that awards this car
  aeroKit?: 'stock' | 'widebody' | 'boss_gt';
  baseTopSpeedKmh: number;
  baseAccel: number;
  baseHandling: number;
  baseNitrous: number;
  defaultPaint: string;
  defaultLivery: LiveryStyle;
  dimensions: {
    width: number;
    height: number;
    length: number;
    wheelRadius: number;
  };
  bodyStyle: 'coupe' | 'sedan' | 'muscle' | 'gtr' | 'exotic';
  description: string;
}

export interface GarageCarConfig {
  ownerId: string;
  carId: string;
  engineLevel: number; // 1..5
  turboLevel: number; // 1..5
  nitrousLevel: number; // 1..5
  tiresLevel: number; // 1..5
  paintHex: string;
  livery: LiveryStyle;
  rimStyle: RimStyle;
  engineSound?: EngineSoundProfile;
}

export interface GarageDynoTelemetry {
  active: boolean;
  gasHeld: boolean;
  autoPull: boolean;
  nosActive: boolean;
  speedKmh: number;
  peakSpeedKmh: number;
  topTargetKmh: number;
  rpm: number;
  gear: number;
  redlineLedCount: number;
  zeroTo100Sec: number | null;
  zeroTo200Sec: number | null;
  elapsedPullSec: number;
  engineProfile: Exclude<EngineSoundProfile, 'auto'>;
}

export interface BlacklistRival {
  rank: number; // 15 down to 1
  name: string;
  alias: string;
  carId: string; // Visual / performance car spec used by the rival
  bossCarId: string; // Exclusive Pink-Slip car awarded to the player upon defeating this rival
  carName: string;
  paintHex: string;
  livery: LiveryStyle;
  requiredBounty: number;
  requiredWins: number;
  requiredTakedowns: number;
  cashReward: number;
  bountyReward: number;
  trackId: TrackId;
  environment: Exclude<EnvironmentId, 'auto'>;
  laps: number;
  aiSkill: number; // 0.85 to 1.05
  quote: string;
}

export interface TrackMetadata {
  id: TrackId;
  name: string;
  district: string;
  difficulty: TrackDifficulty;
  styleTag: string;
  musicTrackName: string;
  lengthLabel: string;
  defaultLaps: number;
  defaultEnv: Exclude<EnvironmentId, 'auto'>;
  shortcutCount: number;
  description: string;
}

export interface CareerProfile {
  uid: string;
  driverName: string;
  cash: number;
  totalBounty: number;
  blacklistDefeated: number; // 0..15
  racesWon: number;
  copsTakedowns: number;
  bestLapMs: number;
  highestHeat: number;
  selectedCarId: string;
  ownedCarIds: string[];
  wonTrackIds: string[];
  completedMissionIds: string[];
}

export interface LeaderboardEntry {
  uid: string;
  driverName: string;
  totalBounty: number;
  bestLapMs: number;
  highestHeat: number;
  blacklistRank: number;
  carName: string;
}

export interface MinimapBlip {
  x: number;
  z: number;
  type: 'player' | 'rival' | 'cop' | 'rhino' | 'cooldown' | 'breaker';
  heading?: number;
}

export interface WheelTelemetry {
  id: 'FL' | 'FR' | 'RL' | 'RR';
  slipRatio: number;
  slipAngleDeg: number;
  loadN: number;
  compression: number;
  surface: SurfaceType;
}

export interface AiDebugEntry {
  id: string;
  name: string;
  personality: AiPersonality;
  action: string;
  speedKmh: number;
  targetSpeedKmh: number;
  nitrous: number;
  skill: number; // 0..1 adaptive driver skill
  adaptiveMult: number; // smoothed rubber-band multiplier
  mistakes: number;
  gapMeters: number; // positive = player ahead of AI
}

export type OpponentHudStatus = 'racing' | 'busted' | 'knocked_out' | 'finished';

export interface OpponentHudEntry {
  id: string;
  name: string;
  carName: string;
  paintHex: string;
  position: number;
  status: OpponentHudStatus;
  gapMeters: number;
  speedKmh: number;
  bustProgress: number;
  isBoss: boolean;
}

export interface DevTelemetryData {
  fps: number;
  frameMs: number;
  physicsMs: number;
  drawCalls: number;
  activeEntities: number;
  substeps: number;
  surface: SurfaceType;
  handlingMode: HandlingMode;
  wheels: [WheelTelemetry, WheelTelemetry, WheelTelemetry, WheelTelemetry];
}

export interface RaceTelemetry {
  opponents?: OpponentHudEntry[];
  speedKmh: number;
  rpm: number; // 0..1
  gear: number; // -1 (R), 0 (N), 1..6
  nitrous: number; // 0..100
  speedbreaker: number; // 0..100
  isSpeedbreakerActive: boolean;
  isNitrousActive: boolean;
  isDrifting: boolean;
  isSlipstreaming: boolean;
  spikedTimer: number;
  position: number;
  totalRacers: number;
  activeRacers: number;
  gapMeters: number; // positive = ahead of 2nd, negative = behind leader
  lap: number;
  totalLaps: number;
  lapTimeMs: number;
  bestLapMs: number;
  totalRaceTimeMs: number;
  tollboothTimeLeftMs: number;
  tollboothCheckpoint: number;
  tollboothTotal: number;
  speedTrapTotalKmh: number;
  speedTrapLeaderKmh: number;
  speedTrapTargetKmh: number;
  speedTrapHits: number;
  driftTimeTotalSec: number;
  airTimeTotalSec: number;
  smashablesHit: number;
  activeMissionTitle: string | null;
  activeMissionModeTag: string | null;
  activeMissionObjective: string | null;
  missionChecklist: MissionChecklistItem[];
  objectiveBadge: string;
  objectiveHeadline: string;
  objectiveSteps: string[];
  objectiveFailRule: string | null;
  musicTrackName: string;
  progress: number; // 0..1
  wrongWay: boolean;
  cinematicPhase: CinematicPhase;
  introLabel: string | null;
  introSubLabel: string | null;
  outroOutcome: 'win' | 'busted' | 'loss' | null;
  countdown: number; // 3, 2, 1, 0, -1 (active)
  heatLevel: number; // 1..5
  pursuitState: PursuitState;
  evadeProgress: number; // 0..100
  bustProgress: number; // 0..100
  activeCops: number;
  copsTakedowns: number;
  sessionBounty: number;
  nearMissCount: number;
  nearMissCombo: number;
  speedTrapBestKmh: number;
  shortcutsTaken: number;
  upcomingShortcut?: { label: string; side: 'left' | 'right'; distanceM: number } | null;
  driftHoldSec?: number;
  driftComboScore?: number;
  speedTrapFlash?: boolean;
  gridRevRpm?: number; // 0..1 during countdown grid revving
  slingshotCharge?: number; // 0..100
  slingshotActive?: boolean;
  styleComboMult?: number; // 1..5
  styleComboPoints?: number;
  styleComboTimerPct?: number; // 0..100
  redlineShiftLedCount?: number; // 0..6
  shiftNow?: boolean;
  environment: Exclude<EnvironmentId, 'auto'>;
  patrolsEnabled: boolean;
  radioDispatch: string | null;
  callout: { text: string; tone: 'amber' | 'cyan' | 'red' | 'emerald'; id: number } | null;
  minimapPath: { x: number; z: number }[];
  minimapShortcuts?: { x: number; z: number }[][];
  minimapBlips: MinimapBlip[];
  cameraMode: CameraMode;
  fps?: number;
  surfaceType?: SurfaceType;
  handlingMode?: HandlingMode;
  gamepadConnected?: boolean;
  rewindsLeft?: number;
  rewindUnlimited?: boolean;
  rewindBufferSec?: number;
  hasBestGhost?: boolean;
  ghostEnabled?: boolean;
  aiDebugEntries?: AiDebugEntry[];
  aiDifficulty?: TrackDifficulty;
  lastWinMarginSec?: number | null;
  weatherState?: ActiveWeatherState;
  roadWetness?: number;
  damagePercent?: number;
  detachedPartsCount?: number;
  policeLosActive?: boolean;
  inCooldownZone?: boolean;
  helicopterActive?: boolean;
  takedownCamActive?: boolean;
  devTelemetry?: DevTelemetryData;
}

export interface RaceResult {
  mode: RaceMode;
  trackId: TrackId;
  environment: Exclude<EnvironmentId, 'auto'>;
  won: boolean;
  busted: boolean;
  knockedOut?: boolean;
  tollboothExpired?: boolean;
  position: number;
  totalRacers: number;
  totalTimeMs: number;
  bestLapMs: number;
  cashEarned: number;
  bountyEarned: number;
  copsTakedowns: number;
  highestHeat: number;
  shortcutsTaken?: number;
  driftTimeTotalSec?: number;
  airTimeTotalSec?: number;
  smashablesHit?: number;
  nearMissCount?: number;
  speedTrapTotalKmh?: number;
  missionId?: string;
  missionTitle?: string;
  missionCompleted?: boolean;
  missionFailReason?: string;
  isNewTrackWin?: boolean;
  rivalDefeated?: BlacklistRival;
  bossCarAwarded?: CarSpec;
}
