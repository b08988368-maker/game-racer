import React, { useState } from 'react';
import {
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
  Play,
  Shield,
  ShieldAlert,
  Target,
  Trophy,
  Volume2,
  VolumeX,
  Wrench,
  Zap,
} from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import {
  BLACKLIST_RIVALS,
  CARS,
  computeEffectiveStats,
  ENVIRONMENTS,
  formatCurrency,
  formatTimeMs,
  LIVERY_OPTIONS,
  PAINT_SWATCHES,
  RIM_OPTIONS,
  TRACKS,
  UPGRADE_COST,
} from '../data/gameData';
import {
  BlacklistRival,
  CareerProfile,
  EnvironmentId,
  GarageCarConfig,
  LeaderboardEntry,
  LiveryStyle,
  RaceMode,
  RimStyle,
  TrackDifficulty,
  TrackId,
} from '../types/game';

export type MenuTab = 'race' | 'blacklist' | 'garage' | 'rapsheet';

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

  const activeSpec = CARS.find((c) => c.id === profile.selectedCarId) ?? CARS[0];
  const activeConfig = garageConfigs[activeSpec.id];
  const stats = activeConfig ? computeEffectiveStats(activeSpec, activeConfig) : null;

  // 10 Blacklist Rivals: #10 -> #1. blacklistDefeated = 0..10.
  const currentRank = Math.max(1, 11 - profile.blacklistDefeated);
  const nextRival = BLACKLIST_RIVALS.find((r) => r.rank === 10 - profile.blacklistDefeated);
  const wonTrackIds = Array.isArray(profile.wonTrackIds) ? profile.wonTrackIds : [];

  const winsRemaining = nextRival ? Math.max(0, nextRival.requiredWins - profile.racesWon) : 0;
  const bountyRemaining = nextRival ? Math.max(0, nextRival.requiredBounty - profile.totalBounty) : 0;
  const koRemaining = nextRival ? Math.max(0, nextRival.requiredTakedowns - profile.copsTakedowns) : 0;
  const nextBossUnlocked = Boolean(
    nextRival && winsRemaining === 0 && bountyRemaining === 0 && koRemaining === 0,
  );

  const selectedTrackMeta = TRACKS.find((t) => t.id === selectedTrack) ?? TRACKS[0];
  const dealershipCars = CARS.filter((c) => !c.bossOnly);
  const bossCars = CARS.filter((c) => c.bossOnly);

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between">
      {/* Top Bar: Strict 3-Zone Contract */}
      <header className="pointer-events-auto flex items-center justify-between gap-8 px-6 py-3.5 bg-[#0D0E12]/90 border-b border-white/10">
        {/* Zone 1: Single-line Wordmark */}
        <div className="font-display text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0">
          BLACKLIST <span className="text-amber-400">ROCKPORT</span>
        </div>

        {/* Zone 2: 4 Single-line Nav Links */}
        <nav className="flex items-center gap-6 text-sm font-medium">
          {(
            [
              { id: 'race', label: 'Race' },
              { id: 'blacklist', label: 'Blacklist (10)' },
              { id: 'garage', label: 'Garage' },
              { id: 'rapsheet', label: 'Rap Sheet' },
            ] as { id: MenuTab; label: string }[]
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveTab(item.id);
                setDockCollapsed(false);
                if (item.id === 'rapsheet') onRefreshLeaderboard();
              }}
              className={`whitespace-nowrap shrink-0 pb-1 border-b-2 transition-colors cursor-pointer ${
                activeTab === item.id
                  ? 'border-amber-400 text-white font-semibold'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Zone 3: 1 Primary Account Action */}
        <div className="flex items-center gap-4 shrink-0">
          {isSignedIn ? (
            <button
              type="button"
              onClick={onSignOut}
              disabled={authBusy}
              className="px-4 py-2 text-xs font-semibold text-slate-200 bg-[#181B23] border border-white/15 rounded-lg hover:bg-[#222631] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {profile.driverName} · Sign Out
            </button>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              disabled={authBusy}
              className="px-4 py-2 text-xs font-semibold text-black bg-amber-400 rounded-lg hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {authBusy ? 'Connecting...' : 'Save Career with Google'}
            </button>
          )}
        </div>
      </header>

      {/* Subtle Corner Career Summary (Top-Left below header, never blocking center 3D car) */}
      <div className="flex items-start justify-between px-6 pt-3">
        <div className="pointer-events-auto bg-[#0D0E12]/88 border border-white/10 rounded-xl px-4 py-2.5 space-y-1 max-w-sm">
          <div className="text-xs text-slate-400 flex items-center gap-2 tabular-nums">
            <span className="text-white font-semibold truncate">{activeSpec.name}</span>
            <span aria-hidden="true">·</span>
            <span className="text-amber-300 font-medium">
              {currentRank <= 10 ? `Blacklist #${currentRank}` : 'Unranked Challenger'}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm font-mono-tabular">
            <span className="text-emerald-400 font-bold">{formatCurrency(profile.cash)}</span>
            <span className="text-slate-600" aria-hidden="true">/</span>
            <span className="text-amber-400 font-bold">{formatCurrency(profile.totalBounty)} Bounty</span>
            <span className="text-slate-600" aria-hidden="true">/</span>
            <span className="text-slate-200 text-xs">{wonTrackIds.length}/10 Won</span>
          </div>
          {nextRival ? (
            <div className="text-[11px] font-mono-tabular pt-0.5 text-slate-300">
              {nextBossUnlocked ? (
                <span className="text-emerald-400 font-semibold">
                  Boss #{nextRival.rank} {nextRival.alias} READY TO CHALLENGE
                </span>
              ) : (
                <span>
                  Unlock #{nextRival.rank} {nextRival.alias}:{' '}
                  <span className="text-amber-300">
                    {winsRemaining > 0 ? `${winsRemaining}W ` : ''}
                    {bountyRemaining > 0 ? `${formatCurrency(bountyRemaining)} ` : ''}
                    {koRemaining > 0 ? `${koRemaining}KO` : ''}
                  </span>
                </span>
              )}
            </div>
          ) : (
            <div className="text-[11px] text-emerald-400 font-semibold pt-0.5">
              #1 MOST WANTED CROWN CLAIMED (10/10 DEFEATED)
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? 'Unmute audio' : 'Mute audio'}
          className="pointer-events-auto p-2.5 bg-[#0D0E12]/85 border border-white/10 rounded-lg text-slate-200 hover:text-amber-400 transition-colors cursor-pointer"
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Collapsible Bottom Control Dock */}
      <div className="flex flex-col items-center pb-4 px-4">
        <button
          type="button"
          onClick={() => setDockCollapsed((v) => !v)}
          className="pointer-events-auto mb-1.5 px-3.5 py-1 bg-[#0D0E12]/90 border border-white/15 rounded-lg text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          {dockCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span>{dockCollapsed ? 'Show Controls' : 'Hide Controls'}</span>
        </button>

        {!dockCollapsed && (
          <section
            aria-label="Garage and Race Dock"
            className="pointer-events-auto w-full max-w-[1040px] bg-[#0D0E12]/94 border border-white/12 rounded-2xl p-4 sm:p-5 shadow-2xl"
          >
            {/* RACE TAB */}
            {activeTab === 'race' && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch">
                {/* Col 1: Event Mode & Weather/Cop Options */}
                <div className="md:col-span-4 space-y-2.5 flex flex-col justify-between">
                  <div className="space-y-2">
                    <h2 className="font-display text-base font-bold text-white">Event Mode & Conditions</h2>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          { id: 'circuit', title: 'Circuit Race', desc: 'Multi-lap · $18k', icon: Trophy },
                          { id: 'sprint', title: '1-Lap Sprint', desc: 'Fast blitz · $11k', icon: Zap },
                          { id: 'knockout', title: 'Lap Knockout', desc: 'Last out · $24k', icon: Target },
                          { id: 'tollbooth', title: 'Tollbooth', desc: '8 gates clock', icon: Clock },
                          { id: 'freeroam', title: 'Free Roam', desc: 'Shortcuts & traps', icon: Compass },
                          { id: 'pursuit', title: 'Pursuit', desc: 'Heat 1–5 RPD', icon: ShieldAlert },
                          {
                            id: 'blacklist',
                            title: nextRival ? `#${nextRival.rank}: ${nextRival.alias}` : 'Rematch Razor',
                            desc: nextRival
                              ? nextBossUnlocked
                                ? 'Pink Slip Ready!'
                                : `${winsRemaining}W · ${formatCurrency(bountyRemaining)}`
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
                            onClick={() => setSelectedMode(m.id)}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg border transition-colors flex items-start gap-2 cursor-pointer ${
                              m.id === 'blacklist' ? 'col-span-2' : ''
                            } ${
                              active
                                ? 'bg-amber-500/15 border-amber-400 text-white'
                                : 'bg-[#151820] border-white/10 text-slate-300 hover:border-white/25'
                            }`}
                          >
                            <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${active ? 'text-amber-400' : 'text-slate-400'}`} />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold flex items-center justify-between gap-1">
                                <span className="truncate">{m.title}</span>
                                {locked && <Lock className="w-3 h-3 text-amber-400 shrink-0" />}
                              </div>
                              <p className="text-[11px] text-slate-400 truncate">{m.desc}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Environment & Police Patrol Controls */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <label className="block space-y-1">
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <CloudRain className="w-3 h-3 text-cyan-400" />
                        <span>Environment</span>
                      </span>
                      <select
                        value={selectedEnv}
                        onChange={(e) => setSelectedEnv(e.target.value as EnvironmentId)}
                        className="w-full bg-[#151820] border border-white/15 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400 cursor-pointer"
                      >
                        {ENVIRONMENTS.map((env) => (
                          <option key={env.id} value={env.id}>
                            {env.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="space-y-1">
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Shield className="w-3 h-3 text-amber-400" />
                        <span>Police Patrols</span>
                      </span>
                      <button
                        type="button"
                        disabled={selectedMode === 'pursuit' || selectedMode === 'freeroam'}
                        onClick={() => setPatrolsEnabled((v) => !v)}
                        className={`w-full py-1.5 px-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60 ${
                          patrolsEnabled || selectedMode === 'pursuit' || selectedMode === 'freeroam'
                            ? 'bg-red-500/15 border-red-500/45 text-red-200'
                            : 'bg-[#151820] border-white/15 text-slate-400'
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
                      <h2 className="font-display text-base font-bold text-white">Select Circuit (10)</h2>
                      <span className="text-xs font-mono-tabular text-emerald-400 font-semibold">
                        Cleared: {wonTrackIds.length} / 10
                      </span>
                    </div>
                    <div className="max-h-[212px] overflow-y-auto pr-1 space-y-1.5">
                      {TRACKS.map((trk) => {
                        const active = selectedTrack === trk.id;
                        const disabled = selectedMode === 'blacklist';
                        const isWon = wonTrackIds.includes(trk.id);
                        return (
                          <button
                            key={trk.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => setSelectedTrack(trk.id)}
                            className={`w-full text-left px-3 py-2 rounded-xl border transition-colors flex items-center justify-between gap-2.5 cursor-pointer disabled:opacity-50 ${
                              active
                                ? 'bg-[#1D222E] border-amber-400 text-white'
                                : 'bg-[#151820] border-white/10 text-slate-300 hover:border-white/25'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-xs sm:text-sm font-semibold flex items-center gap-1.5">
                                {isWon && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                                <span className="truncate">{trk.name}</span>
                                <DifficultyTag difficulty={trk.difficulty} />
                              </div>
                              <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                                {trk.lengthLabel} · {trk.styleTag} ·{' '}
                                {ENVIRONMENTS.find((e) => e.id === trk.defaultEnv)?.label}
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

                {/* Col 3: Active Ride & Next Boss Counter */}
                <div className="md:col-span-3 flex flex-col justify-between bg-[#151820] border border-white/10 rounded-xl p-3.5">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-slate-400">
                        {activeSpec.bossOnly ? 'Pink-Slip Boss Car' : 'Active Ride'}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          soundEngine.init();
                          soundEngine.triggerGarageRev(activeSpec.bodyStyle);
                        }}
                        className="px-2 py-1 text-[11px] font-semibold bg-white/8 hover:bg-amber-400 hover:text-black text-amber-300 border border-white/10 rounded-md flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Gauge className="w-3 h-3" />
                        <span>Rev</span>
                      </button>
                    </div>
                    <div className="font-display text-base font-bold text-white leading-tight truncate">
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
                        <div className="text-slate-400 font-medium">
                          Next Boss: <span className="text-amber-400 font-bold">#{nextRival.rank} {nextRival.alias}</span>
                        </div>
                        <div className="font-mono-tabular text-slate-300 flex justify-between">
                          <span>Wins: {profile.racesWon}/{nextRival.requiredWins}</span>
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
                        className="mt-3 w-full py-2.5 px-4 bg-amber-400 hover:bg-amber-300 disabled:bg-slate-700 disabled:text-slate-400 text-black font-display font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>{isBlacklistLocked ? 'Win More Races First' : 'Start Event'}</span>
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
                    <h2 className="font-display text-lg font-bold text-white">Rockport Blacklist (Top 10)</h2>
                    <p className="text-xs text-slate-400">
                      {nextRival
                        ? `Next Target: #${nextRival.rank} ${nextRival.alias} — Beat him to seize ${nextRival.carName}`
                        : 'All 10 Blacklist rivals defeated. You own Razor’s BMW M3 GTR!'}
                    </p>
                  </div>
                  <div className="text-xs text-slate-300 font-mono-tabular">
                    {profile.blacklistDefeated} / 10 Bosses · {profile.racesWon} Wins · {wonTrackIds.length}/10 Circuits
                  </div>
                </div>

                {nextRival && (
                  <div className="bg-[#151820] border border-white/10 rounded-xl px-3.5 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex-1 min-w-[220px] space-y-1">
                      <div className="flex justify-between font-mono-tabular text-[11px]">
                        <span className="text-slate-400">Bounty Needed for #{nextRival.rank} {nextRival.alias}</span>
                        <span className="text-amber-400 font-semibold">
                          {formatCurrency(profile.totalBounty)} / {formatCurrency(nextRival.requiredBounty)}
                        </span>
                      </div>
                      <div className="h-1.5 bg-white/10 rounded-sm overflow-hidden">
                        <div
                          className="h-full bg-amber-400 rounded-sm transition-[width]"
                          style={{ width: `${Math.min(100, (profile.totalBounty / nextRival.requiredBounty) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="font-mono-tabular text-[11px] text-slate-300 shrink-0 flex items-center gap-3">
                      <span>
                        Wins:{' '}
                        <span className={winsRemaining === 0 ? 'text-emerald-400 font-bold' : 'text-white font-bold'}>
                          {profile.racesWon}/{nextRival.requiredWins}
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

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 max-h-[250px] overflow-y-auto pr-1">
                  {BLACKLIST_RIVALS.map((rival) => {
                    const defeatedCountNeeded = 10 - rival.rank;
                    const isDefeated = profile.blacklistDefeated > defeatedCountNeeded;
                    const isNext = profile.blacklistDefeated === defeatedCountNeeded;
                    const meetsReq =
                      profile.totalBounty >= rival.requiredBounty &&
                      profile.racesWon >= rival.requiredWins &&
                      profile.copsTakedowns >= rival.requiredTakedowns;

                    return (
                      <div
                        key={rival.rank}
                        className={`rounded-xl border p-2.5 flex flex-col justify-between ${
                          isNext
                            ? 'bg-amber-500/12 border-amber-400'
                            : isDefeated
                              ? 'bg-[#131820] border-emerald-500/35'
                              : 'bg-[#151820] border-white/10 opacity-75'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between text-xs font-mono-tabular">
                            <span className="font-bold text-amber-400">#{rival.rank}</span>
                            <span className={isDefeated ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                              {isDefeated ? 'Pink Slip Won' : isNext ? 'Target' : 'Locked'}
                            </span>
                          </div>
                          <div className="font-display text-sm font-bold text-white mt-0.5">{rival.alias}</div>
                          <div className="text-[11px] text-amber-200/90 truncate">{rival.carName}</div>
                          <div className="mt-1.5 text-[10px] text-slate-400 font-mono-tabular">
                            Req: {formatCurrency(rival.requiredBounty)} · {rival.requiredWins}W · {rival.requiredTakedowns}KO
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
                          className="mt-2 w-full py-1.5 px-2 text-xs font-semibold rounded-lg bg-amber-400 hover:bg-amber-300 disabled:bg-white/10 disabled:text-slate-500 text-black transition-colors cursor-pointer"
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
                  <div className="flex items-center gap-1 p-1 bg-[#151820] rounded-lg border border-white/10">
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
                        onClick={() => setGarageSection(sec.id)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
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
                  <div className="max-h-[250px] overflow-y-auto pr-1 space-y-3">
                    <div>
                      <div className="text-xs font-semibold text-slate-300 mb-1.5">
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
                              className={`rounded-xl border p-2.5 flex flex-col justify-between ${
                                selected ? 'bg-amber-500/15 border-amber-400' : 'bg-[#151820] border-white/10'
                              }`}
                            >
                              <div>
                                <div className="text-[11px] text-slate-400 truncate">{car.brand}</div>
                                <div className="font-display text-xs sm:text-sm font-bold text-white mt-0.5 truncate">
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
                                  className={`mt-2 w-full py-1.5 px-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
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
                                  className="mt-2 w-full py-1.5 px-2 text-xs font-semibold rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:bg-white/10 disabled:text-slate-500 text-black transition-colors cursor-pointer"
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
                      <div className="text-xs font-semibold text-amber-400 mb-1.5 flex items-center gap-1.5">
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Exclusive Pink-Slip Boss Cars (Win Only — Not Sold in Shop)</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {bossCars.map((car) => {
                          const owned = profile.ownedCarIds.includes(car.id);
                          const selected = profile.selectedCarId === car.id;
                          const rival = BLACKLIST_RIVALS.find((r) => r.rank === car.bossRank);

                          return (
                            <div
                              key={car.id}
                              className={`rounded-xl border p-2.5 flex flex-col justify-between ${
                                selected
                                  ? 'bg-amber-500/18 border-amber-400'
                                  : owned
                                    ? 'bg-[#171A24] border-amber-500/40'
                                    : 'bg-[#12141B] border-white/10 opacity-75'
                              }`}
                            >
                              <div>
                                <div className="text-[11px] text-amber-400 font-semibold truncate">
                                  #{car.bossRank} {rival?.alias ?? 'BOSS'} PINK SLIP
                                </div>
                                <div className="font-display text-xs sm:text-sm font-bold text-white mt-0.5 truncate">
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
                                  className={`mt-2 w-full py-1.5 px-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                                    selected
                                      ? 'bg-amber-400 text-black'
                                      : 'bg-amber-500/20 text-amber-200 hover:bg-amber-500/35'
                                  }`}
                                >
                                  {selected ? 'Selected' : 'Drive Boss Car'}
                                </button>
                              ) : (
                                <div className="mt-2 w-full py-1.5 px-2 text-[11px] font-semibold rounded-lg bg-white/6 text-slate-400 text-center border border-white/10">
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
                        <div key={part.key} className="bg-[#151820] border border-white/10 rounded-xl p-3 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-white">{part.label}</span>
                              <Wrench className="w-3.5 h-3.5 text-amber-400" />
                            </div>
                            <div className="flex items-center justify-between text-xs mt-0.5">
                              <span className="text-slate-400">{part.sub}</span>
                              <span className="font-mono-tabular text-amber-400 font-semibold">
                                {maxed ? 'Stage 4/4' : `Stage ${lvl}→${lvl + 1}`}
                              </span>
                            </div>
                            <div className="flex gap-1 mt-2.5">
                              {[1, 2, 3, 4].map((pip) => (
                                <div
                                  key={pip}
                                  className={`h-1.5 flex-1 rounded-sm ${pip <= lvl ? 'bg-amber-400' : 'bg-white/15'}`}
                                />
                              ))}
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={maxed || !canAfford}
                            onClick={() => onUpgradePart(part.key)}
                            className="mt-3 w-full py-1.5 px-2.5 text-xs font-semibold rounded-lg bg-amber-400 hover:bg-amber-300 disabled:bg-white/10 disabled:text-slate-500 text-black transition-colors cursor-pointer"
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
                      <div className="text-xs font-semibold text-slate-300">Metallic Paint</div>
                      <div className="flex flex-wrap gap-2">
                        {PAINT_SWATCHES.map((sw) => (
                          <button
                            key={sw.hex}
                            type="button"
                            title={sw.name}
                            onClick={() => onCustomizeCar({ paintHex: sw.hex })}
                            className={`w-8 h-8 rounded-lg border-2 transition-transform cursor-pointer ${
                              activeConfig.paintHex.toLowerCase() === sw.hex.toLowerCase()
                                ? 'border-amber-400 scale-110'
                                : 'border-white/20 hover:scale-105'
                            }`}
                            style={{ backgroundColor: sw.hex }}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-slate-300">Body Livery</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {LIVERY_OPTIONS.map((lv) => (
                          <button
                            key={lv.id}
                            type="button"
                            onClick={() => onCustomizeCar({ livery: lv.id as LiveryStyle })}
                            className={`w-full text-left px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                              activeConfig.livery === lv.id
                                ? 'bg-amber-400 text-black border-amber-400 font-semibold'
                                : 'bg-[#151820] text-slate-300 border-white/10 hover:border-white/25'
                            }`}
                          >
                            {lv.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-slate-300">Forged Wheels</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {RIM_OPTIONS.map((rm) => (
                          <button
                            key={rm.id}
                            type="button"
                            onClick={() => onCustomizeCar({ rimStyle: rm.id as RimStyle })}
                            className={`px-3 py-2 text-xs font-medium rounded-lg border flex items-center gap-2 transition-colors cursor-pointer ${
                              activeConfig.rimStyle === rm.id
                                ? 'bg-amber-400 text-black border-amber-400 font-semibold'
                                : 'bg-[#151820] text-slate-300 border-white/10 hover:border-white/25'
                            }`}
                          >
                            <span
                              className="w-3 h-3 rounded-sm border border-black/30 shrink-0"
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
                <div className="md:col-span-4 bg-[#151820] border border-white/10 rounded-xl p-4 space-y-2">
                  <h2 className="font-display text-base font-bold text-white">Your Rap Sheet</h2>
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
                      Sign in with Google above to publish your Rap Sheet to the global board.
                    </p>
                  )}
                </div>

                <div className="md:col-span-8 bg-[#151820] border border-white/10 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="font-display text-base font-bold text-white">Most Wanted Global Board</h2>
                    <button
                      type="button"
                      onClick={onRefreshLeaderboard}
                      className="text-xs text-amber-400 hover:text-amber-300 font-medium cursor-pointer"
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
                    <div className="max-h-48 overflow-y-auto divide-y divide-white/5 text-xs">
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
      <div className="flex justify-between text-slate-300 mb-0.5">
        <span>{label}</span>
        <span className="font-mono-tabular font-semibold text-white">{value}</span>
      </div>
      <div className="h-1.5 bg-white/10 rounded-sm overflow-hidden">
        <div className="h-full bg-amber-400 rounded-sm" style={{ width: `${Math.min(100, Math.max(8, pct))}%` }} />
      </div>
    </div>
  );
}

function RapRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-slate-300">
      <span className="text-slate-400">{label}</span>
      <span className="font-mono-tabular font-semibold text-white">{value}</span>
    </div>
  );
}

function TrackSilhouette({ trackId, active }: { trackId: TrackId; active: boolean }) {
  const paths: Record<TrackId, string> = {
    rockport_loop: 'M 10 30 L 10 12 Q 14 6 26 6 Q 36 9 35 19 L 25 22 L 25 28 L 33 33 Q 25 38 14 35 Z',
    rosewood_park: 'M 10 28 L 10 12 Q 14 6 28 7 Q 37 12 34 21 L 24 23 L 30 33 Q 20 38 11 33 Z',
    hwy99_speedway: 'M 10 32 L 10 10 Q 16 4 30 7 Q 38 15 36 28 Q 30 38 16 36 Z',
    camden_coast: 'M 9 30 L 9 12 Q 14 5 27 6 Q 37 10 34 18 L 25 22 L 34 30 Q 29 38 17 36 Q 10 34 9 30 Z',
    rosewood_canyon: 'M 10 30 L 10 14 Q 12 6 24 7 Q 37 8 34 19 L 22 20 Q 19 25 32 30 Q 35 37 22 36 Q 11 35 10 30 Z',
    heritage_forest: 'M 10 30 L 11 10 L 24 7 L 35 13 L 26 21 L 34 27 L 26 36 L 14 34 Z',
    gray_point_bay: 'M 8 28 L 8 10 Q 18 5 30 6 L 37 16 L 34 31 Q 22 38 12 35 Z',
    silverton_pass: 'M 9 32 L 9 10 Q 15 5 28 6 Q 36 12 31 19 L 20 20 L 22 26 L 34 28 Q 36 37 22 36 Q 11 35 9 32 Z',
    downtown_labyrinth: 'M 10 32 L 10 10 L 24 10 L 24 18 L 35 18 L 35 28 L 23 28 L 23 36 L 12 36 Z',
    blackridge_summit: 'M 9 34 L 9 8 L 24 6 L 36 11 L 26 17 L 36 24 L 22 28 L 32 35 L 14 37 Z',
  };

  return (
    <svg viewBox="0 0 44 42" className="w-10 h-9 shrink-0" aria-hidden="true">
      <path
        d={paths[trackId]}
        fill="none"
        stroke={active ? '#F59E0B' : '#64748B'}
        strokeWidth="3.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
