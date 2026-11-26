import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  getDefaultCarConfig,
  getDefaultCareerProfile,
  MAX_UPGRADE_LEVEL,
  normalizeCarConfig,
  TOTAL_BLACKLIST_RANKS,
} from '../data/gameData';
import { CareerProfile, EngineSoundProfile, GarageCarConfig, LeaderboardEntry } from '../types/game';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function subscribeAuth(cb: (user: User | null) => void) {
  return onAuthStateChanged(auth, cb);
}

export async function signInWithGoogle(): Promise<User> {
  const res = await signInWithPopup(auth, googleProvider);
  return res.user;
}

export async function signOutDriver(): Promise<void> {
  await signOut(auth);
}

function sanitizeDriverName(name: string): string {
  const cleaned = name.trim().slice(0, 32);
  return cleaned.length > 0 ? cleaned : 'Street Racer';
}

function clampInt(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.max(min, Math.min(max, Math.round(val)));
}

function sanitizeMissionIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (let i = 0; i < raw.length && out.length < 100; i++) {
    const id = String(raw[i]).trim().slice(0, 32);
    if (/^[a-zA-Z0-9_-]+$/.test(id) && !out.includes(id)) {
      out.push(id);
    }
  }
  return out;
}

const VALID_ENGINE_SOUNDS: EngineSoundProfile[] = [
  'auto',
  'i4_turbo',
  'v6_twin_turbo',
  'v8_muscle',
  'v10_screamer',
  'v12_hyper',
  'rotary_brap',
  'flat6_gt',
  'electric_whine',
];

function sanitizeEngineSound(raw: unknown): EngineSoundProfile {
  return VALID_ENGINE_SOUNDS.includes(String(raw) as EngineSoundProfile)
    ? (String(raw) as EngineSoundProfile)
    : 'auto';
}

export async function loadCloudCareer(
  user: User,
): Promise<{ profile: CareerProfile; garage: Record<string, GarageCarConfig> }> {
  const uid = user.uid;
  const userPath = `users/${uid}`;
  let profile: CareerProfile;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const d = snap.data();
      profile = {
        uid,
        driverName: sanitizeDriverName(String(d.driverName || user.displayName || 'Street Racer')),
        cash: clampInt(Number(d.cash ?? 18000), 0, 1000000000),
        totalBounty: clampInt(Number(d.totalBounty ?? 0), 0, 1000000000),
        blacklistDefeated: clampInt(Number(d.blacklistDefeated ?? 0), 0, TOTAL_BLACKLIST_RANKS),
        racesWon: clampInt(Number(d.racesWon ?? 0), 0, 100000),
        copsTakedowns: clampInt(Number(d.copsTakedowns ?? 0), 0, 100000),
        bestLapMs: 0,
        highestHeat: 1,
        selectedCarId: String(d.selectedCarId || 'cobalt_gt'),
        ownedCarIds:
          Array.isArray(d.ownedCarIds) && d.ownedCarIds.length > 0
            ? d.ownedCarIds.slice(0, 40).map(String)
            : ['cobalt_gt'],
        wonTrackIds: Array.isArray(d.wonTrackIds)
          ? d.wonTrackIds.slice(0, 10).map((t) => String(t).slice(0, 32))
          : [],
        completedMissionIds: sanitizeMissionIds(d.completedMissionIds),
      };
    } else {
      profile = getDefaultCareerProfile(uid, sanitizeDriverName(user.displayName || 'Street Racer'));
      await saveCloudCareer(profile);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }

  const garage: Record<string, GarageCarConfig> = {};
  const garagePath = `users/${uid}/garage`;
  try {
    const garageSnap = await getDocs(
      query(collection(db, 'users', uid, 'garage'), where('ownerId', '==', uid)),
    );
    garageSnap.forEach((docSnap) => {
      const g = docSnap.data() as Partial<GarageCarConfig>;
      const carId = docSnap.id;
      const normalized = normalizeCarConfig(g, carId, uid);
      garage[carId] = {
        ...normalized,
        ownerId: uid,
        carId,
        engineSound: sanitizeEngineSound(g.engineSound),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, garagePath);
  }

  if (!garage[profile.selectedCarId]) {
    const def = getDefaultCarConfig(profile.selectedCarId, uid);
    garage[profile.selectedCarId] = def;
    await saveCloudCarConfig(uid, def);
  }

  try {
    const lbSnap = await getDoc(doc(db, 'leaderboard', uid));
    if (lbSnap.exists()) {
      const lb = lbSnap.data();
      profile.bestLapMs = clampInt(Number(lb.bestLapMs ?? 0), 0, 3600000);
      profile.highestHeat = clampInt(Number(lb.highestHeat ?? 1), 1, 5);
    }
  } catch {
    // Non-critical if leaderboard doc hasn't been created yet
  }

  return { profile, garage };
}

export async function saveCloudCareer(profile: CareerProfile): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const uid = user.uid;
  const path = `users/${uid}`;
  const payload = {
    uid,
    driverName: sanitizeDriverName(profile.driverName),
    cash: clampInt(profile.cash, 0, 1000000000),
    totalBounty: clampInt(profile.totalBounty, 0, 1000000000),
    blacklistDefeated: clampInt(profile.blacklistDefeated, 0, TOTAL_BLACKLIST_RANKS),
    racesWon: clampInt(profile.racesWon, 0, 100000),
    copsTakedowns: clampInt(profile.copsTakedowns, 0, 100000),
    selectedCarId: profile.selectedCarId.slice(0, 32),
    ownedCarIds: profile.ownedCarIds.slice(0, 40),
    wonTrackIds: (profile.wonTrackIds ?? []).slice(0, 10).map((t) => String(t).slice(0, 32)),
    completedMissionIds: sanitizeMissionIds(profile.completedMissionIds),
    updatedAt: serverTimestamp(),
  };
  try {
    await setDoc(doc(db, 'users', uid), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveCloudCarConfig(uid: string, config: GarageCarConfig): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid) return;
  const safe = normalizeCarConfig(config, config.carId, uid);
  const path = `users/${uid}/garage/${safe.carId}`;
  const payload = {
    ownerId: uid,
    carId: safe.carId.slice(0, 32),
    engineLevel: clampInt(safe.engineLevel, 1, MAX_UPGRADE_LEVEL),
    turboLevel: clampInt(safe.turboLevel, 1, MAX_UPGRADE_LEVEL),
    nitrousLevel: clampInt(safe.nitrousLevel, 1, MAX_UPGRADE_LEVEL),
    tiresLevel: clampInt(safe.tiresLevel, 1, MAX_UPGRADE_LEVEL),
    paintHex: safe.paintHex,
    secondaryHex: safe.secondaryHex ?? '#F8FAFC',
    paintFinish: safe.paintFinish ?? 'metallic',
    livery: safe.livery,
    bodyKit: safe.bodyKit ?? 'stock',
    spoilerStyle: safe.spoilerStyle ?? 'auto',
    hoodStyle: safe.hoodStyle ?? 'stock',
    exhaustStyle: safe.exhaustStyle ?? 'dual',
    rimStyle: safe.rimStyle,
    rimDesign: safe.rimDesign ?? 'five_spoke',
    caliperHex: safe.caliperHex ?? '#EF4444',
    windowTint: safe.windowTint ?? 'dark',
    headlightTint: safe.headlightTint ?? 'xenon',
    underglowHex: safe.underglowHex ?? 'none',
    stanceHeight: safe.stanceHeight ?? 0,
    camberDeg: safe.camberDeg ?? 0,
    engineSound: sanitizeEngineSound(safe.engineSound),
    updatedAt: serverTimestamp(),
  };
  try {
    await setDoc(doc(db, 'users', uid, 'garage', safe.carId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function publishRapSheetEntry(
  profile: CareerProfile,
  carName: string,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const uid = user.uid;
  const path = `leaderboard/${uid}`;
  const blacklistRank = clampInt(TOTAL_BLACKLIST_RANKS + 1 - profile.blacklistDefeated, 1, TOTAL_BLACKLIST_RANKS + 1);
  const payload = {
    uid,
    driverName: sanitizeDriverName(profile.driverName),
    totalBounty: clampInt(profile.totalBounty, 0, 1000000000),
    bestLapMs: clampInt(profile.bestLapMs, 0, 3600000),
    highestHeat: clampInt(profile.highestHeat, 1, 5),
    blacklistRank,
    carName: carName.trim().slice(0, 48) || 'Cobalt SS Turbo',
    updatedAt: serverTimestamp(),
  };
  try {
    await setDoc(doc(db, 'leaderboard', uid), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchRapSheetLeaderboard(): Promise<LeaderboardEntry[]> {
  const path = 'leaderboard';
  try {
    const q = query(
      collection(db, 'leaderboard'),
      where('totalBounty', '>=', 0),
      orderBy('totalBounty', 'desc'),
      limit(15),
    );
    const snap = await getDocs(q);
    const entries: LeaderboardEntry[] = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      entries.push({
        uid: String(d.uid),
        driverName: String(d.driverName),
        totalBounty: Number(d.totalBounty ?? 0),
        bestLapMs: Number(d.bestLapMs ?? 0),
        highestHeat: Number(d.highestHeat ?? 1),
        blacklistRank: Number(d.blacklistRank ?? (TOTAL_BLACKLIST_RANKS + 1)),
        carName: String(d.carName ?? 'Street Spec'),
      });
    });
    return entries;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}
