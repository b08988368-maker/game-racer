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
    topSpeedKmh: 248,
    accelMps2: 13.6,
    maxSteerRate: 2.7,
    massKg: 1840,
    rhinoTopSpeedKmh: 235,
    rhinoMassKg: 3350,
    losRangeM: 108,
    helicopterLocked: false,
    roadblockAllowed: false,
    desiredUnitsMin: 2,
    desiredUnitsMax: 3,
  },
  2: {
    heat: 2,
    unitName: 'RPD Pursuit Unit',
    topSpeedKmh: 274,
    accelMps2: 15.2,
    maxSteerRate: 2.82,
    massKg: 1880,
    rhinoTopSpeedKmh: 248,
    rhinoMassKg: 3420,
    losRangeM: 118,
    helicopterLocked: false,
    roadblockAllowed: true,
    desiredUnitsMin: 3,
    desiredUnitsMax: 4,
  },
  3: {
    heat: 3,
    unitName: 'State Interceptor + Rhinos',
    topSpeedKmh: 302,
    accelMps2: 16.8,
    maxSteerRate: 2.96,
    massKg: 1820,
    rhinoTopSpeedKmh: 262,
    rhinoMassKg: 3560,
    losRangeM: 130,
    helicopterLocked: false,
    roadblockAllowed: true,
    desiredUnitsMin: 4,
    desiredUnitsMax: 5,
  },
  4: {
    heat: 4,
    unitName: 'Federal Corvette + Chopper',
    topSpeedKmh: 332,
    accelMps2: 18.8,
    maxSteerRate: 3.12,
    massKg: 1760,
    rhinoTopSpeedKmh: 274,
    rhinoMassKg: 3650,
    losRangeM: 140,
    helicopterLocked: true,
    roadblockAllowed: true,
    desiredUnitsMin: 4,
    desiredUnitsMax: 6,
  },
  5: {
    heat: 5,
    unitName: 'Cross Elite Task Force',
    topSpeedKmh: 358,
    accelMps2: 20.8,
    maxSteerRate: 3.3,
    massKg: 1820,
    rhinoTopSpeedKmh: 290,
    rhinoMassKg: 3800,
    losRangeM: 150,
    helicopterLocked: true,
    roadblockAllowed: true,
    desiredUnitsMin: 5,
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
export const TAKEDOWN_CAM_DURATION_SEC = 0.78;
export const TAKEDOWN_CAM_TIMESCALE = 0.44;
export const HEAVY_CRASH_DAMAGE_THRESHOLD_KMH = 198;
