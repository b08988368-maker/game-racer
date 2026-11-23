export interface HeatPoliceSpec {
  heat: number;
  unitName: string;
  topSpeedKmh: number;
  accelMps2: number;
  maxSteerRate: number;
  massKg: number;
  rhinoTopSpeedKmh: number;
  rhinoMassKg: number;
  losRangeM: number;
  helicopterLocked: boolean;
  roadblockAllowed: boolean;
  desiredUnitsMin: number;
  desiredUnitsMax: number;
}

export const HEAT_POLICE_SPECS: Record<number, HeatPoliceSpec> = {
  1: {
    heat: 1,
    unitName: 'RPD Patrol Cruiser',
    topSpeedKmh: 214,
    accelMps2: 11.5,
    maxSteerRate: 2.35,
    massKg: 1760,
    rhinoTopSpeedKmh: 205,
    rhinoMassKg: 3200,
    losRangeM: 92,
    helicopterLocked: false,
    roadblockAllowed: false,
    desiredUnitsMin: 2,
    desiredUnitsMax: 3,
  },
  2: {
    heat: 2,
    unitName: 'RPD Pursuit Unit',
    topSpeedKmh: 238,
    accelMps2: 13.0,
    maxSteerRate: 2.45,
    massKg: 1800,
    rhinoTopSpeedKmh: 215,
    rhinoMassKg: 3250,
    losRangeM: 102,
    helicopterLocked: false,
    roadblockAllowed: true,
    desiredUnitsMin: 3,
    desiredUnitsMax: 4,
  },
  3: {
    heat: 3,
    unitName: 'State Interceptor + Rhinos',
    topSpeedKmh: 262,
    accelMps2: 14.5,
    maxSteerRate: 2.6,
    massKg: 1740,
    rhinoTopSpeedKmh: 228,
    rhinoMassKg: 3400,
    losRangeM: 112,
    helicopterLocked: false,
    roadblockAllowed: true,
    desiredUnitsMin: 3,
    desiredUnitsMax: 5,
  },
  4: {
    heat: 4,
    unitName: 'Federal Corvette + Chopper',
    topSpeedKmh: 288,
    accelMps2: 16.2,
    maxSteerRate: 2.75,
    massKg: 1680,
    rhinoTopSpeedKmh: 238,
    rhinoMassKg: 3450,
    losRangeM: 120,
    helicopterLocked: true,
    roadblockAllowed: true,
    desiredUnitsMin: 4,
    desiredUnitsMax: 5,
  },
  5: {
    heat: 5,
    unitName: 'Cross Elite Task Force',
    topSpeedKmh: 312,
    accelMps2: 18.0,
    maxSteerRate: 2.9,
    massKg: 1720,
    rhinoTopSpeedKmh: 252,
    rhinoMassKg: 3600,
    losRangeM: 128,
    helicopterLocked: true,
    roadblockAllowed: true,
    desiredUnitsMin: 4,
    desiredUnitsMax: 6,
  },
};

export const POLICE_DESPAWN_DIST_M = 285;
export const POLICE_SPAWN_AHEAD_MIN_SAMPLES = 55;
export const POLICE_SPAWN_AHEAD_MAX_SAMPLES = 78;
export const POLICE_PURSUIT_BREAKER_RADIUS_M = 38;
export const POLICE_COOLDOWN_EVADE_BASE_RATE = 18;
export const POLICE_COOLDOWN_BAY_EVADE_RATE = 58;
export const POLICE_LOS_BREAK_GRACE_SEC = 1.25;

/** Dramatic Takedown & Crash Camera constants */
export const TAKEDOWN_CAM_DURATION_SEC = 1.15;
export const TAKEDOWN_CAM_TIMESCALE = 0.28;
export const HEAVY_CRASH_DAMAGE_THRESHOLD_KMH = 135;
