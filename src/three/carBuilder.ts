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
  nosCores: THREE.Mesh[];
  nosHalos: THREE.Mesh[];
  backfireFlames: THREE.Mesh[];
  wheelFrontLeft: THREE.Group;
  wheelFrontRight: THREE.Group;
  wheelSpinners: THREE.Group[];
  lightbarRed?: THREE.MeshStandardMaterial;
  lightbarBlue?: THREE.MeshStandardMaterial;
  lightbarHaloRed?: THREE.Mesh;
  lightbarHaloBlue?: THREE.Mesh;
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

  // Outer barrel drum + lip ring
  const barrelGeo = new THREE.CylinderGeometry(rimR, rimR, width * 0.94, lowPoly ? 12 : 18, 1, true);
  barrelGeo.rotateZ(Math.PI / 2);
  rimParts.push({ geo: barrelGeo });

  const lipGeo = new THREE.TorusGeometry(rimR * 0.98, 0.022, 6, lowPoly ? 12 : 20);
  lipGeo.rotateY(Math.PI / 2);
  rimParts.push({ geo: lipGeo, pos: [xSign * (width * 0.47), 0, 0] });

  // Center lug hub
  const capGeo = new THREE.CylinderGeometry(rimR * 0.25, rimR * 0.28, width * 0.66, 8);
  capGeo.rotateZ(Math.PI / 2);
  rimParts.push({ geo: capGeo, pos: [xSign * (width * 0.1), 0, 0] });

  // Crisp blocky Y-spokes / 6-spoke offroad spokes
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
      [-0.15, 0.15].forEach((offsetAngle) => {
        const a = baseAngle + offsetAngle;
        const midR = rimR * 0.56;
        rimParts.push({
          geo: new THREE.BoxGeometry(0.028, rimR * 0.82, 0.03),
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
    const rotorGeo = track(new THREE.CylinderGeometry(rimR * 0.82, rimR * 0.82, 0.04, 16));
    rotorGeo.rotateZ(Math.PI / 2);
    const rotor = new THREE.Mesh(rotorGeo, rotorMat);
    rotor.position.set(xSign * (width * 0.14), 0, 0);
    spinner.add(rotor);

    const caliperGeo = track(new THREE.BoxGeometry(width * 0.34, rimR * 0.56, rimR * 0.38));
    const caliper = new THREE.Mesh(caliperGeo, caliperMat);
    caliper.position.set(xSign * (width * 0.21), 0.04, -rimR * 0.44);
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
  const isWide = Boolean(isBossCar || spec.aeroKit === 'widebody');
  const style = spec.bodyStyle;

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

  if (isPlayer) {
    const beamTex = track(createHeadlightPoolTexture());
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
          metalness: 0.62,
          roughness: 0.24,
        })
      : new THREE.MeshPhysicalMaterial({
          color: liveryTex ? 0xffffff : new THREE.Color(isPolice || isRhino ? '#0F172A' : paintHex),
          map: liveryTex,
          metalness: isPolice || isRhino ? 0.48 : 0.78,
          roughness: 0.14,
          clearcoat: 1.0,
          clearcoatRoughness: 0.04,
          envMapIntensity: 1.65,
        }),
  );

  const solidPaintMat = track(
    lowDetail
      ? paintMat
      : new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(
            isPolice || isRhino ? '#0F172A' : livery === 'most_wanted' ? '#DCE2EC' : paintHex,
          ),
          metalness: isPolice || isRhino ? 0.48 : 0.78,
          roughness: 0.14,
          clearcoat: 1.0,
          clearcoatRoughness: 0.04,
          envMapIntensity: 1.65,
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
          metalness: 0.35,
          roughness: 0.03,
          clearcoat: 1.0,
          clearcoatRoughness: 0.02,
          envMapIntensity: 1.75,
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
    new THREE.MeshStandardMaterial({ color: '#FEF9C3', emissive: new THREE.Color('#FFFBEB'), emissiveIntensity: 3.5 }),
  );
  const brakeLightMat = track(
    new THREE.MeshStandardMaterial({ color: '#991B1B', emissive: new THREE.Color('#EF4444'), emissiveIntensity: 1.6 }),
  );
  const reverseLightMat = track(
    new THREE.MeshStandardMaterial({ color: '#E2E8F0', emissive: new THREE.Color('#F8FAFC'), emissiveIntensity: 0.15 }),
  );
  const chromeMat = track(new THREE.MeshStandardMaterial({ color: '#E2E8F0', metalness: 0.94, roughness: 0.14 }));

  const clearance = wheelRadius * (isRhino ? 0.62 : 0.27);
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

    // Side door sculpting recessed step / character line panel
    if (!lowDetail) {
      paintParts.push(
        { geo: makeChamferCube(bw * 0.99, lowerH * 0.42, midLen * 0.86, 0.028, false), pos: [0, clearance + lowerH * 0.68, midCenterZ] },
      );
    }

    // 2. Boxy Stepped Fender Flares & Recessed Wheel Arch Liners (distinct cubic look!)
    const wellFrontGeo = new THREE.CylinderGeometry(wheelRadius * 1.12, wheelRadius * 1.12, bw * 0.93, 12);
    wellFrontGeo.rotateZ(Math.PI / 2);
    carbonParts.push({ geo: wellFrontGeo, pos: [0, wheelRadius * 0.95, frontAxleZ] });

    const wellRearGeo = new THREE.CylinderGeometry(wheelRadius * 1.12, wheelRadius * 1.12, bw * 0.93, 12);
    wellRearGeo.rotateZ(Math.PI / 2);
    carbonParts.push({ geo: wellRearGeo, pos: [0, wheelRadius * 0.95, rearAxleZ] });

    const flareOut = isBossCar ? 0.11 : isWide ? 0.085 : 0.055;
    const flareX = bw * 0.5 + flareOut * 0.35;
    const archTopY = clearance + wheelRadius * 1.38;
    const archW = wheelRadius * 2.18;

    [frontAxleZ, rearAxleZ].forEach((az) => {
      [-flareX, flareX].forEach((ax) => {
        // Horizontal top fender block + angled front/rear cheek pillars framing the wheel
        paintParts.push(
          { geo: makeChamferCube(0.14 + flareOut, 0.14, archW, 0.025, lowDetail), pos: [ax, archTopY, az] },
          { geo: makeChamferCube(0.12 + flareOut, wheelRadius * 0.72, 0.17, 0.02, lowDetail), pos: [ax, clearance + wheelRadius * 0.58, az - archW * 0.46] },
          { geo: makeChamferCube(0.12 + flareOut, wheelRadius * 0.72, 0.17, 0.02, lowDetail), pos: [ax, clearance + wheelRadius * 0.58, az + archW * 0.46] },
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
    const cabW = bw * (isExotic ? 0.77 : isMuscle ? 0.78 : 0.82);
    const cabStartZ = isExotic ? -hl * 0.44 : isMuscle ? -hl * 0.10 : -hl * 0.28;
    const cabEndZ = isHatch ? hl * 0.84 : isSedan ? hl * 0.62 : isExotic ? hl * 0.34 : hl * 0.56;
    const cabLen = Math.max(1.1, cabEndZ - cabStartZ);
    const cabCenterZ = (cabStartZ + cabEndZ) * 0.5;

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
        // Bold A-pillars
        carbonParts.push({
          geo: new THREE.BoxGeometry(0.065, cabH * 1.15, 0.08),
          pos: [px, beltY + cabH * 0.45, cabStartZ - 0.12],
          rot: [-0.52, 0, 0],
        });
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

      // Boxy Wing Mirrors on stalks
      solidPaintParts.push(
        { geo: makeChamferCube(0.18, 0.09, 0.14, 0.02, false), pos: [-bw * 0.49, beltY + 0.06, cabStartZ + 0.05] },
        { geo: makeChamferCube(0.18, 0.09, 0.14, 0.02, false), pos: [bw * 0.49, beltY + 0.06, cabStartZ + 0.05] },
      );

      // Visible Rollcage crossbar inside GT-R / Boss cabins
      if (isGtr || isBossCar) {
        accentParts.push(
          { geo: new THREE.BoxGeometry(cabW * 0.72, 0.045, 0.045), pos: [0, beltY + cabH * 0.64, cabEndZ - 0.08] },
        );
      }
    }

    // 4. Style-Specific Hood, Intakes, Intercooler & Engine Details
    const hoodY = clearance + noseH;
    if (!lowDetail && !isPolice) {
      if (isMuscle) {
        // Protruding Supercharger Blower Scoop + Twin Chrome Intake Barrels
        carbonParts.push({
          geo: makeChamferCube(bw * 0.34, 0.15, length * 0.24, 0.025, false),
          pos: [0, hoodY + 0.06, -hl * 0.44],
        });
        chromeParts.push(
          { geo: new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8), pos: [-0.11, hoodY + 0.11, -hl * 0.56], rot: [Math.PI / 2, 0, 0] },
          { geo: new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8), pos: [0.11, hoodY + 0.11, -hl * 0.56], rot: [Math.PI / 2, 0, 0] },
        );
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
        // Mid-engine louvers + twin brushed aluminum intake plenums under rear deck
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
        // Rally Box Hood Scoop + Twin NACA Vents
        solidPaintParts.push({
          geo: makeChamferCube(bw * 0.32, 0.11, 0.46, 0.02, false),
          pos: [0, hoodY + 0.04, -hl * 0.50],
        });
        carbonParts.push({
          geo: new THREE.BoxGeometry(bw * 0.26, 0.07, 0.06),
          pos: [0, hoodY + 0.04, -hl * 0.72],
        });
      } else {
        // Street Coupe / GT-R Stepped Hood Power Bulge + Twin Carbon Heat Extractors
        carbonParts.push(
          { geo: new THREE.BoxGeometry(0.26, 0.04, 0.46), pos: [-bw * 0.18, hoodY + 0.005, -hl * 0.52] },
          { geo: new THREE.BoxGeometry(0.26, 0.04, 0.46), pos: [bw * 0.18, hoodY + 0.005, -hl * 0.52] },
        );
      }
    }

    // 5. Front Chin Splitter, Recessed FMIC Intercooler, Side Skirts & Multi-Fin Rear Diffuser
    const splitterExtend = isBossCar ? 0.42 : 0.30;
    carbonParts.push(
      { geo: makeChamferCube(bw * (isBossCar ? 1.06 : 0.99), 0.06, splitterExtend, 0.015, lowDetail), pos: [0, clearance + 0.02, -hl - 0.01] },
      { geo: makeChamferCube(bw * (isBossCar ? 1.04 : 1.00), 0.08, midLen * 1.02, 0.015, lowDetail), pos: [0, clearance + 0.03, midCenterZ] },
      { geo: makeChamferCube(bw * 0.92, 0.18, 0.24, 0.02, lowDetail), pos: [0, clearance + 0.08, hl - 0.03] },
      // Front bumper recessed grille pocket
      { geo: new THREE.BoxGeometry(bw * 0.56, lowerH * 0.34, 0.10), pos: [0, clearance + lowerH * 0.28, -hl + 0.02] },
    );

    if (!lowDetail) {
      // Exposed Brushed Aluminum Intercooler Core + Front Tow Hook
      chromeParts.push(
        { geo: new THREE.BoxGeometry(bw * 0.46, lowerH * 0.24, 0.08), pos: [0, clearance + lowerH * 0.26, -hl + 0.005] },
      );
      if (!isPolice) {
        accentParts.push({
          geo: new THREE.BoxGeometry(0.08, 0.03, 0.12),
          pos: [bw * 0.24, clearance + 0.08, -hl - 0.10],
        });
      }
      // Quad-Fin Rear Diffuser Blades
      [-0.36, -0.13, 0.13, 0.36].forEach((dx) => {
        carbonParts.push({
          geo: new THREE.BoxGeometry(0.038, 0.18, 0.28),
          pos: [dx, clearance + 0.09, hl + 0.01],
        });
      });

      if (isBossCar) {
        // Exclusive Boss Front Dive-Plane Canards
        [-bw * 0.51, bw * 0.51].forEach((cx) => {
          const s = cx < 0 ? -1 : 1;
          carbonParts.push({
            geo: new THREE.BoxGeometry(0.16, 0.03, 0.26),
            pos: [cx, clearance + 0.18, -hl + 0.22],
            rot: [0.14, s * 0.22, s * -0.10],
          });
        });
      }
    }

    // 6. Cubic Xenon Headlight Blocks & Signature Taillights
    const headY = clearance + noseH * 0.58;
    const tailLampY = clearance + tailH * 0.68;

    carbonParts.push(
      { geo: new THREE.BoxGeometry(0.40, 0.13, 0.09), pos: [-bw * 0.32, headY, -hl + 0.02] },
      { geo: new THREE.BoxGeometry(0.40, 0.13, 0.09), pos: [bw * 0.32, headY, -hl + 0.02] },
      { geo: new THREE.BoxGeometry(bw * 0.88, 0.16, 0.08), pos: [0, tailLampY, hl - 0.01] },
    );

    headlightParts.push(
      { geo: new THREE.BoxGeometry(0.32, 0.08, 0.08), pos: [-bw * 0.32, headY, -hl - 0.01] },
      { geo: new THREE.BoxGeometry(0.32, 0.08, 0.08), pos: [bw * 0.32, headY, -hl - 0.01] },
    );

    // Extra Quad Rally Fog Lamps on Sedan
    if (isSedan && !isPolice && !lowDetail) {
      headlightParts.push(
        { geo: new THREE.BoxGeometry(0.14, 0.10, 0.08), pos: [-bw * 0.18, clearance + 0.20, -hl - 0.02] },
        { geo: new THREE.BoxGeometry(0.14, 0.10, 0.08), pos: [bw * 0.18, clearance + 0.20, -hl - 0.02] },
      );
    }

    if (isGtr && !lowDetail) {
      // Quad GT-R Ring / Cube Taillights
      [-bw * 0.36, -bw * 0.22, bw * 0.22, bw * 0.36].forEach((tx) => {
        const ringG = new THREE.TorusGeometry(0.048, 0.016, 6, 12);
        taillightParts.push({ geo: ringG, pos: [tx, tailLampY, hl + 0.015] });
      });
    } else {
      taillightParts.push(
        { geo: new THREE.BoxGeometry(0.38, 0.085, 0.07), pos: [-bw * 0.30, tailLampY, hl + 0.01] },
        { geo: new THREE.BoxGeometry(0.38, 0.085, 0.07), pos: [bw * 0.30, tailLampY, hl + 0.01] },
      );
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
      plate.position.set(0, clearance + tailH * 0.34, hl + 0.01);
      bodyGroup.add(plate);
    }

    // 7. Distinct Class Spoilers & Wings
    if (!isPolice && !lowDetail) {
      const deckY = clearance + tailH;
      if (isBossCar) {
        const wingH = 0.32;
        carbonParts.push(
          { geo: makeChamferCube(bw * 1.04, 0.045, 0.32, 0.01, false), pos: [0, deckY + wingH, hl - 0.17], rot: [0.10, 0, 0] },
          { geo: makeChamferCube(bw * 0.96, 0.035, 0.18, 0.01, false), pos: [0, deckY + wingH + 0.08, hl - 0.12], rot: [0.16, 0, 0] },
          { geo: new THREE.BoxGeometry(0.04, wingH + 0.04, 0.18), pos: [-bw * 0.24, deckY + wingH * 0.5, hl - 0.20] },
          { geo: new THREE.BoxGeometry(0.04, wingH + 0.04, 0.18), pos: [bw * 0.24, deckY + wingH * 0.5, hl - 0.20] },
        );
        solidPaintParts.push(
          { geo: makeChamferCube(0.04, 0.24, 0.40, 0.01, false), pos: [-bw * 0.52, deckY + wingH + 0.02, hl - 0.16] },
          { geo: makeChamferCube(0.04, 0.24, 0.40, 0.01, false), pos: [bw * 0.52, deckY + wingH + 0.02, hl - 0.16] },
        );
      } else if (isMuscle) {
        // Aggressive Kicked-Up Ducktail Block Spoiler
        solidPaintParts.push({
          geo: makeChamferCube(bw * 0.90, 0.12, 0.20, 0.02, false),
          pos: [0, deckY + 0.05, hl - 0.13],
          rot: [-0.36, 0, 0],
        });
      } else if (isHatch) {
        // Roof-mounted Hot-Hatch Box Spoiler
        solidPaintParts.push(
          { geo: makeChamferCube(cabW * 0.98, 0.07, 0.28, 0.015, false), pos: [0, roofY + 0.04, cabEndZ + 0.08], rot: [0.12, 0, 0] },
          { geo: new THREE.BoxGeometry(0.04, 0.12, 0.26), pos: [-cabW * 0.48, roofY + 0.02, cabEndZ + 0.08] },
          { geo: new THREE.BoxGeometry(0.04, 0.12, 0.26), pos: [cabW * 0.48, roofY + 0.02, cabEndZ + 0.08] },
        );
      } else {
        // Tall Boxy WRC / GT Rear Wing
        const wingH = isGtr || isSedan ? 0.28 : 0.22;
        carbonParts.push(
          { geo: makeChamferCube(bw * 0.94, 0.045, 0.28, 0.01, false), pos: [0, deckY + wingH, hl - 0.16], rot: [0.09, 0, 0] },
          { geo: new THREE.BoxGeometry(0.042, wingH, 0.15), pos: [-bw * 0.24, deckY + wingH * 0.5, hl - 0.18] },
          { geo: new THREE.BoxGeometry(0.042, wingH, 0.15), pos: [bw * 0.24, deckY + wingH * 0.5, hl - 0.18] },
        );
        solidPaintParts.push(
          { geo: new THREE.BoxGeometry(0.04, 0.18, 0.34), pos: [-bw * 0.47, deckY + wingH, hl - 0.16] },
          { geo: new THREE.BoxGeometry(0.04, 0.18, 0.34), pos: [bw * 0.47, deckY + wingH, hl - 0.16] },
        );
      }
    }
  }

  // 8. Twin / Quad Chrome Exhaust Cannons (+ Side-Exit Rocker Pipes on Muscle)
  const exhaustOffsets =
    !lowDetail && (style === 'gtr' || style === 'exotic' || isBossCar)
      ? [-0.46, -0.32, 0.32, 0.46]
      : [-0.38, 0.38];
  exhaustOffsets.forEach((ex) => {
    const exGeo = new THREE.CylinderGeometry(0.052, 0.052, 0.24, 8);
    exGeo.rotateX(Math.PI / 2);
    chromeParts.push({ geo: exGeo, pos: [ex, clearance + 0.09, hl - 0.01] });
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
    const redGlowTex = track(createLightGlowTexture('rgba(239, 68, 68, 0.92)'));
    const blueGlowTex = track(createLightGlowTexture('rgba(59, 130, 246, 0.92)'));
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

    const nosHaloTex = track(createLightGlowTexture('rgba(56, 189, 248, 0.92)'));
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

    [-0.38, 0.38].forEach((ex) => {
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(ex, clearance + 0.09, hl + 0.03);
      flame.visible = false;
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.position.set(ex, clearance + 0.09, hl + 0.03);
      core.visible = false;
      const halo = new THREE.Mesh(nosHaloGeo, nosHaloMat);
      halo.position.set(ex, clearance + 0.12, hl + 0.12);
      halo.visible = false;
      bodyGroup.add(flame, core, halo);
      nosFlames.push(flame);
      nosCores.push(core);
      nosHalos.push(halo);

      const bf = new THREE.Mesh(backfireGeo, backfireMat);
      bf.position.set(ex, clearance + 0.09, hl + 0.04);
      bf.visible = false;
      bodyGroup.add(bf);
      backfireFlames.push(bf);
    });

    const glowTex = track(createLightGlowTexture('rgba(239, 68, 68, 0.85)'));
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

  // Four Wheel Hubs
  const wheelWidth = isRhino ? 0.34 : isBossCar ? 0.31 : 0.27;
  const trackHalfX = width * (isBossCar ? 0.48 : 0.45);
  const wheelFrontLeft = new THREE.Group();
  const wheelFrontRight = new THREE.Group();
  const wheelSpinners: THREE.Group[] = [];

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
      rotorMat,
      caliperMat,
      wd.isLeft,
      lowDetail,
      Boolean(isRhino),
      track,
    );
    built.pivot.position.set(wd.x, wheelRadius, wd.z);
    if (wd.isFront && wd.isLeft) {
      wheelFrontLeft.position.copy(built.pivot.position);
      built.pivot.position.set(0, 0, 0);
      wheelFrontLeft.add(built.pivot);
      root.add(wheelFrontLeft);
    } else if (wd.isFront && !wd.isLeft) {
      wheelFrontRight.position.copy(built.pivot.position);
      built.pivot.position.set(0, 0, 0);
      wheelFrontRight.add(built.pivot);
      root.add(wheelFrontRight);
    } else {
      root.add(built.pivot);
    }
    wheelSpinners.push(built.spinner);
  });

  return {
    root,
    bodyGroup,
    bodyMaterials: [paintMat, solidPaintMat],
    rimMaterials: [rimMat],
    brakeLightMat,
    reverseLightMat,
    brakeGlows,
    nosFlames,
    nosCores,
    nosHalos,
    backfireFlames,
    wheelFrontLeft,
    wheelFrontRight,
    wheelSpinners,
    lightbarRed,
    lightbarBlue,
    lightbarHaloRed,
    lightbarHaloBlue,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
