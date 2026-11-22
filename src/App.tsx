/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { User } from 'firebase/auth';
import { useCallback, useEffect, useRef, useState } from 'react';
import { musicEngine } from './audio/musicEngine';
import { soundEngine } from './audio/soundEngine';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MainMenuGarage, MenuTab } from './components/MainMenuGarage';
import { PauseModal, PostRaceModal } from './components/PostRaceModal';
import { RaceHUD } from './components/RaceHUD';
import {
  CARS,
  getDefaultCarConfig,
  getDefaultCareerProfile,
  isTierBossUnlocked,
  UPGRADE_COST,
} from './data/gameData';
import {
  fetchRapSheetLeaderboard,
  loadCloudCareer,
  publishRapSheetEntry,
  saveCloudCareer,
  saveCloudCarConfig,
  signInWithGoogle,
  signOutDriver,
  subscribeAuth,
} from './services/firebase';
import { RacingEngine, RaceStartParams } from './three/RacingEngine';
import {
  BlacklistRival,
  CareerProfile,
  EnvironmentId,
  GarageCameraPreset,
  GarageCarConfig,
  LeaderboardEntry,
  MissionDefinition,
  RaceMode,
  RaceResult,
  RaceTelemetry,
  TrackId,
} from './types/game';

const LOCAL_CAREER_KEY = 'blacklist_rockport_career_v1';
const LOCAL_GARAGE_KEY = 'blacklist_rockport_garage_v1';
const LOCAL_LOOK_KEY = 'blacklist_rockport_aelook_v1';

function loadAeLookSetting(): boolean {
  try {
    const raw = localStorage.getItem(LOCAL_LOOK_KEY);
    if (raw === 'false') return false;
  } catch {
    // ignore storage errors
  }
  return true;
}

function loadLocalCareer(): CareerProfile {
  try {
    const raw = localStorage.getItem(LOCAL_CAREER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...getDefaultCareerProfile(),
        ...parsed,
        wonTrackIds: Array.isArray(parsed.wonTrackIds) ? parsed.wonTrackIds : [],
        completedMissionIds: Array.isArray(parsed.completedMissionIds)
          ? parsed.completedMissionIds
          : [],
      };
    }
  } catch {
    // ignore storage errors
  }
  return getDefaultCareerProfile();
}

function loadLocalGarage(): Record<string, GarageCarConfig> {
  try {
    const raw = localStorage.getItem(LOCAL_GARAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return { cobalt_gt: getDefaultCarConfig('cobalt_gt') };
}

function GameRoot() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<RacingEngine | null>(null);

  const [screen, setScreen] = useState<'menu' | 'race'>('menu');
  const [activeTab, setActiveTab] = useState<MenuTab>('missions');
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [musicMuted, setMusicMuted] = useState(false);
  const [currentTrackLabel, setCurrentTrackLabel] = useState(() => musicEngine.getCurrentTrackLabel());
  const [showDebug, setShowDebug] = useState(false);
  const [aeLookEnabled, setAeLookEnabled] = useState<boolean>(() => loadAeLookSetting());

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  const [profile, setProfile] = useState<CareerProfile>(() => loadLocalCareer());
  const [garageConfigs, setGarageConfigs] = useState<Record<string, GarageCarConfig>>(() =>
    loadLocalGarage(),
  );

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  const [activeRaceParams, setActiveRaceParams] = useState<RaceStartParams | null>(null);
  const [telemetry, setTelemetry] = useState<RaceTelemetry | null>(null);
  const [raceResult, setRaceResult] = useState<RaceResult | null>(null);
  const [outroRevealReady, setOutroRevealReady] = useState(false);
  const [garagePreset, setGaragePreset] = useState<GarageCameraPreset>('orbit');

  // Refs for stable RacingEngine callbacks
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const authUserRef = useRef(authUser);
  authUserRef.current = authUser;

  const garageConfigsRef = useRef(garageConfigs);
  garageConfigsRef.current = garageConfigs;

  const persistCareer = useCallback((nextProfile: CareerProfile, nextGarage?: Record<string, GarageCarConfig>) => {
    try {
      localStorage.setItem(LOCAL_CAREER_KEY, JSON.stringify(nextProfile));
      if (nextGarage) {
        localStorage.setItem(LOCAL_GARAGE_KEY, JSON.stringify(nextGarage));
      }
    } catch {
      // ignore storage quota
    }
    if (authUserRef.current) {
      void saveCloudCareer(nextProfile);
    }
  }, []);

  const refreshLeaderboard = useCallback(async () => {
    setLeaderboardLoading(true);
    try {
      const rows = await fetchRapSheetLeaderboard();
      setLeaderboard(rows);
    } catch {
      // handled in service
    } finally {
      setLeaderboardLoading(false);
    }
  }, []);

  const handleRaceComplete = useCallback(
    (result: RaceResult) => {
      const cur = profileRef.current;
      let nextDefeated = cur.blacklistDefeated;
      if (result.rivalDefeated) {
        const rankCleared = 11 - result.rivalDefeated.rank; // #10 => 1, #1 => 10
        if (rankCleared > nextDefeated) {
          nextDefeated = rankCleared;
        }
      }

      const countsAsCircuitWin = result.won && result.mode !== 'pursuit' && result.mode !== 'freeroam';
      const curWonTracks = Array.isArray(cur.wonTrackIds) ? cur.wonTrackIds : [];
      const isNewTrackWin = countsAsCircuitWin && !curWonTracks.includes(result.trackId);
      const nextWonTracks = isNewTrackWin ? [...curWonTracks, result.trackId] : curWonTracks;

      const curCompletedMissions = Array.isArray(cur.completedMissionIds)
        ? cur.completedMissionIds
        : [];
      const nextCompletedMissions =
        result.missionCompleted &&
        result.missionId &&
        !curCompletedMissions.includes(result.missionId)
          ? [...curCompletedMissions, result.missionId]
          : curCompletedMissions;

      let nextOwnedCars = cur.ownedCarIds;
      let nextGarage: Record<string, GarageCarConfig> | undefined;
      if (result.bossCarAwarded && !cur.ownedCarIds.includes(result.bossCarAwarded.id)) {
        const bossId = result.bossCarAwarded.id;
        nextOwnedCars = [...cur.ownedCarIds, bossId];
        const bossCfg = getDefaultCarConfig(bossId, cur.uid);
        nextGarage = { ...garageConfigsRef.current, [bossId]: bossCfg };
        setGarageConfigs(nextGarage);
        if (authUserRef.current) {
          void saveCloudCarConfig(authUserRef.current.uid, bossCfg);
        }
      }

      const nextBestLap =
        result.bestLapMs > 0 && (cur.bestLapMs === 0 || result.bestLapMs < cur.bestLapMs)
          ? result.bestLapMs
          : cur.bestLapMs;

      const updated: CareerProfile = {
        ...cur,
        cash: cur.cash + result.cashEarned,
        totalBounty: cur.totalBounty + result.bountyEarned,
        blacklistDefeated: nextDefeated,
        racesWon: cur.racesWon + (countsAsCircuitWin ? 1 : 0),
        copsTakedowns: cur.copsTakedowns + result.copsTakedowns,
        bestLapMs: nextBestLap,
        highestHeat: Math.max(cur.highestHeat, result.highestHeat),
        ownedCarIds: nextOwnedCars,
        wonTrackIds: nextWonTracks,
        completedMissionIds: nextCompletedMissions,
      };

      setRaceResult({ ...result, isNewTrackWin });
      setProfile(updated);
      persistCareer(updated, nextGarage);

      if (authUserRef.current) {
        const activeCar = CARS.find((c) => c.id === updated.selectedCarId) ?? CARS[0];
        void publishRapSheetEntry(updated, activeCar.name);
      }
    },
    [persistCareer],
  );

  // Mount Three.js RacingEngine once
  useEffect(() => {
    if (!canvasMountRef.current) return;
    const engine = new RacingEngine(canvasMountRef.current, {
      onTelemetry: (t) => setTelemetry(t),
      onRaceComplete: (res) => handleRaceComplete(res),
    });
    engine.setAeLookEnabled(aeLookEnabled);
    engineRef.current = engine;

    const spec = CARS.find((c) => c.id === profileRef.current.selectedCarId) ?? CARS[0];
    const cfg = garageConfigs[spec.id] ?? getDefaultCarConfig(spec.id, profileRef.current.uid);
    engine.showGarageCar(spec, cfg);

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync garage 3D car whenever selected car or customization changes on menu screen
  useEffect(() => {
    if (screen !== 'menu' || !engineRef.current) return;
    const spec = CARS.find((c) => c.id === profile.selectedCarId) ?? CARS[0];
    const cfg = garageConfigs[spec.id] ?? getDefaultCarConfig(spec.id, profile.uid);
    engineRef.current.showGarageCar(spec, cfg);
  }, [screen, profile.selectedCarId, profile.uid, garageConfigs]);

  // Start Safe House menu music on first user gesture while on menu
  useEffect(() => {
    if (screen !== 'menu') return;
    const kickAudio = () => {
      soundEngine.init();
      musicEngine.startMenuMusic();
    };
    window.addEventListener('pointerdown', kickAudio, { once: true });
    window.addEventListener('keydown', kickAudio, { once: true });
    return () => {
      window.removeEventListener('pointerdown', kickAudio);
      window.removeEventListener('keydown', kickAudio);
    };
  }, [screen]);

  // Stage PostRaceModal after ~1.05s of live slow-motion 3D outro orbit camera
  useEffect(() => {
    if (!raceResult) {
      setOutroRevealReady(false);
      return;
    }
    const timer = window.setTimeout(() => setOutroRevealReady(true), 1050);
    return () => window.clearTimeout(timer);
  }, [raceResult]);

  // Firebase Auth listener
  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      setAuthUser(user);
      if (user) {
        setAuthBusy(true);
        try {
          const cloud = await loadCloudCareer(user);
          setProfile(cloud.profile);
          setGarageConfigs((prev) => ({ ...prev, ...cloud.garage }));
          void refreshLeaderboard();
        } catch {
          // fallback gracefully if offline
        } finally {
          setAuthBusy(false);
        }
      }
    });
    return () => unsub();
  }, [refreshLeaderboard]);

  // Subscribe to EA Trax playlist updates
  useEffect(() => {
    return musicEngine.subscribe((label) => {
      setCurrentTrackLabel(label);
    });
  }, []);

  // Escape key pause toggle and F3 FPS/debug overlay toggle during race
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && screen === 'race' && !raceResult) {
        setPaused((prev) => {
          const next = !prev;
          engineRef.current?.setPaused(next);
          return next;
        });
      } else if (e.key === 'F3' && screen === 'race') {
        e.preventDefault();
        setShowDebug((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [screen, raceResult]);

  const handleToggleMute = () => {
    soundEngine.init();
    const next = !muted;
    soundEngine.setMuted(next);
    setMuted(next);
  };

  const handleToggleMusicMute = () => {
    soundEngine.init();
    const next = !musicMuted;
    musicEngine.setMusicMuted(next);
    setMusicMuted(next);
  };

  const handleSkipTrack = () => {
    soundEngine.init();
    const label = engineRef.current ? engineRef.current.skipMusicTrack() : musicEngine.nextTrack();
    setCurrentTrackLabel(label);
  };

  const handleSelectTrackIdx = (idx: number) => {
    soundEngine.init();
    const label = engineRef.current ? engineRef.current.selectMusicTrack(idx) : musicEngine.selectTrack(idx);
    setCurrentTrackLabel(label);
  };

  const handleToggleAeLook = () => {
    soundEngine.init();
    soundEngine.triggerUiClick();
    setAeLookEnabled((prev) => {
      const next = !prev;
      engineRef.current?.setAeLookEnabled(next);
      try {
        localStorage.setItem(LOCAL_LOOK_KEY, String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const handleSelectGaragePreset = (preset: GarageCameraPreset) => {
    setGaragePreset(preset);
    engineRef.current?.setGarageCameraPreset(preset);
  };

  const handleSignIn = async () => {
    setAuthBusy(true);
    try {
      await signInWithGoogle();
    } catch {
      // user closed popup or cancelled
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    setAuthBusy(true);
    try {
      await signOutDriver();
      setProfile(loadLocalCareer());
      setGarageConfigs(loadLocalGarage());
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSelectCar = (carId: string) => {
    if (!profile.ownedCarIds.includes(carId)) return;
    const nextGarage = { ...garageConfigs };
    if (!nextGarage[carId]) {
      nextGarage[carId] = getDefaultCarConfig(carId, profile.uid);
    }
    const nextProfile = { ...profile, selectedCarId: carId };
    setGarageConfigs(nextGarage);
    setProfile(nextProfile);
    persistCareer(nextProfile, nextGarage);
  };

  const handleBuyCar = (carId: string) => {
    const spec = CARS.find((c) => c.id === carId);
    const currentRank = Math.max(1, 11 - profile.blacklistDefeated);
    if (!spec || spec.bossOnly || currentRank > spec.unlockRank || profile.ownedCarIds.includes(carId) || profile.cash < spec.price) {
      return;
    }
    const cfg = getDefaultCarConfig(carId, profile.uid);
    const nextGarage = { ...garageConfigs, [carId]: cfg };
    const nextProfile: CareerProfile = {
      ...profile,
      cash: profile.cash - spec.price,
      selectedCarId: carId,
      ownedCarIds: [...profile.ownedCarIds, carId],
    };
    soundEngine.init();
    soundEngine.triggerUpgradeClunk();
    setGarageConfigs(nextGarage);
    setProfile(nextProfile);
    persistCareer(nextProfile, nextGarage);
    if (authUser) void saveCloudCarConfig(authUser.uid, cfg);
  };

  const handleUpgradePart = (part: 'engineLevel' | 'turboLevel' | 'nitrousLevel' | 'tiresLevel') => {
    const carId = profile.selectedCarId;
    const curCfg = garageConfigs[carId] ?? getDefaultCarConfig(carId, profile.uid);
    const curLvl = curCfg[part];
    if (curLvl >= 4) return;
    const cost = UPGRADE_COST[curLvl];
    if (profile.cash < cost) return;

    const nextCfg: GarageCarConfig = { ...curCfg, [part]: curLvl + 1 };
    const nextGarage = { ...garageConfigs, [carId]: nextCfg };
    const nextProfile = { ...profile, cash: profile.cash - cost };

    soundEngine.init();
    soundEngine.triggerUpgradeClunk();
    setGarageConfigs(nextGarage);
    setProfile(nextProfile);
    persistCareer(nextProfile, nextGarage);
    if (authUser) void saveCloudCarConfig(authUser.uid, nextCfg);
  };

  const handleCustomizeCar = (patch: Partial<Pick<GarageCarConfig, 'paintHex' | 'livery' | 'rimStyle'>>) => {
    const carId = profile.selectedCarId;
    const curCfg = garageConfigs[carId] ?? getDefaultCarConfig(carId, profile.uid);
    const nextCfg: GarageCarConfig = { ...curCfg, ...patch };
    const nextGarage = { ...garageConfigs, [carId]: nextCfg };

    setGarageConfigs(nextGarage);
    try {
      localStorage.setItem(LOCAL_GARAGE_KEY, JSON.stringify(nextGarage));
    } catch {
      // ignore
    }
    if (authUser) void saveCloudCarConfig(authUser.uid, nextCfg);
  };

  const handleStartRace = (
    mode: RaceMode,
    trackId: TrackId,
    rival?: BlacklistRival,
    environment?: EnvironmentId,
    patrolsEnabled = true,
    mission?: MissionDefinition,
  ) => {
    if (!engineRef.current) return;
    if (mode === 'blacklist' && rival) {
      const alreadyDefeated = profile.blacklistDefeated > 10 - rival.rank;
      const gate = isTierBossUnlocked(rival, profile);
      if (!alreadyDefeated && !gate.unlocked) {
        return;
      }
    }
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    soundEngine.init();
    const spec = CARS.find((c) => c.id === profile.selectedCarId) ?? CARS[0];
    const cfg = garageConfigs[spec.id] ?? getDefaultCarConfig(spec.id, profile.uid);
    const params: RaceStartParams = {
      mode,
      trackId,
      environment,
      patrolsEnabled,
      playerSpec: spec,
      playerConfig: cfg,
      rival,
      mission,
    };
    setActiveRaceParams(params);
    setRaceResult(null);
    setOutroRevealReady(false);
    setPaused(false);
    setScreen('race');
    engineRef.current.startRace(params);
  };

  const handleReturnToGarage = () => {
    setRaceResult(null);
    setOutroRevealReady(false);
    setPaused(false);
    setScreen('menu');
    const spec = CARS.find((c) => c.id === profile.selectedCarId) ?? CARS[0];
    const cfg = garageConfigs[spec.id] ?? getDefaultCarConfig(spec.id, profile.uid);
    engineRef.current?.showGarageCar(spec, cfg);
    soundEngine.init();
    musicEngine.startMenuMusic();
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0D0E12]">
      {/* Dedicated WebGL Mount Container (never unmounted by React UI transitions) */}
      <div ref={canvasMountRef} className="w-full h-full" />

      {screen === 'menu' && (
        <MainMenuGarage
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          profile={profile}
          garageConfigs={garageConfigs}
          leaderboard={leaderboard}
          leaderboardLoading={leaderboardLoading}
          isSignedIn={Boolean(authUser)}
          authBusy={authBusy}
          muted={muted}
          onToggleMute={handleToggleMute}
          musicMuted={musicMuted}
          onToggleMusicMute={handleToggleMusicMute}
          onSkipTrack={handleSkipTrack}
          onSelectTrackIdx={handleSelectTrackIdx}
          currentTrackLabel={currentTrackLabel}
          garagePreset={garagePreset}
          onSelectGaragePreset={handleSelectGaragePreset}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
          onSelectCar={handleSelectCar}
          onBuyCar={handleBuyCar}
          onUpgradePart={handleUpgradePart}
          onCustomizeCar={handleCustomizeCar}
          onStartRace={handleStartRace}
          onRefreshLeaderboard={refreshLeaderboard}
        />
      )}

      {screen === 'race' && telemetry && activeRaceParams && (
        <RaceHUD
          telemetry={telemetry}
          mode={activeRaceParams.mode}
          muted={muted}
          musicMuted={musicMuted}
          showDebug={showDebug}
          aeLookEnabled={aeLookEnabled}
          onToggleAeLook={handleToggleAeLook}
          onToggleMute={handleToggleMute}
          onToggleMusicMute={handleToggleMusicMute}
          onSkipTrack={handleSkipTrack}
          onCycleCamera={() => engineRef.current?.cycleCameraMode()}
          onSkipIntro={() => engineRef.current?.skipIntro()}
          onPause={() => {
            setPaused(true);
            engineRef.current?.setPaused(true);
          }}
          onFinishFreeroam={() => engineRef.current?.finishFreeroamEarly()}
          onTouchInput={(key, down) => {
            if (!engineRef.current) return;
            soundEngine.init();
            engineRef.current.input[key] = down;
          }}
        />
      )}

      {screen === 'race' && paused && !raceResult && (
        <PauseModal
          aeLookEnabled={aeLookEnabled}
          onToggleAeLook={handleToggleAeLook}
          onResume={() => {
            setPaused(false);
            engineRef.current?.setPaused(false);
          }}
          onRestart={() => {
            if (activeRaceParams) {
              setRaceResult(null);
              setOutroRevealReady(false);
              setPaused(false);
              engineRef.current?.startRace(activeRaceParams);
            }
          }}
          onQuit={handleReturnToGarage}
        />
      )}

      {screen === 'race' && raceResult && outroRevealReady && (
        <PostRaceModal
          result={raceResult}
          profile={profile}
          onRaceAgain={() => {
            if (activeRaceParams) {
              setRaceResult(null);
              setOutroRevealReady(false);
              setPaused(false);
              engineRef.current?.startRace(activeRaceParams);
            }
          }}
          onReturnGarage={handleReturnToGarage}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <GameRoot />
    </ErrorBoundary>
  );
}
