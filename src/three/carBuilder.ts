import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RIM_OPTIONS } from '../data/gameData';
import { CarSpec, LiveryStyle, RimStyle } from '../types/game';
import {
  createCarPaintLiveryTexture,
  createHeadlightPoolTexture,
  createLightGlowTexture,
  createPoliceLiveryTexture,
} from './textures';

export interface CarVisualHandles {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  bodyMaterials: THREE.Material[];
  rimMaterials: THREE.MeshStandardMaterial[];
  brakeLightMat: THREE.MeshStandardMaterial;
  reverseLightMat: THREE.MeshStandardMaterial;
  brakeGlows: THREE.Mesh[];
  nosFlames: THREE.Mesh[];
  backfireFlames: THREE.Mesh[];
  wheelFrontLeft: THREE.Group;
  wheelFrontRight: THREE.Group;
  wheelSpinners: THREE.Group[];
  lightbarRed?: THREE.MeshStandardMaterial;
  lightbarBlue?: THREE.MeshStandardMaterial;
  dispose: () => void;
}

interface BuildCarOptions {
  spec: CarSpec;
  paintHex: string;
  livery: LiveryStyle;
  rimStyle: RimStyle;
  shadowTexture: THREE.Texture;
  maxAnisotropy: number;
  isSoftwareGl: boolean;
  isPlayer?: boolean;
  isPolice?: boolean;
  isRhino?: boolean;
  isTraffic?: boolean;
  isTrafficTruck?: boolean;
}

interface GeoPart {
  geo: THREE.BufferGeometry;
  pos?: [number, number, number];
  rot?: [number, number, number];
}

const _m4 = new THREE.Matrix4();
const _p3 = new THREE.Vector3();
const _e3 = new THREE.Euler();
const _q4 = new THREE.Quaternion();
const _s3 = new THREE.Vector3(1, 1, 1);

function bakeAndMerge(parts: GeoPart[]): THREE.BufferGeometry {
  const normalized: THREE.BufferGeometry[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const src = part.geo;
    const g = src.index ? src.toNonIndexed() : src;
    if (g !== src) src.dispose();
    if (part.rot || part.pos) {
      _p3.set(part.pos ? part.pos[0] : 0, part.pos ? part.pos[1] : 0, part.pos ? part.pos[2] : 0);
      _e3.set(part.rot ? part.rot[0] : 0, part.rot ? part.rot[1] : 0, part.rot ? part.rot[2] : 0, 'XYZ');
      _q4.setFromEuler(_e3);
      _m4.compose(_p3, _q4, _s3);
      g.applyMatrix4(_m4);
    }
    normalized.push(g);
  }
  const merged = mergeGeometries(normalized, false);
  for (let i = 0; i < normalized.length; i++) {
    normalized[i].dispose();
  }
  return merged ?? new THREE.BoxGeometry(0.1, 0.1, 0.1);
}

interface LoftStation {
  z: number;
  halfW: number;
  bottomY: number;
  lowerWallY: number;
  shoulderY: number;
  centerY: number;
  tumbleIn: number; // inward bevel at shoulder
  creaseIn: number; // side door sculptural waist undercut
  fenderCrown: number; // raised crown over wheel arches / front fenders
  hoodValley: number; // subtle dip or bulge at center hood
}

/**
 * Generates an indexed, smoothly lofted closed 3D surface from Z-ordered cross-sections.
 * Winding verified: (v01 - v00) x (v10 - v00) = dP x dS points strictly OUTWARD.
 */
function buildLoftedShell(
  stations: LoftStation[],
  length: number,
  width: number,
): THREE.BufferGeometry {
  // 14 points per closed transverse ring going CCW in XY (+x right -> +y top -> -x left -> -y bottom)
  const RING_PTS = 14;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const hl = length * 0.5;
  const hw = width * 0.5;

  for (let s = 0; s < stations.length; s++) {
    const st = stations[s];
    const w = st.halfW;
    const bY = st.bottomY;
    const lwY = st.lowerWallY;
    const shY = st.shoulderY;
    const cY = st.centerY;
    const midY = (lwY + shY) * 0.5;
    const fenderY = shY + st.fenderCrown;
    const shX = w - st.tumbleIn;

    // Points ordered strictly CCW in XY when viewed from +Z:
    // 0: bottom center
    // 1: right lower sill corner
    // 2: right lower flare
    // 3: right door crease / waist
    // 4: right shoulder bevel
    // 5: right fender / deck crown
    // 6: center crown (with bulge/valley)
    // 7: left fender / deck crown
    // 8: left shoulder bevel
    // 9: left door crease / waist
    // 10: left lower flare
    // 11: left lower sill corner
    // 12: bottom left inner
    // 13: bottom right inner -> actually 12 pts symmetric cleanly! Let's use 12 exact symmetric points.
    const ring: [number, number][] = [
      [0, bY], // 0 bottom center
      [w * 0.72, bY], // 1 bottom right
      [w * 0.99, lwY], // 2 right lower rocker
      [w * (1.0 - st.creaseIn), midY], // 3 right waist crease
      [shX, shY], // 4 right shoulder
      [shX * 0.58, fenderY], // 5 right hood/deck fender
      [0, cY + st.hoodValley], // 6 top center
      [-shX * 0.58, fenderY], // 7 left hood/deck fender
      [-shX, shY], // 8 left shoulder
      [-w * (1.0 - st.creaseIn), midY], // 9 left waist crease
      [-w * 0.99, lwY], // 10 left lower rocker
      [-w * 0.72, bY], // 11 bottom left
    ];

    for (let p = 0; p < ring.length; p++) {
      const rx = ring[p][0];
      const ry = ring[p][1];
      positions.push(rx, ry, st.z);

      const u = THREE.MathUtils.clamp(0.5 + rx / (hw * 2.08), 0.01, 0.99);
      const v = THREE.MathUtils.clamp(0.5 + st.z / (hl * 2.04), 0.01, 0.99);
      uvs.push(u, v);
    }
    void RING_PTS;
  }

  const ptsPerRing = 12;
  for (let s = 0; s < stations.length - 1; s++) {
    const r0 = s * ptsPerRing;
    const r1 = (s + 1) * ptsPerRing;
    for (let p = 0; p < ptsPerRing; p++) {
      const pn = (p + 1) % ptsPerRing;
      const v00 = r0 + p;
      const v01 = r0 + pn;
      const v10 = r1 + p;
      const v11 = r1 + pn;
      indices.push(v00, v01, v10);
      indices.push(v01, v11, v10);
    }
  }

  // Front cap (-Z outward)
  const fSt = stations[0];
  const fCenterIdx = positions.length / 3;
  positions.push(0, (fSt.bottomY + fSt.centerY) * 0.5, fSt.z - 0.025);
  uvs.push(0.5, 0.02);
  for (let p = 0; p < ptsPerRing; p++) {
    const pn = (p + 1) % ptsPerRing;
    indices.push(fCenterIdx, pn, p);
  }

  // Rear cap (+Z outward)
  const lSt = stations[stations.length - 1];
  const rStart = (stations.length - 1) * ptsPerRing;
  const rCenterIdx = positions.length / 3;
  positions.push(0, (lSt.bottomY + lSt.centerY) * 0.5, lSt.z + 0.025);
  uvs.push(0.5, 0.98);
  for (let p = 0; p < ptsPerRing; p++) {
    const pn = (p + 1) % ptsPerRing;
    indices.push(rCenterIdx, rStart + p, rStart + pn);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Multi-station sculpted lower automotive chassis with authentic wheel-arch flares,
 * sloped nose, muscular rear haunches, coke-bottle waist, and clear front/rear overhang taper.
 */
function createSculptedChassisGeometry(
  spec: CarSpec,
  isRhino: boolean,
  lowDetail: boolean,
): THREE.BufferGeometry {
  const { width, height, length, wheelRadius } = spec.dimensions;
  const hl = length * 0.5;
  const hw = width * 0.5;
  const isBossWide = spec.aeroKit === 'boss_gt' || spec.aeroKit === 'widebody';
  const wideMult = spec.aeroKit === 'boss_gt' ? 1.04 : isBossWide ? 1.02 : 1.0;

  const frontAxleZ = -length * 0.305;
  const rearAxleZ = length * 0.305;
  const archHalfSpan = wheelRadius * 1.18;
  const clearance = wheelRadius * (isRhino ? 0.64 : 0.38);
  const style = spec.bodyStyle;

  const noseLow = clearance + (style === 'exotic' ? 0.13 : isRhino ? 0.34 : 0.20);
  const hoodMid = clearance + height * (style === 'exotic' ? 0.34 : isRhino ? 0.54 : 0.42);
  const beltY = clearance + height * (style === 'exotic' ? 0.49 : isRhino ? 0.62 : 0.54);
  const tailY =
    clearance +
    height * (style === 'exotic' ? 0.58 : style === 'muscle' ? 0.61 : isRhino ? 0.68 : 0.57);

  // Sample Z stations along the car length (denser around wheel arches and nose curve)
  const zFractions = lowDetail
    ? [-1.0, -0.84, -0.61, -0.38, 0.0, 0.38, 0.61, 0.84, 1.0]
    : [
        -1.0, -0.94, -0.84, -0.73, -0.61, -0.49, -0.35, -0.18, 0.0, 0.22, 0.42, 0.56, 0.68, 0.80,
        0.92, 1.0,
      ];

  const stations: LoftStation[] = zFractions.map((zf) => {
    const z = zf * hl;

    // Plan-view width curve: tapered aggressive nose + wide wheel fenders + coke-bottle waist + broad haunches
    let widthFactor = wideMult;
    if (zf < -0.72) {
      const t = (-zf - 0.72) / 0.28;
      widthFactor *= 1.0 - t * t * (style === 'exotic' ? 0.16 : 0.11);
    } else if (zf > 0.76) {
      const t = (zf - 0.76) / 0.24;
      widthFactor *= 1.0 - t * t * 0.08;
    }

    const frontFlare = Math.exp(-Math.pow((z - frontAxleZ) / (archHalfSpan * 1.05), 2));
    const rearFlare = Math.exp(-Math.pow((z - rearAxleZ) / (archHalfSpan * 1.1), 2));
    const doorTuck = isRhino ? 0 : Math.exp(-Math.pow(zf / 0.26, 2));

    widthFactor += frontFlare * (spec.aeroKit === 'boss_gt' ? 0.065 : 0.042);
    widthFactor += rearFlare * (spec.aeroKit === 'boss_gt' ? 0.085 : 0.055);
    widthFactor -= doorTuck * 0.032;

    // Elevation profile from splitter chin -> curved hood -> cowl -> beltline -> haunch -> decklid
    let shoulderY = beltY;
    let centerY = beltY + 0.03;
    let fenderCrown = 0.0;
    let hoodValley = 0.0;

    if (zf < -0.32) {
      // Front hood & sloped nose
      const t = THREE.MathUtils.clamp((zf + 1.0) / 0.68, 0, 1);
      const ease = 1 - Math.pow(1 - t, 1.85);
      shoulderY = THREE.MathUtils.lerp(noseLow, beltY, ease);
      centerY = shoulderY + (zf < -0.88 ? 0.01 : 0.038);
      fenderCrown = Math.sin(t * Math.PI) * (style === 'exotic' ? 0.045 : 0.025);
      hoodValley =
        style === 'muscle'
          ? Math.sin(t * Math.PI) * 0.045
          : style === 'exotic'
            ? -Math.sin(t * Math.PI) * 0.022
            : 0.01;
    } else if (zf <= 0.45) {
      // Cabin beltline section
      const t = (zf + 0.32) / 0.77;
      shoulderY = THREE.MathUtils.lerp(beltY, beltY + 0.03, t);
      centerY = shoulderY + 0.02;
    } else {
      // Rear haunch kick-up & ducktail deck
      const t = (zf - 0.45) / 0.55;
      shoulderY = THREE.MathUtils.lerp(beltY + 0.03, tailY, Math.pow(t, 0.85));
      if (zf > 0.94) shoulderY -= 0.035;
      centerY = shoulderY + 0.025;
      fenderCrown = Math.sin(t * Math.PI) * 0.032;
    }

    // Bottom edge rises smoothly over front & rear wheel wells so tires sit crisply inside arched fenders
    let bottomY = clearance;
    if (zf < -0.92) bottomY += 0.025; // front lip bevel
    if (zf > 0.88) bottomY += (zf - 0.88) * 1.1; // rear diffuser kick-up

    const distF = Math.abs(z - frontAxleZ);
    const distR = Math.abs(z - rearAxleZ);
    if (distF < archHalfSpan * 0.92) {
      const aFrac = Math.sqrt(Math.max(0, 1 - Math.pow(distF / (archHalfSpan * 0.92), 2)));
      bottomY = Math.max(bottomY, clearance + wheelRadius * 0.96 * aFrac);
    }
    if (distR < archHalfSpan * 0.92) {
      const aFrac = Math.sqrt(Math.max(0, 1 - Math.pow(distR / (archHalfSpan * 0.92), 2)));
      bottomY = Math.max(bottomY, clearance + wheelRadius * 0.96 * aFrac);
    }

    // Keep hood top always cleanly above arch cutout
    const minLowerWall = Math.min(shoulderY - 0.06, bottomY + 0.08);
    if (zf < -0.92) {
      shoulderY = Math.max(shoulderY, hoodMid * 0.55);
    }

    return {
      z,
      halfW: hw * widthFactor,
      bottomY,
      lowerWallY: Math.max(bottomY + 0.04, Math.min(shoulderY - 0.05, minLowerWall + 0.09)),
      shoulderY: Math.max(bottomY + 0.11, shoulderY),
      centerY: Math.max(bottomY + 0.14, centerY),
      tumbleIn: zf < -0.88 || zf > 0.92 ? 0.13 : 0.075,
      creaseIn: !isRhino && zf > -0.25 && zf < 0.35 ? 0.042 : 0.0,
      fenderCrown,
      hoodValley,
    };
  });

  return buildLoftedShell(stations, length, width);
}

/**
 * Curved multi-station wraparound glass greenhouse canopy + flush roof shell.
 */
function createSculptedCabinGeometry(
  spec: CarSpec,
  isRhino: boolean,
  lowDetail: boolean,
): {
  glassGeo: THREE.BufferGeometry;
  roofGeo: THREE.BufferGeometry;
  windZ: number;
  rearZ: number;
  roofFrontZ: number;
  roofBackZ: number;
  beltY: number;
  roofY: number;
} {
  const { width, height, length, wheelRadius } = spec.dimensions;
  const hl = length * 0.5;
  const clearance = wheelRadius * (isRhino ? 0.64 : 0.38);
  const style = spec.bodyStyle;

  const beltY = clearance + height * (style === 'exotic' ? 0.48 : isRhino ? 0.61 : 0.53);
  const roofY = clearance + height * (isRhino ? 1.0 : style === 'exotic' ? 0.89 : 0.95);

  let windZ = -hl * 0.38;
  let roofFrontZ = -0.18;
  let roofBackZ = 0.46;
  let rearZ = hl * 0.78;

  if (isRhino) {
    windZ = -hl * 0.30;
    roofFrontZ = -hl * 0.14;
    roofBackZ = hl * 0.74;
    rearZ = hl * 0.92;
  } else if (style === 'exotic') {
    windZ = -hl * 0.50;
    roofFrontZ = -0.05;
    roofBackZ = 0.34;
    rearZ = hl * 0.80;
  } else if (style === 'muscle') {
    windZ = -hl * 0.14;
    roofFrontZ = 0.12;
    roofBackZ = 0.60;
    rearZ = hl * 0.82;
  } else if (style === 'sedan') {
    windZ = -hl * 0.36;
    roofFrontZ = -0.16;
    roofBackZ = 0.62;
    rearZ = hl * 0.82;
  }

  const baseHalfW = width * (isRhino ? 0.43 : 0.405);
  const cabinPts = lowDetail
    ? [0, 0.25, 0.5, 0.78, 1.0]
    : [0, 0.14, 0.28, 0.45, 0.62, 0.78, 0.90, 1.0];

  const glassStations: LoftStation[] = cabinPts.map((t) => {
    const z = THREE.MathUtils.lerp(windZ, rearZ, t);
    // Smooth fastback profile curve
    const frontT = THREE.MathUtils.clamp((z - windZ) / Math.max(0.1, roofFrontZ - windZ), 0, 1);
    const backT = THREE.MathUtils.clamp((z - roofBackZ) / Math.max(0.1, rearZ - roofBackZ), 0, 1);

    let hFrac = 1.0;
    if (z < roofFrontZ) {
      hFrac = Math.sin(frontT * Math.PI * 0.5);
    } else if (z > roofBackZ) {
      hFrac = Math.cos(backT * Math.PI * 0.5);
    } else {
      const roofMid = (z - roofFrontZ) / Math.max(0.1, roofBackZ - roofFrontZ);
      hFrac = 0.96 + Math.sin(roofMid * Math.PI) * 0.04;
    }

    const topY = THREE.MathUtils.lerp(beltY + 0.02, roofY, hFrac);
    const planCurve = isRhino ? 1.0 : 1.0 - 0.15 * Math.pow((t - 0.48) * 2, 2);
    const tumbleWidth = baseHalfW * planCurve * (isRhino ? 1.0 - hFrac * 0.09 : 1.0 - hFrac * 0.18);

    return {
      z,
      halfW: tumbleWidth,
      bottomY: beltY - 0.035,
      lowerWallY: beltY + (topY - beltY) * 0.35,
      shoulderY: Math.max(beltY + 0.01, topY - 0.045),
      centerY: Math.max(beltY + 0.025, topY),
      tumbleIn: 0.11,
      creaseIn: 0,
      fenderCrown: 0.012,
      hoodValley: 0.01,
    };
  });

  const glassGeo = buildLoftedShell(glassStations, length, width);

  // Curved cambered roof skin sitting cleanly across the greenhouse crown
  const roofWidth = baseHalfW * (isRhino ? 0.88 : 0.75);
  const roofStations: LoftStation[] = [0, 0.25, 0.5, 0.75, 1.0].map((t) => {
    const z = THREE.MathUtils.lerp(roofFrontZ + 0.02, roofBackZ - 0.02, t);
    const camber = Math.sin(t * Math.PI) * 0.022;
    const planW = roofWidth * (1.0 - 0.07 * Math.pow((t - 0.5) * 2, 2));
    return {
      z,
      halfW: planW,
      bottomY: roofY - 0.04,
      lowerWallY: roofY - 0.02,
      shoulderY: roofY + camber - 0.005,
      centerY: roofY + camber + 0.015,
      tumbleIn: 0.05,
      creaseIn: 0,
      fenderCrown: 0.006,
      hoodValley: 0.004,
    };
  });

  const roofGeo = buildLoftedShell(roofStations, length, width);

  return { glassGeo, roofGeo, windZ, rearZ, roofFrontZ, roofBackZ, beltY, roofY };
}

function createWheelArchFlareGeometry(wheelRadius: number, wideBoss: boolean): THREE.BufferGeometry {
  const innerR = wheelRadius * 1.15;
  const outerR = wheelRadius * (wideBoss ? 1.34 : 1.28);
  const shape = new THREE.Shape();
  shape.moveTo(innerR, -0.04);
  shape.lineTo(outerR, -0.04);
  shape.absarc(0, 0, outerR, 0, Math.PI, false);
  shape.lineTo(-innerR, -0.04);
  shape.absarc(0, 0, innerR, Math.PI, 0, true);

  const depth = wideBoss ? 0.13 : 0.095;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.024,
    bevelSize: 0.018,
    bevelSegments: 2,
    curveSegments: 14,
  });
  geo.translate(0, 0, -depth * 0.5);
  geo.rotateY(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Concave deep-dish split-5-spoke alloy wheels with drilled rotor & 6-piston caliper.
 */
function buildWheelGroup(
  radius: number,
  width: number,
  rimMat: THREE.MeshStandardMaterial,
  tireMat: THREE.MeshStandardMaterial,
  rotorMat: THREE.MeshStandardMaterial,
  caliperMat: THREE.MeshStandardMaterial,
  isLeft: boolean,
  lowPoly: boolean,
  track: <T extends { dispose: () => void }>(item: T) => T,
): { pivot: THREE.Group; spinner: THREE.Group } {
  const pivot = new THREE.Group();
  const spinner = new THREE.Group();
  pivot.add(spinner);

  let tireGeo: THREE.BufferGeometry;
  if (lowPoly) {
    tireGeo = track(new THREE.CylinderGeometry(radius, radius, width, 14));
    tireGeo.rotateZ(Math.PI / 2);
  } else {
    const hw = width * 0.5;
    const innerR = radius * 0.69;
    const pts = [
      new THREE.Vector2(innerR, -hw * 0.90),
      new THREE.Vector2(radius * 0.92, -hw),
      new THREE.Vector2(radius, -hw * 0.74),
      new THREE.Vector2(radius, hw * 0.74),
      new THREE.Vector2(radius * 0.92, hw),
      new THREE.Vector2(innerR, hw * 0.90),
    ];
    tireGeo = track(new THREE.LatheGeometry(pts, 24));
    tireGeo.rotateZ(Math.PI / 2);
  }
  const tire = new THREE.Mesh(tireGeo, tireMat);
  tire.castShadow = !lowPoly;
  spinner.add(tire);

  const xSign = isLeft ? -1 : 1;
  const rimParts: GeoPart[] = [];

  // Deep barrel drum
  const barrelGeo = new THREE.CylinderGeometry(radius * 0.70, radius * 0.70, width * 0.94, lowPoly ? 12 : 20, 1, true);
  barrelGeo.rotateZ(Math.PI / 2);
  rimParts.push({ geo: barrelGeo });

  // Outer forged lip
  const lipGeo = new THREE.TorusGeometry(radius * 0.68, 0.022, 8, lowPoly ? 12 : 22);
  lipGeo.rotateY(Math.PI / 2);
  rimParts.push({ geo: lipGeo, pos: [xSign * (width * 0.47), 0, 0] });

  // Recessed center hub
  const capGeo = new THREE.CylinderGeometry(radius * 0.16, radius * 0.18, width * 0.68, 12);
  capGeo.rotateZ(Math.PI / 2);
  rimParts.push({ geo: capGeo, pos: [xSign * (width * 0.08), 0, 0] });

  // Split-5-spoke concave Y-spokes angling from hub out to barrel lip
  const pairCount = lowPoly ? 5 : 5;
  for (let i = 0; i < pairCount; i++) {
    const baseAngle = (i * Math.PI * 2) / pairCount;
    if (lowPoly) {
      rimParts.push({
        geo: new THREE.BoxGeometry(0.025, radius * 0.62, 0.036),
        pos: [
          xSign * (width * 0.40),
          Math.cos(baseAngle) * radius * 0.36,
          Math.sin(baseAngle) * radius * 0.36,
        ],
        rot: [-baseAngle, 0, xSign * -0.14],
      });
    } else {
      [-0.14, 0.14].forEach((offsetAngle) => {
        const a = baseAngle + offsetAngle;
        const midR = radius * 0.39;
        rimParts.push({
          geo: new THREE.BoxGeometry(0.026, radius * 0.56, 0.026),
          pos: [
            xSign * (width * 0.39),
            Math.cos(a) * midR,
            Math.sin(a) * midR,
          ],
          rot: [-a, 0, xSign * -0.16],
        });
      });
    }
  }

  const mergedRimGeo = track(bakeAndMerge(rimParts));
  const rim = new THREE.Mesh(mergedRimGeo, rimMat);
  spinner.add(rim);

  if (!lowPoly) {
    const rotorGeo = track(new THREE.CylinderGeometry(radius * 0.56, radius * 0.56, 0.04, 18));
    rotorGeo.rotateZ(Math.PI / 2);
    const rotor = new THREE.Mesh(rotorGeo, rotorMat);
    rotor.position.set(xSign * (width * 0.14), 0, 0);
    spinner.add(rotor);

    const caliperGeo = track(new THREE.BoxGeometry(width * 0.34, radius * 0.42, radius * 0.28));
    const caliper = new THREE.Mesh(caliperGeo, caliperMat);
    caliper.position.set(xSign * (width * 0.21), 0.04, -radius * 0.32);
    pivot.add(caliper);
  }

  return { pivot, spinner };
}

export function buildCarMesh(opts: BuildCarOptions): CarVisualHandles {
  const {
    spec,
    paintHex,
    livery,
    rimStyle,
    shadowTexture,
    maxAnisotropy,
    isPlayer,
    isPolice,
    isRhino,
    isTraffic,
    isTrafficTruck,
  } = opts;
  const { width, height, length, wheelRadius } = spec.dimensions;
  const lowDetail = Boolean(isTraffic || isTrafficTruck);
  const isBossCar = Boolean(spec.bossOnly || spec.aeroKit === 'boss_gt');

  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  // Grounding Contact Shadow Plane
  const shadowGeo = track(new THREE.PlaneGeometry(width * 1.62, length * 1.34));
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = track(
    new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      depthWrite: false,
      opacity: 0.86,
    }),
  );
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.y = 0.02;
  root.add(contactShadow);

  if (isPlayer) {
    const beamTex = track(createHeadlightPoolTexture());
    const beamGeo = track(new THREE.PlaneGeometry(width * 3.3, 16));
    beamGeo.rotateX(-Math.PI / 2);
    const beamMat = track(
      new THREE.MeshBasicMaterial({
        map: beamTex,
        transparent: true,
        opacity: 0.62,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const beamMesh = new THREE.Mesh(beamGeo, beamMat);
    beamMesh.position.set(0, 0.03, -length * 0.5 - 7.4);
    root.add(beamMesh);
  }

  // Materials
  const needsLiveryTex = Boolean(isPolice || isRhino || livery !== 'clean');
  const liveryTex = needsLiveryTex
    ? track(
        isPolice || isRhino
          ? createPoliceLiveryTexture(maxAnisotropy, Boolean(isRhino))
          : createCarPaintLiveryTexture(paintHex, livery, maxAnisotropy),
      )
    : null;

  const paintMat = track(
    lowDetail
      ? new THREE.MeshStandardMaterial({
          color: new THREE.Color(paintHex),
          metalness: 0.58,
          roughness: 0.24,
        })
      : new THREE.MeshPhysicalMaterial({
          color: liveryTex ? 0xffffff : new THREE.Color(isPolice || isRhino ? '#0F172A' : paintHex),
          map: liveryTex,
          metalness: isPolice || isRhino ? 0.45 : 0.78,
          roughness: 0.15,
          clearcoat: 1.0,
          clearcoatRoughness: 0.04,
          envMapIntensity: 1.38,
        }),
  );

  const solidPaintMat = track(
    lowDetail
      ? paintMat
      : new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(
            isPolice || isRhino ? '#0F172A' : livery === 'most_wanted' ? '#DCE2EC' : paintHex,
          ),
          metalness: isPolice || isRhino ? 0.45 : 0.78,
          roughness: 0.15,
          clearcoat: 1.0,
          clearcoatRoughness: 0.04,
          envMapIntensity: 1.38,
        }),
  );

  const carbonMat = track(
    new THREE.MeshStandardMaterial({
      color: '#11141C',
      metalness: 0.42,
      roughness: 0.36,
    }),
  );

  const lensCoverMat = track(
    new THREE.MeshPhysicalMaterial({
      color: '#CBD5E1',
      metalness: 0.1,
      roughness: 0.05,
      transparent: true,
      opacity: 0.28,
      clearcoat: 1.0,
    }),
  );

  const glassMat = track(
    lowDetail
      ? new THREE.MeshStandardMaterial({
          color: '#060A12',
          metalness: 0.55,
          roughness: 0.08,
        })
      : new THREE.MeshPhysicalMaterial({
          color: '#050810',
          metalness: 0.32,
          roughness: 0.025,
          clearcoat: 1.0,
          clearcoatRoughness: 0.02,
          envMapIntensity: 1.65,
        }),
  );

  const rimColor = RIM_OPTIONS.find((r) => r.id === rimStyle)?.colorHex ?? '#CBD5E1';
  const rimMat = track(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(rimColor),
      metalness: rimStyle === 'black' ? 0.42 : 0.94,
      roughness: rimStyle === 'black' ? 0.38 : 0.14,
    }),
  );

  const rotorMat = track(new THREE.MeshStandardMaterial({ color: '#94A3B8', metalness: 0.88, roughness: 0.28 }));
  const tireMat = track(new THREE.MeshStandardMaterial({ color: '#14161B', metalness: 0.04, roughness: 0.88 }));
  const caliperMat = track(
    new THREE.MeshStandardMaterial({
      color: isPolice || isRhino ? '#F59E0B' : isBossCar ? '#F59E0B' : '#EF4444',
      metalness: 0.58,
      roughness: 0.24,
    }),
  );
  const headlightMat = track(
    new THREE.MeshStandardMaterial({ color: '#FEF9C3', emissive: new THREE.Color('#FFFBEB'), emissiveIntensity: 3.4 }),
  );
  const brakeLightMat = track(
    new THREE.MeshStandardMaterial({ color: '#991B1B', emissive: new THREE.Color('#EF4444'), emissiveIntensity: 1.5 }),
  );
  const reverseLightMat = track(
    new THREE.MeshStandardMaterial({ color: '#E2E8F0', emissive: new THREE.Color('#F8FAFC'), emissiveIntensity: 0.15 }),
  );
  const chromeMat = track(new THREE.MeshStandardMaterial({ color: '#E2E8F0', metalness: 0.95, roughness: 0.12 }));

  const clearance = wheelRadius * (isRhino ? 0.64 : 0.38);
  const hl = length * 0.5;
  const frontAxleZ = -length * 0.305;
  const rearAxleZ = length * 0.305;

  const carbonParts: GeoPart[] = [];
  const solidPaintParts: GeoPart[] = [];
  const glassParts: GeoPart[] = [];
  const lensParts: GeoPart[] = [];
  const headlightParts: GeoPart[] = [];
  const taillightParts: GeoPart[] = [];
  const reverseParts: GeoPart[] = [];
  const exhaustParts: GeoPart[] = [];
  let roofY = clearance + height;

  if (isTrafficTruck) {
    const cabGeo = track(new THREE.BoxGeometry(width, height * 0.95, length * 0.34));
    const cab = new THREE.Mesh(cabGeo, solidPaintMat);
    cab.position.set(0, clearance + height * 0.48, -hl + length * 0.2);
    bodyGroup.add(cab);

    const cargoMat = track(new THREE.MeshStandardMaterial({ color: '#DCE2EC', roughness: 0.62, metalness: 0.15 }));
    const cargoGeo = track(new THREE.BoxGeometry(width + 0.14, height * 1.35, length * 0.66));
    const cargo = new THREE.Mesh(cargoGeo, cargoMat);
    cargo.position.set(0, clearance + height * 0.72, hl - length * 0.34);
    bodyGroup.add(cargo);

    carbonParts.push(
      { geo: new THREE.BoxGeometry(width * 0.76, height * 0.3, 0.08), pos: [0, clearance + 0.26, -hl + 0.02] },
      { geo: new THREE.BoxGeometry(width * 1.02, 0.09, length * 0.1), pos: [0, clearance + 0.08, hl - 0.04] },
      { geo: new THREE.BoxGeometry(0.18, 0.2, 0.65), pos: [-width * 0.48, clearance + 0.14, -0.05] },
      { geo: new THREE.BoxGeometry(0.18, 0.2, 0.65), pos: [width * 0.48, clearance + 0.14, -0.05] },
    );

    glassParts.push({
      geo: new THREE.BoxGeometry(width * 0.86, height * 0.38, 0.1),
      pos: [0, clearance + height * 0.72, -hl + 0.04],
    });
    headlightParts.push(
      { geo: new THREE.BoxGeometry(0.28, 0.1, 0.08), pos: [-width * 0.34, clearance + 0.24, -hl - 0.01] },
      { geo: new THREE.BoxGeometry(0.28, 0.1, 0.08), pos: [width * 0.34, clearance + 0.24, -hl - 0.01] },
    );
    taillightParts.push(
      { geo: new THREE.BoxGeometry(0.28, 0.1, 0.08), pos: [-width * 0.34, clearance + 0.3, hl + 0.01] },
      { geo: new THREE.BoxGeometry(0.28, 0.1, 0.08), pos: [width * 0.34, clearance + 0.3, hl + 0.01] },
    );
  } else {
    // 1. Sculpted Multi-Station Lofted Chassis
    const bodyGeo = track(createSculptedChassisGeometry(spec, Boolean(isRhino), lowDetail));
    const bodyMesh = new THREE.Mesh(bodyGeo, paintMat);
    bodyMesh.castShadow = !lowDetail;
    bodyMesh.receiveShadow = true;
    bodyGroup.add(bodyMesh);

    // 2. Curved Wraparound Greenhouse Glass + Cambered Roof Skin
    const cabin = createSculptedCabinGeometry(spec, Boolean(isRhino), lowDetail);
    roofY = cabin.roofY;
    const cabinGlassMesh = new THREE.Mesh(track(cabin.glassGeo), glassMat);
    bodyGroup.add(cabinGlassMesh);

    const roofMesh = new THREE.Mesh(
      track(cabin.roofGeo),
      !lowDetail && (spec.bodyStyle === 'exotic' || isBossCar) ? carbonMat : solidPaintMat,
    );
    roofMesh.castShadow = !lowDetail;
    bodyGroup.add(roofMesh);

    if (!lowDetail) {
      // Flush sleek A-pillars & C-pillars hugging the curved greenhouse tumblehome
      const pLenA = Math.hypot(cabin.roofFrontZ - cabin.windZ, cabin.roofY - cabin.beltY);
      const pAngA = Math.atan2(cabin.roofFrontZ - cabin.windZ, cabin.roofY - cabin.beltY);
      const pLenC = Math.hypot(cabin.rearZ - cabin.roofBackZ, cabin.roofY - cabin.beltY);
      const pAngC = -Math.atan2(cabin.rearZ - cabin.roofBackZ, cabin.roofY - cabin.beltY);
      const pillarW = width * 0.335;
      [-pillarW, pillarW].forEach((px) => {
        carbonParts.push(
          {
            geo: new THREE.BoxGeometry(0.036, pLenA, 0.042),
            pos: [px * 0.94, (cabin.beltY + cabin.roofY) * 0.5, (cabin.windZ + cabin.roofFrontZ) * 0.5],
            rot: [pAngA, 0, px < 0 ? -0.24 : 0.24],
          },
          {
            geo: new THREE.BoxGeometry(0.042, pLenC, 0.052),
            pos: [px * 0.94, (cabin.beltY + cabin.roofY) * 0.5, (cabin.roofBackZ + cabin.rearZ) * 0.5],
            rot: [pAngC, 0, px < 0 ? -0.24 : 0.24],
          },
        );
      });
      if (!isRhino) {
        carbonParts.push({
          geo: new THREE.BoxGeometry(0.028, 0.065, 0.15),
          pos: [0, cabin.roofY + 0.035, cabin.roofBackZ - 0.12],
          rot: [-0.30, 0, 0],
        });
      }
    }

    // 3. Recessed Dark Wheel-Well Liners + Sculpted Overfenders
    const wellFrontGeo = new THREE.CylinderGeometry(wheelRadius * 1.13, wheelRadius * 1.13, width * 0.91, 14);
    wellFrontGeo.rotateZ(Math.PI / 2);
    carbonParts.push({ geo: wellFrontGeo, pos: [0, wheelRadius * 0.94, frontAxleZ] });

    const wellRearGeo = new THREE.CylinderGeometry(wheelRadius * 1.13, wheelRadius * 1.13, width * 0.91, 14);
    wellRearGeo.rotateZ(Math.PI / 2);
    carbonParts.push({ geo: wellRearGeo, pos: [0, wheelRadius * 0.94, rearAxleZ] });

    if (!lowDetail) {
      const flareGeo = createWheelArchFlareGeometry(wheelRadius, isBossCar);
      const flareX = width * (isBossCar ? 0.505 : 0.488);
      [frontAxleZ, rearAxleZ].forEach((az) => {
        [-flareX, flareX].forEach((ax) => {
          solidPaintParts.push({ geo: flareGeo.clone(), pos: [ax, wheelRadius * 0.94, az] });
        });
      });
      flareGeo.dispose();
    }

    // 4. Sculpted Mirrors, Hood Vents & Mid-Engine / Muscle Aero Details
    if (!lowDetail && !isRhino) {
      if (spec.bodyStyle === 'muscle') {
        solidPaintParts.push({
          geo: new THREE.BoxGeometry(width * 0.30, 0.075, length * 0.26),
          pos: [0, cabin.beltY - 0.05, -hl * 0.45],
          rot: [0.07, 0, 0],
        });
        carbonParts.push({
          geo: new THREE.BoxGeometry(width * 0.25, 0.04, 0.20),
          pos: [0, cabin.beltY - 0.02, -hl * 0.58],
        });
      } else if (spec.bodyStyle === 'exotic') {
        [-0.08, 0.14, 0.36].forEach((lz) => {
          carbonParts.push({
            geo: new THREE.BoxGeometry(width * 0.44, 0.026, 0.11),
            pos: [0, cabin.beltY + 0.02, hl * 0.46 + lz * 0.42],
            rot: [-0.22, 0, 0],
          });
        });
        carbonParts.push(
          { geo: new THREE.BoxGeometry(0.07, 0.22, 0.58), pos: [-width * 0.48, clearance + height * 0.28, 0.24] },
          { geo: new THREE.BoxGeometry(0.07, 0.22, 0.58), pos: [width * 0.48, clearance + height * 0.28, 0.24] },
        );
      } else {
        carbonParts.push(
          {
            geo: new THREE.BoxGeometry(0.22, 0.028, 0.40),
            pos: [-width * 0.17, cabin.beltY - 0.07, -hl * 0.48],
            rot: [0.13, 0, 0],
          },
          {
            geo: new THREE.BoxGeometry(0.22, 0.028, 0.40),
            pos: [width * 0.17, cabin.beltY - 0.07, -hl * 0.48],
            rot: [0.13, 0, 0],
          },
        );
      }

      // Sculpted wing mirrors on stalks
      solidPaintParts.push(
        {
          geo: new THREE.BoxGeometry(0.16, 0.068, 0.13),
          pos: [-width * 0.47, cabin.beltY + 0.04, cabin.windZ + 0.15],
          rot: [0, -0.18, 0],
        },
        {
          geo: new THREE.BoxGeometry(0.16, 0.068, 0.13),
          pos: [width * 0.47, cabin.beltY + 0.04, cabin.windZ + 0.15],
          rot: [0, 0.18, 0],
        },
      );
    }

    // 5. Carbon Splitter, Intercooler Mesh Grille, Side Skirts & Quad-Fin Rear Diffuser
    const splitterExtend = isBossCar ? 0.46 : 0.34;
    carbonParts.push(
      { geo: new THREE.BoxGeometry(width * (isBossCar ? 1.04 : 0.96), 0.04, splitterExtend), pos: [0, clearance + 0.01, -hl + 0.05] },
      { geo: new THREE.BoxGeometry(width * (isBossCar ? 1.05 : 1.00), 0.06, length * 0.44), pos: [0, clearance + 0.02, 0] },
      { geo: new THREE.BoxGeometry(width * 0.80, 0.14, 0.22), pos: [0, clearance + 0.06, hl - 0.04] },
      { geo: new THREE.BoxGeometry(width * 0.50, 0.15, 0.07), pos: [0, clearance + 0.16, -hl + 0.02] },
    );

    if (isBossCar && !lowDetail) {
      // Exclusive Blacklist Boss Dive-Plane Front Canards + Side Skirt Winglets
      [-width * 0.49, width * 0.49].forEach((cx) => {
        const s = cx < 0 ? -1 : 1;
        carbonParts.push(
          { geo: new THREE.BoxGeometry(0.14, 0.025, 0.24), pos: [cx, clearance + 0.16, -hl + 0.22], rot: [0.18, s * 0.22, s * -0.12] },
          { geo: new THREE.BoxGeometry(0.08, 0.11, 0.22), pos: [cx * 1.04, clearance + 0.05, rearAxleZ - wheelRadius * 1.15 - 0.06] },
        );
      });
    }

    if (!isRhino && !lowDetail) {
      [-0.36, -0.13, 0.13, 0.36].forEach((dx) => {
        carbonParts.push({ geo: new THREE.BoxGeometry(0.032, 0.15, 0.25), pos: [dx, clearance + 0.07, hl - 0.01] });
      });
    }

    // 6. Recessed Xenon Projectors Under Clear Polycarbonate Lenses + Signature LED Taillights
    const headY = clearance + (spec.bodyStyle === 'exotic' ? 0.23 : 0.29);
    const tailLampY = clearance + height * (spec.bodyStyle === 'exotic' ? 0.48 : 0.46);

    if (!lowDetail) {
      carbonParts.push(
        { geo: new THREE.BoxGeometry(0.36, 0.11, 0.10), pos: [-width * 0.30, headY, -hl + 0.09], rot: [0, 0.22, 0] },
        { geo: new THREE.BoxGeometry(0.36, 0.11, 0.10), pos: [width * 0.30, headY, -hl + 0.09], rot: [0, -0.22, 0] },
        { geo: new THREE.BoxGeometry(0.46, 0.11, 0.07), pos: [-width * 0.29, tailLampY, hl - 0.04] },
        { geo: new THREE.BoxGeometry(0.46, 0.11, 0.07), pos: [width * 0.29, tailLampY, hl - 0.04] },
      );

      lensParts.push(
        { geo: new THREE.BoxGeometry(0.38, 0.115, 0.06), pos: [-width * 0.30, headY, -hl + 0.055], rot: [0.24, 0.22, 0] },
        { geo: new THREE.BoxGeometry(0.38, 0.115, 0.06), pos: [width * 0.30, headY, -hl + 0.055], rot: [0.24, -0.22, 0] },
      );

      const haloL = new THREE.TorusGeometry(0.042, 0.012, 6, 14);
      const haloR = new THREE.TorusGeometry(0.042, 0.012, 6, 14);
      headlightParts.push(
        { geo: haloL, pos: [-width * 0.31, headY, -hl + 0.048], rot: [0, 0.22, 0] },
        { geo: haloR, pos: [width * 0.31, headY, -hl + 0.048], rot: [0, -0.22, 0] },
        { geo: new THREE.BoxGeometry(0.28, 0.022, 0.04), pos: [-width * 0.30, headY + 0.036, -hl + 0.052], rot: [0, 0.22, 0] },
        { geo: new THREE.BoxGeometry(0.28, 0.022, 0.04), pos: [width * 0.30, headY + 0.036, -hl + 0.052], rot: [0, -0.22, 0] },
      );
    } else {
      headlightParts.push(
        { geo: new THREE.BoxGeometry(0.28, 0.065, 0.08), pos: [-width * 0.30, headY, -hl + 0.04], rot: [0, 0.18, 0] },
        { geo: new THREE.BoxGeometry(0.28, 0.065, 0.08), pos: [width * 0.30, headY, -hl + 0.04], rot: [0, -0.18, 0] },
      );
    }

    if (spec.bodyStyle === 'gtr' && !lowDetail) {
      [-width * 0.35, -width * 0.23, width * 0.23, width * 0.35].forEach((tx) => {
        const ringG = new THREE.TorusGeometry(0.044, 0.014, 6, 14);
        taillightParts.push({ geo: ringG, pos: [tx, tailLampY, hl - 0.008] });
      });
    } else {
      taillightParts.push(
        { geo: new THREE.BoxGeometry(0.40, 0.065, 0.06), pos: [-width * 0.29, tailLampY, hl - 0.01] },
        { geo: new THREE.BoxGeometry(0.40, 0.065, 0.06), pos: [width * 0.29, tailLampY, hl - 0.01] },
      );
    }

    reverseParts.push(
      { geo: new THREE.BoxGeometry(0.12, 0.045, 0.05), pos: [-width * 0.16, tailLampY - 0.01, hl - 0.01] },
      { geo: new THREE.BoxGeometry(0.12, 0.045, 0.05), pos: [width * 0.16, tailLampY - 0.01, hl - 0.01] },
    );

    if (!lowDetail) {
      const plateMat = track(
        new THREE.MeshStandardMaterial({
          color: isBossCar ? '#F59E0B' : '#E2E8F0',
          emissive: new THREE.Color(isBossCar ? '#78350F' : '#1E293B'),
          emissiveIntensity: 0.5,
          roughness: 0.3,
        }),
      );
      const plate = new THREE.Mesh(track(new THREE.BoxGeometry(0.34, 0.095, 0.03)), plateMat);
      plate.position.set(0, clearance + 0.24, hl - 0.005);
      bodyGroup.add(plate);
    }

    // 7. Signature Rear Spoilers & Exclusive Boss Twin-Plane Swan-Neck GT Wings
    if (!isPolice && !isRhino && !lowDetail) {
      const deckY = tailLampY + 0.12;
      if (isBossCar) {
        const wingH = 0.29;
        carbonParts.push(
          { geo: new THREE.BoxGeometry(width * 1.02, 0.038, 0.30), pos: [0, deckY + wingH, hl - 0.18], rot: [0.11, 0, 0] },
          { geo: new THREE.BoxGeometry(width * 0.94, 0.028, 0.16), pos: [0, deckY + wingH + 0.075, hl - 0.12], rot: [0.16, 0, 0] },
          { geo: new THREE.BoxGeometry(0.034, wingH + 0.04, 0.15), pos: [-width * 0.24, deckY + wingH * 0.5, hl - 0.20] },
          { geo: new THREE.BoxGeometry(0.034, wingH + 0.04, 0.15), pos: [width * 0.24, deckY + wingH * 0.5, hl - 0.20] },
        );
        solidPaintParts.push(
          { geo: new THREE.BoxGeometry(0.032, 0.22, 0.38), pos: [-width * 0.51, deckY + wingH + 0.02, hl - 0.17] },
          { geo: new THREE.BoxGeometry(0.032, 0.22, 0.38), pos: [width * 0.51, deckY + wingH + 0.02, hl - 0.17] },
        );
      } else if (spec.bodyStyle === 'muscle') {
        solidPaintParts.push({
          geo: new THREE.BoxGeometry(width * 0.84, 0.08, 0.17),
          pos: [0, deckY + 0.02, hl - 0.15],
          rot: [-0.34, 0, 0],
        });
      } else {
        const wingH = spec.bodyStyle === 'gtr' ? 0.25 : 0.19;
        carbonParts.push(
          { geo: new THREE.BoxGeometry(width * 0.92, 0.038, 0.26), pos: [0, deckY + wingH, hl - 0.17], rot: [0.09, 0, 0] },
          { geo: new THREE.BoxGeometry(0.035, wingH, 0.13), pos: [-width * 0.23, deckY + wingH * 0.5, hl - 0.19] },
          { geo: new THREE.BoxGeometry(0.035, wingH, 0.13), pos: [width * 0.23, deckY + wingH * 0.5, hl - 0.19] },
        );
        solidPaintParts.push(
          { geo: new THREE.BoxGeometry(0.032, 0.15, 0.32), pos: [-width * 0.46, deckY + wingH, hl - 0.17] },
          { geo: new THREE.BoxGeometry(0.032, 0.15, 0.32), pos: [width * 0.46, deckY + wingH, hl - 0.17] },
        );
      }
    }
  }

  // 8. Twin / Quad Chrome Exhausts
  const exhaustOffsets =
    !lowDetail && (spec.bodyStyle === 'gtr' || spec.bodyStyle === 'exotic' || isBossCar)
      ? [-0.48, -0.35, 0.35, 0.48]
      : [-0.40, 0.40];
  exhaustOffsets.forEach((ex) => {
    const exGeo = new THREE.CylinderGeometry(0.048, 0.048, 0.22, 8);
    exGeo.rotateX(Math.PI / 2);
    exhaustParts.push({ geo: exGeo, pos: [ex, clearance + 0.08, hl - 0.02] });
  });

  // Police Bullbar & Lightbar
  let lightbarRed: THREE.MeshStandardMaterial | undefined;
  let lightbarBlue: THREE.MeshStandardMaterial | undefined;
  if (isPolice || isRhino) {
    carbonParts.push(
      {
        geo: new THREE.BoxGeometry(width * (isRhino ? 0.85 : 0.68), isRhino ? 0.32 : 0.20, 0.14),
        pos: [0, clearance + (isRhino ? 0.29 : 0.19), -hl - 0.02],
      },
      { geo: new THREE.BoxGeometry(width * 0.58, 0.065, 0.20), pos: [0, roofY + 0.045, 0.05] },
    );

    lightbarRed = track(
      new THREE.MeshStandardMaterial({
        color: '#EF4444',
        emissive: new THREE.Color('#EF4444'),
        emissiveIntensity: 3.6,
      }),
    );
    lightbarBlue = track(
      new THREE.MeshStandardMaterial({
        color: '#3B82F6',
        emissive: new THREE.Color('#3B82F6'),
        emissiveIntensity: 3.6,
      }),
    );

    const podGeo = track(new THREE.BoxGeometry(width * 0.24, 0.082, 0.18));
    const podL = new THREE.Mesh(podGeo, lightbarRed);
    podL.position.set(-width * 0.15, roofY + 0.095, 0.05);
    const podR = new THREE.Mesh(podGeo, lightbarBlue);
    podR.position.set(width * 0.15, roofY + 0.095, 0.05);
    bodyGroup.add(podL, podR);
  }

  if (carbonParts.length > 0) {
    const m = new THREE.Mesh(track(bakeAndMerge(carbonParts)), carbonMat);
    m.castShadow = !lowDetail;
    bodyGroup.add(m);
  }
  if (solidPaintParts.length > 0) {
    bodyGroup.add(new THREE.Mesh(track(bakeAndMerge(solidPaintParts)), solidPaintMat));
  }
  if (glassParts.length > 0) {
    bodyGroup.add(new THREE.Mesh(track(bakeAndMerge(glassParts)), glassMat));
  }
  if (lensParts.length > 0) {
    bodyGroup.add(new THREE.Mesh(track(bakeAndMerge(lensParts)), lensCoverMat));
  }
  if (headlightParts.length > 0) {
    bodyGroup.add(new THREE.Mesh(track(bakeAndMerge(headlightParts)), headlightMat));
  }
  if (taillightParts.length > 0) {
    bodyGroup.add(new THREE.Mesh(track(bakeAndMerge(taillightParts)), brakeLightMat));
  }
  if (reverseParts.length > 0) {
    bodyGroup.add(new THREE.Mesh(track(bakeAndMerge(reverseParts)), reverseLightMat));
  }
  if (exhaustParts.length > 0) {
    bodyGroup.add(new THREE.Mesh(track(bakeAndMerge(exhaustParts)), chromeMat));
  }

  // Dynamic NOS Flames, Gearshift Exhaust Backfire Cones & Brake Glow Halos
  const nosFlames: THREE.Mesh[] = [];
  const backfireFlames: THREE.Mesh[] = [];
  const brakeGlows: THREE.Mesh[] = [];
  if (!lowDetail) {
    const flameGeo = track(new THREE.ConeGeometry(0.1, 1.15, 8));
    flameGeo.rotateX(Math.PI / 2);
    flameGeo.translate(0, 0, 0.52);
    const flameMat = track(
      new THREE.MeshBasicMaterial({
        color: '#38BDF8',
        transparent: true,
        opacity: 0.94,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const backfireGeo = track(new THREE.ConeGeometry(0.085, 0.72, 7));
    backfireGeo.rotateX(Math.PI / 2);
    backfireGeo.translate(0, 0, 0.34);
    const backfireMat = track(
      new THREE.MeshBasicMaterial({
        color: '#FB923C',
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );

    const flameL = new THREE.Mesh(flameGeo, flameMat);
    flameL.position.set(-0.40, clearance + 0.08, hl + 0.04);
    flameL.visible = false;
    const flameR = new THREE.Mesh(flameGeo, flameMat);
    flameR.position.set(0.40, clearance + 0.08, hl + 0.04);
    flameR.visible = false;
    bodyGroup.add(flameL, flameR);
    nosFlames.push(flameL, flameR);

    const bfL = new THREE.Mesh(backfireGeo, backfireMat);
    bfL.position.set(-0.40, clearance + 0.08, hl + 0.04);
    bfL.visible = false;
    const bfR = new THREE.Mesh(backfireGeo, backfireMat);
    bfR.position.set(0.40, clearance + 0.08, hl + 0.04);
    bfR.visible = false;
    bodyGroup.add(bfL, bfR);
    backfireFlames.push(bfL, bfR);

    const brakeGlowTex = track(createLightGlowTexture('rgba(239, 68, 68, 0.88)'));
    const brakeGlowGeo = track(new THREE.PlaneGeometry(0.95, 0.54));
    const brakeGlowMat = track(
      new THREE.MeshBasicMaterial({
        map: brakeGlowTex,
        transparent: true,
        opacity: 0.24,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    const tailYPos = clearance + height * 0.46;
    const bgL = new THREE.Mesh(brakeGlowGeo, brakeGlowMat);
    bgL.position.set(-width * 0.29, tailYPos, hl + 0.05);
    const bgR = new THREE.Mesh(brakeGlowGeo, brakeGlowMat);
    bgR.position.set(width * 0.29, tailYPos, hl + 0.05);
    bodyGroup.add(bgL, bgR);
    brakeGlows.push(bgL, bgR);
  }

  // 9. Four Wheels with Concave Split-5-Spoke Alloys, Drilled Rotors & Painted Calipers
  const wheelWidth = isRhino ? 0.34 : isBossCar ? 0.30 : 0.28;
  const trackHalfW = width * (isBossCar ? 0.47 : 0.455);

  const fl = buildWheelGroup(wheelRadius, wheelWidth, rimMat, tireMat, rotorMat, caliperMat, true, lowDetail, track);
  fl.pivot.position.set(-trackHalfW, wheelRadius, frontAxleZ);
  const fr = buildWheelGroup(wheelRadius, wheelWidth, rimMat, tireMat, rotorMat, caliperMat, false, lowDetail, track);
  fr.pivot.position.set(trackHalfW, wheelRadius, frontAxleZ);
  const rl = buildWheelGroup(wheelRadius, wheelWidth, rimMat, tireMat, rotorMat, caliperMat, true, lowDetail, track);
  rl.pivot.position.set(-trackHalfW, wheelRadius, rearAxleZ);
  const rr = buildWheelGroup(wheelRadius, wheelWidth, rimMat, tireMat, rotorMat, caliperMat, false, lowDetail, track);
  rr.pivot.position.set(trackHalfW, wheelRadius, rearAxleZ);

  root.add(fl.pivot, fr.pivot, rl.pivot, rr.pivot);

  return {
    root,
    bodyGroup,
    bodyMaterials: solidPaintMat === paintMat ? [paintMat] : [paintMat, solidPaintMat],
    rimMaterials: [rimMat],
    brakeLightMat,
    reverseLightMat,
    brakeGlows,
    nosFlames,
    backfireFlames,
    wheelFrontLeft: fl.pivot,
    wheelFrontRight: fr.pivot,
    wheelSpinners: [fl.spinner, fr.spinner, rl.spinner, rr.spinner],
    lightbarRed,
    lightbarBlue,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
