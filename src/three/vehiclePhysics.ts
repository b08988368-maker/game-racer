import * as THREE from 'three';
import {
  AssistSettings,
  computeGearboxDriveState,
  PhysicsTuningParams,
  STANDARD_GRAVITY_MPS2,
  SURFACE_MODIFIERS,
  SurfaceType,
} from '../config/physicsConfig';
import { CarSpec, EnvironmentId, TrackId, WheelTelemetry } from '../types/game';

export interface WheelRuntimeState {
  id: 'FL' | 'FR' | 'RL' | 'RR';
  compression: number;
  compressionVel: number;
  loadN: number;
  slipRatio: number;
  slipAngleRad: number;
  angularVelRadSec: number;
  brakeTemp: number; // 0..1 rotor thermal glow
  surface: SurfaceType;
}

export interface VehicleDynamicsState {
  wheels: [WheelRuntimeState, WheelRuntimeState, WheelRuntimeState, WheelRuntimeState];
  prevForwardSpeed: number;
  prevLateralSpeed: number;
  yawRate: number;
  longAccelG: number;
  latAccelG: number;
  heaveOffset: number;
  currentSurface: SurfaceType;
  surfacePhase: number;
  absPulsePhase: number;
  lastGear: number;
  shiftDipTimer: number;
  wasAirborne: boolean;
  targetLoads: [number, number, number, number];
}

export interface VehicleStepInput {
  dt: number;
  rawDt: number;
  forwardSpeed: number;
  lateralSpeed: number;
  steerAngle: number;
  rawSteerInput: number;
  throttleInput: boolean;
  brakeInput: boolean;
  handbrakeInput: boolean;
  throttleAxis: number;
  brakeAxis: number;
  nosActive: boolean;
  driftBoostActive: boolean;
  drafting: boolean;
  airborne: boolean;
  spikedTimer: number;
  isSpeedbreaker: boolean;
  baseMaxMs: number;
  maxForwardMs: number;
  accelStat: number;
  handlingStat: number;
  bodyStyle: CarSpec['bodyStyle'];
  upcomingTurnSeverity: number; // 0..1 curvature ahead for optional brake assist
  lateralOffset: number;
  roadHalfWidth: number;
  inShortcut: boolean;
  shortcutLateral: number;
  shortcutHalfWidth: number;
  environment: Exclude<EnvironmentId, 'auto'>;
  trackId: TrackId;
  roadWetness?: number;
  slopePitch?: number;
  bankAngle?: number;
  landingVelMps?: number;
  damageDragFactor?: number;
  alignmentPull?: number;
  wheelRadiusM?: number;
  tuning: PhysicsTuningParams;
  assists: AssistSettings;
}

export interface VehicleStepOutput {
  forwardSpeed: number;
  lateralSpeed: number;
  yawRate: number;
  heaveOffset: number;
  targetPitch: number;
  targetRoll: number;
  wheelspinIntensity: number;
  surface: SurfaceType;
  absActive: boolean;
  tcsActive: boolean;
}

export function createVehicleDynamicsState(): VehicleDynamicsState {
  return {
    wheels: [
      { id: 'FL', compression: 0.42, compressionVel: 0, loadN: 3500, slipRatio: 0, slipAngleRad: 0, angularVelRadSec: 0, brakeTemp: 0, surface: 'asphalt' },
      { id: 'FR', compression: 0.42, compressionVel: 0, loadN: 3500, slipRatio: 0, slipAngleRad: 0, angularVelRadSec: 0, brakeTemp: 0, surface: 'asphalt' },
      { id: 'RL', compression: 0.42, compressionVel: 0, loadN: 3500, slipRatio: 0, slipAngleRad: 0, angularVelRadSec: 0, brakeTemp: 0, surface: 'asphalt' },
      { id: 'RR', compression: 0.42, compressionVel: 0, loadN: 3500, slipRatio: 0, slipAngleRad: 0, angularVelRadSec: 0, brakeTemp: 0, surface: 'asphalt' },
    ],
    prevForwardSpeed: 0,
    prevLateralSpeed: 0,
    yawRate: 0,
    longAccelG: 0,
    latAccelG: 0,
    heaveOffset: 0,
    currentSurface: 'asphalt',
    surfacePhase: 0,
    absPulsePhase: 0,
    lastGear: 0,
    shiftDipTimer: 0,
    wasAirborne: false,
    targetLoads: [3500, 3500, 3500, 3500],
  };
}

export function detectSurfaceType(
  trackId: TrackId,
  environment: Exclude<EnvironmentId, 'auto'>,
  lateralOffset: number,
  roadHalfWidth: number,
  inShortcut: boolean,
  shortcutLateral: number,
  shortcutHalfWidth: number,
): SurfaceType {
  const isRain = environment === 'overcast_rain';

  if (inShortcut) {
    const absSc = Math.abs(shortcutLateral);
    if (absSc <= shortcutHalfWidth - 0.55) {
      if (trackId === 'rosewood_canyon' || trackId === 'silverton_pass') {
        return 'gravel';
      }
      return isRain ? 'wet_asphalt' : 'asphalt';
    }
    return isRain ? 'gravel' : 'dirt';
  }

  const absLat = Math.abs(lateralOffset);
  if (absLat <= roadHalfWidth - 0.52) {
    return isRain ? 'wet_asphalt' : 'asphalt';
  }
  if (absLat <= roadHalfWidth + 0.58) {
    // Rumble curb / compacted shoulder
    return isRain ? 'wet_asphalt' : 'gravel';
  }

  // Outer verge depends on track biome
  if (trackId === 'camden_coast' || trackId === 'gray_point_bay') {
    return 'sand';
  }
  if (trackId === 'heritage_forest' || trackId === 'rosewood_park') {
    return 'grass';
  }
  if (trackId === 'rosewood_canyon' || trackId === 'silverton_pass' || trackId === 'blackridge_summit') {
    return 'dirt';
  }
  return 'gravel';
}

function pacejkaFormula(slip: number, B: number, C: number, D: number, E: number): number {
  const bs = B * slip;
  const inner = bs - E * (bs - Math.atan(bs));
  return D * Math.sin(C * Math.atan(inner));
}

function getVehicleMassKg(bodyStyle: CarSpec['bodyStyle']): number {
  switch (bodyStyle) {
    case 'exotic':
      return 1340;
    case 'gtr':
      return 1410;
    case 'coupe':
      return 1390;
    case 'sedan':
      return 1510;
    case 'muscle':
      return 1610;
  }
}

export function stepVehiclePhysics(
  dyn: VehicleDynamicsState,
  inp: VehicleStepInput,
  out: VehicleStepOutput,
): void {
  const { dt, tuning, assists } = inp;
  const massKg = getVehicleMassKg(inp.bodyStyle);
  const slopePitch = THREE.MathUtils.clamp(inp.slopePitch ?? 0, -0.35, 0.35);
  const bankAngle = THREE.MathUtils.clamp(inp.bankAngle ?? 0, -0.35, 0.35);
  const bankNormalScale = inp.airborne ? 1.0 : Math.cos(bankAngle) * Math.cos(slopePitch);
  const staticWeightN = massKg * STANDARD_GRAVITY_MPS2 * bankNormalScale;
  const wheelbaseM = 2.74;
  const trackWidthM = 1.66;
  const cgHeightM = 0.47;

  // 1. Detect road surface under main body & shoulders + dynamic rain wetness blend
  const effWet = THREE.MathUtils.clamp(
    inp.roadWetness ?? (inp.environment === 'overcast_rain' ? 0.85 : 0),
    0,
    1,
  );
  const rawCenterSurface = detectSurfaceType(
    inp.trackId,
    inp.environment,
    inp.lateralOffset,
    inp.roadHalfWidth,
    inp.inShortcut,
    inp.shortcutLateral,
    inp.shortcutHalfWidth,
  );
  const centerSurface: SurfaceType =
    rawCenterSurface === 'asphalt' && effWet > 0.28 ? 'wet_asphalt' : rawCenterSurface;
  dyn.currentSurface = centerSurface;
  const halfCarLat = 0.82;
  const rawLeft = detectSurfaceType(
    inp.trackId,
    inp.environment,
    inp.lateralOffset - halfCarLat,
    inp.roadHalfWidth,
    inp.inShortcut,
    inp.shortcutLateral - halfCarLat,
    inp.shortcutHalfWidth,
  );
  const rawRight = detectSurfaceType(
    inp.trackId,
    inp.environment,
    inp.lateralOffset + halfCarLat,
    inp.roadHalfWidth,
    inp.inShortcut,
    inp.shortcutLateral + halfCarLat,
    inp.shortcutHalfWidth,
  );
  const leftSurface: SurfaceType = rawLeft === 'asphalt' && effWet > 0.28 ? 'wet_asphalt' : rawLeft;
  const rightSurface: SurfaceType = rawRight === 'asphalt' && effWet > 0.28 ? 'wet_asphalt' : rawRight;
  dyn.wheels[0].surface = leftSurface;
  dyn.wheels[1].surface = rightSurface;
  dyn.wheels[2].surface = leftSurface;
  dyn.wheels[3].surface = rightSurface;

  const leftSpec = SURFACE_MODIFIERS[leftSurface];
  const rightSpec = SURFACE_MODIFIERS[rightSurface];
  // Smooth continuous grip curve between dry asphalt and flooded wet_asphalt
  const wetAsphaltScale =
    effWet > 0 && (rawLeft === 'asphalt' || rawRight === 'asphalt')
      ? THREE.MathUtils.lerp(1.0, 0.94, effWet)
      : 1.0;
  const avgGripMult = (leftSpec.gripMultiplier + rightSpec.gripMultiplier) * 0.5 * wetAsphaltScale;
  const avgRollingRes = (leftSpec.rollingResistance + rightSpec.rollingResistance) * 0.5;
  const surfaceSpec = SURFACE_MODIFIERS[centerSurface];

  // 2. Aerodynamic drag & speed-dependent ground-effect downforce
  const absFwd = Math.abs(inp.forwardSpeed);
  const vSq = inp.forwardSpeed * absFwd;
  const baseLaunchAccel = 4.4 + (inp.accelStat / 100) * 9.8;
  const baseAeroCoeff = (baseLaunchAccel * 0.56) / (inp.baseMaxMs * inp.baseMaxMs);
  const aeroDragDecel = baseAeroCoeff * tuning.aeroDrag * vSq;
  const rollingDragDecel =
    avgRollingRes * (inp.airborne ? 0.05 : 1.0) * Math.sign(inp.forwardSpeed);

  // Downforce in Newtons (at 80 m/s ~= 288 km/h gives ~3200 N total with aeroDownforce=1.0)
  const downforceTotalN = inp.airborne ? 0 : 0.50 * tuning.aeroDownforce * (inp.forwardSpeed * inp.forwardSpeed);
  const aeroFrontN = downforceTotalN * 0.42;
  const aeroRearN = downforceTotalN * 0.58;

  // 3. 6-Speed Gearbox Torque Delivery + Optional Brake Assist & TCS & ABS
  let effectiveThrottle = inp.throttleInput ? Math.max(0.2, inp.throttleAxis) : 0;
  let effectiveBrake = inp.brakeInput ? Math.max(0.2, inp.brakeAxis) : 0;

  if (!inp.airborne && assists.brakeAssist && inp.upcomingTurnSeverity > 0.42 && absFwd > 36) {
    const safeCornerSpeed = THREE.MathUtils.lerp(72, 34, inp.upcomingTurnSeverity);
    if (absFwd > safeCornerSpeed && !inp.nosActive) {
      const assistDemand = THREE.MathUtils.clamp((absFwd - safeCornerSpeed) / 28, 0.12, 0.55);
      effectiveBrake = Math.max(effectiveBrake, assistDemand);
      effectiveThrottle *= 1 - assistDemand * 0.65;
    }
  }

  const gearbox = computeGearboxDriveState(inp.forwardSpeed, effectiveThrottle > 0.05);
  if (!inp.airborne && gearbox.gear > dyn.lastGear && dyn.lastGear >= 1 && effectiveThrottle > 0.35 && !inp.nosActive) {
    dyn.shiftDipTimer = 0.055;
  }
  dyn.lastGear = gearbox.gear;
  if (dyn.shiftDipTimer > 0) {
    dyn.shiftDipTimer = Math.max(0, dyn.shiftDipTimer - dt);
  }
  const shiftTorqueCut = dyn.shiftDipTimer > 0 ? 0.52 : 1.0;

  const dmgDrag = THREE.MathUtils.clamp(inp.damageDragFactor ?? 0, 0, 0.12);
  const dmgAccelScale = 1 - dmgDrag * 0.72;
  const speedNorm = Math.min(1.18, Math.max(0, inp.forwardSpeed) / inp.baseMaxMs);
  const torqueCurve = Math.max(0.56, (1.0 - 0.28 * Math.min(1, speedNorm)) * (0.65 + 0.35 * gearbox.torqueMult));
  const boostFactor = (inp.nosActive ? 1.48 : inp.driftBoostActive ? 1.33 : 1.0) * (inp.drafting ? 1.18 : 1.0);
  const driveAccel = baseLaunchAccel * torqueCurve * boostFactor * shiftTorqueCut * dmgAccelScale;

  let nextFwd = inp.forwardSpeed;
  let tcsActive = false;
  let absActive = false;
  let wheelspinIntensity = 0;

  // Compute surface-scaled longitudinal traction ceiling
  const tractionGripScale = THREE.MathUtils.clamp(
    avgGripMult * tuning.tireGripMultiplier * (inp.spikedTimer > 0 ? 0.68 : 1.0),
    0.42,
    1.55,
  );

  const slopeGravityDecel = inp.airborne ? 0 : STANDARD_GRAVITY_MPS2 * Math.sin(slopePitch);
  const wetBrakeScale = effWet > 0.2 ? THREE.MathUtils.lerp(1.0, 0.86, effWet) : 1.0;

  if (!inp.airborne) {
    if (effectiveThrottle > 0.01) {
      if (nextFwd < 0) {
        nextFwd += (29 * effectiveThrottle - slopeGravityDecel) * dt;
      } else {
        const rawLongSlip =
          nextFwd < 20 && !inp.nosActive
            ? THREE.MathUtils.clamp((1 - nextFwd / 20) * 0.65 * effectiveThrottle / Math.max(0.55, tractionGripScale), 0, 0.95)
            : 0.06 * effectiveThrottle;

        if (assists.tcs && rawLongSlip > 0.18 && !inp.handbrakeInput) {
          tcsActive = true;
          wheelspinIntensity = rawLongSlip * 0.32;
          const gripTractionFactor = THREE.MathUtils.clamp(tractionGripScale * 1.06, 0.65, 1.12);
          nextFwd += (driveAccel * effectiveThrottle * gripTractionFactor - aeroDragDecel - rollingDragDecel - slopeGravityDecel) * dt;
        } else {
          wheelspinIntensity = rawLongSlip > 0.2 ? rawLongSlip : 0;
          const spinLoss = rawLongSlip > 0.3 ? 1 - (rawLongSlip - 0.3) * 0.25 : 1.0;
          const gripTractionFactor = THREE.MathUtils.clamp(0.74 + tractionGripScale * 0.28, 0.62, 1.14);
          nextFwd += (driveAccel * effectiveThrottle * spinLoss * gripTractionFactor - aeroDragDecel - rollingDragDecel - slopeGravityDecel) * dt;
        }
      }
    } else if (effectiveBrake > 0.01) {
      if (nextFwd > 1.2) {
        dyn.absPulsePhase += dt * 48;
        const brakeDecelBase = 33.5 * effectiveBrake * wetBrakeScale;
        if (assists.abs) {
          absActive = effectiveBrake > 0.55;
          const absGrip = THREE.MathUtils.clamp(avgGripMult * tuning.tireGripMultiplier * 1.04, 0.55, 1.25);
          nextFwd -= (brakeDecelBase * absGrip + aeroDragDecel + rollingDragDecel + slopeGravityDecel) * dt;
        } else {
          const lockPulse = 0.84 + Math.sin(dyn.absPulsePhase) * 0.04;
          nextFwd -= (brakeDecelBase * avgGripMult * lockPulse + aeroDragDecel + rollingDragDecel + slopeGravityDecel) * dt;
        }
      } else {
        nextFwd -= (15.0 * effectiveBrake + slopeGravityDecel) * dt;
      }
    } else {
      nextFwd -= (Math.sign(nextFwd) * 2.1 + aeroDragDecel + rollingDragDecel + slopeGravityDecel) * dt;
      if (Math.abs(nextFwd) < 0.25 && Math.abs(slopeGravityDecel) < 0.6) nextFwd = 0;
    }
  }

  const dmgTopSpeedCap = inp.maxForwardMs * (1 - dmgDrag);
  nextFwd = THREE.MathUtils.clamp(nextFwd, -22, dmgTopSpeedCap);

  // 4. Longitudinal & lateral accelerations (g-units) + Weight Transfer + Per-Wheel Suspension ODE
  const axMps2 = dt > 0 ? THREE.MathUtils.clamp((nextFwd - dyn.prevForwardSpeed) / dt, -28, 28) : 0;
  const ayMps2 = dt > 0 ? THREE.MathUtils.clamp(inp.forwardSpeed * dyn.yawRate, -30, 30) : 0;
  dyn.longAccelG = THREE.MathUtils.damp(dyn.longAccelG, axMps2 / STANDARD_GRAVITY_MPS2, 14, dt);
  dyn.latAccelG = THREE.MathUtils.damp(dyn.latAccelG, ayMps2 / STANDARD_GRAVITY_MPS2, 14, dt);

  const longTransferN =
    ((massKg * axMps2 * cgHeightM) / wheelbaseM) * tuning.weightTransfer;
  const latTransferFrontN =
    ((massKg * ayMps2 * cgHeightM) / trackWidthM) * 0.46 * tuning.weightTransfer;
  const latTransferRearN =
    ((massKg * ayMps2 * cgHeightM) / trackWidthM) * 0.54 * tuning.weightTransfer;

  const baseFrontWheelN = (staticWeightN * 0.52 + aeroFrontN) * 0.5;
  const baseRearWheelN = (staticWeightN * 0.48 + aeroRearN) * 0.5;

  const targetLoads = dyn.targetLoads;
  // Left turn produces positive ayMps2 (+X outward on car frame), loading outside right tires (+latTransfer)
  targetLoads[0] = Math.max(350, baseFrontWheelN - longTransferN * 0.5 - latTransferFrontN); // FL
  targetLoads[1] = Math.max(350, baseFrontWheelN - longTransferN * 0.5 + latTransferFrontN); // FR
  targetLoads[2] = Math.max(350, baseRearWheelN + longTransferN * 0.5 - latTransferRearN);  // RL
  targetLoads[3] = Math.max(350, baseRearWheelN + longTransferN * 0.5 + latTransferRearN);  // RR

  dyn.surfacePhase += absFwd * dt * 2.8;
  const springK = tuning.suspensionStiffness;
  const damperC = tuning.suspensionDamping;
  const nomWheelN = (massKg * STANDARD_GRAVITY_MPS2) * 0.25;
  const landingJounce =
    dyn.wasAirborne && !inp.airborne
      ? THREE.MathUtils.clamp((inp.landingVelMps ?? 6.5) * 0.78, 2.8, 12.5)
      : 0;
  dyn.wasAirborne = inp.airborne;

  let avgComp = 0;
  for (let w = 0; w < 4; w++) {
    const wh = dyn.wheels[w];
    const bumpK = SURFACE_MODIFIERS[wh.surface].bumpAmplitude;
    const bumpNoise =
      bumpK > 0 ? Math.sin(dyn.surfacePhase + w * 1.73) * bumpK * Math.min(1, absFwd / 24) : 0;
    const targetComp = inp.airborne
      ? 0.08
      : THREE.MathUtils.clamp((targetLoads[w] / nomWheelN) * 0.42 + bumpNoise, 0.05, 0.96);

    if (landingJounce > 0) {
      wh.compressionVel += landingJounce;
    }
    const springAccel = (targetComp - wh.compression) * springK * 4.2 - wh.compressionVel * damperC * 2.1;
    wh.compressionVel += springAccel * dt;
    wh.compression = THREE.MathUtils.clamp(wh.compression + wh.compressionVel * dt, 0.02, 0.98);
    wh.loadN = inp.airborne ? 0 : Math.max(250, (wh.compression / 0.42) * nomWheelN);
    avgComp += wh.compression;
  }
  avgComp *= 0.25;

  // 5. Load-Sensitive Pacejka Tire Slip Curve + Friction Ellipse + Asymmetric Shoulder Pull + Trail-Braking
  const absSpeed = Math.abs(nextFwd);
  const speedRatio = Math.min(1, absSpeed / 7.5);
  const speedTurnScale = THREE.MathUtils.lerp(1.0, 1 - tuning.steerSpeedSensitivity * 0.74, Math.min(1, absSpeed / 96));
  const handlingFactor =
    (2.34 + (inp.handlingStat / 100) * 1.24) * (inp.spikedTimer > 0 ? 0.78 : 1.0);
  const breakerBoost = inp.isSpeedbreaker ? 1.66 : 1.0;
  const trailBraking = !inp.airborne && inp.brakeInput && Math.abs(inp.rawSteerInput) > 0.12 && absSpeed > 18;
  const handbrakeTurn = inp.handbrakeInput
    ? 1.44 * tuning.driftSlipEase
    : trailBraking
      ? 1.32 * Math.sqrt(tuning.driftSlipEase)
      : 1.0;
  const turnDir = nextFwd >= -0.2 ? 1 : -1;
  const gripScale = inp.airborne ? 0.12 : 1.0;

  const alignPull = (inp.alignmentPull ?? 0) * Math.min(1, absSpeed / 26);
  const effSteerAngle = inp.steerAngle + alignPull;

  let yawRate =
    effSteerAngle * speedRatio * speedTurnScale * handlingFactor * breakerBoost * handbrakeTurn * turnDir * gripScale;

  // Subtle shoulder surface drag feedback without yanking the steering across the road
  if (!inp.airborne && absSpeed > 14) {
    const dragDiff = rightSpec.rollingResistance - leftSpec.rollingResistance;
    if (Math.abs(dragDiff) > 0.08) {
      yawRate -= dragDiff * Math.min(1, absSpeed / 65) * 0.045;
    }
  }

  // Straight-line self-centering caster stability when no steering or handbrake is held
  if (!inp.airborne && Math.abs(inp.rawSteerInput) < 0.04 && !inp.handbrakeInput && absSpeed > 4 && Math.abs(inp.lateralSpeed) > 0) {
    yawRate += THREE.MathUtils.clamp(-inp.lateralSpeed * 0.036, -0.18, 0.18);
  }

  // Front & rear slip angles
  const vxSafe = Math.max(4.5, absSpeed);
  const frontSlipAngle = inp.airborne
    ? 0
    : Math.atan2(inp.lateralSpeed + 1.32 * yawRate, vxSafe) - effSteerAngle * Math.sign(nextFwd || 1);
  const rearSlipAngle = inp.airborne ? 0 : Math.atan2(inp.lateralSpeed - 1.42 * yawRate, vxSafe);

  // Load sensitivity per axle: heavier load slightly reduces peak friction efficiency
  const frontLoadRatio = THREE.MathUtils.clamp((dyn.wheels[0].loadN + dyn.wheels[1].loadN) / Math.max(1, nomWheelN * 2), 0.35, 1.85);
  const rearLoadRatio = THREE.MathUtils.clamp((dyn.wheels[2].loadN + dyn.wheels[3].loadN) / Math.max(1, nomWheelN * 2), 0.35, 1.85);
  const frontLoadEff = Math.pow(frontLoadRatio, 0.88) / Math.max(0.4, frontLoadRatio);
  const rearLoadEff = Math.pow(rearLoadRatio, 0.88) / Math.max(0.4, rearLoadRatio);

  const B = tuning.pacejkaStiffness;
  const C = tuning.pacejkaShape;
  const Dbase = tuning.tireGripMultiplier * avgGripMult * (0.80 + (inp.handlingStat / 100) * 0.34);
  const E = 0.65;

  const frontLatForceNorm = pacejkaFormula(frontSlipAngle, B, C, Dbase * (0.65 + 0.35 * frontLoadEff), E);
  // Trail-braking loads front bite & unloads rear axle smoothly; handbrake snaps rear capacity
  const rearGripPenalty = inp.handbrakeInput
    ? 0.50 / Math.max(0.65, tuning.driftSlipEase)
    : trailBraking
      ? 0.69 / Math.max(0.75, tuning.driftSlipEase)
      : 1.0;
  const rearLatForceNorm = pacejkaFormula(
    rearSlipAngle,
    B * 1.04,
    C,
    Dbase * rearGripPenalty * (0.65 + 0.35 * rearLoadEff),
    E,
  );

  // Friction Ellipse coupling between longitudinal demand & lateral capacity
  const longDemandNorm = effectiveBrake > 0.25 && !assists.abs
    ? effectiveBrake * 0.92
    : effectiveBrake > 0.1
      ? effectiveBrake * 0.54
      : effectiveThrottle * 0.38;
  const latDemandFront = Math.min(1.2, Math.abs(frontLatForceNorm));
  const combinedFront = Math.hypot(longDemandNorm, latDemandFront);
  const ellipseScale = combinedFront > 1.0 ? 1 / combinedFront : 1.0;

  // Real-world high-speed cornering limit: attempting sharp steering flat-out without trail-braking
  // saturates front tire grip (understeer push), forcing genuine corner-entry braking or lift-off!
  const aeroGripSupport = 1 + (downforceTotalN / Math.max(1, staticWeightN)) * 0.32;
  const bankTurnSupport = 1 + Math.abs(Math.sin(bankAngle)) * 0.28;
  const cornerGripCeiling = Math.max(8.5, STANDARD_GRAVITY_MPS2 * 1.24 * Dbase * aeroGripSupport * bankTurnSupport);
  const ayDemand = Math.abs(yawRate * absSpeed);
  const lateralLoadRatio = ayDemand / cornerGripCeiling;
  if (!inp.airborne && !inp.isSpeedbreaker && !trailBraking && lateralLoadRatio > 0.92) {
    const excessRatio = lateralLoadRatio - 0.92;
    const throttlePushPenalty = effectiveThrottle > 0.45 ? 1.15 : 0.72;
    const understeerScale = Math.max(0.46, 1 / (1 + excessRatio * 0.85 * throttlePushPenalty));
    yawRate *= understeerScale;
  } else if (trailBraking) {
    // Trail braking shifts weight onto front tires, rewarding brave late brakers with extra nose rotation
    yawRate *= 1.08;
  }

  yawRate *= THREE.MathUtils.clamp(0.65 + 0.35 * ellipseScale * avgGripMult * tuning.tireGripMultiplier, 0.48, 1.22);

  // Stability Control (ESC): damps excess oversteer yaw when not deliberately handbraking
  if (!inp.airborne && assists.stabilityControl && !inp.handbrakeInput) {
    const excessSlide = Math.abs(inp.lateralSpeed) - 3.6;
    if (excessSlide > 0) {
      const escFactor = THREE.MathUtils.clamp(excessSlide / 9.0, 0, 0.42);
      yawRate *= 1 - escFactor * 0.35;
    }
  }

  // Steer Assist: counter-steer stabilization during deep slides
  if (!inp.airborne && assists.steerAssist && Math.abs(inp.lateralSpeed) > 2.2) {
    const counterHint = -Math.sign(inp.lateralSpeed) * THREE.MathUtils.clamp(Math.abs(inp.lateralSpeed) / 14, 0, 0.45);
    yawRate += counterHint * 0.65;
  }

  // Update lateral speed using progressive Pacejka restoring force, banked-turn support & friction-ellipse damping
  let nextLat = inp.lateralSpeed;
  if (!inp.airborne) {
    // Track banking raises the +right shoulder for positive bankAngle -> gravity supports left turns (-right)
    const bankGravityLat = -STANDARD_GRAVITY_MPS2 * Math.sin(bankAngle);
    const gripDemand = THREE.MathUtils.clamp(
      Math.abs(yawRate * nextFwd) / Math.max(8, STANDARD_GRAVITY_MPS2 * Dbase * 1.12),
      0,
      1.5,
    );
    const progressiveSlipScale = gripDemand > 0.68 ? 1 + (gripDemand - 0.68) * 1.65 : 1.0;
    const lateralInject =
      (inp.handbrakeInput ? 0.38 : trailBraking ? 0.27 : 0.088 * progressiveSlipScale) *
      tuning.driftSlipEase;
    nextLat += (yawRate * nextFwd * lateralInject + bankGravityLat * 0.48) * dt;

    const counterSteering = inp.rawSteerInput * nextLat < -0.08;
    const slipSaturationDamp = gripDemand > 0.84 ? Math.max(0.66, 1 - (gripDemand - 0.84) * 0.52) : 1.0;
    const baseDamp = inp.handbrakeInput
      ? 4.4 / Math.max(0.7, tuning.driftSlipEase)
      : trailBraking
        ? 5.9 / Math.max(0.75, tuning.driftSlipEase)
        : (11.8 + (inp.handlingStat / 100) * 3.6) *
          (Math.abs(inp.rawSteerInput) < 0.08 ? 1.55 : 1.0) *
          slipSaturationDamp;
    const escDampBoost = assists.stabilityControl && !inp.handbrakeInput ? 1.15 : 1.0;
    const wetLatFactor = 1 - effWet * 0.14;
    const pacejkaBite = THREE.MathUtils.clamp(
      avgGripMult * tuning.tireGripMultiplier * ellipseScale * surfaceSpec.lateralDamping * wetLatFactor,
      0.40,
      1.36,
    );
    const totalLatDamp =
      baseDamp * pacejkaBite * escDampBoost * (inp.isSpeedbreaker ? 1.95 : 1.0) * (counterSteering ? 2.25 : 1.0);
    nextLat = THREE.MathUtils.damp(nextLat, 0, totalLatDamp, dt);

    if (Math.abs(nextLat) > 2.8) {
      const scrubStrength = inp.handbrakeInput ? 0.15 : 0.092;
      nextFwd *= 1 - Math.min(0.24, scrubStrength * (1 / Math.max(0.55, Math.abs(rearLatForceNorm) + 0.45)) * dt);
    }
  }

  // Record per-wheel slip metrics (zero allocation, updated in-place)
  const baseLongSlip =
    effectiveThrottle > 0.05 && nextFwd >= 0
      ? THREE.MathUtils.clamp(
          (tcsActive ? 0.14 : 0.06 + wheelspinIntensity * 0.42) * effectiveThrottle,
          0,
          0.95,
        )
      : effectiveBrake > 0.05 && nextFwd > 1.2
        ? -THREE.MathUtils.clamp((assists.abs ? 0.16 : 0.38) * effectiveBrake, 0, 0.9)
        : 0;
  const handbrakeRearSlip = inp.handbrakeInput ? -0.65 : 0;

  dyn.wheels[0].slipRatio = baseLongSlip * 0.25;
  dyn.wheels[1].slipRatio = baseLongSlip * 0.25;
  dyn.wheels[2].slipRatio = inp.handbrakeInput ? handbrakeRearSlip : baseLongSlip;
  dyn.wheels[3].slipRatio = inp.handbrakeInput ? handbrakeRearSlip : baseLongSlip;

  dyn.wheels[0].slipAngleRad = frontSlipAngle;
  dyn.wheels[1].slipAngleRad = frontSlipAngle;
  dyn.wheels[2].slipAngleRad = rearSlipAngle;
  dyn.wheels[3].slipAngleRad = rearSlipAngle;

  // Realistic individual wheel angular velocity (rad/s) & brake rotor thermal buildup/cooling
  const wRadius = Math.max(0.24, inp.wheelRadiusM ?? 0.36);
  const freeOmega = nextFwd / wRadius;
  const frontOmega = inp.airborne
    ? dyn.wheels[0].angularVelRadSec * Math.max(0, 1 - 0.85 * dt)
    : effectiveBrake > 0.12 && nextFwd > 1.2
      ? assists.abs
        ? freeOmega * (0.72 + 0.22 * Math.sin(dyn.absPulsePhase))
        : effectiveBrake > 0.55
          ? freeOmega * (0.12 + 0.08 * Math.sin(dyn.absPulsePhase))
          : freeOmega * (1 - effectiveBrake * 0.45)
      : inp.handbrakeInput
        ? freeOmega * 0.94
        : freeOmega * (1 + Math.max(0, baseLongSlip * 0.18));

  const rearOmega = inp.airborne
    ? (effectiveThrottle > 0.15
        ? Math.sign(nextFwd || 1) * (Math.abs(freeOmega) + effectiveThrottle * 24)
        : dyn.wheels[2].angularVelRadSec * Math.max(0, 1 - 0.85 * dt))
    : inp.handbrakeInput
      ? 0
      : effectiveBrake > 0.12 && nextFwd > 1.2
        ? assists.abs
          ? freeOmega * (0.68 + 0.24 * Math.sin(dyn.absPulsePhase + 1.1))
          : effectiveBrake > 0.5
            ? freeOmega * 0.1
            : freeOmega * (1 - effectiveBrake * 0.5)
        : effectiveThrottle > 0.22 && wheelspinIntensity > 0.16 && nextFwd >= -0.5
          ? freeOmega + wheelspinIntensity * (16 + effectiveThrottle * 18)
          : freeOmega * (1 + baseLongSlip * 0.65);

  const frontHeatTarget = !inp.airborne && effectiveBrake > 0.1 && absSpeed > 6 ? effectiveBrake * Math.min(1, absSpeed / 58) : 0;
  const rearHeatTarget = !inp.airborne && (effectiveBrake > 0.1 || inp.handbrakeInput) && absSpeed > 6
    ? (inp.handbrakeInput ? 0.65 : effectiveBrake * 0.78) * Math.min(1, absSpeed / 58)
    : 0;
  const coolRate = 0.22 + (absSpeed / 95) * 0.65;

  for (let wi = 0; wi < 4; wi++) {
    const wh = dyn.wheels[wi];
    const isFront = wi < 2;
    const isLeft = wi % 2 === 0;
    const trackDiffScale =
      1 + THREE.MathUtils.clamp((isLeft ? -1 : 1) * yawRate * (trackWidthM * 0.5) / Math.max(6, absSpeed), -0.18, 0.18);
    const targetOmega = (isFront ? frontOmega : rearOmega) * trackDiffScale;
    wh.angularVelRadSec = THREE.MathUtils.damp(wh.angularVelRadSec, targetOmega, isFront ? 22 : 24, dt);
    const heatIn = (isFront ? frontHeatTarget : rearHeatTarget) * (0.85 + 0.3 * (wh.loadN / Math.max(1, nomWheelN)));
    wh.brakeTemp = THREE.MathUtils.clamp(
      heatIn > wh.brakeTemp
        ? THREE.MathUtils.lerp(wh.brakeTemp, heatIn, Math.min(1, dt * 2.4))
        : wh.brakeTemp - wh.brakeTemp * coolRate * dt,
      0,
      1,
    );
  }

  dyn.prevForwardSpeed = nextFwd;
  dyn.prevLateralSpeed = nextLat;
  dyn.yawRate = yawRate;

  // Suspension-driven visual heave, pitch, roll (including subtle gear-shift squat)
  const frontAvgComp = (dyn.wheels[0].compression + dyn.wheels[1].compression) * 0.5;
  const rearAvgComp = (dyn.wheels[2].compression + dyn.wheels[3].compression) * 0.5;
  const leftAvgComp = (dyn.wheels[0].compression + dyn.wheels[2].compression) * 0.5;
  const rightAvgComp = (dyn.wheels[1].compression + dyn.wheels[3].compression) * 0.5;

  const shiftPitchKick = dyn.shiftDipTimer > 0 ? 0.022 : 0;
  const suspPitch = (frontAvgComp - rearAvgComp) * -0.115 + shiftPitchKick;
  const suspRoll = (leftAvgComp - rightAvgComp) * 0.128;
  const downforceSink = inp.airborne ? 0 : Math.min(0.056, (avgComp - 0.42) * 0.082 + (absSpeed / 90) * 0.032 * tuning.aeroDownforce);
  dyn.heaveOffset = THREE.MathUtils.damp(dyn.heaveOffset, downforceSink, 14, inp.rawDt);

  out.forwardSpeed = nextFwd;
  out.lateralSpeed = nextLat;
  out.yawRate = yawRate;
  out.heaveOffset = dyn.heaveOffset;
  out.targetPitch = THREE.MathUtils.clamp(suspPitch, -0.095, 0.095);
  out.targetRoll = THREE.MathUtils.clamp(
    suspRoll - inp.rawSteerInput * Math.min(1, absSpeed / 30) * 0.032,
    -0.11,
    0.11,
  );
  out.wheelspinIntensity = wheelspinIntensity;
  out.surface = centerSurface;
  out.absActive = absActive;
  out.tcsActive = tcsActive;
}

export function syncWheelTelemetry(
  dyn: VehicleDynamicsState,
  target: [WheelTelemetry, WheelTelemetry, WheelTelemetry, WheelTelemetry],
): void {
  const radToDeg = 180 / Math.PI;
  for (let i = 0; i < 4; i++) {
    const src = dyn.wheels[i];
    const dst = target[i];
    dst.id = src.id;
    dst.slipRatio = Math.round(src.slipRatio * 100) / 100;
    dst.slipAngleDeg = Math.round(src.slipAngleRad * radToDeg * 10) / 10;
    dst.loadN = Math.round(src.loadN);
    dst.compression = Math.round(src.compression * 100) / 100;
    dst.surface = src.surface;
  }
}
