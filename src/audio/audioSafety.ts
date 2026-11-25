export const MAX_CONCURRENT_SFX_VOICES = 14;

export const SFX_COOLDOWN_MS = {
  impact: 90,
  woodSmash: 75,
  exhaustPop: 75,
  turboBlowoff: 180,
  beep: 60,
  landingThump: 140,
  garageRev: 300,
  cameraFlash: 120,
  radioSquelch: 180,
  upgradeClunk: 70,
  uiClick: 35,
} as const;

export function clampAudioValue(
  value: number,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function shouldTriggerCooldown(
  lastTriggeredMs: number,
  nowMs: number,
  minIntervalMs: number,
): boolean {
  if (!Number.isFinite(nowMs) || !Number.isFinite(minIntervalMs)) return false;
  if (!Number.isFinite(lastTriggeredMs) || lastTriggeredMs < 0) return true;
  return nowMs - lastTriggeredMs >= minIntervalMs;
}

export function stepMusicLookaheadWindow(
  nextTime: number,
  currentTime: number,
  stepDur: number,
  maxStepsPerTick = 3,
): { startTime: number; maxSteps: number } {
  const safeStep = clampAudioValue(stepDur, 0.1, 0.04, 1.0);
  const safeNow = Number.isFinite(currentTime) ? currentTime : 0;
  let startTime = Number.isFinite(nextTime) ? nextTime : safeNow + 0.03;
  // Prevent catch-up avalanches if tab/frame stalled briefly
  if (startTime < safeNow - safeStep * 1.5) {
    startTime = safeNow + 0.025;
  }
  return {
    startTime,
    maxSteps: Math.max(1, Math.floor(maxStepsPerTick)),
  };
}
