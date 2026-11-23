export type WeatherMode = 'auto' | 'clear' | 'rain' | 'fog';
export type ActiveWeatherState = 'clear' | 'rain' | 'fog';

export interface WeatherSnapshot {
  activeWeather: ActiveWeatherState;
  rainIntensity: number; // 0..1
  fogMultiplier: number; // 1.0..2.8
  roadWetness: number; // 0..1
  timeOfDayPhase: number; // 0 (dawn) -> 0.33 (noon) -> 0.62 (dusk) -> 0.85 (midnight)
  sunIntensityScale: number;
  ambientBrightness: number;
}

export const WEATHER_MODE_OPTIONS: { id: WeatherMode; label: string; desc: string }[] = [
  { id: 'auto', label: 'Dynamic Cycle', desc: 'Weather shifts smoothly between clear, fog & rain squalls.' },
  { id: 'clear', label: 'Clear Skies', desc: 'Dry asphalt with maximum tire grip and crisp visibility.' },
  { id: 'rain', label: 'Rainstorm', desc: 'Slick wet tarmac, shimmering reflections & reduced grip.' },
  { id: 'fog', label: 'Coastal Fog', desc: 'Dense Rockport bay fog reducing long-range visibility.' },
];

export const WEATHER_CYCLE_PERIOD_SEC = 105;
export const DAY_NIGHT_CYCLE_PERIOD_SEC = 180;

export function getInitialTimePhaseForEnv(
  env: 'golden_dusk' | 'midnight_neon' | 'overcast_rain' | 'noon_clear' | 'dawn_mist' | 'crimson_foundry',
): number {
  switch (env) {
    case 'dawn_mist':
      return 0.08;
    case 'noon_clear':
      return 0.34;
    case 'golden_dusk':
    case 'crimson_foundry':
      return 0.62;
    case 'overcast_rain':
      return 0.52;
    case 'midnight_neon':
      return 0.86;
    default:
      return 0.62;
  }
}

/**
 * Zero-GC evaluator writing directly into `out` so the main render loop allocates nothing.
 */
export function evaluateWeatherAndTime(
  mode: WeatherMode,
  env: 'golden_dusk' | 'midnight_neon' | 'overcast_rain' | 'noon_clear' | 'dawn_mist' | 'crimson_foundry',
  raceElapsedSec: number,
  dynamicDayNight: boolean,
  prevWetness: number,
  dt: number,
  out: WeatherSnapshot,
): void {
  const basePhase = getInitialTimePhaseForEnv(env);
  const phase = dynamicDayNight
    ? (basePhase + raceElapsedSec / DAY_NIGHT_CYCLE_PERIOD_SEC) % 1
    : basePhase;
  out.timeOfDayPhase = phase;

  // Daylight curve: brightest at noon (~0.34), dimmest at midnight (~0.86)
  const sunWave = Math.sin((phase - 0.05) * Math.PI * 2);
  const dayFactor = Math.max(0, Math.min(1, 0.52 + sunWave * 0.48));
  out.sunIntensityScale = 0.42 + dayFactor * 0.72;
  out.ambientBrightness = 0.48 + dayFactor * 0.52;

  let targetRain = 0;
  let targetFog = 1.0;
  let activeWeather: ActiveWeatherState = 'clear';

  if (mode === 'rain') {
    targetRain = 0.92;
    targetFog = 1.48;
    activeWeather = 'rain';
  } else if (mode === 'fog') {
    targetRain = 0;
    targetFog = 2.65;
    activeWeather = 'fog';
  } else if (mode === 'clear') {
    targetRain = 0;
    targetFog = env === 'dawn_mist' ? 1.35 : 0.92;
    activeWeather = 'clear';
  } else {
    // Dynamic auto cycle: starts from the track's natural weather feel then transitions smoothly
    const startOffset = env === 'overcast_rain' ? 0.56 : env === 'dawn_mist' ? 0.28 : 0.0;
    const wCycle = ((raceElapsedSec / WEATHER_CYCLE_PERIOD_SEC) + startOffset) % 1;
    if (wCycle < 0.36) {
      activeWeather = 'clear';
      targetRain = 0;
      targetFog = 0.96;
    } else if (wCycle < 0.56) {
      activeWeather = 'fog';
      const f = Math.sin(((wCycle - 0.36) / 0.2) * Math.PI);
      targetRain = 0;
      targetFog = 1.0 + f * 1.45;
    } else if (wCycle < 0.86) {
      activeWeather = 'rain';
      const r = Math.sin(((wCycle - 0.56) / 0.3) * Math.PI);
      targetRain = 0.38 + r * 0.62;
      targetFog = 1.25 + r * 0.45;
    } else {
      activeWeather = 'clear';
      targetRain = 0;
      targetFog = 1.05;
    }
  }

  out.activeWeather = activeWeather;
  out.rainIntensity = targetRain;
  out.fogMultiplier = targetFog;

  // Road gets wet faster during rain, and dries gradually afterward
  const targetWet = Math.max(targetRain > 0.15 ? Math.min(1, 0.45 + targetRain * 0.55) : 0, env === 'overcast_rain' && mode === 'auto' ? 0.55 : 0);
  const rate = targetWet > prevWetness ? 0.22 : 0.065;
  out.roadWetness = prevWetness + (targetWet - prevWetness) * Math.min(1, rate * Math.max(0.001, dt));
}
