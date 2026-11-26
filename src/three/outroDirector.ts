export type OutroOutcome = 'win' | 'busted' | 'loss';

export interface OutroFrameDirective {
  beat: 1 | 2 | 3;
  slowScale: number;
  orbitAngleOffset: number;
  camDist: number;
  camHeight: number;
  camFov: number;
  camRoll: number;
  lookAheadBias: number;
  lookYOffset: number;
  nosBurst: boolean;
  backfirePulse: boolean;
  fireworkIntensity: number;
  smokeIntensity: number;
  driftYawOffset: number;
  counterSteerAngle: number;
  spinRate: number;
  targetSpeedFactor: number;
  rotorGlow: number;
  cameraCutSnap: boolean;
}

function clamp01(v: number): number {
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(t: number): number {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
}

/**
 * Computes deterministic, multi-beat cinematic camera & vehicle choreography
 * for race endings (victory burnout & fireworks, RPD takedown surround, or defeat flyby).
 */
export function computeOutroDirective(outcome: OutroOutcome, elapsedSec: number): OutroFrameDirective {
  const t = Math.max(0, elapsedSec);

  if (outcome === 'win') {
    if (t < 1.05) {
      // Beat 1: Low-angle front-quarter finish-line NOS hero blast
      const e = smoothstep(t / 1.05);
      return {
        beat: 1,
        slowScale: lerp(0.62, 0.42, e),
        orbitAngleOffset: lerp(2.45, 3.05, e),
        camDist: lerp(4.85, 5.55, e),
        camHeight: lerp(0.95, 1.25, e),
        camFov: lerp(70, 56, e),
        camRoll: lerp(-0.025, 0, e),
        lookAheadBias: lerp(0.85, 0.25, e),
        lookYOffset: 0.72,
        nosBurst: true,
        backfirePulse: false,
        fireworkIntensity: e > 0.55 ? 0.55 : 0.2,
        smokeIntensity: 0.15,
        driftYawOffset: 0,
        counterSteerAngle: 0,
        spinRate: 0,
        targetSpeedFactor: 0.78,
        rotorGlow: 0.15,
        cameraCutSnap: t < 0.06,
      };
    }

    if (t < 2.85) {
      // Beat 2: Sweeping crane arc around clean hero highway rollout + firework burst
      const e = smoothstep((t - 1.05) / 1.8);
      const cranePeak = Math.sin(e * Math.PI);
      return {
        beat: 2,
        slowScale: 0.44,
        orbitAngleOffset: lerp(3.05, 5.25, e),
        camDist: lerp(5.55, 6.2, cranePeak),
        camHeight: lerp(1.25, 1.52, e) + cranePeak * 0.8,
        camFov: lerp(56, 48, e),
        camRoll: Math.sin(e * Math.PI) * 0.018,
        lookAheadBias: lerp(0.25, 0, e),
        lookYOffset: 0.78,
        nosBurst: true,
        backfirePulse: Math.sin(t * 18) > 0.7,
        fireworkIntensity: 1.0,
        smokeIntensity: 0.12,
        driftYawOffset: 0,
        counterSteerAngle: 0,
        spinRate: 0,
        targetSpeedFactor: 0.55,
        rotorGlow: 0.45,
        cameraCutSnap: false,
      };
    }

    // Beat 3: Continuous golden podium orbit showcase
    const tail = t - 2.85;
    return {
      beat: 3,
      slowScale: 0.32,
      orbitAngleOffset: 5.25 + tail * 0.52,
      camDist: 5.65,
      camHeight: 1.44 + Math.sin(tail * 0.9) * 0.12,
      camFov: 47,
      camRoll: 0,
      lookAheadBias: 0,
      lookYOffset: 0.76,
      nosBurst: tail < 1.0 || Math.sin(tail * 2.8) > 0.35,
      backfirePulse: Math.sin(tail * 11) > 0.85,
      fireworkIntensity: tail < 2.2 ? 0.55 : 0.28,
      smokeIntensity: 0.08,
      driftYawOffset: 0,
      counterSteerAngle: 0,
      spinRate: 0,
      targetSpeedFactor: 0.4,
      rotorGlow: 0.35,
      cameraCutSnap: false,
    };
  }

  if (outcome === 'busted') {
    if (t < 1.2) {
      // Beat 1: High chopper drop into tense curb-level Dutch-angle lockdown
      const e = smoothstep(t / 1.2);
      return {
        beat: 1,
        slowScale: lerp(0.22, 0.12, e),
        orbitAngleOffset: lerp(-0.32, 0.72, e),
        camDist: lerp(9.2, 5.55, e),
        camHeight: lerp(5.8, 1.72, e),
        camFov: lerp(62, 47, e),
        camRoll: lerp(-0.088, 0.055, e),
        lookAheadBias: 0,
        lookYOffset: 0.74,
        nosBurst: false,
        backfirePulse: false,
        fireworkIntensity: 0,
        smokeIntensity: 0.85,
        driftYawOffset: 0,
        counterSteerAngle: 0.22,
        spinRate: 0,
        targetSpeedFactor: 0,
        rotorGlow: 0.88,
        cameraCutSnap: t < 0.06,
      };
    }

    // Beat 2: Tight RPD siren surround perimeter orbit
    const tail = t - 1.2;
    return {
      beat: 2,
      slowScale: 0.12,
      orbitAngleOffset: 0.72 + tail * 0.50,
      camDist: 5.55 + Math.sin(tail * 0.8) * 0.35,
      camHeight: 1.72 + Math.cos(tail * 0.7) * 0.18,
      camFov: 47,
      camRoll: 0.052 + Math.sin(tail * 1.4) * 0.015,
      lookAheadBias: 0,
      lookYOffset: 0.74,
      nosBurst: false,
      backfirePulse: false,
      fireworkIntensity: 0,
      smokeIntensity: 0.65,
      driftYawOffset: 0,
      counterSteerAngle: 0.22,
      spinRate: 0,
      targetSpeedFactor: 0,
      rotorGlow: 0.65,
      cameraCutSnap: false,
    };
  }

  // outcome === 'loss': Beat 1 low rival flyby tracking -> Beat 2 smooth pullback crane orbit
  if (t < 1.35) {
    const e = smoothstep(t / 1.35);
    return {
      beat: 1,
      slowScale: lerp(0.45, 0.32, e),
      orbitAngleOffset: lerp(2.55, 1.25, e),
      camDist: lerp(4.85, 6.05, e),
      camHeight: lerp(1.08, 1.78, e),
      camFov: lerp(58, 49, e),
      camRoll: lerp(0.024, 0, e),
      lookAheadBias: 0.45,
      lookYOffset: 0.76,
      nosBurst: false,
      backfirePulse: false,
      fireworkIntensity: 0,
      smokeIntensity: 0.25,
      driftYawOffset: 0,
      counterSteerAngle: 0,
      spinRate: 0,
      targetSpeedFactor: 0.55,
      rotorGlow: 0.92,
      cameraCutSnap: t < 0.06,
    };
  }

  const tail = t - 1.35;
  return {
    beat: 2,
    slowScale: 0.26,
    orbitAngleOffset: 1.25 + tail * 0.44,
    camDist: 6.05,
    camHeight: 1.82 + Math.sin(tail * 0.6) * 0.12,
    camFov: 48,
    camRoll: 0,
    lookAheadBias: 0.15,
    lookYOffset: 0.76,
    nosBurst: false,
    backfirePulse: false,
    fireworkIntensity: 0,
    smokeIntensity: 0.15,
    driftYawOffset: 0,
    counterSteerAngle: 0,
    spinRate: 0,
    targetSpeedFactor: 0.35,
    rotorGlow: 0.55,
    cameraCutSnap: false,
  };
}
