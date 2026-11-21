export type RaceMode =
  | 'circuit'
  | 'sprint'
  | 'knockout'
  | 'tollbooth'
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
  | 'crimson_foundry';

export type TrackDifficulty = 'Easy' | 'Medium' | 'Hard' | 'Expert';

export type LiveryStyle = 'clean' | 'stripes' | 'most_wanted' | 'boss_carbon';
export type RimStyle = 'chrome' | 'black' | 'gold' | 'bronze';

export type CameraMode = 'chase_far' | 'chase_close' | 'hood';

export type PursuitState = 'none' | 'pursuit' | 'cooldown' | 'evaded' | 'busted';

export interface CarSpec {
  id: string;
  name: string;
  brand: string;
  tier: number;
  price: number;
  unlockRank: number; // 11 = starter/open, 10..1 = unlocked after defeating Blacklist #10..#1
  bossOnly?: boolean; // Exclusive Pink-Slip vehicle — cannot be purchased in dealership
  bossRank?: number; // 10..1 Blacklist rival rank that awards this car
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
  engineLevel: number; // 1..4
  turboLevel: number; // 1..4
  nitrousLevel: number; // 1..4
  tiresLevel: number; // 1..4
  paintHex: string;
  livery: LiveryStyle;
  rimStyle: RimStyle;
}

export interface BlacklistRival {
  rank: number; // 10 down to 1
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
  aiSkill: number; // 0.78 to 0.98
  quote: string;
}

export interface TrackMetadata {
  id: TrackId;
  name: string;
  district: string;
  difficulty: TrackDifficulty;
  styleTag: string;
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
  blacklistDefeated: number; // 0..10
  racesWon: number;
  copsTakedowns: number;
  bestLapMs: number;
  highestHeat: number;
  selectedCarId: string;
  ownedCarIds: string[];
  wonTrackIds: string[];
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

export interface RaceTelemetry {
  speedKmh: number;
  rpm: number; // 0..1
  gear: number; // -1 (R), 0 (N), 1..6
  nitrous: number; // 0..100
  speedbreaker: number; // 0..100
  isSpeedbreakerActive: boolean;
  isNitrousActive: boolean;
  isDrifting: boolean;
  isSlipstreaming: boolean;
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
  progress: number; // 0..1
  wrongWay: boolean;
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
  environment: Exclude<EnvironmentId, 'auto'>;
  patrolsEnabled: boolean;
  radioDispatch: string | null;
  callout: { text: string; tone: 'amber' | 'cyan' | 'red' | 'emerald'; id: number } | null;
  minimapPath: { x: number; z: number }[];
  minimapShortcuts?: { x: number; z: number }[][];
  minimapBlips: MinimapBlip[];
  cameraMode: CameraMode;
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
  isNewTrackWin?: boolean;
  rivalDefeated?: BlacklistRival;
  bossCarAwarded?: CarSpec;
}
