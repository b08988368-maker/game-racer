import React, { useMemo } from 'react';
import {
  Activity,
  Bot,
  Camera,
  CheckCircle2,
  Circle,
  CloudFog,
  CloudRain,
  FastForward,
  Flag,
  Flame,
  Gamepad2,
  Ghost,
  History,
  Music,
  Pause,
  Radio,
  RotateCcw,
  Settings,
  ShieldAlert,
  SkipForward,
  Sliders,
  Sun,
  Volume2,
  VolumeX,
  Wrench,
} from 'lucide-react';
import { AI_PERSONALITY_TRAITS } from '../config/aiConfig';
import { HANDLING_PRESETS, SURFACE_MODIFIERS } from '../config/physicsConfig';
import {
  ControlBindings,
  formatKeyCode,
  getDefaultControlBindings,
  TouchControlsMode,
} from '../config/settingsConfig';
import { ENVIRONMENTS, formatCurrency, formatTimeMs } from '../data/gameData';
import { RaceMode, RaceTelemetry } from '../types/game';

interface Props {
  telemetry: RaceTelemetry;
  mode: RaceMode;
  muted: boolean;
  musicMuted: boolean;
  showDebug?: boolean;
  aiDebugOpen?: boolean;
  tuningOpen?: boolean;
  aeLookEnabled?: boolean;
  touchControlsMode?: TouchControlsMode;
  controlBindings?: ControlBindings;
  onToggleAeLook?: () => void;
  onToggleTuning?: () => void;
  onToggleDebug?: () => void;
  onToggleAiDebug?: () => void;
  onToggleGhost?: () => void;
  onRewind?: () => void;
  onInstantRestart?: () => void;
  onOpenSettings?: () => void;
  onToggleMute: () => void;
  onToggleMusicMute: () => void;
  onSkipTrack: () => void;
  onCycleCamera: () => void;
  onPause: () => void;
  onSkipIntro?: () => void;
  onFinishFreeroam?: () => void;
  onTouchInput: (key: 'throttle' | 'brake' | 'left' | 'right' | 'nitrous' | 'speedbreaker' | 'handbrake', down: boolean) => void;
}

export const RaceHUD: React.FC<Props> = ({
  telemetry,
  mode,
  muted,
  musicMuted,
  showDebug = false,
  aiDebugOpen = false,
  tuningOpen = false,
  aeLookEnabled = true,
  touchControlsMode = 'auto',
  controlBindings,
  onToggleAeLook,
  onToggleTuning,
  onToggleDebug,
  onToggleAiDebug,
  onToggleGhost,
  onRewind,
  onInstantRestart,
  onOpenSettings,
  onToggleMute,
  onToggleMusicMute,
  onSkipTrack,
  onCycleCamera,
  onPause,
  onSkipIntro,
  onFinishFreeroam,
  onTouchInput,
}) => {
  const keys = controlBindings ?? getDefaultControlBindings(aeLookEnabled);
  const minimapData = useMemo(() => {
    const pts = telemetry.minimapPath;
    if (!pts.length) {
      return {
        pathD: '',
        shortcutDs: [] as string[],
        shortcutEntries: [] as { x: number; y: number }[],
        toMap: (_x: number, _z: number) => ({ x: 64, y: 64 }),
      };
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    pts.forEach((p) => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    });

    const span = Math.max(maxX - minX, maxZ - minZ, 1);
    const pad = 14;
    const size = 128 - pad * 2;
    const offsetX = pad + (size - ((maxX - minX) / span) * size) * 0.5;
    const offsetY = pad + (size - ((maxZ - minZ) / span) * size) * 0.5;

    const toMap = (wx: number, wz: number) => ({
      x: offsetX + ((wx - minX) / span) * size,
      y: offsetY + ((wz - minZ) / span) * size,
    });

    const d =
      pts
        .map((p, idx) => {
          const m = toMap(p.x, p.z);
          return `${idx === 0 ? 'M' : 'L'}${m.x.toFixed(1)},${m.y.toFixed(1)}`;
        })
        .join(' ') + ' Z';

    const rawScs = telemetry.minimapShortcuts ?? [];
    const shortcutDs = rawScs.map((scPts) =>
      scPts
        .map((p, idx) => {
          const m = toMap(p.x, p.z);
          return `${idx === 0 ? 'M' : 'L'}${m.x.toFixed(1)},${m.y.toFixed(1)}`;
        })
        .join(' '),
    );
    const shortcutEntries = rawScs
      .filter((scPts) => scPts.length > 0)
      .map((scPts) => toMap(scPts[0].x, scPts[0].z));

    return { pathD: d, shortcutDs, shortcutEntries, toMap };
  }, [telemetry.minimapPath, telemetry.minimapShortcuts]);

  const rpmAngle = -215 + telemetry.rpm * 250;
  const rpmRad = (rpmAngle * Math.PI) / 180;
  const nosDash = (telemetry.nitrous / 100) * 142;

  const speedStreakOpacity = telemetry.isNitrousActive
    ? 0.55
    : Math.max(0, Math.min(0.45, (telemetry.speedKmh - 165) / 170));

  return (
    <div className="pointer-events-none fixed inset-0 z-10 select-none overflow-hidden">
      {/* NFS Most Wanted Speedbreaker Amber Slow-Motion Screen Tint */}
      {telemetry.isSpeedbreakerActive && (
        <div
          className="fixed inset-0 pointer-events-none transition-opacity duration-150"
          style={{
            background:
              'radial-gradient(circle at center, rgba(245, 158, 11, 0.08) 40%, rgba(180, 83, 9, 0.42) 100%)',
            boxShadow: 'inset 0 0 90px rgba(245, 158, 11, 0.45)',
          }}
        />
      )}

      {/* High-Speed / Nitrous Peripheral Speed Streaks */}
      {speedStreakOpacity > 0.02 && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            opacity: speedStreakOpacity,
            background: telemetry.isNitrousActive
              ? 'radial-gradient(circle at center, transparent 52%, rgba(6, 182, 212, 0.35) 100%)'
              : 'radial-gradient(circle at center, transparent 58%, rgba(245, 158, 11, 0.22) 100%)',
          }}
        />
      )}

      {/* Active Police Pursuit Edge Vignette */}
      {telemetry.pursuitState === 'pursuit' && telemetry.activeCops > 0 && !telemetry.isSpeedbreakerActive && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 85% 15%, rgba(239, 68, 68, 0.16) 0%, transparent 42%), radial-gradient(circle at 15% 15%, rgba(59, 130, 246, 0.16) 0%, transparent 42%)',
          }}
        />
      )}

      {/* Speed-Trap Radar Strobe Flash */}
      {telemetry.speedTrapFlash && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at center, rgba(224, 242, 254, 0.18) 20%, rgba(56, 189, 248, 0.34) 100%)',
            boxShadow: 'inset 0 0 70px rgba(255, 255, 255, 0.45)',
          }}
        />
      )}

      {/* U3 Slow-Motion Takedown / Heavy Impact Camera Frame */}
      {telemetry.takedownCamActive && (
        <>
          <div
            className="fixed inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(circle at center, transparent 48%, rgba(245, 158, 11, 0.24) 100%)',
              boxShadow: 'inset 0 0 80px rgba(0, 0, 0, 0.65)',
            }}
          />
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-20 px-4 py-1 nfs-chamfer-sm nfs-carbon-bg border border-amber-400/60 border-l-4 border-l-amber-400 font-display italic font-bold uppercase tracking-widest text-xs text-amber-300 pointer-events-none">
            IMPACT CAM · 0.28x SLOW-MO
          </div>
        </>
      )}

      {/* Cinema Widescreen Intro & Outro Letterbox Overlays */}
      {(telemetry.cinematicPhase === 'intro' || telemetry.cinematicPhase === 'outro') && (
        <>
          <div className="fixed top-0 left-0 right-0 h-14 sm:h-16 bg-black/95 border-b border-amber-400/35 nfs-letterbox-top z-20 pointer-events-none" />
          <div className="fixed bottom-0 left-0 right-0 h-16 sm:h-20 bg-black/95 border-t border-amber-400/35 nfs-letterbox-bottom z-20 pointer-events-none" />

          {telemetry.cinematicPhase === 'intro' && (
            <div className="fixed inset-x-0 bottom-24 z-20 flex flex-col items-center px-4 gap-3 pointer-events-none">
              <div className="max-w-xl w-full nfs-chamfer nfs-carbon-bg border border-white/18 border-l-4 border-l-amber-400 px-5 py-3.5 text-center shadow-2xl nfs-anim-stamp">
                <div className="text-[11px] font-mono-tabular uppercase tracking-widest text-amber-400 font-bold">
                  STARTING GRID FLYOVER
                </div>
                <div className="font-display italic uppercase text-2xl sm:text-3xl font-bold text-white tracking-wide mt-0.5">
                  {telemetry.introLabel}
                </div>
                {telemetry.introSubLabel && (
                  <p className="text-xs sm:text-sm text-slate-200 mt-1">{telemetry.introSubLabel}</p>
                )}
              </div>
              {onSkipIntro && (
                <button
                  type="button"
                  onClick={onSkipIntro}
                  className="pointer-events-auto px-4 py-1.5 nfs-chamfer-sm bg-amber-400 hover:bg-amber-300 text-black font-display uppercase tracking-wider font-bold text-xs flex items-center gap-1.5 shadow-lg transition-colors cursor-pointer nfs-anim-slide-up"
                >
                  <FastForward className="w-3.5 h-3.5" />
                  <span>Skip Intro [Space]</span>
                </button>
              )}
            </div>
          )}

          {telemetry.cinematicPhase === 'outro' && (
            <div className="fixed top-20 inset-x-0 z-20 flex justify-center px-4 pointer-events-none">
              <div
                className={`px-7 py-3 nfs-chamfer nfs-carbon-bg border border-white/20 border-l-4 shadow-2xl nfs-anim-stamp text-center ${
                  telemetry.outroOutcome === 'win'
                    ? 'border-l-amber-400'
                    : telemetry.outroOutcome === 'busted'
                      ? 'border-l-red-500'
                      : 'border-l-slate-400'
                }`}
              >
                <div
                  className={`font-display italic uppercase text-3xl sm:text-4xl font-black tracking-wider ${
                    telemetry.outroOutcome === 'win'
                      ? 'text-amber-400'
                      : telemetry.outroOutcome === 'busted'
                        ? 'text-red-500'
                        : 'text-white'
                  }`}
                >
                  {telemetry.outroOutcome === 'win'
                    ? 'VICTORY'
                    : telemetry.outroOutcome === 'busted'
                      ? 'BUSTED BY RPD'
                      : 'EVENT COMPLETE'}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Top Row (Hidden cleanly during cinema intro/outro for dramatic full-bleed 3D shots) */}
      {telemetry.cinematicPhase !== 'intro' && telemetry.cinematicPhase !== 'outro' && (
      <div className="relative flex items-start justify-between p-4 sm:p-5 gap-4">
        {/* Top-Left: Radar Minimap & Telemetry Block */}
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center shrink-0">
            <div className="w-32 h-32 nfs-chamfer nfs-carbon-bg border border-white/18 border-t-2 border-t-amber-400 p-1">
              <svg viewBox="0 0 128 128" className="w-full h-full">
                {minimapData.pathD && (
                  <path
                    d={minimapData.pathD}
                    fill="none"
                    stroke="#475569"
                    strokeWidth="5"
                    strokeLinejoin="round"
                  />
                )}
                {minimapData.shortcutDs.map((sd, idx) => (
                  <path
                    key={`sc-${idx}`}
                    d={sd}
                    fill="none"
                    stroke="#34D399"
                    strokeWidth="3.0"
                    strokeDasharray="3 2"
                    strokeLinecap="round"
                  />
                ))}
                {minimapData.shortcutEntries.map((pt, idx) => (
                  <polygon
                    key={`sce-${idx}`}
                    points={`${pt.x},${pt.y - 4.2} ${pt.x + 4.2},${pt.y} ${pt.x},${pt.y + 4.2} ${pt.x - 4.2},${pt.y}`}
                    fill="#34D399"
                    stroke="#062019"
                    strokeWidth="1.2"
                  />
                ))}
                {telemetry.minimapBlips.map((b, idx) => {
                  const pt = minimapData.toMap(b.x, b.z);
                  if (b.type === 'cooldown') {
                    return <circle key={`cd-${idx}`} cx={pt.x} cy={pt.y} r="3.5" fill="#10B981" opacity="0.9" />;
                  }
                  if (b.type === 'breaker') {
                    return <rect key={`pb-${idx}`} x={pt.x - 2.2} y={pt.y - 2.2} width="4.4" height="4.4" fill="#F59E0B" />;
                  }
                  if (b.type === 'rival') {
                    return <circle key={`rv-${idx}`} cx={pt.x} cy={pt.y} r="3.2" fill="#E2E8F0" />;
                  }
                  if (b.type === 'rhino') {
                    return <rect key={`rh-${idx}`} x={pt.x - 3} y={pt.y - 3} width="6" height="6" fill="#EF4444" stroke="#F8FAFC" strokeWidth="1" />;
                  }
                  if (b.type === 'cop') {
                    return <circle key={`cp-${idx}`} cx={pt.x} cy={pt.y} r="3.4" fill="#EF4444" stroke="#3B82F6" strokeWidth="1.5" />;
                  }
                  return (
                    <polygon
                      key={`pl-${idx}`}
                      points={`${pt.x},${pt.y - 6} ${pt.x + 4.5},${pt.y + 4.5} ${pt.x},${pt.y + 2} ${pt.x - 4.5},${pt.y + 4.5}`}
                      fill="#F59E0B"
                      stroke="#FFFFFF"
                      strokeWidth="1.2"
                      strokeLinejoin="round"
                      transform={`rotate(${-((b.heading ?? 0) * 180) / Math.PI} ${pt.x} ${pt.y})`}
                    />
                  );
                })}
              </svg>
            </div>
            <div className="mt-1 px-1.5 py-0.5 nfs-carbon-bg border border-white/12 text-[9px] font-mono-tabular uppercase tracking-wider text-slate-300 text-center">
              <span className="text-emerald-400 font-bold">GRN</span> SHORTCUT ·{' '}
              <span className="text-amber-400 font-bold">SQ</span> BREAKER
            </div>
          </div>

          <div className="nfs-chamfer nfs-carbon-bg border border-white/15 border-l-4 border-l-amber-400 px-4 py-2.5 space-y-1 max-w-[300px]">
            {telemetry.activeMissionTitle && (
              <div className="border-b border-white/12 pb-1.5 mb-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-display font-bold uppercase tracking-wider text-amber-400 truncate">
                    {telemetry.activeMissionTitle}
                  </div>
                  {telemetry.activeMissionModeTag && (
                    <span className="px-1.5 py-0.5 bg-amber-400/20 text-amber-300 text-[9px] font-mono-tabular font-bold uppercase shrink-0">
                      {telemetry.activeMissionModeTag}
                    </span>
                  )}
                </div>
                {telemetry.missionChecklist.length > 0 ? (
                  <div className="space-y-0.5">
                    {telemetry.missionChecklist.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 text-[10px] font-mono-tabular">
                        <span className={`flex items-center gap-1 truncate ${item.done ? 'text-emerald-300' : 'text-slate-200'}`}>
                          {item.done ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                          ) : (
                            <Circle className="w-3 h-3 text-slate-500 shrink-0" />
                          )}
                          <span className="truncate">{item.label}</span>
                        </span>
                        <span className={`font-bold shrink-0 ${item.done ? 'text-emerald-400' : 'text-amber-300'}`}>
                          {item.current}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  telemetry.activeMissionObjective && (
                    <div className="text-[11px] font-mono-tabular text-slate-200 truncate">
                      {telemetry.activeMissionObjective}
                    </div>
                  )
                )}
              </div>
            )}
            {mode === 'tollbooth' ? (
              <>
                <div className="flex items-baseline gap-4">
                  <div>
                    <div className="text-[10px] font-display uppercase tracking-wider text-slate-400">TOLL TIME</div>
                    <div
                      className={`font-display text-2xl font-bold font-mono-tabular leading-none ${
                        telemetry.tollboothTimeLeftMs < 8000 ? 'text-red-400' : 'text-amber-400'
                      }`}
                    >
                      {(telemetry.tollboothTimeLeftMs / 1000).toFixed(1)}s
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-display uppercase tracking-wider text-slate-400">GATES</div>
                    <div className="font-display text-2xl font-bold text-white tabular-nums leading-none">
                      {telemetry.tollboothCheckpoint}
                      <span className="text-sm text-slate-400">/{telemetry.tollboothTotal}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-display uppercase tracking-wider text-slate-400">LAP</div>
                    <div className="font-display text-2xl font-bold text-slate-200 tabular-nums leading-none">
                      {telemetry.lap}
                      <span className="text-sm text-slate-400">/{telemetry.totalLaps}</span>
                    </div>
                  </div>
                </div>
                <div className="text-xs font-mono-tabular text-slate-300 pt-0.5">
                  Elapsed {formatTimeMs(telemetry.totalRaceTimeMs)} · Bounty {formatCurrency(telemetry.sessionBounty)}
                </div>
              </>
            ) : mode === 'speedtrap' ? (
              <>
                <div className="flex items-baseline gap-4">
                  <div>
                    <div className="text-[10px] font-display uppercase tracking-wider text-slate-400">RADAR TOTAL</div>
                    <div className="font-display text-2xl font-bold text-cyan-300 font-mono-tabular leading-none">
                      {telemetry.speedTrapTotalKmh}
                      <span className="text-xs text-slate-400 ml-1">km/h</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-display uppercase tracking-wider text-slate-400">LEADER</div>
                    <div
                      className={`font-display text-xl font-bold font-mono-tabular leading-none ${
                        telemetry.speedTrapTotalKmh >= telemetry.speedTrapLeaderKmh
                          ? 'text-emerald-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {telemetry.speedTrapLeaderKmh}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-display uppercase tracking-wider text-slate-400">CAMERAS</div>
                    <div className="font-display text-xl font-bold text-white tabular-nums leading-none">
                      {telemetry.speedTrapHits}
                    </div>
                  </div>
                </div>
                <div className="text-xs font-mono-tabular text-slate-300 pt-0.5 flex items-center gap-2">
                  <span>
                    Pos {telemetry.position}/{telemetry.activeRacers}
                  </span>
                  {telemetry.speedTrapTargetKmh > 0 && (
                    <span className="text-amber-400">· Target {telemetry.speedTrapTargetKmh} km/h</span>
                  )}
                </div>
              </>
            ) : mode !== 'pursuit' && mode !== 'freeroam' ? (
              <>
                <div className="flex items-baseline gap-4">
                  <div>
                    <div className="text-[10px] font-display uppercase tracking-wider text-slate-400">POS</div>
                    <div className="font-display text-2xl font-bold text-amber-400 tabular-nums leading-none">
                      {telemetry.position}
                      <span className="text-sm text-slate-400">/{telemetry.activeRacers}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-display uppercase tracking-wider text-slate-400">
                      {mode === 'sprint' ? 'SPRINT' : mode === 'knockout' ? 'KNOCKOUT' : 'LAP'}
                    </div>
                    <div className="font-display text-2xl font-bold text-white tabular-nums leading-none">
                      {telemetry.lap}
                      <span className="text-sm text-slate-400">/{telemetry.totalLaps}</span>
                    </div>
                  </div>
                  {telemetry.activeRacers > 1 && (
                    <div>
                      <div className="text-[10px] font-display uppercase tracking-wider text-slate-400">GAP</div>
                      <div
                        className={`font-mono-tabular text-sm font-bold leading-none ${
                          telemetry.gapMeters >= 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {telemetry.gapMeters >= 0 ? `+${telemetry.gapMeters}m` : `${telemetry.gapMeters}m`}
                      </div>
                    </div>
                  )}
                </div>
                <div className="text-xs font-mono-tabular text-slate-300 pt-0.5 flex items-center gap-2">
                  <span>
                    Lap {formatTimeMs(telemetry.lapTimeMs)}
                    {telemetry.bestLapMs > 0 && (
                      <span className="text-amber-400"> · Best {formatTimeMs(telemetry.bestLapMs)}</span>
                    )}
                  </span>
                  {mode === 'knockout' &&
                    telemetry.position === telemetry.activeRacers &&
                    telemetry.activeRacers > 1 && (
                      <span className="px-1.5 py-0.5 nfs-chamfer-sm bg-red-500/25 border border-red-500/60 text-red-300 text-[10px] font-display font-bold uppercase tracking-wider">
                        AT RISK
                      </span>
                    )}
                </div>
              </>
            ) : (
              <>
                <div className="text-[10px] font-display uppercase tracking-wider text-slate-400">
                  {mode === 'freeroam' ? 'FREE ROAM SESSION' : 'PURSUIT DURATION'}
                </div>
                <div className="font-display text-2xl font-bold text-white font-mono-tabular leading-none">
                  {formatTimeMs(telemetry.totalRaceTimeMs)}
                </div>
                <div className="text-xs font-mono-tabular text-slate-300">
                  Bounty {formatCurrency(telemetry.sessionBounty)} · Near Miss {telemetry.nearMissCount}
                </div>
              </>
            )}
            <div className="text-[10px] font-mono-tabular text-slate-400 pt-0.5 flex flex-wrap items-center gap-x-2">
              <span className="uppercase">{ENVIRONMENTS.find((e) => e.id === telemetry.environment)?.label ?? telemetry.environment}</span>
              <span className={musicMuted || muted ? 'text-slate-500 line-through' : 'text-amber-300/90'}>
                · {telemetry.musicTrackName}
              </span>
              {telemetry.shortcutsTaken > 0 && (
                <span className="text-emerald-400 font-bold">· SHORTCUTS {telemetry.shortcutsTaken}</span>
              )}
              {telemetry.handlingMode && (
                <span className="text-cyan-300/90">· {HANDLING_PRESETS[telemetry.handlingMode].label.toUpperCase()}</span>
              )}
              {telemetry.gamepadConnected && (
                <span className="inline-flex items-center gap-1 text-emerald-300 font-bold">
                  · <Gamepad2 className="w-3 h-3 inline" /> PAD
                </span>
              )}
              {telemetry.weatherState && (
                <span className="inline-flex items-center gap-1 text-sky-300">
                  ·{' '}
                  {telemetry.weatherState === 'rain' ? (
                    <CloudRain className="w-3 h-3 inline" />
                  ) : telemetry.weatherState === 'fog' ? (
                    <CloudFog className="w-3 h-3 inline" />
                  ) : (
                    <Sun className="w-3 h-3 inline" />
                  )}{' '}
                  {telemetry.weatherState.toUpperCase()}
                  {(telemetry.roadWetness ?? 0) > 0.12
                    ? ` ${Math.round((telemetry.roadWetness ?? 0) * 100)}% WET`
                    : ''}
                </span>
              )}
              {(telemetry.damagePercent ?? 0) > 0 && (
                <span
                  className={`inline-flex items-center gap-1 font-bold ${
                    (telemetry.damagePercent ?? 0) >= 60 ? 'text-red-400' : 'text-amber-300'
                  }`}
                >
                  · <Wrench className="w-3 h-3 inline" /> DMG {telemetry.damagePercent}%
                  {(telemetry.detachedPartsCount ?? 0) > 0 ? ` (${telemetry.detachedPartsCount})` : ''}
                </span>
              )}
            </div>
          </div>
          {showDebug && telemetry.devTelemetry && (
            <div className="nfs-chamfer nfs-carbon-bg border border-cyan-400/45 border-l-4 border-l-cyan-400 px-3.5 py-2.5 w-[310px] space-y-2 text-[10px] font-mono-tabular">
              <div className="flex items-center justify-between border-b border-white/10 pb-1">
                <span className="font-display font-bold uppercase tracking-wider text-cyan-300 text-[11px]">
                  DEV TELEMETRY [F3 / `]
                </span>
                <span className="text-amber-300 font-bold uppercase">
                  {SURFACE_MODIFIERS[telemetry.devTelemetry.surface].label}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-slate-200">
                <div>
                  FPS <span className="text-white font-bold">{telemetry.devTelemetry.fps}</span>
                </div>
                <div>
                  FRM <span className="text-white font-bold">{telemetry.devTelemetry.frameMs.toFixed(1)}ms</span>
                </div>
                <div>
                  PHY <span className="text-emerald-300 font-bold">{telemetry.devTelemetry.physicsMs.toFixed(2)}ms</span>
                </div>
                <div>
                  DRAW <span className="text-white font-bold">{telemetry.devTelemetry.drawCalls}</span>
                </div>
                <div>
                  ENT <span className="text-white font-bold">{telemetry.devTelemetry.activeEntities}</span>
                </div>
                <div>
                  STEP <span className="text-cyan-300 font-bold">{telemetry.devTelemetry.substeps}x120Hz</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-white/10">
                {telemetry.devTelemetry.wheels.map((w) => {
                  const slipPct = Math.round(w.slipRatio * 100);
                  const compPct = Math.round(w.compression * 100);
                  return (
                    <div key={w.id} className="bg-[#0B0E14] border border-white/10 px-2 py-1 space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-amber-300">{w.id}</span>
                        <span className="text-slate-300">{Math.round(w.loadN)}N</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-400">
                        <span>SLP {slipPct}%</span>
                        <span>ANG {w.slipAngleDeg.toFixed(0)}°</span>
                      </div>
                      <div className="h-1 bg-white/10 overflow-hidden">
                        <div
                          className={`h-full ${compPct > 80 ? 'bg-red-400' : 'bg-cyan-400'}`}
                          style={{ width: `${compPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {aiDebugOpen && telemetry.aiDebugEntries && telemetry.aiDebugEntries.length > 0 && (
            <div className="nfs-chamfer nfs-carbon-bg border border-amber-400/45 border-l-4 border-l-amber-400 px-3.5 py-2.5 w-[330px] space-y-1.5 text-[10px] font-mono-tabular">
              <div className="flex items-center justify-between border-b border-white/10 pb-1">
                <span className="font-display font-bold uppercase tracking-wider text-amber-300 text-[11px]">
                  AI RACER TELEMETRY [{formatKeyCode(keys.toggleAiDebug.primary)}]
                </span>
                <span className="text-slate-400">LINE + TARGET KM/H</span>
              </div>
              <div className="space-y-1">
                {telemetry.aiDebugEntries.map((ai, i) => {
                  const trait = AI_PERSONALITY_TRAITS[ai.personality];
                  return (
                    <div key={`${ai.name}-${i}`} className="bg-[#0B0E14] border border-white/10 px-2 py-1 space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-white truncate">
                          {ai.name}{' '}
                          <span className="text-[9px] text-cyan-300">[{trait.shortTag}]</span>
                        </span>
                        <span
                          className={`px-1 py-0.2 text-[9px] font-bold uppercase ${
                            ai.action === 'NOS' || ai.action === 'DRAFT'
                              ? 'bg-cyan-500/20 text-cyan-300'
                              : ai.action === 'PASS' || ai.action === 'DEFEND'
                                ? 'bg-amber-400/20 text-amber-300'
                                : ai.action === 'BRAKE' || ai.action === 'DODGE'
                                  ? 'bg-red-500/20 text-red-300'
                                  : 'bg-white/10 text-slate-300'
                          }`}
                        >
                          {ai.action}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-300">
                        <span>
                          {ai.speedKmh}/{ai.targetSpeedKmh} <span className="text-slate-500">km/h</span>
                        </span>
                        <span>NOS {ai.nitrous}%</span>
                        <span className="text-emerald-300">x{ai.adaptiveMult.toFixed(2)}</span>
                        <span className={ai.gapMeters >= 0 ? 'text-amber-300' : 'text-slate-400'}>
                          {ai.gapMeters >= 0 ? `+${ai.gapMeters}m` : `${ai.gapMeters}m`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Top-Right: Pursuit Status, Police Scanner & Utility Buttons */}
        <div className="flex items-start gap-2.5">
          <div className="flex flex-col items-end gap-2">
            {telemetry.pursuitState !== 'none' && (
              <div
                className={`nfs-chamfer nfs-carbon-bg border border-white/15 border-l-4 px-4 py-2.5 min-w-[224px] space-y-1.5 ${
                  telemetry.pursuitState === 'cooldown' || telemetry.pursuitState === 'evaded'
                    ? 'border-l-emerald-400'
                    : 'border-l-red-500'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`font-display text-xs font-bold tracking-wider uppercase flex items-center gap-1.5 ${
                      telemetry.pursuitState === 'cooldown'
                        ? 'text-emerald-400'
                        : telemetry.pursuitState === 'evaded'
                          ? 'text-emerald-300'
                          : 'text-red-400'
                    }`}
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    {telemetry.pursuitState === 'cooldown'
                      ? 'COOLDOWN'
                      : telemetry.pursuitState === 'evaded'
                        ? 'EVADED'
                        : 'PURSUIT ACTIVE'}
                  </span>
                  <span className="text-xs font-mono-tabular font-bold text-amber-400 flex items-center gap-1">
                    <Flame className="w-3.5 h-3.5" />
                    HEAT {telemetry.heatLevel}
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-1">
                  {[1, 2, 3, 4, 5].map((lvl) => (
                    <div
                      key={lvl}
                      className={`h-1.5 ${
                        lvl <= telemetry.heatLevel
                          ? lvl >= 4
                            ? 'bg-red-500'
                            : 'bg-amber-400'
                          : 'bg-white/12'
                      }`}
                    />
                  ))}
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono-tabular uppercase">
                  <span
                    className={
                      telemetry.inCooldownZone
                        ? 'text-emerald-300 font-bold'
                        : telemetry.policeLosActive
                          ? 'text-red-300 font-bold'
                          : 'text-amber-300'
                    }
                  >
                    {telemetry.inCooldownZone
                      ? 'HIDING BAY COVER'
                      : telemetry.policeLosActive
                        ? 'VISUAL LOS LOCKED'
                        : 'LOS BROKEN'}
                  </span>
                  {telemetry.helicopterActive && (
                    <span className={telemetry.inCooldownZone ? 'text-slate-400' : 'text-amber-300 font-bold'}>
                      {telemetry.inCooldownZone ? 'CHOPPER MASKED' : 'CHOPPER 2'}
                    </span>
                  )}
                </div>

                {telemetry.pursuitState === 'cooldown' ? (
                  <div className="space-y-0.5">
                    <div className="flex justify-between text-[11px] text-emerald-300 font-mono-tabular uppercase">
                      <span>Evading</span>
                      <span>{Math.round(telemetry.evadeProgress)}%</span>
                    </div>
                    <div className="h-1.5 bg-white/12 overflow-hidden">
                      <div className="h-full bg-emerald-400" style={{ width: `${telemetry.evadeProgress}%` }} />
                    </div>
                  </div>
                ) : (
                  telemetry.bustProgress > 2 && (
                    <div className="space-y-0.5">
                      <div className="flex justify-between text-[11px] text-red-400 font-mono-tabular font-bold uppercase">
                        <span>BUSTED WARNING</span>
                        <span>{Math.round(telemetry.bustProgress)}%</span>
                      </div>
                      <div className="h-1.5 bg-white/12 overflow-hidden">
                        <div className="h-full bg-red-500" style={{ width: `${telemetry.bustProgress}%` }} />
                      </div>
                    </div>
                  )
                )}

                <div className="flex items-center justify-between text-xs font-mono-tabular text-slate-300">
                  <span>Bounty {formatCurrency(telemetry.sessionBounty)}</span>
                  <span>Cops {telemetry.activeCops} · KO {telemetry.copsTakedowns}</span>
                </div>
              </div>
            )}

            {telemetry.radioDispatch && (
              <div className="max-w-[295px] nfs-chamfer-sm nfs-carbon-bg border border-white/15 border-l-4 border-l-red-500 px-3.5 py-2 flex items-start gap-2 text-xs text-slate-200">
                <Radio className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                <span className="font-mono-tabular text-[11px] leading-snug">{telemetry.radioDispatch}</span>
              </div>
            )}
          </div>

          <div className="pointer-events-auto flex items-center gap-1.5">
            {mode === 'freeroam' && onFinishFreeroam && (
              <button
                type="button"
                onClick={onFinishFreeroam}
                title="Bank Bounty & Finish Run"
                className="px-3 py-2 nfs-chamfer-sm bg-amber-400 hover:bg-amber-300 text-black font-display font-bold uppercase tracking-wider text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Flag className="w-3.5 h-3.5" />
                <span>Bank Run</span>
              </button>
            )}
            {onRewind && (
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onRewind();
                }}
                disabled={
                  (!telemetry.rewindUnlimited && (telemetry.rewindsLeft ?? 0) <= 0) ||
                  (telemetry.rewindBufferSec ?? 0) < 0.25
                }
                title={`Rewind 2.75s (${formatKeyCode(keys.rewind.primary)}) · ${
                  telemetry.rewindUnlimited ? 'Unlimited' : `${telemetry.rewindsLeft ?? 0} left`
                }`}
                aria-label="Rewind"
                className="px-2.5 py-2 nfs-chamfer-sm nfs-carbon-bg border border-white/18 text-slate-200 hover:text-cyan-300 hover:border-cyan-400/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-mono-tabular font-bold"
              >
                <History className="w-3.5 h-3.5" />
                <span>{telemetry.rewindUnlimited ? '∞' : telemetry.rewindsLeft ?? 0}</span>
              </button>
            )}
            {onInstantRestart && (
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onInstantRestart();
                }}
                title={`Instant Restart (${formatKeyCode(keys.instantRestart.primary)})`}
                aria-label="Instant Restart"
                className="p-2.5 nfs-chamfer-sm nfs-carbon-bg border border-white/18 text-slate-200 hover:text-amber-400 hover:border-amber-400/60 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            {onToggleGhost && (
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleGhost();
                }}
                title={`Toggle Best Ghost (${formatKeyCode(keys.toggleGhost.primary)})${
                  telemetry.hasBestGhost ? '' : ' — finish a clean run to record'
                }`}
                aria-label="Toggle Best Ghost"
                className={`p-2.5 nfs-chamfer-sm nfs-carbon-bg border transition-colors cursor-pointer ${
                  telemetry.ghostEnabled
                    ? 'border-cyan-400 text-cyan-300'
                    : 'border-white/18 text-slate-300 hover:text-cyan-300 hover:border-cyan-400/60'
                }`}
              >
                <Ghost className="w-4 h-4" />
              </button>
            )}
            {onToggleAiDebug && (
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleAiDebug();
                }}
                title={`AI Racing Line & Telemetry (${formatKeyCode(keys.toggleAiDebug.primary)})`}
                aria-label="Toggle AI Debug"
                className={`p-2.5 nfs-chamfer-sm nfs-carbon-bg border transition-colors cursor-pointer ${
                  aiDebugOpen
                    ? 'border-amber-400 text-amber-300'
                    : 'border-white/18 text-slate-200 hover:text-amber-300 hover:border-amber-400/60'
                }`}
              >
                <Bot className="w-4 h-4" />
              </button>
            )}
            {onToggleTuning && (
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleTuning();
                }}
                title={`Live Physics Tuning (${formatKeyCode(keys.toggleTuning.primary)})`}
                aria-label="Live Physics Tuning"
                className={`p-2.5 nfs-chamfer-sm nfs-carbon-bg border transition-colors cursor-pointer ${
                  tuningOpen
                    ? 'border-amber-400 text-amber-400'
                    : 'border-white/18 text-slate-200 hover:text-amber-400 hover:border-amber-400/60'
                }`}
              >
                <Sliders className="w-4 h-4" />
              </button>
            )}
            {onToggleDebug && (
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleDebug();
                }}
                title={`Dev Telemetry (${formatKeyCode(keys.toggleTelemetry.primary)} / \`)`}
                aria-label="Dev Telemetry Overlay"
                className={`p-2.5 nfs-chamfer-sm nfs-carbon-bg border transition-colors cursor-pointer ${
                  showDebug
                    ? 'border-cyan-400 text-cyan-300'
                    : 'border-white/18 text-slate-200 hover:text-cyan-300 hover:border-cyan-400/60'
                }`}
              >
                <Activity className="w-4 h-4" />
              </button>
            )}
            {onOpenSettings && (
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onOpenSettings();
                }}
                title="Driver & System Settings"
                aria-label="Driver & System Settings"
                className="p-2.5 nfs-chamfer-sm nfs-carbon-bg border border-white/18 text-slate-200 hover:text-amber-400 hover:border-amber-400/60 transition-colors cursor-pointer"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onCycleCamera}
              title={`Switch Camera (${formatKeyCode(keys.cycleCamera.primary)})`}
              className="p-2.5 nfs-chamfer-sm nfs-carbon-bg border border-white/18 text-slate-200 hover:text-amber-400 hover:border-amber-400/60 transition-colors cursor-pointer"
            >
              <Camera className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onSkipTrack}
              title={`Next EA Trax (${formatKeyCode(keys.nextMusicTrack.primary)})`}
              aria-label="Next EA Trax"
              className="p-2.5 nfs-chamfer-sm nfs-carbon-bg border border-white/18 text-slate-200 hover:text-amber-400 hover:border-amber-400/60 transition-colors cursor-pointer"
            >
              <SkipForward className="w-4 h-4" />
            </button>
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
            <button
              type="button"
              onClick={onToggleMute}
              title={muted ? 'Unmute All' : 'Mute All'}
              className="p-2.5 nfs-chamfer-sm nfs-carbon-bg border border-white/18 text-slate-200 hover:text-amber-400 hover:border-amber-400/60 transition-colors cursor-pointer"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onPause}
              title="Pause (Esc)"
              className="p-2.5 nfs-chamfer-sm nfs-carbon-bg border border-white/18 text-slate-200 hover:text-amber-400 hover:border-amber-400/60 transition-colors cursor-pointer"
            >
              <Pause className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Center-Top Countdown & Callouts */}
      {telemetry.cinematicPhase !== 'intro' && telemetry.cinematicPhase !== 'outro' && (
      <div className="fixed top-20 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none">
        {telemetry.countdown > 0 && (
          <div
            key={`cd-${telemetry.countdown}`}
            className="font-display italic text-7xl font-bold text-amber-400 drop-shadow-[0_4px_16px_rgba(0,0,0,0.95)] tabular-nums nfs-anim-stamp"
          >
            {telemetry.countdown}
          </div>
        )}
        {telemetry.wrongWay && (
          <div className="px-5 py-1.5 nfs-chamfer-sm bg-red-600/95 border-l-4 border-white text-white font-display font-bold uppercase tracking-widest text-sm nfs-anim-stamp">
            WRONG WAY — TURN AROUND
          </div>
        )}
        {telemetry.spikedTimer > 0 && (
          <div className="px-5 py-1.5 nfs-chamfer-sm bg-red-700/95 border border-red-300 border-l-4 text-white font-display font-bold uppercase tracking-wider text-sm font-mono-tabular">
            SPIKED TIRES · {telemetry.spikedTimer.toFixed(1)}S
          </div>
        )}
        {telemetry.callout && (
          <div
            key={`co-${telemetry.callout.id}`}
            className={`px-4 py-1.5 nfs-chamfer-sm nfs-carbon-bg border border-white/15 border-l-4 font-display font-bold uppercase tracking-wider text-sm nfs-anim-slide-up ${
              telemetry.callout.tone === 'red'
                ? 'border-l-red-500 text-red-400'
                : telemetry.callout.tone === 'cyan'
                  ? 'border-l-cyan-400 text-cyan-300'
                  : telemetry.callout.tone === 'emerald'
                    ? 'border-l-emerald-400 text-emerald-300'
                    : 'border-l-amber-400 text-amber-300'
            }`}
          >
            {telemetry.callout.text}
          </div>
        )}
        {telemetry.upcomingShortcut && (
          <div className="px-4 py-1 nfs-chamfer-sm nfs-carbon-bg border border-emerald-400/50 border-l-4 border-l-emerald-400 flex items-center gap-2.5 text-xs font-display font-bold uppercase tracking-wider text-emerald-300">
            <span className="text-amber-300">
              {telemetry.upcomingShortcut.distanceM === 0
                ? telemetry.upcomingShortcut.side === 'left'
                  ? '◀ TURN LEFT NOW · SHORTCUT'
                  : 'SHORTCUT · TURN RIGHT NOW ▶'
                : telemetry.upcomingShortcut.side === 'left'
                  ? `◀ KEEP LEFT · SHORTCUT IN ${telemetry.upcomingShortcut.distanceM}M`
                  : `SHORTCUT IN ${telemetry.upcomingShortcut.distanceM}M · KEEP RIGHT ▶`}
            </span>
            <span className="text-white/80 font-mono-tabular text-[11px]">{telemetry.upcomingShortcut.label}</span>
          </div>
        )}
      </div>
      )}

      {/* Bottom Row */}
      {telemetry.cinematicPhase !== 'intro' && telemetry.cinematicPhase !== 'outro' && (
      <div className="fixed bottom-4 left-4 right-4 flex items-end justify-between gap-4">
        <div className="space-y-2">
          {(telemetry.isDrifting || telemetry.isSlipstreaming || telemetry.nearMissCombo > 1) && (
            <div className="flex flex-wrap items-center gap-2">
              {telemetry.isDrifting && (
                <div className="inline-block px-3 py-1 nfs-chamfer-sm nfs-carbon-bg border border-white/15 border-l-4 border-l-amber-400 font-display uppercase tracking-wider text-xs font-bold text-amber-400 font-mono-tabular">
                  POWER SLIDE
                  {telemetry.driftHoldSec && telemetry.driftHoldSec > 0 ? ` ${telemetry.driftHoldSec.toFixed(1)}S` : ''}
                  {telemetry.driftComboScore && telemetry.driftComboScore >= 150
                    ? ` · +$${telemetry.driftComboScore.toLocaleString()}`
                    : ' · +NOS'}
                </div>
              )}
              {telemetry.isSlipstreaming && (
                <div className="inline-block px-3 py-1 nfs-chamfer-sm nfs-carbon-bg border border-white/15 border-l-4 border-l-cyan-400 font-display uppercase tracking-wider text-xs font-bold text-cyan-300">
                  SLIPSTREAM · +NOS
                </div>
              )}
              {telemetry.nearMissCombo > 1 && (
                <div className="inline-block px-3 py-1 nfs-chamfer-sm nfs-carbon-bg border border-white/15 border-l-4 border-l-emerald-400 font-display uppercase tracking-wider text-xs font-bold text-emerald-300">
                  TRAFFIC CHAIN x{telemetry.nearMissCombo}
                </div>
              )}
            </div>
          )}
          <div className="pointer-events-auto hidden md:flex items-center flex-wrap gap-2 px-3.5 py-2 nfs-chamfer-sm nfs-carbon-bg border border-white/15 border-l-2 border-l-amber-400 text-[11px] font-mono-tabular uppercase tracking-wide text-slate-300">
            <span>
              <strong className="text-white">
                {formatKeyCode(keys.throttle.primary)}/{formatKeyCode(keys.left.primary)}/{formatKeyCode(keys.brake.primary)}/{formatKeyCode(keys.right.primary)}
              </strong>{' '}
              Drive
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-cyan-300">
                {formatKeyCode(keys.lookLeft.primary)}/{formatKeyCode(keys.lookRight.primary)}
              </strong>{' '}
              Look
            </span>
            <span aria-hidden="true">·</span>
            <span><strong className="text-white">{formatKeyCode(keys.handbrake.primary)}</strong> Drift</span>
            <span aria-hidden="true">·</span>
            <span><strong className="text-cyan-400">{formatKeyCode(keys.nitrous.primary)}</strong> NOS</span>
            <span aria-hidden="true">·</span>
            <span><strong className="text-amber-400">{formatKeyCode(keys.speedbreaker.primary)}</strong> Breaker</span>
            <span aria-hidden="true">·</span>
            <span><strong className="text-emerald-400">{formatKeyCode(keys.resetToTrack.primary)}</strong> Reset</span>
            <span aria-hidden="true">·</span>
            <span><strong className="text-cyan-300">{formatKeyCode(keys.rewind.primary)}</strong> Rewind</span>
            <span aria-hidden="true">·</span>
            <span><strong className="text-amber-300">{formatKeyCode(keys.instantRestart.primary)}</strong> Restart</span>
            <span aria-hidden="true">·</span>
            <span><strong className="text-white">{formatKeyCode(keys.cycleCamera.primary)}</strong> Cam</span>
            <span aria-hidden="true">·</span>
            <span><strong className="text-amber-300">{formatKeyCode(keys.toggleTuning.primary)}</strong> Tune</span>
            <span aria-hidden="true">·</span>
            <span><strong className="text-cyan-300">{formatKeyCode(keys.toggleTelemetry.primary)}</strong> Telemetry</span>
            <span aria-hidden="true">·</span>
            <span><strong className="text-amber-300">{formatKeyCode(keys.toggleAiDebug.primary)}</strong> AI</span>
            <span aria-hidden="true">·</span>
            <span><strong className="text-cyan-300">{formatKeyCode(keys.toggleGhost.primary)}</strong> Ghost</span>
            {onToggleAeLook && (
              <>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onToggleAeLook();
                  }}
                  title="Switch between A/E Look (Arrows Drive) and Q/E Look (WASD Drive)"
                  className={`px-2 py-0.5 nfs-chamfer-sm border text-[10px] font-bold transition-colors cursor-pointer ${
                    aeLookEnabled
                      ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200 hover:bg-cyan-500/35'
                      : 'bg-white/10 border-white/25 text-slate-200 hover:bg-white/20'
                  }`}
                >
                  {aeLookEnabled ? 'LOOK: A/E' : 'LOOK: Q/E'}
                </button>
              </>
            )}
          </div>

          {/* Mobile / Optional On-Screen Touch Controls */}
          <div
            className={`pointer-events-auto items-center gap-2 ${
              touchControlsMode === 'always'
                ? 'flex'
                : touchControlsMode === 'off'
                  ? 'hidden'
                  : 'flex md:hidden'
            }`}
          >
            <button
              type="button"
              onPointerDown={() => onTouchInput('left', true)}
              onPointerUp={() => onTouchInput('left', false)}
              onPointerLeave={() => onTouchInput('left', false)}
              className="w-14 h-14 nfs-chamfer-sm nfs-carbon-bg border border-white/25 text-white font-bold text-lg active:bg-amber-400 active:text-black"
            >
              ◀
            </button>
            <button
              type="button"
              onPointerDown={() => onTouchInput('right', true)}
              onPointerUp={() => onTouchInput('right', false)}
              onPointerLeave={() => onTouchInput('right', false)}
              className="w-14 h-14 nfs-chamfer-sm nfs-carbon-bg border border-white/25 text-white font-bold text-lg active:bg-amber-400 active:text-black"
            >
              ▶
            </button>
            <button
              type="button"
              onPointerDown={() => onTouchInput('nitrous', true)}
              onPointerUp={() => onTouchInput('nitrous', false)}
              onPointerLeave={() => onTouchInput('nitrous', false)}
              className="px-3 h-14 nfs-chamfer-sm bg-cyan-500/25 border border-cyan-400 text-cyan-200 font-display font-bold text-xs"
            >
              NOS
            </button>
            <button
              type="button"
              onPointerDown={() => onTouchInput('brake', true)}
              onPointerUp={() => onTouchInput('brake', false)}
              onPointerLeave={() => onTouchInput('brake', false)}
              className="px-3 h-14 nfs-chamfer-sm bg-red-500/25 border border-red-400 text-red-200 font-display font-bold text-xs"
            >
              BRK
            </button>
            <button
              type="button"
              onPointerDown={() => onTouchInput('throttle', true)}
              onPointerUp={() => onTouchInput('throttle', false)}
              onPointerLeave={() => onTouchInput('throttle', false)}
              className="px-4 h-14 nfs-chamfer-sm bg-amber-500/30 border border-amber-400 text-amber-200 font-display font-bold text-xs"
            >
              GAS
            </button>
          </div>
        </div>

        {/* Right: Radial Tachometer & Speedometer */}
        <div
          className={`nfs-chamfer nfs-carbon-bg p-3 w-48 sm:w-52 border transition-colors ${
            telemetry.rpm > 0.88
              ? 'border-red-500 border-t-2 border-t-red-500 shadow-[0_0_24px_rgba(239,68,68,0.45)]'
              : 'border-white/15 border-t-2 border-t-amber-400/80'
          }`}
        >
          <div className="relative w-full aspect-[1.15/1]">
            <svg viewBox="0 0 200 175" className="w-full h-full">
              <path
                d="M 35 140 A 78 78 0 1 1 165 140"
                fill="none"
                stroke="#1E293B"
                strokeWidth="12"
                strokeLinecap="butt"
              />
              <path
                d="M 155 48 A 78 78 0 0 1 165 140"
                fill="none"
                stroke="#EF4444"
                strokeWidth="12"
                strokeLinecap="butt"
                opacity="0.7"
              />
              <path
                d="M 35 140 A 78 78 0 1 1 165 140"
                fill="none"
                stroke={telemetry.rpm > 0.85 ? '#EF4444' : '#F59E0B'}
                strokeWidth="12"
                strokeLinecap="butt"
                strokeDasharray={`${telemetry.rpm * 335} 400`}
              />
              {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((tick) => {
                const deg = -215 + (tick / 8) * 250;
                const rad = (deg * Math.PI) / 180;
                const x1 = 100 + Math.cos(rad) * 65;
                const y1 = 100 + Math.sin(rad) * 65;
                const x2 = 100 + Math.cos(rad) * 72;
                const y2 = 100 + Math.sin(rad) * 72;
                const lx = 100 + Math.cos(rad) * 55;
                const ly = 100 + Math.sin(rad) * 55 + 3;
                return (
                  <g key={tick}>
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={tick >= 7 ? '#F87171' : '#94A3B8'}
                      strokeWidth={tick >= 7 ? '2' : '1.4'}
                    />
                    <text
                      x={lx}
                      y={ly}
                      textAnchor="middle"
                      fontSize="8"
                      fontWeight="700"
                      fill={tick >= 7 ? '#FCA5A5' : '#94A3B8'}
                    >
                      {tick}
                    </text>
                  </g>
                );
              })}
              <path
                d="M 22 146 A 92 92 0 0 1 40 38"
                fill="none"
                stroke="#1E293B"
                strokeWidth="6"
                strokeLinecap="butt"
              />
              <path
                d="M 22 146 A 92 92 0 0 1 40 38"
                fill="none"
                stroke="#06B6D4"
                strokeWidth="6"
                strokeLinecap="butt"
                strokeDasharray={`${nosDash} 200`}
              />
              <line
                x1="100"
                y1="100"
                x2={100 + Math.cos(rpmRad) * 64}
                y2={100 + Math.sin(rpmRad) * 64}
                stroke="#F8FAFC"
                strokeWidth="3"
                strokeLinecap="butt"
              />
              <circle cx="100" cy="100" r="5" fill="#F59E0B" />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
              <div className="font-display italic text-3xl font-bold text-white tabular-nums leading-none">
                {telemetry.speedKmh}
              </div>
              <div className="flex items-center gap-2 text-[11px] font-mono-tabular mt-1">
                <span className="text-slate-400">KM/H</span>
                <span className="text-amber-400 font-bold">
                  G{telemetry.gear === -1 ? 'R' : telemetry.gear === 0 ? 'N' : telemetry.gear}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-1 space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono-tabular">
              <span className={telemetry.isNitrousActive ? 'text-cyan-400 font-bold' : 'text-slate-400'}>
                NOS {Math.round(telemetry.nitrous)}%
              </span>
              <span className={telemetry.isSpeedbreakerActive ? 'text-amber-400 font-bold' : 'text-slate-400'}>
                BREAKER {Math.round(telemetry.speedbreaker)}%
              </span>
            </div>
            <div className="h-1.5 bg-white/12 overflow-hidden">
              <div
                className="h-full bg-amber-400 transition-[width] duration-75"
                style={{ width: `${telemetry.speedbreaker}%` }}
              />
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
