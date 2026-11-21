import React, { useMemo } from 'react';
import { Camera, Flag, Flame, Pause, Radio, ShieldAlert, Volume2, VolumeX } from 'lucide-react';
import { ENVIRONMENTS, formatCurrency, formatTimeMs } from '../data/gameData';
import { RaceMode, RaceTelemetry } from '../types/game';

interface Props {
  telemetry: RaceTelemetry;
  mode: RaceMode;
  muted: boolean;
  onToggleMute: () => void;
  onCycleCamera: () => void;
  onPause: () => void;
  onFinishFreeroam?: () => void;
  onTouchInput: (key: 'throttle' | 'brake' | 'left' | 'right' | 'nitrous' | 'speedbreaker' | 'handbrake', down: boolean) => void;
}

export const RaceHUD: React.FC<Props> = ({
  telemetry,
  mode,
  muted,
  onToggleMute,
  onCycleCamera,
  onPause,
  onFinishFreeroam,
  onTouchInput,
}) => {
  const minimapData = useMemo(() => {
    const pts = telemetry.minimapPath;
    if (!pts.length) return { pathD: '', shortcutDs: [] as string[], toMap: (_x: number, _z: number) => ({ x: 64, y: 64 }) };

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

    const shortcutDs = (telemetry.minimapShortcuts ?? []).map((scPts) =>
      scPts
        .map((p, idx) => {
          const m = toMap(p.x, p.z);
          return `${idx === 0 ? 'M' : 'L'}${m.x.toFixed(1)},${m.y.toFixed(1)}`;
        })
        .join(' '),
    );

    return { pathD: d, shortcutDs, toMap };
  }, [telemetry.minimapPath, telemetry.minimapShortcuts]);

  const rpmAngle = -215 + telemetry.rpm * 250;
  const rpmRad = (rpmAngle * Math.PI) / 180;
  const nosDash = (telemetry.nitrous / 100) * 142;

  // Radial speed streak intensity above 170 km/h or when firing NOS
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

      {/* Top Row */}
      <div className="relative flex items-start justify-between p-4 sm:p-5 gap-4">
        {/* Top-Left: Minimap & Standings */}
        <div className="flex items-start gap-3">
          <div className="w-32 h-32 rounded-2xl bg-[#0D0E12]/90 border border-white/12 p-1 shrink-0">
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
                  stroke="#10B981"
                  strokeWidth="2.6"
                  strokeDasharray="3 2"
                  strokeLinecap="round"
                />
              ))}
              {telemetry.minimapBlips.map((b, idx) => {
                const pt = minimapData.toMap(b.x, b.z);
                if (b.type === 'cooldown') {
                  return <circle key={`cd-${idx}`} cx={pt.x} cy={pt.y} r="3.5" fill="#10B981" opacity="0.88" />;
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

          <div className="bg-[#0D0E12]/90 border border-white/12 rounded-xl px-4 py-2.5 space-y-1">
            {mode === 'tollbooth' ? (
              <>
                <div className="flex items-baseline gap-4">
                  <div>
                    <div className="text-[11px] text-slate-400">TOLL TIME</div>
                    <div
                      className={`font-display text-2xl font-bold font-mono-tabular leading-none ${
                        telemetry.tollboothTimeLeftMs < 8000 ? 'text-red-400' : 'text-amber-400'
                      }`}
                    >
                      {(telemetry.tollboothTimeLeftMs / 1000).toFixed(1)}s
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">GATES</div>
                    <div className="font-display text-2xl font-bold text-white tabular-nums leading-none">
                      {telemetry.tollboothCheckpoint}
                      <span className="text-sm text-slate-400">/{telemetry.tollboothTotal}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">LAP</div>
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
            ) : mode !== 'pursuit' && mode !== 'freeroam' ? (
              <>
                <div className="flex items-baseline gap-4">
                  <div>
                    <div className="text-[11px] text-slate-400">POS</div>
                    <div className="font-display text-2xl font-bold text-amber-400 tabular-nums leading-none">
                      {telemetry.position}
                      <span className="text-sm text-slate-400">/{telemetry.activeRacers}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">
                      {mode === 'sprint' ? 'SPRINT' : mode === 'knockout' ? 'KNOCKOUT' : 'LAP'}
                    </div>
                    <div className="font-display text-2xl font-bold text-white tabular-nums leading-none">
                      {telemetry.lap}
                      <span className="text-sm text-slate-400">/{telemetry.totalLaps}</span>
                    </div>
                  </div>
                  {telemetry.activeRacers > 1 && (
                    <div>
                      <div className="text-[11px] text-slate-400">GAP</div>
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
                      <span className="px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/50 text-red-300 text-[10px] font-bold">
                        AT RISK
                      </span>
                    )}
                </div>
              </>
            ) : (
              <>
                <div className="text-[11px] text-slate-400">
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
            <div className="text-[10px] font-mono-tabular text-slate-400 pt-0.5 flex items-center gap-2">
              <span>{ENVIRONMENTS.find((e) => e.id === telemetry.environment)?.label ?? telemetry.environment}</span>
              {telemetry.shortcutsTaken > 0 && (
                <span className="text-emerald-400 font-semibold">· Shortcuts {telemetry.shortcutsTaken}</span>
              )}
            </div>
          </div>
        </div>

        {/* Top-Right: Pursuit Status, Police Scanner & Utility Buttons */}
        <div className="flex items-start gap-2.5">
          <div className="flex flex-col items-end gap-2">
            {telemetry.pursuitState !== 'none' && (
              <div className="bg-[#0D0E12]/92 border border-white/12 rounded-xl px-4 py-2.5 min-w-[220px] space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`font-display text-xs font-bold flex items-center gap-1.5 ${
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
                        : 'PURSUIT'}
                  </span>
                  <span className="text-xs font-mono-tabular text-amber-400 flex items-center gap-1">
                    <Flame className="w-3.5 h-3.5" />
                    HEAT {telemetry.heatLevel}
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-1">
                  {[1, 2, 3, 4, 5].map((lvl) => (
                    <div
                      key={lvl}
                      className={`h-1 rounded-xs ${
                        lvl <= telemetry.heatLevel
                          ? lvl >= 4
                            ? 'bg-red-500'
                            : 'bg-amber-400'
                          : 'bg-white/12'
                      }`}
                    />
                  ))}
                </div>

                {telemetry.pursuitState === 'cooldown' ? (
                  <div className="space-y-0.5">
                    <div className="flex justify-between text-[11px] text-emerald-300 font-mono-tabular">
                      <span>Evading</span>
                      <span>{Math.round(telemetry.evadeProgress)}%</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-sm overflow-hidden">
                      <div className="h-full bg-emerald-400" style={{ width: `${telemetry.evadeProgress}%` }} />
                    </div>
                  </div>
                ) : (
                  telemetry.bustProgress > 2 && (
                    <div className="space-y-0.5">
                      <div className="flex justify-between text-[11px] text-red-400 font-mono-tabular font-bold">
                        <span>BUSTED WARNING</span>
                        <span>{Math.round(telemetry.bustProgress)}%</span>
                      </div>
                      <div className="h-1.5 bg-white/10 rounded-sm overflow-hidden">
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
              <div className="max-w-[290px] bg-[#0D0E12]/92 border border-red-500/40 rounded-xl px-3.5 py-2 flex items-start gap-2 text-xs text-slate-200">
                <Radio className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                <span>{telemetry.radioDispatch}</span>
              </div>
            )}
          </div>

          <div className="pointer-events-auto flex items-center gap-1.5">
            {mode === 'freeroam' && onFinishFreeroam && (
              <button
                type="button"
                onClick={onFinishFreeroam}
                title="Bank Bounty & Finish Run"
                className="px-3 py-2 bg-amber-400 hover:bg-amber-300 text-black font-display font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Flag className="w-3.5 h-3.5" />
                <span>Bank Run</span>
              </button>
            )}
            <button
              type="button"
              onClick={onCycleCamera}
              title="Switch Camera (C)"
              className="p-2.5 bg-[#0D0E12]/90 border border-white/12 rounded-lg text-slate-200 hover:text-amber-400 transition-colors cursor-pointer"
            >
              <Camera className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onToggleMute}
              title={muted ? 'Unmute' : 'Mute'}
              className="p-2.5 bg-[#0D0E12]/90 border border-white/12 rounded-lg text-slate-200 hover:text-amber-400 transition-colors cursor-pointer"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onPause}
              title="Pause (Esc)"
              className="p-2.5 bg-[#0D0E12]/90 border border-white/12 rounded-lg text-slate-200 hover:text-amber-400 transition-colors cursor-pointer"
            >
              <Pause className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Center-Top Countdown & Callouts */}
      <div className="fixed top-20 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none">
        {telemetry.countdown > 0 && (
          <div className="font-display text-6xl font-bold text-amber-400 drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)] tabular-nums">
            {telemetry.countdown}
          </div>
        )}
        {telemetry.wrongWay && (
          <div className="px-4 py-1.5 bg-red-600/95 text-white font-display font-bold text-sm rounded-lg">
            WRONG WAY — TURN AROUND
          </div>
        )}
        {telemetry.callout && (
          <div
            className={`px-4 py-1.5 rounded-lg border font-display font-bold text-sm tracking-wide bg-[#0D0E12]/92 ${
              telemetry.callout.tone === 'red'
                ? 'border-red-500 text-red-400'
                : telemetry.callout.tone === 'cyan'
                  ? 'border-cyan-400 text-cyan-300'
                  : telemetry.callout.tone === 'emerald'
                    ? 'border-emerald-400 text-emerald-300'
                    : 'border-amber-400 text-amber-300'
            }`}
          >
            {telemetry.callout.text}
          </div>
        )}
      </div>

      {/* Bottom Row */}
      <div className="fixed bottom-4 left-4 right-4 flex items-end justify-between gap-4">
        <div className="space-y-2">
          {(telemetry.isDrifting || telemetry.isSlipstreaming || telemetry.nearMissCombo > 1) && (
            <div className="flex flex-wrap items-center gap-2">
              {telemetry.isDrifting && (
                <div className="inline-block px-3 py-1 bg-[#0D0E12]/90 border border-amber-400/50 rounded-lg font-display text-xs font-bold text-amber-400">
                  POWER SLIDE · +NOS
                </div>
              )}
              {telemetry.isSlipstreaming && (
                <div className="inline-block px-3 py-1 bg-[#0D0E12]/90 border border-cyan-400/50 rounded-lg font-display text-xs font-bold text-cyan-300">
                  SLIPSTREAM · +NOS
                </div>
              )}
              {telemetry.nearMissCombo > 1 && (
                <div className="inline-block px-3 py-1 bg-[#0D0E12]/90 border border-emerald-400/50 rounded-lg font-display text-xs font-bold text-emerald-300">
                  TRAFFIC CHAIN x{telemetry.nearMissCombo}
                </div>
              )}
            </div>
          )}
          <div className="hidden md:flex items-center gap-3 px-3.5 py-2 bg-[#0D0E12]/88 border border-white/10 rounded-xl text-xs text-slate-300">
            <span><strong className="text-white">WASD</strong> Drive</span>
            <span aria-hidden="true">·</span>
            <span><strong className="text-white">Space</strong> Drift</span>
            <span aria-hidden="true">·</span>
            <span><strong className="text-cyan-400">Shift</strong> Nitrous</span>
            <span aria-hidden="true">·</span>
            <span><strong className="text-amber-400">X</strong> Speedbreaker</span>
            <span aria-hidden="true">·</span>
            <span><strong className="text-white">C</strong> Cam</span>
          </div>

          {/* Mobile Touch Controls */}
          <div className="pointer-events-auto flex md:hidden items-center gap-2">
            <button
              type="button"
              onPointerDown={() => onTouchInput('left', true)}
              onPointerUp={() => onTouchInput('left', false)}
              onPointerLeave={() => onTouchInput('left', false)}
              className="w-14 h-14 rounded-xl bg-[#0D0E12]/88 border border-white/20 text-white font-bold text-lg active:bg-amber-400 active:text-black"
            >
              ◀
            </button>
            <button
              type="button"
              onPointerDown={() => onTouchInput('right', true)}
              onPointerUp={() => onTouchInput('right', false)}
              onPointerLeave={() => onTouchInput('right', false)}
              className="w-14 h-14 rounded-xl bg-[#0D0E12]/88 border border-white/20 text-white font-bold text-lg active:bg-amber-400 active:text-black"
            >
              ▶
            </button>
            <button
              type="button"
              onPointerDown={() => onTouchInput('nitrous', true)}
              onPointerUp={() => onTouchInput('nitrous', false)}
              onPointerLeave={() => onTouchInput('nitrous', false)}
              className="px-3 h-14 rounded-xl bg-cyan-500/25 border border-cyan-400 text-cyan-200 font-display font-bold text-xs"
            >
              NOS
            </button>
            <button
              type="button"
              onPointerDown={() => onTouchInput('brake', true)}
              onPointerUp={() => onTouchInput('brake', false)}
              onPointerLeave={() => onTouchInput('brake', false)}
              className="px-3 h-14 rounded-xl bg-red-500/25 border border-red-400 text-red-200 font-display font-bold text-xs"
            >
              BRK
            </button>
            <button
              type="button"
              onPointerDown={() => onTouchInput('throttle', true)}
              onPointerUp={() => onTouchInput('throttle', false)}
              onPointerLeave={() => onTouchInput('throttle', false)}
              className="px-4 h-14 rounded-xl bg-amber-500/30 border border-amber-400 text-amber-200 font-display font-bold text-xs"
            >
              GAS
            </button>
          </div>
        </div>

        {/* Right: Radial Tachometer & Speedometer */}
        <div
          className={`bg-[#0D0E12]/92 rounded-2xl p-3 w-48 sm:w-52 border transition-colors ${
            telemetry.rpm > 0.88
              ? 'border-red-500 shadow-[0_0_24px_rgba(239,68,68,0.45)]'
              : 'border-white/12'
          }`}
        >
          <div className="relative w-full aspect-[1.15/1]">
            <svg viewBox="0 0 200 175" className="w-full h-full">
              <path
                d="M 35 140 A 78 78 0 1 1 165 140"
                fill="none"
                stroke="#1E293B"
                strokeWidth="12"
                strokeLinecap="round"
              />
              <path
                d="M 155 48 A 78 78 0 0 1 165 140"
                fill="none"
                stroke="#EF4444"
                strokeWidth="12"
                strokeLinecap="round"
                opacity="0.7"
              />
              <path
                d="M 35 140 A 78 78 0 1 1 165 140"
                fill="none"
                stroke={telemetry.rpm > 0.85 ? '#EF4444' : '#F59E0B'}
                strokeWidth="12"
                strokeLinecap="round"
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
                strokeLinecap="round"
              />
              <path
                d="M 22 146 A 92 92 0 0 1 40 38"
                fill="none"
                stroke="#06B6D4"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${nosDash} 200`}
              />
              <line
                x1="100"
                y1="100"
                x2={100 + Math.cos(rpmRad) * 64}
                y2={100 + Math.sin(rpmRad) * 64}
                stroke="#F8FAFC"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle cx="100" cy="100" r="6" fill="#F59E0B" />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
              <div className="font-display text-3xl font-bold text-white tabular-nums leading-none">
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
            <div className="h-1.5 bg-white/10 rounded-sm overflow-hidden">
              <div
                className="h-full bg-amber-400 transition-[width] duration-75"
                style={{ width: `${telemetry.speedbreaker}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
