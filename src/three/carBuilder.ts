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

export interface UpgradeVisualLevels {
  engineLevel: number;
  turboLevel: number;
  nitrousLevel: number;
  tiresLevel: number;
}

export interface CarUpgradeVisualStage {
  engineLvl: number;
  turboLvl: number;
  nosLvl: number;
  tiresLvl: number;
  avgLevel: number;
  isMaxed: boolean;
  hasHighPower: boolean;
  hasTwinNos: boolean;
  hasProAero: boolean;
  hasFullApexPack: boolean;
}

export function resolveCarUpgradeVisualStage(levels?: UpgradeVisualLevels): CarUpgradeVisualStage {
  if (!levels) {
    return {
      engineLvl: 1,
      turboLvl: 1,
      nosLvl: 1,
      tiresLvl: 1,
      avgLevel: 1,
      isMaxed: false,
      hasHighPower: false,
      hasTwinNos: false,
      hasProAero: false,
      hasFullApexPack: false,
    };
  }
  const clamp = (v: number) => Math.max(1, Math.min(5, Math.round(v)));
  const engineLvl = clamp(levels.engineLevel);
  const turboLvl = clamp(levels.turboLevel);
  const nosLvl = clamp(levels.nitrousLevel);
  const tiresLvl = clamp(levels.tiresLevel);
  const avgLevel = (engineLvl + turboLvl + nosLvl + tiresLvl) * 0.25;
  const isMaxed = engineLvl >= 5 && turboLvl >= 5 && nosLvl >= 5 && tiresLvl >= 5;
  return {
    engineLvl,
    turboLvl,
    nosLvl,
    tiresLvl,
    avgLevel,
    isMaxed,
    hasHighPower: engineLvl >= 4 || turboLvl >= 4,
    hasTwinNos: nosLvl >= 4,
    hasProAero: tiresLvl >= 4 || avgLevel >= 4.0,
    hasFullApexPack: isMaxed || avgLevel >= 4.5,
  };
}

export interface CarVisualHandles {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  hoodGroup?: THREE.Group;
  frontBumperGroup?: THREE.Group;
  rearBumperGroup?: THREE.Group;
  spoilerGroup?: THREE.Group;
  paintHex: string;
  bodyMaterials: THREE.Material[];
  rimMaterials: THREE.MeshStandardMaterial[];
  brakeLightMat: THREE.MeshStandardMaterial;
  reverseLightMat: THREE.MeshStandardMaterial;
  rotorGlowMats: THREE.MeshStandardMaterial[];
  brakeGlows: THREE.Mesh[];
  nosFlames: THREE.Mesh[];
  nosCores: THREE.Mesh[];
  nosHalos: THREE.Mesh[];
  backfireFlames: THREE.Mesh[];
  wheelFrontLeft: THREE.Group;
  wheelFrontRight: THREE.Group;
  wheelHubs: [THREE.Group, THREE.Group, THREE.Group, THREE.Group];
  wheelCamberPivots: [THREE.Group, THREE.Group, THREE.Group, THREE.Group];
  wheelBaseRadius: number;
  wheelSpinners: THREE.Group[];
  lightbarRed?: THREE.MeshStandardMaterial;
  lightbarBlue?: THREE.MeshStandardMaterial;
  lightbarHaloRed?: THREE.Mesh;
  lightbarHaloBlue?: THREE.Mesh;
  isMaxStage?: boolean;
  upgradeStageAvg?: number;
  dispose: () => void;
}

let cachedHeadlightPoolTex: THREE.Texture | null = null;
const cachedLightGlowTextures = new Map<string, THREE.Texture>();

function getSharedHeadlightPoolTexture(): THREE.Texture {
  if (!cachedHeadlightPoolTex) {
    cachedHeadlightPoolTex = createHeadlightPoolTexture();
  }
  return cachedHeadlightPoolTex;
}

function getSharedLightGlowTexture(rgba: string): THREE.Texture {
  let tex = cachedLightGlowTextures.get(rgba);
  if (!tex) {
    tex = createLightGlowTexture(rgba);
    cachedLightGlowTextures.set(rgba, tex);
  }
  return tex;
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
  upgradeLevels?: UpgradeVisualLevels;
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

/**
 * Generates a crisp, 45-degree chamfered automotive cube block centered at (0,0,0)
 * whose exact outer bounds equal (w, h, d).
 */
function makeChamferCube(
  w: number,
  h: number,
  d: number,
  bevel = 0.036,
  lowDetail = false,
): THREE.BufferGeometry {
  if (lowDetail || bevel <= 0.005 || Math.min(w, h, d) <= bevel * 2.4) {
    return new THREE.BoxGeometry(w, h, d);
  }
  const b = Math.min(bevel, w * 0.28, h * 0.28, d * 0.28);
  const iw = Math.max(0.01, w - 2 * b);
  const ih = Math.max(0.01, h - 2 * b);
  const id = Math.max(0.01, d - 2 * b);

  const shape = new THREE.Shape();
  shape.moveTo(-iw * 0.5, -ih * 0.5);
  shape.lineTo(iw * 0.5, -ih * 0.5);
  shape.lineTo(iw * 0.5, ih * 0.5);
  shape.lineTo(-iw * 0.5, ih * 0.5);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: id,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 1,
    curveSegments: 1,
  });
  geo.translate(0, 0, -id * 0.5);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Projects clean top-down automotive UVs onto merged cubic paint geometry so racing
 * stripes, Most Wanted razor flanks, and police door graphics map accurately.
 */
function applyPlanarCarUVs(geo: THREE.BufferGeometry, width: number, length: number) {
  const pos = geo.attributes.position;
  const uvs = new Float32Array(pos.count * 2);
  const invW = 1 / Math.max(0.1, width * 1.06);
  const invL = 1 / Math.max(0.1, length * 1.04);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const u = THREE.MathUtils.clamp(0.5 + x * invW, 0.01, 0.99);
    const v = THREE.MathUtils.clamp(0.5 + z * invL, 0.01, 0.99);
    uvs[i * 2] = u;
    uvs[i * 2 + 1] = v;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}

/**
 * Chunky deep-dish multi-spoke forged wheel assembly with ventilated brake rotor & caliper.
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
  isOffroad: boolean,
  track: <T extends { dispose: () => void }>(item: T) => T,
  hasProStageWheel = false,
): { pivot: THREE.Group; spinner: THREE.Group } {
  const pivot = new THREE.Group();
  const spinner = new THREE.Group();
  pivot.add(spinner);

  let tireGeo: THREE.BufferGeometry;
  if (lowPoly) {
    tireGeo = track(new THREE.CylinderGeometry(radius, radius, width, 12));
    tireGeo.rotateZ(Math.PI / 2);
  } else {
    const hw = width * 0.5;
    const innerR = radius * (isOffroad ? 0.58 : 0.68);
    const pts = [
      new THREE.Vector2(innerR, -hw * 0.88),
      new THREE.Vector2(radius * 0.92, -hw),
      new THREE.Vector2(radius, -hw * 0.72),
      new THREE.Vector2(radius, hw * 0.72),
      new THREE.Vector2(radius * 0.92, hw),
      new THREE.Vector2(innerR, hw * 0.88),
    ];
    tireGeo = track(new THREE.LatheGeometry(pts, 20));
    tireGeo.rotateZ(Math.PI / 2);
  }
  const tire = new THREE.Mesh(tireGeo, tireMat);
  tire.castShadow = !lowPoly;
  spinner.add(tire);

  const xSign = isLeft ? -1 : 1;
  const rimParts: GeoPart[] = [];
  const rimR = radius * (isOffroad ? 0.59 : 0.69);

  // Outer barrel drum + stepped polished lip ring + inner recessed flange
  const barrelGeo = new THREE.CylinderGeometry(rimR, rimR, width * 0.94, lowPoly ? 12 : 20, 1, true);
  barrelGeo.rotateZ(Math.PI / 2);
  rimParts.push({ geo: barrelGeo });

  const lipGeo = new THREE.TorusGeometry(rimR * 0.975, 0.022, 6, lowPoly ? 12 : 22);
  lipGeo.rotateY(Math.PI / 2);
  rimParts.push({ geo: lipGeo, pos: [xSign * (width * 0.47), 0, 0] });

  if (!lowPoly) {
    const innerStepGeo = new THREE.TorusGeometry(rimR * 0.87, 0.015, 6, 20);
    innerStepGeo.rotateY(Math.PI / 2);
    rimParts.push({ geo: innerStepGeo, pos: [xSign * (width * 0.36), 0, 0] });
  }

  // Billet center-lock hub + recessed lug collar
  const capGeo = new THREE.CylinderGeometry(rimR * 0.24, rimR * 0.28, width * 0.68, lowPoly ? 8 : 12);
  capGeo.rotateZ(Math.PI / 2);
  rimParts.push({ geo: capGeo, pos: [xSign * (width * 0.11), 0, 0] });

  if (!lowPoly) {
    const lockRing = new THREE.TorusGeometry(rimR * 0.15, 0.014, 6, 12);
    lockRing.rotateY(Math.PI / 2);
    rimParts.push({ geo: lockRing, pos: [xSign * (width * 0.44), 0, 0] });
  }

  // Sculpted deep-concave Y-spokes / 6-spoke offroad spokes
  const spokeCount = isOffroad ? 6 : 5;
  for (let i = 0; i < spokeCount; i++) {
    const baseAngle = (i * Math.PI * 2) / spokeCount;
    if (lowPoly || isOffroad) {
      const midR = rimR * 0.54;
      rimParts.push({
        geo: new THREE.BoxGeometry(0.032, rimR * 0.88, isOffroad ? 0.065 : 0.042),
        pos: [
          xSign * (width * 0.39),
          Math.cos(baseAngle) * midR,
          Math.sin(baseAngle) * midR,
        ],
        rot: [-baseAngle, 0, xSign * -0.14],
      });
    } else {
      // Inner stem + split outer Y-arms for authentic forged concave depth
      const stemR = rimR * 0.31;
      rimParts.push({
        geo: new THREE.BoxGeometry(0.034, rimR * 0.30, 0.046),
        pos: [
          xSign * (width * 0.34),
          Math.cos(baseAngle) * stemR,
          Math.sin(baseAngle) * stemR,
        ],
        rot: [-baseAngle, 0, xSign * -0.22],
      });
      [-0.17, 0.17].forEach((offsetAngle) => {
        const a = baseAngle + offsetAngle;
        const midR = rimR * 0.64;
        rimParts.push({
          geo: new THREE.BoxGeometry(0.026, rimR * 0.62, 0.028),
          pos: [
            xSign * (width * 0.40),
            Math.cos(a) * midR,
            Math.sin(a) * midR,
          ],
          rot: [-a, 0, xSign * -0.15],
        });
      });
    }
  }

  const mergedRimGeo = track(bakeAndMerge(rimParts));
  const rim = new THREE.Mesh(mergedRimGeo, rimMat);
  spinner.add(rim);

  if (!lowPoly && hasProStageWheel) {
    // Stage-5 anodized center-lock wheel nut + outer aero cooling lip accent
    const nutGeo = track(new THREE.CylinderGeometry(rimR * 0.14, rimR * 0.14, 0.04, 6));
    nutGeo.rotateZ(Math.PI / 2);
    const nut = new THREE.Mesh(nutGeo, caliperMat);
    nut.position.set(xSign * (width * 0.45), 0, 0);
    spinner.add(nut);
  }

  if (!lowPoly) {
    // Ventilated disc + center alloy hat + cooling ring detail
    const rotorGeo = track(new THREE.CylinderGeometry(rimR * 0.84, rimR * 0.84, 0.036, 18));
    rotorGeo.rotateZ(Math.PI / 2);
    const rotor = new THREE.Mesh(rotorGeo, rotorMat);
    rotor.position.set(xSign * (width * 0.14), 0, 0);
    spinner.add(rotor);

    const hatGeo = track(new THREE.CylinderGeometry(rimR * 0.42, rimR * 0.46, 0.055, 12));
    hatGeo.rotateZ(Math.PI / 2);
    const rotorHat = new THREE.Mesh(hatGeo, tireMat);
    rotorHat.position.set(xSign * (width * 0.145), 0, 0);
    spinner.add(rotorHat);

    // Multi-piston radial Brembo caliper + outer bridge rib
    const caliperGroup = new THREE.Group();
    const caliperBody = new THREE.Mesh(
      track(new THREE.BoxGeometry(width * 0.34, rimR * 0.56, rimR * 0.38)),
      caliperMat,
    );
    const caliperRib = new THREE.Mesh(
      track(new THREE.BoxGeometry(width * 0.38, rimR * 0.24, rimR * 0.18)),
      caliperMat,
    );
    caliperRib.position.set(xSign * 0.015, 0, 0);
    caliperGroup.add(caliperBody, caliperRib);
    caliperGroup.position.set(xSign * (width * 0.21), 0.04, -rimR * 0.44);
    pivot.add(caliperGroup);
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
  const { width, height, length, wheelRadius: rawWheelRadius } = spec.dimensions;
  const lowDetail = Boolean(isTraffic || isTrafficTruck);
  const upgradeStage = resolveCarUpgradeVisualStage(
    lowDetail || isPolice || isRhino ? undefined : opts.upgradeLevels,
  );
  const isBossCar = Boolean(spec.bossOnly || spec.aeroKit === 'boss_gt');
  const isWide = Boolean(isBossCar || spec.aeroKit === 'widebody' || upgradeStage.hasProAero);
  const style = spec.bodyStyle;
  const wheelRadius = isRhino ? rawWheelRadius : rawWheelRadius * 0.84;

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
  contactShadow.position.y = 0.006;
  root.add(contactShadow);

  // Stage-5 Maxed / Pro-NOS subtle chassis ground underglow aura
  if (!lowDetail && !isPolice && !isRhino && (upgradeStage.hasFullApexPack || upgradeStage.nosLvl >= 5)) {
    const glowColor = upgradeStage.isMaxed
      ? 'rgba(245, 158, 11, 0.72)'
      : 'rgba(56, 189, 248, 0.68)';
    const underTex = getSharedLightGlowTexture(glowColor);
    const underGeo = track(new THREE.PlaneGeometry(width * 1.9, length * 1.36));
    underGeo.rotateX(-Math.PI / 2);
    const underMat = track(
      new THREE.MeshBasicMaterial({
        map: underTex,
        transparent: true,
        opacity: upgradeStage.isMaxed ? 0.56 : 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const underMesh = new THREE.Mesh(underGeo, underMat);
    underMesh.position.y = 0.012;
    root.add(underMesh);
  }

  if (isPlayer) {
    const beamTex = getSharedHeadlightPoolTexture();
    const beamGeo = track(new THREE.PlaneGeometry(width * 3.8, 19));
    beamGeo.rotateX(-Math.PI / 2);
    const beamMat = track(
      new THREE.MeshBasicMaterial({
        map: beamTex,
        transparent: true,
        opacity: 0.74,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const beamMesh = new THREE.Mesh(beamGeo, beamMat);
    beamMesh.position.set(0, 0.014, -length * 0.5 - 8.6);
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
          metalness: 0.16,
          roughness: 0.26,
        })
      : new THREE.MeshPhysicalMaterial({
          color: liveryTex ? 0xffffff : new THREE.Color(isPolice || isRhino ? '#0F172A' : paintHex),
          map: liveryTex,
          metalness: isPolice || isRhino ? 0.24 : 0.18,
          roughness: 0.19,
          clearcoat: 0.98,
          clearcoatRoughness: 0.032,
          envMapIntensity: 1.22,
        }),
  );

  const solidPaintMat = track(
    lowDetail
      ? paintMat
      : new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(
            isPolice || isRhino ? '#0F172A' : livery === 'most_wanted' ? '#DCE2EC' : paintHex,
          ),
          metalness: isPolice || isRhino ? 0.24 : 0.18,
          roughness: 0.19,
          clearcoat: 0.98,
          clearcoatRoughness: 0.032,
          envMapIntensity: 1.22,
        }),
  );

  const carbonMat = track(
    new THREE.MeshStandardMaterial({
      color: '#12151E',
      metalness: 0.38,
      roughness: 0.42,
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
          metalness: 0.38,
          roughness: 0.025,
          clearcoat: 1.0,
          clearcoatRoughness: 0.015,
          envMapIntensity: 1.88,
        }),
  );

  const rimColor = RIM_OPTIONS.find((r) => r.id === rimStyle)?.colorHex ?? '#CBD5E1';
  const rimMat = track(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(rimColor),
      metalness: rimStyle === 'black' ? 0.48 : 0.96,
      roughness: rimStyle === 'black' ? 0.32 : 0.11,
    }),
  );

  const frontRotorMat = track(
    new THREE.MeshStandardMaterial({
      color: '#94A3B8',
      metalness: 0.88,
      roughness: 0.28,
      emissive: new THREE.Color('#FF4500'),
      emissiveIntensity: 0,
    }),
  );
  const rearRotorMat = track(
    new THREE.MeshStandardMaterial({
      color: '#94A3B8',
      metalness: 0.88,
      roughness: 0.28,
      emissive: new THREE.Color('#FF4500'),
      emissiveIntensity: 0,
    }),
  );
  const tireMat = track(new THREE.MeshStandardMaterial({ color: '#14161B', metalness: 0.04, roughness: 0.88 }));
  const caliperMat = track(
    new THREE.MeshStandardMaterial({
      color:
        isPolice || isRhino
          ? '#F59E0B'
          : isBossCar || upgradeStage.hasProAero
            ? '#FBBF24'
            : '#EF4444',
      metalness: 0.72,
      roughness: 0.18,
    }),
  );
  const titaniumMat = track(
    new THREE.MeshStandardMaterial({
      color: '#38BDF8',
      emissive: new THREE.Color('#0284C7'),
      emissiveIntensity: upgradeStage.isMaxed ? 0.55 : 0.28,
      metalness: 0.88,
      roughness: 0.18,
    }),
  );
  const nosBottleMat = track(
    new THREE.MeshStandardMaterial({
      color: '#06B6D4',
      emissive: new THREE.Color('#0EA5E9'),
      emissiveIntensity: upgradeStage.nosLvl >= 5 ? 0.85 : 0.35,
      metalness: 0.75,
      roughness: 0.16,
    }),
  );
  const headlightMat = track(
    new THREE.MeshStandardMaterial({ color: '#FEF9C3', emissive: new THREE.Color('#FFFBEB'), emissiveIntensity: 3.9 }),
  );
  const brakeLightMat = track(
    new THREE.MeshStandardMaterial({ color: '#991B1B', emissive: new THREE.Color('#EF4444'), emissiveIntensity: 1.6 }),
  );
  const reverseLightMat = track(
    new THREE.MeshStandardMaterial({ color: '#E2E8F0', emissive: new THREE.Color('#F8FAFC'), emissiveIntensity: 0.15 }),
  );
  const chromeMat = track(new THREE.MeshStandardMaterial({ color: '#E2E8F0', metalness: 0.94, roughness: 0.14 }));

  const stanceDrop = upgradeStage.hasProAero ? (upgradeStage.isMaxed ? 0.02 : 0.012) : 0;
  const clearance = Math.max(0.055, wheelRadius * (isRhino ? 0.62 : 0.27) - stanceDrop);
  const hl = length * 0.5;
  const frontAxleZ = -length * 0.305;
  const rearAxleZ = length * 0.305;

  const paintParts: GeoPart[] = [];
  const solidPaintParts: GeoPart[] = [];
  const carbonParts: GeoPart[] = [];
  const glassParts: GeoPart[] = [];
  const headlightParts: GeoPart[] = [];
  const taillightParts: GeoPart[] = [];
  const reverseParts: GeoPart[] = [];
  const chromeParts: GeoPart[] = [];
  const accentParts: GeoPart[] = [];

  let hoodGroup: THREE.Group | undefined;
  let frontBumperGroup: THREE.Group | undefined;
  let rearBumperGroup: THREE.Group | undefined;
  let spoilerGroup: THREE.Group | undefined;

  let roofY = clearance + height;

  if (isTrafficTruck) {
    // Detailed Cubic Box Delivery Truck
    const cabGeo = track(new THREE.BoxGeometry(width, height * 0.92, length * 0.33));
    const cab = new THREE.Mesh(cabGeo, solidPaintMat);
    cab.position.set(0, clearance + height * 0.46, -hl + length * 0.18);
    bodyGroup.add(cab);

    const cargoMat = track(new THREE.MeshStandardMaterial({ color: '#DCE2EC', roughness: 0.62, metalness: 0.15 }));
    const cargoGeo = track(new THREE.BoxGeometry(width + 0.18, height * 1.38, length * 0.65));
    const cargo = new THREE.Mesh(cargoGeo, cargoMat);
    cargo.position.set(0, clearance + height * 0.72, hl - length * 0.34);
    bodyGroup.add(cargo);

    carbonParts.push(
      { geo: new THREE.BoxGeometry(width * 0.78, height * 0.32, 0.1), pos: [0, clearance + 0.28, -hl + 0.01] },
      { geo: new THREE.BoxGeometry(width * 1.04, 0.1, length * 0.12), pos: [0, clearance + 0.08, hl - 0.04] },
      { geo: new THREE.BoxGeometry(0.16, 0.22, 0.68), pos: [-width * 0.48, clearance + 0.14, 0] },
      { geo: new THREE.BoxGeometry(0.16, 0.22, 0.68), pos: [width * 0.48, clearance + 0.14, 0] },
    );

    glassParts.push({
      geo: new THREE.BoxGeometry(width * 0.88, height * 0.36, 0.12),
      pos: [0, clearance + height * 0.7, -hl + 0.03],
    });
    headlightParts.push(
      { geo: new THREE.BoxGeometry(0.28, 0.11, 0.08), pos: [-width * 0.34, clearance + 0.24, -hl - 0.01] },
      { geo: new THREE.BoxGeometry(0.28, 0.11, 0.08), pos: [width * 0.34, clearance + 0.24, -hl - 0.01] },
    );
    taillightParts.push(
      { geo: new THREE.BoxGeometry(0.28, 0.12, 0.08), pos: [-width * 0.34, clearance + 0.32, hl + 0.01] },
      { geo: new THREE.BoxGeometry(0.28, 0.12, 0.08), pos: [width * 0.34, clearance + 0.32, hl + 0.01] },
    );
  } else if (isRhino) {
    // --- HEAVY ARMORED SWAT RHINO CUBE ENFORCER ---
    const lowerH = height * 0.56;
    const upperH = height * 0.46;
    const lowerY = clearance + lowerH * 0.5;
    const upperY = clearance + lowerH + upperH * 0.5 - 0.04;
    roofY = clearance + lowerH + upperH;

    paintParts.push(
      { geo: makeChamferCube(width * 0.96, lowerH, length * 0.94, 0.05, lowDetail), pos: [0, lowerY, 0] },
      { geo: makeChamferCube(width * 0.88, upperH, length * 0.72, 0.045, lowDetail), pos: [0, upperY, hl * 0.16] },
      // Raised armor hood plate
      { geo: makeChamferCube(width * 0.82, 0.14, length * 0.30, 0.03, lowDetail), pos: [0, clearance + lowerH + 0.04, -hl * 0.64] },
    );

    // Chunky square offroad fender armor blocks
    const flareX = width * 0.48;
    [frontAxleZ, rearAxleZ].forEach((az) => {
      [-flareX, flareX].forEach((ax) => {
        carbonParts.push(
          { geo: new THREE.BoxGeometry(0.14, 0.14, wheelRadius * 2.2), pos: [ax, clearance + wheelRadius * 1.25, az] },
          { geo: new THREE.BoxGeometry(0.14, wheelRadius * 0.85, 0.16), pos: [ax, clearance + wheelRadius * 0.82, az - wheelRadius * 1.02] },
          { geo: new THREE.BoxGeometry(0.14, wheelRadius * 0.85, 0.16), pos: [ax, clearance + wheelRadius * 0.82, az + wheelRadius * 1.02] },
        );
      });
    });

    // Armored windshield & tactical side slit windows
    glassParts.push(
      { geo: new THREE.BoxGeometry(width * 0.78, upperH * 0.58, 0.10), pos: [0, upperY + 0.03, -hl * 0.21], rot: [-0.24, 0, 0] },
      { geo: new THREE.BoxGeometry(width * 0.90, upperH * 0.42, length * 0.58), pos: [0, upperY + 0.04, hl * 0.19] },
    );
    // Window armor louver bars + roof rack + rear spare tire block
    carbonParts.push(
      { geo: new THREE.BoxGeometry(width * 0.86, 0.08, length * 0.54), pos: [0, roofY + 0.02, hl * 0.18] },
      { geo: new THREE.BoxGeometry(width * 0.92, 0.28, 0.18), pos: [0, clearance + 0.16, -hl - 0.02] },
      { geo: new THREE.BoxGeometry(0.68, 0.68, 0.24), pos: [0, clearance + lowerH * 0.75, hl + 0.04] },
      { geo: new THREE.BoxGeometry(width * 0.96, 0.22, 0.16), pos: [0, clearance + 0.14, hl + 0.01] },
    );
    chromeParts.push(
      { geo: new THREE.BoxGeometry(width * 0.76, 0.16, 0.08), pos: [0, clearance + lowerH * 0.54, -hl + 0.03] },
    );
    headlightParts.push(
      { geo: new THREE.BoxGeometry(0.30, 0.14, 0.08), pos: [-width * 0.32, clearance + lowerH * 0.56, -hl + 0.01] },
      { geo: new THREE.BoxGeometry(0.30, 0.14, 0.08), pos: [width * 0.32, clearance + lowerH * 0.56, -hl + 0.01] },
    );
    taillightParts.push(
      { geo: new THREE.BoxGeometry(0.24, 0.26, 0.08), pos: [-width * 0.38, clearance + lowerH * 0.62, hl - 0.01] },
      { geo: new THREE.BoxGeometry(0.24, 0.26, 0.08), pos: [width * 0.38, clearance + lowerH * 0.62, hl - 0.01] },
    );
    reverseParts.push(
      { geo: new THREE.BoxGeometry(0.14, 0.08, 0.08), pos: [-width * 0.38, clearance + lowerH * 0.42, hl - 0.01] },
      { geo: new THREE.BoxGeometry(0.14, 0.08, 0.08), pos: [width * 0.38, clearance + lowerH * 0.42, hl - 0.01] },
    );
  } else {
    // --- DETAILED CUBIC AUTOMOTIVE ARCHITECTURE (5 DISTINCT BODY STYLES + POLICE) ---
    const bodyWidthScale = isBossCar ? 1.04 : isWide ? 1.02 : 0.97;
    const bw = width * bodyWidthScale;
    const isExotic = style === 'exotic' && !isPolice;
    const isMuscle = style === 'muscle' && !isPolice;
    const isGtr = style === 'gtr' && !isPolice;
    const isSedan = style === 'sedan' || isPolice;
    const isHatch = (spec.id === 'golf_gti' || spec.id === 'boss_10_gti' || spec.id === 'cobalt_gt') && !isPolice;

    const lowerH = height * (isExotic ? 0.46 : isMuscle ? 0.52 : 0.54);
    const beltY = clearance + lowerH;
    const cabH = height * (isExotic ? 0.42 : isMuscle ? 0.43 : 0.46);
    roofY = beltY + cabH;

    // 1. Core Stepped Cubic Chassis Tub (Center Cabin Section + Nose + Tail Blocks)
    const noseLen = length * (isExotic ? 0.35 : isMuscle ? 0.41 : 0.33);
    const tailLen = length * (isExotic ? 0.29 : isHatch ? 0.18 : 0.27);
    const midLen = Math.max(0.8, length - noseLen - tailLen + 0.14);
    const noseCenterZ = -hl + noseLen * 0.5;
    const tailCenterZ = hl - tailLen * 0.5;
    const midCenterZ = (noseCenterZ + noseLen * 0.5 + (tailCenterZ - tailLen * 0.5)) * 0.5;

    const noseH = lowerH * (isExotic ? 0.68 : isMuscle ? 0.90 : 0.86);
    const tailH = lowerH * (isExotic ? 1.04 : isMuscle ? 1.05 : 0.98);

    // Lower rocker sill core
    paintParts.push(
      // Central door/cockpit block (with clean waist step)
      { geo: makeChamferCube(bw * 0.95, lowerH, midLen, 0.042, lowDetail), pos: [0, clearance + lowerH * 0.5, midCenterZ] },
      // Front hood/nose block (sloped wedge for exotic, muscular flat slab for muscle, boxy nose for coupe/sedan)
      {
        geo: makeChamferCube(bw * (isExotic ? 0.92 : 0.95), noseH, noseLen, 0.04, lowDetail),
        pos: [0, clearance + noseH * 0.5, noseCenterZ],
        rot: [isExotic ? -0.10 : -0.04, 0, 0],
      },
      // Rear quarter / trunk deck block
      {
        geo: makeChamferCube(bw * 0.97, tailH, tailLen, 0.04, lowDetail),
        pos: [0, clearance + tailH * 0.5, tailCenterZ],
      },
    );

    const cabW = bw * (isExotic ? 0.77 : isMuscle ? 0.78 : 0.82);
    const cabStartZ = isExotic ? -hl * 0.44 : isMuscle ? -hl * 0.10 : -hl * 0.28;
    const cabEndZ = isHatch ? hl * 0.84 : isSedan ? hl * 0.62 : isExotic ? hl * 0.34 : hl * 0.56;
    const cabLen = Math.max(1.1, cabEndZ - cabStartZ);
    const cabCenterZ = (cabStartZ + cabEndZ) * 0.5;

    // Side door sculpting, crisp shut-line seam strips, aero side-skirt blades, winglets, fuel cap, and fender gill vents
    if (!lowDetail) {
      paintParts.push(
        { geo: makeChamferCube(bw * 0.99, lowerH * 0.42, midLen * 0.86, 0.028, false), pos: [0, clearance + lowerH * 0.68, midCenterZ] },
        { geo: makeChamferCube(bw * 1.005, 0.05, midLen * 0.88, 0.012, false), pos: [0, beltY - 0.025, midCenterZ] },
      );
      const frontDoorSeamZ = Math.max(frontAxleZ + wheelRadius * 1.32, midCenterZ - midLen * 0.36);
      const rearDoorSeamZ = Math.min(rearAxleZ - wheelRadius * 1.32, midCenterZ + midLen * 0.36);
      [-bw * 0.495, bw * 0.495].forEach((sx) => {
        const sideSign = sx < 0 ? -1 : 1;
        // Vertical front & rear door shut-line recesses
        carbonParts.push(
          { geo: new THREE.BoxGeometry(0.014, lowerH * 0.50, 0.02), pos: [sx, clearance + lowerH * 0.44, frontDoorSeamZ] },
          { geo: new THREE.BoxGeometry(0.014, lowerH * 0.48, 0.02), pos: [sx, clearance + lowerH * 0.44, rearDoorSeamZ] },
          // Lower aero rocker crease line + extended carbon side-skirt blade
          { geo: new THREE.BoxGeometry(0.018, 0.022, midLen * 0.76), pos: [sx, clearance + 0.15, midCenterZ] },
          { geo: makeChamferCube(0.075, 0.036, midLen * 0.92, 0.008, false), pos: [sideSign * (bw * 0.515), clearance + 0.035, midCenterZ] },
          // Upright rear side-skirt aero winglet ahead of rear arch
          { geo: makeChamferCube(0.045, 0.14, 0.16, 0.008, false), pos: [sideSign * (bw * 0.53), clearance + 0.10, rearAxleZ - wheelRadius * 1.18] },
          // Fender heat-extractor louver slot behind front arch
          { geo: new THREE.BoxGeometry(0.028, lowerH * 0.24, 0.11), pos: [sx, clearance + lowerH * 0.38, frontAxleZ + wheelRadius * 1.20] },
          // Flush aero door handles
          { geo: makeChamferCube(0.042, 0.034, 0.16, 0.008, false), pos: [sx, beltY - 0.11, cabCenterZ + 0.08] },
        );
      });
      // Machined aluminum fuel filler cap on right rear flank
      const capGeo = new THREE.CylinderGeometry(0.068, 0.068, 0.025, 12);
      capGeo.rotateZ(Math.PI / 2);
      chromeParts.push({ geo: capGeo, pos: [bw * 0.488, beltY - 0.08, rearAxleZ - wheelRadius * 1.18] });
    }

    // 2. Boxy Stepped Fender Flares & Recessed Wheel Arch Liners (strictly tucked below archTopY & tire top)
    const linerR = wheelRadius * 0.94;
    const frontLinerY = wheelRadius * 0.96;
    const rearLinerY = wheelRadius * 0.96;
    const linerW = 0.26;
    [-bw * 0.35, bw * 0.35].forEach((lx) => {
      const wellFrontGeo = new THREE.CylinderGeometry(linerR, linerR, linerW, 12);
      wellFrontGeo.rotateZ(Math.PI / 2);
      carbonParts.push({ geo: wellFrontGeo, pos: [lx, frontLinerY, frontAxleZ] });

      const wellRearGeo = new THREE.CylinderGeometry(linerR, linerR, linerW, 12);
      wellRearGeo.rotateZ(Math.PI / 2);
      carbonParts.push({ geo: wellRearGeo, pos: [lx, rearLinerY, rearAxleZ] });
    });

    const flareOut = isBossCar ? 0.11 : isWide ? 0.085 : 0.055;
    const flareX = bw * 0.5 + flareOut * 0.35;
    const archTopY = wheelRadius * 2.24;
    const archW = wheelRadius * 2.42;
    const cheekBottomY = clearance + 0.02;
    const cheekH = Math.max(0.24, archTopY - cheekBottomY);
    const cheekCenterY = (cheekBottomY + archTopY) * 0.5;

    [frontAxleZ, rearAxleZ].forEach((az) => {
      [-flareX, flareX].forEach((ax) => {
        // Seamless horizontal top fender block + full-height cheek pillars framing the wheel
        paintParts.push(
          { geo: makeChamferCube(0.14 + flareOut, 0.105, archW, 0.022, lowDetail), pos: [ax, archTopY, az] },
          { geo: makeChamferCube(0.12 + flareOut, cheekH, 0.21, 0.02, lowDetail), pos: [ax, cheekCenterY, az - archW * 0.45] },
          { geo: makeChamferCube(0.12 + flareOut, cheekH, 0.21, 0.02, lowDetail), pos: [ax, cheekCenterY, az + archW * 0.45] },
        );
      });
    });

    // Rally Mudflaps for Sedan
    if (isSedan && !isPolice && !lowDetail) {
      [-bw * 0.44, bw * 0.44].forEach((mx) => {
        accentParts.push(
          { geo: new THREE.BoxGeometry(0.20, 0.18, 0.03), pos: [mx, clearance + 0.02, frontAxleZ + wheelRadius * 1.05] },
          { geo: new THREE.BoxGeometry(0.20, 0.18, 0.03), pos: [mx, clearance + 0.02, rearAxleZ + wheelRadius * 1.05] },
        );
      });
    }

    // 3. Distinct Cubic Greenhouse Cabins (Style-Specific Geometry!)

    // Tinted glass cabin core
    glassParts.push(
      {
        geo: makeChamferCube(cabW * 0.96, cabH * 0.92, cabLen, 0.03, lowDetail),
        pos: [0, beltY + cabH * 0.42, cabCenterZ],
      },
      // Raked front windshield block
      {
        geo: makeChamferCube(cabW * 0.93, cabH * 0.88, 0.42, 0.02, lowDetail),
        pos: [0, beltY + cabH * 0.40, cabStartZ - 0.12],
        rot: [-0.52, 0, 0],
      },
    );

    if (!isHatch) {
      // Sloped rear fastback window block
      glassParts.push({
        geo: makeChamferCube(cabW * 0.92, cabH * 0.82, isExotic ? 0.55 : 0.48, 0.02, lowDetail),
        pos: [0, beltY + cabH * 0.36, cabEndZ + 0.16],
        rot: [isExotic ? 0.72 : 0.54, 0, 0],
      });
    }

    // Crisp painted Roof Cap + Bold Boxy A/B/C Pillars + Roof Scoops
    const roofPlate = makeChamferCube(cabW * 0.94, 0.09, cabLen * 0.92, 0.025, lowDetail);
    if (!lowDetail && (isExotic || isBossCar)) {
      carbonParts.push({ geo: roofPlate, pos: [0, roofY - 0.03, cabCenterZ] });
    } else {
      solidPaintParts.push({ geo: roofPlate, pos: [0, roofY - 0.03, cabCenterZ] });
    }

    if (!lowDetail) {
      const pX = cabW * 0.46;
      [-pX, pX].forEach((px) => {
        // Bold A-pillars (tucked flush into roof cap)
        carbonParts.push({
          geo: new THREE.BoxGeometry(0.062, cabH * 0.94, 0.075),
          pos: [px, beltY + cabH * 0.40, cabStartZ - 0.12],
          rot: [-0.52, 0, 0],
        });
        // Crisp window beltline & roof-edge surround molding strips
        carbonParts.push(
          { geo: new THREE.BoxGeometry(0.024, 0.03, cabLen * 0.90), pos: [px * 1.03, beltY + 0.02, cabCenterZ] },
          { geo: new THREE.BoxGeometry(0.024, 0.026, cabLen * 0.86), pos: [px * 1.01, roofY - 0.045, cabCenterZ] },
        );
        // Bold B-pillar door divider
        carbonParts.push({
          geo: new THREE.BoxGeometry(0.055, cabH * 0.94, 0.10),
          pos: [px * 1.02, beltY + cabH * 0.44, cabCenterZ + 0.05],
        });
        // Solid painted C-pillar buttress blocks
        solidPaintParts.push({
          geo: makeChamferCube(0.09, cabH * 0.96, isHatch ? 0.24 : 0.32, 0.02, false),
          pos: [px * 0.98, beltY + cabH * 0.42, cabEndZ + (isHatch ? -0.05 : 0.14)],
          rot: [isHatch ? 0.18 : 0.54, 0, 0],
        });
      });

      // Roof scoop for Exotic / Boss GT, or Rally vortex fin row for Sedan
      if (isExotic || isBossCar) {
        carbonParts.push({
          geo: makeChamferCube(0.42, 0.11, 0.58, 0.02, false),
          pos: [0, roofY + 0.04, cabCenterZ - 0.08],
        });
      } else if (isSedan && !isPolice) {
        [-0.45, -0.22, 0, 0.22, 0.45].forEach((vx) => {
          carbonParts.push({
            geo: new THREE.BoxGeometry(0.04, 0.06, 0.12),
            pos: [vx, roofY + 0.02, cabEndZ - 0.14],
          });
        });
      }

      // Sculpted Aero Wing Mirrors on Dual-Tone Stalks + Wiper Blades + Shark-Fin Antenna
      [-1, 1].forEach((s) => {
        carbonParts.push({
          geo: new THREE.BoxGeometry(0.11, 0.036, 0.055),
          pos: [s * bw * 0.44, beltY + 0.03, cabStartZ + 0.06],
          rot: [0, 0, s * 0.25],
        });
        solidPaintParts.push({
          geo: makeChamferCube(0.16, 0.08, 0.12, 0.02, false),
          pos: [s * bw * 0.505, beltY + 0.065, cabStartZ + 0.05],
          rot: [0, s * -0.14, 0],
        });
      });

      // Twin windshield wiper blades & roof shark-fin antenna
      carbonParts.push(
        { geo: new THREE.BoxGeometry(cabW * 0.34, 0.022, 0.025), pos: [-cabW * 0.18, beltY + 0.02, cabStartZ - 0.22], rot: [0, 0.12, 0] },
        { geo: new THREE.BoxGeometry(cabW * 0.34, 0.022, 0.025), pos: [cabW * 0.16, beltY + 0.02, cabStartZ - 0.22], rot: [0, 0.12, 0] },
        { geo: makeChamferCube(0.035, 0.075, 0.16, 0.008, false), pos: [0, roofY + 0.025, cabEndZ - 0.16], rot: [-0.22, 0, 0] },
      );

      // Visible Interior Cockpit Silhouette (Dashboard binnacle, Steering Wheel, Twin Bucket Seats + Rollcage)
      carbonParts.push(
        { geo: new THREE.BoxGeometry(cabW * 0.78, 0.14, 0.26), pos: [0, beltY + 0.06, cabStartZ + 0.06] },
        { geo: makeChamferCube(0.28, 0.34, 0.12, 0.02, false), pos: [-cabW * 0.22, beltY + cabH * 0.32, cabCenterZ + 0.14], rot: [0.14, 0, 0] },
        { geo: makeChamferCube(0.28, 0.34, 0.12, 0.02, false), pos: [cabW * 0.22, beltY + cabH * 0.32, cabCenterZ + 0.14], rot: [0.14, 0, 0] },
      );
      const wheelRing = new THREE.TorusGeometry(0.115, 0.018, 6, 12);
      carbonParts.push({ geo: wheelRing, pos: [-cabW * 0.22, beltY + cabH * 0.28, cabStartZ + 0.20], rot: [0.35, 0, 0] });

      if (isGtr || isBossCar || upgradeStage.hasFullApexPack) {
        accentParts.push(
          { geo: new THREE.BoxGeometry(cabW * 0.72, 0.045, 0.045), pos: [0, beltY + cabH * 0.64, cabEndZ - 0.08] },
          { geo: new THREE.BoxGeometry(0.04, cabH * 0.72, 0.04), pos: [-cabW * 0.28, beltY + cabH * 0.36, cabEndZ - 0.08], rot: [0.3, 0, 0.35] },
          { geo: new THREE.BoxGeometry(0.04, cabH * 0.72, 0.04), pos: [cabW * 0.28, beltY + cabH * 0.36, cabEndZ - 0.08], rot: [0.3, 0, -0.35] },
        );
      }

      // Stage 4/5 Nitrous Oxide Hardware: Twin Anodized-Cyan NOS Cylinders + Front-Fender Purge Nozzles
      if (upgradeStage.hasTwinNos && !isPolice) {
        const bottleGeo = track(new THREE.CylinderGeometry(0.068, 0.068, 0.36, 10));
        bottleGeo.rotateX(Math.PI * 0.38);
        const capGeo = track(new THREE.CylinderGeometry(0.032, 0.055, 0.07, 8));
        capGeo.rotateX(Math.PI * 0.38);
        [-cabW * 0.18, cabW * 0.18].forEach((bx) => {
          const bottle = new THREE.Mesh(bottleGeo, nosBottleMat);
          bottle.position.set(bx, beltY + cabH * 0.22, cabEndZ - 0.10);
          const cap = new THREE.Mesh(capGeo, chromeMat);
          cap.position.set(bx, beltY + cabH * 0.31, cabEndZ - 0.21);
          bodyGroup.add(bottle, cap);
        });
        if (upgradeStage.nosLvl >= 5) {
          const purgeGeo = track(new THREE.CylinderGeometry(0.018, 0.022, 0.08, 8));
          [-bw * 0.40, bw * 0.40].forEach((px) => {
            const nozzle = new THREE.Mesh(purgeGeo, nosBottleMat);
            nozzle.position.set(px, beltY + 0.035, cabStartZ - 0.20);
            nozzle.rotation.z = px < 0 ? 0.35 : -0.35;
            nozzle.rotation.x = -0.25;
            bodyGroup.add(nozzle);
          });
        }
      }
    }

    // 4. Style-Specific Hood, Intakes, Intercooler & Engine Details (Hinged detachable hoodGroup on non-police hero/rivals)
    const hoodY = clearance + noseH;
    if (!lowDetail && !isPolice) {
      const hGroup = new THREE.Group();
      hoodGroup = hGroup;
      const hoodPivotZ = -hl * 0.24;
      hGroup.position.set(0, hoodY, hoodPivotZ);
      bodyGroup.add(hGroup);

      const hoodLidW = bw * (isExotic ? 0.84 : 0.88);
      const hoodLidLen = Math.max(0.55, noseLen * 0.86);
      const hoodLidCenterRelZ = -hl * 0.54 - hoodPivotZ;
      const hoodLidMat = isBossCar || isExotic ? carbonMat : solidPaintMat;
      const hoodLidMesh = new THREE.Mesh(
        track(makeChamferCube(hoodLidW, 0.045, hoodLidLen, 0.014, false)),
        hoodLidMat,
      );
      hoodLidMesh.position.set(0, 0.015, hoodLidCenterRelZ);
      hoodLidMesh.castShadow = true;
      hoodGroup.add(hoodLidMesh);

      if (isMuscle) {
        const blower = new THREE.Mesh(
          track(makeChamferCube(bw * 0.34, 0.15, length * 0.24, 0.025, false)),
          carbonMat,
        );
        blower.position.set(0, 0.07, -hl * 0.44 - hoodPivotZ);
        hoodGroup.add(blower);

        const pipeGeo = track(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8));
        pipeGeo.rotateX(Math.PI / 2);
        [-0.11, 0.11].forEach((px) => {
          const pipe = new THREE.Mesh(pipeGeo, chromeMat);
          pipe.position.set(px, 0.12, -hl * 0.56 - hoodPivotZ);
          hGroup.add(pipe);
        });
        // Matte Black Rear Window Louver Slats
        for (let lv = 0; lv < 4; lv++) {
          carbonParts.push({
            geo: new THREE.BoxGeometry(cabW * 0.80, 0.03, 0.11),
            pos: [0, beltY + cabH * (0.72 - lv * 0.16), cabEndZ + 0.05 + lv * 0.13],
            rot: [0.22, 0, 0],
          });
        }
      } else if (isExotic) {
        // Massive Boxed Side Air-Intake Pods + Mid-Engine V10 Plenum Showcase
        [-bw * 0.49, bw * 0.49].forEach((sx) => {
          carbonParts.push(
            { geo: makeChamferCube(0.16, lowerH * 0.54, 0.72, 0.02, false), pos: [sx, clearance + lowerH * 0.48, 0.22] },
            { geo: new THREE.BoxGeometry(0.18, 0.03, 0.58), pos: [sx * 1.02, clearance + lowerH * 0.48, 0.22] },
          );
        });
        chromeParts.push(
          { geo: new THREE.BoxGeometry(0.22, 0.08, 0.62), pos: [-0.22, clearance + tailH + 0.01, hl * 0.56] },
          { geo: new THREE.BoxGeometry(0.22, 0.08, 0.62), pos: [0.22, clearance + tailH + 0.01, hl * 0.56] },
        );
        [-0.08, 0.16, 0.40].forEach((lz) => {
          carbonParts.push({
            geo: new THREE.BoxGeometry(cabW * 0.78, 0.03, 0.10),
            pos: [0, clearance + tailH + 0.05, hl * 0.46 + lz * 0.55],
            rot: [-0.18, 0, 0],
          });
        });
      } else if (isSedan) {
        const scoop = new THREE.Mesh(
          track(makeChamferCube(bw * 0.32, 0.11, 0.46, 0.02, false)),
          solidPaintMat,
        );
        scoop.position.set(0, 0.05, -hl * 0.50 - hoodPivotZ);
        const vent = new THREE.Mesh(track(new THREE.BoxGeometry(bw * 0.26, 0.07, 0.06)), carbonMat);
        vent.position.set(0, 0.05, -hl * 0.72 - hoodPivotZ);
        hoodGroup.add(scoop, vent);
      } else {
        const extractorGeo = track(new THREE.BoxGeometry(0.26, 0.04, 0.46));
        [-bw * 0.18, bw * 0.18].forEach((ex) => {
          const ext = new THREE.Mesh(extractorGeo, carbonMat);
          ext.position.set(ex, 0.032, -hl * 0.52 - hoodPivotZ);
          hGroup.add(ext);
        });
      }
      // Sculpted center power-bulge spine & twin hood aero creases
      const spineMesh = new THREE.Mesh(
        track(makeChamferCube(bw * 0.18, 0.032, hoodLidLen * 0.78, 0.01, false)),
        isBossCar || isExotic || upgradeStage.hasHighPower ? carbonMat : solidPaintMat,
      );
      spineMesh.position.set(0, 0.038, hoodLidCenterRelZ);
      hGroup.add(spineMesh);

      // Stage 4/5 High-Power Exposed Twin-Turbo Velocity Stacks & Carbon Heat Extractors
      if (upgradeStage.hasHighPower) {
        const intakeRingGeo = track(new THREE.CylinderGeometry(0.072, 0.054, 0.095, 10));
        const stackBaseGeo = track(makeChamferCube(bw * 0.32, 0.06, hoodLidLen * 0.36, 0.01, false));
        const plenum = new THREE.Mesh(stackBaseGeo, caliperMat);
        plenum.position.set(0, 0.068, hoodLidCenterRelZ + 0.04);
        hGroup.add(plenum);
        [-bw * 0.14, bw * 0.14].forEach((tx) => {
          const stack = new THREE.Mesh(intakeRingGeo, titaniumMat);
          stack.position.set(tx, 0.098, hoodLidCenterRelZ - 0.08);
          stack.rotation.x = -0.18;
          hGroup.add(stack);
        });
      }
    }

    // 5. Front Chin Splitter, Recessed FMIC Intercooler, Side Skirts & Multi-Fin Rear Diffuser
    const splitterExtend = isBossCar || upgradeStage.isMaxed ? 0.44 : upgradeStage.hasProAero ? 0.36 : 0.30;
    carbonParts.push(
      { geo: makeChamferCube(bw * (isBossCar || upgradeStage.isMaxed ? 1.05 : 1.00), 0.08, midLen * 1.02, 0.015, lowDetail), pos: [0, clearance + 0.03, midCenterZ] },
    );

    if (!lowDetail && !isPolice) {
      frontBumperGroup = new THREE.Group();
      const fbPivotZ = -hl + 0.14;
      frontBumperGroup.position.set(0, clearance + 0.12, fbPivotZ);
      frontBumperGroup.userData.baseZ = fbPivotZ;
      bodyGroup.add(frontBumperGroup);

      const frontLip = new THREE.Mesh(
        track(makeChamferCube(bw * (isBossCar || upgradeStage.isMaxed ? 1.06 : 0.99), 0.06, splitterExtend, 0.015, false)),
        carbonMat,
      );
      frontLip.position.set(0, -0.10, -hl - 0.01 - fbPivotZ);

      const frontGrill = new THREE.Mesh(
        track(new THREE.BoxGeometry(bw * 0.58, lowerH * 0.36, 0.10)),
        carbonMat,
      );
      frontGrill.position.set(0, lowerH * 0.28 - 0.12, -hl + 0.02 - fbPivotZ);

      const grillBezel = new THREE.Mesh(
        track(new THREE.BoxGeometry(bw * 0.61, 0.024, 0.06)),
        upgradeStage.isMaxed ? caliperMat : chromeMat,
      );
      grillBezel.position.set(0, lowerH * 0.45 - 0.12, -hl - 0.01 - fbPivotZ);

      const intercooler = new THREE.Mesh(
        track(new THREE.BoxGeometry(bw * 0.48, lowerH * 0.25, 0.08)),
        chromeMat,
      );
      intercooler.position.set(0, lowerH * 0.26 - 0.12, -hl + 0.005 - fbPivotZ);

      if (upgradeStage.hasHighPower) {
        const pipeElbowGeo = track(new THREE.CylinderGeometry(0.028, 0.028, 0.16, 8));
        pipeElbowGeo.rotateZ(Math.PI * 0.35);
        [-bw * 0.26, bw * 0.26].forEach((px) => {
          const pipe = new THREE.Mesh(pipeElbowGeo, titaniumMat);
          pipe.position.set(px, lowerH * 0.26 - 0.12, -hl - 0.012 - fbPivotZ);
          pipe.rotation.z = px < 0 ? 0.9 : -0.9;
          frontBumperGroup!.add(pipe);
        });
      }

      // Machined steel chin-splitter tie-rods flanking intercooler
      const tieRodGeo = track(new THREE.CylinderGeometry(0.012, 0.012, 0.17, 6));
      [-bw * 0.21, bw * 0.21].forEach((tx) => {
        const rod = new THREE.Mesh(tieRodGeo, chromeMat);
        rod.position.set(tx, -0.025, -hl - 0.06 - fbPivotZ);
        rod.rotation.x = 0.28;
        frontBumperGroup!.add(rod);
      });

      // Grille horizontal honeycomb louvres + twin side brake cooling ducts + fog pods
      const barGeo = track(new THREE.BoxGeometry(bw * 0.56, 0.016, 0.03));
      [-0.045, 0, 0.045].forEach((by) => {
        const bar = new THREE.Mesh(barGeo, carbonMat);
        bar.position.set(0, lowerH * 0.27 - 0.12 + by, -hl - 0.03 - fbPivotZ);
        frontBumperGroup!.add(bar);
      });
      const sideDuctGeo = track(new THREE.BoxGeometry(bw * 0.16, lowerH * 0.24, 0.09));
      const fogPodGeo = track(new THREE.BoxGeometry(0.09, 0.04, 0.06));
      [-bw * 0.37, bw * 0.37].forEach((dx) => {
        const duct = new THREE.Mesh(sideDuctGeo, carbonMat);
        duct.position.set(dx, lowerH * 0.25 - 0.12, -hl + 0.01 - fbPivotZ);
        const fog = new THREE.Mesh(fogPodGeo, headlightMat);
        fog.position.set(dx, lowerH * 0.25 - 0.12, -hl - 0.02 - fbPivotZ);
        frontBumperGroup!.add(duct, fog);
      });

      const towHook = new THREE.Mesh(track(new THREE.BoxGeometry(0.08, 0.03, 0.12)), caliperMat);
      towHook.position.set(bw * 0.24, -0.04, -hl - 0.10 - fbPivotZ);

      frontBumperGroup.add(frontLip, frontGrill, grillBezel, intercooler, towHook);

      if (isBossCar || upgradeStage.hasProAero) {
        const canardGeo = track(new THREE.BoxGeometry(0.16, 0.03, 0.26));
        [-bw * 0.51, bw * 0.51].forEach((cx) => {
          const s = cx < 0 ? -1 : 1;
          const canard = new THREE.Mesh(canardGeo, carbonMat);
          canard.position.set(cx, 0.05, -hl + 0.22 - fbPivotZ);
          canard.rotation.set(0.14, s * 0.22, s * -0.10);
          frontBumperGroup!.add(canard);

          if (upgradeStage.hasFullApexPack) {
            const upperCanard = new THREE.Mesh(canardGeo, carbonMat);
            upperCanard.scale.set(0.85, 0.9, 0.85);
            upperCanard.position.set(cx, 0.15, -hl + 0.26 - fbPivotZ);
            upperCanard.rotation.set(0.18, s * 0.26, s * -0.12);
            frontBumperGroup!.add(upperCanard);
          }
        });
      }

      // Hinged Detachable Rear Bumper & Diffuser Assembly + Central F1 Rain Light
      rearBumperGroup = new THREE.Group();
      const rbPivotZ = hl - 0.12;
      rearBumperGroup.position.set(0, clearance + 0.12, rbPivotZ);
      bodyGroup.add(rearBumperGroup);

      const rearValance = new THREE.Mesh(
        track(makeChamferCube(bw * 0.92, 0.18, 0.24, 0.02, false)),
        carbonMat,
      );
      rearValance.position.set(0, -0.04, hl - 0.03 - rbPivotZ);
      rearBumperGroup.add(rearValance);

      const finGeo = track(new THREE.BoxGeometry(0.038, 0.18, 0.28));
      [-0.36, -0.13, 0.13, 0.36].forEach((dx) => {
        const fin = new THREE.Mesh(finGeo, carbonMat);
        fin.position.set(dx, -0.03, hl + 0.01 - rbPivotZ);
        rearBumperGroup!.add(fin);
      });
      if (upgradeStage.hasFullApexPack) {
        const spatGeo = track(makeChamferCube(0.12, 0.06, 0.34, 0.01, false));
        [-bw * 0.49, bw * 0.49].forEach((sx) => {
          const spat = new THREE.Mesh(spatGeo, carbonMat);
          spat.position.set(sx, -0.06, hl - 0.05 - rbPivotZ);
          rearBumperGroup!.add(spat);
        });
      }
      const rainLight = new THREE.Mesh(track(new THREE.BoxGeometry(0.11, 0.055, 0.04)), brakeLightMat);
      rainLight.position.set(0, -0.04, hl + 0.09 - rbPivotZ);
      rearBumperGroup.add(rainLight);
    } else {
      carbonParts.push(
        { geo: makeChamferCube(bw * (isBossCar ? 1.06 : 0.99), 0.06, splitterExtend, 0.015, lowDetail), pos: [0, clearance + 0.02, -hl - 0.01] },
        { geo: makeChamferCube(bw * 0.92, 0.18, 0.24, 0.02, lowDetail), pos: [0, clearance + 0.08, hl - 0.03] },
        { geo: new THREE.BoxGeometry(bw * 0.56, lowerH * 0.34, 0.10), pos: [0, clearance + lowerH * 0.28, -hl + 0.02] },
      );
    }

    // 6. Recessed Projector Headlight Housings + Sharp LED DRLs & Signature Multi-Element Taillights
    const headY = clearance + noseH * 0.58;
    const tailLampY = clearance + tailH * 0.68;

    carbonParts.push(
      { geo: new THREE.BoxGeometry(0.42, 0.14, 0.09), pos: [-bw * 0.32, headY, -hl + 0.02] },
      { geo: new THREE.BoxGeometry(0.42, 0.14, 0.09), pos: [bw * 0.32, headY, -hl + 0.02] },
      { geo: new THREE.BoxGeometry(bw * 0.88, 0.16, 0.08), pos: [0, tailLampY, hl - 0.01] },
    );

    if (!lowDetail) {
      [-bw * 0.32, bw * 0.32].forEach((hx) => {
        const s = hx < 0 ? -1 : 1;
        // Twin circular xenon/LED projector barrels inside housing + dual chrome halos + sharp L-shaped LED DRL strip + amber corner lens
        const projGeo = new THREE.CylinderGeometry(0.034, 0.038, 0.05, 10);
        projGeo.rotateX(Math.PI / 2);
        headlightParts.push(
          { geo: projGeo, pos: [hx - s * 0.075, headY + 0.01, -hl - 0.012] },
          { geo: projGeo.clone(), pos: [hx + s * 0.075, headY + 0.01, -hl - 0.012] },
          { geo: new THREE.BoxGeometry(0.36, 0.022, 0.06), pos: [hx, headY - 0.044, -hl - 0.015] },
          { geo: new THREE.BoxGeometry(0.28, 0.014, 0.055), pos: [hx - s * 0.03, headY + 0.05, -hl - 0.014] },
        );
        chromeParts.push(
          { geo: new THREE.TorusGeometry(0.042, 0.008, 6, 10), pos: [hx - s * 0.075, headY + 0.01, -hl - 0.01] },
          { geo: new THREE.TorusGeometry(0.042, 0.008, 6, 10), pos: [hx + s * 0.075, headY + 0.01, -hl - 0.01] },
        );
        accentParts.push(
          { geo: new THREE.BoxGeometry(0.045, 0.055, 0.055), pos: [hx + s * 0.165, headY + 0.005, -hl - 0.005] },
        );
      });
    } else {
      headlightParts.push(
        { geo: new THREE.BoxGeometry(0.32, 0.08, 0.08), pos: [-bw * 0.32, headY, -hl - 0.01] },
        { geo: new THREE.BoxGeometry(0.32, 0.08, 0.08), pos: [bw * 0.32, headY, -hl - 0.01] },
      );
    }

    // Extra Quad Rally Fog Lamps on Sedan
    if (isSedan && !isPolice && !lowDetail) {
      headlightParts.push(
        { geo: new THREE.BoxGeometry(0.14, 0.10, 0.08), pos: [-bw * 0.18, clearance + 0.20, -hl - 0.02] },
        { geo: new THREE.BoxGeometry(0.14, 0.10, 0.08), pos: [bw * 0.18, clearance + 0.20, -hl - 0.02] },
      );
    }

    if (isGtr && !lowDetail) {
      [-bw * 0.36, -bw * 0.22, bw * 0.22, bw * 0.36].forEach((tx) => {
        const ringG = new THREE.TorusGeometry(0.048, 0.016, 6, 12);
        taillightParts.push({ geo: ringG, pos: [tx, tailLampY, hl + 0.015] });
      });
    } else {
      taillightParts.push(
        { geo: new THREE.BoxGeometry(0.38, 0.058, 0.07), pos: [-bw * 0.30, tailLampY + 0.018, hl + 0.01] },
        { geo: new THREE.BoxGeometry(0.38, 0.058, 0.07), pos: [bw * 0.30, tailLampY + 0.018, hl + 0.01] },
      );
      if (!lowDetail) {
        // Connected full-width LED signature blade + upper deck 3rd brake light strip
        taillightParts.push(
          { geo: new THREE.BoxGeometry(bw * 0.84, 0.02, 0.06), pos: [0, tailLampY - 0.042, hl + 0.012] },
          { geo: new THREE.BoxGeometry(bw * 0.26, 0.022, 0.05), pos: [0, clearance + tailH + 0.015, hl - 0.18] },
        );
      }
    }

    reverseParts.push(
      { geo: new THREE.BoxGeometry(0.13, 0.055, 0.06), pos: [-bw * 0.14, tailLampY - 0.01, hl + 0.01] },
      { geo: new THREE.BoxGeometry(0.13, 0.055, 0.06), pos: [bw * 0.14, tailLampY - 0.01, hl + 0.01] },
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
      const plate = new THREE.Mesh(track(new THREE.BoxGeometry(0.36, 0.11, 0.03)), plateMat);
      if (rearBumperGroup) {
        plate.position.set(0, clearance + tailH * 0.34 - (clearance + 0.12), hl + 0.01 - (hl - 0.12));
        rearBumperGroup.add(plate);
      } else {
        plate.position.set(0, clearance + tailH * 0.34, hl + 0.01);
        bodyGroup.add(plate);
      }
    }

    // 7. Distinct Class Spoilers & Wings inside Hinged Detachable spoilerGroup
    if (!isPolice && !lowDetail) {
      const deckY = clearance + tailH;
      const wingPivotZ = isHatch ? cabEndZ + 0.08 : hl - 0.16;
      const wingPivotY = isHatch ? roofY : deckY;
      spoilerGroup = new THREE.Group();
      spoilerGroup.position.set(0, wingPivotY, wingPivotZ);
      bodyGroup.add(spoilerGroup);

      if (isBossCar || upgradeStage.hasProAero) {
        const wingH = upgradeStage.hasFullApexPack ? 0.35 : 0.32;
        const mainWing = new THREE.Mesh(
          track(makeChamferCube(bw * 1.05, 0.045, 0.32, 0.01, false)),
          carbonMat,
        );
        mainWing.position.set(0, wingH, -0.01);
        mainWing.rotation.x = 0.10;
        const upperFlap = new THREE.Mesh(
          track(makeChamferCube(bw * 0.98, 0.035, 0.18, 0.01, false)),
          carbonMat,
        );
        upperFlap.position.set(0, wingH + 0.08, 0.04);
        upperFlap.rotation.x = 0.16;
        const strutGeo = track(new THREE.BoxGeometry(0.04, wingH + 0.06, 0.18));
        const endplateGeo = track(makeChamferCube(0.042, 0.25, 0.42, 0.01, false));
        const trimGeo = upgradeStage.isMaxed
          ? track(new THREE.BoxGeometry(0.048, 0.038, 0.38))
          : null;
        [-1, 1].forEach((s) => {
          const st = new THREE.Mesh(strutGeo, carbonMat);
          st.position.set(s * bw * 0.24, wingH * 0.5, -0.04);
          const ep = new THREE.Mesh(endplateGeo, solidPaintMat);
          ep.position.set(s * bw * 0.525, wingH + 0.025, 0);
          spoilerGroup!.add(st, ep);
          if (trimGeo) {
            const goldTrim = new THREE.Mesh(trimGeo, caliperMat);
            goldTrim.position.set(s * bw * 0.528, wingH + 0.125, 0);
            spoilerGroup!.add(goldTrim);
          }
        });
        if (upgradeStage.isMaxed) {
          const gurneyLip = new THREE.Mesh(
            track(new THREE.BoxGeometry(bw * 0.98, 0.025, 0.045)),
            caliperMat,
          );
          gurneyLip.position.set(0, wingH + 0.108, 0.12);
          spoilerGroup.add(gurneyLip);
        }
        spoilerGroup.add(mainWing, upperFlap);
      } else if (isMuscle) {
        const duck = new THREE.Mesh(
          track(makeChamferCube(bw * 0.90, 0.12, 0.20, 0.02, false)),
          solidPaintMat,
        );
        duck.position.set(0, 0.05, 0.03);
        duck.rotation.x = -0.36;
        spoilerGroup.add(duck);
      } else if (isHatch) {
        const roofWing = new THREE.Mesh(
          track(makeChamferCube(cabW * 0.98, 0.07, 0.28, 0.015, false)),
          solidPaintMat,
        );
        roofWing.position.set(0, 0.04, 0);
        roofWing.rotation.x = 0.12;
        const sideGeo = track(new THREE.BoxGeometry(0.04, 0.12, 0.26));
        [-1, 1].forEach((s) => {
          const st = new THREE.Mesh(sideGeo, solidPaintMat);
          st.position.set(s * cabW * 0.48, 0.02, 0);
          spoilerGroup!.add(st);
        });
        spoilerGroup.add(roofWing);
      } else {
        const wingH = isGtr || isSedan ? 0.28 : 0.22;
        const blade = new THREE.Mesh(
          track(makeChamferCube(bw * 0.94, 0.045, 0.28, 0.01, false)),
          carbonMat,
        );
        blade.position.set(0, wingH, 0);
        blade.rotation.x = 0.09;
        const strutGeo = track(new THREE.BoxGeometry(0.042, wingH, 0.15));
        const endGeo = track(new THREE.BoxGeometry(0.04, 0.18, 0.34));
        [-1, 1].forEach((s) => {
          const st = new THREE.Mesh(strutGeo, carbonMat);
          st.position.set(s * bw * 0.24, wingH * 0.5, -0.02);
          const ep = new THREE.Mesh(endGeo, solidPaintMat);
          ep.position.set(s * bw * 0.47, wingH, 0);
          spoilerGroup!.add(st, ep);
        });
        spoilerGroup.add(blade);
      }
    }
  }

  // 8. Twin / Quad Polished Chrome or Burnt-Titanium Exhaust Cannons with Dark Soot Bore
  const useQuadExhaust =
    !lowDetail && (style === 'gtr' || style === 'exotic' || isBossCar || upgradeStage.hasHighPower);
  const exhaustOffsets = useQuadExhaust ? [-0.56, -0.44, 0.44, 0.56] : [-0.38, 0.38];
  const exCenterZ = lowDetail ? hl - 0.05 : hl + 0.03;
  const exLen = lowDetail ? 0.15 : 0.18;
  exhaustOffsets.forEach((ex) => {
    const exGeo = new THREE.CylinderGeometry(0.046, 0.046, exLen, lowDetail ? 8 : 10);
    exGeo.rotateX(Math.PI / 2);
    chromeParts.push({ geo: exGeo, pos: [ex, clearance + 0.09, exCenterZ] });
    if (!lowDetail && upgradeStage.hasHighPower) {
      const tipCollarGeo = track(new THREE.CylinderGeometry(0.052, 0.052, 0.05, 10));
      tipCollarGeo.rotateX(Math.PI / 2);
      const tipCollar = new THREE.Mesh(tipCollarGeo, titaniumMat);
      tipCollar.position.set(ex, clearance + 0.09, hl + 0.105);
      bodyGroup.add(tipCollar);
    }
    if (!lowDetail) {
      const boreGeo = new THREE.CylinderGeometry(0.034, 0.034, 0.025, 8);
      boreGeo.rotateX(Math.PI / 2);
      carbonParts.push({ geo: boreGeo, pos: [ex, clearance + 0.09, hl + 0.12] });
    }
  });
  if (style === 'muscle' && !lowDetail && !isPolice && !isRhino) {
    [-width * 0.50, width * 0.50].forEach((sx) => {
      const sideEx = new THREE.CylinderGeometry(0.045, 0.045, 0.45, 8);
      sideEx.rotateX(Math.PI / 2);
      chromeParts.push({ geo: sideEx, pos: [sx, clearance + 0.07, 0.32] });
    });
  }

  // Police Bullbar & Detailed Lightbar
  let lightbarRed: THREE.MeshStandardMaterial | undefined;
  let lightbarBlue: THREE.MeshStandardMaterial | undefined;
  let lightbarHaloRed: THREE.Mesh | undefined;
  let lightbarHaloBlue: THREE.Mesh | undefined;
  if (isPolice || isRhino) {
    carbonParts.push(
      {
        geo: new THREE.BoxGeometry(width * (isRhino ? 0.86 : 0.70), isRhino ? 0.34 : 0.22, 0.15),
        pos: [0, clearance + (isRhino ? 0.30 : 0.20), -hl - 0.04],
      },
      // Vertical pushbar uprights
      { geo: new THREE.BoxGeometry(0.07, 0.34, 0.16), pos: [-width * 0.20, clearance + 0.24, -hl - 0.04] },
      { geo: new THREE.BoxGeometry(0.07, 0.34, 0.16), pos: [width * 0.20, clearance + 0.24, -hl - 0.04] },
      { geo: new THREE.BoxGeometry(width * 0.60, 0.07, 0.22), pos: [0, roofY + 0.045, 0.05] },
    );

    lightbarRed = track(
      new THREE.MeshStandardMaterial({
        color: '#EF4444',
        emissive: new THREE.Color('#EF4444'),
        emissiveIntensity: 4.2,
      }),
    );
    lightbarBlue = track(
      new THREE.MeshStandardMaterial({
        color: '#3B82F6',
        emissive: new THREE.Color('#3B82F6'),
        emissiveIntensity: 4.2,
      }),
    );

    const podGeo = track(new THREE.BoxGeometry(width * 0.25, 0.09, 0.19));
    const podL = new THREE.Mesh(podGeo, lightbarRed);
    podL.position.set(-width * 0.16, roofY + 0.095, 0.05);
    const podR = new THREE.Mesh(podGeo, lightbarBlue);
    podR.position.set(width * 0.16, roofY + 0.095, 0.05);
    const centerLed = new THREE.Mesh(track(new THREE.BoxGeometry(width * 0.09, 0.075, 0.18)), headlightMat);
    centerLed.position.set(0, roofY + 0.095, 0.05);
    bodyGroup.add(podL, podR, centerLed);

    const haloGeo = track(new THREE.PlaneGeometry(1.75, 1.35));
    const redGlowTex = getSharedLightGlowTexture('rgba(239, 68, 68, 0.92)');
    const blueGlowTex = getSharedLightGlowTexture('rgba(59, 130, 246, 0.92)');
    const redHaloMat = track(
      new THREE.MeshBasicMaterial({
        map: redGlowTex,
        transparent: true,
        opacity: 0.78,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    const blueHaloMat = track(
      new THREE.MeshBasicMaterial({
        map: blueGlowTex,
        transparent: true,
        opacity: 0.78,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    lightbarHaloRed = new THREE.Mesh(haloGeo, redHaloMat);
    lightbarHaloRed.position.set(-width * 0.18, roofY + 0.16, 0.05);
    lightbarHaloBlue = new THREE.Mesh(haloGeo, blueHaloMat);
    lightbarHaloBlue.position.set(width * 0.18, roofY + 0.16, 0.05);
    bodyGroup.add(lightbarHaloRed, lightbarHaloBlue);
  }

  // Merge all static material groups for ultra-fast GPU rendering
  if (paintParts.length > 0) {
    const mergedPaint = track(bakeAndMerge(paintParts));
    applyPlanarCarUVs(mergedPaint, width, length);
    const bodyMesh = new THREE.Mesh(mergedPaint, paintMat);
    bodyMesh.castShadow = !lowDetail;
    bodyMesh.receiveShadow = true;
    bodyGroup.add(bodyMesh);
  }
  if (solidPaintParts.length > 0) {
    const m = new THREE.Mesh(track(bakeAndMerge(solidPaintParts)), solidPaintMat);
    m.castShadow = !lowDetail;
    bodyGroup.add(m);
  }
  if (carbonParts.length > 0) {
    const m = new THREE.Mesh(track(bakeAndMerge(carbonParts)), carbonMat);
    m.castShadow = !lowDetail;
    bodyGroup.add(m);
  }
  if (glassParts.length > 0) {
    bodyGroup.add(new THREE.Mesh(track(bakeAndMerge(glassParts)), glassMat));
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
  if (chromeParts.length > 0) {
    bodyGroup.add(new THREE.Mesh(track(bakeAndMerge(chromeParts)), chromeMat));
  }
  if (accentParts.length > 0) {
    bodyGroup.add(new THREE.Mesh(track(bakeAndMerge(accentParts)), caliperMat));
  }

  // Dynamic Multi-Layered NOS Plasma Flames, Cores, Exhaust Halos & Backfire Cones
  const nosFlames: THREE.Mesh[] = [];
  const nosCores: THREE.Mesh[] = [];
  const nosHalos: THREE.Mesh[] = [];
  const backfireFlames: THREE.Mesh[] = [];
  const brakeGlows: THREE.Mesh[] = [];
  if (!lowDetail) {
    const flameGeo = track(new THREE.ConeGeometry(0.145, 1.85, 10));
    flameGeo.rotateX(Math.PI / 2);
    flameGeo.translate(0, 0, 0.86);
    const flameMat = track(
      new THREE.MeshBasicMaterial({
        color: '#0EA5E9',
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );

    const coreGeo = track(new THREE.ConeGeometry(0.075, 1.15, 8));
    coreGeo.rotateX(Math.PI / 2);
    coreGeo.translate(0, 0, 0.54);
    const coreMat = track(
      new THREE.MeshBasicMaterial({
        color: '#E0F2FE',
        transparent: true,
        opacity: 0.98,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );

    const nosHaloTex = getSharedLightGlowTexture('rgba(56, 189, 248, 0.92)');
    const nosHaloGeo = track(new THREE.PlaneGeometry(1.15, 0.9));
    const nosHaloMat = track(
      new THREE.MeshBasicMaterial({
        map: nosHaloTex,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
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

    const flameScaleBoost = upgradeStage.hasTwinNos ? 1.18 : 1.0;
    const flameOffsets = useQuadExhaust ? [-0.56, -0.44, 0.44, 0.56] : [-0.38, 0.38];
    flameOffsets.forEach((ex) => {
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(ex, clearance + 0.09, hl + 0.125);
      flame.scale.setScalar(flameScaleBoost);
      flame.visible = false;
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.position.set(ex, clearance + 0.09, hl + 0.125);
      core.scale.setScalar(flameScaleBoost);
      core.visible = false;
      const halo = new THREE.Mesh(nosHaloGeo, nosHaloMat);
      halo.position.set(ex, clearance + 0.12, hl + 0.19);
      halo.visible = false;
      bodyGroup.add(flame, core, halo);
      nosFlames.push(flame);
      nosCores.push(core);
      nosHalos.push(halo);

      const bf = new THREE.Mesh(backfireGeo, backfireMat);
      bf.position.set(ex, clearance + 0.09, hl + 0.13);
      bf.visible = false;
      bodyGroup.add(bf);
      backfireFlames.push(bf);
    });

    const glowTex = getSharedLightGlowTexture('rgba(239, 68, 68, 0.85)');
    const glowGeo = track(new THREE.PlaneGeometry(0.92, 0.6));
    const glowMat = track(
      new THREE.MeshBasicMaterial({
        map: glowTex,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    const bgY = clearance + height * 0.42;
    [-width * 0.3, width * 0.3].forEach((bx) => {
      const bg = new THREE.Mesh(glowGeo, glowMat);
      bg.position.set(bx, bgY, hl + 0.08);
      bodyGroup.add(bg);
      brakeGlows.push(bg);
    });
  }

  // Four Independent Wheel Hubs (Suspension Travel -> Steer Yaw -> Camber Pivot -> Wheel Spinner)
  const wheelWidth = isRhino ? 0.34 : isBossCar || upgradeStage.hasFullApexPack ? 0.31 : 0.27;
  const trackHalfX =
    width * (isBossCar ? 0.48 : upgradeStage.hasProAero ? 0.475 : 0.45);
  const wheelFrontLeft = new THREE.Group();
  const wheelFrontRight = new THREE.Group();
  const wheelSpinners: THREE.Group[] = [];
  const wheelHubList: THREE.Group[] = [];
  const wheelCamberList: THREE.Group[] = [];

  const wheelDefs = [
    { x: -trackHalfX, z: frontAxleZ, isFront: true, isLeft: true },
    { x: trackHalfX, z: frontAxleZ, isFront: true, isLeft: false },
    { x: -trackHalfX, z: rearAxleZ, isFront: false, isLeft: true },
    { x: trackHalfX, z: rearAxleZ, isFront: false, isLeft: false },
  ];

  wheelDefs.forEach((wd) => {
    const built = buildWheelGroup(
      wheelRadius,
      wheelWidth,
      rimMat,
      tireMat,
      wd.isFront ? frontRotorMat : rearRotorMat,
      caliperMat,
      wd.isLeft,
      lowDetail,
      Boolean(isRhino),
      track,
      upgradeStage.tiresLvl >= 5,
    );
    const hub = new THREE.Group();
    hub.position.set(wd.x, wheelRadius, wd.z);
    built.pivot.position.set(0, 0, 0);
    if (wd.isFront && wd.isLeft) {
      wheelFrontLeft.add(built.pivot);
      hub.add(wheelFrontLeft);
    } else if (wd.isFront && !wd.isLeft) {
      wheelFrontRight.add(built.pivot);
      hub.add(wheelFrontRight);
    } else {
      hub.add(built.pivot);
    }
    root.add(hub);
    wheelHubList.push(hub);
    wheelCamberList.push(built.pivot);
    wheelSpinners.push(built.spinner);
  });

  const wheelHubs = wheelHubList as [THREE.Group, THREE.Group, THREE.Group, THREE.Group];
  const wheelCamberPivots = wheelCamberList as [THREE.Group, THREE.Group, THREE.Group, THREE.Group];

  return {
    root,
    bodyGroup,
    hoodGroup,
    frontBumperGroup,
    rearBumperGroup,
    spoilerGroup,
    paintHex,
    bodyMaterials: [paintMat, solidPaintMat],
    rimMaterials: [rimMat],
    brakeLightMat,
    reverseLightMat,
    rotorGlowMats: lowDetail ? [] : [frontRotorMat, rearRotorMat],
    brakeGlows,
    nosFlames,
    nosCores,
    nosHalos,
    backfireFlames,
    wheelFrontLeft,
    wheelFrontRight,
    wheelHubs,
    wheelCamberPivots,
    wheelBaseRadius: wheelRadius,
    wheelSpinners,
    lightbarRed,
    lightbarBlue,
    lightbarHaloRed,
    lightbarHaloBlue,
    isMaxStage: upgradeStage.isMaxed,
    upgradeStageAvg: upgradeStage.avgLevel,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

/**
 * Zero-allocation visual chassis deformation & detachable part visibility updater.
 */
export function applyCarVisualDamage(
  visual: CarVisualHandles,
  frontDmg: number,
  rearDmg: number,
  sideDmg: number,
  detachedHood: boolean,
  detachedFrontBumper: boolean,
  detachedRearBumper: boolean,
  detachedSpoiler: boolean,
): void {
  // Preserve crisp chassis silhouette under moderate race contact; only subtle compression after heavy wrecks (>60%)
  const totalDmg = frontDmg * 0.45 + rearDmg * 0.3 + sideDmg * 0.25;
  if (totalDmg > 0.62) {
    const heavy = (totalDmg - 0.62) / 0.38;
    const zComp = 1 - Math.min(0.028, heavy * 0.025);
    const xComp = 1 - Math.min(0.02, heavy * 0.018);
    visual.bodyGroup.scale.set(xComp, 1, zComp);
  } else {
    visual.bodyGroup.scale.set(1, 1, 1);
  }

  const fVis = Math.max(0, frontDmg - 0.18);
  const rVis = Math.max(0, rearDmg - 0.18);
  const sVis = Math.max(0, sideDmg - 0.24);

  if (visual.hoodGroup) {
    visual.hoodGroup.visible = !detachedHood;
    if (!detachedHood) {
      visual.hoodGroup.rotation.x = Math.min(0.11, fVis * 0.12);
      visual.hoodGroup.rotation.z = sVis * 0.015;
    }
  }
  if (visual.frontBumperGroup) {
    visual.frontBumperGroup.visible = !detachedFrontBumper;
    if (!detachedFrontBumper) {
      visual.frontBumperGroup.rotation.x = -Math.min(0.10, fVis * 0.11);
      visual.frontBumperGroup.rotation.z = sVis * 0.032;
      const baseZ = (visual.frontBumperGroup.userData.baseZ as number | undefined) ?? 0;
      visual.frontBumperGroup.position.z = baseZ + fVis * 0.04;
    }
  }
  if (visual.rearBumperGroup) {
    visual.rearBumperGroup.visible = !detachedRearBumper;
    if (!detachedRearBumper) {
      visual.rearBumperGroup.rotation.x = Math.min(0.10, rVis * 0.11);
      visual.rearBumperGroup.rotation.z = -sVis * 0.03;
    }
  }
  if (visual.spoilerGroup) {
    visual.spoilerGroup.visible = !detachedSpoiler;
    if (!detachedSpoiler) {
      visual.spoilerGroup.rotation.z = sVis * 0.045 + rVis * 0.025;
      visual.spoilerGroup.rotation.x = -Math.min(0.07, rVis * 0.07);
    }
  }
}
