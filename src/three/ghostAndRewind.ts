import * as THREE from 'three';
import {
  GHOST_RECORD_HZ,
  REWIND_BUFFER_CAPACITY,
  REWIND_SAMPLE_HZ,
} from '../config/aiConfig';
import { CarSpec, RaceMode, TrackId } from '../types/game';
import { buildCarMesh, CarVisualHandles } from './carBuilder';

export interface RewindRacerSnapshot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  heading: number;
  slopePitch: number;
  bankRoll: number;
  forwardSpeed: number;
  lateralSpeed: number;
  steerAngle: number;
  pitch: number;
  roll: number;
  airHeight: number;
  verticalVel: number;
  airTimeTotal: number;
  trackIdx: number;
  progress: number;
  lap: number;
  totalProgress: number;
  activeShortcutId: number | null;
  reachedShortcutCore: boolean;
  speedTrapTotalKmh: number;
  speedTrapHits: number;
  finished: boolean;
  knockedOut: boolean;
  frontDamage: number;
  rearDamage: number;
  sideDamage: number;
  detachedHood: boolean;
  detachedFrontBumper: boolean;
  detachedRearBumper: boolean;
  detachedSpoiler: boolean;
}

export interface RewindCopSnapshot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
  trackIdx: number;
  wrecked: boolean;
}

export interface RewindFrame {
  valid: boolean;
  raceElapsedMs: number;
  currentLapStartMs: number;
  tollboothTimeLeftMs: number;
  tollboothCheckpoint: number;
  nitrous: number;
  speedbreaker: number;
  sessionBounty: number;
  racers: RewindRacerSnapshot[];
}

export const MAX_REWIND_RACERS = 6;

function createEmptyRacerSnap(): RewindRacerSnapshot {
  return {
    active: false,
    x: 0,
    y: 0,
    z: 0,
    heading: 0,
    slopePitch: 0,
    bankRoll: 0,
    forwardSpeed: 0,
    lateralSpeed: 0,
    steerAngle: 0,
    pitch: 0,
    roll: 0,
    airHeight: 0,
    verticalVel: 0,
    airTimeTotal: 0,
    trackIdx: 0,
    progress: 0,
    lap: 0,
    totalProgress: 0,
    activeShortcutId: null,
    reachedShortcutCore: false,
    speedTrapTotalKmh: 0,
    speedTrapHits: 0,
    finished: false,
    knockedOut: false,
    frontDamage: 0,
    rearDamage: 0,
    sideDamage: 0,
    detachedHood: false,
    detachedFrontBumper: false,
    detachedRearBumper: false,
    detachedSpoiler: false,
  };
}

/**
 * Zero-GC fixed-capacity ring buffer storing 5 seconds of 60 Hz simulation snapshots.
 */
export class RewindRingBuffer {
  private frames: RewindFrame[];
  private head = 0; // next write slot
  private count = 0;
  private sampleAccum = 0;
  private readonly sampleInterval = 1 / REWIND_SAMPLE_HZ;

  constructor() {
    this.frames = new Array(REWIND_BUFFER_CAPACITY);
    for (let i = 0; i < REWIND_BUFFER_CAPACITY; i++) {
      const racers: RewindRacerSnapshot[] = [];
      for (let r = 0; r < MAX_REWIND_RACERS; r++) {
        racers.push(createEmptyRacerSnap());
      }
      this.frames[i] = {
        valid: false,
        raceElapsedMs: 0,
        currentLapStartMs: 0,
        tollboothTimeLeftMs: 0,
        tollboothCheckpoint: 0,
        nitrous: 100,
        speedbreaker: 100,
        sessionBounty: 0,
        racers,
      };
    }
  }

  public clear(): void {
    this.head = 0;
    this.count = 0;
    this.sampleAccum = 0;
    for (let i = 0; i < REWIND_BUFFER_CAPACITY; i++) {
      this.frames[i].valid = false;
    }
  }

  public getAvailableSeconds(): number {
    return this.count / REWIND_SAMPLE_HZ;
  }

  public getFrameCount(): number {
    return this.count;
  }

  public shouldCapture(dt: number): boolean {
    this.sampleAccum += dt;
    if (this.sampleAccum >= this.sampleInterval) {
      this.sampleAccum -= this.sampleInterval;
      if (this.sampleAccum > this.sampleInterval) this.sampleAccum = 0;
      return true;
    }
    return false;
  }

  public borrowNextWriteSlot(): RewindFrame {
    const slot = this.frames[this.head];
    slot.valid = true;
    this.head = (this.head + 1) % REWIND_BUFFER_CAPACITY;
    if (this.count < REWIND_BUFFER_CAPACITY) {
      this.count++;
    }
    return slot;
  }

  /**
   * Steps back up to `stepsBack` samples (e.g., 165 = 2.75s) and truncates any future frames after it
   * so consecutive rewinds cleanly chain further back within the 5-second window.
   */
  public popRewindFrame(stepsBack: number): RewindFrame | null {
    if (this.count < 12) return null;
    const actualSteps = Math.min(this.count - 1, Math.max(1, stepsBack));
    const targetIdx =
      (this.head - 1 - actualSteps + REWIND_BUFFER_CAPACITY * 2) % REWIND_BUFFER_CAPACITY;
    const frame = this.frames[targetIdx];
    if (!frame.valid) return null;

    this.head = (targetIdx + 1) % REWIND_BUFFER_CAPACITY;
    this.count = Math.max(0, this.count - actualSteps);
    this.sampleAccum = 0;
    return frame;
  }
}

// =========================================================================
// Ghost Car Recording, Playback, Offline Track Records & JSON Share Codes
// =========================================================================

export interface GhostFrame {
  t: number; // race elapsed seconds (rounded to 3dp)
  x: number;
  y: number;
  z: number;
  h: number;
  p: number;
  r: number;
}

export interface GhostRunData {
  version: 1;
  trackId: TrackId;
  mode: RaceMode;
  carId: string;
  carName: string;
  driverName: string;
  timeMs: number;
  bestLapMs: number;
  recordedAt: string;
  frames: GhostFrame[];
}

export interface TrackBestRecord {
  trackId: TrackId;
  mode: RaceMode;
  timeMs: number;
  bestLapMs: number;
  carName: string;
  recordedAt: string;
}

const GHOST_STORAGE_KEY = 'blacklist_rockport_ghosts_v1';
const TRACK_RECORDS_STORAGE_KEY = 'blacklist_rockport_offline_records_v1';

function ghostKey(trackId: TrackId, mode: RaceMode): string {
  return `${trackId}::${mode}`;
}

export function loadAllGhosts(): Record<string, GhostRunData> {
  try {
    const raw = localStorage.getItem(GHOST_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, GhostRunData>;
  } catch {
    return {};
  }
}

export function loadBestGhost(trackId: TrackId, mode: RaceMode): GhostRunData | null {
  const all = loadAllGhosts();
  return all[ghostKey(trackId, mode)] ?? null;
}

export function saveGhostData(data: GhostRunData): void {
  try {
    const all = loadAllGhosts();
    all[ghostKey(data.trackId, data.mode)] = data;
    localStorage.setItem(GHOST_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore storage quota
  }
}

export function loadOfflineTrackRecords(): Record<string, TrackBestRecord> {
  try {
    const raw = localStorage.getItem(TRACK_RECORDS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, TrackBestRecord>;
  } catch {
    return {};
  }
}

export function saveBestGhostIfFaster(
  trackId: TrackId,
  mode: RaceMode,
  carId: string,
  carName: string,
  driverName: string,
  timeMs: number,
  bestLapMs: number,
  frames: GhostFrame[],
): { isNewRecord: boolean; data: GhostRunData | null } {
  if (frames.length < 8 || timeMs <= 0) {
    return { isNewRecord: false, data: null };
  }
  const existing = loadBestGhost(trackId, mode);
  const isNewRecord = !existing || timeMs < existing.timeMs;

  // Always update offline track best lap / time record even if ghost save is skipped
  try {
    const recs = loadOfflineTrackRecords();
    const k = ghostKey(trackId, mode);
    const prev = recs[k];
    if (!prev || timeMs < prev.timeMs) {
      recs[k] = {
        trackId,
        mode,
        timeMs: Math.round(timeMs),
        bestLapMs: Math.round(bestLapMs || timeMs),
        carName,
        recordedAt: new Date().toISOString(),
      };
      localStorage.setItem(TRACK_RECORDS_STORAGE_KEY, JSON.stringify(recs));
    }
  } catch {
    // ignore
  }

  if (!isNewRecord) {
    return { isNewRecord: false, data: existing };
  }

  const nextData: GhostRunData = {
    version: 1,
    trackId,
    mode,
    carId,
    carName,
    driverName,
    timeMs: Math.round(timeMs),
    bestLapMs: Math.round(bestLapMs || timeMs),
    recordedAt: new Date().toISOString(),
    frames,
  };
  saveGhostData(nextData);
  return { isNewRecord: true, data: nextData };
}

export function exportGhostShareCode(data: GhostRunData): string {
  // Compact JSON string ready to copy-paste cleanly
  return JSON.stringify(data);
}

export function importGhostShareCode(raw: string): { ok: true; data: GhostRunData } | { ok: false; error: string } {
  try {
    const trimmed = raw.trim();
    if (!trimmed) return { ok: false, error: 'Paste a ghost JSON share string first.' };
    const parsed = JSON.parse(trimmed) as Partial<GhostRunData>;
    if (
      parsed.version !== 1 ||
      typeof parsed.trackId !== 'string' ||
      typeof parsed.mode !== 'string' ||
      typeof parsed.timeMs !== 'number' ||
      !Array.isArray(parsed.frames) ||
      parsed.frames.length < 5
    ) {
      return { ok: false, error: 'Invalid ghost share format.' };
    }
    const sanitizedFrames: GhostFrame[] = [];
    for (let i = 0; i < parsed.frames.length; i++) {
      const f = parsed.frames[i];
      if (
        typeof f?.t !== 'number' ||
        typeof f?.x !== 'number' ||
        typeof f?.y !== 'number' ||
        typeof f?.z !== 'number' ||
        typeof f?.h !== 'number'
      ) {
        return { ok: false, error: 'Corrupted ghost pose frame.' };
      }
      sanitizedFrames.push({
        t: f.t,
        x: f.x,
        y: f.y,
        z: f.z,
        h: f.h,
        p: typeof f.p === 'number' ? f.p : 0,
        r: typeof f.r === 'number' ? f.r : 0,
      });
    }
    const clean: GhostRunData = {
      version: 1,
      trackId: parsed.trackId as TrackId,
      mode: parsed.mode as RaceMode,
      carId: typeof parsed.carId === 'string' ? parsed.carId : 'cobalt_gt',
      carName: typeof parsed.carName === 'string' ? parsed.carName : 'Imported Ghost',
      driverName: typeof parsed.driverName === 'string' ? parsed.driverName : 'Challenger',
      timeMs: Math.round(parsed.timeMs),
      bestLapMs: Math.round(typeof parsed.bestLapMs === 'number' ? parsed.bestLapMs : parsed.timeMs),
      recordedAt: typeof parsed.recordedAt === 'string' ? parsed.recordedAt : new Date().toISOString(),
      frames: sanitizedFrames,
    };
    saveGhostData(clean);
    return { ok: true, data: clean };
  } catch {
    return { ok: false, error: 'Could not parse ghost JSON code.' };
  }
}

export class GhostSessionRecorder {
  public frames: GhostFrame[] = [];
  private recordAccum = 0;
  private readonly interval = 1 / GHOST_RECORD_HZ;

  public reset(): void {
    this.frames = [];
    this.recordAccum = 0;
  }

  public sample(
    dt: number,
    elapsedSec: number,
    pos: THREE.Vector3,
    heading: number,
    slopePitch: number,
    bankRoll: number,
  ): void {
    this.recordAccum += dt;
    if (this.recordAccum < this.interval) return;
    this.recordAccum -= this.interval;
    if (this.recordAccum > this.interval) this.recordAccum = 0;

    this.frames.push({
      t: Math.round(elapsedSec * 1000) / 1000,
      x: Math.round(pos.x * 100) / 100,
      y: Math.round(pos.y * 100) / 100,
      z: Math.round(pos.z * 100) / 100,
      h: Math.round(heading * 1000) / 1000,
      p: Math.round(slopePitch * 1000) / 1000,
      r: Math.round(bankRoll * 1000) / 1000,
    });
  }
}

export class GhostPlaybackCursor {
  private data: GhostRunData | null = null;
  private cursor = 0;

  public load(data: GhostRunData | null): void {
    this.data = data;
    this.cursor = 0;
  }

  public hasData(): boolean {
    return Boolean(this.data && this.data.frames.length >= 2);
  }

  public reset(): void {
    this.cursor = 0;
  }

  public samplePose(
    elapsedSec: number,
    outPos: THREE.Vector3,
    outRot: THREE.Euler,
  ): boolean {
    if (!this.data || this.data.frames.length < 2) return false;
    const frames = this.data.frames;
    const lastIdx = frames.length - 1;
    if (elapsedSec <= frames[0].t) {
      const f = frames[0];
      outPos.set(f.x, f.y, f.z);
      outRot.set(f.p, f.h, -f.r, 'YXZ');
      return true;
    }
    if (elapsedSec >= frames[lastIdx].t) {
      const f = frames[lastIdx];
      outPos.set(f.x, f.y, f.z);
      outRot.set(f.p, f.h, -f.r, 'YXZ');
      return false;
    }
    if (frames[this.cursor].t > elapsedSec) {
      this.cursor = 0;
    }
    while (this.cursor < lastIdx - 1 && frames[this.cursor + 1].t < elapsedSec) {
      this.cursor++;
    }
    const a = frames[this.cursor];
    const b = frames[this.cursor + 1];
    const span = Math.max(0.001, b.t - a.t);
    const alpha = THREE.MathUtils.clamp((elapsedSec - a.t) / span, 0, 1);

    outPos.set(
      THREE.MathUtils.lerp(a.x, b.x, alpha),
      THREE.MathUtils.lerp(a.y, b.y, alpha),
      THREE.MathUtils.lerp(a.z, b.z, alpha),
    );
    let dh = b.h - a.h;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    outRot.set(
      THREE.MathUtils.lerp(a.p, b.p, alpha),
      a.h + dh * alpha,
      -THREE.MathUtils.lerp(a.r, b.r, alpha),
      'YXZ',
    );
    return true;
  }
}

export function buildGhostCarMesh(
  spec: CarSpec,
  shadowTexture: THREE.Texture,
  maxAnisotropy: number,
  isSoftwareGl: boolean,
): CarVisualHandles {
  const handles = buildCarMesh({
    spec,
    paintHex: '#22D3EE',
    livery: 'clean',
    rimStyle: 'chrome',
    shadowTexture,
    maxAnisotropy,
    isSoftwareGl,
  });

  const ghostBodyMat = new THREE.MeshStandardMaterial({
    color: '#22D3EE',
    emissive: '#06B6D4',
    emissiveIntensity: 0.72,
    roughness: 0.25,
    metalness: 0.35,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });

  handles.root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    // Keep contact shadow invisible on holographic ghost
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map(() => ghostBodyMat);
    } else if (mesh.material !== handles.brakeLightMat && mesh.material !== handles.reverseLightMat) {
      mesh.material = ghostBodyMat;
    }
  });
  handles.brakeGlows.forEach((g) => (g.visible = false));
  handles.nosFlames.forEach((f) => (f.visible = false));
  handles.nosCores.forEach((c) => (c.visible = false));
  handles.nosHalos.forEach((h) => (h.visible = false));

  const baseDispose = handles.dispose;
  handles.dispose = () => {
    baseDispose();
    ghostBodyMat.dispose();
  };
  return handles;
}
