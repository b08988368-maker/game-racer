import React from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Ghost,
  KeyRound,
  RotateCcw,
  Settings,
  ShieldAlert,
  Sliders,
  Trophy,
  Wrench,
} from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import {
  BLACKLIST_RIVALS,
  ENVIRONMENTS,
  formatCurrency,
  formatTimeMs,
  isTierBossUnlocked,
  TRACKS,
} from '../data/gameData';
import { CareerProfile, RaceResult } from '../types/game';

interface PostRaceProps {
  result: RaceResult;
  profile: CareerProfile;
  isNewGhostRecord?: boolean;
  ghostCopied?: boolean;
  onExportGhost?: () => void;
  onRaceAgain: () => void;
  onReturnGarage: () => void;
}

export const PostRaceModal: React.FC<PostRaceProps> = ({
  result,
  profile,
  isNewGhostRecord = false,
  ghostCopied = false,
  onExportGhost,
  onRaceAgain,
  onReturnGarage,
}) => {
  const trackMeta = TRACKS.find((t) => t.id === result.trackId);
  const envLabel = ENVIRONMENTS.find((e) => e.id === result.environment)?.label ?? result.environment;
  const nextRival = BLACKLIST_RIVALS.find((r) => r.rank === 10 - profile.blacklistDefeated);
  const wonCount = Array.isArray(profile.wonTrackIds) ? profile.wonTrackIds.length : 0;

  const unlock = nextRival ? isTierBossUnlocked(nextRival, profile) : null;
  const missionsLeft = unlock ? Math.max(0, unlock.missionsTotal - unlock.missionsDone) : 0;
  const bountyLeft = nextRival ? Math.max(0, nextRival.requiredBounty - profile.totalBounty) : 0;
  const koLeft = nextRival ? Math.max(0, nextRival.requiredTakedowns - profile.copsTakedowns) : 0;
  const readyForBoss = Boolean(unlock?.unlocked);

  const isDefeat =
    result.busted || result.knockedOut || result.tollboothExpired || Boolean(result.missionTitle && !result.missionCompleted);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#06070A]/82 p-4">
      <div
        className={`w-full max-w-lg nfs-chamfer nfs-carbon-bg border border-white/18 border-l-4 overflow-hidden shadow-2xl nfs-anim-slide-up ${
          isDefeat ? 'border-l-red-500' : result.won ? 'border-l-amber-400' : 'border-l-slate-400'
        }`}
      >
        <div className="h-1.5 w-full nfs-hazard-stripe border-b border-white/10" />
        <div className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-4 nfs-anim-stamp">
            <div>
              <div className="text-xs font-mono-tabular uppercase tracking-wider text-slate-400">
                {trackMeta?.name ?? result.trackId} · {envLabel}
              </div>
              <h2
                className={`font-display italic uppercase tracking-wide text-3xl font-bold mt-1 ${
                  isDefeat ? 'text-red-400' : result.won ? 'text-amber-400' : 'text-white'
                }`}
              >
                {result.busted
                  ? 'BUSTED BY RPD'
                  : result.knockedOut
                    ? 'KNOCKED OUT'
                    : result.tollboothExpired
                      ? 'TIME EXPIRED'
                      : result.missionTitle && !result.missionCompleted
                        ? 'MISSION FAILED'
                        : result.won
                          ? result.rivalDefeated
                            ? `BLACKLIST #${result.rivalDefeated.rank} DEFEATED`
                            : result.mode === 'pursuit'
                              ? 'PURSUIT EVADED'
                              : result.mode === 'freeroam'
                                ? 'RUN BANKED'
                                : result.mode === 'tollbooth'
                                  ? 'TOLLBOOTH CLEARED'
                                  : result.mode === 'speedtrap'
                                    ? 'SPEEDTRAP KING'
                                    : '1ST PLACE VICTORY'
                          : `FINISHED P${result.position}`}
              </h2>
            </div>
            {isDefeat ? (
              <ShieldAlert className="w-8 h-8 text-red-400 shrink-0" />
            ) : (
              <Trophy className="w-8 h-8 text-amber-400 shrink-0" />
            )}
          </div>

          {result.missionTitle && (
            <div
              className={`nfs-chamfer-sm px-3.5 py-2.5 text-xs border border-white/10 border-l-4 space-y-1 ${
                result.missionCompleted
                  ? 'bg-emerald-500/12 border-l-emerald-400 text-emerald-200'
                  : 'bg-red-500/12 border-l-red-500 text-red-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {result.missionCompleted ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                )}
                <span>
                  {result.missionCompleted ? 'MISSION CLEARED:' : 'MISSION INCOMPLETE:'}{' '}
                  <strong className="text-white">{result.missionTitle}</strong>
                </span>
              </div>
              {!result.missionCompleted && result.missionFailReason && (
                <div className="text-[11px] font-mono-tabular text-red-300 pl-6">
                  {result.missionFailReason}
                </div>
              )}
            </div>
          )}

          {!result.missionTitle && isDefeat && result.missionFailReason && (
            <div className="bg-red-500/12 border border-white/10 border-l-4 border-l-red-500 nfs-chamfer-sm px-3.5 py-2 text-xs text-red-200">
              {result.missionFailReason}
            </div>
          )}

          {result.bossCarAwarded && (
            <div className="bg-amber-500/14 border border-amber-400/50 border-l-4 border-l-amber-400 nfs-chamfer-sm p-3.5 text-xs space-y-1">
              <div className="flex items-center gap-2 font-display uppercase tracking-wider font-bold text-amber-300 text-sm">
                <KeyRound className="w-4 h-4 shrink-0" />
                <span>PINK SLIP SEIZED: {result.bossCarAwarded.name}</span>
              </div>
              <div className="text-amber-100/90">
                Exclusive Blacklist #{result.rivalDefeated?.rank} Boss car added to your Garage ({result.bossCarAwarded.baseTopSpeedKmh} km/h · Boss GT Aero).
              </div>
            </div>
          )}

          {result.isNewTrackWin && (
            <div className="bg-emerald-500/12 border border-white/10 border-l-4 border-l-emerald-400 nfs-chamfer-sm px-3.5 py-2.5 text-xs text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Circuit Cleared! <strong className="text-white">{wonCount} / 10 Circuits Won</strong>
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-sm">
            <MetricBox label="Cash Earned" value={formatCurrency(result.cashEarned)} tone="emerald" />
            <MetricBox label="Bounty Added" value={formatCurrency(result.bountyEarned)} tone="amber" />
            {result.mode === 'speedtrap' ? (
              <MetricBox label="Radar Total" value={`${result.speedTrapTotalKmh ?? 0} km/h`} tone="amber" />
            ) : (
              <MetricBox label="Best Lap" value={formatTimeMs(result.bestLapMs)} />
            )}
            <MetricBox
              label={result.mode === 'pursuit' ? 'Pursuit Time' : 'Total Time'}
              value={formatTimeMs(result.totalTimeMs)}
            />
            <MetricBox label="Shortcuts · Near Miss" value={`${result.shortcutsTaken ?? 0} · ${result.nearMissCount ?? 0}`} />
            <MetricBox label="Cops KO · Heat" value={`${result.copsTakedowns} · H${result.highestHeat}`} />
          </div>

          {/* Next Blacklist Boss Unlock Progress */}
          {nextRival ? (
            <div className="bg-[#0B0D13] border border-white/12 border-l-4 border-l-amber-400 nfs-chamfer-sm px-3.5 py-2.5 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-display uppercase tracking-wider font-semibold">
                  Target: <strong className="text-amber-400">#{nextRival.rank} {nextRival.alias}</strong>
                </span>
                <span className="font-mono-tabular text-slate-300">
                  Blacklist {profile.blacklistDefeated}/10
                </span>
              </div>
              {readyForBoss ? (
                <div className="text-emerald-400 font-semibold">
                  All tier missions &amp; requirements met — Challenge #{nextRival.rank} {nextRival.alias} now!
                </div>
              ) : (
                <div className="font-mono-tabular text-slate-300">
                  Needed:{' '}
                  <span className="text-white font-semibold">
                    {[
                      missionsLeft > 0 ? `${missionsLeft} mission${missionsLeft > 1 ? 's' : ''}` : null,
                      bountyLeft > 0 ? `${formatCurrency(bountyLeft)} bounty` : null,
                      koLeft > 0 ? `${koLeft} cop KO` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-amber-500/12 border border-amber-400/40 nfs-chamfer-sm px-3.5 py-2 text-xs text-amber-200 font-semibold">
              10/10 Blacklist Rivals Defeated — You are Rockport’s #1 Most Wanted!
            </div>
          )}

          {isNewGhostRecord && (
            <div className="bg-cyan-500/12 border border-cyan-400/45 border-l-4 border-l-cyan-400 nfs-chamfer-sm px-3.5 py-2 text-xs text-cyan-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Ghost className="w-4 h-4 text-cyan-300 shrink-0" />
                <span>
                  <strong className="text-white">NEW GHOST RECORD SAVED!</strong> Beat your personal best holographic run next attempt.
                </span>
              </div>
              {onExportGhost && (
                <button
                  type="button"
                  onClick={onExportGhost}
                  className="px-2.5 py-1 nfs-chamfer-sm bg-cyan-500/20 hover:bg-cyan-500/35 border border-cyan-400/60 text-[10px] font-mono-tabular font-bold text-cyan-100 flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  {ghostCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{ghostCopied ? 'COPIED' : 'SHARE CODE'}</span>
                </button>
              )}
            </div>
          )}
          {!isNewGhostRecord && onExportGhost && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onExportGhost}
                className="px-2.5 py-1 nfs-chamfer-sm bg-[#0B0D13] hover:bg-[#141822] border border-cyan-400/35 text-[11px] font-mono-tabular text-cyan-300 flex items-center gap-1.5 cursor-pointer"
              >
                {ghostCopied ? <Check className="w-3 h-3" /> : <Ghost className="w-3 h-3" />}
                <span>{ghostCopied ? 'Ghost Share JSON Copied' : 'Copy Best Track Ghost JSON'}</span>
              </button>
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                soundEngine.triggerUiClick();
                onRaceAgain();
              }}
              className="flex-1 py-2.5 px-4 nfs-chamfer-sm bg-[#1A1F2B] hover:bg-[#232A3B] border border-white/20 text-white font-display uppercase tracking-wider font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Race Again</span>
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.triggerUiClick();
                onReturnGarage();
              }}
              className="flex-1 py-2.5 px-4 nfs-chamfer-sm bg-amber-400 hover:bg-amber-300 text-black font-display uppercase tracking-wider font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Wrench className="w-4 h-4" />
              <span>Return to Garage</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

function MetricBox({
  label,
  value,
  tone = 'white',
}: {
  label: string;
  value: string;
  tone?: 'white' | 'amber' | 'emerald';
}) {
  return (
    <div className="bg-[#0B0D13] border border-white/12 border-l-2 border-l-white/25 nfs-chamfer-sm px-3 py-2">
      <div className="text-[10px] font-display uppercase tracking-wider text-slate-400">{label}</div>
      <div
        className={`font-mono-tabular text-sm font-bold mt-0.5 ${
          tone === 'emerald' ? 'text-emerald-400' : tone === 'amber' ? 'text-amber-400' : 'text-white'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

export const PauseModal: React.FC<{
  aeLookEnabled: boolean;
  onToggleAeLook: () => void;
  onOpenTuning?: () => void;
  onOpenSettings?: () => void;
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
}> = ({ aeLookEnabled, onToggleAeLook, onOpenTuning, onOpenSettings, onResume, onRestart, onQuit }) => {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#06070A]/82 p-4">
      <div className="w-full max-w-sm nfs-chamfer nfs-carbon-bg border border-white/18 border-l-4 border-l-amber-400 overflow-hidden shadow-2xl">
        <div className="h-1.5 w-full nfs-hazard-stripe border-b border-white/10" />
        <div className="p-6 space-y-4">
          <h2 className="font-display italic uppercase tracking-wider text-2xl font-bold text-white">Event Paused</h2>
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => {
                soundEngine.triggerUiClick();
                onResume();
              }}
              className="w-full py-2.5 px-4 nfs-chamfer-sm bg-amber-400 hover:bg-amber-300 text-black font-display uppercase tracking-wider font-bold text-sm transition-colors cursor-pointer"
            >
              Resume Race
            </button>
            {(onOpenTuning || onOpenSettings) && (
              <div className="grid grid-cols-2 gap-2">
                {onOpenTuning && (
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.triggerUiClick();
                      onOpenTuning();
                    }}
                    className="py-2 px-3 nfs-chamfer-sm bg-[#151923] hover:bg-[#1E2433] border border-amber-400/40 text-amber-300 font-display uppercase tracking-wider font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Tune (T)</span>
                  </button>
                )}
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.triggerUiClick();
                      onOpenSettings();
                    }}
                    className="py-2 px-3 nfs-chamfer-sm bg-[#151923] hover:bg-[#1E2433] border border-white/20 text-slate-200 font-display uppercase tracking-wider font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Settings</span>
                  </button>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={onToggleAeLook}
              className={`w-full py-2.5 px-4 nfs-chamfer-sm border text-xs font-mono-tabular uppercase tracking-wider font-bold transition-colors cursor-pointer ${
                aeLookEnabled
                  ? 'bg-cyan-500/18 hover:bg-cyan-500/28 border-cyan-400/60 text-cyan-200'
                  : 'bg-[#151923] hover:bg-[#1E2433] border-white/20 text-slate-200'
              }`}
            >
              {aeLookEnabled ? 'Look: A Left · E Right · A+E Back (Arrows Drive)' : 'Look: Q Left · E Right · Q+E Back (WASD Drive)'}
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.triggerUiClick();
                onRestart();
              }}
              className="w-full py-2.5 px-4 nfs-chamfer-sm bg-[#1A1F2B] hover:bg-[#232A3B] border border-white/20 text-white font-display uppercase tracking-wider font-bold text-sm transition-colors cursor-pointer"
            >
              Restart Event
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.triggerUiClick();
                onQuit();
              }}
              className="w-full py-2.5 px-4 nfs-chamfer-sm bg-transparent hover:bg-white/6 border border-white/18 text-slate-300 font-display uppercase tracking-wider font-bold text-sm transition-colors cursor-pointer"
            >
              Return to Garage
            </button>
          </div>
          <div className="pt-2 border-t border-white/10 text-[10px] font-mono-tabular text-slate-400 leading-relaxed">
            <strong className="text-slate-200">DRIVE</strong> WASD/Arrows ·{' '}
            <strong className="text-slate-200">DRIFT</strong> Space ·{' '}
            <strong className="text-cyan-300">NOS</strong> Shift ·{' '}
            <strong className="text-amber-300">BREAKER</strong> X ·{' '}
            <strong className="text-slate-200">REWIND</strong> Z ·{' '}
            <strong className="text-slate-200">RESET</strong> R ·{' '}
            <strong className="text-slate-200">CAM</strong> C ·{' '}
            <strong className="text-slate-200">HUD</strong> H
          </div>
        </div>
      </div>
    </div>
  );
};
