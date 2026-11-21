import React from 'react';
import { CheckCircle2, KeyRound, RotateCcw, ShieldAlert, Trophy, Wrench } from 'lucide-react';
import { BLACKLIST_RIVALS, ENVIRONMENTS, formatCurrency, formatTimeMs, TRACKS } from '../data/gameData';
import { CareerProfile, RaceResult } from '../types/game';

interface PostRaceProps {
  result: RaceResult;
  profile: CareerProfile;
  onRaceAgain: () => void;
  onReturnGarage: () => void;
}

export const PostRaceModal: React.FC<PostRaceProps> = ({ result, profile, onRaceAgain, onReturnGarage }) => {
  const trackMeta = TRACKS.find((t) => t.id === result.trackId);
  const envLabel = ENVIRONMENTS.find((e) => e.id === result.environment)?.label ?? result.environment;
  const nextRival = BLACKLIST_RIVALS.find((r) => r.rank === 10 - profile.blacklistDefeated);
  const wonCount = Array.isArray(profile.wonTrackIds) ? profile.wonTrackIds.length : 0;

  const winsLeft = nextRival ? Math.max(0, nextRival.requiredWins - profile.racesWon) : 0;
  const bountyLeft = nextRival ? Math.max(0, nextRival.requiredBounty - profile.totalBounty) : 0;
  const koLeft = nextRival ? Math.max(0, nextRival.requiredTakedowns - profile.copsTakedowns) : 0;
  const readyForBoss = Boolean(nextRival && winsLeft === 0 && bountyLeft === 0 && koLeft === 0);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#0D0E12]/82 p-4">
      <div className="w-full max-w-lg bg-[#14171F] border border-white/15 rounded-2xl p-6 space-y-4 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-mono-tabular text-slate-400">
              {trackMeta?.name ?? result.trackId} · {envLabel}
            </div>
            <h2
              className={`font-display text-3xl font-bold mt-1 ${
                result.busted || result.knockedOut || result.tollboothExpired
                  ? 'text-red-400'
                  : result.won
                    ? 'text-amber-400'
                    : 'text-white'
              }`}
            >
              {result.busted
                ? 'BUSTED BY RPD'
                : result.knockedOut
                  ? 'KNOCKED OUT'
                  : result.tollboothExpired
                    ? 'TIME EXPIRED'
                    : result.won
                      ? result.rivalDefeated
                        ? `BLACKLIST #${result.rivalDefeated.rank} DEFEATED`
                        : result.mode === 'pursuit'
                          ? 'PURSUIT EVADED'
                          : result.mode === 'freeroam'
                            ? 'RUN BANKED'
                            : result.mode === 'tollbooth'
                              ? 'TOLLBOOTH CLEARED'
                              : '1ST PLACE VICTORY'
                      : `FINISHED P${result.position}`}
            </h2>
          </div>
          {result.busted || result.tollboothExpired ? (
            <ShieldAlert className="w-8 h-8 text-red-400 shrink-0" />
          ) : (
            <Trophy className="w-8 h-8 text-amber-400 shrink-0" />
          )}
        </div>

        {result.bossCarAwarded && (
          <div className="bg-amber-500/14 border border-amber-400/60 rounded-xl p-3.5 text-xs space-y-1">
            <div className="flex items-center gap-2 font-display font-bold text-amber-300 text-sm">
              <KeyRound className="w-4 h-4 shrink-0" />
              <span>PINK SLIP SEIZED: {result.bossCarAwarded.name}</span>
            </div>
            <div className="text-amber-100/90">
              Exclusive Blacklist #{result.rivalDefeated?.rank} Boss car added to your Garage ({result.bossCarAwarded.baseTopSpeedKmh} km/h · Boss GT Aero). Cannot be bought in stores!
            </div>
          </div>
        )}

        {result.isNewTrackWin && (
          <div className="bg-emerald-500/12 border border-emerald-400/45 rounded-xl px-3.5 py-2.5 text-xs text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              New Circuit Cleared! <strong className="text-white">{wonCount} / 10 Circuits Won</strong>
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-sm">
          <MetricBox label="Cash Earned" value={formatCurrency(result.cashEarned)} tone="emerald" />
          <MetricBox label="Bounty Added" value={formatCurrency(result.bountyEarned)} tone="amber" />
          <MetricBox label="Best Lap" value={formatTimeMs(result.bestLapMs)} />
          <MetricBox
            label={result.mode === 'pursuit' ? 'Pursuit Time' : 'Total Time'}
            value={formatTimeMs(result.totalTimeMs)}
          />
          <MetricBox label="Shortcuts Used" value={String(result.shortcutsTaken ?? 0)} />
          <MetricBox label="Cops KO · Heat" value={`${result.copsTakedowns} · H${result.highestHeat}`} />
        </div>

        {/* Next Blacklist Boss Unlock Progress */}
        {nextRival ? (
          <div className="bg-[#0D0E12] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-medium">
                Next Boss Target: <strong className="text-amber-400">#{nextRival.rank} {nextRival.alias}</strong>
              </span>
              <span className="font-mono-tabular text-slate-300">
                Blacklist {profile.blacklistDefeated}/10
              </span>
            </div>
            {readyForBoss ? (
              <div className="text-emerald-400 font-semibold">
                All requirements met — Challenge #{nextRival.rank} {nextRival.alias} in the Blacklist tab!
              </div>
            ) : (
              <div className="font-mono-tabular text-slate-300">
                Still needed:{' '}
                <span className="text-white font-semibold">
                  {[
                    winsLeft > 0 ? `${winsLeft} win${winsLeft > 1 ? 's' : ''}` : null,
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
          <div className="bg-amber-500/10 border border-amber-400/35 rounded-xl px-3.5 py-2 text-xs text-amber-200 font-semibold">
            10/10 Blacklist Rivals Defeated — You are Rockport’s #1 Most Wanted!
          </div>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={onRaceAgain}
            className="flex-1 py-2.5 px-4 bg-[#1E2330] hover:bg-[#272D3D] border border-white/15 text-white font-semibold text-sm rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Race Again</span>
          </button>
          <button
            type="button"
            onClick={onReturnGarage}
            className="flex-1 py-2.5 px-4 bg-amber-400 hover:bg-amber-300 text-black font-display font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Wrench className="w-4 h-4" />
            <span>Return to Garage</span>
          </button>
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
    <div className="bg-[#0D0E12] border border-white/10 rounded-xl px-3 py-2">
      <div className="text-[11px] text-slate-400">{label}</div>
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
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
}> = ({ onResume, onRestart, onQuit }) => {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#0D0E12]/80 p-4">
      <div className="w-full max-w-sm bg-[#14171F] border border-white/15 rounded-2xl p-6 space-y-4 shadow-2xl">
        <h2 className="font-display text-2xl font-bold text-white">Event Paused</h2>
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={onResume}
            className="w-full py-2.5 px-4 bg-amber-400 hover:bg-amber-300 text-black font-display font-bold text-sm rounded-xl transition-colors cursor-pointer"
          >
            Resume Race
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="w-full py-2.5 px-4 bg-[#1E2330] hover:bg-[#272D3D] border border-white/15 text-white font-semibold text-sm rounded-xl transition-colors cursor-pointer"
          >
            Restart Event
          </button>
          <button
            type="button"
            onClick={onQuit}
            className="w-full py-2.5 px-4 bg-transparent hover:bg-white/5 border border-white/15 text-slate-300 font-semibold text-sm rounded-xl transition-colors cursor-pointer"
          >
            Return to Garage
          </button>
        </div>
      </div>
    </div>
  );
};
