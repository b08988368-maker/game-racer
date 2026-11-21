import * as THREE from 'three';
import { EnvironmentId, TrackId } from '../types/game';
import {
  createAsphaltNormalTexture,
  createAsphaltRoughnessTexture,
  createAsphaltTexture,
  createBarrierTexture,
  createBillboardTexture,
  createBuildingFacadeTexture,
  createCurbTexture,
  createGarageFloorTexture,
  createGroundTerrainTexture,
  createHighwaySignTexture,
  createLightGlowTexture,
  createRampChevronTexture,
  createRoadLightPoolTexture,
  createStartBannerTexture,
  createWetAsphaltRoughnessTexture,
} from './textures';

export interface TrackSample {
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  slopePitch: number;
  bankAngle: number;
  progress: number; // 0..1
  index: number;
}

export interface SpeedTrap {
  id: number;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  progress: number;
  targetKmh: number;
  cooldownTimer: number;
  flashMesh: THREE.Mesh;
}

export interface PursuitBreaker {
  id: number;
  position: THREE.Vector3;
  group: THREE.Group;
  triggered: boolean;
  collapseAnim: number;
  respawnTimer: number;
}

export interface CooldownZone {
  id: number;
  position: THREE.Vector3;
  radius: number;
}

export interface TrackRamp {
  id: number;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  lateralCenter: number;
  halfWidth: number;
  length: number;
  height: number;
  launchAngle: number;
  trackIdx: number;
}

export interface SmashableProp {
  id: number;
  homePos: THREE.Vector3;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rotVel: THREE.Vector3;
  mesh: THREE.Mesh;
  hit: boolean;
  respawnTimer: number;
}

export interface TollboothGate {
  id: number;
  progress: number;
  position: THREE.Vector3;
  beaconMat: THREE.MeshStandardMaterial;
  group: THREE.Group;
}

export interface TrackShortcut {
  id: number;
  label: string;
  startIdx: number;
  endIdx: number;
  side: -1 | 1; // -1 = left exit, +1 = right exit
  halfWidth: number;
  points: THREE.Vector3[];
  tangents: THREE.Vector3[];
  entryPos: THREE.Vector3;
  exitPos: THREE.Vector3;
  minimapPoints: { x: number; z: number }[];
}

export interface BuiltTrack {
  id: TrackId;
  environment: Exclude<EnvironmentId, 'auto'>;
  group: THREE.Group;
  curve: THREE.CatmullRomCurve3;
  samples: TrackSample[];
  totalLength: number;
  roadHalfWidth: number;
  barrierHalfWidth: number;
  speedTraps: SpeedTrap[];
  pursuitBreakers: PursuitBreaker[];
  cooldownZones: CooldownZone[];
  ramps: TrackRamp[];
  smashables: SmashableProp[];
  tollbooths: TollboothGate[];
  shortcuts: TrackShortcut[];
  tunnelRanges: { startIdx: number; endIdx: number }[];
  minimapPath: { x: number; z: number }[];
  getClosestTrackInfo: (
    x: number,
    z: number,
    hintIndex?: number,
  ) => {
    sample: TrackSample;
    lateralOffset: number;
    elevationY: number;
    slopePitch: number;
    bankAngle: number;
    distanceSq: number;
  };
  queryShortcut: (
    x: number,
    z: number,
  ) => {
    shortcut: TrackShortcut;
    ptIndex: number;
    lateral: number;
    elevationY: number;
    tangent: THREE.Vector3;
    distanceSq: number;
  } | null;
  dispose: () => void;
}

const SAMPLE_COUNT = 720;
const ROAD_HALF_WIDTH = 12.2;
const BARRIER_HALF_WIDTH = 14.4;

function getControlPoints(trackId: TrackId): THREE.Vector3[] {
  switch (trackId) {
    case 'rosewood_park':
      // Easy sweeping University & Arboretum boulevards
      return [
        new THREE.Vector3(0, 0, 290),
        new THREE.Vector3(0, 1, -280),
        new THREE.Vector3(160, 6, -540),
        new THREE.Vector3(520, 11, -580),
        new THREE.Vector3(780, 7, -320),
        new THREE.Vector3(740, 2, 40),
        new THREE.Vector3(480, 0, 160),
        new THREE.Vector3(540, 4, 460),
        new THREE.Vector3(380, 6, 740),
        new THREE.Vector3(90, 2, 690),
        new THREE.Vector3(-45, 0, 480),
      ];

    case 'hwy99_speedway':
      // 5.5 km Pure High-Speed Interstate Super-Beltway (350+ km/h)
      return [
        new THREE.Vector3(0, 0, 420),
        new THREE.Vector3(0, 2, -520),
        new THREE.Vector3(190, 8, -860),
        new THREE.Vector3(580, 14, -920),
        new THREE.Vector3(960, 10, -640),
        new THREE.Vector3(1060, 3, -120),
        new THREE.Vector3(1040, 3, 460),
        new THREE.Vector3(820, 12, 860),
        new THREE.Vector3(400, 14, 960),
        new THREE.Vector3(80, 6, 780),
      ];

    case 'camden_coast':
      // 5.1 km Coastal Freeway & Dockyard Chicane
      return [
        new THREE.Vector3(0, 0, 310),
        new THREE.Vector3(0, 0, -330),
        new THREE.Vector3(170, 12, -670),
        new THREE.Vector3(540, 20, -780),
        new THREE.Vector3(920, 14, -590),
        new THREE.Vector3(960, 4, -240),
        new THREE.Vector3(650, 2, -60),
        new THREE.Vector3(560, 2, 220),
        new THREE.Vector3(860, 10, 430),
        new THREE.Vector3(730, 16, 790),
        new THREE.Vector3(360, 10, 900),
        new THREE.Vector3(65, 3, 710),
        new THREE.Vector3(-65, 0, 500),
      ];

    case 'rosewood_canyon':
      // 5.2 km Mountain Switchbacks, Steep Climb & Canyon Jump
      return [
        new THREE.Vector3(0, 0, 290),
        new THREE.Vector3(0, 2, -260),
        new THREE.Vector3(145, 16, -540),
        new THREE.Vector3(460, 32, -690),
        new THREE.Vector3(820, 38, -510),
        new THREE.Vector3(870, 22, -210),
        new THREE.Vector3(520, 12, -160),
        new THREE.Vector3(380, 6, 90),
        new THREE.Vector3(690, 14, 290),
        new THREE.Vector3(810, 24, 620),
        new THREE.Vector3(470, 26, 880),
        new THREE.Vector3(140, 11, 760),
        new THREE.Vector3(-90, 2, 540),
      ];

    case 'heritage_forest':
      // 5.4 km Technical Forest S-Bends & Timberland Serpentine
      return [
        new THREE.Vector3(0, 0, 280),
        new THREE.Vector3(0, 4, -270),
        new THREE.Vector3(185, 12, -580),
        new THREE.Vector3(490, 18, -500),
        new THREE.Vector3(650, 24, -760),
        new THREE.Vector3(950, 20, -540),
        new THREE.Vector3(860, 10, -180),
        new THREE.Vector3(510, 5, -60),
        new THREE.Vector3(420, 8, 260),
        new THREE.Vector3(780, 15, 420),
        new THREE.Vector3(740, 18, 790),
        new THREE.Vector3(380, 9, 860),
        new THREE.Vector3(90, 3, 660),
      ];

    case 'gray_point_bay':
      // 6.0 km Long Sea Causeways & Turnpike Bridges
      return [
        new THREE.Vector3(0, 0, 360),
        new THREE.Vector3(0, 1, -430),
        new THREE.Vector3(210, 16, -820),
        new THREE.Vector3(660, 22, -910),
        new THREE.Vector3(1040, 14, -640),
        new THREE.Vector3(1060, 4, -180),
        new THREE.Vector3(720, 2, -20),
        new THREE.Vector3(590, 6, 280),
        new THREE.Vector3(920, 14, 480),
        new THREE.Vector3(860, 20, 880),
        new THREE.Vector3(420, 12, 950),
        new THREE.Vector3(80, 3, 760),
      ];

    case 'silverton_pass':
      // 5.7 km Steelworks Sector & Twin Tunnels
      return [
        new THREE.Vector3(0, 0, 340),
        new THREE.Vector3(0, 0, -390),
        new THREE.Vector3(170, 18, -710),
        new THREE.Vector3(560, 28, -770),
        new THREE.Vector3(910, 18, -510),
        new THREE.Vector3(730, 6, -240),
        new THREE.Vector3(410, 4, -130),
        new THREE.Vector3(450, 10, 170),
        new THREE.Vector3(830, 20, 310),
        new THREE.Vector3(860, 22, 680),
        new THREE.Vector3(480, 14, 910),
        new THREE.Vector3(120, 6, 790),
        new THREE.Vector3(-85, 0, 540),
      ];

    case 'downtown_labyrinth':
      // 5.3 km Tight 90-degree City Block Corners & Two Alley Shortcuts
      return [
        new THREE.Vector3(0, 0, 310),
        new THREE.Vector3(0, 0, -280),
        new THREE.Vector3(240, 0, -320),
        new THREE.Vector3(260, 2, -680),
        new THREE.Vector3(650, 4, -710),
        new THREE.Vector3(880, 2, -420),
        new THREE.Vector3(600, 0, -230),
        new THREE.Vector3(580, 0, 130),
        new THREE.Vector3(880, 4, 210),
        new THREE.Vector3(840, 8, 620),
        new THREE.Vector3(440, 5, 670),
        new THREE.Vector3(380, 2, 880),
        new THREE.Vector3(60, 0, 810),
      ];

    case 'blackridge_summit':
      // 6.8 km Longest & Toughest Highland Circuit with Massive Elevation Swings & 2 Shortcuts
      return [
        new THREE.Vector3(0, 0, 380),
        new THREE.Vector3(0, 4, -360),
        new THREE.Vector3(180, 24, -740),
        new THREE.Vector3(540, 42, -920),
        new THREE.Vector3(940, 46, -720),
        new THREE.Vector3(1060, 28, -330),
        new THREE.Vector3(700, 14, -220),
        new THREE.Vector3(520, 8, 60),
        new THREE.Vector3(860, 22, 240),
        new THREE.Vector3(1020, 34, 590),
        new THREE.Vector3(760, 38, 940),
        new THREE.Vector3(380, 22, 980),
        new THREE.Vector3(120, 8, 790),
        new THREE.Vector3(-85, 2, 560),
      ];

    case 'rockport_loop':
    default:
      // 4.6 km Downtown + Harbor Suspension Bridge + Refinery Tunnel
      return [
        new THREE.Vector3(0, 0, 300),
        new THREE.Vector3(0, 0, -340),
        new THREE.Vector3(125, 10, -640),
        new THREE.Vector3(440, 21, -760),
        new THREE.Vector3(790, 17, -550),
        new THREE.Vector3(860, 3, -180),
        new THREE.Vector3(570, 0, -20),
        new THREE.Vector3(570, 0, 320),
        new THREE.Vector3(800, 9, 570),
        new THREE.Vector3(500, 15, 830),
        new THREE.Vector3(135, 5, 730),
        new THREE.Vector3(-60, 0, 520),
      ];
  }
}

interface ShortcutDef {
  label: string;
  startProg: number;
  endProg: number;
  side: -1 | 1;
  pullFactor: number;
}

function getShortcutDefs(trackId: TrackId): ShortcutDef[] {
  switch (trackId) {
    case 'hwy99_speedway':
      return [];
    case 'rockport_loop':
      return [{ label: 'FREIGHT YARD SHORTCUT', startProg: 0.56, endProg: 0.71, side: 1, pullFactor: 0.35 }];
    case 'rosewood_park':
      return [{ label: 'COLLEGE QUAD SHORTCUT', startProg: 0.44, endProg: 0.59, side: -1, pullFactor: 0.35 }];
    case 'camden_coast':
      return [{ label: 'CONTAINER RAIL BYPASS', startProg: 0.43, endProg: 0.59, side: 1, pullFactor: 0.35 }];
    case 'rosewood_canyon':
      return [{ label: 'OLD MILL GORGE CUT', startProg: 0.38, endProg: 0.54, side: -1, pullFactor: 0.38 }];
    case 'heritage_forest':
      return [{ label: 'LOGGING TRAIL SHORTCUT', startProg: 0.53, endProg: 0.68, side: 1, pullFactor: 0.36 }];
    case 'gray_point_bay':
      return [{ label: 'HARBOR ALLEY BYPASS', startProg: 0.51, endProg: 0.66, side: 1, pullFactor: 0.36 }];
    case 'silverton_pass':
      return [{ label: 'SLAG PIT BYPASS', startProg: 0.35, endProg: 0.49, side: 1, pullFactor: 0.38 }];
    case 'downtown_labyrinth':
      return [
        { label: 'SUBWAY ALLEY SHORTCUT', startProg: 0.16, endProg: 0.29, side: 1, pullFactor: 0.34 },
        { label: 'TRANSIT PLAZA SHORTCUT', startProg: 0.56, endProg: 0.72, side: 1, pullFactor: 0.36 },
      ];
    case 'blackridge_summit':
      return [
        { label: 'RIDGE TUNNEL SHORTCUT', startProg: 0.34, endProg: 0.49, side: -1, pullFactor: 0.36 },
        { label: 'QUARRY SPINE CUT', startProg: 0.64, endProg: 0.78, side: 1, pullFactor: 0.36 },
      ];
  }
}

export function buildGarageShowroom(maxAnisotropy: number): {
  group: THREE.Group;
  dispose: () => void;
} {
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const floorTex = track(createGarageFloorTexture(maxAnisotropy));
  const floorGeo = track(new THREE.PlaneGeometry(36, 36));
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = track(
    new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.22,
      metalness: 0.38,
    }),
  );
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.receiveShadow = true;
  group.add(floor);

  const padGeo = track(new THREE.CylinderGeometry(4.45, 4.6, 0.03, 48));
  const padMat = track(new THREE.MeshStandardMaterial({ color: '#1B202B', roughness: 0.34, metalness: 0.72 }));
  const pad = new THREE.Mesh(padGeo, padMat);
  pad.position.y = 0.015;
  pad.receiveShadow = true;
  group.add(pad);

  const ringGeo = track(new THREE.RingGeometry(4.58, 4.82, 64));
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = track(
    new THREE.MeshBasicMaterial({
      color: '#F59E0B',
      transparent: true,
      opacity: 0.9,
    }),
  );
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.032;
  group.add(ring);

  const innerRingGeo = track(new THREE.RingGeometry(3.25, 3.34, 64));
  innerRingGeo.rotateX(-Math.PI / 2);
  const innerRing = new THREE.Mesh(innerRingGeo, ringMat);
  innerRing.position.y = 0.032;
  group.add(innerRing);

  const steelMat = track(new THREE.MeshStandardMaterial({ color: '#272D3B', roughness: 0.34, metalness: 0.86 }));
  const rollerMat = track(new THREE.MeshStandardMaterial({ color: '#94A3B8', roughness: 0.22, metalness: 0.92 }));
  const railGeo = track(new THREE.BoxGeometry(0.48, 0.035, 5.2));
  const rollerGeo = track(new THREE.CylinderGeometry(0.11, 0.11, 0.56, 12));
  rollerGeo.rotateZ(Math.PI / 2);

  [-0.95, 0.95].forEach((rx) => {
    const rail = new THREE.Mesh(railGeo, steelMat);
    rail.position.set(rx, 0.02, 0);
    group.add(rail);
    [-1.42, -1.26, 1.26, 1.42].forEach((rz) => {
      const roller = new THREE.Mesh(rollerGeo, rollerMat);
      roller.position.set(rx, 0.03, rz);
      group.add(roller);
    });
  });

  const wallMat = track(new THREE.MeshStandardMaterial({ color: '#11141B', roughness: 0.84, metalness: 0.16 }));
  const lightStripMat = track(
    new THREE.MeshStandardMaterial({
      color: '#FEF3C7',
      emissive: new THREE.Color('#F59E0B'),
      emissiveIntensity: 2.6,
    }),
  );

  const wallGeo = track(new THREE.BoxGeometry(36, 11.5, 0.8));
  const backWall = new THREE.Mesh(wallGeo, wallMat);
  backWall.position.set(0, 5.75, -16.5);
  const frontWall = new THREE.Mesh(wallGeo, wallMat);
  frontWall.position.set(0, 5.75, 16.5);
  const leftWall = new THREE.Mesh(wallGeo, wallMat);
  leftWall.rotation.y = Math.PI / 2;
  leftWall.position.set(-16.5, 5.75, 0);
  const rightWall = new THREE.Mesh(wallGeo, wallMat);
  rightWall.rotation.y = Math.PI / 2;
  rightWall.position.set(16.5, 5.75, 0);
  group.add(backWall, frontWall, leftWall, rightWall);

  const colGeo = track(new THREE.BoxGeometry(0.72, 11.5, 0.72));
  const beamGeo = track(new THREE.BoxGeometry(33, 0.58, 0.58));
  const stripGeo = track(new THREE.BoxGeometry(11.5, 0.14, 0.38));

  [-9, 0, 9].forEach((z) => {
    const cL = new THREE.Mesh(colGeo, steelMat);
    cL.position.set(-14.8, 5.75, z);
    const cR = new THREE.Mesh(colGeo, steelMat);
    cR.position.set(14.8, 5.75, z);
    const beam = new THREE.Mesh(beamGeo, steelMat);
    beam.position.set(0, 9.6, z);
    const strip = new THREE.Mesh(stripGeo, lightStripMat);
    strip.position.set(0, 9.25, z);
    group.add(cL, cR, beam, strip);
  });

  const signTex = track(createBillboardTexture(maxAnisotropy, 'SAFE HOUSE // TUNING BAY'));
  const signMat = track(
    new THREE.MeshStandardMaterial({
      map: signTex,
      roughness: 0.35,
      emissive: new THREE.Color('#F59E0B'),
      emissiveIntensity: 0.25,
    }),
  );
  const wallBanner = new THREE.Mesh(track(new THREE.PlaneGeometry(9.2, 4.6)), signMat);
  wallBanner.position.set(0, 5.3, -16.0);
  group.add(wallBanner);

  const coneGeo = track(new THREE.ConeGeometry(5.6, 9.4, 24, 1, true));
  const coneMat = track(
    new THREE.MeshBasicMaterial({
      color: '#FEF3C7',
      transparent: true,
      opacity: 0.045,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.set(0, 4.75, 0);
  group.add(cone);

  const cabMat = track(new THREE.MeshStandardMaterial({ color: '#B91C1C', roughness: 0.38, metalness: 0.55 }));
  const cabGeo = track(new THREE.BoxGeometry(2.6, 1.5, 0.9));
  const cab = new THREE.Mesh(cabGeo, cabMat);
  cab.position.set(-8.5, 0.75, -13.8);
  const cab2 = new THREE.Mesh(cabGeo, steelMat);
  cab2.position.set(-5.4, 0.75, -13.8);

  const diagScreen = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.9, 0.65, 0.12)),
    track(new THREE.MeshStandardMaterial({ color: '#0F172A', emissive: new THREE.Color('#38BDF8'), emissiveIntensity: 1.4 })),
  );
  diagScreen.position.set(-4.2, 1.5, -10.8);
  diagScreen.rotation.y = 0.45;
  const diagStand = new THREE.Mesh(track(new THREE.BoxGeometry(0.75, 1.15, 0.6)), cabMat);
  diagStand.position.set(-4.2, 0.58, -10.8);
  group.add(cab, cab2, diagScreen, diagStand);

  const tireMat = track(new THREE.MeshStandardMaterial({ color: '#14161B', roughness: 0.88 }));
  const tireStackGeo = track(new THREE.TorusGeometry(0.36, 0.14, 10, 20));
  tireStackGeo.rotateX(Math.PI / 2);
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Mesh(tireStackGeo, tireMat);
    t.position.set(8.2, 0.14 + i * 0.27, -13.2);
    group.add(t);
  }

  return {
    group,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

export function buildTrack(
  trackId: TrackId,
  maxAnisotropy: number,
  environment: Exclude<EnvironmentId, 'auto'> = 'golden_dusk',
): BuiltTrack {
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const controlPts = getControlPoints(trackId);
  const curve = new THREE.CatmullRomCurve3(controlPts, true, 'catmullrom', 0.48);
  const totalLength = curve.getLength();

  const spacedPts = curve.getSpacedPoints(SAMPLE_COUNT);
  const rawSamples: {
    point: THREE.Vector3;
    tangent: THREE.Vector3;
    right: THREE.Vector3;
    slopePitch: number;
    rawBank: number;
  }[] = [];
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const pt = spacedPts[i].clone();
    const prevPt = spacedPts[(i - 2 + SAMPLE_COUNT) % SAMPLE_COUNT];
    const nextPt = spacedPts[(i + 1) % SAMPLE_COUNT];
    const aheadPt = spacedPts[(i + 2) % SAMPLE_COUNT];

    const dir3D = new THREE.Vector3().subVectors(nextPt, pt);
    const horizLen = Math.hypot(dir3D.x, dir3D.z) || 1;
    const slopePitch = Math.atan2(dir3D.y, horizLen);
    const tangent = new THREE.Vector3(dir3D.x, 0, dir3D.z).normalize();
    const right = new THREE.Vector3().crossVectors(tangent, up).normalize();

    const tPrev = new THREE.Vector2(pt.x - prevPt.x, pt.z - prevPt.z).normalize();
    const tNext = new THREE.Vector2(aheadPt.x - pt.x, aheadPt.z - pt.z).normalize();
    const cross2d = tPrev.x * tNext.y - tPrev.y * tNext.x;
    const rawBank = THREE.MathUtils.clamp(-cross2d * 0.9, -0.055, 0.055);

    rawSamples.push({ point: pt, tangent, right, slopePitch, rawBank });
  }

  const samples: TrackSample[] = [];
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    let bankSum = 0;
    for (let k = -4; k <= 4; k++) {
      bankSum += rawSamples[(i + k + SAMPLE_COUNT) % SAMPLE_COUNT].rawBank;
    }
    samples.push({
      point: rawSamples[i].point,
      tangent: rawSamples[i].tangent,
      right: rawSamples[i].right,
      slopePitch: rawSamples[i].slopePitch,
      bankAngle: bankSum / 9,
      progress: i / SAMPLE_COUNT,
      index: i,
    });
  }

  const minimapPath: { x: number; z: number }[] = [];
  for (let i = 0; i < SAMPLE_COUNT; i += 6) {
    minimapPath.push({ x: samples[i].point.x, z: samples[i].point.z });
  }

  // Build real driveable Shortcut corridors BEFORE barriers so we punch clean wall openings!
  const shortcutDefs = getShortcutDefs(trackId);
  const shortcuts: TrackShortcut[] = [];
  const leftBarrierCutout = new Uint8Array(SAMPLE_COUNT);
  const rightBarrierCutout = new Uint8Array(SAMPLE_COUNT);

  const shortcutRoadTex = track(createCurbTexture(maxAnisotropy));
  const shortcutRoadMat = track(
    new THREE.MeshStandardMaterial({
      color: '#2A303C',
      roughness: environment === 'overcast_rain' ? 0.25 : 0.72,
      metalness: environment === 'overcast_rain' ? 0.35 : 0.14,
      side: THREE.DoubleSide,
    }),
  );
  const shortcutCurbMat = track(
    new THREE.MeshStandardMaterial({
      map: shortcutRoadTex,
      roughness: 0.75,
    }),
  );
  const gatePlankMat = track(
    new THREE.MeshStandardMaterial({
      color: '#F59E0B',
      emissive: new THREE.Color('#D97706'),
      emissiveIntensity: 0.65,
      roughness: 0.4,
    }),
  );
  const shortcutGlowMat = track(
    new THREE.MeshStandardMaterial({
      color: '#10B981',
      emissive: new THREE.Color('#10B981'),
      emissiveIntensity: 2.2,
    }),
  );

  shortcutDefs.forEach((def, scId) => {
    const startIdx = Math.floor(SAMPLE_COUNT * def.startProg) % SAMPLE_COUNT;
    const endIdx = Math.floor(SAMPLE_COUNT * def.endProg) % SAMPLE_COUNT;
    const sA = samples[startIdx];
    const sB = samples[endIdx];

    // Mark open barrier gaps (+/- 2 indices) on main track
    for (let k = -2; k <= 2; k++) {
      const idxA = (startIdx + k + SAMPLE_COUNT) % SAMPLE_COUNT;
      const idxB = (endIdx + k + SAMPLE_COUNT) % SAMPLE_COUNT;
      if (def.side < 0) {
        leftBarrierCutout[idxA] = 1;
        leftBarrierCutout[idxB] = 1;
      } else {
        rightBarrierCutout[idxA] = 1;
        rightBarrierCutout[idxB] = 1;
      }
    }

    const entryPos = sA.point.clone().addScaledVector(sA.right, def.side * BARRIER_HALF_WIDTH);
    entryPos.y += def.side * BARRIER_HALF_WIDTH * Math.sin(sA.bankAngle);
    const exitPos = sB.point.clone().addScaledVector(sB.right, def.side * BARRIER_HALF_WIDTH);
    exitPos.y += def.side * BARRIER_HALF_WIDTH * Math.sin(sB.bankAngle);

    // Lead-in and lead-out points angled smoothly off the highway
    const pLeadIn = entryPos
      .clone()
      .addScaledVector(sA.tangent, 18)
      .addScaledVector(sA.right, def.side * 12);
    const midIdx = (startIdx + Math.floor(((endIdx - startIdx + SAMPLE_COUNT) % SAMPLE_COUNT) * 0.5)) % SAMPLE_COUNT;
    const midTrackPt = samples[midIdx].point;
    const chordMid = new THREE.Vector3().addVectors(entryPos, exitPos).multiplyScalar(0.5);
    const pMid = chordMid.clone().lerp(midTrackPt, def.pullFactor * 0.35);
    pMid.y = (entryPos.y + exitPos.y) * 0.5;
    const pLeadOut = exitPos
      .clone()
      .addScaledVector(sB.tangent, -18)
      .addScaledVector(sB.right, def.side * 12);

    const scCurve = new THREE.CatmullRomCurve3(
      [entryPos, pLeadIn, pMid, pLeadOut, exitPos],
      false,
      'catmullrom',
      0.45,
    );
    const scSegs = 40;
    const scPts = scCurve.getSpacedPoints(scSegs);
    const scTangents: THREE.Vector3[] = [];
    const scHalfW = 5.4;

    const scVerts: number[] = [];
    const scIndices: number[] = [];
    const scWallVerts: number[] = [];
    const scWallIndices: number[] = [];

    for (let j = 0; j <= scSegs; j++) {
      const pt = scPts[j];
      const nextPt = scPts[Math.min(scSegs, j + 1)];
      const prevPt = scPts[Math.max(0, j - 1)];
      const tan = new THREE.Vector3().subVectors(nextPt, prevPt);
      tan.y = 0;
      tan.normalize();
      scTangents.push(tan);
      const rgt = new THREE.Vector3().crossVectors(tan, up).normalize();

      const lx = pt.x - rgt.x * scHalfW;
      const lz = pt.z - rgt.z * scHalfW;
      const rx = pt.x + rgt.x * scHalfW;
      const rz = pt.z + rgt.z * scHalfW;
      const y = pt.y + 0.05;

      scVerts.push(lx, y, lz, rx, y, rz);
      scWallVerts.push(lx, y - 0.5, lz, lx, y + 0.75, lz, rx, y - 0.5, rz, rx, y + 0.75, rz);

      if (j < scSegs) {
        const b = j * 2;
        scIndices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
        const wb = j * 4;
        scWallIndices.push(wb, wb + 1, wb + 4, wb + 1, wb + 5, wb + 4);
        scWallIndices.push(wb + 2, wb + 6, wb + 3, wb + 3, wb + 6, wb + 7);
      }
    }

    const scGeo = track(new THREE.BufferGeometry());
    scGeo.setAttribute('position', new THREE.Float32BufferAttribute(scVerts, 3));
    scGeo.setIndex(scIndices);
    scGeo.computeVertexNormals();
    const scMesh = new THREE.Mesh(scGeo, shortcutRoadMat);
    scMesh.receiveShadow = true;
    group.add(scMesh);

    const scWallGeo = track(new THREE.BufferGeometry());
    scWallGeo.setAttribute('position', new THREE.Float32BufferAttribute(scWallVerts, 3));
    scWallGeo.setIndex(scWallIndices);
    scWallGeo.computeVertexNormals();
    group.add(new THREE.Mesh(scWallGeo, shortcutCurbMat));

    // Entry & Exit Breakable Warning Gates + Emerald Shortcut Beacons
    [
      { pt: entryPos, s: sA },
      { pt: exitPos, s: sB },
    ].forEach((endSpec, endIdxFlag) => {
      const gateG = new THREE.Group();
      gateG.position.copy(endSpec.pt);
      gateG.rotation.y = Math.atan2(-endSpec.s.tangent.x, -endSpec.s.tangent.z);

      const postGeo = track(new THREE.BoxGeometry(0.45, 4.6, 0.45));
      const post1 = new THREE.Mesh(postGeo, shortcutCurbMat);
      post1.position.set(0, 2.3, -5.2);
      const post2 = new THREE.Mesh(postGeo, shortcutCurbMat);
      post2.position.set(0, 2.3, 5.2);

      const beaconBar = new THREE.Mesh(track(new THREE.BoxGeometry(0.42, 0.48, 10.8)), shortcutGlowMat);
      beaconBar.position.set(0, 4.5, 0);

      // Low breakable chevron planks (pure visual hazard indicator)
      const plank1 = new THREE.Mesh(track(new THREE.BoxGeometry(0.28, 0.42, 9.2)), gatePlankMat);
      plank1.position.set(0, 0.72, 0);
      gateG.add(post1, post2, beaconBar, plank1);
      if (endIdxFlag === 0) {
        const plank2 = new THREE.Mesh(track(new THREE.BoxGeometry(0.28, 0.35, 9.2)), gatePlankMat);
        plank2.position.set(0, 1.32, 0);
        gateG.add(plank2);
      }
      group.add(gateG);
    });

    const minimapPoints: { x: number; z: number }[] = [];
    for (let j = 0; j <= scSegs; j += 4) {
      minimapPoints.push({ x: scPts[j].x, z: scPts[j].z });
    }

    shortcuts.push({
      id: scId,
      label: def.label,
      startIdx,
      endIdx,
      side: def.side,
      halfWidth: scHalfW,
      points: scPts,
      tangents: scTangents,
      entryPos,
      exitPos,
      minimapPoints,
    });
  });

  const getNearestTrackDistance = (wx: number, wz: number): { dist: number; nearestY: number } => {
    let minSq = Infinity;
    let nearestY = 0;
    for (let i = 0; i < SAMPLE_COUNT; i += 2) {
      const p = samples[i].point;
      const dx = wx - p.x;
      const dz = wz - p.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < minSq) {
        minSq = dSq;
        nearestY = p.y;
      }
    }
    return { dist: Math.sqrt(minSq), nearestY };
  };

  const hasHarborBay =
    trackId === 'rockport_loop' || trackId === 'camden_coast' || trackId === 'gray_point_bay';
  const isCanyonOrSummit = trackId === 'rosewood_canyon' || trackId === 'blackridge_summit';
  const isForestTrack = trackId === 'heritage_forest' || trackId === 'rosewood_park';

  const sampleTerrainInfo = (wx: number, wz: number): { height: number; distToTrack: number } => {
    const { dist, nearestY } = getNearestTrackDistance(wx, wz);

    // Check proximity to shortcuts as well so terrain stays cleanly recessed beneath shortcut ribbons
    let nearShortcut = false;
    for (let sc = 0; sc < shortcuts.length; sc++) {
      const pts = shortcuts[sc].points;
      for (let j = 0; j < pts.length; j += 3) {
        const dx = wx - pts[j].x;
        const dz = wz - pts[j].z;
        if (dx * dx + dz * dz < 16 * 16) {
          nearShortcut = true;
          break;
        }
      }
      if (nearShortcut) break;
    }

    const safeRoadFloor = Math.min(-2.1, nearestY - 2.35);
    if (dist < BARRIER_HALF_WIDTH + 30 || nearShortcut) {
      return { height: safeRoadFloor, distToTrack: dist };
    }

    const blend = THREE.MathUtils.smoothstep(dist, BARRIER_HALF_WIDTH + 30, BARRIER_HALF_WIDTH + 110);
    const isHarborWater = hasHarborBay && wz < -430 && wx > -30 && wx < 1100;

    const ridgeScale =
      isCanyonOrSummit
        ? 1.75
        : trackId === 'silverton_pass'
          ? 1.28
          : trackId === 'camden_coast' || trackId === 'gray_point_bay'
            ? 1.12
            : 0.92;
    const rawHill =
      (Math.sin(wx * 0.0044) * Math.cos(wz * 0.0038) * 19 +
        Math.sin(wx * 0.011 + wz * 0.0072) * 8.5 +
        Math.cos(wx * 0.0022 + wz * 0.0026) * 14 +
        15) *
      ridgeScale;

    const targetHill = isHarborWater ? -6.2 : Math.max(-0.5, rawHill);
    return {
      height: THREE.MathUtils.lerp(safeRoadFloor, targetHill, blend),
      distToTrack: dist,
    };
  };

  // --- 1. Environment-Adapted Terrain + Harbor Bay ---
  const terrainCenterX = 460;
  const terrainCenterZ = 40;
  const groundTex = track(createGroundTerrainTexture(maxAnisotropy));

  const groundGeo = track(new THREE.PlaneGeometry(2650, 2750, 145, 160));
  groundGeo.rotateX(-Math.PI / 2);

  const posAttr = groundGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);

  const envTint =
    environment === 'midnight_neon'
      ? { low: '#0C121D', mid: '#141D2B', high: '#1E293B', skirt: '#090D16' }
      : environment === 'overcast_rain'
        ? { low: '#1E272E', mid: '#2E3B42', high: '#435058', skirt: '#161C22' }
        : environment === 'dawn_mist'
          ? { low: '#1E332B', mid: '#2D4B3E', high: '#486856', skirt: '#172620' }
          : environment === 'crimson_foundry'
            ? { low: '#26181A', mid: '#452522', high: '#63372C', skirt: '#1B1112' }
            : environment === 'noon_clear'
              ? { low: isCanyonOrSummit ? '#63472A' : '#2C4A2B', mid: isCanyonOrSummit ? '#9D6838' : '#3E6B38', high: isCanyonOrSummit ? '#CA8A4B' : '#588149', skirt: '#243522' }
              : {
                  low: isCanyonOrSummit ? '#4E3922' : isForestTrack ? '#233629' : '#2A333E',
                  mid: isCanyonOrSummit ? '#8E582C' : isForestTrack ? '#35503B' : '#4E4B41',
                  high: isCanyonOrSummit ? '#C27430' : isForestTrack ? '#56754E' : '#6D5D48',
                  skirt: '#241E18',
                };

  const lowColor = new THREE.Color(envTint.low);
  const midColor = new THREE.Color(envTint.mid);
  const highColor = new THREE.Color(envTint.high);
  const tempCol = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const wx = posAttr.getX(i) + terrainCenterX;
    const wz = posAttr.getZ(i) + terrainCenterZ;
    const tInfo = sampleTerrainInfo(wx, wz);
    posAttr.setY(i, tInfo.height);

    const hNorm = THREE.MathUtils.clamp((tInfo.height + 2) / 38, 0, 1);
    if (hNorm < 0.45) {
      tempCol.copy(lowColor).lerp(midColor, hNorm / 0.45);
    } else {
      tempCol.copy(midColor).lerp(highColor, (hNorm - 0.45) / 0.55);
    }
    colors[i * 3] = tempCol.r;
    colors[i * 3 + 1] = tempCol.g;
    colors[i * 3 + 2] = tempCol.b;
  }
  groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  groundGeo.computeVertexNormals();

  const groundMat = track(
    new THREE.MeshStandardMaterial({
      map: groundTex,
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.03,
    }),
  );
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.position.set(terrainCenterX, 0, terrainCenterZ);
  groundMesh.receiveShadow = true;
  group.add(groundMesh);

  const skirtGeo = track(new THREE.PlaneGeometry(6600, 6600));
  skirtGeo.rotateX(-Math.PI / 2);
  const skirtMat = track(new THREE.MeshStandardMaterial({ color: envTint.skirt, roughness: 0.96 }));
  const skirtMesh = new THREE.Mesh(skirtGeo, skirtMat);
  skirtMesh.position.set(terrainCenterX, -15, terrainCenterZ);
  group.add(skirtMesh);

  if (hasHarborBay) {
    const waterGeo = track(new THREE.PlaneGeometry(2100, 960));
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = track(
      new THREE.MeshStandardMaterial({
        color: environment === 'midnight_neon' ? '#071B30' : environment === 'noon_clear' ? '#0E5A8A' : '#0C2F4C',
        roughness: 0.09,
        metalness: 0.90,
      }),
    );
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.set(500, -2.8, -860);
    group.add(water);
  }

  // --- 2. 4-Lane Banked Highway Ribbon + Curbs + Jersey Barriers (with Shortcut openings!) ---
  const roadVerts: number[] = [];
  const roadUvs: number[] = [];
  const roadIndices: number[] = [];

  const curbVerts: number[] = [];
  const curbUvs: number[] = [];
  const curbIndices: number[] = [];

  const barrierVerts: number[] = [];
  const barrierNormals: number[] = [];
  const barrierUvs: number[] = [];
  const barrierIndices: number[] = [];

  const capVerts: number[] = [];
  const capIndices: number[] = [];

  const deckVerts: number[] = [];
  const deckIndices: number[] = [];

  const isWet = environment === 'overcast_rain' || environment === 'midnight_neon';
  const roadTex = track(createAsphaltTexture(maxAnisotropy));
  const roadNormalTex = track(createAsphaltNormalTexture(maxAnisotropy));
  const roadRoughTex = track(
    isWet ? createWetAsphaltRoughnessTexture(maxAnisotropy) : createAsphaltRoughnessTexture(maxAnisotropy),
  );
  const barrierTex = track(createBarrierTexture(maxAnisotropy));
  const uvStep = totalLength / SAMPLE_COUNT / 14;

  for (let i = 0; i <= SAMPLE_COUNT; i++) {
    const sIdx = i % SAMPLE_COUNT;
    const s = samples[sIdx];
    const vCoord = i * uvStep;
    const bankSlope = Math.sin(s.bankAngle);

    const yRoadL = s.point.y + 0.04 - ROAD_HALF_WIDTH * bankSlope;
    const yRoadR = s.point.y + 0.04 + ROAD_HALF_WIDTH * bankSlope;
    const yCurbOutL = s.point.y + 0.048 - BARRIER_HALF_WIDTH * bankSlope;
    const yCurbOutR = s.point.y + 0.048 + BARRIER_HALF_WIDTH * bankSlope;

    const lx = s.point.x - s.right.x * ROAD_HALF_WIDTH;
    const lz = s.point.z - s.right.z * ROAD_HALF_WIDTH;
    const rx = s.point.x + s.right.x * ROAD_HALF_WIDTH;
    const rz = s.point.z + s.right.z * ROAD_HALF_WIDTH;

    roadVerts.push(lx, yRoadL, lz, rx, yRoadR, rz);
    roadUvs.push(0, vCoord, 1, vCoord);

    if (i < SAMPLE_COUNT) {
      const base = i * 2;
      roadIndices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }

    const clOutX = s.point.x - s.right.x * BARRIER_HALF_WIDTH;
    const clOutZ = s.point.z - s.right.z * BARRIER_HALF_WIDTH;
    const crOutX = s.point.x + s.right.x * BARRIER_HALF_WIDTH;
    const crOutZ = s.point.z + s.right.z * BARRIER_HALF_WIDTH;

    curbVerts.push(
      clOutX, yCurbOutL, clOutZ,
      lx, yRoadL + 0.008, lz,
      rx, yRoadR + 0.008, rz,
      crOutX, yCurbOutR, crOutZ,
    );
    curbUvs.push(0, vCoord * 2, 1, vCoord * 2, 0, vCoord * 2, 1, vCoord * 2);

    if (i < SAMPLE_COUNT) {
      const cBase = i * 4;
      curbIndices.push(cBase, cBase + 1, cBase + 4, cBase + 1, cBase + 5, cBase + 4);
      curbIndices.push(cBase + 2, cBase + 3, cBase + 6, cBase + 3, cBase + 7, cBase + 6);
    }

    const wallHL = yCurbOutL + 1.12;
    const wallHR = yCurbOutR + 1.12;
    const wallBotL = yCurbOutL - 1.8;
    const wallBotR = yCurbOutR - 1.8;

    barrierVerts.push(
      clOutX, wallBotL, clOutZ,
      clOutX, wallHL, clOutZ,
      crOutX, wallBotR, crOutZ,
      crOutX, wallHR, crOutZ,
    );
    barrierNormals.push(
      s.right.x, 0, s.right.z,
      s.right.x, 0, s.right.z,
      -s.right.x, 0, -s.right.z,
      -s.right.x, 0, -s.right.z,
    );
    barrierUvs.push(vCoord * 1.5, 0, vCoord * 1.5, 1, vCoord * 1.5, 0, vCoord * 1.5, 1);

    const nextIdx = (i + 1) % SAMPLE_COUNT;
    const skipLeftBarrier = leftBarrierCutout[sIdx] === 1 && leftBarrierCutout[nextIdx] === 1;
    const skipRightBarrier = rightBarrierCutout[sIdx] === 1 && rightBarrierCutout[nextIdx] === 1;

    if (i < SAMPLE_COUNT) {
      const bBase = i * 4;
      if (!skipLeftBarrier) {
        barrierIndices.push(bBase, bBase + 1, bBase + 4, bBase + 1, bBase + 5, bBase + 4);
      }
      if (!skipRightBarrier) {
        barrierIndices.push(bBase + 2, bBase + 6, bBase + 3, bBase + 3, bBase + 6, bBase + 7);
      }
    }

    const capW = BARRIER_HALF_WIDTH + 0.65;
    const capLX = s.point.x - s.right.x * capW;
    const capLZ = s.point.z - s.right.z * capW;
    const capRX = s.point.x + s.right.x * capW;
    const capRZ = s.point.z + s.right.z * capW;

    capVerts.push(
      capLX, wallHL, capLZ,
      clOutX, wallHL, clOutZ,
      crOutX, wallHR, crOutZ,
      capRX, wallHR, capRZ,
    );
    if (i < SAMPLE_COUNT) {
      const kBase = i * 4;
      if (!skipLeftBarrier) {
        capIndices.push(kBase, kBase + 1, kBase + 4, kBase + 1, kBase + 5, kBase + 4);
      }
      if (!skipRightBarrier) {
        capIndices.push(kBase + 2, kBase + 3, kBase + 6, kBase + 3, kBase + 7, kBase + 6);
      }
    }

    const deckBotL = wallBotL - 0.8;
    const deckBotR = wallBotR - 0.8;
    const deckOuter = BARRIER_HALF_WIDTH + 2.4;
    const dLX = s.point.x - s.right.x * deckOuter;
    const dLZ = s.point.z - s.right.z * deckOuter;
    const dRX = s.point.x + s.right.x * deckOuter;
    const dRZ = s.point.z + s.right.z * deckOuter;

    deckVerts.push(
      capLX, wallHL, capLZ,
      dLX, deckBotL, dLZ,
      capRX, wallHR, capRZ,
      dRX, deckBotR, dRZ,
    );
    if (i < SAMPLE_COUNT) {
      const dBase = i * 4;
      if (!skipLeftBarrier) {
        deckIndices.push(dBase, dBase + 4, dBase + 1, dBase + 1, dBase + 4, dBase + 5);
      }
      if (!skipRightBarrier) {
        deckIndices.push(dBase + 2, dBase + 3, dBase + 6, dBase + 3, dBase + 7, dBase + 6);
      }
    }
  }

  const roadGeo = track(new THREE.BufferGeometry());
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadVerts, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUvs, 2));
  roadGeo.setIndex(roadIndices);
  roadGeo.computeVertexNormals();
  const roadMat = track(
    new THREE.MeshStandardMaterial({
      map: roadTex,
      normalMap: roadNormalTex,
      normalScale: new THREE.Vector2(isWet ? 0.18 : 0.28, isWet ? 0.18 : 0.28),
      roughnessMap: roadRoughTex,
      roughness: environment === 'overcast_rain' ? 0.32 : environment === 'midnight_neon' ? 0.44 : 0.78,
      metalness: environment === 'overcast_rain' ? 0.42 : environment === 'midnight_neon' ? 0.28 : 0.14,
    }),
  );
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  const curbTex = track(createCurbTexture(maxAnisotropy));
  const curbGeo = track(new THREE.BufferGeometry());
  curbGeo.setAttribute('position', new THREE.Float32BufferAttribute(curbVerts, 3));
  curbGeo.setAttribute('uv', new THREE.Float32BufferAttribute(curbUvs, 2));
  curbGeo.setIndex(curbIndices);
  curbGeo.computeVertexNormals();
  const curbMat = track(new THREE.MeshStandardMaterial({ map: curbTex, roughness: 0.78, metalness: 0.1 }));
  const curbMesh = new THREE.Mesh(curbGeo, curbMat);
  curbMesh.receiveShadow = true;
  group.add(curbMesh);

  const barrierGeo = track(new THREE.BufferGeometry());
  barrierGeo.setAttribute('position', new THREE.Float32BufferAttribute(barrierVerts, 3));
  barrierGeo.setAttribute('normal', new THREE.Float32BufferAttribute(barrierNormals, 3));
  barrierGeo.setAttribute('uv', new THREE.Float32BufferAttribute(barrierUvs, 2));
  barrierGeo.setIndex(barrierIndices);
  const barrierMat = track(
    new THREE.MeshStandardMaterial({
      map: barrierTex,
      roughness: 0.72,
      metalness: 0.2,
      side: THREE.DoubleSide,
    }),
  );
  const barrierMesh = new THREE.Mesh(barrierGeo, barrierMat);
  barrierMesh.receiveShadow = true;
  group.add(barrierMesh);

  const concreteStructMat = track(
    new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.86, metalness: 0.12, side: THREE.DoubleSide }),
  );
  const capGeo = track(new THREE.BufferGeometry());
  capGeo.setAttribute('position', new THREE.Float32BufferAttribute(capVerts, 3));
  capGeo.setIndex(capIndices);
  capGeo.computeVertexNormals();
  group.add(new THREE.Mesh(capGeo, concreteStructMat));

  const deckGeo = track(new THREE.BufferGeometry());
  deckGeo.setAttribute('position', new THREE.Float32BufferAttribute(deckVerts, 3));
  deckGeo.setIndex(deckIndices);
  deckGeo.computeVertexNormals();
  group.add(new THREE.Mesh(deckGeo, concreteStructMat));

  // Reflective Highway Cat-Eye Studs
  const studCount = Math.floor(SAMPLE_COUNT / 4);
  const studGeo = track(new THREE.BoxGeometry(0.22, 0.06, 0.35));
  const studMat = track(
    new THREE.MeshStandardMaterial({
      color: '#FDE68A',
      emissive: new THREE.Color('#F59E0B'),
      emissiveIntensity: environment === 'midnight_neon' ? 3.2 : 2.0,
    }),
  );
  const studsInst = new THREE.InstancedMesh(studGeo, studMat, studCount * 2);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < studCount; i++) {
    const s = samples[(i * 4) % SAMPLE_COUNT];
    const yaw = Math.atan2(-s.tangent.x, -s.tangent.z);
    const bankSlope = Math.sin(s.bankAngle);
    [-0.35, 0.35].forEach((lat, sideIdx) => {
      dummy.position.set(
        s.point.x + s.right.x * lat,
        s.point.y + 0.06 + lat * bankSlope,
        s.point.z + s.right.z * lat,
      );
      dummy.rotation.set(s.slopePitch, yaw, -s.bankAngle, 'YXZ');
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      studsInst.setMatrixAt(i * 2 + sideIdx, dummy.matrix);
    });
  }
  studsInst.instanceMatrix.needsUpdate = true;
  studsInst.computeBoundingSphere();
  group.add(studsInst);

  // Viaduct Support Columns
  const pierGeo = track(new THREE.BoxGeometry(3.4, 1, 3.4));
  const pierSamples = samples.filter((_, idx) => idx % 14 === 0 && samples[idx].point.y > 1.8);
  if (pierSamples.length > 0) {
    const piers = new THREE.InstancedMesh(pierGeo, concreteStructMat, pierSamples.length * 2);
    let pIdx = 0;
    pierSamples.forEach((s) => {
      [-9.8, 9.8].forEach((lat) => {
        const colH = s.point.y + 7.2;
        dummy.position.set(s.point.x + s.right.x * lat, s.point.y - colH * 0.5 - 1.4, s.point.z + s.right.z * lat);
        dummy.rotation.set(0, Math.atan2(-s.tangent.x, -s.tangent.z), 0);
        dummy.scale.set(1, colH, 1);
        dummy.updateMatrix();
        piers.setMatrixAt(pIdx++, dummy.matrix);
      });
    });
    piers.instanceMatrix.needsUpdate = true;
    piers.computeBoundingSphere();
    group.add(piers);
  }

  // --- 3. Extruded Highway Tunnel(s) ---
  const steelMat = track(new THREE.MeshStandardMaterial({ color: '#1E293B', metalness: 0.78, roughness: 0.3 }));
  const tunnelWallMat = track(
    new THREE.MeshStandardMaterial({ color: '#14171F', roughness: 0.85, metalness: 0.14, side: THREE.DoubleSide }),
  );
  const sodiumLightMat = track(
    new THREE.MeshStandardMaterial({
      color: '#FEF3C7',
      emissive: new THREE.Color('#F59E0B'),
      emissiveIntensity: 3.1,
    }),
  );

  const tunnelConfigs =
    trackId === 'rockport_loop'
      ? [{ startIdx: Math.floor(SAMPLE_COUNT * 0.48), len: 32 }]
      : trackId === 'silverton_pass' || trackId === 'blackridge_summit'
        ? [
            { startIdx: Math.floor(SAMPLE_COUNT * 0.04), len: 26 },
            { startIdx: Math.floor(SAMPLE_COUNT * 0.52), len: 30 },
          ]
        : trackId === 'hwy99_speedway'
          ? [
              { startIdx: Math.floor(SAMPLE_COUNT * 0.05), len: 34 },
              { startIdx: Math.floor(SAMPLE_COUNT * 0.56), len: 32 },
            ]
          : [{ startIdx: Math.floor(SAMPLE_COUNT * 0.03), len: 30 }];

  const tunStripGeo = track(new THREE.BoxGeometry(7.2, 0.24, 3.0));
  const tunSpanW = BARRIER_HALF_WIDTH + 0.4;
  const tunInnerRoofW = BARRIER_HALF_WIDTH - 2.3;
  const tunH = 8.2;

  const isInsideAnyTunnel = (idx: number): boolean =>
    tunnelConfigs.some((tc) => idx >= tc.startIdx - 2 && idx <= tc.startIdx + tc.len + 2);

  tunnelConfigs.forEach((tc) => {
    const tunVerts: number[] = [];
    const tunIndices: number[] = [];
    const bulbIndices: number[] = [];

    for (let k = 0; k <= tc.len; k++) {
      const s = samples[(tc.startIdx + k) % SAMPLE_COUNT];
      const baseY = s.point.y;
      const p0x = s.point.x - s.right.x * tunSpanW;
      const p0z = s.point.z - s.right.z * tunSpanW;
      const p2x = s.point.x - s.right.x * tunInnerRoofW;
      const p2z = s.point.z - s.right.z * tunInnerRoofW;
      const p3x = s.point.x + s.right.x * tunInnerRoofW;
      const p3z = s.point.z + s.right.z * tunInnerRoofW;
      const p4x = s.point.x + s.right.x * tunSpanW;
      const p4z = s.point.z + s.right.z * tunSpanW;

      tunVerts.push(
        p0x, baseY - 0.6, p0z,
        p0x, baseY + tunH - 2.0, p0z,
        p2x, baseY + tunH, p2z,
        p3x, baseY + tunH, p3z,
        p4x, baseY + tunH - 2.0, p4z,
        p4x, baseY - 0.6, p4z,
      );

      if (k < tc.len) {
        const r0 = k * 6;
        const r1 = (k + 1) * 6;
        for (let seg = 0; seg < 5; seg++) {
          tunIndices.push(r0 + seg, r0 + seg + 1, r1 + seg, r0 + seg + 1, r1 + seg + 1, r1 + seg);
        }
      }
      if (k >= 2 && k < tc.len - 1 && k % 4 === 0) {
        bulbIndices.push((tc.startIdx + k) % SAMPLE_COUNT);
      }
    }

    const tunGeo = track(new THREE.BufferGeometry());
    tunGeo.setAttribute('position', new THREE.Float32BufferAttribute(tunVerts, 3));
    tunGeo.setIndex(tunIndices);
    tunGeo.computeVertexNormals();
    group.add(new THREE.Mesh(tunGeo, tunnelWallMat));

    if (bulbIndices.length > 0) {
      const bulbsInst = new THREE.InstancedMesh(tunStripGeo, sodiumLightMat, bulbIndices.length);
      const sideStripGeo = track(new THREE.BoxGeometry(0.18, 0.22, 3.6));
      const sideStripsInst = new THREE.InstancedMesh(sideStripGeo, sodiumLightMat, bulbIndices.length * 2);
      for (let bi = 0; bi < bulbIndices.length; bi++) {
        const s = samples[bulbIndices[bi]];
        const yaw = Math.atan2(-s.tangent.x, -s.tangent.z);
        dummy.position.set(s.point.x, s.point.y + tunH - 0.25, s.point.z);
        dummy.rotation.set(s.slopePitch, yaw, 0, 'YXZ');
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        bulbsInst.setMatrixAt(bi, dummy.matrix);

        [-1, 1].forEach((side, sIdx) => {
          dummy.position.set(
            s.point.x + s.right.x * side * (tunSpanW - 0.15),
            s.point.y + 1.8,
            s.point.z + s.right.z * side * (tunSpanW - 0.15),
          );
          dummy.updateMatrix();
          sideStripsInst.setMatrixAt(bi * 2 + sIdx, dummy.matrix);
        });
      }
      bulbsInst.instanceMatrix.needsUpdate = true;
      bulbsInst.computeBoundingSphere();
      sideStripsInst.instanceMatrix.needsUpdate = true;
      sideStripsInst.computeBoundingSphere();
      group.add(bulbsInst, sideStripsInst);
    }
  });

  // --- 4. Track-Specific Iconic Landmarks ---
  if (hasHarborBay) {
    const towerSamples = [samples[Math.floor(SAMPLE_COUNT * 0.22)], samples[Math.floor(SAMPLE_COUNT * 0.31)]];
    const towerLegGeo = track(new THREE.BoxGeometry(2.2, 50, 2.2));
    const crossBarGeo = track(new THREE.BoxGeometry(BARRIER_HALF_WIDTH * 2 + 4.8, 2.0, 2.0));
    const beaconGeo = track(new THREE.SphereGeometry(0.9, 8, 8));
    const beaconMat = track(
      new THREE.MeshStandardMaterial({ color: '#EF4444', emissive: new THREE.Color('#EF4444'), emissiveIntensity: 3.6 }),
    );
    const cableMat = track(new THREE.LineBasicMaterial({ color: '#E2E8F0' }));
    const cablePts: number[] = [];

    towerSamples.forEach((s) => {
      const tw = new THREE.Group();
      tw.position.set(s.point.x, s.point.y, s.point.z);
      tw.rotation.y = Math.atan2(-s.tangent.x, -s.tangent.z);
      const lL = new THREE.Mesh(towerLegGeo, steelMat);
      lL.position.set(-BARRIER_HALF_WIDTH - 1.4, 14, 0);
      const lR = new THREE.Mesh(towerLegGeo, steelMat);
      lR.position.set(BARRIER_HALF_WIDTH + 1.4, 14, 0);
      const cb1 = new THREE.Mesh(crossBarGeo, steelMat);
      cb1.position.set(0, 19, 0);
      const cb2 = new THREE.Mesh(crossBarGeo, steelMat);
      cb2.position.set(0, 34, 0);
      const bL = new THREE.Mesh(beaconGeo, beaconMat);
      bL.position.set(-BARRIER_HALF_WIDTH - 1.4, 39.5, 0);
      const bR = new THREE.Mesh(beaconGeo, beaconMat);
      bR.position.set(BARRIER_HALF_WIDTH + 1.4, 39.5, 0);
      tw.add(lL, lR, cb1, cb2, bL, bR);
      group.add(tw);

      [-1, 1].forEach((side) => {
        const topX = s.point.x + s.right.x * side * (BARRIER_HALF_WIDTH + 1.4);
        const topY = s.point.y + 37;
        const topZ = s.point.z + s.right.z * side * (BARRIER_HALF_WIDTH + 1.4);
        [-16, -11, -6, 6, 11, 16].forEach((dIdx) => {
          const ds = samples[(s.index + dIdx + SAMPLE_COUNT) % SAMPLE_COUNT];
          cablePts.push(
            topX,
            topY,
            topZ,
            ds.point.x + ds.right.x * side * BARRIER_HALF_WIDTH,
            ds.point.y + 1.2,
            ds.point.z + ds.right.z * side * BARRIER_HALF_WIDTH,
          );
        });
      });
    });

    const cableGeo = track(new THREE.BufferGeometry());
    cableGeo.setAttribute('position', new THREE.Float32BufferAttribute(cablePts, 3));
    group.add(new THREE.LineSegments(cableGeo, cableMat));

    const craneMat = track(new THREE.MeshStandardMaterial({ color: '#D97706', metalness: 0.6, roughness: 0.4 }));
    const craneLegGeo = track(new THREE.BoxGeometry(2.0, 44, 2.0));
    const craneBoomGeo = track(new THREE.BoxGeometry(3.2, 2.6, 36));
    [0, 1, 2].forEach((ci) => {
      const cg = new THREE.Group();
      cg.position.set(260 + ci * 135, -3, -580 - ci * 28);
      cg.rotation.y = 0.25;
      const leg1 = new THREE.Mesh(craneLegGeo, craneMat);
      leg1.position.set(-7, 22, 0);
      const leg2 = new THREE.Mesh(craneLegGeo, craneMat);
      leg2.position.set(7, 22, 0);
      const boom = new THREE.Mesh(craneBoomGeo, craneMat);
      boom.position.set(0, 40, -6);
      cg.add(leg1, leg2, boom);
      group.add(cg);
    });

    const hullMat = track(new THREE.MeshStandardMaterial({ color: '#1E293B', metalness: 0.5, roughness: 0.6 }));
    const containerMat = track(new THREE.MeshStandardMaterial({ color: '#B91C1C', roughness: 0.7 }));
    const ship = new THREE.Group();
    ship.position.set(580, -2.5, -940);
    ship.rotation.y = 0.18;
    const hull = new THREE.Mesh(track(new THREE.BoxGeometry(115, 11, 24)), hullMat);
    hull.position.y = 4.5;
    const bridge = new THREE.Mesh(track(new THREE.BoxGeometry(14, 18, 20)), track(new THREE.MeshStandardMaterial({ color: '#E2E8F0', roughness: 0.6 })));
    bridge.position.set(-42, 16, 0);
    const cargo = new THREE.Mesh(track(new THREE.BoxGeometry(68, 9, 18)), containerMat);
    cargo.position.set(8, 12, 0);
    ship.add(hull, bridge, cargo);
    group.add(ship);
  }

  if (trackId === 'camden_coast' || trackId === 'gray_point_bay') {
    const lhMat = track(new THREE.MeshStandardMaterial({ color: '#E2E8F0', roughness: 0.6 }));
    const lhStripeMat = track(new THREE.MeshStandardMaterial({ color: '#DC2626', roughness: 0.55 }));
    const lhBaseY = sampleTerrainInfo(945, -520).height;
    const lhGroup = new THREE.Group();
    lhGroup.position.set(945, lhBaseY - 1, -520);
    const lhBody = new THREE.Mesh(track(new THREE.CylinderGeometry(3.2, 5.2, 42, 14)), lhMat);
    lhBody.position.y = 21;
    const lhBand = new THREE.Mesh(track(new THREE.CylinderGeometry(3.9, 4.4, 10, 14)), lhStripeMat);
    lhBand.position.y = 24;
    const lhLantern = new THREE.Mesh(track(new THREE.CylinderGeometry(2.8, 2.8, 4.5, 12)), sodiumLightMat);
    lhLantern.position.y = 44.5;
    const lhCap = new THREE.Mesh(track(new THREE.ConeGeometry(3.6, 4.2, 12)), steelMat);
    lhCap.position.y = 48.8;
    lhGroup.add(lhBody, lhBand, lhLantern, lhCap);
    group.add(lhGroup);
  }

  if (trackId === 'silverton_pass') {
    const foundryMat = track(new THREE.MeshStandardMaterial({ color: '#3F3A36', roughness: 0.72, metalness: 0.45 }));
    const coolGeo = track(new THREE.CylinderGeometry(11, 16, 46, 16));
    const chimneyGeo = track(new THREE.CylinderGeometry(1.6, 2.9, 64, 12));
    const ringGlowMat = track(
      new THREE.MeshStandardMaterial({ color: '#FB923C', emissive: new THREE.Color('#EA580C'), emissiveIntensity: 3.4 }),
    );
    [0.14, 0.38, 0.72].forEach((prog, idx) => {
      const s = samples[Math.floor(SAMPLE_COUNT * prog)];
      const sx = s.point.x + s.right.x * (idx === 1 ? -46 : 44);
      const sz = s.point.z + s.right.z * (idx === 1 ? -46 : 44);
      const baseH = sampleTerrainInfo(sx, sz).height;
      const tower = new THREE.Mesh(coolGeo, foundryMat);
      tower.position.set(sx, baseH + 23, sz);
      const glowBand = new THREE.Mesh(track(new THREE.TorusGeometry(11.4, 0.45, 8, 24)), ringGlowMat);
      glowBand.rotation.x = Math.PI / 2;
      glowBand.position.set(sx, baseH + 45.5, sz);
      const stack = new THREE.Mesh(chimneyGeo, steelMat);
      stack.position.set(sx + 20, baseH + 32, sz + 12);
      group.add(tower, glowBand, stack);
    });
  }

  if (isCanyonOrSummit) {
    const timberMat = track(new THREE.MeshStandardMaterial({ color: '#5C3A21', roughness: 0.88, metalness: 0.08 }));
    [0.29, 0.67].forEach((prog) => {
      const s = samples[Math.floor(SAMPLE_COUNT * prog)];
      const archG = new THREE.Group();
      archG.position.copy(s.point);
      archG.rotation.y = Math.atan2(-s.tangent.x, -s.tangent.z);
      const sidePost = track(new THREE.BoxGeometry(1.1, 10.5, 1.1));
      const pL = new THREE.Mesh(sidePost, timberMat);
      pL.position.set(-BARRIER_HALF_WIDTH - 0.3, 5.2, 0);
      const pR = new THREE.Mesh(sidePost, timberMat);
      pR.position.set(BARRIER_HALF_WIDTH + 0.3, 5.2, 0);
      const topBeam = new THREE.Mesh(track(new THREE.BoxGeometry(BARRIER_HALF_WIDTH * 2 + 2.2, 1.3, 1.2)), timberMat);
      topBeam.position.set(0, 10.2, 0);
      archG.add(pL, pR, topBeam);
      group.add(archG);
    });
  }

  // --- 5. Start / Finish Steel Gantry ---
  const startSample = samples[0];
  const gantryGroup = new THREE.Group();
  gantryGroup.position.copy(startSample.point);
  gantryGroup.rotation.y = Math.atan2(-startSample.tangent.x, -startSample.tangent.z);

  const pillarGeo = track(new THREE.BoxGeometry(1.1, 9.0, 1.1));
  const pLeft = new THREE.Mesh(pillarGeo, steelMat);
  pLeft.position.set(-BARRIER_HALF_WIDTH - 0.3, 4.5, 0);
  const pRight = new THREE.Mesh(pillarGeo, steelMat);
  pRight.position.set(BARRIER_HALF_WIDTH + 0.3, 4.5, 0);

  const trussGeo = track(new THREE.BoxGeometry(BARRIER_HALF_WIDTH * 2 + 2.4, 2.4, 1.2));
  const bannerTex = track(createStartBannerTexture(maxAnisotropy));
  const bannerMat = track(
    new THREE.MeshStandardMaterial({
      map: bannerTex,
      roughness: 0.36,
      emissive: new THREE.Color('#F59E0B'),
      emissiveIntensity: 0.28,
    }),
  );
  const truss = new THREE.Mesh(trussGeo, [steelMat, steelMat, steelMat, steelMat, bannerMat, bannerMat]);
  truss.position.set(0, 8.1, 0);

  const startStripGeo = track(new THREE.PlaneGeometry(ROAD_HALF_WIDTH * 2, 3.2));
  startStripGeo.rotateX(-Math.PI / 2);
  const startStripMat = track(
    new THREE.MeshBasicMaterial({
      color: '#F59E0B',
      transparent: true,
      opacity: 0.88,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  const startStrip = new THREE.Mesh(startStripGeo, startStripMat);
  startStrip.position.set(0, 0.06, 0);
  gantryGroup.add(pLeft, pRight, truss, startStrip);
  group.add(gantryGroup);

  // --- 6. Overhead Interstate Highway Signs & Billboards ---
  const signSpecs = [
    { prog: 0.115, title: `ROUTE // ${trackId.replace('_', ' ').toUpperCase()}`, sub: 'RADAR & SHORTCUT SECTOR' },
    { prog: 0.44, title: 'ROCKPORT EXPRESSWAY', sub: 'PURSUIT INTERCEPT ZONE' },
    { prog: 0.87, title: 'FINISH SECTOR AHEAD', sub: 'MAINTAIN APEX SPEED' },
  ];
  const hwBeamGeo = track(new THREE.BoxGeometry(BARRIER_HALF_WIDTH * 2 + 2, 0.48, 0.48));
  const hwSignGeo = track(new THREE.BoxGeometry(10.8, 3.6, 0.32));

  signSpecs.forEach((sp) => {
    const s = samples[Math.floor(SAMPLE_COUNT * sp.prog)];
    const sg = new THREE.Group();
    sg.position.copy(s.point);
    sg.rotation.y = Math.atan2(-s.tangent.x, -s.tangent.z);

    const pL = new THREE.Mesh(pillarGeo, steelMat);
    pL.position.set(-BARRIER_HALF_WIDTH - 0.3, 4.5, 0);
    const pR = new THREE.Mesh(pillarGeo, steelMat);
    pR.position.set(BARRIER_HALF_WIDTH + 0.3, 4.5, 0);
    const beam = new THREE.Mesh(hwBeamGeo, steelMat);
    beam.position.set(0, 8.2, 0);

    const sTex = track(createHighwaySignTexture(sp.title, sp.sub, maxAnisotropy));
    const sMat = track(
      new THREE.MeshStandardMaterial({
        map: sTex,
        roughness: 0.4,
        emissive: new THREE.Color('#064E3B'),
        emissiveIntensity: 0.3,
      }),
    );
    const signBoard = new THREE.Mesh(hwSignGeo, [steelMat, steelMat, steelMat, steelMat, sMat, sMat]);
    signBoard.position.set(0, 7.5, 0);
    sg.add(pL, pR, beam, signBoard);
    group.add(sg);
  });

  const bbTex = track(createBillboardTexture(maxAnisotropy));
  const bbMat = track(
    new THREE.MeshStandardMaterial({
      map: bbTex,
      roughness: 0.4,
      emissive: new THREE.Color('#F59E0B'),
      emissiveIntensity: 0.2,
    }),
  );
  const bbGeo = track(new THREE.BoxGeometry(12.2, 5.4, 0.48));
  [Math.floor(SAMPLE_COUNT * 0.16), Math.floor(SAMPLE_COUNT * 0.62), Math.floor(SAMPLE_COUNT * 0.78)].forEach(
    (idx, i) => {
      const s = samples[idx];
      const side = i % 2 === 0 ? 1 : -1;
      const bb = new THREE.Group();
      bb.position.set(
        s.point.x + s.right.x * side * (BARRIER_HALF_WIDTH + 6.5),
        s.point.y,
        s.point.z + s.right.z * side * (BARRIER_HALF_WIDTH + 6.5),
      );
      bb.rotation.y = Math.atan2(-s.tangent.x, -s.tangent.z) + (side === 1 ? -0.35 : 0.35);
      const post = new THREE.Mesh(track(new THREE.CylinderGeometry(0.42, 0.52, 8.5, 10)), steelMat);
      post.position.y = 4.25;
      const sign = new THREE.Mesh(bbGeo, [steelMat, steelMat, steelMat, steelMat, bbMat, bbMat]);
      sign.position.y = 9.5;
      bb.add(post, sign);
      group.add(bb);
    },
  );

  // --- 7. Speed Traps ---
  const speedTraps: SpeedTrap[] = [];
  const trapIndices = [
    Math.floor(SAMPLE_COUNT * 0.13),
    Math.floor(SAMPLE_COUNT * 0.57),
    Math.floor(SAMPLE_COUNT * 0.81),
  ];
  const trapTargets = [165, 205, 185];
  const trapPostGeo = track(new THREE.BoxGeometry(0.42, 5.8, 0.42));
  const trapBarGeo = track(new THREE.BoxGeometry(BARRIER_HALF_WIDTH * 2, 0.45, 0.45));

  trapIndices.forEach((idx, i) => {
    const s = samples[idx];
    const trapG = new THREE.Group();
    trapG.position.copy(s.point);
    trapG.rotation.y = Math.atan2(-s.tangent.x, -s.tangent.z);

    const postL = new THREE.Mesh(trapPostGeo, steelMat);
    postL.position.set(-BARRIER_HALF_WIDTH, 2.9, 0);
    const postR = new THREE.Mesh(trapPostGeo, steelMat);
    postR.position.set(BARRIER_HALF_WIDTH, 2.9, 0);

    const flashMat = track(
      new THREE.MeshStandardMaterial({
        color: '#06B6D4',
        emissive: new THREE.Color('#06B6D4'),
        emissiveIntensity: 2.0,
      }),
    );
    const flashBar = new THREE.Mesh(trapBarGeo, flashMat);
    flashBar.position.set(0, 5.65, 0);
    trapG.add(postL, postR, flashBar);
    group.add(trapG);

    speedTraps.push({
      id: i,
      position: s.point.clone(),
      tangent: s.tangent.clone(),
      progress: s.progress,
      targetKmh: trapTargets[i],
      cooldownTimer: 0,
      flashMesh: flashBar,
    });
  });

  // --- 8. Tollbooth Checkpoint Arches ---
  const tollbooths: TollboothGate[] = [];
  const tollProgs = [0.25, 0.5, 0.75, 0.988];
  const tollPostGeo = track(new THREE.BoxGeometry(0.7, 6.8, 1.4));
  const tollRoofGeo = track(new THREE.BoxGeometry(BARRIER_HALF_WIDTH * 2 + 1.4, 1.1, 2.1));
  const tollBeaconGeo = track(new THREE.BoxGeometry(ROAD_HALF_WIDTH * 1.85, 0.25, 0.45));

  tollProgs.forEach((prog, idx) => {
    const s = samples[Math.floor(SAMPLE_COUNT * prog) % SAMPLE_COUNT];
    const tg = new THREE.Group();
    tg.position.copy(s.point);
    tg.rotation.y = Math.atan2(-s.tangent.x, -s.tangent.z);

    const bMat = track(
      new THREE.MeshStandardMaterial({
        color: '#38BDF8',
        emissive: new THREE.Color('#0EA5E9'),
        emissiveIntensity: 2.2,
      }),
    );

    const pL = new THREE.Mesh(tollPostGeo, steelMat);
    pL.position.set(-BARRIER_HALF_WIDTH, 3.4, 0);
    const pR = new THREE.Mesh(tollPostGeo, steelMat);
    pR.position.set(BARRIER_HALF_WIDTH, 3.4, 0);
    const boothMid = new THREE.Mesh(track(new THREE.BoxGeometry(1.1, 3.1, 3.2)), steelMat);
    boothMid.position.set(0, 1.55, 0);
    const roof = new THREE.Mesh(tollRoofGeo, steelMat);
    roof.position.set(0, 6.9, 0);
    const beacon = new THREE.Mesh(tollBeaconGeo, bMat);
    beacon.position.set(0, 6.25, 0);

    tg.add(pL, pR, boothMid, roof, beacon);
    group.add(tg);

    tollbooths.push({
      id: idx,
      progress: prog,
      position: s.point.clone(),
      beaconMat: bMat,
      group: tg,
    });
  });

  // --- 9. Sloped Stunt Jump Ramps ---
  const ramps: TrackRamp[] = [];
  const rampTex = track(createRampChevronTexture(maxAnisotropy));
  const rampMat = track(
    new THREE.MeshStandardMaterial({
      map: rampTex,
      roughness: 0.48,
      metalness: 0.35,
      emissive: new THREE.Color('#F59E0B'),
      emissiveIntensity: 0.16,
    }),
  );

  const rampSpecs = isCanyonOrSummit
    ? [
        { prog: 0.33, lat: -4.6 },
        { prog: 0.64, lat: 4.8 },
        { prog: 0.90, lat: -4.2 },
      ]
    : [
        { prog: 0.35, lat: -4.8 },
        { prog: 0.72, lat: 4.6 },
      ];

  const rampHalfW = 2.6;
  const rampLen = 14.0;
  const rampHeight = 2.05;
  const rampShape = new THREE.Shape();
  rampShape.moveTo(0, 0);
  rampShape.lineTo(rampLen, 0);
  rampShape.lineTo(rampLen, rampHeight);
  rampShape.closePath();

  const rampBaseGeo = track(
    new THREE.ExtrudeGeometry(rampShape, {
      depth: rampHalfW * 2,
      bevelEnabled: true,
      bevelSize: 0.04,
      bevelThickness: 0.04,
      bevelSegments: 2,
    }),
  );
  rampBaseGeo.translate(0, 0, -rampHalfW);
  rampBaseGeo.rotateY(Math.PI / 2);

  rampSpecs.forEach((spec, idx) => {
    const sIdx = Math.floor(SAMPLE_COUNT * spec.prog) % SAMPLE_COUNT;
    const s = samples[sIdx];
    const bankSlope = Math.sin(s.bankAngle);
    const pos = s.point.clone().addScaledVector(s.right, spec.lat);
    pos.y += 0.05 + spec.lat * bankSlope;

    const rampMesh = new THREE.Mesh(rampBaseGeo, rampMat);
    rampMesh.position.copy(pos);
    rampMesh.rotation.set(s.slopePitch, Math.atan2(-s.tangent.x, -s.tangent.z), -s.bankAngle, 'YXZ');
    rampMesh.castShadow = true;
    rampMesh.receiveShadow = true;
    group.add(rampMesh);

    ramps.push({
      id: idx,
      position: pos,
      tangent: s.tangent.clone(),
      right: s.right.clone(),
      lateralCenter: spec.lat,
      halfWidth: rampHalfW,
      length: rampLen,
      height: rampHeight,
      launchAngle: Math.atan2(rampHeight, rampLen),
      trackIdx: sIdx,
    });
  });

  // --- 10. Smashable Water Barrels on Corners & Shoulders ---
  const smashables: SmashableProp[] = [];
  const barrelGeo = track(new THREE.CylinderGeometry(0.46, 0.54, 1.15, 10));
  barrelGeo.translate(0, 0.575, 0);
  const barrelMat = track(
    new THREE.MeshStandardMaterial({
      color: '#F97316',
      roughness: 0.42,
      metalness: 0.1,
      emissive: new THREE.Color('#EA580C'),
      emissiveIntensity: 0.25,
    }),
  );

  for (let i = 0; i < 16; i++) {
    const sIdx = Math.floor(((i + 0.4) / 16) * SAMPLE_COUNT) % SAMPLE_COUNT;
    if (isInsideAnyTunnel(sIdx)) continue;
    const s = samples[sIdx];
    const side = i % 2 === 0 ? 1 : -1;
    const lat = side * (ROAD_HALF_WIDTH - 0.65);
    const pos = s.point.clone().addScaledVector(s.right, lat);
    pos.y += 0.05 + lat * Math.sin(s.bankAngle);

    const mesh = new THREE.Mesh(barrelGeo, barrelMat);
    mesh.position.copy(pos);
    group.add(mesh);

    smashables.push({
      id: i,
      homePos: pos.clone(),
      pos: pos.clone(),
      vel: new THREE.Vector3(),
      rotVel: new THREE.Vector3(),
      mesh,
      hit: false,
      respawnTimer: 0,
    });
  }

  // --- 11. Pursuit Breakers ---
  const pursuitBreakers: PursuitBreaker[] = [];
  const breakerSpecs = [
    { idx: Math.floor(SAMPLE_COUNT * 0.21), side: 1 },
    { idx: Math.floor(SAMPLE_COUNT * 0.45), side: -1 },
    { idx: Math.floor(SAMPLE_COUNT * 0.71), side: 1 },
    { idx: Math.floor(SAMPLE_COUNT * 0.91), side: -1 },
  ];

  const hazardMat = track(new THREE.MeshStandardMaterial({ color: '#F59E0B', roughness: 0.42, metalness: 0.35 }));
  const scaffoldMat = track(new THREE.MeshStandardMaterial({ color: '#94A3B8', metalness: 0.72, roughness: 0.32 }));
  const legGeo = track(new THREE.CylinderGeometry(0.22, 0.26, 5.4, 8));
  const tankGeo = track(new THREE.CylinderGeometry(2.2, 2.2, 2.8, 14));

  const hazardRingGeo = track(new THREE.RingGeometry(2.4, 3.2, 20));
  hazardRingGeo.rotateX(-Math.PI / 2);
  const hazardRingMat = track(
    new THREE.MeshBasicMaterial({ color: '#F59E0B', transparent: true, opacity: 0.75, depthWrite: false }),
  );

  breakerSpecs.forEach((spec, i) => {
    const s = samples[spec.idx];
    const lat = spec.side * (ROAD_HALF_WIDTH - 1.4);
    const pos = s.point.clone().addScaledVector(s.right, lat);
    pos.y += lat * Math.sin(s.bankAngle);
    const bGroup = new THREE.Group();
    bGroup.position.copy(pos);

    const leg1 = new THREE.Mesh(legGeo, hazardMat);
    leg1.position.set(-1.2, 2.7, 0);
    const leg2 = new THREE.Mesh(legGeo, hazardMat);
    leg2.position.set(1.2, 2.7, 0);
    const tank = new THREE.Mesh(tankGeo, scaffoldMat);
    tank.position.set(0, 6.2, 0);
    const ring = new THREE.Mesh(track(new THREE.TorusGeometry(2.25, 0.16, 8, 16)), hazardMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 5.2, 0);
    const floorRing = new THREE.Mesh(hazardRingGeo, hazardRingMat);
    floorRing.position.set(0, 0.09, 0);

    bGroup.add(leg1, leg2, tank, ring, floorRing);
    group.add(bGroup);

    pursuitBreakers.push({
      id: i,
      position: pos,
      group: bGroup,
      triggered: false,
      collapseAnim: 0,
      respawnTimer: 0,
    });
  });

  // --- 12. Cooldown Zones ---
  const cooldownZones: CooldownZone[] = [];
  const cooldownSpecs = [
    { idx: Math.floor(SAMPLE_COUNT * 0.37), side: -1 },
    { idx: Math.floor(SAMPLE_COUNT * 0.77), side: 1 },
  ];
  const zoneMat = track(
    new THREE.MeshBasicMaterial({ color: '#10B981', transparent: true, opacity: 0.58, depthWrite: false }),
  );
  const zoneGeo = track(new THREE.RingGeometry(4.4, 6.2, 24));
  zoneGeo.rotateX(-Math.PI / 2);

  cooldownSpecs.forEach((spec, i) => {
    const s = samples[spec.idx];
    const lat = spec.side * (ROAD_HALF_WIDTH - 1.9);
    const pos = s.point.clone().addScaledVector(s.right, lat);
    pos.y += lat * Math.sin(s.bankAngle);
    const marker = new THREE.Mesh(zoneGeo, zoneMat);
    marker.position.set(pos.x, pos.y + 0.09, pos.z);
    group.add(marker);
    cooldownZones.push({ id: i, position: pos, radius: 10.5 });
  });

  // --- 13. Cobra-Head Highway Streetlights & Corner Chevron Signs ---
  const lightPoleCount = 96;
  const poleGeo = track(new THREE.CylinderGeometry(0.12, 0.2, 8.4, 8));
  poleGeo.translate(0, 4.2, 0);
  const poleMat = track(new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.78, roughness: 0.3 }));
  const lampGeo = track(new THREE.BoxGeometry(2.3, 0.24, 0.62));
  const lampGlowScale = environment === 'noon_clear' ? 0.8 : environment === 'midnight_neon' ? 3.8 : 2.8;
  const lampMat = track(
    new THREE.MeshStandardMaterial({
      color: '#FEF3C7',
      emissive: new THREE.Color(environment === 'midnight_neon' ? '#38BDF8' : '#F59E0B'),
      emissiveIntensity: lampGlowScale,
    }),
  );

  const glowTex = track(
    createLightGlowTexture(
      environment === 'midnight_neon' ? 'rgba(56, 189, 248, 0.72)' : 'rgba(245, 158, 11, 0.65)',
    ),
  );
  const haloGeo = track(new THREE.PlaneGeometry(5.5, 5.5));
  const haloMat = track(
    new THREE.MeshBasicMaterial({
      map: glowTex,
      transparent: true,
      opacity: environment === 'noon_clear' ? 0.14 : 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );

  const poolTex = track(createRoadLightPoolTexture());
  const poolGeo = track(new THREE.PlaneGeometry(14.5, 14.5));
  poolGeo.rotateX(-Math.PI / 2);
  const poolMat = track(
    new THREE.MeshBasicMaterial({
      map: poolTex,
      transparent: true,
      opacity: environment === 'noon_clear' ? 0.1 : environment === 'midnight_neon' ? 0.75 : 0.56,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );

  const poleIndices: number[] = [];
  for (let i = 0; i < lightPoleCount; i++) {
    const idx = Math.floor((i / lightPoleCount) * SAMPLE_COUNT);
    if (isInsideAnyTunnel(idx)) continue;
    poleIndices.push(idx);
  }

  const polesInst = new THREE.InstancedMesh(poleGeo, poleMat, poleIndices.length);
  const lampsInst = new THREE.InstancedMesh(lampGeo, lampMat, poleIndices.length);
  const halosInst = new THREE.InstancedMesh(haloGeo, haloMat, poleIndices.length);
  const poolsInst = new THREE.InstancedMesh(poolGeo, poolMat, poleIndices.length);

  for (let i = 0; i < poleIndices.length; i++) {
    const idx = poleIndices[i];
    const s = samples[idx];
    const side = i % 2 === 0 ? 1 : -1;
    const px = s.point.x + s.right.x * side * (BARRIER_HALF_WIDTH + 1.0);
    const pz = s.point.z + s.right.z * side * (BARRIER_HALF_WIDTH + 1.0);
    const py = s.point.y + side * BARRIER_HALF_WIDTH * Math.sin(s.bankAngle);
    const rotY = Math.atan2(-s.tangent.x, -s.tangent.z) + (side === 1 ? Math.PI / 2 : -Math.PI / 2);

    dummy.position.set(px, py, pz);
    dummy.rotation.set(0, rotY, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    polesInst.setMatrixAt(i, dummy.matrix);

    const lx = px - s.right.x * side * 1.05;
    const lz = pz - s.right.z * side * 1.05;
    dummy.position.set(lx, py + 8.3, lz);
    dummy.updateMatrix();
    lampsInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(lx, py + 7.75, lz);
    dummy.rotation.set(0, Math.atan2(-s.tangent.x, -s.tangent.z), 0);
    dummy.updateMatrix();
    halosInst.setMatrixAt(i, dummy.matrix);

    const poolLat = side * (ROAD_HALF_WIDTH * 0.45);
    dummy.position.set(
      s.point.x + s.right.x * poolLat,
      s.point.y + 0.065 + poolLat * Math.sin(s.bankAngle),
      s.point.z + s.right.z * poolLat,
    );
    dummy.rotation.set(s.slopePitch, Math.atan2(-s.tangent.x, -s.tangent.z), -s.bankAngle, 'YXZ');
    dummy.updateMatrix();
    poolsInst.setMatrixAt(i, dummy.matrix);
  }
  polesInst.instanceMatrix.needsUpdate = true;
  lampsInst.instanceMatrix.needsUpdate = true;
  halosInst.instanceMatrix.needsUpdate = true;
  poolsInst.instanceMatrix.needsUpdate = true;
  polesInst.computeBoundingSphere();
  lampsInst.computeBoundingSphere();
  halosInst.computeBoundingSphere();
  poolsInst.computeBoundingSphere();
  group.add(polesInst, lampsInst, halosInst, poolsInst);

  const chevronSamples = samples.filter((s, idx) => idx % 5 === 0 && Math.abs(s.bankAngle) > 0.042);
  if (chevronSamples.length > 0) {
    const chevGeo = track(new THREE.BoxGeometry(0.18, 1.45, 1.8));
    const chevMat = track(
      new THREE.MeshStandardMaterial({
        color: '#F59E0B',
        emissive: new THREE.Color('#D97706'),
        emissiveIntensity: 1.5,
      }),
    );
    const chevInst = new THREE.InstancedMesh(chevGeo, chevMat, chevronSamples.length);
    chevronSamples.forEach((s, ci) => {
      const outerSide = s.bankAngle > 0 ? -1 : 1;
      const cx = s.point.x + s.right.x * outerSide * (BARRIER_HALF_WIDTH + 0.35);
      const cz = s.point.z + s.right.z * outerSide * (BARRIER_HALF_WIDTH + 0.35);
      const cy = s.point.y + outerSide * BARRIER_HALF_WIDTH * Math.sin(s.bankAngle) + 1.9;
      dummy.position.set(cx, cy, cz);
      dummy.rotation.set(0, Math.atan2(-s.tangent.x, -s.tangent.z), 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      chevInst.setMatrixAt(ci, dummy.matrix);
    });
    chevInst.instanceMatrix.needsUpdate = true;
    chevInst.computeBoundingSphere();
    group.add(chevInst);
  }

  const isClearOfTrack = (x: number, z: number, minDist: number): boolean => {
    const minSq = minDist * minDist;
    for (let i = 0; i < SAMPLE_COUNT; i += 2) {
      const dx = x - samples[i].point.x;
      const dz = z - samples[i].point.z;
      if (dx * dx + dz * dz < minSq) return false;
    }
    for (let sc = 0; sc < shortcuts.length; sc++) {
      const pts = shortcuts[sc].points;
      for (let j = 0; j < pts.length; j += 3) {
        const dx = x - pts[j].x;
        const dz = z - pts[j].z;
        if (dx * dx + dz * dz < (minDist + 8) * (minDist + 8)) return false;
      }
    }
    return true;
  };

  // --- 14. Environment-Adapted Foliage ---
  const treePositions: { x: number; y: number; z: number; scale: number; tint: THREE.Color }[] = [];
  const foliagePalette =
    isForestTrack || environment === 'noon_clear' || environment === 'dawn_mist'
      ? [
          new THREE.Color('#166534'),
          new THREE.Color('#15803D'),
          new THREE.Color('#3F6212'),
          new THREE.Color('#4D7C0F'),
          new THREE.Color('#14532D'),
        ]
      : [
          new THREE.Color('#D97706'),
          new THREE.Color('#B45309'),
          new THREE.Color('#9A3412'),
          new THREE.Color('#DC2626'),
          new THREE.Color('#4D7C0F'),
          new THREE.Color('#CA8A04'),
        ];

  const treeStep = isForestTrack ? 3 : 4;
  for (let i = 0; i < SAMPLE_COUNT; i += treeStep) {
    if (hasHarborBay && i > 130 && i < 260) continue;
    const s = samples[i];
    const side = i % 2 === 0 ? 1 : -1;
    const distOut = BARRIER_HALF_WIDTH + 11 + ((i * 7) % 16);
    const tx = s.point.x + s.right.x * side * distOut;
    const tz = s.point.z + s.right.z * side * distOut;
    if (hasHarborBay && tz < -440 && tx > -20 && tx < 980) continue;
    if (isClearOfTrack(tx, tz, BARRIER_HALF_WIDTH + 8)) {
      const ty = sampleTerrainInfo(tx, tz).height;
      if (ty > -3) {
        treePositions.push({
          x: tx,
          y: ty - 0.3,
          z: tz,
          scale: (isForestTrack ? 1.15 : 0.9) + ((i * 13) % 7) * 0.11,
          tint: foliagePalette[i % foliagePalette.length],
        });
      }
    }
  }

  for (let t = 0; t < (isForestTrack ? 220 : 145); t++) {
    const ang = t * 2.39996;
    const rad = 110 + ((t * 47) % 780);
    const tx = 460 + Math.cos(ang) * rad;
    const tz = 40 + Math.sin(ang) * rad;
    if (hasHarborBay && tz < -440 && tx > -20 && tx < 980) continue;
    if (isClearOfTrack(tx, tz, BARRIER_HALF_WIDTH + 22)) {
      const ty = sampleTerrainInfo(tx, tz).height;
      if (ty > -3) {
        treePositions.push({
          x: tx,
          y: ty - 0.4,
          z: tz,
          scale: 1.0 + (t % 5) * 0.16,
          tint: foliagePalette[t % foliagePalette.length],
        });
      }
    }
  }

  if (treePositions.length > 0) {
    const trunkGeo = track(new THREE.CylinderGeometry(0.32, 0.5, 5.2, 6));
    trunkGeo.translate(0, 2.6, 0);
    const trunkMat = track(new THREE.MeshStandardMaterial({ color: '#3F2719', roughness: 0.94 }));
    const foliageGeo1 = track(new THREE.ConeGeometry(3.2, 5.8, 7));
    foliageGeo1.translate(0, 6.2, 0);
    const foliageGeo2 = track(new THREE.ConeGeometry(2.3, 4.4, 7));
    foliageGeo2.translate(0, 9.2, 0);
    const foliageMat = track(new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.85 }));

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treePositions.length);
    const leaves1 = new THREE.InstancedMesh(foliageGeo1, foliageMat, treePositions.length);
    const leaves2 = new THREE.InstancedMesh(foliageGeo2, foliageMat, treePositions.length);

    treePositions.forEach((tp, idx) => {
      dummy.position.set(tp.x, tp.y, tp.z);
      dummy.rotation.set(0, idx * 0.8, 0);
      dummy.scale.setScalar(tp.scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(idx, dummy.matrix);
      leaves1.setMatrixAt(idx, dummy.matrix);
      leaves2.setMatrixAt(idx, dummy.matrix);
      leaves1.setColorAt(idx, tp.tint);
      leaves2.setColorAt(idx, tp.tint);
    });
    trunks.instanceMatrix.needsUpdate = true;
    leaves1.instanceMatrix.needsUpdate = true;
    leaves2.instanceMatrix.needsUpdate = true;
    if (leaves1.instanceColor) leaves1.instanceColor.needsUpdate = true;
    if (leaves2.instanceColor) leaves2.instanceColor.needsUpdate = true;
    trunks.computeBoundingSphere();
    leaves1.computeBoundingSphere();
    leaves2.computeBoundingSphere();
    group.add(trunks, leaves1, leaves2);
  }

  // --- 15. Multi-Tiered City Skyscrapers & Canyon Cliff Formations ---
  interface BldgPlacement {
    x: number;
    y: number;
    z: number;
    sx: number;
    sy: number;
    sz: number;
    rot: number;
    variant: number;
  }
  const bldgItems: BldgPlacement[] = [];

  if (isCanyonOrSummit || isForestTrack) {
    for (let i = 0; i < SAMPLE_COUNT; i += 8) {
      const s = samples[i];
      [-1, 1].forEach((side, sIdx) => {
        const bx = s.point.x + s.right.x * side * (BARRIER_HALF_WIDTH + 32 + ((i * 5) % 24));
        const bz = s.point.z + s.right.z * side * (BARRIER_HALF_WIDTH + 32 + ((i * 5) % 24));
        if (isClearOfTrack(bx, bz, BARRIER_HALF_WIDTH + 22)) {
          bldgItems.push({
            x: bx,
            y: sampleTerrainInfo(bx, bz).height - 2,
            z: bz,
            sx: 22 + ((i + sIdx) % 4) * 6,
            sy: 24 + ((i * 3) % 42),
            sz: 22 + ((i + sIdx) % 3) * 7,
            rot: Math.atan2(-s.tangent.x, -s.tangent.z) + sIdx * 0.4,
            variant: 0,
          });
        }
      });
    }
  } else {
    const bStep = trackId === 'downtown_labyrinth' ? 5 : 7;
    for (let i = 0; i < SAMPLE_COUNT; i += bStep) {
      if (hasHarborBay && i > 130 && i < 260) continue;
      const s = samples[i];
      const yaw = Math.atan2(-s.tangent.x, -s.tangent.z);
      [-1, 1].forEach((side, sIdx) => {
        const distOut = BARRIER_HALF_WIDTH + 25 + ((i + sIdx * 11) % 26);
        const bx = s.point.x + s.right.x * side * distOut;
        const bz = s.point.z + s.right.z * side * distOut;
        if (hasHarborBay && bz < -440 && bx > -20 && bx < 980) return;
        if (isClearOfTrack(bx, bz, BARRIER_HALF_WIDTH + 20)) {
          const isDowntown = trackId === 'downtown_labyrinth' || s.progress < 0.2 || s.progress > 0.78;
          bldgItems.push({
            x: bx,
            y: sampleTerrainInfo(bx, bz).height - 1.5,
            z: bz,
            sx: 18 + ((i + sIdx * 3) % 4) * 4,
            sy: isDowntown ? 48 + ((i * 7) % 74) : 24 + ((i * 5) % 34),
            sz: 18 + ((i + sIdx * 5) % 4) * 4,
            rot: yaw,
            variant: (i + sIdx) % 3,
          });
        }
      });
    }
  }

  if (bldgItems.length > 0) {
    if (isCanyonOrSummit || isForestTrack) {
      const rockTier1 = track(new THREE.CylinderGeometry(0.68, 1.0, 1, 7));
      rockTier1.translate(0, 0.5, 0);
      const rockTier2 = track(new THREE.CylinderGeometry(0.38, 0.72, 0.55, 6));
      rockTier2.translate(0, 0.275, 0);
      const rockMat = track(
        new THREE.MeshStandardMaterial({
          color: isForestTrack ? '#475569' : '#784E2F',
          roughness: 0.94,
          metalness: 0.04,
        }),
      );
      const rocks = new THREE.InstancedMesh(rockTier1, rockMat, bldgItems.length);
      const caps = new THREE.InstancedMesh(rockTier2, rockMat, bldgItems.length);
      bldgItems.forEach((bp, i) => {
        dummy.position.set(bp.x, bp.y, bp.z);
        dummy.rotation.set(0, bp.rot, 0);
        dummy.scale.set(bp.sx, bp.sy, bp.sz);
        dummy.updateMatrix();
        rocks.setMatrixAt(i, dummy.matrix);

        dummy.position.set(bp.x + 2, bp.y + bp.sy * 0.78, bp.z - 2);
        dummy.rotation.set(0, bp.rot + 0.6, 0);
        dummy.scale.set(bp.sx * 0.85, bp.sy * 0.75, bp.sz * 0.85);
        dummy.updateMatrix();
        caps.setMatrixAt(i, dummy.matrix);
      });
      rocks.instanceMatrix.needsUpdate = true;
      caps.instanceMatrix.needsUpdate = true;
      rocks.computeBoundingSphere();
      caps.computeBoundingSphere();
      group.add(rocks, caps);
    } else {
      const podiumGeo = track(new THREE.BoxGeometry(1.12, 1, 1.12));
      podiumGeo.translate(0, 0.5, 0);
      const shaftGeo = track(new THREE.BoxGeometry(1, 1, 1));
      shaftGeo.translate(0, 0.5, 0);
      const setbackGeo = track(new THREE.BoxGeometry(0.68, 1, 0.68));
      setbackGeo.translate(0, 0.5, 0);
      const spireGeo = track(new THREE.CylinderGeometry(0.16, 0.34, 10, 6));
      spireGeo.translate(0, 5, 0);
      const beaconGeo = track(new THREE.SphereGeometry(0.42, 6, 6));

      const winGlow = environment === 'midnight_neon' ? 0.55 : environment === 'noon_clear' ? 0.02 : 0.22;
      const podiumMat = track(new THREE.MeshStandardMaterial({ color: '#181E29', roughness: 0.82, metalness: 0.18 }));
      const crownMat = track(new THREE.MeshStandardMaterial({ color: '#1B2230', metalness: 0.62, roughness: 0.38 }));
      const beaconRedMat = track(
        new THREE.MeshStandardMaterial({ color: '#EF4444', emissive: new THREE.Color('#EF4444'), emissiveIntensity: 3.0 }),
      );
      const glassTex = track(createBuildingFacadeTexture(maxAnisotropy, 'glass'));
      const concreteTex = track(createBuildingFacadeTexture(maxAnisotropy, 'concrete'));
      const indTex = track(createBuildingFacadeTexture(maxAnisotropy, 'industrial'));

      const glassMat = track(
        new THREE.MeshStandardMaterial({
          map: glassTex,
          emissiveMap: glassTex,
          emissive: new THREE.Color('#FFFFFF'),
          emissiveIntensity: winGlow,
          roughness: 0.34,
          metalness: 0.42,
        }),
      );
      const concreteMat = track(
        new THREE.MeshStandardMaterial({
          map: concreteTex,
          emissiveMap: concreteTex,
          emissive: new THREE.Color('#FFFFFF'),
          emissiveIntensity: winGlow * 0.8,
          roughness: 0.72,
          metalness: 0.12,
        }),
      );
      const indMat = track(
        new THREE.MeshStandardMaterial({
          map: indTex,
          emissiveMap: indTex,
          emissive: new THREE.Color('#FFFFFF'),
          emissiveIntensity: winGlow * 0.8,
          roughness: 0.78,
          metalness: 0.18,
        }),
      );
      const mats = [glassMat, concreteMat, indMat];

      [0, 1, 2].forEach((vIdx) => {
        const subset = bldgItems.filter((b) => b.variant === vIdx);
        if (!subset.length) return;
        const podiums = new THREE.InstancedMesh(podiumGeo, podiumMat, subset.length);
        const shafts = new THREE.InstancedMesh(shaftGeo, mats[vIdx], subset.length);
        const setbacks = new THREE.InstancedMesh(setbackGeo, crownMat, subset.length);
        const tallOnes = subset.filter((b) => b.sy > 56);
        const spires = tallOnes.length > 0 ? new THREE.InstancedMesh(spireGeo, crownMat, tallOnes.length) : null;
        const beacons = tallOnes.length > 0 ? new THREE.InstancedMesh(beaconGeo, beaconRedMat, tallOnes.length) : null;
        let spIdx = 0;

        subset.forEach((bp, idx) => {
          const podH = Math.max(6.5, bp.sy * 0.18);
          const shaftH = Math.max(10, bp.sy - podH);

          dummy.position.set(bp.x, bp.y, bp.z);
          dummy.rotation.set(0, bp.rot, 0);
          dummy.scale.set(bp.sx, podH, bp.sz);
          dummy.updateMatrix();
          podiums.setMatrixAt(idx, dummy.matrix);

          dummy.position.set(bp.x, bp.y + podH, bp.z);
          dummy.scale.set(bp.sx, shaftH, bp.sz);
          dummy.updateMatrix();
          shafts.setMatrixAt(idx, dummy.matrix);

          dummy.position.set(bp.x, bp.y + bp.sy, bp.z);
          dummy.scale.set(bp.sx, 6.2, bp.sz);
          dummy.updateMatrix();
          setbacks.setMatrixAt(idx, dummy.matrix);

          if (spires && beacons && bp.sy > 56) {
            dummy.position.set(bp.x, bp.y + bp.sy + 6.2, bp.z);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            spires.setMatrixAt(spIdx, dummy.matrix);

            dummy.position.set(bp.x, bp.y + bp.sy + 16.4, bp.z);
            dummy.updateMatrix();
            beacons.setMatrixAt(spIdx, dummy.matrix);
            spIdx++;
          }
        });

        [podiums, shafts, setbacks].forEach((m) => {
          m.instanceMatrix.needsUpdate = true;
          m.computeBoundingSphere();
          group.add(m);
        });
        if (spires && beacons) {
          spires.instanceMatrix.needsUpdate = true;
          spires.computeBoundingSphere();
          beacons.instanceMatrix.needsUpdate = true;
          beacons.computeBoundingSphere();
          group.add(spires, beacons);
        }
      });
    }
  }

  // --- Analytical Track Query ---
  const getClosestTrackInfo = (x: number, z: number, hintIndex?: number) => {
    let bestIdx = 0;
    let bestDistSq = Infinity;

    if (hintIndex !== undefined && hintIndex >= 0 && hintIndex < SAMPLE_COUNT) {
      const windowRadius = 28;
      for (let offset = -windowRadius; offset <= windowRadius; offset++) {
        const idx = (hintIndex + offset + SAMPLE_COUNT) % SAMPLE_COUNT;
        const p = samples[idx].point;
        const dx = x - p.x;
        const dz = z - p.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = idx;
        }
      }
      if (bestDistSq > 55 * 55) {
        for (let i = 0; i < SAMPLE_COUNT; i++) {
          const p = samples[i].point;
          const dx = x - p.x;
          const dz = z - p.z;
          const dSq = dx * dx + dz * dz;
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestIdx = i;
          }
        }
      }
    } else {
      for (let i = 0; i < SAMPLE_COUNT; i++) {
        const p = samples[i].point;
        const dx = x - p.x;
        const dz = z - p.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = i;
        }
      }
    }

    const s = samples[bestIdx];
    const nextS = samples[(bestIdx + 1) % SAMPLE_COUNT];
    const relX = x - s.point.x;
    const relZ = z - s.point.z;
    const lateralOffset = relX * s.right.x + relZ * s.right.z;
    const along = relX * s.tangent.x + relZ * s.tangent.z;
    const segLen = Math.hypot(nextS.point.x - s.point.x, nextS.point.z - s.point.z) || 1;
    const tFrac = THREE.MathUtils.clamp(along / segLen, 0, 1);
    const centerElevY = THREE.MathUtils.lerp(s.point.y, nextS.point.y, tFrac);
    const bankAngle = THREE.MathUtils.lerp(s.bankAngle, nextS.bankAngle, tFrac);
    const elevationY = centerElevY + lateralOffset * Math.sin(bankAngle);

    return {
      sample: s,
      lateralOffset,
      elevationY,
      slopePitch: s.slopePitch,
      bankAngle,
      distanceSq: bestDistSq,
    };
  };

  // --- Driveable Shortcut Corridor Query ---
  const tempRight = new THREE.Vector3();
  const queryShortcut = (x: number, z: number) => {
    for (let sc = 0; sc < shortcuts.length; sc++) {
      const sObj = shortcuts[sc];
      let bestJ = -1;
      let bestSq = 28 * 28;
      for (let j = 0; j < sObj.points.length; j++) {
        const pt = sObj.points[j];
        const dx = x - pt.x;
        const dz = z - pt.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestSq) {
          bestSq = dSq;
          bestJ = j;
        }
      }
      if (bestJ >= 0) {
        const pt = sObj.points[bestJ];
        const tan = sObj.tangents[bestJ];
        tempRight.set(-tan.z, 0, tan.x);
        const lateral = (x - pt.x) * tempRight.x + (z - pt.z) * tempRight.z;
        return {
          shortcut: sObj,
          ptIndex: bestJ,
          lateral,
          elevationY: pt.y,
          tangent: tan,
          distanceSq: bestSq,
        };
      }
    }
    return null;
  };

  return {
    id: trackId,
    environment,
    group,
    curve,
    samples,
    totalLength,
    roadHalfWidth: ROAD_HALF_WIDTH,
    barrierHalfWidth: BARRIER_HALF_WIDTH,
    speedTraps,
    pursuitBreakers,
    cooldownZones,
    ramps,
    smashables,
    tollbooths,
    shortcuts,
    tunnelRanges: tunnelConfigs.map((tc) => ({ startIdx: tc.startIdx, endIdx: tc.startIdx + tc.len })),
    minimapPath,
    getClosestTrackInfo,
    queryShortcut,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
