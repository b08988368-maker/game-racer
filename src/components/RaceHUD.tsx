import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bot,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Eye,
  EyeOff,
  FastForward,
  Flag,
  Flame,
  Ghost,
  History,
  MoreHorizontal,
  Music,
  Pause,
  Radio,
  RotateCcw,
  Settings,
  ShieldAlert,
  SkipForward,
  Sliders,
  Target,
  Volume2,
  VolumeX,
  Wrench,
} from 'lucide-react';
import { AI_PERSONALITY_TRAITS } from '../config/aiConfig';
import { SURFACE_MODIFIERS } from '../config/physicsConfig';
import {
  ControlBindings,
  formatKeyCode,
  getDefaultControlBindings,
  TouchControlsMode,
} from '../config/settingsConfig';
import { formatCurrency, formatTimeMs } from '../data/gameData';
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
  aeLookEnabled = false,
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
  const [hudMinimal, setHudMinimal] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [opponentsCollapsed, setOpponentsCollapsed] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.code !== 'KeyH') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      setHudMinimal((prev) => !prev);
      setToolsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
      {/* NFS Most Wanted Speedbreaker Precision Slow-Motion Vignette (Lightened Reflex) */}
      {telemetry.isSpeedbreakerActive && (
        <>
          <div
            className="fixed inset-0 pointer-events-none transition-opacity duration-150"
            style={{
              background:
                'radial-gradient(circle at center, rgba(245, 158, 11, 0.02) 55%, rgba(180, 83, 9, 0.14) 100%)',
              boxShadow: 'inset 0 0 42px rgba(245, 158, 11, 0.16)',
            }}
          />
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-20 px-3 py-0.5 nfs-chamfer-sm nfs-carbon-bg border border-amber-400/50 border-l-4 border-l-amber-400 font-mono-tabular text-[10px] font-bold uppercase tracking-widest text-amber-300 pointer-events-none">
            SPEEDBREAKER · PRECISION GRIP
          </div>
        </>
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
            IMPACT CAM · 0.44x SLOW-MO
          </div>
        </>
      )}

      {/* Cinema Widescreen Intro & Outro Letterbox Overlays */}
      {(telemetry.cinematicPhase === 'intro' || telemetry.cinematicPhase === 'outro') && (
        <>
          <div className="fixed top-0 left-0 right-0 h-14 sm:h-16 bg-black/95 border-b border-amber-400/35 nfs-letterbox-top z-20 pointer-events-none" />
          <div className="fixed bottom-0 left-0 right-0 h-16 sm:h-20 bg-black/95 border-t border-amber-400/35 nfs-letterbox-bottom z-20 pointer-events-none" />

          {telemetry.cinematicPhase === 'intro' && (
            <div className="fixed inset-x-0 bottom-20 sm:bottom-24 z-20 flex flex-col items-center px-4 gap-2.5 pointer-events-none">
              <div className="max-w-2xl w-full nfs-chamfer nfs-carbon-bg border border-amber-400/50 border-l-4 border-l-amber-400 px-5 py-4 shadow-2xl nfs-anim-stamp">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/10">
                  <div className="flex items-center gap-2 text-[11px] font-mono-tabular uppercase tracking-widest text-amber-400 font-bold">
                    <span className="inline-block w-2 h-2 bg-amber-400 animate-pulse" />
                    <Target className="w-3.5 h-3.5 text-amber-400" />
                    <span>{telemetry.objectiveBadge}</span>
                  </div>
                  <div className="text-[10px] font-mono-tabular uppercase tracking-widest text-slate-300">
                    {telemetry.introLabel}
                  </div>
                </div>

                <div className="mt-2.5 flex items-start gap-2.5 nfs-anim-slide-up">
                  <Flag className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[10px] font-mono-tabular uppercase tracking-widest text-amber-300/90 font-bold">
                      HOW TO WIN THIS RUN
                    </div>
                    <div className="font-display italic uppercase text-xl sm:text-2xl font-bold text-white tracking-wide leading-tight">
                      {telemetry.objectiveHeadline}
                    </div>
                  </div>
                </div>

                {telemetry.objectiveSteps.length > 0 && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {telemetry.objectiveSteps.map((step, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2 bg-white/5 border border-white/10 px-2.5 py-2 nfs-chamfer-sm nfs-anim-slide-up"
                        style={{ animationDelay: `${110 + idx * 110}ms`, animationFillMode: 'both' }}
                      >
                        <span className="w-5 h-5 shrink-0 bg-amber-400 text-black font-mono-tabular font-bold text-xs flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="text-xs text-slate-100 leading-snug">{step}</span>
                      </div>
                    ))}
                  </div>
                )}

                {telemetry.objectiveFailRule && (
                  <div
                    className="mt-2.5 flex items-center gap-2 bg-red-500/12 border border-red-500/35 border-l-2 border-l-red-400 px-3 py-1.5 text-[11px] font-mono-tabular text-red-200 nfs-anim-slide-up"
                    style={{ animationDelay: '340ms', animationFillMode: 'both' }}
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    <span>{telemetry.objectiveFailRule}</span>
                  </div>
                )}

                <div className="mt-3 pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono-tabular uppercase tracking-wider text-slate-300">
                  <span>
                    [{keys.throttle.secondary ? `${formatKeyCode(keys.throttle.secondary)}/${formatKeyCode(keys.throttle.primary)}` : formatKeyCode(keys.throttle.primary)}] DRIVE · [{formatKeyCode(keys.nitrous.primary)}] NITROUS · [{formatKeyCode(keys.speedbreaker.primary)}] SPEEDBREAKER
                  </span>
                  <span className="text-amber-300 font-bold">HOLD GAS FOR LAUNCH BOOST</span>
                </div>
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
                className={`px-8 py-3.5 nfs-chamfer nfs-carbon-bg border border-white/25 border-l-4 shadow-2xl nfs-anim-stamp text-center ${
                  telemetry.outroOutcome === 'win'
                    ? 'border-l-amber-400'
                    : telemetry.outroOutcome === 'busted'
                      ? 'border-l-red-500'
                      : 'border-l-slate-400'
                }`}
              >
                <div
                  className={`font-display italic uppercase text-3xl sm:text-5xl font-black tracking-wider ${
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
                <div className="text-[11px] font-mono-tabular uppercase tracking-widest text-slate-300 mt-1 font-bold">
                  {telemetry.outroOutcome === 'win'
                    ? 'STREETS OWNED // VICTORY BURNOUT'
                    : telemetry.outroOutcome === 'busted'
                      ? 'CONTAINED BY ROCKPORT PD'
                      : 'PHOTO FINISH // CHECK RESULTS'}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Top Row (Hidden cleanly during cinema intro/outro for dramatic full-bleed 3D shots) */}
      {telemetry.cinematicPhase !== 'intro' && telemetry.cinematicPhase !== 'outro' && (
      <div className="relative flex items-start justify-between p-3 sm:p-4 gap-3">
        <div className="flex items-start gap-2.5">
        {!hudMinimal ? (
        <>
          <div className="w-24 h-24 sm:w-28 sm:h-28 shrink-0 nfs-chamfer nfs-carbon-bg border border-white/18 border-t-2 border-t-amber-400 p-1">
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

          <div className="flex flex-col gap-1.5 max-w-[238px]">
          <div className="nfs-chamfer nfs-carbon-bg border border-white/15 border-l-4 border-l-amber-400 px-3 py-2 space-y-1">
            {telemetry.activeMissionTitle ? (
              <div className="border-b border-white/10 pb-1 space-y-0.5">
                <div className="flex items-center justify-between gap-1.5">
                  <div className="text-[10px] font-display font-bold uppercase tracking-wider text-amber-400 truncate">
                    {telemetry.activeMissionTitle}
                  </div>
                  {telemetry.activeMissionModeTag && (
                    <span className="px-1 py-0.5 bg-amber-400/20 text-amber-300 text-[8px] font-mono-tabular font-bold uppercase shrink-0">
                      {telemetry.activeMissionModeTag}
                    </span>
                  )}
                </div>
                {telemetry.missionChecklist.length > 0 ? (
                  <div className="space-y-0.5">
                    {telemetry.missionChecklist.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 text-[9px] font-mono-tabular">
                        <span className={`flex items-center gap-1 truncate ${item.done ? 'text-emerald-300' : 'text-slate-200'}`}>
                          {item.done ? (
                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                          ) : (
                            <Circle className="w-2.5 h-2.5 text-slate-500 shrink-0" />
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
                    <div className="text-[10px] font-mono-tabular text-slate-200 truncate">
                      {telemetry.activeMissionObjective}
                    </div>
                  )
                )}
              </div>
            ) : (
              <div className="border-b border-white/10 pb-1 space-y-0.5">
                <div className="flex items-center gap-1 text-[9px] font-mono-tabular font-bold uppercase tracking-wider text-amber-400">
                  <Target className="w-2.5 h-2.5 shrink-0" />
                  <span className="truncate">{telemetry.objectiveBadge}</span>
                </div>
                <div className="text-[10px] text-slate-100 leading-tight line-clamp-2">
                  {telemetry.objectiveHeadline}
                </div>
              </div>
            )}
            {mode === 'tollbooth' ? (
              <>
                <div className="flex items-baseline gap-3">
                  <div>
                    <div className="text-[9px] font-display uppercase tracking-wider text-slate-400">TOLL</div>
                    <div
                      className={`font-display text-xl font-bold font-mono-tabular leading-none ${
                        telemetry.tollboothTimeLeftMs < 8000 ? 'text-red-400' : 'text-amber-400'
                      }`}
                    >
                      {(telemetry.tollboothTimeLeftMs / 1000).toFixed(1)}s
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] font-display uppercase tracking-wider text-slate-400">GATES</div>
                    <div className="font-display text-xl font-bold text-white tabular-nums leading-none">
                      {telemetry.tollboothCheckpoint}
                      <span className="text-xs text-slate-400">/{telemetry.tollboothTotal}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] font-display uppercase tracking-wider text-slate-400">LAP</div>
                    <div className="font-display text-xl font-bold text-slate-200 tabular-nums leading-none">
                      {telemetry.lap}
                      <span className="text-xs text-slate-400">/{telemetry.totalLaps}</span>
                    </div>
                  </div>
                </div>
                <div className="text-[11px] font-mono-tabular text-slate-300">
                  {formatTimeMs(telemetry.totalRaceTimeMs)} · {formatCurrency(telemetry.sessionBounty)}
                </div>
              </>
            ) : mode === 'speedtrap' ? (
              <>
                <div className="flex items-baseline gap-3">
                  <div>
                    <div className="text-[9px] font-display uppercase tracking-wider text-slate-400">RADAR</div>
                    <div className="font-display text-xl font-bold text-cyan-300 font-mono-tabular leading-none">
                      {telemetry.speedTrapTotalKmh}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] font-display uppercase tracking-wider text-slate-400">LEAD</div>
                    <div
                      className={`font-display text-lg font-bold font-mono-tabular leading-none ${
                        telemetry.speedTrapTotalKmh >= telemetry.speedTrapLeaderKmh
                          ? 'text-emerald-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {telemetry.speedTrapLeaderKmh}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] font-display uppercase tracking-wider text-slate-400">TRAP</div>
                    <div className="font-display text-lg font-bold text-white tabular-nums leading-none">
                      {telemetry.speedTrapHits}
                    </div>
                  </div>
                </div>
                <div className="text-[11px] font-mono-tabular text-slate-300 flex items-center gap-1.5">
                  <span>P{telemetry.position}/{telemetry.activeRacers}</span>
                  {telemetry.speedTrapTargetKmh > 0 && (
                    <span className="text-amber-400">· Target {telemetry.speedTrapTargetKmh}</span>
                  )}
                </div>
              </>
            ) : mode !== 'pursuit' && mode !== 'freeroam' ? (
              <>
                <div className="flex items-baseline gap-3">
                  <div>
                    <div className="text-[9px] font-display uppercase tracking-wider text-slate-400">POS</div>
                    <div className="font-display text-xl font-bold text-amber-400 tabular-nums leading-none">
                      {telemetry.position}
                      <span className="text-xs text-slate-400">/{telemetry.activeRacers}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] font-display uppercase tracking-wider text-slate-400">
                      {mode === 'sprint' ? 'SPRINT' : mode === 'knockout' ? 'KO' : 'LAP'}
                    </div>
                    <div className="font-display text-xl font-bold text-white tabular-nums leading-none">
                      {telemetry.lap}
                      <span className="text-xs text-slate-400">/{telemetry.totalLaps}</span>
                    </div>
                  </div>
                  {telemetry.activeRacers > 1 && (
                    <div>
                      <div className="text-[9px] font-display uppercase tracking-wider text-slate-400">GAP</div>
                      <div
                        className={`font-mono-tabular text-xs font-bold leading-none ${
                          telemetry.gapMeters >= 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {telemetry.gapMeters >= 0 ? `+${telemetry.gapMeters}m` : `${telemetry.gapMeters}m`}
                      </div>
                    </div>
                  )}
                </div>
                <div className="text-[11px] font-mono-tabular text-slate-300 flex items-center gap-2">
                  <span>
                    {formatTimeMs(telemetry.lapTimeMs)}
                    {telemetry.bestLapMs > 0 && (
                      <span className="text-amber-400"> · B {formatTimeMs(telemetry.bestLapMs)}</span>
                    )}
                  </span>
                  {mode === 'knockout' &&
                    telemetry.position === telemetry.activeRacers &&
                    telemetry.activeRacers > 1 && (
                      <span className="px-1 py-0.2 bg-red-500/25 border border-red-500/60 text-red-300 text-[9px] font-display font-bold uppercase">
                        RISK
                      </span>
                    )}
                </div>
              </>
            ) : (
              <>
                <div className="text-[9px] font-display uppercase tracking-wider text-slate-400">
                  {mode === 'freeroam' ? 'FREE ROAM' : 'PURSUIT'}
                </div>
                <div className="font-display text-xl font-bold text-white font-mono-tabular leading-none">
                  {formatTimeMs(telemetry.totalRaceTimeMs)}
                </div>
                <div className="text-[11px] font-mono-tabular text-slate-300">
                  {formatCurrency(telemetry.sessionBounty)} · Near Miss {telemetry.nearMissCount}
                </div>
              </>
            )}
            {((telemetry.damagePercent ?? 0) > 0 || telemetry.shortcutsTaken > 0) && (
              <div className="text-[9px] font-mono-tabular flex items-center gap-2 pt-0.5">
                {telemetry.shortcutsTaken > 0 && (
                  <span className="text-emerald-400 font-bold">SHORTCUTS {telemetry.shortcutsTaken}</span>
                )}
                {(telemetry.damagePercent ?? 0) > 0 && (
                  <span
                    className={`inline-flex items-center gap-1 font-bold ${
                      (telemetry.damagePercent ?? 0) >= 60 ? 'text-red-400' : 'text-amber-300'
                    }`}
                  >
                    <Wrench className="w-2.5 h-2.5 inline" /> DMG {telemetry.damagePercent}%
                  </span>
                )}
              </div>
            )}
          </div>
          {telemetry.opponents && telemetry.opponents.length > 0 && (
            <div className="pointer-events-auto nfs-chamfer nfs-carbon-bg border border-white/15 border-l-4 border-l-cyan-400 px-2.5 py-1.5 space-y-1">
              <button
                type="button"
                aria-expanded={!opponentsCollapsed}
                aria-label="Toggle Opponents List"
                onClick={(e) => {
                  e.currentTarget.blur();
                  setOpponentsCollapsed((v) => !v);
                }}
                className="w-full flex items-center justify-between gap-2 text-left cursor-pointer"
              >
                <span className="font-display text-[9px] font-bold uppercase tracking-wider text-cyan-300">
                  OPPONENTS ({telemetry.opponents.length})
                </span>
                <span className="flex items-center gap-1 font-mono-tabular text-[9px] uppercase text-slate-300">
                  <span>
                    {telemetry.opponents.filter((o) => o.status === 'racing').length} RUN
                    {telemetry.opponents.some((o) => o.status === 'busted')
                      ? ` · ${telemetry.opponents.filter((o) => o.status === 'busted').length} BUST`
                      : ''}
                  </span>
                  {opponentsCollapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                </span>
              </button>
              {!opponentsCollapsed && (
              <div className="space-y-0.5 pt-0.5 border-t border-white/10">
                {telemetry.opponents.map((opp) => {
                  const isBusted = opp.status === 'busted';
                  const isKo = opp.status === 'knocked_out';
                  const isFin = opp.status === 'finished';
                  return (
                    <div
                      key={opp.id}
                      className={`bg-[#0B0E14] border px-1.5 py-0.5 space-y-0.5 ${
                        isBusted
                          ? 'border-red-500/45 opacity-85'
                          : isKo
                            ? 'border-white/10 opacity-65'
                            : 'border-white/12'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="font-mono-tabular text-[9px] font-bold text-slate-400 shrink-0">
                            P{opp.position}
                          </span>
                          <span
                            className="w-1 h-3 shrink-0"
                            style={{ backgroundColor: opp.paintHex || '#E2E8F0' }}
                          />
                          <span
                            className={`text-[10px] font-bold truncate ${
                              isBusted || isKo ? 'line-through text-slate-400' : 'text-white'
                            }`}
                          >
                            {opp.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {!isBusted && !isKo && (
                            <span
                              className={`font-mono-tabular text-[9px] font-bold ${
                                opp.gapMeters > 0 ? 'text-red-300' : 'text-emerald-300'
                              }`}
                            >
                              {opp.gapMeters >= 0 ? `+${opp.gapMeters}m` : `${opp.gapMeters}m`}
                            </span>
                          )}
                          <span
                            className={`px-1 py-0.2 text-[8px] font-display font-bold uppercase border ${
                              isBusted
                                ? 'bg-red-500/25 border-red-500/60 text-red-300'
                                : isKo
                                  ? 'bg-slate-700/60 border-slate-500/40 text-slate-300'
                                  : isFin
                                    ? 'bg-amber-400/20 border-amber-400/50 text-amber-300'
                                    : 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                            }`}
                          >
                            {isBusted ? 'BUSTED' : isKo ? 'KO' : isFin ? 'FIN' : 'RACING'}
                          </span>
                        </div>
                      </div>
                      {opp.status === 'racing' && opp.bustProgress > 5 && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[8px] font-mono-tabular uppercase text-red-300 font-bold shrink-0">
                            PIN {opp.bustProgress}%
                          </span>
                          <div className="flex-1 h-1 bg-white/10 overflow-hidden">
                            <div
                              className="h-full bg-red-500"
                              style={{ width: `${Math.min(100, opp.bustProgress)}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              )}
            </div>
          )}
          </div>
        </>
        ) : (
          <div className="nfs-chamfer-sm nfs-carbon-bg border border-white/15 border-l-4 border-l-amber-400 px-3 py-1.5 flex items-baseline gap-3">
            <span className="font-display text-lg font-bold text-amber-400 tabular-nums">
              P{telemetry.position}/{telemetry.activeRacers}
            </span>
            <span className="font-display text-sm font-bold text-white tabular-nums">
              L{telemetry.lap}/{telemetry.totalLaps}
            </span>
            <span className="font-mono-tabular text-xs text-slate-300">
              {formatTimeMs(telemetry.lapTimeMs)}
            </span>
          </div>
        )}
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
            <div className="nfs-chamfer nfs-carbon-bg border border-amber-400/45 border-l-4 border-l-amber-400 px-3.5 py-2.5 w-[350px] space-y-1.5 text-[10px] font-mono-tabular">
              <div className="flex items-center justify-between border-b border-white/10 pb-1">
                <span className="font-display font-bold uppercase tracking-wider text-amber-300 text-[11px]">
                  AI DEBUG [{formatKeyCode(keys.toggleAiDebug.primary)}] · {telemetry.aiDifficulty ?? 'MEDIUM'}
                </span>
                <span className="text-slate-300">
                  LAST MARGIN:{' '}
                  <span
                    className={
                      telemetry.lastWinMarginSec == null
                        ? 'text-slate-400'
                        : telemetry.lastWinMarginSec >= 0
                          ? 'text-emerald-300 font-bold'
                          : 'text-red-300 font-bold'
                    }
                  >
                    {telemetry.lastWinMarginSec == null
                      ? '--'
                      : `${telemetry.lastWinMarginSec >= 0 ? '+' : ''}${telemetry.lastWinMarginSec.toFixed(1)}s`}
                  </span>
                </span>
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
                                : ai.action === 'BRAKE' || ai.action === 'DODGE' || ai.action === 'BUSTED' || ai.action === 'SLIP'
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
                        <span className="text-cyan-300">SKL {ai.skill.toFixed(2)}</span>
                        <span className="text-emerald-300">RUB x{ai.adaptiveMult.toFixed(2)}</span>
                        <span className="text-slate-400">MIS {ai.mistakes}</span>
                        <span className={ai.gapMeters >= 0 ? 'text-amber-300' : 'text-sky-300'}>
                          GAP {ai.gapMeters >= 0 ? `+${ai.gapMeters}m` : `${ai.gapMeters}m`}
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

          <div className="pointer-events-auto relative flex items-center gap-1.5">
            {mode === 'freeroam' && onFinishFreeroam && (
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onFinishFreeroam();
                }}
                title="Bank Bounty & Finish Run"
                aria-label="Bank Bounty and Finish Run"
                className="px-2.5 py-2 nfs-chamfer-sm bg-amber-400 hover:bg-amber-300 text-black font-display font-bold uppercase tracking-wider text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
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
                title={`Rewind 2.75s (${formatKeyCode(keys.rewind.primary)})`}
                aria-label="Rewind"
                className="px-2.5 py-2 nfs-chamfer-sm nfs-carbon-bg border border-white/18 text-slate-200 hover:text-cyan-300 hover:border-cyan-400/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-mono-tabular font-bold"
              >
                <History className="w-3.5 h-3.5" />
                <span>{telemetry.rewindUnlimited ? '∞' : telemetry.rewindsLeft ?? 0}</span>
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onCycleCamera();
              }}
              title={`Switch Camera (${formatKeyCode(keys.cycleCamera.primary)})`}
              aria-label="Switch Camera"
              className="p-2 nfs-chamfer-sm nfs-carbon-bg border border-white/18 text-slate-200 hover:text-amber-400 hover:border-amber-400/60 transition-colors cursor-pointer"
            >
              <Camera className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onSkipTrack();
              }}
              title={`Next Music Track (${formatKeyCode(keys.nextMusicTrack.primary)})`}
              aria-label="Next Music Track"
              className="p-2 nfs-chamfer-sm nfs-carbon-bg border border-white/18 text-slate-200 hover:text-amber-400 hover:border-amber-400/60 transition-colors cursor-pointer"
            >
              <SkipForward className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                setHudMinimal((v) => !v);
                setToolsOpen(false);
              }}
              title={hudMinimal ? 'Show Full HUD (H)' : 'Clean HUD (H)'}
              aria-label={hudMinimal ? 'Show Full HUD' : 'Clean HUD'}
              className={`p-2 nfs-chamfer-sm nfs-carbon-bg border transition-colors cursor-pointer ${
                hudMinimal
                  ? 'border-amber-400 text-amber-300'
                  : 'border-white/18 text-slate-200 hover:text-amber-400 hover:border-amber-400/60'
              }`}
            >
              {hudMinimal ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                setToolsOpen((v) => !v);
              }}
              title="Race Tools & Audio"
              aria-label="Race Tools and Audio"
              aria-expanded={toolsOpen}
              className={`p-2 nfs-chamfer-sm nfs-carbon-bg border transition-colors cursor-pointer ${
                toolsOpen
                  ? 'border-amber-400 text-amber-400'
                  : 'border-white/18 text-slate-200 hover:text-amber-400 hover:border-amber-400/60'
              }`}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onPause();
              }}
              title="Pause (Esc)"
              aria-label="Pause Race"
              className="p-2 nfs-chamfer-sm nfs-carbon-bg border border-white/18 text-slate-200 hover:text-amber-400 hover:border-amber-400/60 transition-colors cursor-pointer"
            >
              <Pause className="w-4 h-4" />
            </button>

            {toolsOpen && (
              <div className="absolute right-0 top-11 w-48 nfs-chamfer-sm nfs-carbon-bg border border-amber-400/45 p-1.5 shadow-2xl z-30 space-y-1 text-xs font-display uppercase tracking-wide">
                {onInstantRestart && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      setToolsOpen(false);
                      onInstantRestart();
                    }}
                    className="w-full px-2.5 py-1.5 text-left text-slate-200 hover:bg-white/10 hover:text-amber-300 flex items-center justify-between cursor-pointer"
                  >
                    <span className="flex items-center gap-2"><RotateCcw className="w-3.5 h-3.5" /> Restart</span>
                    <span className="text-[10px] font-mono-tabular text-slate-400">{formatKeyCode(keys.instantRestart.primary)}</span>
                  </button>
                )}
                {onToggleTuning && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      setToolsOpen(false);
                      onToggleTuning();
                    }}
                    className={`w-full px-2.5 py-1.5 text-left hover:bg-white/10 flex items-center justify-between cursor-pointer ${
                      tuningOpen ? 'text-amber-400 font-bold' : 'text-slate-200'
                    }`}
                  >
                    <span className="flex items-center gap-2"><Sliders className="w-3.5 h-3.5" /> Live Tune</span>
                    <span className="text-[10px] font-mono-tabular text-slate-400">{formatKeyCode(keys.toggleTuning.primary)}</span>
                  </button>
                )}
                {onToggleGhost && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onToggleGhost();
                    }}
                    className={`w-full px-2.5 py-1.5 text-left hover:bg-white/10 flex items-center justify-between cursor-pointer ${
                      telemetry.ghostEnabled ? 'text-cyan-300 font-bold' : 'text-slate-200'
                    }`}
                  >
                    <span className="flex items-center gap-2"><Ghost className="w-3.5 h-3.5" /> Ghost</span>
                    <span className="text-[10px] font-mono-tabular text-slate-400">{telemetry.ghostEnabled ? 'ON' : 'OFF'}</span>
                  </button>
                )}
                {onToggleAiDebug && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onToggleAiDebug();
                    }}
                    className={`w-full px-2.5 py-1.5 text-left hover:bg-white/10 flex items-center justify-between cursor-pointer ${
                      aiDebugOpen ? 'text-amber-300 font-bold' : 'text-slate-200'
                    }`}
                  >
                    <span className="flex items-center gap-2"><Bot className="w-3.5 h-3.5" /> AI Lines</span>
                    <span className="text-[10px] font-mono-tabular text-slate-400">{aiDebugOpen ? 'ON' : 'OFF'}</span>
                  </button>
                )}
                {onToggleDebug && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onToggleDebug();
                    }}
                    className={`w-full px-2.5 py-1.5 text-left hover:bg-white/10 flex items-center justify-between cursor-pointer ${
                      showDebug ? 'text-cyan-300 font-bold' : 'text-slate-200'
                    }`}
                  >
                    <span className="flex items-center gap-2"><Activity className="w-3.5 h-3.5" /> Dev Stats</span>
                    <span className="text-[10px] font-mono-tabular text-slate-400">{showDebug ? 'ON' : 'OFF'}</span>
                  </button>
                )}
                <div className="border-t border-white/10 my-0.5" />
                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onToggleMusicMute();
                  }}
                  className={`w-full px-2.5 py-1.5 text-left hover:bg-white/10 flex items-center justify-between cursor-pointer ${
                    musicMuted ? 'text-red-400' : 'text-slate-200'
                  }`}
                >
                  <span className="flex items-center gap-2"><Music className="w-3.5 h-3.5" /> Music</span>
                  <span className="text-[10px] font-mono-tabular text-slate-400">{musicMuted ? 'MUTED' : 'ON'}</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onToggleMute();
                  }}
                  className={`w-full px-2.5 py-1.5 text-left hover:bg-white/10 flex items-center justify-between cursor-pointer ${
                    muted ? 'text-red-400' : 'text-slate-200'
                  }`}
                >
                  <span className="flex items-center gap-2">{muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />} Master Audio</span>
                  <span className="text-[10px] font-mono-tabular text-slate-400">{muted ? 'OFF' : 'ON'}</span>
                </button>
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      setToolsOpen(false);
                      onOpenSettings();
                    }}
                    className="w-full px-2.5 py-1.5 text-left text-slate-200 hover:bg-white/10 hover:text-amber-300 flex items-center gap-2 cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5" /> Settings
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Center-Top Countdown & Callouts */}
      {telemetry.cinematicPhase !== 'intro' && telemetry.cinematicPhase !== 'outro' && (
      <>
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
      {telemetry.countdown > 0 && (
        <div className="fixed top-44 left-1/2 -translate-x-1/2 z-20 max-w-lg w-[92%] px-4 py-2.5 nfs-chamfer nfs-carbon-bg border border-amber-400/45 border-l-4 border-l-amber-400 shadow-2xl pointer-events-none nfs-anim-slide-up">
          <div className="flex items-center justify-between gap-2 text-[10px] font-mono-tabular uppercase tracking-widest text-amber-400 font-bold">
            <span className="flex items-center gap-1.5">
              <Target className="w-3 h-3" />
              <span>{telemetry.objectiveBadge}</span>
            </span>
            <span className="text-slate-300">READY AT LIGHTS</span>
          </div>
          <div className="font-display italic uppercase text-base sm:text-lg font-bold text-white leading-tight mt-0.5">
            {telemetry.objectiveHeadline}
          </div>
          {telemetry.objectiveSteps[0] && (
            <div className="text-[11px] text-slate-200 mt-1 leading-snug">
              1. {telemetry.objectiveSteps[0]}
            </div>
          )}
          {telemetry.objectiveFailRule && (
            <div className="text-[10px] font-mono-tabular text-red-300 mt-1 flex items-center gap-1.5">
              <ShieldAlert className="w-3 h-3 text-red-400 shrink-0" />
              <span>{telemetry.objectiveFailRule}</span>
            </div>
          )}
        </div>
      )}
      </>
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
              aria-label="Steer Left"
              onPointerDown={() => onTouchInput('left', true)}
              onPointerUp={() => onTouchInput('left', false)}
              onPointerLeave={() => onTouchInput('left', false)}
              className="w-14 h-14 nfs-chamfer-sm nfs-carbon-bg border border-white/25 text-white font-bold text-lg active:bg-amber-400 active:text-black"
            >
              ◀
            </button>
            <button
              type="button"
              aria-label="Steer Right"
              onPointerDown={() => onTouchInput('right', true)}
              onPointerUp={() => onTouchInput('right', false)}
              onPointerLeave={() => onTouchInput('right', false)}
              className="w-14 h-14 nfs-chamfer-sm nfs-carbon-bg border border-white/25 text-white font-bold text-lg active:bg-amber-400 active:text-black"
            >
              ▶
            </button>
            <button
              type="button"
              aria-label="Activate Nitrous"
              onPointerDown={() => onTouchInput('nitrous', true)}
              onPointerUp={() => onTouchInput('nitrous', false)}
              onPointerLeave={() => onTouchInput('nitrous', false)}
              className="px-3 h-14 nfs-chamfer-sm bg-cyan-500/25 border border-cyan-400 text-cyan-200 font-display font-bold text-xs"
            >
              NOS
            </button>
            <button
              type="button"
              aria-label="Brake"
              onPointerDown={() => onTouchInput('brake', true)}
              onPointerUp={() => onTouchInput('brake', false)}
              onPointerLeave={() => onTouchInput('brake', false)}
              className="px-3 h-14 nfs-chamfer-sm bg-red-500/25 border border-red-400 text-red-200 font-display font-bold text-xs"
            >
              BRK
            </button>
            <button
              type="button"
              aria-label="Throttle"
              onPointerDown={() => onTouchInput('throttle', true)}
              onPointerUp={() => onTouchInput('throttle', false)}
              onPointerLeave={() => onTouchInput('throttle', false)}
              className="px-4 h-14 nfs-chamfer-sm bg-amber-500/30 border border-amber-400 text-amber-200 font-display font-bold text-xs"
            >
              GAS
            </button>
          </div>
        </div>

        {/* Right: Radial Tachometer & Speedometer (compact or minimal readout) */}
        {hudMinimal ? (
          <div className="nfs-chamfer-sm nfs-carbon-bg border border-white/15 border-t-2 border-t-amber-400 px-3.5 py-2 flex items-baseline gap-3">
            <div>
              <span className="font-display italic text-3xl font-bold text-white tabular-nums leading-none">
                {telemetry.speedKmh}
              </span>
              <span className="text-[10px] font-mono-tabular text-slate-400 ml-1">KM/H</span>
            </div>
            <span className="text-xs font-mono-tabular text-amber-400 font-bold">
              G{telemetry.gear === -1 ? 'R' : telemetry.gear === 0 ? 'N' : telemetry.gear}
            </span>
            <span className="text-[11px] font-mono-tabular text-cyan-300 font-bold">
              NOS {Math.round(telemetry.nitrous)}%
            </span>
          </div>
        ) : (
        <div
          className={`nfs-chamfer nfs-carbon-bg p-2.5 w-36 sm:w-44 border transition-colors ${
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
              <div className="h-full bg-amber-400 transition-[width] duration-75" style={{ width: `${telemetry.speedbreaker}%` }} />
            </div>
          </div>
        </div>
        )}
      </div>
      )}
    </div>
  );
};
