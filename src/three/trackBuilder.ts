import * as THREE from 'three';
import { EnvironmentId, TrackId } from '../types/game';
import {
  AsphaltVariant,
  createAsphaltNormalTexture,
  createAsphaltRoughnessTexture,
  createAsphaltTexture,
  createBarrierTexture,
  createBillboardTexture,
  createBrakingBoardTexture,
  createBuildingFacadeTexture,
  createCornerChevronTexture,
  createCurbTexture,
  createGarageFloorTexture,
  createGroundTerrainTexture,
  createHighwaySignTexture,
  createLightGlowTexture,
  createRampChevronTexture,
  createRoadLightPoolTexture,
  createRoadShortcutArrowTexture,
  createShortcutAdvanceSignTexture,
  createShortcutSignTexture,
  createShortcutSurfaceTexture,
  createStartBannerTexture,
  createTunnelPortalTexture,
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

export interface ShortcutGatePlank {
  mesh: THREE.Mesh;
  homePos: THREE.Vector3;
  vel: THREE.Vector3;
  rotVel: THREE.Vector3;
  smashed: boolean;
  respawnTimer: number;
}

export interface TrackShortcut {
  id: number;
  label: string;
  startIdx: number;
  endIdx: number;
  entryCutStartIdx: number;
  entryCutEndIdx: number;
  exitCutStartIdx: number;
  exitCutEndIdx: number;
  innerStartFrac: number;
  innerEndFrac: number;
  side: -1 | 1; // -1 = left exit, +1 = right exit
  halfWidth: number;
  points: THREE.Vector3[];
  tangents: THREE.Vector3[];
  slopePitches: number[];
  entryPos: THREE.Vector3;
  exitPos: THREE.Vector3;
  planks: ShortcutGatePlank[];
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
  roadMat: THREE.MeshStandardMaterial;
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
    currentY?: number,
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
    hintShortcutId?: number | null,
  ) => {
    shortcut: TrackShortcut;
    ptIndex: number;
    frac: number;
    lateral: number;
    elevationY: number;
    slopePitch: number;
    tangent: THREE.Vector3;
    distanceSq: number;
  } | null;
  updateAnimations: (timeSec: number, countdownInt: number, introActive: boolean) => void;
  dispose: () => void;
}

const SAMPLE_COUNT = 720;

export function getTrackRoadHalfWidth(trackId: TrackId): number {
  switch (trackId) {
    // ONLY 2 wide high-speed circuits allowed; all 8 others are narrower technical circuits
    case 'hwy99_speedway':
      return 14.6;
    case 'gray_point_bay':
      return 14.0;
    case 'rockport_loop':
      return 10.8;
    case 'camden_coast':
      return 10.6;
    case 'rosewood_park':
      return 10.5;
    case 'silverton_pass':
      return 10.4;
    case 'heritage_forest':
      return 10.2;
    case 'rosewood_canyon':
      return 10.1;
    case 'blackridge_summit':
      return 9.9;
    case 'downtown_labyrinth':
      return 9.8;
  }
}

export interface ComputedShortcutCorridor {
  def: ShortcutDef;
  scHalfW: number;
  scSegs: number;
  startIdx: number;
  endIdx: number;
  entryCutStartIdx: number;
  entryCutEndIdx: number;
  exitCutStartIdx: number;
  exitCutEndIdx: number;
  entryPos: THREE.Vector3;
  exitPos: THREE.Vector3;
  scPts: THREE.Vector3[];
  scTangents: THREE.Vector3[];
  scRights: THREE.Vector3[];
  scSlopePitches: number[];
  innerStartJ: number;
  innerEndJ: number;
  innerStartFrac: number;
  innerEndFrac: number;
}

function trackIdxDist(a: number, b: number): number {
  const raw = Math.abs(a - b);
  return Math.min(raw, SAMPLE_COUNT - raw);
}

function computeShortcutCorridor(
  samples: TrackSample[],
  roadHalfWidth: number,
  barrierHalfWidth: number,
  def: ShortcutDef,
): ComputedShortcutCorridor {
  const up = new THREE.Vector3(0, 1, 0);
  const startIdx = Math.floor(SAMPLE_COUNT * def.startProg) % SAMPLE_COUNT;
  const endIdx = Math.floor(SAMPLE_COUNT * def.endProg) % SAMPLE_COUNT;

  const entryCutStartIdx = (startIdx - 2 + SAMPLE_COUNT) % SAMPLE_COUNT;
  const entryCutEndIdx = (startIdx + 3 + SAMPLE_COUNT) % SAMPLE_COUNT;
  const exitCutStartIdx = (endIdx - 3 + SAMPLE_COUNT) % SAMPLE_COUNT;
  const exitCutEndIdx = (endIdx + 2 + SAMPLE_COUNT) % SAMPLE_COUNT;

  const scHalfW = 5.4;
  const sInStart = samples[entryCutStartIdx];
  const sInEnd = samples[entryCutEndIdx];
  const sOutStart = samples[exitCutStartIdx];
  const sOutEnd = samples[exitCutEndIdx];

  const entryCenterLat = def.side * (roadHalfWidth + scHalfW - 0.85);
  const entryPos = sInStart.point.clone().addScaledVector(sInStart.right, entryCenterLat);
  entryPos.y += 0.036 + entryCenterLat * Math.sin(sInStart.bankAngle);

  const exitCenterLat = def.side * (roadHalfWidth + scHalfW - 0.85);
  const exitPos = sOutEnd.point.clone().addScaledVector(sOutEnd.right, exitCenterLat);
  exitPos.y += 0.036 + exitCenterLat * Math.sin(sOutEnd.bankAngle);

  const minTrackClear = barrierHalfWidth + scHalfW + 5.2;

  const pushPointClearOfMain = (
    pt: THREE.Vector3,
    fallbackDir: THREE.Vector3,
    clearRadius: number,
    skipWindow = 4,
  ) => {
    for (let pass = 0; pass < 4; pass++) {
      let closestMainPt: THREE.Vector3 | null = null;
      let closestMainDistSq = clearRadius * clearRadius;
      for (let ti = 0; ti < SAMPLE_COUNT; ti++) {
        if (trackIdxDist(ti, startIdx) <= skipWindow || trackIdxDist(ti, endIdx) <= skipWindow) continue;
        const tp = samples[ti].point;
        if (Math.abs(pt.y - tp.y) >= 13.5) continue;
        const dx = pt.x - tp.x;
        const dz = pt.z - tp.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < closestMainDistSq) {
          closestMainDistSq = dSq;
          closestMainPt = tp;
        }
      }
      if (!closestMainPt) break;
      const pushDir = new THREE.Vector3(pt.x - closestMainPt.x, 0, pt.z - closestMainPt.z);
      if (pushDir.lengthSq() < 0.01) {
        pushDir.copy(fallbackDir);
      } else {
        pushDir.normalize();
      }
      pt.x = closestMainPt.x + pushDir.x * clearRadius;
      pt.z = closestMainPt.z + pushDir.z * clearRadius;
    }
  };

  const pLeadIn = sInEnd.point
    .clone()
    .addScaledVector(sInEnd.right, def.side * (barrierHalfWidth + scHalfW + 3.4));
  pLeadIn.y = sInEnd.point.y + def.side * barrierHalfWidth * Math.sin(sInEnd.bankAngle);
  pushPointClearOfMain(pLeadIn, sInEnd.right.clone().multiplyScalar(def.side), barrierHalfWidth + scHalfW + 3.0, 5);

  const pLeadOut = sOutStart.point
    .clone()
    .addScaledVector(sOutStart.right, def.side * (barrierHalfWidth + scHalfW + 3.4));
  pLeadOut.y = sOutStart.point.y + def.side * barrierHalfWidth * Math.sin(sOutStart.bankAngle);
  pushPointClearOfMain(pLeadOut, sOutStart.right.clone().multiplyScalar(def.side), barrierHalfWidth + scHalfW + 3.0, 5);

  const midIdx = (startIdx + Math.floor(((endIdx - startIdx + SAMPLE_COUNT) % SAMPLE_COUNT) * 0.5)) % SAMPLE_COUNT;
  const midTrackPt = samples[midIdx].point;
  const chordMid = new THREE.Vector3().addVectors(pLeadIn, pLeadOut).multiplyScalar(0.5);
  const pMid = chordMid.clone().lerp(midTrackPt, def.pullFactor * 0.12);
  pMid.y = Math.max(0, (pLeadIn.y + pLeadOut.y) * 0.5);
  pushPointClearOfMain(pMid, samples[midIdx].right.clone().multiplyScalar(def.side), minTrackClear + 9, 4);

  const pQuarter1 = new THREE.Vector3().lerpVectors(pLeadIn, pMid, 0.52);
  pQuarter1.y = THREE.MathUtils.lerp(pLeadIn.y, pMid.y, 0.52);
  pushPointClearOfMain(pQuarter1, samples[midIdx].right.clone().multiplyScalar(def.side), minTrackClear + 6, 4);

  const pQuarter2 = new THREE.Vector3().lerpVectors(pMid, pLeadOut, 0.48);
  pQuarter2.y = THREE.MathUtils.lerp(pMid.y, pLeadOut.y, 0.48);
  pushPointClearOfMain(pQuarter2, samples[midIdx].right.clone().multiplyScalar(def.side), minTrackClear + 6, 4);

  const scCurve = new THREE.CatmullRomCurve3(
    [entryPos, pLeadIn, pQuarter1, pMid, pQuarter2, pLeadOut, exitPos],
    false,
    'catmullrom',
    0.5,
  );
  const scSegs = 56;
  const scPts = scCurve.getSpacedPoints(scSegs);

  for (let iter = 0; iter < 5; iter++) {
    for (let j = 4; j <= scSegs - 4; j++) {
      const clearReq =
        j <= 5 || j >= scSegs - 5
          ? barrierHalfWidth + scHalfW + 1.4
          : minTrackClear + 1.5;
      pushPointClearOfMain(scPts[j], samples[midIdx].right.clone().multiplyScalar(def.side), clearReq, 4);
    }
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 3; j <= scSegs - 3; j++) {
        const ax = (scPts[j - 1].x + scPts[j + 1].x) * 0.5;
        const az = (scPts[j - 1].z + scPts[j + 1].z) * 0.5;
        scPts[j].x = THREE.MathUtils.lerp(scPts[j].x, ax, 0.34);
        scPts[j].z = THREE.MathUtils.lerp(scPts[j].z, az, 0.34);
      }
    }
  }
  for (let j = 6; j <= scSegs - 6; j++) {
    pushPointClearOfMain(scPts[j], samples[midIdx].right.clone().multiplyScalar(def.side), minTrackClear - 0.6, 4);
  }
  for (let j = 5; j <= scSegs - 5; j++) {
    const ax = (scPts[j - 1].x + scPts[j + 1].x) * 0.5;
    const az = (scPts[j - 1].z + scPts[j + 1].z) * 0.5;
    scPts[j].x = THREE.MathUtils.lerp(scPts[j].x, ax, 0.24);
    scPts[j].z = THREE.MathUtils.lerp(scPts[j].z, az, 0.24);
    if (j >= 7 && j <= scSegs - 7) {
      pushPointClearOfMain(scPts[j], samples[midIdx].right.clone().multiplyScalar(def.side), barrierHalfWidth + scHalfW + 3.2, 4);
    }
  }

  const scTangents: THREE.Vector3[] = [];
  const scRights: THREE.Vector3[] = [];
  const scSlopePitches: number[] = [];

  for (let j = 0; j <= scSegs; j++) {
    const nextPt = scPts[Math.min(scSegs, j + 1)];
    const prevPt = scPts[Math.max(0, j - 1)];
    const dx = nextPt.x - prevPt.x;
    const dy = nextPt.y - prevPt.y;
    const dz = nextPt.z - prevPt.z;
    const horiz = Math.hypot(dx, dz) || 1;
    scSlopePitches.push(Math.atan2(dy, horiz));

    const tan = new THREE.Vector3(dx, 0, dz).normalize();
    scTangents.push(tan);
    scRights.push(new THREE.Vector3().crossVectors(tan, up).normalize());
  }

  const minCoplanarDistToMainSq = (p: THREE.Vector3) => {
    let bestSq = Infinity;
    for (let k = 0; k < SAMPLE_COUNT; k++) {
      const tp = samples[k].point;
      if (Math.abs(p.y - tp.y) >= 13.5) continue;
      const dx = p.x - tp.x;
      const dz = p.z - tp.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestSq) bestSq = dSq;
    }
    return bestSq;
  };
  const innerEdgeClearSq = (barrierHalfWidth + 0.85) * (barrierHalfWidth + 0.85);
  let innerStartJ = 6;
  for (let j = 4; j <= Math.floor(scSegs * 0.34); j++) {
    const innerEdgePt = scPts[j].clone().addScaledVector(scRights[j], -def.side * scHalfW);
    if (minCoplanarDistToMainSq(innerEdgePt) >= innerEdgeClearSq) {
      innerStartJ = j;
      break;
    }
  }
  let innerEndJ = scSegs - 6;
  for (let j = scSegs - 4; j >= Math.floor(scSegs * 0.66); j--) {
    const innerEdgePt = scPts[j].clone().addScaledVector(scRights[j], -def.side * scHalfW);
    if (minCoplanarDistToMainSq(innerEdgePt) >= innerEdgeClearSq) {
      innerEndJ = j;
      break;
    }
  }

  return {
    def,
    scHalfW,
    scSegs,
    startIdx,
    endIdx,
    entryCutStartIdx,
    entryCutEndIdx,
    exitCutStartIdx,
    exitCutEndIdx,
    entryPos,
    exitPos,
    scPts,
    scTangents,
    scRights,
    scSlopePitches,
    innerStartJ,
    innerEndJ,
    innerStartFrac: innerStartJ / scSegs,
    innerEndFrac: innerEndJ / scSegs,
  };
}

export function computeTrackSampledCorridors(trackId: TrackId): {
  roadHalfWidth: number;
  barrierHalfWidth: number;
  samples: TrackSample[];
  shortcuts: ComputedShortcutCorridor[];
} {
  const roadHalfWidth = getTrackRoadHalfWidth(trackId);
  const barrierHalfWidth = roadHalfWidth + 2.2;
  const controlPts = getControlPoints(trackId);
  const curve = new THREE.CatmullRomCurve3(controlPts, true, 'catmullrom', 0.48);
  const spacedPts = curve.getSpacedPoints(SAMPLE_COUNT);
  const up = new THREE.Vector3(0, 1, 0);

  const rawSamples: {
    point: THREE.Vector3;
    tangent: THREE.Vector3;
    right: THREE.Vector3;
    slopePitch: number;
    rawBank: number;
  }[] = [];

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

  const defs = getShortcutDefs(trackId);
  const shortcuts = defs.map((def) => computeShortcutCorridor(samples, roadHalfWidth, barrierHalfWidth, def));
  return { roadHalfWidth, barrierHalfWidth, samples, shortcuts };
}

function scaleTrackXZ(pts: THREE.Vector3[], scale = 1.36): THREE.Vector3[] {
  return pts.map((p) => new THREE.Vector3(p.x * scale, p.y, p.z * scale));
}

export function getControlPoints(trackId: TrackId): THREE.Vector3[] {
  switch (trackId) {
    case 'rosewood_park':
      // Collegiate Village Switchbacks, Valley Plunge & Upper Y=24 Overpass over Lower Y=1 Straight
      return scaleTrackXZ([
        new THREE.Vector3(0, 0, 340),
        new THREE.Vector3(0, 1, -20),
        new THREE.Vector3(-40, 6, -280),
        new THREE.Vector3(-280, 22, -480),
        new THREE.Vector3(-680, 34, -460),
        new THREE.Vector3(-820, 14, -140),
        new THREE.Vector3(-480, 6, -180),
        new THREE.Vector3(-190, 22, -20),
        new THREE.Vector3(190, 24, -20),
        new THREE.Vector3(580, 28, -160),
        new THREE.Vector3(780, 8, 160),
        new THREE.Vector3(460, 2, 410),
        new THREE.Vector3(190, 18, 560),
        new THREE.Vector3(-90, 2, 500),
      ]);

    case 'hwy99_speedway':
      // FAST #1/2: High-Speed Tri-Oval + Braided Y=24 Interchange, Sweeping Chicane & Valley Dip
      return scaleTrackXZ([
        new THREE.Vector3(0, 0, 460),
        new THREE.Vector3(0, 2, -60),
        new THREE.Vector3(40, 2, -580),
        new THREE.Vector3(420, 22, -980),
        new THREE.Vector3(980, 30, -820),
        new THREE.Vector3(1180, 8, -320),
        new THREE.Vector3(740, 16, -80),
        new THREE.Vector3(220, 24, -60),
        new THREE.Vector3(-220, 24, -60),
        new THREE.Vector3(-840, 14, 180),
        new THREE.Vector3(-720, 26, 620),
        new THREE.Vector3(-220, 4, 820),
      ]);

    case 'camden_coast':
      // Peninsula Coastline: Clockwise Cliffside Hairpins, Sea Bay Viaduct & Coastal Village Ridge
      return scaleTrackXZ([
        new THREE.Vector3(0, 0, 340),
        new THREE.Vector3(0, 2, -20),
        new THREE.Vector3(-260, 12, -260),
        new THREE.Vector3(-720, 34, -560),
        new THREE.Vector3(-240, 24, -780),
        new THREE.Vector3(480, 22, -740),
        new THREE.Vector3(860, 6, -380),
        new THREE.Vector3(580, 6, 40),
        new THREE.Vector3(200, 22, -20),
        new THREE.Vector3(-200, 22, -20),
        new THREE.Vector3(-580, 12, 220),
        new THREE.Vector3(-340, 2, 540),
        new THREE.Vector3(-80, 0, 520),
      ]);

    case 'rosewood_canyon':
      // Desert Canyon Mesa: High Rim Switchbacks (Y=44), Deep Gorge Drop (Y=2) & Braided Mesa Arch (Y=22)
      return scaleTrackXZ([
        new THREE.Vector3(0, 0, 320),
        new THREE.Vector3(0, 2, -20),
        new THREE.Vector3(-180, 22, -360),
        new THREE.Vector3(-640, 44, -620),
        new THREE.Vector3(-920, 8, -280),
        new THREE.Vector3(-560, 2, 40),
        new THREE.Vector3(-240, 22, -20),
        new THREE.Vector3(240, 22, -20),
        new THREE.Vector3(680, 36, 120),
        new THREE.Vector3(860, 16, 420),
        new THREE.Vector3(420, 4, 580),
        new THREE.Vector3(110, 14, 660),
        new THREE.Vector3(-90, 2, 500),
      ]);

    case 'heritage_forest':
      // Timberland Serpentine Valley: Sweeping Switchbacks, Mountain Tunnel & Elevated Viaduct (Y=22 over Y=1)
      return scaleTrackXZ([
        new THREE.Vector3(0, 0, 320),
        new THREE.Vector3(0, 1, -20),
        new THREE.Vector3(220, 10, -340),
        new THREE.Vector3(640, 26, -540),
        new THREE.Vector3(440, 36, -840),
        new THREE.Vector3(-120, 18, -720),
        new THREE.Vector3(-680, 6, -420),
        new THREE.Vector3(-210, 22, -20),
        new THREE.Vector3(210, 22, -20),
        new THREE.Vector3(640, 14, 240),
        new THREE.Vector3(320, 2, 540),
        new THREE.Vector3(-140, 10, 660),
        new THREE.Vector3(-90, 2, 500),
      ]);

    case 'gray_point_bay':
      // FAST #2/2: Twin Causeway & Braided Bay Skyway (Y=24 over Y=3) with Fast Coastal Sweepers
      return scaleTrackXZ([
        new THREE.Vector3(0, 0, 380),
        new THREE.Vector3(0, 3, -40),
        new THREE.Vector3(0, 6, -520),
        new THREE.Vector3(360, 28, -940),
        new THREE.Vector3(960, 24, -820),
        new THREE.Vector3(1180, 8, -320),
        new THREE.Vector3(780, 18, -80),
        new THREE.Vector3(240, 24, -40),
        new THREE.Vector3(-240, 24, -40),
        new THREE.Vector3(-820, 12, 240),
        new THREE.Vector3(-620, 4, 720),
        new THREE.Vector3(-160, 6, 840),
      ]);

    case 'silverton_pass':
      // Industrial Valley & Foundry Terraces: Hairpin Zigzag, Slag Tunnels & Y=22 Steel Viaduct
      return scaleTrackXZ([
        new THREE.Vector3(0, 0, 340),
        new THREE.Vector3(0, 1, -20),
        new THREE.Vector3(-200, 16, -340),
        new THREE.Vector3(-620, 34, -560),
        new THREE.Vector3(-920, 22, -240),
        new THREE.Vector3(-640, 8, 80),
        new THREE.Vector3(-210, 22, -20),
        new THREE.Vector3(210, 22, -20),
        new THREE.Vector3(620, 28, 120),
        new THREE.Vector3(840, 10, 380),
        new THREE.Vector3(480, 2, 580),
        new THREE.Vector3(140, 14, 680),
        new THREE.Vector3(-90, 2, 500),
      ]);

    case 'downtown_labyrinth':
      // Technical City Grid: Sharp 90-Degree Chicanes, Deep Subway Dips (Y=-3) & Express Flyover (Y=21)
      return scaleTrackXZ([
        new THREE.Vector3(0, 0, 340),
        new THREE.Vector3(0, -2, -20),
        new THREE.Vector3(160, -3, -300),
        new THREE.Vector3(520, -2, -320),
        new THREE.Vector3(680, 22, -620),
        new THREE.Vector3(960, 18, -320),
        new THREE.Vector3(640, 14, -40),
        new THREE.Vector3(230, 21, -20),
        new THREE.Vector3(-230, 21, -20),
        new THREE.Vector3(-580, 10, 40),
        new THREE.Vector3(-680, 2, 340),
        new THREE.Vector3(-340, -3, 580),
        new THREE.Vector3(80, 4, 700),
        new THREE.Vector3(-80, 0, 520),
      ]);

    case 'blackridge_summit':
      // Final Blacklist Alpine Summit: Extreme Climbs (Y=52), Switchbacks & Y=24 Viaduct Over Y=2 Pass
      return scaleTrackXZ([
        new THREE.Vector3(0, 0, 360),
        new THREE.Vector3(0, 2, -20),
        new THREE.Vector3(220, 28, -420),
        new THREE.Vector3(720, 52, -740),
        new THREE.Vector3(1080, 44, -360),
        new THREE.Vector3(720, 26, -80),
        new THREE.Vector3(220, 24, -20),
        new THREE.Vector3(-220, 24, -20),
        new THREE.Vector3(-660, 40, 160),
        new THREE.Vector3(-880, 18, 480),
        new THREE.Vector3(-460, 2, 700),
        new THREE.Vector3(-140, 16, 820),
        new THREE.Vector3(-80, 2, 540),
      ]);

    case 'rockport_loop':
    default:
      // Rockport Coastal Villa Ridge, Harbor Bridge & Braided Overpass (Y=22 Over Y=2 Lower Bay Straight)
      return scaleTrackXZ([
        new THREE.Vector3(0, 0, 340),
        new THREE.Vector3(0, 2, -20),
        new THREE.Vector3(240, 4, -360),
        new THREE.Vector3(640, 22, -560),
        new THREE.Vector3(880, 14, -220),
        new THREE.Vector3(560, 4, 80),
        new THREE.Vector3(190, 22, -20),
        new THREE.Vector3(-190, 22, -20),
        new THREE.Vector3(-620, 28, -200),
        new THREE.Vector3(-760, 6, 160),
        new THREE.Vector3(-440, 2, 460),
        new THREE.Vector3(-120, 4, 620),
      ]);
  }
}

const minimapCache = new Map<TrackId, { x: number; z: number }[]>();

export function getTrackMinimapPoints(trackId: TrackId): { x: number; z: number }[] {
  const cached = minimapCache.get(trackId);
  if (cached) return cached;
  const pts = getControlPoints(trackId);
  const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.48);
  const spaced = curve.getSpacedPoints(120);
  const res = spaced.map((p) => ({ x: p.x, z: p.z }));
  minimapCache.set(trackId, res);
  return res;
}

interface ShortcutDef {
  label: string;
  startProg: number;
  endProg: number;
  side: -1 | 1;
  pullFactor: number;
}

// Placed strictly inside [0.02..0.22], [0.29..0.46], [0.54..0.71], [0.79..0.95]
// so NO shortcut ever bypasses any Tollbooth gate (0.25, 0.50, 0.75, 0.988).
function getShortcutDefs(trackId: TrackId): ShortcutDef[] {
  switch (trackId) {
    case 'hwy99_speedway':
      return [];
    case 'rockport_loop':
      return [{ label: 'HARBOR VILLA SHORTCUT', startProg: 0.80, endProg: 0.94, side: -1, pullFactor: 0.24 }];
    case 'rosewood_park':
      return [{ label: 'COLLEGE QUAD SHORTCUT', startProg: 0.55, endProg: 0.70, side: -1, pullFactor: 0.24 }];
    case 'camden_coast':
      return [{ label: 'CLIFFSIDE VILLA BYPASS', startProg: 0.31, endProg: 0.45, side: 1, pullFactor: 0.24 }];
    case 'rosewood_canyon':
      return [{ label: 'OLD MILL GORGE CUT', startProg: 0.55, endProg: 0.70, side: -1, pullFactor: 0.24 }];
    case 'heritage_forest':
      return [{ label: 'LOGGING TRAIL SHORTCUT', startProg: 0.55, endProg: 0.69, side: 1, pullFactor: 0.20 }];
    case 'gray_point_bay':
      return [{ label: 'HARBOR ALLEY BYPASS', startProg: 0.55, endProg: 0.69, side: -1, pullFactor: 0.22 }];
    case 'silverton_pass':
      return [{ label: 'SLAG PIT BYPASS', startProg: 0.56, endProg: 0.70, side: -1, pullFactor: 0.20 }];
    case 'downtown_labyrinth':
      return [{ label: 'SUBWAY ALLEY SHORTCUT', startProg: 0.29, endProg: 0.44, side: 1, pullFactor: 0.20 }];
    case 'blackridge_summit':
      return [{ label: 'QUARRY SPINE CUT', startProg: 0.55, endProg: 0.69, side: 1, pullFactor: 0.20 }];
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
  const wallBanner = new THREE.Mesh(track(new THREE.PlaneGeometry(7.2, 3.2)), signMat);
  wallBanner.position.set(-1.2, 3.35, -16.0);
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

  const roadHalfWidth = getTrackRoadHalfWidth(trackId);
  const barrierHalfWidth = roadHalfWidth + 2.2;

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

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const pt = spacedPts[i].clone();
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.z < minZ) minZ = pt.z;
    if (pt.z > maxZ) maxZ = pt.z;

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

  const terrainCenterX = (minX + maxX) * 0.5;
  const terrainCenterZ = (minZ + maxZ) * 0.5;
  const terrainSpanW = Math.max(5400, maxX - minX + 3000);
  const terrainSpanD = Math.max(5400, maxZ - minZ + 3000);

  let maxTrackRad = 0;
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const r = Math.hypot(rawSamples[i].point.x - terrainCenterX, rawSamples[i].point.z - terrainCenterZ);
    if (r > maxTrackRad) maxTrackRad = r;
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

  // --- Define Multi-Level High Ridge & Low Underpass Tunnels (Strictly Clear of Tollbooths & Shortcuts) ---
  const tunnelConfigs =
    trackId === 'rockport_loop'
      ? [
          { startIdx: Math.floor(SAMPLE_COUNT * 0.04), len: 24 },
          { startIdx: Math.floor(SAMPLE_COUNT * 0.36), len: 24 },
          { startIdx: Math.floor(SAMPLE_COUNT * 0.63), len: 26 },
        ]
      : trackId === 'camden_coast'
        ? [
            { startIdx: Math.floor(SAMPLE_COUNT * 0.11), len: 24 },
            { startIdx: Math.floor(SAMPLE_COUNT * 0.62), len: 26 },
            { startIdx: Math.floor(SAMPLE_COUNT * 0.83), len: 24 },
          ]
        : trackId === 'downtown_labyrinth'
          ? [
              { startIdx: Math.floor(SAMPLE_COUNT * 0.04), len: 24 },
              { startIdx: Math.floor(SAMPLE_COUNT * 0.62), len: 26 },
              { startIdx: Math.floor(SAMPLE_COUNT * 0.83), len: 26 },
            ]
          : trackId === 'hwy99_speedway' || trackId === 'gray_point_bay' || trackId === 'heritage_forest'
            ? [
                { startIdx: Math.floor(SAMPLE_COUNT * 0.11), len: 26 },
                { startIdx: Math.floor(SAMPLE_COUNT * 0.36), len: 26 },
                { startIdx: Math.floor(SAMPLE_COUNT * 0.83), len: 26 },
              ]
            : trackId === 'rosewood_park'
              ? [
                  { startIdx: Math.floor(SAMPLE_COUNT * 0.05), len: 24 },
                  { startIdx: Math.floor(SAMPLE_COUNT * 0.33), len: 24 },
                  { startIdx: Math.floor(SAMPLE_COUNT * 0.82), len: 24 },
                ]
              : [
                  { startIdx: Math.floor(SAMPLE_COUNT * 0.05), len: 25 },
                  { startIdx: Math.floor(SAMPLE_COUNT * 0.35), len: 26 },
                  { startIdx: Math.floor(SAMPLE_COUNT * 0.83), len: 26 },
                ];

  const isInsideAnyTunnel = (idx: number, margin = 3): boolean =>
    tunnelConfigs.some((tc) => {
      const d = (idx - tc.startIdx + SAMPLE_COUNT) % SAMPLE_COUNT;
      return d <= tc.len + margin || SAMPLE_COUNT - d <= margin;
    });

  // Track occupied feature indices so ramps, traps, breakers, signs, tollbooths never clip
  const occupiedFeatureIndices: number[] = [0]; // Start gantry at 0
  const reserveIdx = (idx: number) => {
    occupiedFeatureIndices.push(idx);
  };

  const shortcutDefs = getShortcutDefs(trackId);
  const shortcutPortalIndices: number[] = [];
  shortcutDefs.forEach((def) => {
    shortcutPortalIndices.push(Math.floor(SAMPLE_COUNT * def.startProg) % SAMPLE_COUNT);
    shortcutPortalIndices.push(Math.floor(SAMPLE_COUNT * def.endProg) % SAMPLE_COUNT);
  });

  const idxDist = (a: number, b: number): number => {
    const raw = Math.abs(a - b);
    return Math.min(raw, SAMPLE_COUNT - raw);
  };

  const resolveClearIdx = (targetProg: number, minGap = 9): number => {
    const baseIdx = Math.floor(SAMPLE_COUNT * targetProg) % SAMPLE_COUNT;
    for (let step = 0; step < 50; step++) {
      const sign = step % 2 === 0 ? 1 : -1;
      const offset = Math.ceil(step / 2) * sign;
      const cand = (baseIdx + offset + SAMPLE_COUNT) % SAMPLE_COUNT;
      if (isInsideAnyTunnel(cand, 4)) continue;
      if (shortcutPortalIndices.some((pi) => idxDist(cand, pi) < 7)) continue;
      if (occupiedFeatureIndices.some((oi) => idxDist(cand, oi) < minGap)) continue;
      return cand;
    }
    return baseIdx;
  };

  // Reserve Tollbooths & Speed Traps priorities first
  const tollProgs = [0.25, 0.5, 0.75, 0.955];
  const tollIndices = tollProgs.map((p) => {
    const idx = Math.floor(SAMPLE_COUNT * p) % SAMPLE_COUNT;
    reserveIdx(idx);
    return idx;
  });

  // --- Build Driveable Shortcut Corridors (Full Barriers + Caps + Retaining Skirts) ---
  const shortcuts: TrackShortcut[] = [];
  const leftBarrierCutout = new Uint8Array(SAMPLE_COUNT);
  const rightBarrierCutout = new Uint8Array(SAMPLE_COUNT);
  const dummy = new THREE.Object3D();

  const barrierTex = track(createBarrierTexture(maxAnisotropy));
  const concreteStructMat = track(
    new THREE.MeshStandardMaterial({ color: '#2B3544', roughness: 0.84, metalness: 0.14, side: THREE.DoubleSide }),
  );
  const steelMat = track(new THREE.MeshStandardMaterial({ color: '#1E293B', metalness: 0.78, roughness: 0.3 }));
  const shortcutSurfaceTex = track(createShortcutSurfaceTexture(maxAnisotropy));
  const shortcutRoadMat = track(
    new THREE.MeshStandardMaterial({
      map: shortcutSurfaceTex,
      roughness: environment === 'overcast_rain' ? 0.44 : 0.74,
      metalness: environment === 'overcast_rain' ? 0.22 : 0.14,
      side: THREE.DoubleSide,
    }),
  );
  const shortcutCurbMat = track(
    new THREE.MeshStandardMaterial({ map: barrierTex, roughness: 0.72, metalness: 0.2, side: THREE.DoubleSide }),
  );
  const gatePlankMat = track(
    new THREE.MeshStandardMaterial({
      color: '#F59E0B',
      emissive: new THREE.Color('#D97706'),
      emissiveIntensity: 0.8,
      roughness: 0.4,
    }),
  );
  const shortcutGlowMat = track(
    new THREE.MeshStandardMaterial({
      color: '#10B981',
      emissive: new THREE.Color('#10B981'),
      emissiveIntensity: 2.8,
    }),
  );
  shortcutDefs.forEach((def, scId) => {
    const corridor = computeShortcutCorridor(samples, roadHalfWidth, barrierHalfWidth, def);
    const {
      scHalfW,
      scSegs,
      startIdx,
      endIdx,
      entryCutStartIdx,
      entryCutEndIdx,
      exitCutStartIdx,
      exitCutEndIdx,
      entryPos,
      exitPos,
      scPts,
      scTangents,
      scRights,
      scSlopePitches,
      innerStartJ,
      innerEndJ,
      innerStartFrac,
      innerEndFrac,
    } = corridor;

    for (let k = -2; k <= 3; k++) {
      const idxA = (startIdx + k + SAMPLE_COUNT) % SAMPLE_COUNT;
      if (def.side < 0) leftBarrierCutout[idxA] = 1;
      else rightBarrierCutout[idxA] = 1;
    }
    for (let k = -3; k <= 2; k++) {
      const idxB = (endIdx + k + SAMPLE_COUNT) % SAMPLE_COUNT;
      if (def.side < 0) leftBarrierCutout[idxB] = 1;
      else rightBarrierCutout[idxB] = 1;
    }

    // 4 crisp transparent glowing road arrows on the approach lane pointing cleanly into the cutout mouth
    const roadArrowTex = track(createRoadShortcutArrowTexture(maxAnisotropy, def.side));
    const roadArrowGeo = track(new THREE.PlaneGeometry(4.4, 5.2));
    roadArrowGeo.rotateX(-Math.PI / 2);
    const roadArrowMat = track(
      new THREE.MeshBasicMaterial({
        map: roadArrowTex,
        transparent: true,
        opacity: 0.96,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    [11, 8, 5, 2].forEach((aheadSteps, aOrd) => {
      const aIdx = (entryCutStartIdx - aheadSteps + SAMPLE_COUNT) % SAMPLE_COUNT;
      const as = samples[aIdx];
      const lat = def.side * (roadHalfWidth - Math.max(1.2, 4.4 - aOrd * 0.95));
      const arrow = new THREE.Mesh(roadArrowGeo, roadArrowMat);
      arrow.position.set(
        as.point.x + as.right.x * lat,
        as.point.y + 0.088 + lat * Math.sin(as.bankAngle),
        as.point.z + as.right.z * lat,
      );
      const yaw = Math.atan2(-as.tangent.x, -as.tangent.z);
      arrow.rotation.set(as.slopePitch, yaw, -as.bankAngle, 'YXZ');
      group.add(arrow);
    });

    // Main-road Advance Overhead Cantilever Sign ~100m upstream of the opening (level grounded upright gantry)
    let advIdx = (entryCutStartIdx - 10 + SAMPLE_COUNT) % SAMPLE_COUNT;
    for (let step = 0; step < 8; step++) {
      const cand = (advIdx - step + SAMPLE_COUNT) % SAMPLE_COUNT;
      if (!isInsideAnyTunnel(cand, 2)) {
        advIdx = cand;
        break;
      }
    }
    const advS = samples[advIdx];
    const advGantry = new THREE.Group();
    advGantry.position.copy(advS.point);
    advGantry.rotation.y = Math.atan2(-advS.tangent.x, -advS.tangent.z);
    const postX = def.side * (barrierHalfWidth + 0.85);
    const advPost = new THREE.Mesh(track(new THREE.BoxGeometry(0.76, 10.6, 0.76)), steelMat);
    advPost.position.set(postX, 3.8, 0);
    const armLen = roadHalfWidth * 1.15;
    const advArm = new THREE.Mesh(track(new THREE.BoxGeometry(armLen, 0.56, 0.56)), steelMat);
    advArm.position.set(postX - def.side * (armLen * 0.5 - 0.25), 7.8, 0);
    const advSignTex = track(createShortcutAdvanceSignTexture(maxAnisotropy, def.label, def.side));
    const advSignMat = track(
      new THREE.MeshStandardMaterial({
        map: advSignTex,
        emissive: new THREE.Color('#10B981'),
        emissiveIntensity: 0.68,
        roughness: 0.32,
      }),
    );
    const advBoard = new THREE.Mesh(
      track(new THREE.BoxGeometry(12.2, 4.4, 0.36)),
      [steelMat, steelMat, steelMat, steelMat, advSignMat, advSignMat],
    );
    advBoard.position.set(def.side * (roadHalfWidth * 0.44), 7.2, 0);
    const beaconPodGeo = track(new THREE.BoxGeometry(0.75, 0.42, 0.5));
    const podA = new THREE.Mesh(beaconPodGeo, shortcutGlowMat);
    podA.position.set(def.side * (roadHalfWidth * 0.44) - 4.8, 9.6, 0);
    const podB = new THREE.Mesh(beaconPodGeo, shortcutGlowMat);
    podB.position.set(def.side * (roadHalfWidth * 0.44) + 4.8, 9.6, 0);
    advGantry.add(advPost, advArm, advBoard, podA, podB);
    group.add(advGantry);

    const scVerts: number[] = [];
    const scUvs: number[] = [];
    const scIndices: number[] = [];
    const scWallVerts: number[] = [];
    const scWallUvs: number[] = [];
    const scWallIndices: number[] = [];
    const scCapVerts: number[] = [];
    const scCapIndices: number[] = [];
    const scDeckVerts: number[] = [];
    const scDeckIndices: number[] = [];
    const scRailVerts: number[] = [];
    const scRailIndices: number[] = [];
    const scReflectorPts: { x: number; y: number; z: number; yaw: number }[] = [];
    const scPierPts: { x: number; y: number; z: number; yaw: number; colH: number }[] = [];

    for (let j = 0; j <= scSegs; j++) {
      const pt = scPts[j];
      const tan = scTangents[j];
      const rgt = scRights[j];

      const lx = pt.x - rgt.x * scHalfW;
      const lz = pt.z - rgt.z * scHalfW;
      const rx = pt.x + rgt.x * scHalfW;
      const rz = pt.z + rgt.z * scHalfW;
      const deckBlend = j <= 3 || j >= scSegs - 3 ? 0.030 : 0.042;
      const y = pt.y + deckBlend;
      const wallTop = y + 1.35;
      const wallBot = y - 1.5;

      scVerts.push(lx, y, lz, rx, y, rz);
      scUvs.push(0, j * 0.45, 1, j * 0.45);
      scWallVerts.push(lx, wallBot, lz, lx, wallTop, lz, rx, wallBot, rz, rx, wallTop, rz);
      scWallUvs.push(j * 0.65, 0, j * 0.65, 1, j * 0.65, 0, j * 0.65, 1);

      const capLOutX = pt.x - rgt.x * (scHalfW + 0.55);
      const capLOutZ = pt.z - rgt.z * (scHalfW + 0.55);
      const capROutX = pt.x + rgt.x * (scHalfW + 0.55);
      const capROutZ = pt.z + rgt.z * (scHalfW + 0.55);
      scCapVerts.push(
        capLOutX, wallTop, capLOutZ,
        lx, wallTop, lz,
        rx, wallTop, rz,
        capROutX, wallTop, capROutZ,
      );

      const deckOutL = scHalfW + 2.2;
      const deckOutR = scHalfW + 2.2;
      const dLX = pt.x - rgt.x * deckOutL;
      const dLZ = pt.z - rgt.z * deckOutL;
      const dRX = pt.x + rgt.x * deckOutR;
      const dRZ = pt.z + rgt.z * deckOutR;
      scDeckVerts.push(
        capLOutX, wallTop, capLOutZ,
        dLX, wallBot - 1.8, dLZ,
        capROutX, wallTop, capROutZ,
        dRX, wallBot - 1.8, dRZ,
      );

      // Top steel guardrail ribbon above concrete barrier for strong edge visibility
      const rLX = pt.x - rgt.x * (scHalfW + 0.14);
      const rLZ = pt.z - rgt.z * (scHalfW + 0.14);
      const rRX = pt.x + rgt.x * (scHalfW + 0.14);
      const rRZ = pt.z + rgt.z * (scHalfW + 0.14);
      scRailVerts.push(
        rLX, wallTop + 0.12, rLZ,
        rLX, wallTop + 0.48, rLZ,
        rRX, wallTop + 0.12, rRZ,
        rRX, wallTop + 0.48, rRZ,
      );

      if (j < scSegs) {
        const b = j * 2;
        scIndices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);

        const buildLeftWall = def.side < 0 || (j >= innerStartJ && j < innerEndJ);
        const buildRightWall = def.side > 0 || (j >= innerStartJ && j < innerEndJ);
        const wb = j * 4;
        if (buildLeftWall) {
          scWallIndices.push(wb, wb + 1, wb + 4, wb + 1, wb + 5, wb + 4);
          scCapIndices.push(wb, wb + 1, wb + 4, wb + 1, wb + 5, wb + 4);
          scDeckIndices.push(wb, wb + 4, wb + 1, wb + 1, wb + 4, wb + 5);
          scRailIndices.push(wb, wb + 1, wb + 4, wb + 1, wb + 5, wb + 4);
        }
        if (buildRightWall) {
          scWallIndices.push(wb + 2, wb + 6, wb + 3, wb + 3, wb + 6, wb + 7);
          scCapIndices.push(wb + 2, wb + 3, wb + 6, wb + 3, wb + 7, wb + 6);
          scDeckIndices.push(wb + 2, wb + 3, wb + 6, wb + 3, wb + 7, wb + 6);
          scRailIndices.push(wb + 2, wb + 6, wb + 3, wb + 3, wb + 6, wb + 7);
        }
      }

      if (j >= 2 && j <= scSegs - 2 && j % 3 === 0) {
        const yaw = Math.atan2(-tan.x, -tan.z);
        if (def.side < 0 || (j >= innerStartJ && j <= innerEndJ)) {
          scReflectorPts.push({ x: capLOutX, y: wallTop + 0.24, z: capLOutZ, yaw });
        }
        if (def.side > 0 || (j >= innerStartJ && j <= innerEndJ)) {
          scReflectorPts.push({ x: capROutX, y: wallTop + 0.24, z: capROutZ, yaw });
        }
      }
      if (j >= 6 && j <= scSegs - 6 && j % 8 === 0 && pt.y > 1.8) {
        const yaw = Math.atan2(-tan.x, -tan.z);
        const colH = pt.y + 6.5;
        scPierPts.push({ x: pt.x - rgt.x * (scHalfW * 0.72), y: pt.y - colH * 0.5 - 1.2, z: pt.z - rgt.z * (scHalfW * 0.72), yaw, colH });
        scPierPts.push({ x: pt.x + rgt.x * (scHalfW * 0.72), y: pt.y - colH * 0.5 - 1.2, z: pt.z + rgt.z * (scHalfW * 0.72), yaw, colH });
      }
    }

    const scGeo = track(new THREE.BufferGeometry());
    scGeo.setAttribute('position', new THREE.Float32BufferAttribute(scVerts, 3));
    scGeo.setAttribute('uv', new THREE.Float32BufferAttribute(scUvs, 2));
    scGeo.setIndex(scIndices);
    scGeo.computeVertexNormals();
    const scMesh = new THREE.Mesh(scGeo, shortcutRoadMat);
    scMesh.receiveShadow = true;
    group.add(scMesh);

    const scWallGeo = track(new THREE.BufferGeometry());
    scWallGeo.setAttribute('position', new THREE.Float32BufferAttribute(scWallVerts, 3));
    scWallGeo.setAttribute('uv', new THREE.Float32BufferAttribute(scWallUvs, 2));
    scWallGeo.setIndex(scWallIndices);
    scWallGeo.computeVertexNormals();
    group.add(new THREE.Mesh(scWallGeo, shortcutCurbMat));

    const scCapGeo = track(new THREE.BufferGeometry());
    scCapGeo.setAttribute('position', new THREE.Float32BufferAttribute(scCapVerts, 3));
    scCapGeo.setIndex(scCapIndices);
    scCapGeo.computeVertexNormals();
    group.add(new THREE.Mesh(scCapGeo, concreteStructMat));

    const scDeckGeo = track(new THREE.BufferGeometry());
    scDeckGeo.setAttribute('position', new THREE.Float32BufferAttribute(scDeckVerts, 3));
    scDeckGeo.setIndex(scDeckIndices);
    scDeckGeo.computeVertexNormals();
    group.add(new THREE.Mesh(scDeckGeo, concreteStructMat));

    const scRailGeo = track(new THREE.BufferGeometry());
    scRailGeo.setAttribute('position', new THREE.Float32BufferAttribute(scRailVerts, 3));
    scRailGeo.setIndex(scRailIndices);
    scRailGeo.computeVertexNormals();
    group.add(new THREE.Mesh(scRailGeo, steelMat));

    if (scReflectorPts.length > 0) {
      const scReflGeo = track(new THREE.BoxGeometry(0.24, 0.24, 0.42));
      const scReflInst = new THREE.InstancedMesh(scReflGeo, shortcutGlowMat, scReflectorPts.length);
      scReflectorPts.forEach((rp, idx) => {
        dummy.position.set(rp.x, rp.y, rp.z);
        dummy.rotation.set(0, rp.yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        scReflInst.setMatrixAt(idx, dummy.matrix);
      });
      scReflInst.instanceMatrix.needsUpdate = true;
      scReflInst.computeBoundingSphere();
      group.add(scReflInst);
    }

    if (scPierPts.length > 0) {
      const scPierGeo = track(new THREE.BoxGeometry(2.4, 1, 2.4));
      const scPiers = new THREE.InstancedMesh(scPierGeo, concreteStructMat, scPierPts.length);
      scPierPts.forEach((pp, idx) => {
        dummy.position.set(pp.x, pp.y, pp.z);
        dummy.rotation.set(0, pp.yaw, 0);
        dummy.scale.set(1, pp.colH, 1);
        dummy.updateMatrix();
        scPiers.setMatrixAt(idx, dummy.matrix);
      });
      scPiers.instanceMatrix.needsUpdate = true;
      scPiers.computeBoundingSphere();
      group.add(scPiers);
    }

    // Impact attenuator barrels + luminous emerald mouth pylons + gore-nose "SHORTCUT IN" sign right at the split!
    const attenGeo = track(new THREE.CylinderGeometry(0.55, 0.65, 1.35, 10));
    const attenMat = track(
      new THREE.MeshStandardMaterial({
        color: '#F59E0B',
        emissive: new THREE.Color('#D97706'),
        emissiveIntensity: 0.48,
        roughness: 0.45,
      }),
    );
    const attenCapMat = track(new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.6 }));
    const attenCapGeo = track(new THREE.CylinderGeometry(0.57, 0.57, 0.22, 10));
    const entryPylonGeo = track(new THREE.CylinderGeometry(0.28, 0.38, 4.8, 10));
    const entryDomeGeo = track(new THREE.SphereGeometry(0.54, 10, 8));
    const mouthSignTex = track(createShortcutSignTexture(maxAnisotropy, def.label, def.side));
    const mouthSignMat = track(
      new THREE.MeshStandardMaterial({
        map: mouthSignTex,
        emissive: new THREE.Color('#10B981'),
        emissiveIntensity: 0.72,
        roughness: 0.3,
      }),
    );

    const bulkheadGeo = track(new THREE.BoxGeometry(0.85, 3.15, 0.85));
    const returnSpanW = Math.max(2.0, roadHalfWidth + scHalfW * 2 - 0.85 - barrierHalfWidth + 0.8);
    const returnWallGeo = track(new THREE.BoxGeometry(returnSpanW, 3.15, 0.85));

    [entryCutStartIdx, entryCutEndIdx, exitCutStartIdx, exitCutEndIdx].forEach((edgeIdx, eOrd) => {
      const es = samples[edgeIdx];
      const lat = def.side * (barrierHalfWidth + 0.18);
      const ax = es.point.x + es.right.x * lat;
      const az = es.point.z + es.right.z * lat;
      const ay = es.point.y + lat * Math.sin(es.bankAngle);
      const drum = new THREE.Mesh(attenGeo, attenMat);
      drum.position.set(ax, ay + 0.67, az);
      const cap = new THREE.Mesh(attenCapGeo, attenCapMat);
      cap.position.set(ax, ay + 1.34, az);
      group.add(drum, cap);

      const bCap = new THREE.Mesh(bulkheadGeo, concreteStructMat);
      bCap.position.set(
        es.point.x + es.right.x * def.side * (barrierHalfWidth + 0.35),
        ay - 0.22,
        es.point.z + es.right.z * def.side * (barrierHalfWidth + 0.35),
      );
      bCap.rotation.y = Math.atan2(-es.tangent.x, -es.tangent.z);
      group.add(bCap);

      if (eOrd === 0 || eOrd === 3) {
        const retLat = def.side * (barrierHalfWidth + returnSpanW * 0.5 - 0.15);
        const rWall = new THREE.Mesh(returnWallGeo, concreteStructMat);
        rWall.position.set(
          es.point.x + es.right.x * retLat,
          ay - 0.22,
          es.point.z + es.right.z * retLat,
        );
        rWall.rotation.y = Math.atan2(-es.tangent.x, -es.tangent.z);
        group.add(rWall);
      }

      if (eOrd < 2) {
        const pyLat = def.side * (barrierHalfWidth + 0.95);
        const px = es.point.x + es.right.x * pyLat;
        const pz = es.point.z + es.right.z * pyLat;
        const py = es.point.y + pyLat * Math.sin(es.bankAngle);
        const pylon = new THREE.Mesh(entryPylonGeo, steelMat);
        pylon.position.set(px, py + 2.4, pz);
        const dome = new THREE.Mesh(entryDomeGeo, shortcutGlowMat);
        dome.position.set(px, py + 4.95, pz);
        group.add(pylon, dome);

        // Angled Gore-Split Sign right at the downstream mouth edge so drivers see the opening head-on
        if (eOrd === 1) {
          const goreSignG = new THREE.Group();
          goreSignG.position.set(px, py + 3.4, pz);
          goreSignG.rotation.y = Math.atan2(-es.tangent.x, -es.tangent.z) - def.side * 0.24;
          const goreBoard = new THREE.Mesh(
            track(new THREE.BoxGeometry(6.8, 2.55, 0.3)),
            [steelMat, steelMat, steelMat, steelMat, mouthSignMat, mouthSignMat],
          );
          goreSignG.add(goreBoard);
          group.add(goreSignG);
        }
      }
    });

    // Mid-shortcut overhead steel light arch for clear industrial depth
    const midScIdx = Math.floor(scSegs * 0.5);
    const midScPt = scPts[midScIdx];
    const midScTan = scTangents[midScIdx];
    const scArch = new THREE.Group();
    scArch.position.copy(midScPt);
    scArch.rotation.y = Math.atan2(-midScTan.x, -midScTan.z);
    const archPillarGeo = track(new THREE.BoxGeometry(0.55, 5.6, 0.55));
    const apL = new THREE.Mesh(archPillarGeo, steelMat);
    apL.position.set(-scHalfW - 0.15, 2.8, 0);
    const apR = new THREE.Mesh(archPillarGeo, steelMat);
    apR.position.set(scHalfW + 0.15, 2.8, 0);
    const apTop = new THREE.Mesh(track(new THREE.BoxGeometry(scHalfW * 2 + 1.0, 0.5, 0.55)), steelMat);
    apTop.position.set(0, 5.5, 0);
    const apGlow = new THREE.Mesh(track(new THREE.BoxGeometry(scHalfW * 1.75, 0.22, 0.32)), shortcutGlowMat);
    apGlow.position.set(0, 5.18, 0);
    scArch.add(apL, apR, apTop, apGlow);
    group.add(scArch);

    const planks: ShortcutGatePlank[] = [];
    const postGeo = track(new THREE.BoxGeometry(0.5, 5.6, 0.5));
    const beaconBarGeo = track(new THREE.BoxGeometry(scHalfW * 2 + 1.4, 0.48, 0.48));
    const plankGeo1 = track(new THREE.BoxGeometry(scHalfW * 1.78, 0.42, 0.26));
    const plankGeo2 = track(new THREE.BoxGeometry(scHalfW * 1.78, 0.36, 0.26));

    // Place portal gantries immediately at innerStartJ+1 & innerEndJ-1 (visible right from the main road!)
    const entryGateIdx = Math.min(scSegs - 10, innerStartJ + 1);
    const exitGateIdx = Math.max(entryGateIdx + 6, innerEndJ - 1);
    const scSignGeo = track(new THREE.BoxGeometry(10.6, 3.0, 0.34));

    [
      { pt: scPts[entryGateIdx], tan: scTangents[entryGateIdx], isEntry: true },
      { pt: scPts[exitGateIdx], tan: scTangents[exitGateIdx], isEntry: false },
    ].forEach((endSpec) => {
      const gateG = new THREE.Group();
      gateG.position.copy(endSpec.pt);
      gateG.rotation.y = Math.atan2(-endSpec.tan.x, -endSpec.tan.z);

      const post1 = new THREE.Mesh(postGeo, shortcutCurbMat);
      post1.position.set(-scHalfW - 0.3, 2.8, 0);
      const post2 = new THREE.Mesh(postGeo, shortcutCurbMat);
      post2.position.set(scHalfW + 0.3, 2.8, 0);

      const beaconBar = new THREE.Mesh(beaconBarGeo, shortcutGlowMat);
      beaconBar.position.set(0, 5.4, 0);

      const plank1 = new THREE.Mesh(plankGeo1, gatePlankMat);
      plank1.position.set(0, 0.72, 0);
      planks.push({
        mesh: plank1,
        homePos: plank1.position.clone(),
        vel: new THREE.Vector3(),
        rotVel: new THREE.Vector3(),
        smashed: false,
        respawnTimer: 0,
      });
      gateG.add(post1, post2, beaconBar, plank1);

      if (endSpec.isEntry) {
        const entrySign = new THREE.Mesh(scSignGeo, [steelMat, steelMat, steelMat, steelMat, mouthSignMat, mouthSignMat]);
        entrySign.position.set(0, 7.15, 0);
        gateG.add(entrySign);

        const plank2 = new THREE.Mesh(plankGeo2, gatePlankMat);
        plank2.position.set(0, 1.32, 0);
        planks.push({
          mesh: plank2,
          homePos: plank2.position.clone(),
          vel: new THREE.Vector3(),
          rotVel: new THREE.Vector3(),
          smashed: false,
          respawnTimer: 0,
        });
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
      entryCutStartIdx,
      entryCutEndIdx,
      exitCutStartIdx,
      exitCutEndIdx,
      innerStartFrac,
      innerEndFrac,
      side: def.side,
      halfWidth: scHalfW,
      points: scPts,
      tangents: scTangents,
      slopePitches: scSlopePitches,
      entryPos,
      exitPos,
      planks,
      minimapPoints,
    });
  });

  // Fast Spatial-Grid Exact Track + Shortcut Terrain Query (Eliminates any terrain triangle poking through road or shortcut)
  const TERRAIN_CELL = 64;
  const gridKey = (cx: number, cz: number) => cx * 8192 + cz;
  const mainSampleGrid = new Map<number, number[]>();
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const cx = Math.floor(samples[i].point.x / TERRAIN_CELL);
    const cz = Math.floor(samples[i].point.z / TERRAIN_CELL);
    const k = gridKey(cx, cz);
    const arr = mainSampleGrid.get(k);
    if (arr) arr.push(i);
    else mainSampleGrid.set(k, [i]);
  }
  const scSegGrid = new Map<number, { scIdx: number; j: number }[]>();
  for (let scIdx = 0; scIdx < shortcuts.length; scIdx++) {
    const pts = shortcuts[scIdx].points;
    for (let j = 0; j < pts.length - 1; j++) {
      const mx = (pts[j].x + pts[j + 1].x) * 0.5;
      const mz = (pts[j].z + pts[j + 1].z) * 0.5;
      const cx = Math.floor(mx / TERRAIN_CELL);
      const cz = Math.floor(mz / TERRAIN_CELL);
      const k = gridKey(cx, cz);
      const arr = scSegGrid.get(k);
      if (arr) arr.push({ scIdx, j });
      else scSegGrid.set(k, [{ scIdx, j }]);
    }
  }

  const hasHarborBay =
    trackId === 'rockport_loop' || trackId === 'camden_coast' || trackId === 'gray_point_bay';
  const isCanyonOrSummit = trackId === 'rosewood_canyon' || trackId === 'blackridge_summit';
  const isForestTrack = trackId === 'heritage_forest' || trackId === 'rosewood_park';

  const waterCenterX = terrainCenterX + 80;
  const waterCenterZ = minZ - 140;

  const sampleTerrainInfo = (wx: number, wz: number): { height: number; distToTrack: number } => {
    const cx = Math.floor(wx / TERRAIN_CELL);
    const cz = Math.floor(wz / TERRAIN_CELL);

    let minMainDistSq = Infinity;
    let nearestMainY = 0;
    let minScDistSq = Infinity;
    let nearestScY = 0;
    let minNearbyRoadY = Infinity;
    const ceilingRadiusSq = 48 * 48;

    for (let dxC = -2; dxC <= 2; dxC++) {
      for (let dzC = -2; dzC <= 2; dzC++) {
        const k = gridKey(cx + dxC, cz + dzC);
        const mArr = mainSampleGrid.get(k);
        if (mArr) {
          for (let n = 0; n < mArr.length; n++) {
            const idx = mArr[n];
            const pA = samples[idx].point;
            const pB = samples[(idx + 1) % SAMPLE_COUNT].point;
            const abx = pB.x - pA.x;
            const abz = pB.z - pA.z;
            const lenSq = abx * abx + abz * abz || 1;
            const segT = THREE.MathUtils.clamp(((wx - pA.x) * abx + (wz - pA.z) * abz) / lenSq, 0, 1);
            const px = pA.x + abx * segT;
            const pz = pA.z + abz * segT;
            const py = THREE.MathUtils.lerp(pA.y, pB.y, segT);
            const dSq = (wx - px) * (wx - px) + (wz - pz) * (wz - pz);
            if (dSq < minMainDistSq) {
              minMainDistSq = dSq;
              nearestMainY = py;
            }
            if (dSq < ceilingRadiusSq && py < minNearbyRoadY) {
              minNearbyRoadY = py;
            }
          }
        }
        const sArr = scSegGrid.get(k);
        if (sArr) {
          for (let n = 0; n < sArr.length; n++) {
            const { scIdx, j } = sArr[n];
            const pts = shortcuts[scIdx].points;
            const a = pts[j];
            const b = pts[j + 1];
            const abx = b.x - a.x;
            const abz = b.z - a.z;
            const lenSq = abx * abx + abz * abz || 1;
            const segT = THREE.MathUtils.clamp(((wx - a.x) * abx + (wz - a.z) * abz) / lenSq, 0, 1);
            const px = a.x + abx * segT;
            const pz = a.z + abz * segT;
            const py = THREE.MathUtils.lerp(a.y, b.y, segT);
            const dSq = (wx - px) * (wx - px) + (wz - pz) * (wz - pz);
            if (dSq < minScDistSq) {
              minScDistSq = dSq;
              nearestScY = py;
            }
            if (dSq < ceilingRadiusSq && py < minNearbyRoadY) {
              minNearbyRoadY = py;
            }
          }
        }
      }
    }

    const mainDist = minMainDistSq < Infinity ? Math.sqrt(minMainDistSq) : 400;
    const scDist = minScDistSq < Infinity ? Math.sqrt(minScDistSq) : 400;
    const mainEdge = mainDist - barrierHalfWidth;
    const scEdge = scDist - 8.5;
    const useSc = scEdge < mainEdge;
    const edgeClearance = useSc ? scEdge : mainEdge;
    const nearestRoadY = useSc ? nearestScY : nearestMainY;

    const isHarborWater = hasHarborBay && wz < minZ + 380 && wx > minX - 100 && wx < maxX + 180;
    const roadSupportY = isHarborWater ? -6.2 : nearestRoadY - 1.15;

    if (edgeClearance < 22) {
      const clampedY = minNearbyRoadY < Infinity && !isHarborWater ? Math.min(roadSupportY, minNearbyRoadY - 1.15) : roadSupportY;
      return { height: clampedY, distToTrack: mainDist };
    }

    const blend = THREE.MathUtils.smoothstep(edgeClearance, 22, 82);
    const ridgeScale =
      isCanyonOrSummit
        ? 1.75
        : trackId === 'silverton_pass'
          ? 1.25
          : trackId === 'camden_coast' || trackId === 'gray_point_bay'
            ? 1.08
            : 0.92;
    const rawHill =
      (Math.sin(wx * 0.0044) * Math.cos(wz * 0.0038) * 19 +
        Math.sin(wx * 0.011 + wz * 0.0072) * 8.5 +
        Math.cos(wx * 0.0022 + wz * 0.0026) * 14 +
        15) *
      ridgeScale;

    const targetHill = isHarborWater ? -6.2 : Math.max(-0.35, rawHill);
    let finalH = THREE.MathUtils.lerp(roadSupportY, targetHill, blend);
    if (!isHarborWater && minNearbyRoadY < Infinity && edgeClearance < 46) {
      finalH = Math.min(finalH, minNearbyRoadY - 1.15);
    }
    return {
      height: finalH,
      distToTrack: mainDist,
    };
  };

  // --- 1. Environment-Adapted Terrain + Dynamic Harbor Bay ---
  const groundTex = track(createGroundTerrainTexture(maxAnisotropy));
  const groundGeo = track(new THREE.PlaneGeometry(terrainSpanW, terrainSpanD, 176, 176));
  groundGeo.rotateX(-Math.PI / 2);

  const posAttr = groundGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);

  const envTint =
    environment === 'midnight_neon'
      ? { low: '#0C121D', mid: '#141D2B', high: '#1E293B', skirt: '#0B101A' }
      : environment === 'overcast_rain'
        ? { low: '#1E272E', mid: '#2E3B42', high: '#435058', skirt: '#1C252C' }
        : environment === 'dawn_mist'
          ? { low: '#1F3B30', mid: '#325A49', high: '#4D7C65', skirt: '#1C332A' }
          : environment === 'crimson_foundry'
            ? { low: '#2A191A', mid: '#4E2722', high: '#6E3A2D', skirt: '#251718' }
            : environment === 'canyon_sun'
              ? { low: '#8C431C', mid: '#C46427', high: '#E08A44', skirt: '#703516' }
              : environment === 'mediterranean_day'
                ? { low: '#366832', mid: '#568D45', high: '#7AA85B', skirt: '#2C5629' }
                : environment === 'noon_clear'
                  ? {
                      low: isCanyonOrSummit ? '#73502D' : '#2E562D',
                      mid: isCanyonOrSummit ? '#B2723B' : '#45783E',
                      high: isCanyonOrSummit ? '#D99450' : '#639452',
                      skirt: isCanyonOrSummit ? '#654627' : '#294B28',
                    }
                  : {
                      low: isCanyonOrSummit ? '#5C4024' : isForestTrack ? '#28402F' : '#2E3845',
                      mid: isCanyonOrSummit ? '#9D602E' : isForestTrack ? '#3C5E44' : '#555246',
                      high: isCanyonOrSummit ? '#D07F34' : isForestTrack ? '#5F8456' : '#77664F',
                      skirt: isCanyonOrSummit ? '#523A22' : '#262F38',
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

    const hNorm = THREE.MathUtils.clamp((tInfo.height + 2) / 42, 0, 1);
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

  const skirtGeo = track(new THREE.PlaneGeometry(14000, 14000));
  skirtGeo.rotateX(-Math.PI / 2);
  const skirtMat = track(new THREE.MeshStandardMaterial({ color: envTint.skirt, roughness: 0.96 }));
  const skirtMesh = new THREE.Mesh(skirtGeo, skirtMat);
  skirtMesh.position.set(terrainCenterX, -4.5, terrainCenterZ);
  group.add(skirtMesh);

  if (hasHarborBay) {
    const waterGeo = track(new THREE.PlaneGeometry(7600, 3800));
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = track(
      new THREE.MeshStandardMaterial({
        color:
          environment === 'midnight_neon'
            ? '#071B30'
            : environment === 'mediterranean_day'
              ? '#0284C7'
              : environment === 'noon_clear'
                ? '#0E6CA8'
                : '#0C3454',
        roughness: 0.08,
        metalness: 0.88,
      }),
    );
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.set(waterCenterX, -2.8, waterCenterZ - 350);
    group.add(water);
  }

  // --- 2. 4-Lane Banked Highway Ribbon + Curbs + Jersey Barriers ---
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
  const asphaltVariant: AsphaltVariant =
    trackId === 'hwy99_speedway'
      ? 'interstate'
      : trackId === 'rosewood_canyon' || trackId === 'blackridge_summit'
        ? 'canyon'
        : trackId === 'downtown_labyrinth'
          ? 'city_wet'
          : trackId === 'silverton_pass'
            ? 'industrial'
            : 'standard';
  const roadTex = track(createAsphaltTexture(maxAnisotropy, asphaltVariant));
  const roadNormalTex = track(createAsphaltNormalTexture(maxAnisotropy));
  const roadRoughTex = track(
    isWet ? createWetAsphaltRoughnessTexture(maxAnisotropy) : createAsphaltRoughnessTexture(maxAnisotropy),
  );
  const uvStep = totalLength / SAMPLE_COUNT / 14;
  const railVerts: number[] = [];
  const railIndices: number[] = [];

  for (let i = 0; i <= SAMPLE_COUNT; i++) {
    const sIdx = i % SAMPLE_COUNT;
    const s = samples[sIdx];
    const vCoord = i * uvStep;
    const bankSlope = Math.sin(s.bankAngle);

    const yRoadL = s.point.y + 0.04 - roadHalfWidth * bankSlope;
    const yRoadR = s.point.y + 0.04 + roadHalfWidth * bankSlope;
    const yCurbOutL = s.point.y + 0.048 - barrierHalfWidth * bankSlope;
    const yCurbOutR = s.point.y + 0.048 + barrierHalfWidth * bankSlope;

    const lx = s.point.x - s.right.x * roadHalfWidth;
    const lz = s.point.z - s.right.z * roadHalfWidth;
    const rx = s.point.x + s.right.x * roadHalfWidth;
    const rz = s.point.z + s.right.z * roadHalfWidth;

    roadVerts.push(lx, yRoadL, lz, rx, yRoadR, rz);
    roadUvs.push(0, vCoord, 1, vCoord);

    if (i < SAMPLE_COUNT) {
      const base = i * 2;
      roadIndices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }

    const clOutX = s.point.x - s.right.x * barrierHalfWidth;
    const clOutZ = s.point.z - s.right.z * barrierHalfWidth;
    const crOutX = s.point.x + s.right.x * barrierHalfWidth;
    const crOutZ = s.point.z + s.right.z * barrierHalfWidth;

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

    const wallHL = yCurbOutL + 1.35;
    const wallHR = yCurbOutR + 1.35;
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

    const capW = barrierHalfWidth + 0.65;
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
    const deckOuter = barrierHalfWidth + 2.4;
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

    // Continuous heavy metallic W-Beam steel guardrail + elevated top parapet rail above concrete barrier
    const railInnerX_L = s.point.x - s.right.x * (barrierHalfWidth + 0.12);
    const railInnerZ_L = s.point.z - s.right.z * (barrierHalfWidth + 0.12);
    const railInnerX_R = s.point.x + s.right.x * (barrierHalfWidth + 0.12);
    const railInnerZ_R = s.point.z + s.right.z * (barrierHalfWidth + 0.12);
    const isBridgeSpan = s.point.y > 3.5 || samples[nextIdx].point.y > 3.5;
    const upperRailOffset = isBridgeSpan ? 0.92 : 0.44;
    railVerts.push(
      railInnerX_L, wallHL + 0.12, railInnerZ_L,
      railInnerX_L, wallHL + upperRailOffset, railInnerZ_L,
      railInnerX_R, wallHL + 0.12, railInnerZ_R,
      railInnerX_R, wallHL + upperRailOffset, railInnerZ_R,
    );
    if (i < SAMPLE_COUNT) {
      const inTun = isInsideAnyTunnel(sIdx, 0);
      const rBase = i * 4;
      if (!skipLeftBarrier && !inTun) {
        railIndices.push(rBase, rBase + 1, rBase + 4, rBase + 1, rBase + 5, rBase + 4);
      }
      if (!skipRightBarrier && !inTun) {
        railIndices.push(rBase + 2, rBase + 6, rBase + 3, rBase + 3, rBase + 6, rBase + 7);
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
      roughness: environment === 'overcast_rain' ? 0.46 : environment === 'midnight_neon' ? 0.54 : 0.78,
      metalness: environment === 'overcast_rain' ? 0.20 : environment === 'midnight_neon' ? 0.16 : 0.12,
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

  const railGeo = track(new THREE.BufferGeometry());
  railGeo.setAttribute('position', new THREE.Float32BufferAttribute(railVerts, 3));
  railGeo.setIndex(railIndices);
  railGeo.computeVertexNormals();
  const railMat = track(
    new THREE.MeshStandardMaterial({ color: '#94A3B8', metalness: 0.85, roughness: 0.25, side: THREE.DoubleSide }),
  );
  group.add(new THREE.Mesh(railGeo, railMat));

  // Textured Outer Shoulder / Verge Embankment blending barriers smoothly into ground
  const vergeVerts: number[] = [];
  const vergeUvs: number[] = [];
  const vergeIndices: number[] = [];
  for (let i = 0; i <= SAMPLE_COUNT; i++) {
    const sIdx = i % SAMPLE_COUNT;
    const s = samples[sIdx];
    const bankSlope = Math.sin(s.bankAngle);
    const vCoord = i * uvStep * 0.6;
    const innerEdge = barrierHalfWidth + 1.8;
    const outerEdge = barrierHalfWidth + 22.0;

    const inLX = s.point.x - s.right.x * innerEdge;
    const inLZ = s.point.z - s.right.z * innerEdge;
    const outLX = s.point.x - s.right.x * outerEdge;
    const outLZ = s.point.z - s.right.z * outerEdge;
    const inLY = s.point.y - 0.12 - barrierHalfWidth * bankSlope;
    const outLY = Math.min(inLY - 0.35, sampleTerrainInfo(outLX, outLZ).height - 0.15);

    const inRX = s.point.x + s.right.x * innerEdge;
    const inRZ = s.point.z + s.right.z * innerEdge;
    const outRX = s.point.x + s.right.x * outerEdge;
    const outRZ = s.point.z + s.right.z * outerEdge;
    const inRY = s.point.y - 0.12 + barrierHalfWidth * bankSlope;
    const outRY = Math.min(inRY - 0.35, sampleTerrainInfo(outRX, outRZ).height - 0.15);

    vergeVerts.push(inLX, inLY, inLZ, outLX, outLY, outLZ, inRX, inRY, inRZ, outRX, outRY, outRZ);
    vergeUvs.push(0, vCoord, 1, vCoord, 0, vCoord, 1, vCoord);

    if (i < SAMPLE_COUNT) {
      const nextIdx = (i + 1) % SAMPLE_COUNT;
      const skipL = leftBarrierCutout[sIdx] === 1 && leftBarrierCutout[nextIdx] === 1;
      const skipR = rightBarrierCutout[sIdx] === 1 && rightBarrierCutout[nextIdx] === 1;
      let isElevatedSpan = s.point.y > 4.2 || samples[nextIdx].point.y > 4.2;
      if (!isElevatedSpan) {
        for (let oi = 0; oi < SAMPLE_COUNT; oi += 4) {
          const dIdx = Math.min(Math.abs(oi - sIdx), SAMPLE_COUNT - Math.abs(oi - sIdx));
          if (dIdx < 16) continue;
          const os = samples[oi];
          if (
            Math.hypot(s.point.x - os.point.x, s.point.z - os.point.z) < barrierHalfWidth + 6.5 &&
            Math.abs(os.point.y - s.point.y) > 4.0
          ) {
            isElevatedSpan = true;
            break;
          }
        }
      }
      const inWaterL = hasHarborBay && s.point.y > 4 && outLZ < minZ + 380 && outLX > minX - 100 && outLX < maxX + 180;
      const inWaterR = hasHarborBay && s.point.y > 4 && outRZ < minZ + 380 && outRX > minX - 100 && outRX < maxX + 180;
      const vb = i * 4;
      if (!skipL && !inWaterL && !isElevatedSpan) {
        vergeIndices.push(vb, vb + 4, vb + 1, vb + 1, vb + 4, vb + 5);
      }
      if (!skipR && !inWaterR && !isElevatedSpan) {
        vergeIndices.push(vb + 2, vb + 3, vb + 6, vb + 3, vb + 7, vb + 6);
      }
    }
  }
  if (vergeIndices.length > 0) {
    const vergeGeo = track(new THREE.BufferGeometry());
    vergeGeo.setAttribute('position', new THREE.Float32BufferAttribute(vergeVerts, 3));
    vergeGeo.setAttribute('uv', new THREE.Float32BufferAttribute(vergeUvs, 2));
    vergeGeo.setIndex(vergeIndices);
    vergeGeo.computeVertexNormals();
    const vergeMat = track(
      new THREE.MeshStandardMaterial({
        map: groundTex,
        color: lowColor.clone().lerp(midColor, 0.45),
        roughness: 0.94,
        metalness: 0.04,
        side: THREE.DoubleSide,
      }),
    );
    const vergeMesh = new THREE.Mesh(vergeGeo, vergeMat);
    vergeMesh.receiveShadow = true;
    group.add(vergeMesh);
  }

  // Reflective Highway Cat-Eye Studs (Amber Centerline + Crisp White/Cyan Lane-Edge Studs)
  const studCount = Math.floor(SAMPLE_COUNT / 4);
  const studGeo = track(new THREE.BoxGeometry(0.22, 0.06, 0.35));
  const studMat = track(
    new THREE.MeshStandardMaterial({
      color: '#FDE68A',
      emissive: new THREE.Color('#F59E0B'),
      emissiveIntensity: environment === 'midnight_neon' ? 3.2 : 2.0,
    }),
  );
  const edgeStudMat = track(
    new THREE.MeshStandardMaterial({
      color: '#E0F2FE',
      emissive: new THREE.Color(environment === 'midnight_neon' ? '#38BDF8' : '#E2E8F0'),
      emissiveIntensity: environment === 'midnight_neon' ? 2.8 : 1.4,
    }),
  );
  const studsInst = new THREE.InstancedMesh(studGeo, studMat, studCount * 2);
  const edgeStudsInst = new THREE.InstancedMesh(studGeo, edgeStudMat, studCount * 2);
  const edgeStudLat = roadHalfWidth * 0.88;
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
    [-edgeStudLat, edgeStudLat].forEach((lat, sideIdx) => {
      dummy.position.set(
        s.point.x + s.right.x * lat,
        s.point.y + 0.056 + lat * bankSlope,
        s.point.z + s.right.z * lat,
      );
      dummy.rotation.set(s.slopePitch, yaw, -s.bankAngle, 'YXZ');
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      edgeStudsInst.setMatrixAt(i * 2 + sideIdx, dummy.matrix);
    });
  }
  studsInst.instanceMatrix.needsUpdate = true;
  studsInst.computeBoundingSphere();
  edgeStudsInst.instanceMatrix.needsUpdate = true;
  edgeStudsInst.computeBoundingSphere();
  group.add(studsInst, edgeStudsInst);

  // Outer Concrete Barrier Guardrail Posts & Reflective Border Markers (every 2 samples for dense trackside boundaries)
  const postItems: { x: number; y: number; z: number; yaw: number; elevated: boolean }[] = [];
  for (let i = 0; i < SAMPLE_COUNT; i += 2) {
    if (isInsideAnyTunnel(i, 1)) continue;
    const s = samples[i];
    const yaw = Math.atan2(-s.tangent.x, -s.tangent.z);
    const bankSlope = Math.sin(s.bankAngle);
    const elevated = s.point.y > 3.5;
    if (leftBarrierCutout[i] === 0) {
      postItems.push({
        x: s.point.x - s.right.x * (barrierHalfWidth + 0.32),
        y: s.point.y + 1.35 - barrierHalfWidth * bankSlope,
        z: s.point.z - s.right.z * (barrierHalfWidth + 0.32),
        yaw,
        elevated,
      });
    }
    if (rightBarrierCutout[i] === 0) {
      postItems.push({
        x: s.point.x + s.right.x * (barrierHalfWidth + 0.32),
        y: s.point.y + 1.35 + barrierHalfWidth * bankSlope,
        z: s.point.z + s.right.z * (barrierHalfWidth + 0.32),
        yaw,
        elevated,
      });
    }
  }
  if (postItems.length > 0) {
    const grPostGeo = track(new THREE.BoxGeometry(0.18, 0.92, 0.26));
    const grReflGeo = track(new THREE.BoxGeometry(0.24, 0.16, 0.3));
    const grPostMat = track(new THREE.MeshStandardMaterial({ color: '#475569', metalness: 0.72, roughness: 0.34 }));
    const grReflMat = track(
      new THREE.MeshStandardMaterial({
        color: '#FBBF24',
        emissive: new THREE.Color('#F59E0B'),
        emissiveIntensity: environment === 'midnight_neon' ? 3.4 : 2.1,
      }),
    );
    const grPosts = new THREE.InstancedMesh(grPostGeo, grPostMat, postItems.length);
    const grRefls = new THREE.InstancedMesh(grReflGeo, grReflMat, postItems.length);
    postItems.forEach((pi, idx) => {
      const hScale = pi.elevated ? 1.0 : 0.56;
      dummy.position.set(pi.x, pi.y + 0.44 * hScale, pi.z);
      dummy.rotation.set(0, pi.yaw, 0);
      dummy.scale.set(1, hScale, 1);
      dummy.updateMatrix();
      grPosts.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(pi.x, pi.y + (pi.elevated ? 0.92 : 0.48), pi.z);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      grRefls.setMatrixAt(idx, dummy.matrix);
    });
    grPosts.instanceMatrix.needsUpdate = true;
    grRefls.instanceMatrix.needsUpdate = true;
    grPosts.computeBoundingSphere();
    grRefls.computeBoundingSphere();
    group.add(grPosts, grRefls);
  }

  // --- Helpers: Strict Segment-Based Shortcut & Track Clearance Queries ---
  const isClearOfShortcuts = (x: number, z: number, extraMargin = 7): boolean => {
    for (let sc = 0; sc < shortcuts.length; sc++) {
      const sObj = shortcuts[sc];
      const limitSq = (sObj.halfWidth + extraMargin) * (sObj.halfWidth + extraMargin);
      const pts = sObj.points;
      for (let j = 0; j < pts.length - 1; j++) {
        const a = pts[j];
        const b = pts[j + 1];
        const abx = b.x - a.x;
        const abz = b.z - a.z;
        const lenSq = abx * abx + abz * abz || 1;
        const segT = THREE.MathUtils.clamp(((x - a.x) * abx + (z - a.z) * abz) / lenSq, 0, 1);
        const px = a.x + abx * segT;
        const pz = a.z + abz * segT;
        const dx = x - px;
        const dz = z - pz;
        if (dx * dx + dz * dz < limitSq) return false;
      }
    }
    return true;
  };

  const isClearOfTrack = (x: number, z: number, minDist: number): boolean => {
    const minSq = minDist * minDist;
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const dx = x - samples[i].point.x;
      const dz = z - samples[i].point.z;
      if (dx * dx + dz * dz < minSq) return false;
    }
    const extraScMargin = Math.max(10, minDist - barrierHalfWidth + 10);
    if (!isClearOfShortcuts(x, z, extraScMargin)) return false;
    return true;
  };

  const isNearShortcutPortal = (idx: number, minSampleDist = 7): boolean =>
    shortcutPortalIndices.some((pi) => idxDist(idx, pi) < minSampleDist);

  // Viaduct Support Columns, Footings, Box-Girder Bridge Soffit & Cross-Girder Caps
  const soffitVerts: number[] = [];
  const soffitIndices: number[] = [];
  for (let i = 0; i <= SAMPLE_COUNT; i++) {
    const s = samples[i % SAMPLE_COUNT];
    const bankSlope = Math.sin(s.bankAngle);
    const outW = barrierHalfWidth + 2.4;
    const boxW = roadHalfWidth * 0.72;
    const soffitY = s.point.y - 2.35;
    const sideDropY = s.point.y - 1.55;
    soffitVerts.push(
      s.point.x - s.right.x * outW, sideDropY - outW * bankSlope, s.point.z - s.right.z * outW,
      s.point.x - s.right.x * boxW, soffitY - boxW * bankSlope, s.point.z - s.right.z * boxW,
      s.point.x + s.right.x * boxW, soffitY + boxW * bankSlope, s.point.z + s.right.z * boxW,
      s.point.x + s.right.x * outW, sideDropY + outW * bankSlope, s.point.z + s.right.z * outW,
    );
    if (i < SAMPLE_COUNT) {
      const nextIdx = (i + 1) % SAMPLE_COUNT;
      if (s.point.y > 4.2 || samples[nextIdx].point.y > 4.2) {
        const sb = i * 4;
        soffitIndices.push(
          sb, sb + 1, sb + 4, sb + 1, sb + 5, sb + 4,
          sb + 1, sb + 2, sb + 5, sb + 2, sb + 6, sb + 5,
          sb + 2, sb + 3, sb + 6, sb + 3, sb + 7, sb + 6,
        );
      }
    }
  }
  if (soffitIndices.length > 0) {
    const soffitGeo = track(new THREE.BufferGeometry());
    soffitGeo.setAttribute('position', new THREE.Float32BufferAttribute(soffitVerts, 3));
    soffitGeo.setIndex(soffitIndices);
    soffitGeo.computeVertexNormals();
    group.add(new THREE.Mesh(soffitGeo, concreteStructMat));
  }

  const pierGeo = track(new THREE.BoxGeometry(3.2, 1, 3.2));
  const pierFootingGeo = track(new THREE.BoxGeometry(4.8, 1.8, 4.8));
  const pierCapGeo = track(new THREE.BoxGeometry(roadHalfWidth * 1.9, 1.5, 3.0));
  const straddleSpanHalf = barrierHalfWidth + 13.5;
  const straddleCapGeo = track(new THREE.BoxGeometry(straddleSpanHalf * 2 + 3.6, 1.65, 3.4));
  const standardPierSamples: TrackSample[] = [];
  const straddlePierSamples: TrackSample[] = [];

  for (let idx = 0; idx < SAMPLE_COUNT; idx++) {
    if (idx % 14 !== 0) continue;
    const s = samples[idx];
    if (s.point.y <= 3.6) continue;
    if (!isClearOfShortcuts(s.point.x, s.point.z, roadHalfWidth + 5)) continue;

    let hasLowerUnderneath = false;
    for (let oi = 0; oi < SAMPLE_COUNT; oi += 3) {
      if (idxDist(idx, oi) < 16) continue;
      const os = samples[oi];
      if (
        os.point.y < s.point.y - 3.5 &&
        Math.hypot(s.point.x - os.point.x, s.point.z - os.point.z) < barrierHalfWidth * 2 + 7.5
      ) {
        hasLowerUnderneath = true;
        break;
      }
    }

    if (!hasLowerUnderneath) {
      standardPierSamples.push(s);
    } else {
      // Check if wide straddle portal legs clear the lower roadway cleanly
      const lx = s.point.x - s.right.x * straddleSpanHalf;
      const lz = s.point.z - s.right.z * straddleSpanHalf;
      const rx = s.point.x + s.right.x * straddleSpanHalf;
      const rz = s.point.z + s.right.z * straddleSpanHalf;
      let legsClear = true;
      for (let oi = 0; oi < SAMPLE_COUNT; oi += 2) {
        if (idxDist(idx, oi) < 14) continue;
        const os = samples[oi];
        if (os.point.y >= s.point.y - 2.0) continue;
        if (
          Math.hypot(lx - os.point.x, lz - os.point.z) < barrierHalfWidth + 3.2 ||
          Math.hypot(rx - os.point.x, rz - os.point.z) < barrierHalfWidth + 3.2
        ) {
          legsClear = false;
          break;
        }
      }
      if (legsClear) straddlePierSamples.push(s);
    }
  }

  if (standardPierSamples.length > 0) {
    const piers = new THREE.InstancedMesh(pierGeo, concreteStructMat, standardPierSamples.length * 2);
    const pierFootings = new THREE.InstancedMesh(pierFootingGeo, concreteStructMat, standardPierSamples.length * 2);
    const pierCaps = new THREE.InstancedMesh(pierCapGeo, steelMat, standardPierSamples.length);
    let pIdx = 0;
    let fIdx = 0;
    standardPierSamples.forEach((s, ci) => {
      const yaw = Math.atan2(-s.tangent.x, -s.tangent.z);
      [-roadHalfWidth * 0.92, roadHalfWidth * 0.92].forEach((lat) => {
        const colX = s.point.x + s.right.x * lat;
        const colZ = s.point.z + s.right.z * lat;
        const groundY = sampleTerrainInfo(colX, colZ).height;
        const colTop = s.point.y - 1.4;
        const colBot = Math.min(groundY - 2.2, -3.5);
        const colH = Math.max(4, colTop - colBot);
        dummy.position.set(colX, colBot + colH * 0.5, colZ);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1, colH, 1);
        dummy.updateMatrix();
        piers.setMatrixAt(pIdx++, dummy.matrix);

        dummy.position.set(colX, groundY + 0.1, colZ);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        pierFootings.setMatrixAt(fIdx++, dummy.matrix);
      });
      dummy.position.set(s.point.x, s.point.y - 1.5, s.point.z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      pierCaps.setMatrixAt(ci, dummy.matrix);
    });
    piers.instanceMatrix.needsUpdate = true;
    piers.computeBoundingSphere();
    pierFootings.instanceMatrix.needsUpdate = true;
    pierFootings.computeBoundingSphere();
    pierCaps.instanceMatrix.needsUpdate = true;
    pierCaps.computeBoundingSphere();
    group.add(piers, pierFootings, pierCaps);
  }

  if (straddlePierSamples.length > 0) {
    const sPiers = new THREE.InstancedMesh(pierGeo, concreteStructMat, straddlePierSamples.length * 2);
    const sFootings = new THREE.InstancedMesh(pierFootingGeo, concreteStructMat, straddlePierSamples.length * 2);
    const sCaps = new THREE.InstancedMesh(straddleCapGeo, steelMat, straddlePierSamples.length);
    let spIdx = 0;
    let sfIdx = 0;
    straddlePierSamples.forEach((s, ci) => {
      const yaw = Math.atan2(-s.tangent.x, -s.tangent.z);
      [-straddleSpanHalf, straddleSpanHalf].forEach((lat) => {
        const colX = s.point.x + s.right.x * lat;
        const colZ = s.point.z + s.right.z * lat;
        const groundY = sampleTerrainInfo(colX, colZ).height;
        const colTop = s.point.y - 1.4;
        const colBot = Math.min(groundY - 2.2, -3.5);
        const colH = Math.max(4, colTop - colBot);
        dummy.position.set(colX, colBot + colH * 0.5, colZ);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1, colH, 1);
        dummy.updateMatrix();
        sPiers.setMatrixAt(spIdx++, dummy.matrix);

        dummy.position.set(colX, groundY + 0.1, colZ);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        sFootings.setMatrixAt(sfIdx++, dummy.matrix);
      });
      dummy.position.set(s.point.x, s.point.y - 1.5, s.point.z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      sCaps.setMatrixAt(ci, dummy.matrix);
    });
    sPiers.instanceMatrix.needsUpdate = true;
    sPiers.computeBoundingSphere();
    sFootings.instanceMatrix.needsUpdate = true;
    sFootings.computeBoundingSphere();
    sCaps.instanceMatrix.needsUpdate = true;
    sCaps.computeBoundingSphere();
    group.add(sPiers, sFootings, sCaps);
  }

  // --- 3. Extruded Highway Tunnel(s) ---
  const sodiumLightMat = track(
    new THREE.MeshStandardMaterial({
      color: '#FEF3C7',
      emissive: new THREE.Color(environment === 'midnight_neon' ? '#38BDF8' : '#F59E0B'),
      emissiveIntensity: environment === 'midnight_neon' ? 3.8 : 3.2,
    }),
  );
  const tunnelWallMat = track(
    new THREE.MeshStandardMaterial({
      color: '#1E2530',
      roughness: 0.78,
      metalness: 0.22,
      side: THREE.DoubleSide,
    }),
  );
  const tunnelCeilingMat = track(
    new THREE.MeshStandardMaterial({
      color: '#0F1520',
      roughness: 0.85,
      metalness: 0.18,
      side: THREE.DoubleSide,
    }),
  );
  const tunnelPortalTex = track(createTunnelPortalTexture(maxAnisotropy));
  const tunnelPortalMat = track(
    new THREE.MeshStandardMaterial({
      map: tunnelPortalTex,
      roughness: 0.52,
      metalness: 0.25,
    }),
  );
  const tunnelPoolTex = track(createRoadLightPoolTexture());
  const tunnelPoolMat = track(
    new THREE.MeshBasicMaterial({
      map: tunnelPoolTex,
      transparent: true,
      opacity: environment === 'noon_clear' ? 0.22 : 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );

  const tunSpan = barrierHalfWidth + 0.95;
  const tunHeight = 8.6;
  const ribRingGeo = track(new THREE.BoxGeometry(tunSpan * 1.18, 0.52, 0.72));
  const wallPanelGeo = track(new THREE.BoxGeometry(0.65, tunHeight * 0.62, 1.0));
  const stripBulbGeo = track(new THREE.BoxGeometry(2.6, 0.18, 0.95));
  const tunPoolGeo = track(new THREE.PlaneGeometry(11.5, 11.5));
  tunPoolGeo.rotateX(-Math.PI / 2);
  const jetFanGeo = track(new THREE.CylinderGeometry(0.55, 0.55, 2.2, 10));
  jetFanGeo.rotateX(Math.PI / 2);

  tunnelConfigs.forEach((tc) => {
    const tVerts: number[] = [];
    const hoodVerts: number[] = [];
    const tIndices: number[] = [];
    const bulbMats: { x: number; y: number; z: number; pitch: number; yaw: number; bank: number }[] = [];
    const ribMats: { x: number; y: number; z: number; pitch: number; yaw: number; bank: number }[] = [];
    const fanMats: { x: number; y: number; z: number; pitch: number; yaw: number; bank: number }[] = [];

    for (let k = 0; k <= tc.len; k++) {
      const idx = (tc.startIdx + k) % SAMPLE_COUNT;
      const s = samples[idx];
      const yaw = Math.atan2(-s.tangent.x, -s.tangent.z);
      const bankSlope = Math.sin(s.bankAngle);
      const crownSpan = tunSpan * 0.56;
      const lx = s.point.x - s.right.x * tunSpan;
      const lz = s.point.z - s.right.z * tunSpan;
      const clx = s.point.x - s.right.x * crownSpan;
      const clz = s.point.z - s.right.z * crownSpan;
      const crx = s.point.x + s.right.x * crownSpan;
      const crz = s.point.z + s.right.z * crownSpan;
      const rx = s.point.x + s.right.x * tunSpan;
      const rz = s.point.z + s.right.z * tunSpan;

      const baseL = s.point.y - 1.4 - tunSpan * bankSlope;
      const baseR = s.point.y - 1.4 + tunSpan * bankSlope;
      const haunchY = s.point.y + tunHeight * 0.58;
      const roofY = s.point.y + tunHeight;

      // 6-point vaulted arch profile: bottomL, haunchL, crownL, crownR, haunchR, bottomR
      tVerts.push(
        lx, baseL, lz,
        lx, haunchY - tunSpan * bankSlope, lz,
        clx, roofY - crownSpan * bankSlope, clz,
        crx, roofY + crownSpan * bankSlope, crz,
        rx, haunchY + tunSpan * bankSlope, rz,
        rx, baseR, rz,
      );

      // Outer structural shell / rocky concrete hood
      const outerSpan = tunSpan + 1.1;
      const oCrown = crownSpan + 0.9;
      hoodVerts.push(
        s.point.x - s.right.x * outerSpan, baseL - 0.8, s.point.z - s.right.z * outerSpan,
        s.point.x - s.right.x * outerSpan, haunchY + 0.5 - tunSpan * bankSlope, s.point.z - s.right.z * outerSpan,
        s.point.x - s.right.x * oCrown, roofY + 0.95 - crownSpan * bankSlope, s.point.z - s.right.z * oCrown,
        s.point.x + s.right.x * oCrown, roofY + 0.95 + crownSpan * bankSlope, s.point.z + s.right.z * oCrown,
        s.point.x + s.right.x * outerSpan, haunchY + 0.5 + tunSpan * bankSlope, s.point.z + s.right.z * outerSpan,
        s.point.x + s.right.x * outerSpan, baseR - 0.8, s.point.z + s.right.z * outerSpan,
      );

      if (k < tc.len) {
        const b = k * 6;
        for (let seg = 0; seg < 5; seg++) {
          tIndices.push(b + seg, b + seg + 1, b + seg + 6, b + seg + 1, b + seg + 7, b + seg + 6);
        }
      }

      if (k > 0 && k < tc.len && k % 2 === 0) {
        bulbMats.push({
          x: s.point.x,
          y: s.point.y + tunHeight - 0.25,
          z: s.point.z,
          pitch: s.slopePitch,
          yaw,
          bank: -s.bankAngle,
        });
      }
      if (k % 3 === 0) {
        ribMats.push({
          x: s.point.x,
          y: s.point.y,
          z: s.point.z,
          pitch: s.slopePitch,
          yaw,
          bank: -s.bankAngle,
        });
      }
      if (k > 2 && k < tc.len - 2 && k % 7 === 0) {
        fanMats.push({
          x: s.point.x,
          y: s.point.y + tunHeight - 0.9,
          z: s.point.z,
          pitch: s.slopePitch,
          yaw,
          bank: -s.bankAngle,
        });
      }
    }

    const tunGeo = track(new THREE.BufferGeometry());
    tunGeo.setAttribute('position', new THREE.Float32BufferAttribute(tVerts, 3));
    tunGeo.setIndex(tIndices);
    tunGeo.computeVertexNormals();
    group.add(new THREE.Mesh(tunGeo, tunnelWallMat));

    const hoodGeo = track(new THREE.BufferGeometry());
    hoodGeo.setAttribute('position', new THREE.Float32BufferAttribute(hoodVerts, 3));
    hoodGeo.setIndex(tIndices);
    hoodGeo.computeVertexNormals();
    group.add(new THREE.Mesh(hoodGeo, tunnelCeilingMat));

    if (bulbMats.length > 0) {
      const bulbsInst = new THREE.InstancedMesh(stripBulbGeo, sodiumLightMat, bulbMats.length);
      const poolsInst = new THREE.InstancedMesh(tunPoolGeo, tunnelPoolMat, bulbMats.length);
      bulbMats.forEach((bm, bi) => {
        dummy.position.set(bm.x, bm.y, bm.z);
        dummy.rotation.set(bm.pitch, bm.yaw, bm.bank, 'YXZ');
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        bulbsInst.setMatrixAt(bi, dummy.matrix);

        dummy.position.set(bm.x, bm.y - (tunHeight - 0.34), bm.z);
        dummy.updateMatrix();
        poolsInst.setMatrixAt(bi, dummy.matrix);
      });
      bulbsInst.instanceMatrix.needsUpdate = true;
      poolsInst.instanceMatrix.needsUpdate = true;
      bulbsInst.computeBoundingSphere();
      poolsInst.computeBoundingSphere();
      group.add(bulbsInst, poolsInst);
    }

    if (ribMats.length > 0) {
      const ribsInst = new THREE.InstancedMesh(ribRingGeo, steelMat, ribMats.length);
      const sideRibsInst = new THREE.InstancedMesh(wallPanelGeo, concreteStructMat, ribMats.length * 2);
      ribMats.forEach((rm, ri) => {
        dummy.position.set(rm.x, rm.y + tunHeight - 0.1, rm.z);
        dummy.rotation.set(rm.pitch, rm.yaw, rm.bank, 'YXZ');
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        ribsInst.setMatrixAt(ri, dummy.matrix);

        const s = samples[(tc.startIdx + ri * 3) % SAMPLE_COUNT];
        [-tunSpan + 0.15, tunSpan - 0.15].forEach((lat, sideIdx) => {
          dummy.position.set(
            s.point.x + s.right.x * lat,
            s.point.y + tunHeight * 0.3,
            s.point.z + s.right.z * lat,
          );
          dummy.rotation.set(rm.pitch, rm.yaw, rm.bank, 'YXZ');
          dummy.updateMatrix();
          sideRibsInst.setMatrixAt(ri * 2 + sideIdx, dummy.matrix);
        });
      });
      ribsInst.instanceMatrix.needsUpdate = true;
      sideRibsInst.instanceMatrix.needsUpdate = true;
      ribsInst.computeBoundingSphere();
      sideRibsInst.computeBoundingSphere();
      group.add(ribsInst, sideRibsInst);
    }

    if (fanMats.length > 0) {
      const fansInst = new THREE.InstancedMesh(jetFanGeo, steelMat, fanMats.length * 2);
      fanMats.forEach((fm, fi) => {
        const s = samples[(tc.startIdx + 3 + fi * 7) % SAMPLE_COUNT];
        [-3.8, 3.8].forEach((lat, sIdx) => {
          dummy.position.set(fm.x + s.right.x * lat, fm.y, fm.z + s.right.z * lat);
          dummy.rotation.set(fm.pitch, fm.yaw, fm.bank, 'YXZ');
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          fansInst.setMatrixAt(fi * 2 + sIdx, dummy.matrix);
        });
      });
      fansInst.instanceMatrix.needsUpdate = true;
      fansInst.computeBoundingSphere();
      group.add(fansInst);
    }

    // Tunnel Entry & Exit Portals with Grounded Rock-Massif Cliff Framing & Illuminated Header
    const tunnelRockTex = track(createBuildingFacadeTexture(maxAnisotropy, 'rock'));
    const tunnelRockMat = track(
      new THREE.MeshStandardMaterial({
        map: tunnelRockTex,
        color: trackId === 'blackridge_summit' ? '#94A3B8' : '#D6C7B2',
        roughness: 0.92,
        metalness: 0.04,
      }),
    );
    const cliffBoulderGeo = track(new THREE.DodecahedronGeometry(6.8, 1));
    [tc.startIdx, (tc.startIdx + tc.len) % SAMPLE_COUNT].forEach((pIdx, endOrd) => {
      const ps = samples[pIdx];
      const pg = new THREE.Group();
      pg.position.copy(ps.point);
      pg.rotation.set(ps.slopePitch, Math.atan2(-ps.tangent.x, -ps.tangent.z), -ps.bankAngle, 'YXZ');

      const portalSideGeo = track(new THREE.BoxGeometry(2.2, tunHeight + 3.2, 2.8));
      const portL = new THREE.Mesh(portalSideGeo, tunnelPortalMat);
      portL.position.set(-tunSpan - 0.45, (tunHeight + 1.2) * 0.5 - 1.2, 0);
      const portR = new THREE.Mesh(portalSideGeo, tunnelPortalMat);
      portR.position.set(tunSpan + 0.45, (tunHeight + 1.2) * 0.5 - 1.2, 0);
      const wingGeo = track(new THREE.BoxGeometry(3.2, 6.4, 3.8));
      const wingL = new THREE.Mesh(wingGeo, tunnelRockMat);
      wingL.position.set(-tunSpan - 2.6, 1.8, 0.2);
      wingL.rotation.z = 0.25;
      const wingR = new THREE.Mesh(wingGeo, tunnelRockMat);
      wingR.position.set(tunSpan + 2.6, 1.8, 0.2);
      wingR.rotation.z = -0.25;
      const portTop = new THREE.Mesh(
        track(new THREE.BoxGeometry(tunSpan * 2 + 3.8, 2.8, 3.2)),
        tunnelPortalMat,
      );
      portTop.position.set(0, tunHeight + 1.1, 0);
      const portBeacon = new THREE.Mesh(
        track(new THREE.BoxGeometry(tunSpan * 1.35, 0.34, 0.4)),
        sodiumLightMat,
      );
      portBeacon.position.set(0, tunHeight + 0.05, 1.62);

      pg.add(portL, portR, wingL, wingR, portTop, portBeacon);

      // Rugged rock massif boulders flanking tunnel portal mouths (strictly outside co-planar streets & off urban grids)
      if (trackId !== 'downtown_labyrinth' && trackId !== 'silverton_pass') {
        const isRockClear = (latOff: number) => {
          const wx = ps.point.x + ps.right.x * latOff;
          const wz = ps.point.z + ps.right.z * latOff;
          for (let ti = 0; ti < SAMPLE_COUNT; ti++) {
            const tp = samples[ti].point;
            if (Math.abs(ps.point.y - tp.y) >= 12) continue;
            if (Math.hypot(wx - tp.x, wz - tp.z) < barrierHalfWidth + 6.5) return false;
          }
          return isClearOfShortcuts(wx, wz, 8.5);
        };
        if (isRockClear(-tunSpan - 8.5)) {
          const rockL = new THREE.Mesh(cliffBoulderGeo, tunnelRockMat);
          rockL.position.set(-tunSpan - 8.5, 4.2, endOrd === 0 ? 1.5 : -1.5);
          rockL.scale.set(1.15, 1.35, 1.1);
          pg.add(rockL);
        }
        if (isRockClear(tunSpan + 8.5)) {
          const rockR = new THREE.Mesh(cliffBoulderGeo, tunnelRockMat);
          rockR.position.set(tunSpan + 8.5, 4.0, endOrd === 0 ? 1.5 : -1.5);
          rockR.scale.set(1.15, 1.25, 1.1);
          pg.add(rockR);
        }
        const crownRock = new THREE.Mesh(cliffBoulderGeo, tunnelRockMat);
        crownRock.position.set(0, tunHeight + 5.2, endOrd === 0 ? -2.2 : 2.2);
        crownRock.scale.set(2.2, 0.85, 1.2);
        pg.add(crownRock);
      }
      group.add(pg);
    });
  });

  // --- 4. Track-Specific Iconic Landmarks (High-Detail Multi-Part Monuments) ---
  if (hasHarborBay) {
    // Suspension Bridge Towers + Real 3D Steel Stay Cables + Sea Caissons (Verified clear of shortcut cutouts)
    const towerSamples = [samples[Math.floor(SAMPLE_COUNT * 0.21)], samples[Math.floor(SAMPLE_COUNT * 0.29)]]
      .filter((ts) => !isNearShortcutPortal(ts.index, 6));
    const towerLegGeo = track(new THREE.BoxGeometry(2.3, 54, 2.5));
    const towerCapGeo = track(new THREE.BoxGeometry(3.4, 1.8, 3.4));
    const caissonGeo = track(new THREE.BoxGeometry(6.8, 18, 7.6));
    const crossBarGeo = track(new THREE.BoxGeometry(barrierHalfWidth * 2 + 5.0, 2.1, 2.2));
    const braceLen = Math.hypot(barrierHalfWidth * 2 + 2.8, 12);
    const braceGeo = track(new THREE.BoxGeometry(braceLen, 0.95, 0.95));
    const braceAngle = Math.atan2(12, barrierHalfWidth * 2 + 2.8);
    const beaconGeo = track(new THREE.SphereGeometry(0.95, 10, 8));
    const beaconMat = track(
      new THREE.MeshStandardMaterial({ color: '#EF4444', emissive: new THREE.Color('#EF4444'), emissiveIntensity: 3.6 }),
    );
    const cableMat = track(new THREE.MeshStandardMaterial({ color: '#CBD5E1', metalness: 0.78, roughness: 0.28 }));
    const cableSegments: { a: THREE.Vector3; b: THREE.Vector3; radius: number }[] = [];

    towerSamples.forEach((s) => {
      const tw = new THREE.Group();
      tw.position.set(s.point.x, s.point.y, s.point.z);
      tw.rotation.y = Math.atan2(-s.tangent.x, -s.tangent.z);
      const latX = barrierHalfWidth + 1.5;

      const lL = new THREE.Mesh(towerLegGeo, steelMat);
      lL.position.set(-latX, 13, 0);
      const lR = new THREE.Mesh(towerLegGeo, steelMat);
      lR.position.set(latX, 13, 0);
      const capL = new THREE.Mesh(towerCapGeo, concreteStructMat);
      capL.position.set(-latX, 40.2, 0);
      const capR = new THREE.Mesh(towerCapGeo, concreteStructMat);
      capR.position.set(latX, 40.2, 0);
      const caisL = new THREE.Mesh(caissonGeo, concreteStructMat);
      caisL.position.set(-latX, -s.point.y - 6.0, 0);
      const caisR = new THREE.Mesh(caissonGeo, concreteStructMat);
      caisR.position.set(latX, -s.point.y - 6.0, 0);

      const cb1 = new THREE.Mesh(crossBarGeo, steelMat);
      cb1.position.set(0, 17, 0);
      const cb2 = new THREE.Mesh(crossBarGeo, steelMat);
      cb2.position.set(0, 31, 0);
      const cbTop = new THREE.Mesh(crossBarGeo, steelMat);
      cbTop.position.set(0, 38.8, 0);
      const xBraceA = new THREE.Mesh(braceGeo, steelMat);
      xBraceA.position.set(0, 24, 0);
      xBraceA.rotation.z = braceAngle;
      const xBraceB = new THREE.Mesh(braceGeo, steelMat);
      xBraceB.position.set(0, 24, 0);
      xBraceB.rotation.z = -braceAngle;

      const bL = new THREE.Mesh(beaconGeo, beaconMat);
      bL.position.set(-latX, 41.8, 0);
      const bR = new THREE.Mesh(beaconGeo, beaconMat);
      bR.position.set(latX, 41.8, 0);
      tw.add(lL, lR, capL, capR, caisL, caisR, cb1, cb2, cbTop, xBraceA, xBraceB, bL, bR);
      group.add(tw);

      [-1, 1].forEach((side) => {
        const topPt = new THREE.Vector3(
          s.point.x + s.right.x * side * latX,
          s.point.y + 39,
          s.point.z + s.right.z * side * latX,
        );
        [-18, -13, -8, -4, 4, 8, 13, 18].forEach((dIdx) => {
          const ds = samples[(s.index + dIdx + SAMPLE_COUNT) % SAMPLE_COUNT];
          const botPt = new THREE.Vector3(
            ds.point.x + ds.right.x * side * (barrierHalfWidth + 0.3),
            ds.point.y + 1.2,
            ds.point.z + ds.right.z * side * (barrierHalfWidth + 0.3),
          );
          cableSegments.push({ a: topPt, b: botPt, radius: 0.14 });
        });
      });
    });

    // Parabolic main suspension catenary linking tower pair if both towers exist
    if (towerSamples.length === 2) {
      const [tA, tB] = towerSamples;
      const span = ((tB.index - tA.index + SAMPLE_COUNT) % SAMPLE_COUNT);
      if (span > 10 && span < 120) {
        const latX = barrierHalfWidth + 1.5;
        [-1, 1].forEach((side) => {
          let prevPt: THREE.Vector3 | null = null;
          const steps = 16;
          for (let st = 0; st <= steps; st++) {
            const frac = st / steps;
            const sIdx = (tA.index + Math.round(span * frac)) % SAMPLE_COUNT;
            const cs = samples[sIdx];
            const sag = 4 * frac * (1 - frac) * 23;
            const p = new THREE.Vector3(
              cs.point.x + cs.right.x * side * latX,
              cs.point.y + 39 - sag,
              cs.point.z + cs.right.z * side * latX,
            );
            if (prevPt) {
              cableSegments.push({ a: prevPt, b: p, radius: 0.34 });
            }
            if (st > 1 && st < steps - 1 && st % 2 === 0) {
              const hangerBot = new THREE.Vector3(
                cs.point.x + cs.right.x * side * (barrierHalfWidth + 0.3),
                cs.point.y + 1.1,
                cs.point.z + cs.right.z * side * (barrierHalfWidth + 0.3),
              );
              cableSegments.push({ a: p, b: hangerBot, radius: 0.1 });
            }
            prevPt = p;
          }
        });
      }
    }

    if (cableSegments.length > 0) {
      const cylUnitGeo = track(new THREE.CylinderGeometry(1, 1, 1, 6));
      const cableInst = new THREE.InstancedMesh(cylUnitGeo, cableMat, cableSegments.length);
      const upVec = new THREE.Vector3(0, 1, 0);
      const segDir = new THREE.Vector3();
      const segMid = new THREE.Vector3();
      const segQuat = new THREE.Quaternion();
      cableSegments.forEach((seg, ci) => {
        segDir.subVectors(seg.b, seg.a);
        const len = Math.max(0.1, segDir.length());
        segMid.addVectors(seg.a, seg.b).multiplyScalar(0.5);
        segQuat.setFromUnitVectors(upVec, segDir.divideScalar(len));
        dummy.position.copy(segMid);
        dummy.quaternion.copy(segQuat);
        dummy.scale.set(seg.radius, len, seg.radius);
        dummy.updateMatrix();
        cableInst.setMatrixAt(ci, dummy.matrix);
      });
      cableInst.instanceMatrix.needsUpdate = true;
      cableInst.computeBoundingSphere();
      group.add(cableInst);
      dummy.quaternion.identity();
      dummy.scale.set(1, 1, 1);
    }

    // Port Gantry Cranes & Tapered Container Freighter Ship
    const craneMat = track(new THREE.MeshStandardMaterial({ color: '#D97706', metalness: 0.55, roughness: 0.42 }));
    const craneLegGeo = track(new THREE.BoxGeometry(1.7, 46, 1.7));
    const craneTieGeo = track(new THREE.BoxGeometry(15.6, 1.4, 1.4));
    const craneBoomGeo = track(new THREE.BoxGeometry(3.4, 2.4, 42));
    const craneCabGeo = track(new THREE.BoxGeometry(4.4, 3.2, 5.2));
    const craneCounterGeo = track(new THREE.BoxGeometry(5.6, 4.0, 6.2));
    const spreaderGeo = track(new THREE.BoxGeometry(4.2, 1.2, 9.6));
    const quayGeo = track(new THREE.BoxGeometry(22, 4.5, 22));
    [0, 1, 2].forEach((ci) => {
      const cx = waterCenterX - 240 + ci * 135;
      const cz = waterCenterZ + 110 - ci * 28;
      if (!isClearOfTrack(cx, cz, barrierHalfWidth + 32)) return;
      const cg = new THREE.Group();
      cg.position.set(cx, -3, cz);
      cg.rotation.y = 0.25;
      const quay = new THREE.Mesh(quayGeo, concreteStructMat);
      quay.position.y = 0.6;
      [[-7, -5], [-7, 5], [7, -5], [7, 5]].forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(craneLegGeo, craneMat);
        leg.position.set(lx, 23, lz);
        cg.add(leg);
      });
      const tieL = new THREE.Mesh(craneTieGeo, steelMat);
      tieL.position.set(0, 14, -5);
      const tieR = new THREE.Mesh(craneTieGeo, steelMat);
      tieR.position.set(0, 14, 5);
      const tieTop = new THREE.Mesh(craneTieGeo, craneMat);
      tieTop.position.set(0, 44, 0);
      const boom = new THREE.Mesh(craneBoomGeo, craneMat);
      boom.position.set(0, 41, -7);
      const cab = new THREE.Mesh(craneCabGeo, concreteStructMat);
      cab.position.set(0, 38.2, -13);
      const counter = new THREE.Mesh(craneCounterGeo, steelMat);
      counter.position.set(0, 42, 12);
      const spreader = new THREE.Mesh(spreaderGeo, craneMat);
      spreader.position.set(0, 26 + ci * 3, -18);
      const craneBeacon = new THREE.Mesh(beaconGeo, beaconMat);
      craneBeacon.position.set(0, 47, 0);
      cg.add(quay, tieL, tieR, tieTop, boom, cab, counter, spreader, craneBeacon);
      group.add(cg);
    });

    const sxShip = waterCenterX + 80;
    const szShip = waterCenterZ - 160;
    if (isClearOfTrack(sxShip, szShip, barrierHalfWidth + 68)) {
      const hullMat = track(new THREE.MeshStandardMaterial({ color: '#1E293B', metalness: 0.5, roughness: 0.58 }));
      const redHullMat = track(new THREE.MeshStandardMaterial({ color: '#7F1D1D', roughness: 0.65 }));
      const whiteDeckMat = track(new THREE.MeshStandardMaterial({ color: '#E2E8F0', roughness: 0.55 }));
      const containerRedMat = track(new THREE.MeshStandardMaterial({ color: '#B91C1C', roughness: 0.68 }));
      const containerBlueMat = track(new THREE.MeshStandardMaterial({ color: '#1D4ED8', roughness: 0.68 }));
      const containerAmberMat = track(new THREE.MeshStandardMaterial({ color: '#D97706', roughness: 0.68 }));
      const ship = new THREE.Group();
      ship.position.set(sxShip, -2.5, szShip);
      ship.rotation.y = 0.18;

      const hull = new THREE.Mesh(track(new THREE.BoxGeometry(102, 10, 24)), hullMat);
      hull.position.set(-4, 5, 0);
      const lowerHull = new THREE.Mesh(track(new THREE.BoxGeometry(106, 4.5, 22)), redHullMat);
      lowerHull.position.set(-4, 1.2, 0);
      // Tapered prow / bow nose
      const bow = new THREE.Mesh(track(new THREE.ConeGeometry(13.5, 26, 4)), hullMat);
      bow.rotation.z = -Math.PI / 2;
      bow.rotation.x = Math.PI / 4;
      bow.scale.set(0.68, 1, 1.12);
      bow.position.set(57, 5.2, 0);

      const bridge1 = new THREE.Mesh(track(new THREE.BoxGeometry(15, 13, 21)), whiteDeckMat);
      bridge1.position.set(-43, 15, 0);
      const bridgeTop = new THREE.Mesh(track(new THREE.BoxGeometry(10, 6.5, 23)), whiteDeckMat);
      bridgeTop.position.set(-42, 23.5, 0);
      const bridgeWin = new THREE.Mesh(track(new THREE.BoxGeometry(10.3, 2.2, 23.2)), sodiumLightMat);
      bridgeWin.position.set(-42, 24.4, 0);
      const funnel = new THREE.Mesh(track(new THREE.CylinderGeometry(2.2, 2.9, 9.5, 12)), containerRedMat);
      funnel.position.set(-48, 22, 0);
      const radarMast = new THREE.Mesh(track(new THREE.CylinderGeometry(0.35, 0.65, 11, 8)), steelMat);
      radarMast.position.set(-42, 31.5, 0);

      const cStack1 = new THREE.Mesh(track(new THREE.BoxGeometry(64, 7.5, 18.5)), containerRedMat);
      cStack1.position.set(7, 13.5, 0);
      const cStack2 = new THREE.Mesh(track(new THREE.BoxGeometry(46, 5.5, 17)), containerBlueMat);
      cStack2.position.set(9, 19.5, 0);
      const cStack3 = new THREE.Mesh(track(new THREE.BoxGeometry(24, 4.5, 13)), containerAmberMat);
      cStack3.position.set(14, 24.2, -1.8);
      ship.add(hull, lowerHull, bow, bridge1, bridgeTop, bridgeWin, funnel, radarMast, cStack1, cStack2, cStack3);
      group.add(ship);
    }
  }

  const animTurbines: THREE.Group[] = [];
  let lighthouseBeacon: THREE.Group | null = null;
  let monorailTrain: { mesh: THREE.Group; span: number } | null = null;
  let foundryRingGlowMat: THREE.MeshStandardMaterial | null = null;
  const gantryPodMats: THREE.MeshStandardMaterial[] = [];

  // Camden Coast & Gray Point Bay: Coastal Lighthouse Promontory + Stacked Shipping Containers
  if (trackId === 'camden_coast' || trackId === 'gray_point_bay') {
    const lhMat = track(new THREE.MeshStandardMaterial({ color: '#E2E8F0', roughness: 0.56 }));
    const lhStripeMat = track(new THREE.MeshStandardMaterial({ color: '#DC2626', roughness: 0.52 }));
    const lhRockMat = track(new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.94 }));
    const lhX = maxX - 110;
    const lhZ = minZ + 380;
    if (isClearOfTrack(lhX, lhZ, barrierHalfWidth + 24)) {
      const lhBaseY = sampleTerrainInfo(lhX, lhZ).height;
      const lhGroup = new THREE.Group();
      lhGroup.position.set(lhX, lhBaseY - 2.0, lhZ);

      // Rocky promontory boulder island + masonry plinth
      [
        [0, 0, 12, 5.5],
        [-7, 4, 7.5, 3.8],
        [7, -4, 8.0, 4.2],
      ].forEach(([rx, rz, rad, h]) => {
        const rock = new THREE.Mesh(track(new THREE.DodecahedronGeometry(rad, 1)), lhRockMat);
        rock.scale.set(1.1, h / rad, 1.0);
        rock.position.set(rx, h * 0.45, rz);
        lhGroup.add(rock);
      });
      const masonry = new THREE.Mesh(track(new THREE.CylinderGeometry(7.2, 8.4, 4.5, 16)), concreteStructMat);
      masonry.position.y = 4.2;

      const cottage = new THREE.Mesh(track(new THREE.BoxGeometry(9.6, 5.2, 7.8)), lhMat);
      cottage.position.set(7.2, 5.4, 0);
      const cotRoof = new THREE.Mesh(track(new THREE.ConeGeometry(7.2, 3.6, 4)), lhStripeMat);
      cotRoof.rotation.y = Math.PI / 4;
      cotRoof.position.set(7.2, 9.6, 0);

      const lhBody = new THREE.Mesh(track(new THREE.CylinderGeometry(3.2, 5.4, 42, 16)), lhMat);
      lhBody.position.y = 24;
      const lhBand1 = new THREE.Mesh(track(new THREE.CylinderGeometry(4.0, 4.5, 10, 16)), lhStripeMat);
      lhBand1.position.y = 22;
      const lhBand2 = new THREE.Mesh(track(new THREE.CylinderGeometry(3.4, 3.7, 7, 16)), lhStripeMat);
      lhBand2.position.y = 37;
      const gallery = new THREE.Mesh(track(new THREE.CylinderGeometry(4.7, 3.8, 1.4, 16)), steelMat);
      gallery.position.y = 44.8;
      const lhLantern = new THREE.Mesh(track(new THREE.CylinderGeometry(2.8, 2.8, 4.6, 12)), sodiumLightMat);
      lhLantern.position.y = 47.6;
      const lhCap = new THREE.Mesh(track(new THREE.ConeGeometry(3.8, 4.4, 14)), steelMat);
      lhCap.position.y = 52.0;

      const beaconGroup = new THREE.Group();
      beaconGroup.position.y = 47.6;
      const beamConeGeo = track(new THREE.ConeGeometry(15, 118, 12, 1, true));
      beamConeGeo.translate(0, -59, 0);
      beamConeGeo.rotateZ(Math.PI / 2);
      const beamConeMat = track(
        new THREE.MeshBasicMaterial({
          color: '#FEF3C7',
          transparent: true,
          opacity: environment === 'midnight_neon' ? 0.2 : 0.12,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const beamA = new THREE.Mesh(beamConeGeo, beamConeMat);
      const beamB = new THREE.Mesh(beamConeGeo, beamConeMat);
      beamB.rotation.y = Math.PI;
      beaconGroup.add(beamA, beamB);
      lighthouseBeacon = beaconGroup;

      lhGroup.add(masonry, cottage, cotRoof, lhBody, lhBand1, lhBand2, gallery, lhLantern, lhCap, beaconGroup);
      group.add(lhGroup);
    }

    // Stacked Shipping Containers along docks (InstancedMesh)
    const contGeo = track(new THREE.BoxGeometry(12.2, 3.2, 4.2));
    const contMat = track(new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.68, metalness: 0.25 }));
    const contColors = [
      new THREE.Color('#DC2626'),
      new THREE.Color('#2563EB'),
      new THREE.Color('#D97706'),
      new THREE.Color('#059669'),
    ];
    const contItems: { x: number; y: number; z: number; yaw: number; color: THREE.Color }[] = [];
    for (let i = 0; i < 42; i++) {
      const s = samples[Math.floor(((i * 15) % SAMPLE_COUNT))];
      const side = i % 2 === 0 ? 1 : -1;
      const cx = s.point.x + s.right.x * side * (barrierHalfWidth + 21 + (i % 3) * 6);
      const cz = s.point.z + s.right.z * side * (barrierHalfWidth + 21 + (i % 3) * 6);
      if (isClearOfTrack(cx, cz, barrierHalfWidth + 16)) {
        const baseY = sampleTerrainInfo(cx, cz).height;
        const stacks = 1 + (i % 3);
        for (let st = 0; st < stacks; st++) {
          contItems.push({
            x: cx,
            y: baseY + 1.6 + st * 3.25,
            z: cz,
            yaw: Math.atan2(-s.tangent.x, -s.tangent.z),
            color: contColors[(i + st) % contColors.length],
          });
        }
      }
    }
    if (contItems.length > 0) {
      const contInst = new THREE.InstancedMesh(contGeo, contMat, contItems.length);
      contItems.forEach((ci, idx) => {
        dummy.position.set(ci.x, ci.y, ci.z);
        dummy.rotation.set(0, ci.yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        contInst.setMatrixAt(idx, dummy.matrix);
        contInst.setColorAt(idx, ci.color);
      });
      contInst.instanceMatrix.needsUpdate = true;
      if (contInst.instanceColor) contInst.instanceColor.needsUpdate = true;
      contInst.computeBoundingSphere();
      group.add(contInst);
    }
  }

  // Rockport Loop: Harbor Refinery Tank Farm, Pipe Manifold & Flare Tower
  if (trackId === 'rockport_loop') {
    const tankGeo = track(new THREE.CylinderGeometry(12, 12.2, 17, 20));
    const tankDomeGeo = track(new THREE.CylinderGeometry(8.8, 12, 2.2, 20));
    const tankMat = track(new THREE.MeshStandardMaterial({ color: '#CBD5E1', roughness: 0.42, metalness: 0.62 }));
    const stripeMat = track(new THREE.MeshStandardMaterial({ color: '#F59E0B', roughness: 0.45 }));
    const flareFlameMat = track(
      new THREE.MeshStandardMaterial({ color: '#FDBA74', emissive: new THREE.Color('#F97316'), emissiveIntensity: 4.5 }),
    );
    const tankPts: THREE.Vector3[] = [];
    [0.51, 0.56, 0.61].forEach((prog, idx) => {
      const s = samples[Math.floor(SAMPLE_COUNT * prog)];
      const tx = s.point.x - s.right.x * (barrierHalfWidth + 36 + idx * 8);
      const tz = s.point.z - s.right.z * (barrierHalfWidth + 36 + idx * 8);
      if (isClearOfTrack(tx, tz, barrierHalfWidth + 24)) {
        const ty = sampleTerrainInfo(tx, tz).height - 1.5;
        const plinth = new THREE.Mesh(track(new THREE.CylinderGeometry(13.8, 14.5, 3.0, 20)), concreteStructMat);
        plinth.position.set(tx, ty + 1.5, tz);
        const m = new THREE.Mesh(tankGeo, tankMat);
        m.position.set(tx, ty + 10.5, tz);
        const dome = new THREE.Mesh(tankDomeGeo, tankMat);
        dome.position.set(tx, ty + 20.1, tz);
        const band = new THREE.Mesh(track(new THREE.CylinderGeometry(12.2, 12.2, 2.2, 20)), stripeMat);
        band.position.set(tx, ty + 14.5, tz);
        const stairRing = new THREE.Mesh(track(new THREE.TorusGeometry(12.6, 0.25, 6, 20)), steelMat);
        stairRing.rotation.x = Math.PI / 2;
        stairRing.position.set(tx, ty + 18.8, tz);
        group.add(plinth, m, dome, band, stairRing);
        tankPts.push(new THREE.Vector3(tx, ty + 15.5, tz));
      }
    });
    if (tankPts.length >= 2) {
      const pipeRef = tankPts[0];
      const fStackX = pipeRef.x - 18;
      const fStackZ = pipeRef.z - 14;
      if (isClearOfTrack(fStackX, fStackZ, barrierHalfWidth + 20)) {
        const fy = sampleTerrainInfo(fStackX, fStackZ).height - 1.0;
        const flareMast = new THREE.Mesh(track(new THREE.CylinderGeometry(0.9, 1.9, 44, 10)), steelMat);
        flareMast.position.set(fStackX, fy + 22, fStackZ);
        const flameTip = new THREE.Mesh(track(new THREE.ConeGeometry(2.1, 6.2, 8)), flareFlameMat);
        flameTip.position.set(fStackX, fy + 46.5, fStackZ);
        group.add(flareMast, flameTip);
      }
    }
  }

  // Highway 99 Thunderbowl: Giant Interstate Wind Turbines + Steel Truss Overpass
  if (trackId === 'hwy99_speedway') {
    const baseGeo = track(new THREE.CylinderGeometry(3.2, 4.2, 4.0, 10));
    const pylonGeo = track(new THREE.CylinderGeometry(0.9, 2.1, 56, 12));
    const nacelleGeo = track(new THREE.BoxGeometry(2.6, 2.6, 6.4));
    const hubConeGeo = track(new THREE.ConeGeometry(1.3, 2.6, 12));
    hubConeGeo.rotateX(Math.PI / 2);
    const bladeGeo = track(new THREE.BoxGeometry(1.15, 25, 0.35));
    const windMat = track(new THREE.MeshStandardMaterial({ color: '#F1F5F9', roughness: 0.36, metalness: 0.25 }));
    const aviBeaconMat = track(
      new THREE.MeshStandardMaterial({ color: '#EF4444', emissive: new THREE.Color('#EF4444'), emissiveIntensity: 3.5 }),
    );
    for (let i = 0; i < 10; i++) {
      const s = samples[Math.floor(((i + 0.3) / 10) * SAMPLE_COUNT)];
      const side = i % 2 === 0 ? 1 : -1;
      const wx = s.point.x + s.right.x * side * (barrierHalfWidth + 46 + (i % 3) * 14);
      const wz = s.point.z + s.right.z * side * (barrierHalfWidth + 46 + (i % 3) * 14);
      if (!isClearOfTrack(wx, wz, barrierHalfWidth + 30)) continue;
      const wy = sampleTerrainInfo(wx, wz).height - 1.5;
      const tg = new THREE.Group();
      tg.position.set(wx, wy, wz);
      tg.rotation.y = Math.atan2(-s.tangent.x, -s.tangent.z) + 0.5;
      const tPad = new THREE.Mesh(baseGeo, concreteStructMat);
      tPad.position.y = 2.0;
      const pylon = new THREE.Mesh(pylonGeo, windMat);
      pylon.position.y = 30;
      const nacelle = new THREE.Mesh(nacelleGeo, windMat);
      nacelle.position.set(0, 58, -0.5);
      const avi = new THREE.Mesh(track(new THREE.SphereGeometry(0.45, 8, 6)), aviBeaconMat);
      avi.position.set(0, 59.6, -2.5);
      tg.add(tPad, pylon, nacelle, avi);
      const rotorGroup = new THREE.Group();
      rotorGroup.position.set(0, 58, 2.9);
      rotorGroup.rotation.z = i * 0.4;
      const spinner = new THREE.Mesh(hubConeGeo, windMat);
      spinner.position.z = 1.1;
      rotorGroup.add(spinner);
      for (let b = 0; b < 3; b++) {
        const ang = (b * Math.PI * 2) / 3;
        const blade = new THREE.Mesh(bladeGeo, windMat);
        blade.position.set(Math.sin(ang) * 12.5, Math.cos(ang) * 12.5, 0);
        blade.rotation.z = -ang;
        rotorGroup.add(blade);
      }
      tg.add(rotorGroup);
      animTurbines.push(rotorGroup);
      group.add(tg);
    }

    // Steel Truss Interstate Bridge Overpass
    const ovIdx = resolveClearIdx(0.72, 10);
    const ovS = samples[ovIdx];
    const ovG = new THREE.Group();
    ovG.position.copy(ovS.point);
    ovG.rotation.y = Math.atan2(-ovS.tangent.x, -ovS.tangent.z);
    const trussW = barrierHalfWidth * 2 + 4.4;
    const ovPostGeo = track(new THREE.BoxGeometry(1.4, 11.5, 1.4));
    const ovL = new THREE.Mesh(ovPostGeo, steelMat);
    ovL.position.set(-barrierHalfWidth - 1.2, 5.2, 0);
    const ovR = new THREE.Mesh(ovPostGeo, steelMat);
    ovR.position.set(barrierHalfWidth + 1.2, 5.2, 0);
    const topChord = new THREE.Mesh(track(new THREE.BoxGeometry(trussW, 0.75, 2.2)), steelMat);
    topChord.position.set(0, 10.6, 0);
    const botChord = new THREE.Mesh(track(new THREE.BoxGeometry(trussW, 0.75, 2.2)), steelMat);
    botChord.position.set(0, 7.6, 0);
    const ovLight = new THREE.Mesh(track(new THREE.BoxGeometry(trussW * 0.72, 0.25, 0.4)), sodiumLightMat);
    ovLight.position.set(0, 7.2, 0);
    ovG.add(ovL, ovR, topChord, botChord, ovLight);
    group.add(ovG);
  }

  // Rosewood Park: Collegiate Clocktower Halls & Multi-Bank Stadium Floodlights
  if (trackId === 'rosewood_park') {
    const brickMat = track(new THREE.MeshStandardMaterial({ color: '#7C2D12', roughness: 0.85 }));
    const roofSlateMat = track(new THREE.MeshStandardMaterial({ color: '#1E293B', roughness: 0.65 }));
    const winGlowMat = track(
      new THREE.MeshStandardMaterial({ color: '#FEF3C7', emissive: new THREE.Color('#F59E0B'), emissiveIntensity: 1.5 }),
    );
    const floodMat = track(
      new THREE.MeshStandardMaterial({ color: '#FEF9C3', emissive: new THREE.Color('#FDE047'), emissiveIntensity: 3.4 }),
    );
    [0.14, 0.36, 0.72, 0.86].forEach((prog, idx) => {
      const s = samples[Math.floor(SAMPLE_COUNT * prog)];
      const side = idx % 2 === 0 ? -1 : 1;
      const rx = s.point.x + s.right.x * side * (barrierHalfWidth + 36);
      const rz = s.point.z + s.right.z * side * (barrierHalfWidth + 36);
      if (!isClearOfTrack(rx, rz, barrierHalfWidth + 28)) return;
      const ry = sampleTerrainInfo(rx, rz).height - 1.5;
      const yaw = Math.atan2(-s.tangent.x, -s.tangent.z);
      const quad = new THREE.Group();
      quad.position.set(rx, ry, rz);
      quad.rotation.y = yaw;
      const hall = new THREE.Mesh(track(new THREE.BoxGeometry(28, 15, 18)), brickMat);
      hall.position.y = 7.5;
      const gable = new THREE.Mesh(track(new THREE.CylinderGeometry(0, 16, 7.5, 4)), roofSlateMat);
      gable.rotation.y = Math.PI / 4;
      gable.scale.set(1.25, 1, 0.85);
      gable.position.y = 18.6;
      const winBand = new THREE.Mesh(track(new THREE.BoxGeometry(28.2, 2.6, 14)), winGlowMat);
      winBand.position.y = 9.5;
      quad.add(hall, gable, winBand);
      if (idx === 0 || idx === 2) {
        const bellTower = new THREE.Mesh(track(new THREE.BoxGeometry(7, 26, 7)), brickMat);
        bellTower.position.set(0, 19, 0);
        const spire = new THREE.Mesh(track(new THREE.ConeGeometry(5.2, 10.5, 4)), roofSlateMat);
        spire.rotation.y = Math.PI / 4;
        spire.position.set(0, 36.8, 0);
        const clockFace = new THREE.Mesh(track(new THREE.BoxGeometry(3.8, 3.8, 7.2)), winGlowMat);
        clockFace.position.set(0, 27.5, 0);
        quad.add(bellTower, spire, clockFace);
      }
      group.add(quad);

      const poleX = rx + s.right.x * side * 14;
      const poleZ = rz + s.right.z * side * 14;
      if (isClearOfTrack(poleX, poleZ, barrierHalfWidth + 16)) {
        const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.45, 0.72, 34, 8)), steelMat);
        pole.position.set(poleX, ry + 17, poleZ);
        const headBar = new THREE.Mesh(track(new THREE.BoxGeometry(8.6, 0.6, 1.2)), steelMat);
        headBar.position.set(poleX, ry + 33.8, poleZ);
        headBar.rotation.y = yaw;
        const panel = new THREE.Mesh(track(new THREE.BoxGeometry(7.8, 3.2, 0.85)), floodMat);
        panel.position.set(poleX, ry + 34.4, poleZ);
        panel.rotation.y = yaw;
        group.add(pole, headBar, panel);
      }
    });
  }

  // Silverton Pass: Hyperbolic Cooling Towers, Blast Furnaces & Overhead Truss Pipe Bridges
  if (trackId === 'silverton_pass') {
    const foundryMat = track(new THREE.MeshStandardMaterial({ color: '#3F3A36', roughness: 0.7, metalness: 0.42 }));
    const coolProfile = [
      new THREE.Vector2(15.5, 0),
      new THREE.Vector2(13.2, 10),
      new THREE.Vector2(10.8, 22),
      new THREE.Vector2(10.3, 33),
      new THREE.Vector2(11.8, 46),
      new THREE.Vector2(12.3, 47.5),
      new THREE.Vector2(11.1, 47.5),
      new THREE.Vector2(9.6, 33),
    ];
    const coolGeo = track(new THREE.LatheGeometry(coolProfile, 22));
    const chimneyGeo = track(new THREE.CylinderGeometry(1.7, 3.2, 66, 12));
    const ringGlowMat = track(
      new THREE.MeshStandardMaterial({ color: '#FB923C', emissive: new THREE.Color('#EA580C'), emissiveIntensity: 3.4 }),
    );
    foundryRingGlowMat = ringGlowMat;
    [0.14, 0.42, 0.72].forEach((prog, idx) => {
      const s = samples[Math.floor(SAMPLE_COUNT * prog)];
      const side = idx === 1 ? -1 : 1;
      const sx = s.point.x + s.right.x * side * 52;
      const sz = s.point.z + s.right.z * side * 52;
      if (!isClearOfTrack(sx, sz, barrierHalfWidth + 30)) return;
      const baseH = sampleTerrainInfo(sx, sz).height - 1.5;
      const plinth = new THREE.Mesh(track(new THREE.CylinderGeometry(17, 18, 3.5, 22)), concreteStructMat);
      plinth.position.set(sx, baseH + 1.75, sz);
      const tower = new THREE.Mesh(coolGeo, foundryMat);
      tower.position.set(sx, baseH + 2.5, sz);
      const glowBand = new THREE.Mesh(track(new THREE.TorusGeometry(11.7, 0.5, 8, 24)), ringGlowMat);
      glowBand.rotation.x = Math.PI / 2;
      glowBand.position.set(sx, baseH + 49.5, sz);
      group.add(plinth, tower, glowBand);

      const stackX = sx + s.right.x * side * 22;
      const stackZ = sz + s.right.z * side * 22;
      if (isClearOfTrack(stackX, stackZ, barrierHalfWidth + 18)) {
        const stack = new THREE.Mesh(chimneyGeo, steelMat);
        stack.position.set(stackX, baseH + 33, stackZ);
        const stackBand = new THREE.Mesh(track(new THREE.CylinderGeometry(2.0, 2.0, 2.8, 12)), ringGlowMat);
        stackBand.position.set(stackX, baseH + 60, stackZ);
        group.add(stack, stackBand);
      }
    });

    // Overhead Steel Pipe Bridges across highway (conflict-checked against tunnels & shortcut portals)
    [0.18, 0.62].forEach((prog) => {
      const pIdx = resolveClearIdx(prog, 8);
      const s = samples[pIdx];
      const pg = new THREE.Group();
      pg.position.copy(s.point);
      pg.rotation.y = Math.atan2(-s.tangent.x, -s.tangent.z);
      const postG = track(new THREE.BoxGeometry(1.5, 13.5, 1.5));
      const pL = new THREE.Mesh(postG, steelMat);
      pL.position.set(-barrierHalfWidth - 1.1, 6.2, 0);
      const pR = new THREE.Mesh(postG, steelMat);
      pR.position.set(barrierHalfWidth + 1.1, 6.2, 0);
      const spanW = barrierHalfWidth * 2 + 4.5;
      const pipeGeo = track(new THREE.CylinderGeometry(1.05, 1.05, spanW, 12));
      pipeGeo.rotateZ(Math.PI / 2);
      const pipe1 = new THREE.Mesh(pipeGeo, foundryMat);
      pipe1.position.set(0, 11.2, -1.25);
      const pipe2 = new THREE.Mesh(pipeGeo, foundryMat);
      pipe2.position.set(0, 11.2, 1.25);
      const catwalk = new THREE.Mesh(track(new THREE.BoxGeometry(spanW, 0.45, 3.6)), steelMat);
      catwalk.position.set(0, 9.8, 0);
      pg.add(pL, pR, catwalk, pipe1, pipe2);
      group.add(pg);
    });
  }

  // Downtown Labyrinth: Elevated Metro Monorail Overpasses, Streamlined Skyway Bullet Train & Neon Strips
  if (trackId === 'downtown_labyrinth') {
    const neonMat = track(
      new THREE.MeshStandardMaterial({ color: '#38BDF8', emissive: new THREE.Color('#0284C7'), emissiveIntensity: 3.2 }),
    );
    const trainBodyMat = track(new THREE.MeshStandardMaterial({ color: '#CBD5E1', roughness: 0.36, metalness: 0.68 }));
    const trainWinMat = track(
      new THREE.MeshStandardMaterial({ color: '#E0F2FE', emissive: new THREE.Color('#38BDF8'), emissiveIntensity: 3.5 }),
    );
    [0.32, 0.78].forEach((prog, idx) => {
      const mIdx = resolveClearIdx(prog, 8);
      const s = samples[mIdx];
      const mg = new THREE.Group();
      mg.position.copy(s.point);
      mg.rotation.y = Math.atan2(-s.tangent.x, -s.tangent.z);
      const colG = track(new THREE.BoxGeometry(2.0, 16, 2.4));
      const cL = new THREE.Mesh(colG, concreteStructMat);
      cL.position.set(-barrierHalfWidth - 1.5, 4, 0);
      const cR = new THREE.Mesh(colG, concreteStructMat);
      cR.position.set(barrierHalfWidth + 1.5, 4, 0);
      const deck = new THREE.Mesh(track(new THREE.BoxGeometry(barrierHalfWidth * 2 + 64, 1.8, 5.4)), concreteStructMat);
      deck.position.set(0, 11.6, 0);
      const strip = new THREE.Mesh(track(new THREE.BoxGeometry(barrierHalfWidth * 2 + 60, 0.38, 5.6)), neonMat);
      strip.position.set(0, 10.9, 0);
      mg.add(cL, cR, deck, strip);

      if (idx === 0) {
        const trainGroup = new THREE.Group();
        trainGroup.position.set(0, 13.6, 0);
        const carGeo = track(new THREE.BoxGeometry(9.6, 2.25, 2.85));
        const roofGeo = track(new THREE.BoxGeometry(9.4, 0.45, 2.2));
        const winGeo = track(new THREE.BoxGeometry(8.2, 0.78, 2.98));
        const bogieGeo = track(new THREE.BoxGeometry(7.2, 0.55, 2.2));
        [-10.4, 0, 10.4].forEach((cx) => {
          const car = new THREE.Mesh(carGeo, trainBodyMat);
          car.position.x = cx;
          const roof = new THREE.Mesh(roofGeo, steelMat);
          roof.position.set(cx, 1.25, 0);
          const win = new THREE.Mesh(winGeo, trainWinMat);
          win.position.set(cx, 0.28, 0);
          const bogie = new THREE.Mesh(bogieGeo, steelMat);
          bogie.position.set(cx, -1.0, 0);
          trainGroup.add(car, roof, win, bogie);
        });
        const noseConeGeo = track(new THREE.ConeGeometry(1.5, 3.6, 6));
        noseConeGeo.rotateZ(-Math.PI / 2);
        const noseF = new THREE.Mesh(noseConeGeo, trainBodyMat);
        noseF.position.set(17.0, -0.1, 0);
        const noseR = new THREE.Mesh(noseConeGeo, trainBodyMat);
        noseR.rotation.y = Math.PI;
        noseR.position.set(-17.0, -0.1, 0);
        trainGroup.add(noseF, noseR);
        mg.add(trainGroup);
        monorailTrain = { mesh: trainGroup, span: barrierHalfWidth + 18 };
      }

      group.add(mg);
    });
  }

  // Heritage Forest: Covered Timber Warren-Truss Bridges (Clear of shortcut portals)
  if (trackId === 'heritage_forest') {
    const timberMat = track(new THREE.MeshStandardMaterial({ color: '#5C3A21', roughness: 0.86 }));
    const trussSlateMat = track(new THREE.MeshStandardMaterial({ color: '#27272A', roughness: 0.78 }));
    [0.20, 0.78].forEach((prog) => {
      const aIdx = resolveClearIdx(prog, 8);
      const s = samples[aIdx];
      const ag = new THREE.Group();
      ag.position.copy(s.point);
      ag.rotation.y = Math.atan2(-s.tangent.x, -s.tangent.z);
      const post = track(new THREE.BoxGeometry(1.2, 11.4, 1.4));
      const pL = new THREE.Mesh(post, timberMat);
      pL.position.set(-barrierHalfWidth - 0.3, 4.7, 0);
      const pR = new THREE.Mesh(post, timberMat);
      pR.position.set(barrierHalfWidth + 0.3, 4.7, 0);
      const beam = new THREE.Mesh(track(new THREE.BoxGeometry(barrierHalfWidth * 2 + 2.8, 1.5, 4.4)), timberMat);
      beam.position.set(0, 10.2, 0);
      const pitchL = new THREE.Mesh(track(new THREE.BoxGeometry(barrierHalfWidth + 2.4, 0.45, 5.2)), trussSlateMat);
      pitchL.position.set(-(barrierHalfWidth + 1.2) * 0.5, 11.8, 0);
      pitchL.rotation.z = 0.22;
      const pitchR = new THREE.Mesh(track(new THREE.BoxGeometry(barrierHalfWidth + 2.4, 0.45, 5.2)), trussSlateMat);
      pitchR.position.set((barrierHalfWidth + 1.2) * 0.5, 11.8, 0);
      pitchR.rotation.z = -0.22;
      ag.add(pL, pR, beam, pitchL, pitchR);
      group.add(ag);
    });
  }

  // Canyon & Blackridge Summit: Timber Trestles, Canyon Red-Rock Arch & Summit Observatory
  if (isCanyonOrSummit) {
    const timberMat = track(new THREE.MeshStandardMaterial({ color: '#5C3A21', roughness: 0.88, metalness: 0.08 }));
    [0.22, 0.67].forEach((prog) => {
      const aIdx = resolveClearIdx(prog, 8);
      const s = samples[aIdx];
      const archG = new THREE.Group();
      archG.position.copy(s.point);
      archG.rotation.y = Math.atan2(-s.tangent.x, -s.tangent.z);
      const sidePost = track(new THREE.BoxGeometry(1.15, 11.6, 1.2));
      const pL = new THREE.Mesh(sidePost, timberMat);
      pL.position.set(-barrierHalfWidth - 0.3, 4.8, 0);
      const pR = new THREE.Mesh(sidePost, timberMat);
      pR.position.set(barrierHalfWidth + 0.3, 4.8, 0);
      const topBeam = new THREE.Mesh(track(new THREE.BoxGeometry(barrierHalfWidth * 2 + 2.4, 1.4, 1.4)), timberMat);
      topBeam.position.set(0, 10.2, 0);
      const kneeGeo = track(new THREE.BoxGeometry(4.2, 0.65, 0.75));
      const kneeL = new THREE.Mesh(kneeGeo, timberMat);
      kneeL.position.set(-barrierHalfWidth + 0.9, 9.1, 0);
      kneeL.rotation.z = 0.72;
      const kneeR = new THREE.Mesh(kneeGeo, timberMat);
      kneeR.position.set(barrierHalfWidth - 0.9, 9.1, 0);
      kneeR.rotation.z = -0.72;
      archG.add(pL, pR, topBeam, kneeL, kneeR);
      group.add(archG);
    });

    if (trackId === 'rosewood_canyon') {
      const sandstoneMat = track(new THREE.MeshStandardMaterial({ color: '#9A4824', roughness: 0.94 }));
      const mesaS = samples[Math.floor(SAMPLE_COUNT * 0.62)];
      const mx = mesaS.point.x + mesaS.right.x * 54;
      const mz = mesaS.point.z + mesaS.right.z * 54;
      if (isClearOfTrack(mx, mz, barrierHalfWidth + 28)) {
        const my = sampleTerrainInfo(mx, mz).height - 2.0;
        const archMesa = new THREE.Group();
        archMesa.position.set(mx, my, mz);
        archMesa.rotation.y = Math.atan2(-mesaS.tangent.x, -mesaS.tangent.z) + 0.35;
        const pillarGeo = track(new THREE.CylinderGeometry(5.5, 9.5, 32, 8));
        const p1 = new THREE.Mesh(pillarGeo, sandstoneMat);
        p1.position.set(-14, 16, 0);
        const p2 = new THREE.Mesh(pillarGeo, sandstoneMat);
        p2.position.set(14, 16, 0);
        const lintel = new THREE.Mesh(track(new THREE.DodecahedronGeometry(16, 1)), sandstoneMat);
        lintel.scale.set(1.5, 0.45, 0.62);
        lintel.position.set(0, 31, 0);
        archMesa.add(p1, p2, lintel);
        group.add(archMesa);
      }
    }

    if (trackId === 'blackridge_summit') {
      const obsS = samples[Math.floor(SAMPLE_COUNT * 0.28)];
      const ox = obsS.point.x - obsS.right.x * 58;
      const oz = obsS.point.z - obsS.right.z * 58;
      if (isClearOfTrack(ox, oz, barrierHalfWidth + 30)) {
        const oy = sampleTerrainInfo(ox, oz).height - 2.0;
        const obsMat = track(new THREE.MeshStandardMaterial({ color: '#E2E8F0', roughness: 0.4, metalness: 0.38 }));
        const obsGroup = new THREE.Group();
        obsGroup.position.set(ox, oy, oz);
        obsGroup.rotation.y = Math.atan2(-obsS.tangent.x, -obsS.tangent.z);

        const terrace = new THREE.Mesh(track(new THREE.CylinderGeometry(20, 22, 4.5, 18)), concreteStructMat);
        terrace.position.y = 2.25;
        const base = new THREE.Mesh(track(new THREE.CylinderGeometry(16, 17.5, 16, 18)), obsMat);
        base.position.y = 12;
        const ringBand = new THREE.Mesh(track(new THREE.CylinderGeometry(16.6, 16.6, 1.8, 18)), steelMat);
        ringBand.position.y = 19.6;
        const dome = new THREE.Mesh(track(new THREE.SphereGeometry(15.5, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5)), obsMat);
        dome.position.y = 20;
        const slit = new THREE.Mesh(track(new THREE.BoxGeometry(3.8, 12, 16)), steelMat);
        slit.position.set(0, 26, 6);
        const scope = new THREE.Mesh(track(new THREE.CylinderGeometry(1.5, 1.8, 18, 12)), steelMat);
        scope.rotation.x = Math.PI * 0.32;
        scope.position.set(0, 29, 10.5);
        obsGroup.add(terrace, base, ringBand, dome, slit, scope);
        group.add(obsGroup);

        const mastX = ox - obsS.right.x * 26;
        const mastZ = oz - obsS.right.z * 26;
        if (isClearOfTrack(mastX, mastZ, barrierHalfWidth + 16)) {
          const mast = new THREE.Mesh(track(new THREE.CylinderGeometry(0.42, 1.15, 48, 8)), steelMat);
          mast.position.set(mastX, oy + 24, mastZ);
          const dish = new THREE.Mesh(track(new THREE.ConeGeometry(4.2, 2.2, 14)), obsMat);
          dish.rotation.x = Math.PI * 0.68;
          dish.position.set(mastX, oy + 38, mastZ + 1.4);
          group.add(mast, dish);
        }
      }
    }
  }

  // --- 5. Start / Finish Steel Gantry ---
  const startSample = samples[0];
  const gantryGroup = new THREE.Group();
  gantryGroup.position.copy(startSample.point);
  gantryGroup.rotation.y = Math.atan2(-startSample.tangent.x, -startSample.tangent.z);

  const pillarGeo = track(new THREE.BoxGeometry(1.1, 9.0, 1.1));
  const pLeft = new THREE.Mesh(pillarGeo, steelMat);
  pLeft.position.set(-barrierHalfWidth - 0.3, 4.5, 0);
  const pRight = new THREE.Mesh(pillarGeo, steelMat);
  pRight.position.set(barrierHalfWidth + 0.3, 4.5, 0);

  const trussGeo = track(new THREE.BoxGeometry(barrierHalfWidth * 2 + 2.4, 2.4, 1.2));
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

  const startStripGeo = track(new THREE.PlaneGeometry(roadHalfWidth * 2, 3.2));
  startStripGeo.rotateX(-Math.PI / 2);
  const startStripMat = track(
    new THREE.MeshBasicMaterial({
      color: '#F59E0B',
      transparent: true,
      opacity: 0.78,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  const startStrip = new THREE.Mesh(startStripGeo, startStripMat);
  startStrip.position.set(0, 0.06, 0);

  // Checkered Finish Tiles + 5-Pod Race Starting Light Gantry
  const tileGeo = track(new THREE.PlaneGeometry(1.75, 1.55));
  tileGeo.rotateX(-Math.PI / 2);
  const tileWhiteMat = track(
    new THREE.MeshBasicMaterial({ color: '#F8FAFC', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  const tileDarkMat = track(
    new THREE.MeshBasicMaterial({ color: '#0B0E14', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  const numCols = Math.max(6, Math.floor((roadHalfWidth * 1.85) / 1.85));
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < numCols; c++) {
      const tx = -roadHalfWidth * 0.92 + (c + 0.5) * ((roadHalfWidth * 1.84) / numCols);
      const tz = (r - 0.5) * 1.6;
      const tile = new THREE.Mesh(tileGeo, (r + c) % 2 === 0 ? tileWhiteMat : tileDarkMat);
      tile.position.set(tx, 0.068, tz);
      gantryGroup.add(tile);
    }
  }

  // 5-Pod Starting Signal Light Housing on Gantry Truss
  const lightBox = new THREE.Mesh(track(new THREE.BoxGeometry(7.6, 1.05, 0.72)), steelMat);
  lightBox.position.set(0, 6.2, 0.48);
  const podGeo = track(new THREE.CylinderGeometry(0.28, 0.28, 0.18, 12));
  podGeo.rotateX(Math.PI / 2);
  [-2.6, -1.3, 0, 1.3, 2.6].forEach((px) => {
    const podMat = track(
      new THREE.MeshStandardMaterial({
        color: '#450A0A',
        emissive: new THREE.Color('#EF4444'),
        emissiveIntensity: 0.3,
      }),
    );
    gantryPodMats.push(podMat);
    const pod = new THREE.Mesh(podGeo, podMat);
    pod.position.set(px, 6.2, 0.88);
    gantryGroup.add(pod);
  });

  // Painted Starting Grid Stall Boxes behind Start Line
  const gridBarGeo = track(new THREE.PlaneGeometry(2.6, 0.22));
  gridBarGeo.rotateX(-Math.PI / 2);
  for (let gSlot = 0; gSlot < 6; gSlot++) {
    const row = Math.floor(gSlot / 2);
    const col = gSlot % 2 === 0 ? -3.4 : 3.4;
    const zBack = 7.5 + row * 9.5;
    const gBar = new THREE.Mesh(gridBarGeo, tileWhiteMat);
    gBar.position.set(col, 0.065, zBack);
    gantryGroup.add(gBar);
  }

  gantryGroup.add(pLeft, pRight, truss, lightBox, startStrip);
  group.add(gantryGroup);

  // --- 6. Overhead Interstate Highway Signs & Billboards (Conflict-Checked) ---
  const signSpecs = [
    { prog: 0.16, title: `ROUTE // ${trackId.replace('_', ' ').toUpperCase()}`, sub: 'RADAR & SHORTCUT SECTOR' },
    { prog: 0.43, title: 'ROCKPORT EXPRESSWAY', sub: 'PURSUIT INTERCEPT ZONE' },
    { prog: 0.88, title: 'FINISH SECTOR AHEAD', sub: 'MAINTAIN APEX SPEED' },
  ];
  const hwBeamGeo = track(new THREE.BoxGeometry(barrierHalfWidth * 2 + 2, 0.48, 0.48));
  const hwSignGeo = track(new THREE.BoxGeometry(10.8, 3.6, 0.32));

  signSpecs.forEach((sp) => {
    const sIdx = resolveClearIdx(sp.prog, 10);
    reserveIdx(sIdx);
    const s = samples[sIdx];
    const sg = new THREE.Group();
    sg.position.copy(s.point);
    sg.rotation.y = Math.atan2(-s.tangent.x, -s.tangent.z);

    const pL = new THREE.Mesh(pillarGeo, steelMat);
    pL.position.set(-barrierHalfWidth - 0.3, 4.5, 0);
    const pR = new THREE.Mesh(pillarGeo, steelMat);
    pR.position.set(barrierHalfWidth + 0.3, 4.5, 0);
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
  [0.19, 0.64, 0.84].forEach((prog, i) => {
    const sIdx = resolveClearIdx(prog, 8);
    const s = samples[sIdx];
    const side = i % 2 === 0 ? 1 : -1;
    const bbX = s.point.x + s.right.x * side * (barrierHalfWidth + 7.2);
    const bbZ = s.point.z + s.right.z * side * (barrierHalfWidth + 7.2);
    if (!isClearOfTrack(bbX, bbZ, barrierHalfWidth + 5.0)) return;
    const bb = new THREE.Group();
    bb.position.set(bbX, s.point.y, bbZ);
    bb.rotation.y = Math.atan2(-s.tangent.x, -s.tangent.z) + (side === 1 ? -0.35 : 0.35);
    const post = new THREE.Mesh(track(new THREE.CylinderGeometry(0.42, 0.52, 8.5, 10)), steelMat);
    post.position.y = 4.25;
    const sign = new THREE.Mesh(bbGeo, [steelMat, steelMat, steelMat, steelMat, bbMat, bbMat]);
    sign.position.y = 9.5;
    bb.add(post, sign);
    group.add(bb);
  });

  // --- 7. Speed Traps (Conflict-Checked Outside Tunnels & Tollbooths) ---
  const speedTraps: SpeedTrap[] = [];
  const trapProgs = [0.13, 0.52, 0.82];
  const trapTargets = [175, 215, 195];
  const trapPostGeo = track(new THREE.BoxGeometry(0.42, 5.8, 0.42));
  const trapBarGeo = track(new THREE.BoxGeometry(barrierHalfWidth * 2, 0.45, 0.45));

  trapProgs.forEach((prog, i) => {
    const idx = resolveClearIdx(prog, 10);
    reserveIdx(idx);
    const s = samples[idx];
    const trapG = new THREE.Group();
    trapG.position.copy(s.point);
    trapG.rotation.y = Math.atan2(-s.tangent.x, -s.tangent.z);

    const postL = new THREE.Mesh(trapPostGeo, steelMat);
    postL.position.set(-barrierHalfWidth, 2.9, 0);
    const postR = new THREE.Mesh(trapPostGeo, steelMat);
    postR.position.set(barrierHalfWidth, 2.9, 0);

    const flashMat = track(
      new THREE.MeshStandardMaterial({
        color: '#06B6D4',
        emissive: new THREE.Color('#06B6D4'),
        emissiveIntensity: 2.2,
      }),
    );
    const flashBar = new THREE.Mesh(trapBarGeo, flashMat);
    flashBar.position.set(0, 5.65, 0);

    // Dual Police Radar Camera Pods mounted on overhead crossbar
    const camBoxGeo = track(new THREE.BoxGeometry(0.85, 0.65, 1.15));
    const camL = new THREE.Mesh(camBoxGeo, steelMat);
    camL.position.set(-roadHalfWidth * 0.48, 5.15, 0.15);
    const camR = new THREE.Mesh(camBoxGeo, steelMat);
    camR.position.set(roadHalfWidth * 0.48, 5.15, 0.15);
    const lensGeo = track(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 10));
    lensGeo.rotateX(Math.PI / 2);
    const lensL = new THREE.Mesh(lensGeo, flashMat);
    lensL.position.set(-roadHalfWidth * 0.48, 5.15, 0.75);
    const lensR = new THREE.Mesh(lensGeo, flashMat);
    lensR.position.set(roadHalfWidth * 0.48, 5.15, 0.75);

    trapG.add(postL, postR, flashBar, camL, camR, lensL, lensR);
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
  const tollPostGeo = track(new THREE.BoxGeometry(0.7, 6.8, 1.4));
  const tollRoofGeo = track(new THREE.BoxGeometry(barrierHalfWidth * 2 + 1.4, 1.1, 2.1));
  const tollBeaconGeo = track(new THREE.BoxGeometry(roadHalfWidth * 1.85, 0.25, 0.45));

  tollProgs.forEach((prog, idx) => {
    const s = samples[tollIndices[idx]];
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
    pL.position.set(-barrierHalfWidth, 3.4, 0);
    const pR = new THREE.Mesh(tollPostGeo, steelMat);
    pR.position.set(barrierHalfWidth, 3.4, 0);
    const kioskGeo = track(new THREE.BoxGeometry(1.4, 3.4, 3.4));
    const boothL = new THREE.Mesh(kioskGeo, steelMat);
    boothL.position.set(-barrierHalfWidth - 1.25, 1.7, 0);
    const boothR = new THREE.Mesh(kioskGeo, steelMat);
    boothR.position.set(barrierHalfWidth + 1.25, 1.7, 0);
    const roof = new THREE.Mesh(tollRoofGeo, steelMat);
    roof.position.set(0, 6.9, 0);
    const beacon = new THREE.Mesh(tollBeaconGeo, bMat);
    beacon.position.set(0, 6.25, 0);

    tg.add(pL, pR, boothL, boothR, roof, beacon);
    group.add(tg);

    tollbooths.push({
      id: idx,
      progress: prog,
      position: s.point.clone(),
      beaconMat: bMat,
      group: tg,
    });
  });

  // --- 9. Sloped Stunt Jump Ramps (Conflict-Checked) ---
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
        { prog: 0.33, lat: -4.4 },
        { prog: 0.64, lat: 4.5 },
        { prog: 0.90, lat: -4.2 },
      ]
    : [
        { prog: 0.34, lat: -4.5 },
        { prog: 0.72, lat: 4.5 },
      ];

  const rampHalfW = 2.6;
  const rampLen = 13.5;
  const rampHeight = 1.05;
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
    const sIdx = resolveClearIdx(spec.prog, 10);
    reserveIdx(sIdx);
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
    if (shortcutPortalIndices.some((pi) => idxDist(sIdx, pi) < 5)) continue;
    const s = samples[sIdx];
    const side = i % 2 === 0 ? 1 : -1;
    const lat = side * (roadHalfWidth - 0.65);
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

  // --- 11. Pursuit Breakers (Conflict-Checked Outside Tunnels & Shortcuts) ---
  const pursuitBreakers: PursuitBreaker[] = [];
  const breakerSpecs = [
    { prog: 0.21, side: 1 },
    { prog: 0.47, side: -1 },
    { prog: 0.72, side: 1 },
    { prog: 0.91, side: -1 },
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
    const idx = resolveClearIdx(spec.prog, 9);
    reserveIdx(idx);
    const s = samples[idx];
    const lat = spec.side * (roadHalfWidth + 0.15);
    const pos = s.point.clone().addScaledVector(s.right, lat);
    pos.y += lat * Math.sin(s.bankAngle);
    const bGroup = new THREE.Group();
    bGroup.position.copy(pos);
    bGroup.rotation.y = Math.atan2(-s.tangent.x, -s.tangent.z);

    const leg1 = new THREE.Mesh(legGeo, hazardMat);
    leg1.position.set(0, 2.7, -1.2);
    const leg2 = new THREE.Mesh(legGeo, hazardMat);
    leg2.position.set(0, 2.7, 1.2);
    const tank = new THREE.Mesh(tankGeo, scaffoldMat);
    tank.position.set(0, 6.2, 0);
    const ring = new THREE.Mesh(track(new THREE.TorusGeometry(2.25, 0.16, 8, 16)), hazardMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 5.2, 0);
    const floorRing = new THREE.Mesh(hazardRingGeo, hazardRingMat);
    floorRing.position.set(0, 0.09, 0);
    const beaconTop = new THREE.Mesh(track(new THREE.BoxGeometry(1.1, 0.36, 1.1)), sodiumLightMat);
    beaconTop.position.set(0, 7.8, 0);

    bGroup.add(leg1, leg2, tank, ring, beaconTop, floorRing);
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
    { prog: 0.36, side: -1 },
    { prog: 0.77, side: 1 },
  ];
  const zoneMat = track(
    new THREE.MeshBasicMaterial({ color: '#10B981', transparent: true, opacity: 0.58, depthWrite: false }),
  );
  const zoneGeo = track(new THREE.RingGeometry(4.4, 6.2, 24));
  zoneGeo.rotateX(-Math.PI / 2);

  cooldownSpecs.forEach((spec, i) => {
    const idx = resolveClearIdx(spec.prog, 8);
    const s = samples[idx];
    const lat = spec.side * (roadHalfWidth - 1.9);
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

  const polePlacements: { idx: number; side: number; px: number; py: number; pz: number; s: TrackSample }[] = [];
  for (let i = 0; i < lightPoleCount; i++) {
    const idx = Math.floor((i / lightPoleCount) * SAMPLE_COUNT);
    if (isInsideAnyTunnel(idx, 2) || isNearShortcutPortal(idx, 4)) continue;
    const s = samples[idx];
    const side = i % 2 === 0 ? 1 : -1;
    if ((side < 0 && leftBarrierCutout[idx] === 1) || (side > 0 && rightBarrierCutout[idx] === 1)) continue;
    const px = s.point.x + s.right.x * side * (barrierHalfWidth + 1.0);
    const pz = s.point.z + s.right.z * side * (barrierHalfWidth + 1.0);
    if (!isClearOfShortcuts(px, pz, 5.5)) continue;
    const py = s.point.y + side * barrierHalfWidth * Math.sin(s.bankAngle);
    polePlacements.push({ idx, side, px, py, pz, s });
  }

  const polesInst = new THREE.InstancedMesh(poleGeo, poleMat, polePlacements.length);
  const lampsInst = new THREE.InstancedMesh(lampGeo, lampMat, polePlacements.length);
  const halosInst = new THREE.InstancedMesh(haloGeo, haloMat, polePlacements.length);
  const poolsInst = new THREE.InstancedMesh(poolGeo, poolMat, polePlacements.length);

  for (let i = 0; i < polePlacements.length; i++) {
    const { s, side, px, py, pz } = polePlacements[i];
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

    const poolLat = side * (roadHalfWidth * 0.45);
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

  // High-contrast Directional Corner Chevron Boards (Left vs Right) + Pre-Turn Shoulder Markers
  const leftChevTex = track(createCornerChevronTexture(maxAnisotropy, 'left'));
  const rightChevTex = track(createCornerChevronTexture(maxAnisotropy, 'right'));
  const chevGeo = track(new THREE.BoxGeometry(3.8, 1.75, 0.24));
  const leftChevMat = track(
    new THREE.MeshStandardMaterial({
      map: leftChevTex,
      emissive: new THREE.Color('#F59E0B'),
      emissiveIntensity: 0.55,
      roughness: 0.35,
    }),
  );
  const rightChevMat = track(
    new THREE.MeshStandardMaterial({
      map: rightChevTex,
      emissive: new THREE.Color('#F59E0B'),
      emissiveIntensity: 0.55,
      roughness: 0.35,
    }),
  );

  const leftTurnChevs: { s: TrackSample; outerSide: number }[] = [];
  const rightTurnChevs: { s: TrackSample; outerSide: number }[] = [];
  for (let i = 0; i < SAMPLE_COUNT; i += 4) {
    if (isInsideAnyTunnel(i, 1) || isNearShortcutPortal(i, 5)) continue;
    const sPrev = samples[(i - 4 + SAMPLE_COUNT) % SAMPLE_COUNT];
    const sNext = samples[(i + 4) % SAMPLE_COUNT];
    const turnCross = sPrev.tangent.x * sNext.tangent.z - sPrev.tangent.z * sNext.tangent.x;
    if (Math.abs(turnCross) > 0.085) {
      const s = samples[i];
      const outerSide = turnCross > 0 ? -1 : 1;
      if ((outerSide < 0 && leftBarrierCutout[i] === 1) || (outerSide > 0 && rightBarrierCutout[i] === 1)) continue;
      const cx = s.point.x + s.right.x * outerSide * (barrierHalfWidth + 0.5);
      const cz = s.point.z + s.right.z * outerSide * (barrierHalfWidth + 0.5);
      if (!isClearOfShortcuts(cx, cz, 5.0)) continue;
      if (turnCross > 0) {
        rightTurnChevs.push({ s, outerSide: -1 });
      } else {
        leftTurnChevs.push({ s, outerSide: 1 });
      }
    }
  }

  const mountChevronInst = (
    items: { s: TrackSample; outerSide: number }[],
    mat: THREE.MeshStandardMaterial,
    turnSign: number,
  ) => {
    if (items.length === 0) return;
    const inst = new THREE.InstancedMesh(chevGeo, mat, items.length);
    items.forEach(({ s, outerSide }, ci) => {
      const cx = s.point.x + s.right.x * outerSide * (barrierHalfWidth + 0.5);
      const cz = s.point.z + s.right.z * outerSide * (barrierHalfWidth + 0.5);
      const cy = s.point.y + outerSide * barrierHalfWidth * Math.sin(s.bankAngle) + 2.15;
      dummy.position.set(cx, cy, cz);
      // Angle face slightly toward oncoming traffic so sign reads head-on through the bend
      dummy.rotation.set(0, Math.atan2(-s.tangent.x, -s.tangent.z) - turnSign * 0.34, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(ci, dummy.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    group.add(inst);
  };

  mountChevronInst(leftTurnChevs, leftChevMat, 1);
  mountChevronInst(rightTurnChevs, rightChevMat, -1);

  // Corner Apex Red/White Racing Tire Barrier Stacks (InstancedMesh)
  const apexTireSpots: { x: number; y: number; z: number; yaw: number; isRed: boolean }[] = [];
  leftTurnChevs.concat(rightTurnChevs).forEach((item, ti) => {
    if (ti % 2 !== 0) return;
    const s = item.s;
    const bankSlope = Math.sin(s.bankAngle);
    const lat = item.outerSide * (barrierHalfWidth - 0.6);
    const yaw = Math.atan2(-s.tangent.x, -s.tangent.z);
    for (let stack = 0; stack < 3; stack++) {
      apexTireSpots.push({
        x: s.point.x + s.right.x * lat,
        y: s.point.y + lat * bankSlope + 0.22 + stack * 0.36,
        z: s.point.z + s.right.z * lat,
        yaw,
        isRed: (ti + stack) % 2 === 0,
      });
    }
  });
  if (apexTireSpots.length > 0) {
    const tireGeo = track(new THREE.CylinderGeometry(0.46, 0.48, 0.34, 12));
    const tireMat = track(new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.82, metalness: 0.08 }));
    const tireInst = new THREE.InstancedMesh(tireGeo, tireMat, apexTireSpots.length);
    const tireRed = new THREE.Color('#DC2626');
    const tireWhite = new THREE.Color('#F1F5F9');
    apexTireSpots.forEach((tp, idx) => {
      dummy.position.set(tp.x, tp.y, tp.z);
      dummy.rotation.set(0, tp.yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      tireInst.setMatrixAt(idx, dummy.matrix);
      tireInst.setColorAt(idx, tp.isRed ? tireRed : tireWhite);
    });
    tireInst.instanceMatrix.needsUpdate = true;
    if (tireInst.instanceColor) tireInst.instanceColor.needsUpdate = true;
    tireInst.computeBoundingSphere();
    group.add(tireInst);
  }

  // Corner Braking Distance Marker Boards (150m / 100m / 50m) on outer verge approaching sharp bends
  const brakeSpots: { idx: number; outerSide: number; label: '150' | '100' | '50' }[] = [];
  for (let i = 16; i < SAMPLE_COUNT - 8; i += 6) {
    if (isInsideAnyTunnel(i, 2)) continue;
    const sPrev = samples[(i - 4 + SAMPLE_COUNT) % SAMPLE_COUNT];
    const sNext = samples[(i + 4) % SAMPLE_COUNT];
    const prevPrev = samples[(i - 10 + SAMPLE_COUNT) % SAMPLE_COUNT];
    const prevNext = samples[(i - 2 + SAMPLE_COUNT) % SAMPLE_COUNT];
    const turnCur = sPrev.tangent.x * sNext.tangent.z - sPrev.tangent.z * sNext.tangent.x;
    const turnBefore = prevPrev.tangent.x * prevNext.tangent.z - prevPrev.tangent.z * prevNext.tangent.x;
    // Detect entry of a heavy corner after a straight/mild bend
    if (Math.abs(turnCur) > 0.145 && Math.abs(turnBefore) < 0.085) {
      const outerSide = turnCur > 0 ? -1 : 1;
      const marks: { offset: number; label: '150' | '100' | '50' }[] = [
        { offset: 12, label: '150' },
        { offset: 8, label: '100' },
        { offset: 4, label: '50' },
      ];
      marks.forEach((m) => {
        const bIdx = (i - m.offset + SAMPLE_COUNT) % SAMPLE_COUNT;
        if (isInsideAnyTunnel(bIdx, 1) || isNearShortcutPortal(bIdx, 5)) return;
        if ((outerSide < 0 && leftBarrierCutout[bIdx] === 1) || (outerSide > 0 && rightBarrierCutout[bIdx] === 1)) return;
        const bs = samples[bIdx];
        const bx = bs.point.x + bs.right.x * outerSide * (barrierHalfWidth + 1.35);
        const bz = bs.point.z + bs.right.z * outerSide * (barrierHalfWidth + 1.35);
        if (!isClearOfShortcuts(bx, bz, 5.5)) return;
        brakeSpots.push({ idx: bIdx, outerSide, label: m.label });
      });
      i += 18;
    }
  }
  if (brakeSpots.length > 0) {
    const bBoardGeo = track(new THREE.BoxGeometry(1.5, 1.5, 0.18));
    const bPostGeo = track(new THREE.BoxGeometry(0.16, 2.2, 0.16));
    (['150', '100', '50'] as const).forEach((distLbl) => {
      const sub = brakeSpots.filter((bs) => bs.label === distLbl);
      if (!sub.length) return;
      const bTex = track(createBrakingBoardTexture(maxAnisotropy, distLbl));
      const bMat = track(
        new THREE.MeshStandardMaterial({
          map: bTex,
          roughness: 0.35,
          emissive: new THREE.Color('#FFFFFF'),
          emissiveIntensity: environment === 'midnight_neon' ? 0.38 : 0.12,
        }),
      );
      const boards = new THREE.InstancedMesh(bBoardGeo, bMat, sub.length);
      const posts = new THREE.InstancedMesh(bPostGeo, poleMat, sub.length);
      sub.forEach((bs, bi) => {
        const s = samples[bs.idx];
        const bx = s.point.x + s.right.x * bs.outerSide * (barrierHalfWidth + 1.35);
        const bz = s.point.z + s.right.z * bs.outerSide * (barrierHalfWidth + 1.35);
        const by = s.point.y + bs.outerSide * barrierHalfWidth * Math.sin(s.bankAngle);
        const yaw = Math.atan2(-s.tangent.x, -s.tangent.z);
        dummy.position.set(bx, by + 2.25, bz);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        boards.setMatrixAt(bi, dummy.matrix);

        dummy.position.set(bx, by + 1.1, bz);
        dummy.updateMatrix();
        posts.setMatrixAt(bi, dummy.matrix);
      });
      boards.instanceMatrix.needsUpdate = true;
      posts.instanceMatrix.needsUpdate = true;
      boards.computeBoundingSphere();
      posts.computeBoundingSphere();
      group.add(boards, posts);
    });

    // Rubber Tire Braking Skid Patches on asphalt approaching sharp bends
    const skidPatchGeo = track(new THREE.PlaneGeometry(0.42, 6.5));
    skidPatchGeo.rotateX(-Math.PI / 2);
    const skidPatchMat = track(
      new THREE.MeshBasicMaterial({
        color: '#07090D',
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    const cornerApproachSpots = brakeSpots.filter((bs) => bs.label === '50');
    if (cornerApproachSpots.length > 0) {
      const skidPatches = new THREE.InstancedMesh(skidPatchGeo, skidPatchMat, cornerApproachSpots.length * 4);
      let spIdx = 0;
      cornerApproachSpots.forEach((bs) => {
        const s = samples[bs.idx];
        const yaw = Math.atan2(-s.tangent.x, -s.tangent.z);
        const bankSlope = Math.sin(s.bankAngle);
        [-3.4, -1.6, 1.6, 3.4].forEach((lat) => {
          dummy.position.set(
            s.point.x + s.right.x * lat,
            s.point.y + 0.068 + lat * bankSlope,
            s.point.z + s.right.z * lat,
          );
          dummy.rotation.set(s.slopePitch, yaw, -s.bankAngle, 'YXZ');
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          skidPatches.setMatrixAt(spIdx++, dummy.matrix);
        });
      });
      skidPatches.instanceMatrix.needsUpdate = true;
      skidPatches.computeBoundingSphere();
      group.add(skidPatches);
    }
  }

  // Trackside Spectator Grandstands & Stadium Floodlight Gantries on main straightaways
  const gsSeatMat = track(new THREE.MeshStandardMaterial({ color: '#1E293B', roughness: 0.72, metalness: 0.25 }));
  const gsAccentMat = track(new THREE.MeshStandardMaterial({ color: '#F59E0B', roughness: 0.48 }));
  const gsRoofMat = track(new THREE.MeshStandardMaterial({ color: '#0F172A', roughness: 0.55, metalness: 0.5 }));
  const gsFloodMat = track(
    new THREE.MeshStandardMaterial({
      color: '#FEF9C3',
      emissive: new THREE.Color('#FDE047'),
      emissiveIntensity: environment === 'noon_clear' ? 0.8 : 3.4,
    }),
  );
  [0.025, 0.49].forEach((prog, gIdx) => {
    const gsIdx = resolveClearIdx(prog, 10);
    const s = samples[gsIdx];
    const side = gIdx === 0 ? -1 : 1;
    const gx = s.point.x + s.right.x * side * (barrierHalfWidth + 24);
    const gz = s.point.z + s.right.z * side * (barrierHalfWidth + 24);
    if (!isClearOfTrack(gx, gz, barrierHalfWidth + 22)) return;
    const gy = Math.max(s.point.y - 0.5, sampleTerrainInfo(gx, gz).height);
    const gsG = new THREE.Group();
    gsG.position.set(gx, gy, gz);
    // Orient grandstand long axis parallel to straight and tiers stepping up away from road
    gsG.rotation.y = Math.atan2(-s.tangent.x, -s.tangent.z) + (side === -1 ? Math.PI : 0);

    for (let tier = 0; tier < 4; tier++) {
      const stepDeck = new THREE.Mesh(track(new THREE.BoxGeometry(3.2, 1.5 + tier * 1.4, 34)), gsSeatMat);
      stepDeck.position.set(tier * 2.8, (1.5 + tier * 1.4) * 0.5, 0);
      const seatRow = new THREE.Mesh(track(new THREE.BoxGeometry(0.9, 0.42, 33.4)), gsAccentMat);
      seatRow.position.set(tier * 2.8 - 0.5, 1.5 + tier * 1.4 + 0.21, 0);
      gsG.add(stepDeck, seatRow);
    }
    const canopy = new THREE.Mesh(track(new THREE.BoxGeometry(12.5, 0.55, 35.5)), gsRoofMat);
    canopy.position.set(4.5, 9.6, 0);
    canopy.rotation.z = -0.14;
    const roofStrutGeo = track(new THREE.BoxGeometry(0.45, 4.2, 0.45));
    [-14, 0, 14].forEach((sz) => {
      const strut = new THREE.Mesh(roofStrutGeo, steelMat);
      strut.position.set(8.8, 7.6, sz);
      gsG.add(strut);
    });
    const floodBar = new THREE.Mesh(track(new THREE.BoxGeometry(0.55, 0.75, 28)), gsFloodMat);
    floodBar.position.set(-1.1, 8.7, 0);
    gsG.add(canopy, floodBar);
    group.add(gsG);
  });

  // --- 14. Environment-Adapted Multi-Part Foliage (Palms, Broadleaf / Olive Groves & Cypress) ---
  interface TreeSpot {
    x: number;
    y: number;
    z: number;
    scale: number;
    tint: THREE.Color;
    kind: 'palm' | 'broadleaf';
  }
  const treePositions: TreeSpot[] = [];
  const foliagePalette =
    isForestTrack || environment === 'noon_clear' || environment === 'dawn_mist' || environment === 'mediterranean_day'
      ? [
          new THREE.Color('#2E7D32'),
          new THREE.Color('#43A047'),
          new THREE.Color('#558B2F'),
          new THREE.Color('#689F38'),
          new THREE.Color('#2E6F40'),
        ]
      : environment === 'canyon_sun'
        ? [
            new THREE.Color('#EA580C'),
            new THREE.Color('#D97706'),
            new THREE.Color('#65A30D'),
            new THREE.Color('#4D7C0F'),
            new THREE.Color('#CA8A04'),
          ]
        : [
            new THREE.Color('#D97706'),
            new THREE.Color('#B45309'),
            new THREE.Color('#4D7C0F'),
            new THREE.Color('#3F6212'),
            new THREE.Color('#65A30D'),
            new THREE.Color('#CA8A04'),
          ];

  const treeStep = isForestTrack ? 3 : 4;
  for (let i = 0; i < SAMPLE_COUNT; i += treeStep) {
    const s = samples[i];
    const side = i % 2 === 0 ? 1 : -1;
    const distOut = barrierHalfWidth + 13 + ((i * 7) % 16);
    const tx = s.point.x + s.right.x * side * distOut;
    const tz = s.point.z + s.right.z * side * distOut;
    if (hasHarborBay && tz < minZ + 380 && tx > minX - 80 && tx < maxX + 120) continue;
    if (isClearOfTrack(tx, tz, barrierHalfWidth + 10)) {
      const ty = sampleTerrainInfo(tx, tz).height;
      if (ty > -3) {
        const forestBoost = trackId === 'heritage_forest' ? 1.38 : isForestTrack ? 1.15 : 0.94;
        const nearCoast = hasHarborBay && tz < minZ + 560;
        treePositions.push({
          x: tx,
          y: ty - 0.3,
          z: tz,
          scale: forestBoost + ((i * 13) % 7) * 0.11,
          tint: foliagePalette[i % foliagePalette.length],
          kind: nearCoast || ((trackId === 'rockport_loop' || trackId === 'camden_coast') && i % 3 === 0) ? 'palm' : 'broadleaf',
        });
      }
    }
  }

  for (let t = 0; t < (isForestTrack ? 280 : 190); t++) {
    const ang = t * 2.39996;
    const rad = 140 + ((t * 73) % 1450);
    const tx = terrainCenterX + Math.cos(ang) * rad;
    const tz = terrainCenterZ + Math.sin(ang) * rad;
    if (hasHarborBay && tz < minZ + 380 && tx > minX - 80 && tx < maxX + 120) continue;
    if (isClearOfTrack(tx, tz, barrierHalfWidth + 26)) {
      const ty = sampleTerrainInfo(tx, tz).height;
      if (ty > -3) {
        const nearCoast = hasHarborBay && tz < minZ + 560;
        treePositions.push({
          x: tx,
          y: ty - 0.4,
          z: tz,
          scale: (trackId === 'heritage_forest' ? 1.32 : 1.0) + (t % 5) * 0.16,
          tint: foliagePalette[t % foliagePalette.length],
          kind: nearCoast ? 'palm' : 'broadleaf',
        });
      }
    }
  }

  const palmTrees = treePositions.filter((t) => t.kind === 'palm');
  const broadTrees = treePositions.filter((t) => t.kind === 'broadleaf');

  if (palmTrees.length > 0) {
    // Multi-part Date Palms: tapered lower trunk + angled upper trunk + 6 arched radiating fronds
    const palmLowerGeo = track(new THREE.CylinderGeometry(0.28, 0.44, 4.6, 7));
    palmLowerGeo.translate(0, 2.3, 0);
    const palmUpperGeo = track(new THREE.CylinderGeometry(0.20, 0.28, 4.2, 7));
    palmUpperGeo.translate(0, 2.1, 0);
    const palmTrunkMat = track(new THREE.MeshStandardMaterial({ color: '#6B4F35', roughness: 0.92 }));
    const palmFrondGeo = track(new THREE.BoxGeometry(0.95, 0.14, 3.6));
    palmFrondGeo.translate(0, 0, 1.8);
    const palmFrondMat = track(new THREE.MeshStandardMaterial({ color: '#2F855A', roughness: 0.72 }));

    const pLow = new THREE.InstancedMesh(palmLowerGeo, palmTrunkMat, palmTrees.length);
    const pUp = new THREE.InstancedMesh(palmUpperGeo, palmTrunkMat, palmTrees.length);
    const pFronds = new THREE.InstancedMesh(palmFrondGeo, palmFrondMat, palmTrees.length * 6);
    const frondTint = new THREE.Color('#38A169');

    palmTrees.forEach((tp, idx) => {
      const yaw = idx * 1.15;
      const lean = 0.08 + (idx % 3) * 0.03;
      dummy.position.set(tp.x, tp.y, tp.z);
      dummy.rotation.set(lean, yaw, 0, 'YXZ');
      dummy.scale.setScalar(tp.scale);
      dummy.updateMatrix();
      pLow.setMatrixAt(idx, dummy.matrix);

      const topX = tp.x + Math.sin(yaw) * Math.sin(lean) * 4.4 * tp.scale;
      const topZ = tp.z + Math.cos(yaw) * Math.sin(lean) * 4.4 * tp.scale;
      const topY = tp.y + Math.cos(lean) * 4.4 * tp.scale;
      dummy.position.set(topX, topY, topZ);
      dummy.rotation.set(lean * 1.4, yaw, 0, 'YXZ');
      dummy.scale.setScalar(tp.scale);
      dummy.updateMatrix();
      pUp.setMatrixAt(idx, dummy.matrix);

      const crownX = topX + Math.sin(yaw) * Math.sin(lean * 1.4) * 4.0 * tp.scale;
      const crownZ = topZ + Math.cos(yaw) * Math.sin(lean * 1.4) * 4.0 * tp.scale;
      const crownY = topY + Math.cos(lean * 1.4) * 4.0 * tp.scale;
      for (let f = 0; f < 6; f++) {
        const fYaw = yaw + (f / 6) * Math.PI * 2;
        dummy.position.set(crownX, crownY, crownZ);
        dummy.rotation.set(0.32 + (f % 2) * 0.14, fYaw, 0, 'YXZ');
        dummy.scale.set(tp.scale, tp.scale, tp.scale * (0.92 + (f % 3) * 0.1));
        dummy.updateMatrix();
        pFronds.setMatrixAt(idx * 6 + f, dummy.matrix);
        pFronds.setColorAt(idx * 6 + f, f % 2 === 0 ? frondTint : tp.tint);
      }
    });
    [pLow, pUp, pFronds].forEach((m) => {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
      group.add(m);
    });
    if (pFronds.instanceColor) pFronds.instanceColor.needsUpdate = true;
  }

  if (broadTrees.length > 0) {
    // Multi-part Mediterranean Broadleaf / Olive Trees (trunk + 3 organic asymmetric foliage clusters)
    const trunkGeo = track(new THREE.CylinderGeometry(0.28, 0.48, 4.4, 7));
    trunkGeo.translate(0, 2.2, 0);
    const trunkMat = track(new THREE.MeshStandardMaterial({ color: '#4A3222', roughness: 0.94 }));
    const crownMainGeo = track(new THREE.DodecahedronGeometry(2.6, 1));
    crownMainGeo.translate(0, 5.8, 0);
    const crownSideGeo = track(new THREE.DodecahedronGeometry(1.85, 1));
    crownSideGeo.translate(1.25, 4.9, 0.7);
    const crownTopGeo = track(new THREE.DodecahedronGeometry(1.65, 1));
    crownTopGeo.translate(-0.85, 6.8, -0.6);
    const foliageMat = track(new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.84, metalness: 0.02 }));

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, broadTrees.length);
    const leaves1 = new THREE.InstancedMesh(crownMainGeo, foliageMat, broadTrees.length);
    const leaves2 = new THREE.InstancedMesh(crownSideGeo, foliageMat, broadTrees.length);
    const leaves3 = new THREE.InstancedMesh(crownTopGeo, foliageMat, broadTrees.length);

    broadTrees.forEach((tp, idx) => {
      dummy.position.set(tp.x, tp.y, tp.z);
      dummy.rotation.set(0, idx * 0.85, 0);
      dummy.scale.set(tp.scale * (0.95 + (idx % 3) * 0.08), tp.scale, tp.scale * (0.95 + ((idx + 1) % 3) * 0.08));
      dummy.updateMatrix();
      trunks.setMatrixAt(idx, dummy.matrix);
      leaves1.setMatrixAt(idx, dummy.matrix);
      leaves2.setMatrixAt(idx, dummy.matrix);
      leaves3.setMatrixAt(idx, dummy.matrix);
      leaves1.setColorAt(idx, tp.tint);
      leaves2.setColorAt(idx, tp.tint);
      leaves3.setColorAt(idx, tp.tint);
    });
    [trunks, leaves1, leaves2, leaves3].forEach((m) => {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
      group.add(m);
    });
    if (leaves1.instanceColor) leaves1.instanceColor.needsUpdate = true;
    if (leaves2.instanceColor) leaves2.instanceColor.needsUpdate = true;
    if (leaves3.instanceColor) leaves3.instanceColor.needsUpdate = true;
  }

  // Trackside Bushes, Shrub Clusters & Rock Outcrops along road verges (eliminates empty terrain)
  const bushSpots: { x: number; y: number; z: number; sx: number; sy: number; sz: number; tint: THREE.Color }[] = [];
  const rockSpots: { x: number; y: number; z: number; sx: number; sy: number; sz: number; rot: number }[] = [];
  for (let i = 2; i < SAMPLE_COUNT; i += 3) {
    if (isInsideAnyTunnel(i, 1) || isNearShortcutPortal(i, 3)) continue;
    const s = samples[i];
    const side = i % 2 === 0 ? 1 : -1;
    const distOut = barrierHalfWidth + 6.5 + ((i * 11) % 10);
    const bx = s.point.x + s.right.x * side * distOut;
    const bz = s.point.z + s.right.z * side * distOut;
    if (hasHarborBay && bz < minZ + 380 && bx > minX - 80 && bx < maxX + 120) continue;
    if (!isClearOfTrack(bx, bz, barrierHalfWidth + 5.0)) continue;
    const by = Math.max(s.point.y - 0.8, sampleTerrainInfo(bx, bz).height);
    if (by < -2.2) continue;

    if (isCanyonOrSummit && i % 6 === 0) {
      rockSpots.push({
        x: bx,
        y: by + 0.4,
        z: bz,
        sx: 1.6 + (i % 4) * 0.7,
        sy: 1.0 + (i % 3) * 0.55,
        sz: 1.5 + ((i * 3) % 4) * 0.65,
        rot: i * 0.7,
      });
    } else {
      bushSpots.push({
        x: bx,
        y: by + 0.35,
        z: bz,
        sx: 1.2 + (i % 4) * 0.42,
        sy: 0.75 + (i % 3) * 0.3,
        sz: 1.2 + ((i + 2) % 4) * 0.4,
        tint: foliagePalette[(i + 1) % foliagePalette.length],
      });
    }
  }
  if (bushSpots.length > 0) {
    const bushGeo = track(new THREE.IcosahedronGeometry(1.15, 1));
    const bushMat = track(new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.88, metalness: 0.02 }));
    const bushInst = new THREE.InstancedMesh(bushGeo, bushMat, bushSpots.length);
    bushSpots.forEach((bs, idx) => {
      dummy.position.set(bs.x, bs.y, bs.z);
      dummy.rotation.set(0, idx * 0.55, 0);
      dummy.scale.set(bs.sx, bs.sy, bs.sz);
      dummy.updateMatrix();
      bushInst.setMatrixAt(idx, dummy.matrix);
      bushInst.setColorAt(idx, bs.tint);
    });
    bushInst.instanceMatrix.needsUpdate = true;
    if (bushInst.instanceColor) bushInst.instanceColor.needsUpdate = true;
    bushInst.computeBoundingSphere();
    group.add(bushInst);
  }
  if (rockSpots.length > 0) {
    const bldRockGeo = track(new THREE.DodecahedronGeometry(1.3, 0));
    const bldRockMat = track(
      new THREE.MeshStandardMaterial({
        color: trackId === 'blackridge_summit' ? '#64748B' : '#854D27',
        roughness: 0.95,
        metalness: 0.04,
      }),
    );
    const rockInst = new THREE.InstancedMesh(bldRockGeo, bldRockMat, rockSpots.length);
    rockSpots.forEach((rs, idx) => {
      dummy.position.set(rs.x, rs.y, rs.z);
      dummy.rotation.set(0.2 * idx, rs.rot, 0.1 * idx);
      dummy.scale.set(rs.sx, rs.sy, rs.sz);
      dummy.updateMatrix();
      rockInst.setMatrixAt(idx, dummy.matrix);
    });
    rockInst.instanceMatrix.needsUpdate = true;
    rockInst.computeBoundingSphere();
    group.add(rockInst);
  }

  // --- 14B. Oceanfront Villas, Turquoise Pool Decks, Marina Piers & Moored Yachts + Countryside "3robyat" Rural Estates ---
  const villaTex = track(createBuildingFacadeTexture(maxAnisotropy, 'villa'));
  const villaWallMat = track(
    new THREE.MeshStandardMaterial({
      map: villaTex,
      color: '#FFFFFF',
      roughness: 0.72,
      metalness: 0.04,
    }),
  );
  const villaRoofMat = track(new THREE.MeshStandardMaterial({ color: '#B4532A', roughness: 0.78, metalness: 0.05 }));
  const stoneWallMat = track(new THREE.MeshStandardMaterial({ color: '#D6C8B0', roughness: 0.88, metalness: 0.03 }));
  const pergolaWoodMat = track(new THREE.MeshStandardMaterial({ color: '#6E4726', roughness: 0.82, metalness: 0.05 }));
  const poolWaterMat = track(
    new THREE.MeshStandardMaterial({
      color: '#06B6D4',
      emissive: new THREE.Color('#0891B2'),
      emissiveIntensity: environment === 'midnight_neon' ? 1.1 : 0.35,
      roughness: 0.12,
      metalness: 0.45,
    }),
  );

  interface VillaSpot {
    x: number;
    y: number;
    z: number;
    yaw: number;
    scale: number;
    hasPool: boolean;
  }
  const villaSpots: VillaSpot[] = [];

  for (let i = 4; i < SAMPLE_COUNT; i += 6) {
    if (isInsideAnyTunnel(i, 2) || isNearShortcutPortal(i, 5)) continue;
    const s = samples[i];
    const inRuralZone =
      isForestTrack ||
      trackId === 'hwy99_speedway' ||
      trackId === 'silverton_pass' ||
      trackId === 'camden_coast' ||
      trackId === 'gray_point_bay' ||
      trackId === 'rockport_loop' ||
      (s.progress >= 0.20 && s.progress <= 0.78);
    if (!inRuralZone && !(hasHarborBay && s.point.z < minZ + 620)) continue;

    const side = i % 2 === 0 ? 1 : -1;
    const distOut = barrierHalfWidth + 27 + ((i * 9) % 24);
    const vx = s.point.x + s.right.x * side * distOut;
    const vz = s.point.z + s.right.z * side * distOut;
    if (hasHarborBay && vz < minZ + 380 && vx > minX - 80 && vx < maxX + 120) continue;
    if (!isClearOfTrack(vx, vz, barrierHalfWidth + 23)) continue;
    const vy = sampleTerrainInfo(vx, vz).height;
    if (vy < -1.8) continue;

    const isCoastalVilla = hasHarborBay && vz < minZ + 680;
    villaSpots.push({
      x: vx,
      y: vy - 0.35,
      z: vz,
      yaw: Math.atan2(-s.tangent.x, -s.tangent.z) + (side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5),
      scale: 0.94 + (i % 3) * 0.16,
      hasPool: isCoastalVilla || i % 2 === 0,
    });
  }

  if (villaSpots.length > 0) {
    const vMainGeo = track(new THREE.BoxGeometry(12.2, 6.0, 8.8));
    vMainGeo.translate(0, 3.0, 0);
    const vWingGeo = track(new THREE.BoxGeometry(6.8, 3.9, 6.6));
    vWingGeo.translate(5.0, 1.95, 2.8);
    const vPorticoGeo = track(new THREE.BoxGeometry(8.6, 3.2, 2.8));
    vPorticoGeo.translate(-1.2, 1.6, 5.2);
    const vPergolaGeo = track(new THREE.BoxGeometry(6.4, 0.28, 3.4));
    vPergolaGeo.translate(5.0, 4.95, 2.8);
    const vRoofGeo = track(new THREE.ConeGeometry(7.8, 3.0, 4));
    vRoofGeo.rotateY(Math.PI * 0.25);
    vRoofGeo.scale(1.18, 1, 0.9);
    vRoofGeo.translate(0, 7.5, 0);
    const vWingRoofGeo = track(new THREE.ConeGeometry(5.1, 2.1, 4));
    vWingRoofGeo.rotateY(Math.PI * 0.25);
    vWingRoofGeo.translate(5.0, 4.95, 2.8);
    const vCourtyardGeo = track(new THREE.BoxGeometry(20.4, 9.6, 16.8));
    vCourtyardGeo.translate(0.8, -3.35, 2.0);
    const vPoolDeckGeo = track(new THREE.BoxGeometry(7.2, 0.35, 4.8));
    vPoolDeckGeo.translate(-3.4, 0.2, 7.2);
    const vPoolGeo = track(new THREE.BoxGeometry(5.8, 0.38, 3.6));
    vPoolGeo.translate(-3.4, 0.26, 7.2);

    const vMains = new THREE.InstancedMesh(vMainGeo, villaWallMat, villaSpots.length);
    const vWings = new THREE.InstancedMesh(vWingGeo, villaWallMat, villaSpots.length);
    const vPorticos = new THREE.InstancedMesh(vPorticoGeo, villaWallMat, villaSpots.length);
    const vPergolas = new THREE.InstancedMesh(vPergolaGeo, pergolaWoodMat, villaSpots.length);
    const vRoofs = new THREE.InstancedMesh(vRoofGeo, villaRoofMat, villaSpots.length);
    const vWRoofs = new THREE.InstancedMesh(vWingRoofGeo, villaRoofMat, villaSpots.length);
    const vWalls = new THREE.InstancedMesh(vCourtyardGeo, stoneWallMat, villaSpots.length);
    const poolVillas = villaSpots.filter((v) => v.hasPool);
    const vPoolDecks = poolVillas.length > 0 ? new THREE.InstancedMesh(vPoolDeckGeo, stoneWallMat, poolVillas.length) : null;
    const vPools = poolVillas.length > 0 ? new THREE.InstancedMesh(vPoolGeo, poolWaterMat, poolVillas.length) : null;
    let pIdx = 0;

    villaSpots.forEach((vs, idx) => {
      dummy.position.set(vs.x, vs.y, vs.z);
      dummy.rotation.set(0, vs.yaw, 0);
      dummy.scale.setScalar(vs.scale);
      dummy.updateMatrix();
      vMains.setMatrixAt(idx, dummy.matrix);
      vWings.setMatrixAt(idx, dummy.matrix);
      vPorticos.setMatrixAt(idx, dummy.matrix);
      vPergolas.setMatrixAt(idx, dummy.matrix);
      vRoofs.setMatrixAt(idx, dummy.matrix);
      vWRoofs.setMatrixAt(idx, dummy.matrix);
      vWalls.setMatrixAt(idx, dummy.matrix);
      if (vPools && vPoolDecks && vs.hasPool) {
        vPoolDecks.setMatrixAt(pIdx, dummy.matrix);
        vPools.setMatrixAt(pIdx, dummy.matrix);
        pIdx++;
      }
    });
    [vMains, vWings, vPorticos, vPergolas, vRoofs, vWRoofs, vWalls].forEach((m) => {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
      group.add(m);
    });
    if (vPools && vPoolDecks) {
      vPoolDecks.instanceMatrix.needsUpdate = true;
      vPoolDecks.computeBoundingSphere();
      vPools.instanceMatrix.needsUpdate = true;
      vPools.computeBoundingSphere();
      group.add(vPoolDecks, vPools);
    }
  }

  // Countryside Windmills / Turbines on rural ridges ("3robyat" open countryside horizons)
  if (!isCanyonOrSummit && trackId !== 'downtown_labyrinth') {
    const millSpots: { x: number; y: number; z: number; yaw: number; scale: number }[] = [];
    for (let m = 0; m < 10; m++) {
      const s = samples[Math.floor(((0.22 + m * 0.052) % 1) * SAMPLE_COUNT)];
      const side = m % 2 === 0 ? 1 : -1;
      const mx = s.point.x + s.right.x * side * (barrierHalfWidth + 68 + (m % 3) * 26);
      const mz = s.point.z + s.right.z * side * (barrierHalfWidth + 68 + (m % 3) * 26);
      if (hasHarborBay && mz < minZ + 380 && mx > minX - 80 && mx < maxX + 120) continue;
      if (!isClearOfTrack(mx, mz, barrierHalfWidth + 52)) continue;
      const my = sampleTerrainInfo(mx, mz).height;
      if (my > 0) {
        millSpots.push({ x: mx, y: my - 0.5, z: mz, yaw: m * 0.7, scale: 1.0 + (m % 3) * 0.18 });
      }
    }
    if (millSpots.length > 0) {
      const mastGeo = track(new THREE.CylinderGeometry(0.45, 1.05, 24, 8));
      mastGeo.translate(0, 12, 0);
      const hubGeo = track(new THREE.BoxGeometry(1.6, 1.4, 3.0));
      hubGeo.translate(0, 24.2, 0);
      const bladeGeo = track(new THREE.BoxGeometry(0.65, 9.5, 0.18));
      bladeGeo.translate(0, 4.75, 0);
      const turbineMat = track(new THREE.MeshStandardMaterial({ color: '#E2E8F0', roughness: 0.42, metalness: 0.35 }));

      const masts = new THREE.InstancedMesh(mastGeo, turbineMat, millSpots.length);
      const hubs = new THREE.InstancedMesh(hubGeo, turbineMat, millSpots.length);
      const blades = new THREE.InstancedMesh(bladeGeo, turbineMat, millSpots.length * 3);

      millSpots.forEach((ms, idx) => {
        dummy.position.set(ms.x, ms.y, ms.z);
        dummy.rotation.set(0, ms.yaw, 0);
        dummy.scale.setScalar(ms.scale);
        dummy.updateMatrix();
        masts.setMatrixAt(idx, dummy.matrix);
        hubs.setMatrixAt(idx, dummy.matrix);
        for (let b = 0; b < 3; b++) {
          dummy.position.set(
            ms.x + Math.sin(ms.yaw) * 1.7 * ms.scale,
            ms.y + 24.2 * ms.scale,
            ms.z + Math.cos(ms.yaw) * 1.7 * ms.scale,
          );
          dummy.rotation.set(0, ms.yaw, (b / 3) * Math.PI * 2 + idx * 0.4, 'YXZ');
          dummy.scale.setScalar(ms.scale);
          dummy.updateMatrix();
          blades.setMatrixAt(idx * 3 + b, dummy.matrix);
        }
      });
      [masts, hubs, blades].forEach((m) => {
        m.instanceMatrix.needsUpdate = true;
        m.computeBoundingSphere();
        group.add(m);
      });
    }
  }

  // Trackside "3robyat" Fuel & Pit Service Stations + Limestone Village Plazas & Fountain Terraces
  const stationSpots: { x: number; y: number; z: number; yaw: number }[] = [];
  [0.18, 0.44, 0.68, 0.87].forEach((prog, si) => {
    const idx = Math.floor(SAMPLE_COUNT * prog);
    if (isInsideAnyTunnel(idx, 3) || isNearShortcutPortal(idx, 5)) return;
    const s = samples[idx];
    const side = si % 2 === 0 ? 1 : -1;
    const distOut = barrierHalfWidth + 24;
    const fx = s.point.x + s.right.x * side * distOut;
    const fz = s.point.z + s.right.z * side * distOut;
    if (hasHarborBay && fz < minZ + 380 && fx > minX - 80 && fx < maxX + 120) return;
    if (!isClearOfTrack(fx, fz, barrierHalfWidth + 21)) return;
    const fy = sampleTerrainInfo(fx, fz).height;
    if (fy < -1.5) return;
    stationSpots.push({
      x: fx,
      y: fy - 0.25,
      z: fz,
      yaw: Math.atan2(-s.tangent.x, -s.tangent.z) + (side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5),
    });
  });

  if (stationSpots.length > 0) {
    const apronGeo = track(new THREE.BoxGeometry(19.4, 8.8, 14.4));
    apronGeo.translate(0, -3.95, 0);
    const canopyGeo = track(new THREE.BoxGeometry(15, 0.85, 8.5));
    canopyGeo.translate(0, 5.2, 2.2);
    const stripGeo = track(new THREE.BoxGeometry(15.2, 0.34, 8.7));
    stripGeo.translate(0, 5.3, 2.2);
    const boothGeo = track(new THREE.BoxGeometry(11.5, 3.8, 4.6));
    boothGeo.translate(0, 2.0, -4.0);
    const pillarGeoS = track(new THREE.BoxGeometry(0.65, 4.9, 0.65));
    const totemGeo = track(new THREE.BoxGeometry(2.0, 8.4, 0.7));
    totemGeo.translate(8.4, 4.2, 5.2);

    const canopyStripMat = track(
      new THREE.MeshStandardMaterial({
        color: '#34D399',
        emissive: new THREE.Color(environment === 'midnight_neon' ? '#0EA5E9' : '#F59E0B'),
        emissiveIntensity: environment === 'noon_clear' ? 0.8 : 2.6,
        roughness: 0.25,
      }),
    );

    const aprons = new THREE.InstancedMesh(apronGeo, concreteStructMat, stationSpots.length);
    const canopies = new THREE.InstancedMesh(canopyGeo, steelMat, stationSpots.length);
    const strips = new THREE.InstancedMesh(stripGeo, canopyStripMat, stationSpots.length);
    const booths = new THREE.InstancedMesh(boothGeo, villaWallMat, stationSpots.length);
    const totems = new THREE.InstancedMesh(totemGeo, canopyStripMat, stationSpots.length);
    const pillarsS = new THREE.InstancedMesh(pillarGeoS, steelMat, stationSpots.length * 4);

    stationSpots.forEach((st, idx) => {
      dummy.position.set(st.x, st.y, st.z);
      dummy.rotation.set(0, st.yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      aprons.setMatrixAt(idx, dummy.matrix);
      canopies.setMatrixAt(idx, dummy.matrix);
      strips.setMatrixAt(idx, dummy.matrix);
      booths.setMatrixAt(idx, dummy.matrix);
      totems.setMatrixAt(idx, dummy.matrix);

      const cosY = Math.cos(st.yaw);
      const sinY = Math.sin(st.yaw);
      [[-5.5, 0.2], [5.5, 0.2], [-5.5, 4.2], [5.5, 4.2]].forEach(([px, pz], pi) => {
        dummy.position.set(st.x + px * cosY + pz * sinY, st.y + 2.6, st.z - px * sinY + pz * cosY);
        dummy.rotation.set(0, st.yaw, 0);
        dummy.updateMatrix();
        pillarsS.setMatrixAt(idx * 4 + pi, dummy.matrix);
      });
    });
    [aprons, canopies, strips, booths, totems, pillarsS].forEach((m) => {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
      group.add(m);
    });
  }

  // Tall Mediterranean Cypress Trees flanking villa drives & coastal ridges
  const cypressSpots: { x: number; y: number; z: number; scale: number }[] = [];
  villaSpots.forEach((vs, vi) => {
    const cx = vs.x + Math.cos(vs.yaw) * 11.5;
    const cz = vs.z - Math.sin(vs.yaw) * 11.5;
    if (isClearOfTrack(cx, cz, barrierHalfWidth + 14)) {
      cypressSpots.push({ x: cx, y: vs.y, z: cz, scale: 0.9 + (vi % 3) * 0.22 });
    }
  });
  if (cypressSpots.length > 0) {
    const cTrunkGeo = track(new THREE.CylinderGeometry(0.24, 0.36, 2.2, 6));
    cTrunkGeo.translate(0, 1.1, 0);
    const cConeGeo = track(new THREE.ConeGeometry(1.45, 9.6, 8));
    cConeGeo.translate(0, 6.4, 0);
    const cTrunkMat = track(new THREE.MeshStandardMaterial({ color: '#4A3222', roughness: 0.94 }));
    const cLeafMat = track(new THREE.MeshStandardMaterial({ color: '#1B4D3E', roughness: 0.86 }));
    const cTrunks = new THREE.InstancedMesh(cTrunkGeo, cTrunkMat, cypressSpots.length);
    const cCones = new THREE.InstancedMesh(cConeGeo, cLeafMat, cypressSpots.length);
    cypressSpots.forEach((cs, idx) => {
      dummy.position.set(cs.x, cs.y, cs.z);
      dummy.rotation.set(0, idx * 0.6, 0);
      dummy.scale.setScalar(cs.scale);
      dummy.updateMatrix();
      cTrunks.setMatrixAt(idx, dummy.matrix);
      cCones.setMatrixAt(idx, dummy.matrix);
    });
    [cTrunks, cCones].forEach((m) => {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
      group.add(m);
    });
  }

  // Coastal Marina Timber Piers & Moored Luxury Yachts inside Harbor Bay
  if (hasHarborBay) {
    const waterY = -2.8;
    const marinaBaseZ = minZ + 320;
    const pierGeo = track(new THREE.BoxGeometry(4.5, 0.55, 42));
    const pierMat = track(new THREE.MeshStandardMaterial({ color: '#785A3C', roughness: 0.88 }));
    const yachtHullGeo = track(new THREE.BoxGeometry(4.2, 1.8, 13.5));
    yachtHullGeo.translate(0, 0.85, 0);
    const yachtCabinGeo = track(new THREE.BoxGeometry(3.2, 1.5, 7.2));
    yachtCabinGeo.translate(0, 2.35, -0.4);
    const yachtFlyGeo = track(new THREE.BoxGeometry(2.4, 0.95, 3.8));
    yachtFlyGeo.translate(0, 3.55, -0.8);
    const yachtGlassMat = track(new THREE.MeshStandardMaterial({ color: '#0F172A', roughness: 0.15, metalness: 0.65 }));
    const yachtWhiteMat = track(new THREE.MeshStandardMaterial({ color: '#F8FAFC', roughness: 0.3, metalness: 0.12 }));

    const piers = new THREE.InstancedMesh(pierGeo, pierMat, 5);
    const hulls = new THREE.InstancedMesh(yachtHullGeo, yachtWhiteMat, 10);
    const cabins = new THREE.InstancedMesh(yachtCabinGeo, yachtGlassMat, 10);
    const flys = new THREE.InstancedMesh(yachtFlyGeo, yachtWhiteMat, 10);

    for (let p = 0; p < 5; p++) {
      const px = terrainCenterX - 240 + p * 125;
      const pz = marinaBaseZ - 38;
      dummy.position.set(px, waterY + 0.75, pz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      piers.setMatrixAt(p, dummy.matrix);

      for (let side = 0; side < 2; side++) {
        const yIdx = p * 2 + side;
        const yx = px + (side === 0 ? -5.8 : 5.8);
        const yz = pz - 6 - side * 10;
        dummy.position.set(yx, waterY - 0.15, yz);
        dummy.rotation.set(0, (side === 0 ? 0.04 : -0.04) + p * 0.02, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        hulls.setMatrixAt(yIdx, dummy.matrix);
        cabins.setMatrixAt(yIdx, dummy.matrix);
        flys.setMatrixAt(yIdx, dummy.matrix);
      }
    }
    [piers, hulls, cabins, flys].forEach((m) => {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
      group.add(m);
    });
  }

  // Urban / Industrial Close-Track Architectural Storefronts & Awning Canopies (Zero clipping margin)
  if (!isCanyonOrSummit && !isForestTrack) {
    const shopSpots: { x: number; y: number; z: number; yaw: number; sx: number; sy: number; sz: number }[] = [];
    for (let i = 4; i < SAMPLE_COUNT; i += 9) {
      if (isInsideAnyTunnel(i, 2) || isNearShortcutPortal(i, 5)) continue;
      const s = samples[i];
      if (s.progress >= 0.24 && s.progress <= 0.72 && trackId !== 'downtown_labyrinth') continue;
      const side = i % 2 === 0 ? 1 : -1;
      const sxOut = barrierHalfWidth + 24.0 + ((i * 5) % 9);
      const px = s.point.x + s.right.x * side * sxOut;
      const pz = s.point.z + s.right.z * side * sxOut;
      if (hasHarborBay && pz < minZ + 380 && px > minX - 80 && px < maxX + 120) continue;
      if (!isClearOfTrack(px, pz, barrierHalfWidth + 21.5)) continue;
      const py = sampleTerrainInfo(px, pz).height;
      if (py < -2) continue;
      shopSpots.push({
        x: px,
        y: py - 0.5,
        z: pz,
        yaw: Math.atan2(-s.tangent.x, -s.tangent.z),
        sx: 10 + (i % 3) * 3,
        sy: 7.5 + (i % 4) * 2.5,
        sz: 12 + (i % 4) * 3,
      });
    }
    if (shopSpots.length > 0) {
      const shopBodyGeo = track(new THREE.BoxGeometry(1, 1, 1));
      shopBodyGeo.translate(0, 0.5, 0);
      const shopTex = track(createBuildingFacadeTexture(maxAnisotropy, 'concrete'));
      const shopBodyMat = track(
        new THREE.MeshStandardMaterial({
          map: shopTex,
          color: '#E2E8F0',
          roughness: 0.65,
          metalness: 0.16,
        }),
      );
      const shopSignGeo = track(new THREE.BoxGeometry(1.06, 0.1, 1.04));
      const shopSignMat = track(
        new THREE.MeshStandardMaterial({
          color: environment === 'midnight_neon' ? '#38BDF8' : '#F59E0B',
          emissive: new THREE.Color(environment === 'midnight_neon' ? '#0EA5E9' : '#D97706'),
          emissiveIntensity: environment === 'noon_clear' ? 0.32 : 1.6,
          roughness: 0.3,
        }),
      );
      const shopsInst = new THREE.InstancedMesh(shopBodyGeo, shopBodyMat, shopSpots.length);
      const signsInst = new THREE.InstancedMesh(shopSignGeo, shopSignMat, shopSpots.length);
      shopSpots.forEach((sh, idx) => {
        dummy.position.set(sh.x, sh.y, sh.z);
        dummy.rotation.set(0, sh.yaw, 0);
        dummy.scale.set(sh.sx, sh.sy, sh.sz);
        dummy.updateMatrix();
        shopsInst.setMatrixAt(idx, dummy.matrix);

        dummy.position.set(sh.x, sh.y + sh.sy * 0.42, sh.z);
        dummy.scale.set(sh.sx, sh.sy, sh.sz);
        dummy.updateMatrix();
        signsInst.setMatrixAt(idx, dummy.matrix);
      });
      shopsInst.instanceMatrix.needsUpdate = true;
      signsInst.instanceMatrix.needsUpdate = true;
      shopsInst.computeBoundingSphere();
      signsInst.computeBoundingSphere();
      group.add(shopsInst, signsInst);
    }
  }

  // --- 15. Multi-Tiered City Skyscrapers & Canyon / Alpine Cliff Formations ---
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
    for (let i = 0; i < SAMPLE_COUNT; i += 7) {
      const s = samples[i];
      [-1, 1].forEach((side, sIdx) => {
        const bx = s.point.x + s.right.x * side * (barrierHalfWidth + 46 + ((i * 5) % 28));
        const bz = s.point.z + s.right.z * side * (barrierHalfWidth + 46 + ((i * 5) % 28));
        if (isClearOfTrack(bx, bz, barrierHalfWidth + 38)) {
          bldgItems.push({
            x: bx,
            y: sampleTerrainInfo(bx, bz).height - 2,
            z: bz,
            sx: 22 + ((i + sIdx) % 4) * 6,
            sy: trackId === 'blackridge_summit' ? 34 + ((i * 3) % 54) : 26 + ((i * 3) % 44),
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
      const s = samples[i];
      const yaw = Math.atan2(-s.tangent.x, -s.tangent.z);
      const isDowntown =
        trackId === 'downtown_labyrinth' ||
        (trackId === 'silverton_pass' && (s.progress < 0.14 || s.progress > 0.86)) ||
        (s.progress < 0.08 || s.progress > 0.93);
      if (!isDowntown && (trackId === 'hwy99_speedway' || trackId === 'camden_coast' || trackId === 'rockport_loop' || trackId === 'gray_point_bay')) {
        continue;
      }
      [-1, 1].forEach((side, sIdx) => {
        const distOut = barrierHalfWidth + 46 + ((i + sIdx * 11) % 30);
        const bx = s.point.x + s.right.x * side * distOut;
        const bz = s.point.z + s.right.z * side * distOut;
        if (hasHarborBay && bz < minZ + 380 && bx > minX - 80 && bx < maxX + 120) return;
        if (isClearOfTrack(bx, bz, barrierHalfWidth + 40)) {
          bldgItems.push({
            x: bx,
            y: sampleTerrainInfo(bx, bz).height - 1.5,
            z: bz,
            sx: 18 + ((i + sIdx * 3) % 4) * 4,
            sy: isDowntown ? 52 + ((i * 7) % 72) : 22 + ((i * 5) % 28),
            sz: 18 + ((i + sIdx * 5) % 4) * 4,
            rot: yaw,
            variant: (i + sIdx) % 3,
          });
        }
      });
    }

    // Outer city district skyline blocks for lush background depth (well back on scenic villa tracks)
    const outerMargin = trackId === 'downtown_labyrinth' ? barrierHalfWidth + 46 : barrierHalfWidth + 82;
    const outerCount = trackId === 'downtown_labyrinth' ? 120 : 64;
    for (let k = 0; k < outerCount; k++) {
      const ang = k * 2.39996;
      const rad = 240 + ((k * 89) % Math.max(600, maxTrackRad + 180));
      const bx = terrainCenterX + Math.cos(ang) * rad;
      const bz = terrainCenterZ + Math.sin(ang) * rad;
      if (hasHarborBay && bz < minZ + 440 && bx > minX - 100 && bx < maxX + 140) continue;
      if (isClearOfTrack(bx, bz, outerMargin)) {
        bldgItems.push({
          x: bx,
          y: sampleTerrainInfo(bx, bz).height - 1.5,
          z: bz,
          sx: 22 + (k % 4) * 5,
          sy: 32 + ((k * 11) % 64),
          sz: 22 + ((k + 2) % 4) * 5,
          rot: (k % 8) * (Math.PI * 0.25),
          variant: k % 3,
        });
      }
    }
  }

  if (bldgItems.length > 0) {
    if (isCanyonOrSummit || isForestTrack) {
      const mtnRockTex = track(createBuildingFacadeTexture(maxAnisotropy, 'rock'));
      const rockTier1 = track(new THREE.ConeGeometry(1.05, 1.0, 6));
      rockTier1.translate(0, 0.5, 0);
      const rockTier2 = track(new THREE.DodecahedronGeometry(0.68, 1));
      const rockTier3 = track(new THREE.ConeGeometry(0.62, 0.52, 5));
      rockTier3.translate(0, 0.26, 0);
      const rockMat = track(
        new THREE.MeshStandardMaterial({
          map: mtnRockTex,
          color: isForestTrack ? '#64748B' : trackId === 'blackridge_summit' ? '#6B7A90' : '#9A633C',
          roughness: 0.94,
          metalness: 0.04,
        }),
      );
      const capRockMat = track(
        new THREE.MeshStandardMaterial({
          map: mtnRockTex,
          color: trackId === 'blackridge_summit' ? '#CBD5E1' : isForestTrack ? '#475569' : '#784E2F',
          roughness: 0.9,
          metalness: 0.04,
        }),
      );
      const rocks = new THREE.InstancedMesh(rockTier1, rockMat, bldgItems.length);
      const shoulders = new THREE.InstancedMesh(rockTier2, rockMat, bldgItems.length);
      const caps = new THREE.InstancedMesh(rockTier3, capRockMat, bldgItems.length);
      bldgItems.forEach((bp, i) => {
        const totalH = bp.sy + 16;
        dummy.position.set(bp.x, bp.y - 16, bp.z);
        dummy.rotation.set(0, bp.rot, 0);
        dummy.scale.set(bp.sx * 1.15, totalH, bp.sz * 1.15);
        dummy.updateMatrix();
        rocks.setMatrixAt(i, dummy.matrix);

        dummy.position.set(bp.x + Math.cos(bp.rot) * bp.sx * 0.28, bp.y - 4 + bp.sy * 0.24, bp.z + Math.sin(bp.rot) * bp.sz * 0.28);
        dummy.rotation.set(0.18, bp.rot + 0.9, 0.12);
        dummy.scale.set(bp.sx * 0.72, bp.sy * 0.42, bp.sz * 0.72);
        dummy.updateMatrix();
        shoulders.setMatrixAt(i, dummy.matrix);

        dummy.position.set(bp.x, bp.y + bp.sy * 0.56, bp.z);
        dummy.rotation.set(0, bp.rot + 0.55, 0);
        dummy.scale.set(bp.sx * 0.58, bp.sy * 0.46, bp.sz * 0.58);
        dummy.updateMatrix();
        caps.setMatrixAt(i, dummy.matrix);
      });
      rocks.instanceMatrix.needsUpdate = true;
      shoulders.instanceMatrix.needsUpdate = true;
      caps.instanceMatrix.needsUpdate = true;
      rocks.computeBoundingSphere();
      shoulders.computeBoundingSphere();
      caps.computeBoundingSphere();
      group.add(rocks, shoulders, caps);
    } else {
      const podiumGeo = track(new THREE.BoxGeometry(1.12, 1, 1.12));
      podiumGeo.translate(0, 0.5, 0);
      const shaftGeo = track(new THREE.BoxGeometry(1, 1, 1));
      shaftGeo.translate(0, 0.5, 0);
      const setbackGeo = track(new THREE.BoxGeometry(0.68, 1, 0.68));
      setbackGeo.translate(0, 0.5, 0);
      const roofCrownGeo = track(new THREE.BoxGeometry(0.72, 0.65, 0.72));
      const spireGeo = track(new THREE.CylinderGeometry(0.16, 0.34, 10, 6));
      spireGeo.translate(0, 5, 0);
      const beaconGeo = track(new THREE.SphereGeometry(0.42, 6, 6));

      const winGlow = environment === 'midnight_neon' ? 0.52 : environment === 'noon_clear' ? 0.04 : 0.24;
      const podiumMat = track(new THREE.MeshStandardMaterial({ color: '#1F2937', roughness: 0.78, metalness: 0.2 }));
      const crownMat = track(new THREE.MeshStandardMaterial({ color: '#273244', metalness: 0.58, roughness: 0.36 }));
      const roofNeonMat = track(
        new THREE.MeshStandardMaterial({
          color: environment === 'midnight_neon' ? '#38BDF8' : '#F59E0B',
          emissive: new THREE.Color(environment === 'midnight_neon' ? '#0EA5E9' : '#D97706'),
          emissiveIntensity: environment === 'noon_clear' ? 0.28 : 1.9,
        }),
      );
      const beaconRedMat = track(
        new THREE.MeshStandardMaterial({ color: '#EF4444', emissive: new THREE.Color('#EF4444'), emissiveIntensity: 3.0 }),
      );
      const glassTex = track(createBuildingFacadeTexture(maxAnisotropy, 'glass'));
      const concreteTex = track(createBuildingFacadeTexture(maxAnisotropy, 'concrete'));
      const indTex = track(createBuildingFacadeTexture(maxAnisotropy, 'industrial'));

      const glassMat = track(
        new THREE.MeshStandardMaterial({
          map: glassTex,
          color: '#FFFFFF',
          emissiveMap: glassTex,
          emissive: new THREE.Color('#FFFFFF'),
          emissiveIntensity: winGlow,
          roughness: 0.28,
          metalness: 0.44,
        }),
      );
      const concreteMat = track(
        new THREE.MeshStandardMaterial({
          map: concreteTex,
          color: '#FFFFFF',
          emissiveMap: concreteTex,
          emissive: new THREE.Color('#FFFFFF'),
          emissiveIntensity: winGlow * 0.72,
          roughness: 0.68,
          metalness: 0.14,
        }),
      );
      const indMat = track(
        new THREE.MeshStandardMaterial({
          map: indTex,
          color: '#FFFFFF',
          emissiveMap: indTex,
          emissive: new THREE.Color('#FFFFFF'),
          emissiveIntensity: winGlow * 0.72,
          roughness: 0.74,
          metalness: 0.2,
        }),
      );
      const mats = [glassMat, concreteMat, indMat];

      [0, 1, 2].forEach((vIdx) => {
        const subset = bldgItems.filter((b) => b.variant === vIdx);
        if (!subset.length) return;
        const podiums = new THREE.InstancedMesh(podiumGeo, podiumMat, subset.length);
        const shafts = new THREE.InstancedMesh(shaftGeo, mats[vIdx], subset.length);
        const setbacks = new THREE.InstancedMesh(setbackGeo, crownMat, subset.length);
        const neonCrowns = new THREE.InstancedMesh(roofCrownGeo, roofNeonMat, subset.length);
        const tallOnes = subset.filter((b) => b.sy > 56);
        const spires = tallOnes.length > 0 ? new THREE.InstancedMesh(spireGeo, crownMat, tallOnes.length) : null;
        const beacons = tallOnes.length > 0 ? new THREE.InstancedMesh(beaconGeo, beaconRedMat, tallOnes.length) : null;
        let spIdx = 0;

        subset.forEach((bp, idx) => {
          const podH = Math.max(6.5, bp.sy * 0.18);
          const shaftH = Math.max(10, bp.sy - podH);

          dummy.position.set(bp.x, bp.y - 16, bp.z);
          dummy.rotation.set(0, bp.rot, 0);
          dummy.scale.set(bp.sx, podH + 16, bp.sz);
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

          dummy.position.set(bp.x, bp.y + bp.sy + 5.7, bp.z);
          dummy.scale.set(bp.sx, 1, bp.sz);
          dummy.updateMatrix();
          neonCrowns.setMatrixAt(idx, dummy.matrix);

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

        [podiums, shafts, setbacks, neonCrowns].forEach((m) => {
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

  // --- 16. Distant Horizon Skyline / Mountain Silhouette Ring (Strictly Outside Track Perimeter) ---
  const horizonTargetCount = 38;
  const horizonSpots: { hx: number; hz: number; ang: number; i: number }[] = [];
  for (let i = 0; i < horizonTargetCount; i++) {
    const ang = (i / horizonTargetCount) * Math.PI * 2;
    const rad = maxTrackRad + 260 + (i % 4) * 95;
    const hx = terrainCenterX + Math.cos(ang) * rad;
    const hz = terrainCenterZ + Math.sin(ang) * rad;
    if (isClearOfTrack(hx, hz, barrierHalfWidth + 210)) {
      horizonSpots.push({ hx, hz, ang, i });
    }
  }
  if (horizonSpots.length > 0) {
    if (isCanyonOrSummit || isForestTrack) {
      const peakGeo = track(new THREE.ConeGeometry(85, 1, 6));
      peakGeo.translate(0, 0.5, 0);
      const peakMat = track(
        new THREE.MeshStandardMaterial({
          color: trackId === 'blackridge_summit' ? '#334155' : isForestTrack ? '#1E3A2F' : '#4E3122',
          roughness: 0.96,
          metalness: 0.02,
        }),
      );
      const peaks = new THREE.InstancedMesh(peakGeo, peakMat, horizonSpots.length);
      horizonSpots.forEach((hs, idx) => {
        const hScale = 165 + ((hs.i * 29) % 140);
        const baseH = Math.min(-6, sampleTerrainInfo(hs.hx, hs.hz).height - 8);
        dummy.position.set(hs.hx, baseH, hs.hz);
        dummy.rotation.set(0, hs.ang + 0.4, 0);
        dummy.scale.set(1.25 + (hs.i % 3) * 0.35, hScale, 1.15 + (hs.i % 2) * 0.4);
        dummy.updateMatrix();
        peaks.setMatrixAt(idx, dummy.matrix);
      });
      peaks.instanceMatrix.needsUpdate = true;
      peaks.computeBoundingSphere();
      group.add(peaks);
    } else {
      const skyTowerGeo = track(new THREE.BoxGeometry(1, 1, 1));
      skyTowerGeo.translate(0, 0.5, 0);
      const skyGlassTex = track(createBuildingFacadeTexture(maxAnisotropy, 'glass'));
      const skyTowerMat = track(
        new THREE.MeshStandardMaterial({
          map: skyGlassTex,
          color: '#1E293B',
          emissiveMap: skyGlassTex,
          emissive: new THREE.Color(environment === 'midnight_neon' ? '#38BDF8' : '#F59E0B'),
          emissiveIntensity: environment === 'noon_clear' ? 0.08 : 0.42,
          roughness: 0.55,
          metalness: 0.35,
        }),
      );
      const skyTowers = new THREE.InstancedMesh(skyTowerGeo, skyTowerMat, horizonSpots.length);
      horizonSpots.forEach((hs, idx) => {
        const h = 130 + ((hs.i * 37) % 175);
        const w = 48 + (hs.i % 4) * 14;
        const baseH = Math.min(-6, sampleTerrainInfo(hs.hx, hs.hz).height - 4);
        dummy.position.set(hs.hx, baseH, hs.hz);
        dummy.rotation.set(0, hs.ang, 0);
        dummy.scale.set(w, h, w * 0.85);
        dummy.updateMatrix();
        skyTowers.setMatrixAt(idx, dummy.matrix);
      });
      skyTowers.instanceMatrix.needsUpdate = true;
      skyTowers.computeBoundingSphere();
      group.add(skyTowers);
    }
  }

  // --- Analytical Track Query (supports multi-level upper/lower bridge deck disambiguation via currentY) ---
  const getClosestTrackInfo = (x: number, z: number, hintIndex?: number, currentY?: number) => {
    let bestIdx = 0;
    let bestDistSq = Infinity;
    let bestScore = Infinity;

    if (hintIndex !== undefined && hintIndex >= 0 && hintIndex < SAMPLE_COUNT) {
      const windowRadius = 38;
      for (let offset = -windowRadius; offset <= windowRadius; offset++) {
        const idx = (hintIndex + offset + SAMPLE_COUNT) % SAMPLE_COUNT;
        const p = samples[idx].point;
        const dx = x - p.x;
        const dz = z - p.z;
        const dSq = dx * dx + dz * dz;
        const dy = currentY !== undefined ? currentY - p.y : 0;
        const score = dSq + dy * dy * 16;
        if (score < bestScore) {
          bestScore = score;
          bestDistSq = dSq;
          bestIdx = idx;
        }
      }
      if (bestDistSq > 95 * 95) {
        const hintPt = samples[hintIndex].point;
        const maxAnchorDistSq = 240 * 240;
        let localAnchorScore = bestScore;
        let localAnchorDistSq = bestDistSq;
        let localAnchorIdx = bestIdx;
        for (let i = 0; i < SAMPLE_COUNT; i++) {
          const p = samples[i].point;
          const adx = p.x - hintPt.x;
          const adz = p.z - hintPt.z;
          if (adx * adx + adz * adz > maxAnchorDistSq) continue;
          const dx = x - p.x;
          const dz = z - p.z;
          const dSq = dx * dx + dz * dz;
          const dy = currentY !== undefined ? currentY - p.y : 0;
          const score = dSq + dy * dy * 16;
          if (score < localAnchorScore) {
            localAnchorScore = score;
            localAnchorDistSq = dSq;
            localAnchorIdx = i;
          }
        }
        bestIdx = localAnchorIdx;
        bestDistSq = localAnchorDistSq;
      }
    } else {
      for (let i = 0; i < SAMPLE_COUNT; i++) {
        const p = samples[i].point;
        const dx = x - p.x;
        const dz = z - p.z;
        const dSq = dx * dx + dz * dz;
        const dy = currentY !== undefined ? currentY - p.y : 0;
        const score = dSq + dy * dy * 16;
        if (score < bestScore) {
          bestScore = score;
          bestDistSq = dSq;
          bestIdx = i;
        }
      }
    }

    const s = samples[bestIdx];
    const prevS = samples[(bestIdx - 1 + SAMPLE_COUNT) % SAMPLE_COUNT];
    const nextS = samples[(bestIdx + 1) % SAMPLE_COUNT];
    const relX = x - s.point.x;
    const relZ = z - s.point.z;
    const lateralOffset = relX * s.right.x + relZ * s.right.z;
    const along = relX * s.tangent.x + relZ * s.tangent.z;

    let centerElevY: number;
    let bankAngle: number;
    let slopePitch: number;
    if (along >= 0) {
      const segLen = Math.hypot(nextS.point.x - s.point.x, nextS.point.z - s.point.z) || 1;
      const tFrac = THREE.MathUtils.clamp(along / segLen, 0, 1);
      centerElevY = THREE.MathUtils.lerp(s.point.y, nextS.point.y, tFrac);
      bankAngle = THREE.MathUtils.lerp(s.bankAngle, nextS.bankAngle, tFrac);
      slopePitch = THREE.MathUtils.lerp(s.slopePitch, nextS.slopePitch, tFrac);
    } else {
      const segLen = Math.hypot(s.point.x - prevS.point.x, s.point.z - prevS.point.z) || 1;
      const tFrac = THREE.MathUtils.clamp(1 + along / segLen, 0, 1);
      centerElevY = THREE.MathUtils.lerp(prevS.point.y, s.point.y, tFrac);
      bankAngle = THREE.MathUtils.lerp(prevS.bankAngle, s.bankAngle, tFrac);
      slopePitch = THREE.MathUtils.lerp(prevS.slopePitch, s.slopePitch, tFrac);
    }
    const elevationY = centerElevY + lateralOffset * Math.sin(bankAngle);

    return {
      sample: s,
      lateralOffset,
      elevationY,
      slopePitch,
      bankAngle,
      distanceSq: bestDistSq,
    };
  };

  // --- Driveable Shortcut Corridor Query (Continuous Line-Segment Projection) ---
  const tempRight = new THREE.Vector3();
  const tempTan = new THREE.Vector3();
  const queryShortcut = (x: number, z: number, hintShortcutId?: number | null) => {
    let bestHit: {
      shortcut: TrackShortcut;
      ptIndex: number;
      frac: number;
      lateral: number;
      elevationY: number;
      slopePitch: number;
      tangent: THREE.Vector3;
      distanceSq: number;
    } | null = null;
    let bestSq = 40 * 40;

    for (let sc = 0; sc < shortcuts.length; sc++) {
      const sObj = shortcuts[sc];
      if (hintShortcutId !== undefined && hintShortcutId !== null && sObj.id !== hintShortcutId) {
        continue;
      }
      const pts = sObj.points;
      const segCount = pts.length - 1;
      for (let j = 0; j < segCount; j++) {
        const a = pts[j];
        const b = pts[j + 1];
        const abx = b.x - a.x;
        const abz = b.z - a.z;
        const lenSq = abx * abx + abz * abz || 1;
        const segT = THREE.MathUtils.clamp(((x - a.x) * abx + (z - a.z) * abz) / lenSq, 0, 1);
        const px = a.x + abx * segT;
        const pz = a.z + abz * segT;
        const dx = x - px;
        const dz = z - pz;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestSq) {
          bestSq = dSq;
          const tanA = sObj.tangents[j];
          const tanB = sObj.tangents[j + 1];
          tempTan.set(
            THREE.MathUtils.lerp(tanA.x, tanB.x, segT),
            0,
            THREE.MathUtils.lerp(tanA.z, tanB.z, segT),
          );
          if (tempTan.lengthSq() < 0.0001) tempTan.copy(tanA);
          else tempTan.normalize();
          tempRight.set(-tempTan.z, 0, tempTan.x);
          const lateral = dx * tempRight.x + dz * tempRight.z;
          const elevationY = THREE.MathUtils.lerp(a.y, b.y, segT);
          const slopePitch = THREE.MathUtils.lerp(sObj.slopePitches[j], sObj.slopePitches[j + 1], segT);
          bestHit = {
            shortcut: sObj,
            ptIndex: segT >= 0.5 ? j + 1 : j,
            frac: (j + segT) / segCount,
            lateral,
            elevationY,
            slopePitch,
            tangent: tempTan.clone(),
            distanceSq: dSq,
          };
        }
      }
    }
    return bestHit;
  };

  const updateAnimations = (timeSec: number, countdownInt: number, introActive: boolean) => {
    for (let i = 0; i < animTurbines.length; i++) {
      animTurbines[i].rotation.z = timeSec * (0.95 + (i % 3) * 0.18) + i * 0.6;
    }
    if (lighthouseBeacon) {
      lighthouseBeacon.rotation.y = timeSec * 0.85;
    }
    if (monorailTrain) {
      monorailTrain.mesh.position.x = Math.sin(timeSec * 0.45) * monorailTrain.span;
    }
    if (foundryRingGlowMat) {
      foundryRingGlowMat.emissiveIntensity = 2.8 + Math.sin(timeSec * 3.4) * 1.1;
    }
    for (let i = 0; i < gantryPodMats.length; i++) {
      const mat = gantryPodMats[i];
      if (introActive) {
        const wave = Math.sin(timeSec * 6.5 - i * 0.7) > 0.1;
        mat.color.set('#F59E0B');
        mat.emissive.set('#F59E0B');
        mat.emissiveIntensity = wave ? 3.2 : 0.35;
      } else if (countdownInt > 0) {
        const litCount = countdownInt >= 3 ? 2 : countdownInt === 2 ? 4 : 5;
        const lit = i < litCount;
        mat.color.set(lit ? '#EF4444' : '#450A0A');
        mat.emissive.set('#EF4444');
        mat.emissiveIntensity = lit ? 4.4 : 0.2;
      } else {
        mat.color.set('#10B981');
        mat.emissive.set('#10B981');
        mat.emissiveIntensity = 4.6;
      }
    }
  };

  return {
    id: trackId,
    environment,
    group,
    curve,
    samples,
    totalLength,
    roadHalfWidth,
    barrierHalfWidth,
    roadMat,
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
    updateAnimations,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
