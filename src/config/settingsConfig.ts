import { AiSettings, DEFAULT_AI_SETTINGS } from './aiConfig';
import { AssistSettings, HANDLING_PRESETS, HandlingMode, PhysicsTuningParams } from './physicsConfig';
import { WeatherMode } from './weatherConfig';

export type GraphicsQuality = 'low' | 'medium' | 'high';
export type TouchControlsMode = 'auto' | 'always' | 'off';

export type ControlAction =
  | 'throttle'
  | 'brake'
  | 'left'
  | 'right'
  | 'handbrake'
  | 'nitrous'
  | 'speedbreaker'
  | 'lookLeft'
  | 'lookRight'
  | 'lookBack'
  | 'resetToTrack'
  | 'instantRestart'
  | 'rewind'
  | 'cycleCamera'
  | 'nextMusicTrack'
  | 'toggleTuning'
  | 'toggleTelemetry'
  | 'toggleAiDebug'
  | 'toggleGhost';

export interface KeyBindingPair {
  primary: string;
  secondary?: string;
}

export type ControlBindings = Record<ControlAction, KeyBindingPair>;

export interface GraphicsQualitySpec {
  id: GraphicsQuality;
  label: string;
  description: string;
  pixelRatioCap: number;
  shadowsEnabled: boolean;
  bloomEnabled: boolean;
  rainDensityScale: number;
  particleRateScale: number;
}

export const GRAPHICS_QUALITY_PRESETS: Record<GraphicsQuality, GraphicsQualitySpec> = {
  low: {
    id: 'low',
    label: 'Low',
    description: '1.0x scale, shadows off, bloom off — maximum frame rate.',
    pixelRatioCap: 1.0,
    shadowsEnabled: false,
    bloomEnabled: false,
    rainDensityScale: 0.45,
    particleRateScale: 0.55,
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    description: '1.25x scale, dynamic shadows & bloom enabled.',
    pixelRatioCap: 1.25,
    shadowsEnabled: true,
    bloomEnabled: true,
    rainDensityScale: 0.78,
    particleRateScale: 0.85,
  },
  high: {
    id: 'high',
    label: 'High',
    description: 'Up to 2.0x Retina scale, full shadows, bloom & dense FX.',
    pixelRatioCap: 2.0,
    shadowsEnabled: true,
    bloomEnabled: true,
    rainDensityScale: 1.0,
    particleRateScale: 1.0,
  },
};

export function getDefaultControlBindings(aeLookEnabled = false): ControlBindings {
  return {
    throttle: { primary: 'ArrowUp', secondary: 'KeyW' },
    brake: { primary: 'ArrowDown', secondary: 'KeyS' },
    left: aeLookEnabled ? { primary: 'ArrowLeft' } : { primary: 'KeyA', secondary: 'ArrowLeft' },
    right: aeLookEnabled ? { primary: 'ArrowRight' } : { primary: 'KeyD', secondary: 'ArrowRight' },
    handbrake: { primary: 'Space' },
    nitrous: { primary: 'ShiftLeft', secondary: 'ShiftRight' },
    speedbreaker: { primary: 'KeyX', secondary: 'KeyB' },
    lookLeft: aeLookEnabled ? { primary: 'KeyA' } : { primary: 'KeyQ' },
    lookRight: { primary: 'KeyE' },
    lookBack: { primary: 'KeyL' },
    resetToTrack: { primary: 'KeyR' },
    instantRestart: { primary: 'Backspace' },
    rewind: { primary: 'KeyZ' },
    cycleCamera: { primary: 'KeyC', secondary: 'KeyV' },
    nextMusicTrack: { primary: 'KeyM' },
    toggleTuning: { primary: 'KeyT' },
    toggleTelemetry: { primary: 'F3', secondary: 'Backquote' },
    toggleAiDebug: { primary: 'F4' },
    toggleGhost: { primary: 'KeyG' },
  };
}

export const CONTROL_ACTION_LABELS: { action: ControlAction; label: string; category: 'Driving' | 'Camera & Tools' }[] = [
  { action: 'throttle', label: 'Throttle / Gas', category: 'Driving' },
  { action: 'brake', label: 'Brake / Reverse', category: 'Driving' },
  { action: 'left', label: 'Steer Left', category: 'Driving' },
  { action: 'right', label: 'Steer Right', category: 'Driving' },
  { action: 'handbrake', label: 'Handbrake / Drift', category: 'Driving' },
  { action: 'nitrous', label: 'Nitrous Boost (NOS)', category: 'Driving' },
  { action: 'speedbreaker', label: 'Speedbreaker Slow-Mo', category: 'Driving' },
  { action: 'resetToTrack', label: 'Reset Car to Road', category: 'Driving' },
  { action: 'rewind', label: '5s Rewind', category: 'Driving' },
  { action: 'instantRestart', label: 'Instant Restart Event', category: 'Driving' },
  { action: 'cycleCamera', label: 'Cycle Camera', category: 'Camera & Tools' },
  { action: 'lookLeft', label: 'Look Left', category: 'Camera & Tools' },
  { action: 'lookRight', label: 'Look Right', category: 'Camera & Tools' },
  { action: 'lookBack', label: 'Look Back', category: 'Camera & Tools' },
  { action: 'nextMusicTrack', label: 'Next EA Trax', category: 'Camera & Tools' },
  { action: 'toggleTuning', label: 'Live Physics Tuning', category: 'Camera & Tools' },
  { action: 'toggleTelemetry', label: 'Dev Telemetry Overlay', category: 'Camera & Tools' },
  { action: 'toggleAiDebug', label: 'AI Racing-Line Debug', category: 'Camera & Tools' },
  { action: 'toggleGhost', label: 'Toggle Best Ghost Car', category: 'Camera & Tools' },
];

export function formatKeyCode(code?: string): string {
  if (!code) return '--';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  switch (code) {
    case 'ArrowUp':
      return '↑';
    case 'ArrowDown':
      return '↓';
    case 'ArrowLeft':
      return '←';
    case 'ArrowRight':
      return '→';
    case 'Space':
      return 'Space';
    case 'ShiftLeft':
      return 'L-Shift';
    case 'ShiftRight':
      return 'R-Shift';
    case 'ControlLeft':
      return 'L-Ctrl';
    case 'ControlRight':
      return 'R-Ctrl';
    case 'Backquote':
      return '`';
    case 'Backspace':
      return 'Bksp';
    case 'Enter':
      return 'Enter';
    default:
      return code;
  }
}

export interface PersistedDriverSettings {
  handlingMode: HandlingMode;
  assists: AssistSettings;
  tuning: PhysicsTuningParams;
  aiSettings: AiSettings;
  weatherMode: WeatherMode;
  dynamicDayNight: boolean;
  policeEnabled: boolean;
  showGhost: boolean;
  skipCountdownOnRestart: boolean;
  graphicsQuality: GraphicsQuality;
  touchControlsMode: TouchControlsMode;
  controlBindings: ControlBindings;
}

const SETTINGS_STORAGE_KEY = 'blacklist_rockport_u1_settings_v1';

export function getDefaultDriverSettings(aeLookEnabled = false): PersistedDriverSettings {
  const preset = HANDLING_PRESETS.balanced;
  return {
    handlingMode: 'balanced',
    assists: { ...preset.defaultAssists },
    tuning: { ...preset.tuning },
    aiSettings: { ...DEFAULT_AI_SETTINGS },
    weatherMode: 'auto',
    dynamicDayNight: true,
    policeEnabled: true,
    showGhost: true,
    skipCountdownOnRestart: false,
    graphicsQuality: 'high',
    touchControlsMode: 'auto',
    controlBindings: getDefaultControlBindings(aeLookEnabled),
  };
}

export function loadDriverSettings(aeLookEnabled = false): PersistedDriverSettings {
  const defaults = getDefaultDriverSettings(aeLookEnabled);
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<PersistedDriverSettings>;
    const mode: HandlingMode =
      parsed.handlingMode && parsed.handlingMode in HANDLING_PRESETS ? parsed.handlingMode : 'balanced';
    const preset = HANDLING_PRESETS[mode];
    const quality: GraphicsQuality =
      parsed.graphicsQuality && parsed.graphicsQuality in GRAPHICS_QUALITY_PRESETS
        ? parsed.graphicsQuality
        : 'high';
    const touchMode: TouchControlsMode =
      parsed.touchControlsMode === 'auto' || parsed.touchControlsMode === 'always' || parsed.touchControlsMode === 'off'
        ? parsed.touchControlsMode
        : 'auto';
    const weatherMode: WeatherMode =
      parsed.weatherMode === 'auto' || parsed.weatherMode === 'clear' || parsed.weatherMode === 'rain' || parsed.weatherMode === 'fog'
        ? parsed.weatherMode
        : 'auto';

    const mergedBindings: ControlBindings = { ...defaults.controlBindings, ...(parsed.controlBindings ?? {}) };
    if (
      !aeLookEnabled &&
      mergedBindings.left.primary === 'ArrowLeft' &&
      !mergedBindings.left.secondary &&
      mergedBindings.right.primary === 'ArrowRight' &&
      !mergedBindings.right.secondary &&
      mergedBindings.lookLeft.primary === 'KeyA'
    ) {
      mergedBindings.left = { ...defaults.controlBindings.left };
      mergedBindings.right = { ...defaults.controlBindings.right };
      mergedBindings.lookLeft = { ...defaults.controlBindings.lookLeft };
    }

    return {
      handlingMode: mode,
      assists: { ...preset.defaultAssists, ...(parsed.assists ?? {}) },
      tuning: { ...preset.tuning, ...(parsed.tuning ?? {}) },
      aiSettings: { ...DEFAULT_AI_SETTINGS },
      weatherMode,
      dynamicDayNight: parsed.dynamicDayNight ?? true,
      policeEnabled: parsed.policeEnabled ?? true,
      showGhost: parsed.showGhost ?? true,
      skipCountdownOnRestart: parsed.skipCountdownOnRestart ?? false,
      graphicsQuality: quality,
      touchControlsMode: touchMode,
      controlBindings: mergedBindings,
    };
  } catch {
    return defaults;
  }
}

export function saveDriverSettings(settings: PersistedDriverSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage quota errors
  }
}
