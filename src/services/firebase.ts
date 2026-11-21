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
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { getDefaultCarConfig, getDefaultCareerProfile } from '../data/gameData';
import { CareerProfile, GarageCarConfig, LeaderboardEntry } from '../types/game';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

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
  for (let i = 0; i < raw.length && out.length < 60; i++) {
    const id = String(raw[i]).trim().slice(0, 32);
    if (/^[a-zA-Z0-9_-]+$/.test(id) && !out.includes(id)) {
      out.push(id);
    }
  }
  return out;
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
        blacklistDefeated: clampInt(Number(d.blacklistDefeated ?? 0), 0, 10),
        racesWon: clampInt(Number(d.racesWon ?? 0), 0, 100000),
        copsTakedowns: clampInt(Number(d.copsTakedowns ?? 0), 0, 100000),
        bestLapMs: 0,
        highestHeat: 1,
        selectedCarId: String(d.selectedCarId || 'cobalt_gt'),
        ownedCarIds:
          Array.isArray(d.ownedCarIds) && d.ownedCarIds.length > 0
            ? d.ownedCarIds.slice(0, 20).map(String)
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
    const garageSnap = await getDocs(collection(db, 'users', uid, 'garage'));
    garageSnap.forEach((docSnap) => {
      const g = docSnap.data();
      const carId = docSnap.id;
      garage[carId] = {
        ownerId: uid,
        carId,
        engineLevel: clampInt(Number(g.engineLevel ?? 1), 1, 4),
        turboLevel: clampInt(Number(g.turboLevel ?? 1), 1, 4),
        nitrousLevel: clampInt(Number(g.nitrousLevel ?? 1), 1, 4),
        tiresLevel: clampInt(Number(g.tiresLevel ?? 1), 1, 4),
        paintHex: /^#[0-9a-fA-F]{6}$/.test(String(g.paintHex)) ? String(g.paintHex) : '#E11D48',
        livery: ['clean', 'stripes', 'most_wanted', 'boss_carbon'].includes(String(g.livery))
          ? (String(g.livery) as GarageCarConfig['livery'])
          : 'clean',
        rimStyle: ['chrome', 'black', 'gold', 'bronze'].includes(String(g.rimStyle))
          ? (String(g.rimStyle) as GarageCarConfig['rimStyle'])
          : 'chrome',
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
    blacklistDefeated: clampInt(profile.blacklistDefeated, 0, 10),
    racesWon: clampInt(profile.racesWon, 0, 100000),
    copsTakedowns: clampInt(profile.copsTakedowns, 0, 100000),
    selectedCarId: profile.selectedCarId.slice(0, 32),
    ownedCarIds: profile.ownedCarIds.slice(0, 20),
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
  const path = `users/${uid}/garage/${config.carId}`;
  const payload = {
    ownerId: uid,
    carId: config.carId.slice(0, 32),
    engineLevel: clampInt(config.engineLevel, 1, 4),
    turboLevel: clampInt(config.turboLevel, 1, 4),
    nitrousLevel: clampInt(config.nitrousLevel, 1, 4),
    tiresLevel: clampInt(config.tiresLevel, 1, 4),
    paintHex: /^#[0-9a-fA-F]{6}$/.test(config.paintHex) ? config.paintHex : '#E11D48',
    livery: config.livery,
    rimStyle: config.rimStyle,
    updatedAt: serverTimestamp(),
  };
  try {
    await setDoc(doc(db, 'users', uid, 'garage', config.carId), payload);
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
  const blacklistRank = clampInt(11 - profile.blacklistDefeated, 1, 11);
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
        blacklistRank: Number(d.blacklistRank ?? 11),
        carName: String(d.carName ?? 'Street Spec'),
      });
    });
    return entries;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}
