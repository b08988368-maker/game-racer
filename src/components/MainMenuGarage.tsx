import React, { useMemo, useState } from 'react';
import {
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  CloudRain,
  Compass,
  Flame,
  Gauge,
  KeyRound,
  Lock,
  Music,
  Play,
  Settings,
  Share2,
  Shield,
  ShieldAlert,
  SkipForward,
  Target,
  Trophy,
  Volume2,
  VolumeX,
  Wrench,
  Zap,
} from 'lucide-react';
import { EA_TRAX_PLAYLIST } from '../audio/musicEngine';
import { soundEngine } from '../audio/soundEngine';
import {
  BLACKLIST_RIVALS,
  CARS,
  computeEffectiveStats,
  ENVIRONMENTS,
  formatCurrency,
  formatTimeMs,
  getMissionsForTier,
  isTierBossUnlocked,
  LIVERY_OPTIONS,
  NFS_MISSIONS,
  PAINT_SWATCHES,
  resolveMissionRaceMode,
  RIM_OPTIONS,
  TRACKS,
  UPGRADE_COST,
} from '../data/gameData';
import { getTrackMinimapPoints } from '../three/trackBuilder';
import {
  BlacklistRival,
  CareerProfile,
  EnvironmentId,
  GarageCameraPreset,
  GarageCarConfig,
  LeaderboardEntry,
  LiveryStyle,
  MissionDefinition,
  MissionType,
  RaceMode,
  RimStyle,
  TrackDifficulty,
  TrackId,
} from '../types/game';

export type MenuTab = 'missions' | 'race' | 'blacklist' | 'garage' | 'rapsheet';

interface Props {
  activeTab: MenuTab;
  setActiveTab: (tab: MenuTab) => void;
  profile: CareerProfile;
  garageConfigs: Record<string, GarageCarConfig>;
  leaderboard: LeaderboardEntry[];
  leaderboardLoading: boolean;
  isSignedIn: boolean;
  authBusy: boolean;
  muted: boolean;
  onToggleMute: () => void;
  musicMuted?: boolean;
  onToggleMusicMute?: () => void;
  onSkipTrack?: () => void;
  onSelectTrackIdx?: (idx: number) => void;
  currentTrackLabel?: string;
  garagePreset?: GarageCameraPreset;
  onSelectGaragePreset?: (preset: GarageCameraPreset) => void;
  onOpenSettings?: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onSelectCar: (carId: string) => void;
  onBuyCar: (carId: string) => void;
  onUpgradePart: (part: 'engineLevel' | 'turboLevel' | 'nitrousLevel' | 'tiresLevel') => void;
  onCustomizeCar: (patch: Partial<Pick<GarageCarConfig, 'paintHex' | 'livery' | 'rimStyle'>>) => void;
  onStartRace: (
    mode: RaceMode,
    trackId: TrackId,
    rival?: BlacklistRival,
    environment?: EnvironmentId,
    patrolsEnabled?: boolean,
    mission?: MissionDefinition,
  ) => void;
  onRefreshLeaderboard: () => void;
}

export const MainMenuGarage: React.FC<Props> = ({
  activeTab,
  setActiveTab,
  profile,
  garageConfigs,
  leaderboard,
  leaderboardLoading,
  isSignedIn,
  authBusy,
  muted,
  onToggleMute,
  musicMuted = false,
  onToggleMusicMute,
  onSkipTrack,
  onSelectTrackIdx,
  currentTrackLabel,
  garagePreset = 'orbit',
  onSelectGaragePreset,
  onOpenSettings,
  onSignIn,
  onSignOut,
  onSelectCar,
  onBuyCar,
  onUpgradePart,
  onCustomizeCar,
  onStartRace,
  onRefreshLeaderboard,
}) => {
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [selectedMode, setSelectedMode] = useState<RaceMode>('circuit');
  const [selectedTrack, setSelectedTrack] = useState<TrackId>('rockport_loop');
  const [selectedEnv, setSelectedEnv] = useState<EnvironmentId>('auto');
  const [patrolsEnabled, setPatrolsEnabled] = useState(true);
  const [garageSection, setGarageSection] = useState<'vehicles' | 'performance' | 'visuals'>('vehicles');
  const [focusedMissionId, setFocusedMissionId] = useState<string | null>(null);
  const [traxPickerOpen, setTraxPickerOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const SHARE_GAME_URL =
    typeof window !== 'undefined' &&
    !window.location.origin.includes('ais-dev-') &&
    !window.location.origin.includes('localhost') &&
    !window.location.origin.includes('127.0.0.1')
      ? window.location.origin
      : 'https://ais-pre-pmxtegnkqumdmtptkzrsso-959572528567.europe-west2.run.app';

  const handleCopyShareLink = () => {
    soundEngine.triggerUiClick();
    const markCopied = () => {
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2400);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(SHARE_GAME_URL).then(markCopied).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = SHARE_GAME_URL;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
          markCopied();
        } finally {
          document.body.removeChild(ta);
        }
      });
    } else {
      markCopied();
    }
  };

  const activeSpec = CARS.find((c) => c.id === profile.selectedCarId) ?? CARS[0];
  const activeConfig = garageConfigs[activeSpec.id];
  const stats = activeConfig ? computeEffectiveStats(activeSpec, activeConfig) : null;

  // 10 Blacklist Rivals: #10 -> #1. blacklistDefeated = 0..10.
  const currentRank = Math.max(1, 11 - profile.blacklistDefeated);
  const nextRival = BLACKLIST_RIVALS.find((r) => r.rank === 10 - profile.blacklistDefeated);
  const [selectedTier, setSelectedTier] = useState<number>(() => nextRival?.rank ?? 1);
  const wonTrackIds = Array.isArray(profile.wonTrackIds) ? profile.wonTrackIds : [];
  const completedMissionIds = Array.isArray(profile.completedMissionIds) ? profile.completedMissionIds : [];

  const nextUnlock = nextRival ? isTierBossUnlocked(nextRival, profile) : null;
  const missionsRemaining = nextUnlock ? Math.max(0, nextUnlock.missionsTotal - nextUnlock.missionsDone) : 0;
  const bountyRemaining = nextRival ? Math.max(0, nextRival.requiredBounty - profile.totalBounty) : 0;
  const koRemaining = nextRival ? Math.max(0, nextRival.requiredTakedowns - profile.copsTakedowns) : 0;
  const nextBossUnlocked = Boolean(nextUnlock?.unlocked);

  const selectedTrackMeta = TRACKS.find((t) => t.id === selectedTrack) ?? TRACKS[0];
  const dealershipCars = CARS.filter((c) => !c.bossOnly);
  const bossCars = CARS.filter((c) => c.bossOnly);

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between">
      {/* Top Bar: Compact Command Header */}
      <header className="pointer-events-auto flex items-center justify-between gap-4 px-5 py-2 nfs-carbon-bg border-b-2 border-amber-400/70 nfs-anim-slide-down">
        {/* Zone 1: Single-line Wordmark */}
        <div className="font-display italic text-lg font-bold tracking-wider text-white whitespace-nowrap shrink-0 flex items-center gap-2">
          <span>BLACKLIST</span>
          <span className="px-2 py-0.5 nfs-chamfer-sm bg-amber-400 text-black text-xs font-black not-italic tracking-widest">
            ROCKPORT
          </span>
        </div>

        {/* Zone 2: 5 Single-line Nav Links */}
        <nav className="flex items-center gap-5 text-xs font-display uppercase tracking-wider font-bold">
          {(
            [
              { id: 'missions', label: 'Career' },
              { id: 'race', label: 'Quick Race' },
              { id: 'blacklist', label: 'Blacklist (10)' },
              { id: 'garage', label: 'Garage' },
              { id: 'rapsheet', label: 'Rap Sheet' },
            ] as { id: MenuTab; label: string }[]
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                soundEngine.triggerUiClick();
                setActiveTab(item.id);
                setDockCollapsed(false);
                if (item.id === 'missions' && nextRival) {
                  setSelectedTier((prev) => (prev < nextRival.rank ? nextRival.rank : prev));
                }
                if (item.id === 'rapsheet') onRefreshLeaderboard();
              }}
              className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                activeTab === item.id
                  ? 'border-amber-400 text-amber-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Zone 3: Share & Account Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyShareLink}
            title={`Copy game link: ${SHARE_GAME_URL}`}
            className={`px-2.5 py-1.5 text-xs font-display uppercase tracking-wider font-bold border nfs-chamfer-sm transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
              shareCopied
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                : 'bg-[#181C26] border-white/20 text-slate-200 hover:border-cyan-400 hover:text-cyan-300'
            }`}
          >
            {shareCopied ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
            <span>{shareCopied ? 'Link Copied!' : 'Share'}</span>
          </button>

          {isSignedIn ? (
            <button
              type="button"
              onClick={onSignOut}
              disabled={authBusy}
              className="px-3 py-1.5 text-xs font-display uppercase tracking-wider font-bold text-slate-200 bg-[#181C26] border border-white/20 nfs-chamfer-sm hover:border-amber-400 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {profile.driverName} · Sign Out
            </button>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              disabled={authBusy}
              className="px-3 py-1.5 text-xs font-display uppercase tracking-wider font-bold text-black bg-amber-400 nfs-chamfer-sm hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {authBusy ? 'Connecting...' : 'Save Career'}
            </button>
          )}
        </div>
      </header>

      {/* Top-Left Driver Telemetry Block & Top-Right Audio + EA Trax Picker */}
      <div className="flex items-start justify-between px-5 pt-2">
        <div className="pointer-events-auto nfs-chamfer nfs-carbon-bg border border-white/15 border-l-4 border-l-amber-400 px-3 py-1.5 space-y-0.5 max-w-xs nfs-anim-slide-up">
          <div className="text-[11px] text-slate-300 flex items-center gap-2 font-display uppercase tracking-wide">
            <span className="text-white font-bold truncate">{activeSpec.name}</span>
            <span className="text-slate-600" aria-hidden="true">|</span>
            <span className="text-amber-400 font-bold">
              {currentRank <= 10 ? `#${currentRank}` : 'Challenger'}
            </span>
          </div>
          <div className="flex items-center gap-2.5 text-xs font-mono-tabular">
            <span className="text-emerald-400 font-bold">{formatCurrency(profile.cash)}</span>
            <span className="text-slate-600" aria-hidden="true">/</span>
            <span className="text-amber-400 font-bold">{formatCurrency(profile.totalBounty)}</span>
            <span className="text-slate-600" aria-hidden="true">/</span>
            <span className="text-slate-200 text-[11px]">{completedMissionIds.length}/{NFS_MISSIONS.length}M</span>
          </div>
          {nextRival ? (
            <div className="text-[11px] font-mono-tabular pt-0.5 text-slate-300">
              {nextBossUnlocked ? (
                <span className="text-emerald-400 font-bold uppercase">
                  BOSS #{nextRival.rank} {nextRival.alias} READY TO CHALLENGE
                </span>
              ) : (
                <span>
                  Target #{nextRival.rank} {nextRival.alias}:{' '}
                  <span className="text-amber-300 font-semibold">
                    {missionsRemaining > 0 ? `${missionsRemaining}M ` : ''}
                    {bountyRemaining > 0 ? `${formatCurrency(bountyRemaining)} ` : ''}
                    {koRemaining > 0 ? `${koRemaining}KO` : ''}
                  </span>
                </span>
              )}
            </div>
          ) : (
            <div className="text-[11px] text-emerald-400 font-bold uppercase pt-0.5">
              #1 MOST WANTED CROWN CLAIMED (10/10 DEFEATED)
            </div>
          )}
        </div>

        <div className="pointer-events-auto relative flex items-center gap-1.5 nfs-anim-slide-up">
          {currentTrackLabel && (
            <button
              type="button"
              onClick={() => {
                soundEngine.triggerUiClick();
                setTraxPickerOpen((v) => !v);
              }}
              className="hidden sm:flex items-center gap-2 px-3 py-2 nfs-chamfer-sm nfs-carbon-bg border border-white/15 hover:border-amber-400/60 text-[11px] font-mono-tabular text-slate-200 max-w-[260px] transition-colors cursor-pointer"
              title="Open EA Trax Jukebox"
            >
              <span className="flex items-end gap-[2px] h-3 shrink-0" aria-hidden="true">
                <span className={`w-[2px] h-full bg-amber-400 ${musicMuted || muted ? 'opacity-30' : 'nfs-eq-bar'}`} />
                <span className={`w-[2px] h-full bg-amber-400 ${musicMuted || muted ? 'opacity-30' : 'nfs-eq-bar'}`} style={{ animationDelay: '0.18s' }} />
                <span className={`w-[2px] h-full bg-amber-400 ${musicMuted || muted ? 'opacity-30' : 'nfs-eq-bar'}`} style={{ animationDelay: '0.35s' }} />
              </span>
              <span className="truncate">{currentTrackLabel}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>
          )}
          {onSkipTrack && (
            <button
              type="button"
              onClick={onSkipTrack}
              title="Next EA Trax"
              aria-label="Next EA Trax"
              className="p-2.5 nfs-chamfer-sm nfs-carbon-bg border border-white/18 text-slate-200 hover:text-amber-400 hover:border-amber-400/60 transition-colors cursor-pointer"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          )}
          {onToggleMusicMute && (
            <button
              type="button"
              onClick={onToggleMusicMute}
              title={musicMuted ? 'Unmute Music' : 'Mute Music'}
              aria-label={musicMuted ? 'Unmute Music' : 'Mute Music'}
              className={`p-2.5 nfs-chamfer-sm nfs-carbon-bg border transition-colors cursor-pointer ${
                musicMuted
                  ? 'border-red-500/50 text-red-400 hover:border-red-400'
                  : 'border-white/18 text-slate-200 hover:text-amber-400 hover:border-amber-400/60'
              }`}
            >
              <Music className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onToggleMute}
            title={muted ? 'Unmute All Audio' : 'Mute All Audio'}
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            className="p-2.5 nfs-chamfer-sm nfs-carbon-bg border border-white/18 text-slate-200 hover:text-amber-400 hover:border-amber-400/60 transition-colors cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          {onOpenSettings && (
            <button
              type="button"
              onClick={() => {
                soundEngine.triggerUiClick();
                onOpenSettings();
              }}
              title="Driver, Graphics & Control Settings"
              aria-label="Open Settings"
              className="p-2.5 nfs-chamfer-sm nfs-carbon-bg border border-white/18 text-slate-200 hover:text-amber-400 hover:border-amber-400/60 transition-colors cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}

          {traxPickerOpen && (
            <div className="absolute right-0 top-12 w-72 max-h-72 overflow-y-auto nfs-chamfer nfs-carbon-bg border border-amber-400/45 p-2 shadow-2xl z-30 nfs-anim-tab-enter space-y-1">
              <div className="px-2 py-1 text-[10px] font-display uppercase tracking-wider font-bold text-amber-400 border-b border-white/10">
                EA Trax Rockport Sound System (16)
              </div>
              {EA_TRAX_PLAYLIST.map((trk, idx) => {
                const trackFullLabel = `${trk.title} · ${trk.artist}`;
                const isSelected = currentTrackLabel === trackFullLabel;
                return (
                  <button
                    key={trk.id}
                    type="button"
                    onClick={() => {
                      soundEngine.triggerUiClick();
                      onSelectTrackIdx?.(idx);
                      setTraxPickerOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 text-xs nfs-chamfer-sm flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-amber-400 text-black font-bold'
                        : 'hover:bg-white/10 text-slate-200'
                    }`}
                  >
                    <span className="truncate">{trackFullLabel}</span>
                    <span className={`text-[9px] font-mono-tabular uppercase shrink-0 ${isSelected ? 'text-black/75' : 'text-slate-400'}`}>
                      {trk.kind === 'stream' ? 'METAL' : 'SYNTH'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Collapsible Bottom Command Dock */}
      <div className="flex flex-col items-center pb-3 px-4">
        <div className="pointer-events-auto mb-1 flex items-center gap-2 flex-wrap justify-center">
          {onSelectGaragePreset && (
            <div className="flex items-center gap-1 p-0.5 nfs-chamfer-sm nfs-carbon-bg border border-white/15 text-[10px] font-display uppercase tracking-wider font-bold">
              <Camera className="w-3.5 h-3.5 text-amber-400 ml-1.5 mr-0.5" />
              {(['orbit', 'front', 'side', 'rear'] as GarageCameraPreset[]).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    soundEngine.triggerUiClick();
                    onSelectGaragePreset(preset);
                  }}
                  className={`px-2 py-0.5 nfs-chamfer-sm transition-colors cursor-pointer ${
                    garagePreset === preset
                      ? 'bg-amber-400 text-black'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              soundEngine.triggerUiClick();
              setDockCollapsed((v) => !v);
            }}
            aria-expanded={!dockCollapsed}
            className="px-4 py-1 nfs-chamfer-sm nfs-carbon-bg border border-white/18 border-t-2 border-t-amber-400/70 text-[11px] font-display uppercase tracking-wider font-bold text-slate-200 hover:text-amber-300 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {dockCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            <span>{dockCollapsed ? 'Open Menu' : 'Show 3D Car'}</span>
          </button>
        </div>

        {!dockCollapsed && (
          <section
            aria-label="Garage and Race Dock"
            className="pointer-events-auto w-full max-w-[960px] nfs-chamfer nfs-carbon-bg border border-white/15 border-t-2 border-t-amber-400 shadow-2xl overflow-hidden nfs-anim-slide-up"
          >
            <div className="h-1 w-full nfs-hazard-stripe border-b border-white/10" />
            <div key={activeTab} className="p-3 sm:p-3.5 nfs-anim-tab-enter">
              {/* CAREER MISSIONS TAB (50 Creative Missions + HOW TO WIN Briefing Panel) */}
              {activeTab === 'missions' && (() => {
                const activeMinTier = nextRival ? nextRival.rank : 1;
                const viewTier = Math.max(activeMinTier, selectedTier);
                const tierRival = BLACKLIST_RIVALS.find((r) => r.rank === viewTier) ?? BLACKLIST_RIVALS[0];
                const tierMissions = getMissionsForTier(viewTier);
                const tierGate = isTierBossUnlocked(tierRival, profile);
                const tierDefeated = profile.blacklistDefeated > 10 - tierRival.rank;
                const bossTrackMeta = TRACKS.find((t) => t.id === tierRival.trackId);
                const nextMissionToPlay =
                  tierMissions.find((m) => !completedMissionIds.includes(m.id)) ?? tierMissions[0];
                const focusedMission =
                  tierMissions.find((m) => m.id === focusedMissionId) ?? nextMissionToPlay;
                const focusedTrackMeta = TRACKS.find((t) => t.id === focusedMission.trackId);
                const focusedDone = completedMissionIds.includes(focusedMission.id);
                const focusedMode = resolveMissionRaceMode(focusedMission.type);
                const nextMissionMode = resolveMissionRaceMode(nextMissionToPlay.type);

                return (
                  <div className="space-y-3">
                    {/* Crystal-Clear Active Objective & Instant Launch Bar */}
                    <div className="bg-[#0B0D13] border border-white/12 border-l-4 border-l-amber-400 nfs-chamfer-sm px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 text-[11px] font-mono-tabular uppercase">
                          <span className="px-1.5 py-0.5 bg-amber-400 text-black font-bold">
                            TIER #{tierRival.rank}
                          </span>
                          <span className="text-amber-300 font-bold">
                            {tierRival.alias}
                          </span>
                          <span className="text-slate-500 hidden sm:inline">·</span>
                          <span className="text-slate-300 hidden sm:inline truncate">{tierRival.carName}</span>
                        </div>
                        <div className="text-xs text-slate-300 font-mono-tabular flex flex-wrap items-center gap-x-3">
                          <span>
                            Missions{' '}
                            <strong className={tierGate.allMissionsDone ? 'text-emerald-400' : 'text-amber-300'}>
                              {tierGate.missionsDone}/{tierGate.missionsTotal}
                            </strong>
                          </span>
                          <span>
                            Bounty{' '}
                            <strong className={tierGate.bountyMet ? 'text-emerald-400' : 'text-white'}>
                              {formatCurrency(profile.totalBounty)}/{formatCurrency(tierRival.requiredBounty)}
                            </strong>
                          </span>
                          <span>
                            Cop KO{' '}
                            <strong className={tierGate.takedownsMet ? 'text-emerald-400' : 'text-white'}>
                              {profile.copsTakedowns}/{tierRival.requiredTakedowns}
                            </strong>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1 flex-wrap">
                          {BLACKLIST_RIVALS.map((r) => {
                            const rLocked = r.rank < activeMinTier;
                            const rDefeated = profile.blacklistDefeated > 10 - r.rank;
                            const rSelected = viewTier === r.rank;
                            return (
                              <button
                                key={r.rank}
                                type="button"
                                disabled={rLocked}
                                onClick={() => {
                                  soundEngine.triggerUiClick();
                                  setSelectedTier(r.rank);
                                  setFocusedMissionId(null);
                                }}
                                className={`px-2 py-1 text-[11px] font-mono-tabular font-bold nfs-chamfer-sm border transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
                                  rSelected
                                    ? 'bg-amber-400 text-black border-amber-400'
                                    : rDefeated
                                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/45 hover:border-emerald-400'
                                      : 'bg-[#141822] text-slate-300 border-white/15 hover:border-white/35'
                                }`}
                              >
                                #{r.rank}
                              </button>
                            );
                          })}
                        </div>

                        {tierDefeated || tierGate.unlocked ? (
                          <button
                            type="button"
                            onClick={() =>
                              onStartRace(
                                'blacklist',
                                tierRival.trackId,
                                tierRival,
                                tierRival.environment,
                                patrolsEnabled,
                              )
                            }
                            className="px-4 py-2 nfs-chamfer-sm bg-red-600 hover:bg-red-500 text-white font-display uppercase tracking-wider font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                          >
                            <Flame className="w-3.5 h-3.5" />
                            <span>{tierDefeated ? `Rematch #${tierRival.rank}` : `Challenge ${tierRival.alias}`}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              onStartRace(
                                nextMissionMode,
                                nextMissionToPlay.trackId,
                                undefined,
                                nextMissionToPlay.environment,
                                true,
                                nextMissionToPlay,
                              )
                            }
                            className="px-4 py-2 nfs-chamfer-sm bg-amber-400 hover:bg-amber-300 text-black font-display uppercase tracking-wider font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>Next M{nextMissionToPlay.order}: {nextMissionToPlay.modeTag}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-stretch">
                      {/* Left: 5 Tier Missions Selector List */}
                      <div className="md:col-span-5 max-h-[188px] overflow-y-auto pr-1 space-y-1">
                        {tierMissions.map((mission) => {
                          const isDone = completedMissionIds.includes(mission.id);
                          const isFocused = mission.id === focusedMission.id;
                          const trk = TRACKS.find((t) => t.id === mission.trackId);

                          return (
                            <button
                              key={mission.id}
                              type="button"
                              onClick={() => {
                                soundEngine.triggerUiClick();
                                setFocusedMissionId(mission.id);
                              }}
                              className={`w-full text-left nfs-chamfer-sm border border-l-4 px-3 py-2 transition-colors cursor-pointer ${
                                isFocused
                                  ? 'bg-[#1B2230] border-amber-400 border-l-amber-400'
                                  : isDone
                                    ? 'bg-[#10181D] border-white/12 border-l-emerald-400 hover:border-white/25'
                                    : 'bg-[#11151E] border-white/12 border-l-slate-500 hover:border-white/30'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 text-[10px] font-mono-tabular">
                                <span className="text-amber-400 font-bold uppercase tracking-wider truncate">
                                  M{mission.order} · {mission.modeTag}
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <DifficultyTag difficulty={mission.difficulty} />
                                  {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                                </div>
                              </div>
                              <div className="font-display uppercase tracking-wide text-sm font-bold text-white leading-tight truncate mt-0.5">
                                {mission.title}
                              </div>
                              <div className="text-[11px] font-mono-tabular text-slate-300 flex items-center justify-between gap-2 mt-0.5">
                                <span className="text-cyan-300 truncate">{trk?.name ?? mission.trackId}</span>
                                <span className="text-emerald-400 font-bold shrink-0">+{formatCurrency(mission.cashReward)}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Center: Crystal-Clear HOW TO WIN Mission Briefing */}
                      <div className="md:col-span-4 bg-[#121621] border border-white/15 border-l-4 border-l-cyan-400 nfs-chamfer-sm p-3.5 flex flex-col justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2 text-[10px] font-mono-tabular uppercase">
                            <span className="px-1.5 py-0.5 bg-cyan-400/20 text-cyan-300 font-bold">
                              M{focusedMission.order} BRIEFING · REC STAGE {Math.min(4, Math.max(1, focusedMission.aiTierBoost + 1))}+
                            </span>
                            <span className="text-emerald-400 font-bold">
                              +{formatCurrency(focusedMission.cashReward)} · +{formatCurrency(focusedMission.bountyReward)}
                            </span>
                          </div>

                          <div>
                            <div className="font-display italic uppercase text-base font-bold text-white leading-tight">
                              {focusedMission.title}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono-tabular mt-0.5">
                              {focusedTrackMeta?.name} · {focusedTrackMeta?.musicTrackName}
                            </div>
                          </div>

                          <div className="bg-black/35 border border-white/10 nfs-chamfer-sm p-2.5 space-y-1.5">
                            <div className="text-[10px] font-display uppercase tracking-wider font-bold text-amber-400">
                              HOW TO WIN THIS MISSION:
                            </div>
                            <ul className="space-y-1 text-[11px] text-slate-100 leading-snug">
                              {focusedMission.winRules.map((rule, idx) => (
                                <li key={idx} className="flex items-start gap-1.5">
                                  <span className="font-mono-tabular text-amber-400 font-bold shrink-0">{idx + 1}.</span>
                                  <span>{rule}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="text-[10px] text-cyan-200 bg-cyan-500/10 border-l-2 border-cyan-400 px-2.5 py-1.5 leading-snug">
                            <strong className="uppercase font-display text-cyan-300">TIP:</strong> {focusedMission.proTip}
                          </div>
                        </div>

                        <button
                          type="button"
                          data-start="true"
                          onClick={() =>
                            onStartRace(
                              focusedMode,
                              focusedMission.trackId,
                              undefined,
                              focusedMission.environment,
                              true,
                              focusedMission,
                            )
                          }
                          className={`mt-2.5 w-full py-2 px-3 text-xs font-display uppercase tracking-wider font-bold nfs-chamfer-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                            focusedDone
                              ? 'bg-emerald-500/22 hover:bg-emerald-500/32 text-emerald-200 border border-emerald-500/45'
                              : 'bg-amber-400 hover:bg-amber-300 text-black'
                          }`}
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>{focusedDone ? `Replay M${focusedMission.order}` : `Launch M${focusedMission.order}`}</span>
                        </button>
                      </div>

                      {/* Right: Boss Gate Card */}
                      <div className="md:col-span-3 bg-[#11151E] border border-amber-400/35 border-l-4 border-l-red-500 nfs-chamfer-sm p-3.5 flex flex-col justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-[11px] font-mono-tabular uppercase">
                            <span className="text-red-400 font-bold tracking-wider">BOSS DUEL #{tierRival.rank}</span>
                            <span className={tierDefeated ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                              {tierDefeated ? 'Pink Slip Won' : tierGate.unlocked ? 'Unlocked' : 'Locked'}
                            </span>
                          </div>

                          <div>
                            <div className="font-display italic uppercase text-lg font-bold text-white leading-tight">
                              {tierRival.alias}
                            </div>
                            <div className="text-xs text-amber-300 font-semibold mt-0.5 truncate">{tierRival.carName}</div>
                            <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                              {bossTrackMeta?.name}
                            </div>
                          </div>

                          <div className="space-y-1.5 pt-1.5 border-t border-white/10 text-xs font-mono-tabular">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Missions</span>
                              <span className={tierGate.allMissionsDone ? 'text-emerald-400 font-bold' : 'text-amber-300 font-bold'}>
                                {tierGate.missionsDone} / {tierGate.missionsTotal}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Bounty</span>
                              <span className={tierGate.bountyMet ? 'text-emerald-400 font-bold' : 'text-white font-bold'}>
                                {formatCurrency(profile.totalBounty)} / {formatCurrency(tierRival.requiredBounty)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Cop KO</span>
                              <span className={tierGate.takedownsMet ? 'text-emerald-400 font-bold' : 'text-white font-bold'}>
                                {profile.copsTakedowns} / {tierRival.requiredTakedowns}
                              </span>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={!tierDefeated && !tierGate.unlocked}
                          onClick={() =>
                            onStartRace(
                              'blacklist',
                              tierRival.trackId,
                              tierRival,
                              tierRival.environment,
                              patrolsEnabled,
                            )
                          }
                          className="mt-3 w-full py-2 px-3 bg-amber-400 hover:bg-amber-300 disabled:bg-white/8 disabled:text-slate-500 text-black font-display uppercase tracking-wider font-bold text-xs nfs-chamfer-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          {!tierDefeated && !tierGate.unlocked ? (
                            <>
                              <Lock className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">
                                {!tierGate.allMissionsDone
                                  ? `Clear ${tierGate.missionsTotal} Missions (${tierGate.missionsDone}/${tierGate.missionsTotal})`
                                  : 'Meet Bounty & KO'}
                              </span>
                            </>
                          ) : (
                            <>
                              <Flame className="w-3.5 h-3.5 shrink-0" />
                              <span>{tierDefeated ? `Rematch #${tierRival.rank}` : `Fight ${tierRival.alias}`}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* QUICK RACE TAB */}
              {activeTab === 'race' && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch">
                  {/* Col 1: Event Mode & Weather/Cop Options */}
                  <div className="md:col-span-4 space-y-2.5 flex flex-col justify-between">
                    <div className="space-y-2">
                      <h2 className="font-display uppercase tracking-wider text-sm font-bold text-amber-400">
                        Event Mode & Conditions
                      </h2>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(
                          [
                            { id: 'circuit', title: 'Circuit Race', desc: 'Multi-lap · $18k', icon: Trophy },
                            { id: 'sprint', title: '1-Lap Sprint', desc: 'Fast blitz · $11k', icon: Zap },
                            { id: 'knockout', title: 'Lap Knockout', desc: 'Last out · $24k', icon: Target },
                            { id: 'tollbooth', title: 'Tollbooth', desc: '8 gates clock', icon: Clock },
                            { id: 'speedtrap', title: 'Speedtrap', desc: 'Radar · $18.5k', icon: Gauge },
                            { id: 'freeroam', title: 'Free Roam', desc: 'Shortcuts & traps', icon: Compass },
                            { id: 'pursuit', title: 'Pursuit', desc: 'Heat 1–5 RPD', icon: ShieldAlert },
                            {
                              id: 'blacklist',
                              title: nextRival ? `#${nextRival.rank}: ${nextRival.alias}` : 'Rematch Razor',
                              desc: nextRival
                                ? nextBossUnlocked
                                  ? 'Pink Slip Ready!'
                                  : `${nextUnlock?.missionsDone ?? 0}/${nextUnlock?.missionsTotal ?? 5}M · ${formatCurrency(bountyRemaining)}`
                                : 'Defend #1 Crown',
                              icon: Flame,
                            },
                          ] as const
                        ).map((m) => {
                          const Icon = m.icon;
                          const active = selectedMode === m.id;
                          const locked = m.id === 'blacklist' && Boolean(nextRival && !nextBossUnlocked);
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                soundEngine.triggerUiClick();
                                setSelectedMode(m.id);
                              }}
                              className={`w-full text-left px-2.5 py-1.5 nfs-chamfer-sm border transition-colors flex items-start gap-2 cursor-pointer ${
                                active
                                  ? 'bg-amber-500/15 border-amber-400 border-l-4 text-white'
                                  : 'bg-[#11151E] border-white/12 text-slate-300 hover:border-white/30'
                              }`}
                            >
                              <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${active ? 'text-amber-400' : 'text-slate-400'}`} />
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-display uppercase tracking-wide font-bold flex items-center justify-between gap-1">
                                  <span className="truncate">{m.title}</span>
                                  {locked && <Lock className="w-3 h-3 text-amber-400 shrink-0" />}
                                </div>
                                <p className="text-[10px] font-mono-tabular text-slate-400 truncate">{m.desc}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Environment & Police Patrol Controls */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <label className="block space-y-1">
                        <span className="text-[10px] font-display uppercase tracking-wider text-slate-400 flex items-center gap-1">
                          <CloudRain className="w-3 h-3 text-cyan-400" />
                          <span>Atmosphere</span>
                        </span>
                        <select
                          value={selectedEnv}
                          onChange={(e) => setSelectedEnv(e.target.value as EnvironmentId)}
                          className="w-full bg-[#11151E] border border-white/18 nfs-chamfer-sm px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400 cursor-pointer"
                        >
                          {ENVIRONMENTS.map((env) => (
                            <option key={env.id} value={env.id}>
                              {env.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="space-y-1">
                        <span className="text-[10px] font-display uppercase tracking-wider text-slate-400 flex items-center gap-1">
                          <Shield className="w-3 h-3 text-amber-400" />
                          <span>RPD Patrols</span>
                        </span>
                        <button
                          type="button"
                          disabled={selectedMode === 'pursuit' || selectedMode === 'freeroam'}
                          onClick={() => setPatrolsEnabled((v) => !v)}
                          className={`w-full py-1.5 px-2 nfs-chamfer-sm border text-xs font-display uppercase tracking-wider font-bold transition-colors cursor-pointer disabled:opacity-60 ${
                            patrolsEnabled || selectedMode === 'pursuit' || selectedMode === 'freeroam'
                              ? 'bg-red-500/18 border-red-500/55 text-red-200'
                              : 'bg-[#11151E] border-white/18 text-slate-400'
                          }`}
                        >
                          {selectedMode === 'pursuit' || selectedMode === 'freeroam'
                            ? 'Active (Mode)'
                            : patrolsEnabled
                              ? 'Patrols: ON'
                              : 'Patrols: OFF'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Col 2: 10-Circuit Selector */}
                  <div className="md:col-span-5 space-y-2 flex flex-col justify-between">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <h2 className="font-display uppercase tracking-wider text-sm font-bold text-white">
                          Select Circuit (10)
                        </h2>
                        <span className="text-xs font-mono-tabular text-emerald-400 font-bold">
                          Cleared: {wonTrackIds.length}/10
                        </span>
                      </div>
                      <div className="max-h-[178px] overflow-y-auto pr-1 space-y-1.5">
                        {TRACKS.map((trk) => {
                          const active = selectedTrack === trk.id;
                          const disabled = selectedMode === 'blacklist';
                          const isWon = wonTrackIds.includes(trk.id);
                          return (
                            <button
                              key={trk.id}
                              type="button"
                              disabled={disabled}
                              onClick={() => {
                                soundEngine.triggerUiClick();
                                setSelectedTrack(trk.id);
                              }}
                              className={`w-full text-left px-3 py-2 nfs-chamfer-sm border transition-colors flex items-center justify-between gap-2.5 cursor-pointer disabled:opacity-50 ${
                                active
                                  ? 'bg-[#1A202D] border-amber-400 border-l-4 text-white'
                                  : 'bg-[#11151E] border-white/12 text-slate-300 hover:border-white/30'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="text-xs sm:text-sm font-display uppercase tracking-wide font-bold flex items-center gap-1.5">
                                  {isWon && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                                  <span className="truncate">{trk.name}</span>
                                  <DifficultyTag difficulty={trk.difficulty} />
                                </div>
                                <div className="text-[11px] font-mono-tabular text-slate-400 mt-0.5 truncate">
                                  {trk.lengthLabel} · {trk.styleTag} ·{' '}
                                  {ENVIRONMENTS.find((e) => e.id === trk.defaultEnv)?.label} ·{' '}
                                  <span className="text-amber-300/90">{trk.musicTrackName}</span>
                                </div>
                              </div>
                              <TrackSilhouette trackId={trk.id} active={active} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-snug line-clamp-2">
                      {selectedTrackMeta.description}
                    </p>
                  </div>

                  {/* Col 3: Active Ride & Start CTA */}
                  <div className="md:col-span-3 flex flex-col justify-between bg-[#11151E] border border-white/15 border-l-4 border-l-amber-400 nfs-chamfer-sm p-3.5">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[10px] font-display uppercase tracking-wider text-slate-400">
                          {activeSpec.bossOnly ? 'Pink-Slip Boss Car' : 'Active Ride'}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            soundEngine.init();
                            soundEngine.triggerGarageRev(activeSpec.bodyStyle);
                          }}
                          className="px-2 py-1 text-[10px] font-display uppercase tracking-wider font-bold bg-white/8 hover:bg-amber-400 hover:text-black text-amber-300 border border-white/15 nfs-chamfer-sm flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Gauge className="w-3 h-3" />
                          <span>Rev</span>
                        </button>
                      </div>
                      <div className="font-display italic uppercase text-base font-bold text-white leading-tight truncate">
                        {activeSpec.name}
                      </div>
                      {stats && (
                        <div className="space-y-1.5 pt-0.5 text-xs">
                          <StatBar label="Top Speed" value={`${stats.topSpeedKmh} km/h`} pct={(stats.topSpeedKmh / 400) * 100} />
                          <StatBar label="Accel" value={`${stats.accel}/100`} pct={stats.accel} />
                          <StatBar label="Handling" value={`${stats.handling}/100`} pct={stats.handling} />
                        </div>
                      )}

                      {nextRival && (
                        <div className="pt-1.5 border-t border-white/10 text-[11px] space-y-0.5">
                          <div className="text-slate-400 font-display uppercase tracking-wide">
                            Next Boss: <span className="text-amber-400 font-bold">#{nextRival.rank} {nextRival.alias}</span>
                          </div>
                          <div className="font-mono-tabular text-slate-300 flex justify-between">
                            <span>Missions: {nextUnlock?.missionsDone ?? 0}/{nextUnlock?.missionsTotal ?? 5}</span>
                            <span>KO: {profile.copsTakedowns}/{nextRival.requiredTakedowns}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {(() => {
                      const targetRival = nextRival ?? BLACKLIST_RIVALS[BLACKLIST_RIVALS.length - 1];
                      const isBlacklistLocked = selectedMode === 'blacklist' && Boolean(nextRival && !nextBossUnlocked);

                      return (
                        <button
                          type="button"
                          data-start="true"
                          disabled={isBlacklistLocked}
                          onClick={() =>
                            onStartRace(
                              selectedMode,
                              selectedMode === 'blacklist' ? targetRival.trackId : selectedTrack,
                              selectedMode === 'blacklist' ? targetRival : undefined,
                              selectedEnv,
                              patrolsEnabled,
                            )
                          }
                          className="mt-3 w-full py-2.5 px-4 bg-amber-400 hover:bg-amber-300 disabled:bg-white/10 disabled:text-slate-500 text-black font-display uppercase tracking-wider font-bold text-sm nfs-chamfer-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                        >
                          <Play className="w-4 h-4 fill-current" />
                          <span>{isBlacklistLocked ? 'Unlock Tier Missions' : 'Start Event'}</span>
                        </button>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* BLACKLIST TAB (All 10 Rivals) */}
              {activeTab === 'blacklist' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="font-display italic uppercase tracking-wider text-lg font-bold text-white">
                        Rockport Blacklist (Top 10)
                      </h2>
                      <p className="text-xs text-slate-400">
                        {nextRival
                          ? `Target #${nextRival.rank} ${nextRival.alias} — Clear all ${nextUnlock?.missionsTotal ?? 5} tier missions to seize ${nextRival.carName}`
                          : 'All 10 Blacklist rivals defeated. You own Razor’s BMW M3 GTR!'}
                      </p>
                    </div>
                    <div className="text-xs text-slate-300 font-mono-tabular">
                      {profile.blacklistDefeated}/10 Bosses · {completedMissionIds.length}/{NFS_MISSIONS.length} Missions · {wonTrackIds.length}/10 Circuits
                    </div>
                  </div>

                  {nextRival && (
                    <div className="bg-[#11151E] border border-white/12 border-l-4 border-l-amber-400 nfs-chamfer-sm px-3.5 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex-1 min-w-[220px] space-y-1">
                        <div className="flex justify-between font-mono-tabular text-[11px]">
                          <span className="text-slate-400 uppercase">Bounty for #{nextRival.rank} {nextRival.alias}</span>
                          <span className="text-amber-400 font-bold">
                            {formatCurrency(profile.totalBounty)} / {formatCurrency(nextRival.requiredBounty)}
                          </span>
                        </div>
                        <div className="h-1.5 bg-white/12 overflow-hidden">
                          <div
                            className="h-full bg-amber-400 transition-[width]"
                            style={{ width: `${Math.min(100, (profile.totalBounty / nextRival.requiredBounty) * 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="font-mono-tabular text-[11px] text-slate-300 shrink-0 flex items-center gap-3">
                        <span>
                          Missions:{' '}
                          <span className={nextUnlock?.allMissionsDone ? 'text-emerald-400 font-bold' : 'text-amber-300 font-bold'}>
                            {nextUnlock?.missionsDone ?? 0}/{nextUnlock?.missionsTotal ?? 5}
                          </span>
                        </span>
                        <span>
                          Cop KO:{' '}
                          <span className={koRemaining === 0 ? 'text-emerald-400 font-bold' : 'text-white font-bold'}>
                            {profile.copsTakedowns}/{nextRival.requiredTakedowns}
                          </span>
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 max-h-[188px] overflow-y-auto pr-1">
                    {BLACKLIST_RIVALS.map((rival) => {
                      const defeatedCountNeeded = 10 - rival.rank;
                      const isDefeated = profile.blacklistDefeated > defeatedCountNeeded;
                      const isNext = profile.blacklistDefeated === defeatedCountNeeded;
                      const gate = isTierBossUnlocked(rival, profile);
                      const meetsReq = gate.unlocked;

                      return (
                        <div
                          key={rival.rank}
                          className={`nfs-chamfer-sm border border-white/12 border-l-4 p-2.5 flex flex-col justify-between ${
                            isNext
                              ? 'bg-amber-500/12 border-l-amber-400'
                              : isDefeated
                                ? 'bg-[#10181D] border-l-emerald-400'
                                : 'bg-[#11151E] border-l-slate-600 opacity-75'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between text-xs font-mono-tabular">
                              <span className="font-bold text-amber-400">#{rival.rank}</span>
                              <span className={isDefeated ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                                {isDefeated ? 'WON' : isNext ? 'TARGET' : 'LOCKED'}
                              </span>
                            </div>
                            <div className="font-display uppercase text-sm font-bold text-white mt-0.5">{rival.alias}</div>
                            <div className="text-[11px] text-amber-200/90 truncate">{rival.carName}</div>
                            <div className="mt-1.5 text-[10px] text-slate-400 font-mono-tabular">
                              {gate.missionsDone}/{gate.missionsTotal}M · {formatCurrency(rival.requiredBounty)} · {rival.requiredTakedowns}KO
                            </div>
                            <div className="text-[11px] text-emerald-400 font-mono-tabular">
                              Cash: {formatCurrency(rival.cashReward)}
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={!isDefeated && !(isNext && meetsReq)}
                            onClick={() =>
                              onStartRace('blacklist', rival.trackId, rival, rival.environment, patrolsEnabled)
                            }
                            className="mt-2 w-full py-1.5 px-2 text-xs font-display uppercase tracking-wider font-bold nfs-chamfer-sm bg-amber-400 hover:bg-amber-300 disabled:bg-white/10 disabled:text-slate-500 text-black transition-colors cursor-pointer"
                          >
                            {isDefeated ? 'Rematch' : isNext && meetsReq ? 'Challenge' : 'Locked'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* GARAGE TAB */}
              {activeTab === 'garage' && activeConfig && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-1 p-1 bg-[#11151E] nfs-chamfer-sm border border-white/15">
                      {(
                        [
                          { id: 'vehicles', label: 'Showroom & Pink Slips' },
                          { id: 'performance', label: 'Performance' },
                          { id: 'visuals', label: 'Paint & Vinyl' },
                        ] as const
                      ).map((sec) => (
                        <button
                          key={sec.id}
                          type="button"
                          onClick={() => {
                            soundEngine.triggerUiClick();
                            setGarageSection(sec.id);
                          }}
                          className={`px-3 py-1.5 text-xs font-display uppercase tracking-wider font-bold nfs-chamfer-sm transition-colors cursor-pointer ${
                            garageSection === sec.id ? 'bg-amber-400 text-black' : 'text-slate-300 hover:text-white'
                          }`}
                        >
                          {sec.label}
                        </button>
                      ))}
                    </div>
                    <div className="text-xs text-slate-300 font-mono-tabular">
                      Available Cash: <span className="text-emerald-400 font-bold">{formatCurrency(profile.cash)}</span>
                    </div>
                  </div>

                  {garageSection === 'vehicles' && (
                    <div className="max-h-[188px] overflow-y-auto pr-1 space-y-2.5">
                      <div>
                        <div className="text-xs font-display uppercase tracking-wider font-bold text-slate-300 mb-1.5">
                          Dealership Cars (10)
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                          {dealershipCars.map((car) => {
                            const owned = profile.ownedCarIds.includes(car.id);
                            const selected = profile.selectedCarId === car.id;
                            const unlockedByRank = currentRank <= car.unlockRank;
                            const canAfford = profile.cash >= car.price;

                            return (
                              <div
                                key={car.id}
                                className={`nfs-chamfer-sm border border-white/12 border-l-4 p-2.5 flex flex-col justify-between ${
                                  selected ? 'bg-amber-500/15 border-l-amber-400' : 'bg-[#11151E] border-l-slate-500'
                                }`}
                              >
                                <div>
                                  <div className="text-[10px] font-mono-tabular uppercase text-slate-400 truncate">{car.brand}</div>
                                  <div className="font-display uppercase text-xs sm:text-sm font-bold text-white mt-0.5 truncate">
                                    {car.name}
                                  </div>
                                  <div className="text-[11px] text-slate-400 mt-0.5 font-mono-tabular">
                                    {car.baseTopSpeedKmh} km/h · Tier {car.tier}
                                  </div>
                                </div>

                                {owned ? (
                                  <button
                                    type="button"
                                    onClick={() => onSelectCar(car.id)}
                                    className={`mt-2 w-full py-1.5 px-2 text-xs font-display uppercase tracking-wider font-bold nfs-chamfer-sm transition-colors cursor-pointer ${
                                      selected
                                        ? 'bg-amber-400 text-black'
                                        : 'bg-white/10 text-white hover:bg-white/20'
                                    }`}
                                  >
                                    {selected ? 'Selected' : 'Drive'}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={!unlockedByRank || !canAfford}
                                    onClick={() => onBuyCar(car.id)}
                                    className="mt-2 w-full py-1.5 px-2 text-xs font-display uppercase tracking-wider font-bold nfs-chamfer-sm bg-emerald-500 hover:bg-emerald-400 disabled:bg-white/10 disabled:text-slate-500 text-black transition-colors cursor-pointer"
                                  >
                                    {!unlockedByRank ? `Beat #${car.unlockRank}` : formatCurrency(car.price)}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-display uppercase tracking-wider font-bold text-amber-400 mb-1.5 flex items-center gap-1.5">
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>Exclusive Pink-Slip Boss Cars (Win Only)</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                          {bossCars.map((car) => {
                            const owned = profile.ownedCarIds.includes(car.id);
                            const selected = profile.selectedCarId === car.id;
                            const rival = BLACKLIST_RIVALS.find((r) => r.rank === car.bossRank);

                            return (
                              <div
                                key={car.id}
                                className={`nfs-chamfer-sm border border-white/12 border-l-4 p-2.5 flex flex-col justify-between ${
                                  selected
                                    ? 'bg-amber-500/18 border-l-amber-400'
                                    : owned
                                      ? 'bg-[#151A24] border-l-emerald-400'
                                      : 'bg-[#0F1219] border-l-slate-600 opacity-75'
                                }`}
                              >
                                <div>
                                  <div className="text-[10px] font-mono-tabular uppercase text-amber-400 font-bold truncate">
                                    #{car.bossRank} {rival?.alias ?? 'BOSS'} PINK SLIP
                                  </div>
                                  <div className="font-display uppercase text-xs sm:text-sm font-bold text-white mt-0.5 truncate">
                                    {car.name}
                                  </div>
                                  <div className="text-[11px] text-slate-400 mt-0.5 font-mono-tabular">
                                    {car.baseTopSpeedKmh} km/h · Boss GT
                                  </div>
                                </div>

                                {owned ? (
                                  <button
                                    type="button"
                                    onClick={() => onSelectCar(car.id)}
                                    className={`mt-2 w-full py-1.5 px-2 text-xs font-display uppercase tracking-wider font-bold nfs-chamfer-sm transition-colors cursor-pointer ${
                                      selected
                                        ? 'bg-amber-400 text-black'
                                        : 'bg-amber-500/20 text-amber-200 hover:bg-amber-500/35'
                                    }`}
                                  >
                                    {selected ? 'Selected' : 'Drive Boss Car'}
                                  </button>
                                ) : (
                                  <div className="mt-2 w-full py-1.5 px-2 text-[10px] font-mono-tabular uppercase font-bold nfs-chamfer-sm bg-white/6 text-slate-400 text-center border border-white/10">
                                    Beat #{car.bossRank} {rival?.alias}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {garageSection === 'performance' && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {(
                        [
                          { key: 'engineLevel', label: 'Engine Block', sub: 'Top Speed +14 km/h' },
                          { key: 'turboLevel', label: 'Twin Turbo', sub: 'Acceleration +6' },
                          { key: 'nitrousLevel', label: 'Nitrous Oxide', sub: 'Capacity & Recharge' },
                          { key: 'tiresLevel', label: 'Sport Tires', sub: 'Corner Grip +6' },
                        ] as const
                      ).map((part) => {
                        const lvl = activeConfig[part.key];
                        const maxed = lvl >= 4;
                        const cost = maxed ? 0 : UPGRADE_COST[lvl];
                        const canAfford = profile.cash >= cost;

                        return (
                          <div
                            key={part.key}
                            className="bg-[#11151E] border border-white/12 border-l-4 border-l-amber-400 nfs-chamfer-sm p-3 flex flex-col justify-between"
                          >
                            <div>
                              <div className="flex items-center justify-between">
                                <span className="font-display uppercase tracking-wide text-sm font-bold text-white">
                                  {part.label}
                                </span>
                                <Wrench className="w-3.5 h-3.5 text-amber-400" />
                              </div>
                              <div className="flex items-center justify-between text-xs mt-0.5">
                                <span className="text-slate-400">{part.sub}</span>
                                <span className="font-mono-tabular text-amber-400 font-bold">
                                  {maxed ? '4/4' : `S${lvl}→S${lvl + 1}`}
                                </span>
                              </div>
                              <div className="flex gap-1 mt-2.5">
                                {[1, 2, 3, 4].map((pip) => (
                                  <div
                                    key={pip}
                                    className={`h-1.5 flex-1 ${pip <= lvl ? 'bg-amber-400' : 'bg-white/15'}`}
                                  />
                                ))}
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={maxed || !canAfford}
                              onClick={() => onUpgradePart(part.key)}
                              className="mt-3 w-full py-1.5 px-2.5 text-xs font-display uppercase tracking-wider font-bold nfs-chamfer-sm bg-amber-400 hover:bg-amber-300 disabled:bg-white/10 disabled:text-slate-500 text-black transition-colors cursor-pointer"
                            >
                              {maxed ? 'Max Stage' : `Install · ${formatCurrency(cost)}`}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {garageSection === 'visuals' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <div className="text-xs font-display uppercase tracking-wider font-bold text-slate-300">
                          Metallic Paint
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {PAINT_SWATCHES.map((sw) => (
                            <button
                              key={sw.hex}
                              type="button"
                              title={sw.name}
                              onClick={() => onCustomizeCar({ paintHex: sw.hex })}
                              className={`w-8 h-8 nfs-chamfer-sm border-2 transition-transform cursor-pointer ${
                                activeConfig.paintHex.toLowerCase() === sw.hex.toLowerCase()
                                  ? 'border-amber-400 scale-110'
                                  : 'border-white/25 hover:scale-105'
                              }`}
                              style={{ backgroundColor: sw.hex }}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-xs font-display uppercase tracking-wider font-bold text-slate-300">
                          Body Livery
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {LIVERY_OPTIONS.map((lv) => (
                            <button
                              key={lv.id}
                              type="button"
                              onClick={() => onCustomizeCar({ livery: lv.id as LiveryStyle })}
                              className={`w-full text-left px-2.5 py-1.5 text-xs font-display uppercase tracking-wide nfs-chamfer-sm border transition-colors cursor-pointer ${
                                activeConfig.livery === lv.id
                                  ? 'bg-amber-400 text-black border-amber-400 font-bold'
                                  : 'bg-[#11151E] text-slate-300 border-white/12 hover:border-white/30'
                              }`}
                            >
                              {lv.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-xs font-display uppercase tracking-wider font-bold text-slate-300">
                          Forged Wheels
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {RIM_OPTIONS.map((rm) => (
                            <button
                              key={rm.id}
                              type="button"
                              onClick={() => onCustomizeCar({ rimStyle: rm.id as RimStyle })}
                              className={`px-3 py-2 text-xs font-display uppercase tracking-wide nfs-chamfer-sm border flex items-center gap-2 transition-colors cursor-pointer ${
                                activeConfig.rimStyle === rm.id
                                  ? 'bg-amber-400 text-black border-amber-400 font-bold'
                                  : 'bg-[#11151E] text-slate-300 border-white/12 hover:border-white/30'
                              }`}
                            >
                              <span
                                className="w-3 h-3 border border-black/40 shrink-0"
                                style={{ backgroundColor: rm.colorHex }}
                              />
                              <span className="truncate">{rm.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* RAP SHEET TAB */}
              {activeTab === 'rapsheet' && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                  <div className="md:col-span-4 bg-[#11151E] border border-white/12 border-l-4 border-l-amber-400 nfs-chamfer-sm p-4 space-y-2">
                    <h2 className="font-display uppercase tracking-wider text-base font-bold text-white">
                      Your Rap Sheet
                    </h2>
                    <div className="space-y-1.5 text-xs">
                      <RapRow label="Driver" value={profile.driverName} />
                      <RapRow label="Blacklist Rank" value={currentRank <= 10 ? `#${currentRank}` : 'Unranked'} />
                      <RapRow label="Bosses Defeated" value={`${profile.blacklistDefeated} / 10`} />
                      <RapRow label="Circuits Won" value={`${wonTrackIds.length} / 10`} />
                      <RapRow label="Total Bounty" value={formatCurrency(profile.totalBounty)} />
                      <RapRow label="Race Wins" value={String(profile.racesWon)} />
                      <RapRow label="Cops Taken Down" value={String(profile.copsTakedowns)} />
                      <RapRow label="Best Lap" value={formatTimeMs(profile.bestLapMs)} />
                    </div>
                    {!isSignedIn && (
                      <p className="text-xs text-amber-400/90 pt-1">
                        Sign in above to publish your Rap Sheet to the global board.
                      </p>
                    )}
                  </div>

                  <div className="md:col-span-8 bg-[#11151E] border border-white/12 nfs-chamfer-sm p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="font-display uppercase tracking-wider text-base font-bold text-white">
                        Most Wanted Global Board
                      </h2>
                      <button
                        type="button"
                        onClick={onRefreshLeaderboard}
                        className="text-xs font-display uppercase tracking-wider text-amber-400 hover:text-amber-300 font-bold cursor-pointer"
                      >
                        Refresh
                      </button>
                    </div>
                    {leaderboardLoading ? (
                      <div className="text-xs text-slate-400 py-6 text-center">Loading Rap Sheet records...</div>
                    ) : leaderboard.length === 0 ? (
                      <div className="text-xs text-slate-400 py-6 text-center">
                        No cloud records posted yet. Sign in and finish a race to claim #1!
                      </div>
                    ) : (
                      <div className="max-h-48 overflow-y-auto divide-y divide-white/8 text-xs">
                        {leaderboard.map((row, idx) => (
                          <div key={row.uid} className="py-2 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="font-mono-tabular font-bold text-amber-400 w-5">#{idx + 1}</span>
                              <span className="font-semibold text-white truncate">{row.driverName}</span>
                              <span className="text-slate-400 truncate hidden sm:inline">· {row.carName}</span>
                            </div>
                            <div className="flex items-center gap-4 font-mono-tabular shrink-0">
                              <span className="text-slate-400">{formatTimeMs(row.bestLapMs)}</span>
                              <span className="text-emerald-400 font-bold">{formatCurrency(row.totalBounty)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

function DifficultyTag({ difficulty }: { difficulty: TrackDifficulty }) {
  const tone =
    difficulty === 'Easy'
      ? 'text-emerald-400'
      : difficulty === 'Medium'
        ? 'text-amber-400'
        : difficulty === 'Hard'
          ? 'text-orange-400'
          : 'text-red-400';
  return <span className={`text-[10px] font-mono-tabular font-bold uppercase ${tone}`}>{difficulty}</span>;
}

function StatBar({ label, value, pct }: { label: string; value: string; pct: number }) {
  return (
    <div>
      <div className="flex justify-between text-slate-300 mb-0.5 text-[11px]">
        <span className="uppercase font-display tracking-wide">{label}</span>
        <span className="font-mono-tabular font-bold text-white">{value}</span>
      </div>
      <div className="h-1.5 bg-white/12 overflow-hidden">
        <div className="h-full bg-amber-400" style={{ width: `${Math.min(100, Math.max(8, pct))}%` }} />
      </div>
    </div>
  );
}

function RapRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-slate-300">
      <span className="text-slate-400">{label}</span>
      <span className="font-mono-tabular font-bold text-white">{value}</span>
    </div>
  );
}

function formatMissionTypeLabel(type: MissionType): string {
  switch (type) {
    case 'circuit':
      return 'Circuit';
    case 'sprint':
      return 'Sprint';
    case 'knockout':
      return 'Knockout';
    case 'tollbooth':
      return 'Tollbooth';
    case 'speedtrap':
      return 'Speedtrap';
    case 'pursuit_milestone':
      return 'Pursuit';
    case 'shortcut_heist':
      return 'Shortcut Heist';
    case 'drift_showdown':
      return 'Drift Duel';
    case 'stunt_blitz':
      return 'Stunt Blitz';
    case 'interceptor':
      return 'Interceptor';
  }
}

function TrackSilhouette({ trackId, active }: { trackId: TrackId; active: boolean }) {
  const pathD = useMemo(() => {
    const pts = getTrackMinimapPoints(trackId);
    if (!pts.length) return '';
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    const span = Math.max(maxX - minX, maxZ - minZ, 1);
    const pad = 5;
    const w = 44 - pad * 2;
    const h = 42 - pad * 2;
    const scale = Math.min(w, h) / span;
    const ox = (44 - (maxX - minX) * scale) * 0.5;
    const oy = (42 - (maxZ - minZ) * scale) * 0.5;

    let d = '';
    for (let i = 0; i < pts.length; i += 2) {
      const p = pts[i];
      const sx = (ox + (p.x - minX) * scale).toFixed(1);
      const sy = (oy + (p.z - minZ) * scale).toFixed(1);
      d += `${i === 0 ? 'M' : 'L'}${sx},${sy}`;
    }
    return `${d} Z`;
  }, [trackId]);

  return (
    <svg viewBox="0 0 44 42" className="w-10 h-9 shrink-0" aria-hidden="true">
      <path
        d={pathD}
        fill="none"
        stroke={active ? '#F59E0B' : '#64748B'}
        strokeWidth="3.0"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
