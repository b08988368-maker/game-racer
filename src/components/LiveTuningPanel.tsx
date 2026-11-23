import React from 'react';
import { RotateCcw, Sliders, X } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import {
  ASSIST_LABELS,
  HANDLING_PRESETS,
  HandlingMode,
  TUNING_SLIDER_DEFS,
} from '../config/physicsConfig';
import { AssistSettings, PhysicsTuningParams } from '../types/game';

interface Props {
  handlingMode: HandlingMode;
  assists: AssistSettings;
  tuning: PhysicsTuningParams;
  onSelectMode: (mode: HandlingMode) => void;
  onToggleAssist: (key: keyof AssistSettings) => void;
  onChangeTuning: (key: keyof PhysicsTuningParams, value: number) => void;
  onResetModePreset: () => void;
  onClose: () => void;
}

const MODE_ORDER: HandlingMode[] = ['arcade', 'balanced', 'sim_lite'];

export const LiveTuningPanel: React.FC<Props> = ({
  handlingMode,
  assists,
  tuning,
  onSelectMode,
  onToggleAssist,
  onChangeTuning,
  onResetModePreset,
  onClose,
}) => {
  const activePreset = HANDLING_PRESETS[handlingMode];

  return (
    <aside
      className="pointer-events-auto fixed top-20 right-4 bottom-24 z-25 w-[350px] max-w-[calc(100vw-2rem)] flex flex-col nfs-chamfer nfs-carbon-bg border border-amber-400/45 border-l-4 border-l-amber-400 shadow-2xl overflow-hidden"
      aria-label="Live Physics Tuning Panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-[#0A0C11] border-b border-white/12 shrink-0">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-amber-400 shrink-0" />
          <div>
            <div className="font-display italic uppercase tracking-wider font-bold text-sm text-white leading-none">
              Live Physics Tuning
            </div>
            <div className="text-[10px] font-mono-tabular text-amber-300/90 mt-0.5">
              PRESS [T] TO TOGGLE WHILE DRIVING
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            soundEngine.triggerUiClick();
            onClose();
          }}
          title="Close Tuning Panel (T)"
          className="p-1.5 nfs-chamfer-sm bg-white/6 hover:bg-white/15 border border-white/15 text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
        {/* Handling Modes */}
        <section className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-display uppercase tracking-wider font-bold text-amber-400">
              Handling Model Preset
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                soundEngine.triggerUiClick();
                onResetModePreset();
              }}
              className="flex items-center gap-1 px-2 py-0.5 nfs-chamfer-sm bg-white/8 hover:bg-white/16 border border-white/15 text-[10px] font-mono-tabular uppercase text-slate-200 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {MODE_ORDER.map((modeKey) => {
              const meta = HANDLING_PRESETS[modeKey];
              const active = handlingMode === modeKey;
              return (
                <button
                  key={modeKey}
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    soundEngine.triggerUiClick();
                    onSelectMode(modeKey);
                  }}
                  className={`py-1.5 px-2 nfs-chamfer-sm border text-xs font-display font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                    active
                      ? 'bg-amber-400 text-black border-amber-300'
                      : 'bg-[#121620] text-slate-200 border-white/15 hover:border-amber-400/50'
                  }`}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-300 leading-snug">{activePreset.tagline}</p>
        </section>

        {/* Electronic Driving Assists */}
        <section className="space-y-1.5 pt-2 border-t border-white/10">
          <div className="text-[11px] font-display uppercase tracking-wider font-bold text-cyan-300">
            Driving Assists
          </div>
          <div className="space-y-1.5">
            {ASSIST_LABELS.map((item) => {
              const enabled = assists[item.key];
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    soundEngine.triggerUiClick();
                    onToggleAssist(item.key);
                  }}
                  className="w-full text-left px-2.5 py-1.5 nfs-chamfer-sm bg-[#0C0F16] hover:bg-[#141925] border border-white/12 flex items-start justify-between gap-2.5 transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white">{item.label}</div>
                    <div className="text-[10px] text-slate-400 leading-tight mt-0.5">{item.explanation}</div>
                  </div>
                  <span
                    className={`shrink-0 mt-0.5 px-2 py-0.5 text-[10px] font-mono-tabular font-bold uppercase nfs-chamfer-sm border ${
                      enabled
                        ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300'
                        : 'bg-white/6 border-white/15 text-slate-400'
                    }`}
                  >
                    {enabled ? 'ON' : 'OFF'}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Real-Time Physics Sliders */}
        <section className="space-y-2.5 pt-2 border-t border-white/10">
          <div className="text-[11px] font-display uppercase tracking-wider font-bold text-amber-400">
            Pacejka, Suspension &amp; Aero Parameters
          </div>
          <div className="space-y-2.5">
            {TUNING_SLIDER_DEFS.map((def) => {
              const val = tuning[def.key];
              const decimals = def.step < 0.1 ? 2 : def.step < 1 ? 1 : 0;
              return (
                <div
                  key={def.key}
                  className="px-2.5 py-2 nfs-chamfer-sm bg-[#0C0F16] border border-white/10 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor={`tune-${def.key}`}
                      className="text-xs font-semibold text-slate-100"
                    >
                      {def.label}
                    </label>
                    <span className="text-xs font-mono-tabular font-bold text-amber-300">
                      {val.toFixed(decimals)}
                      {def.unit}
                    </span>
                  </div>
                  <input
                    id={`tune-${def.key}`}
                    type="range"
                    min={def.min}
                    max={def.max}
                    step={def.step}
                    value={val}
                    onChange={(e) => onChangeTuning(def.key, parseFloat(e.target.value))}
                    onPointerUp={(e) => e.currentTarget.blur()}
                    className="w-full h-1.5 accent-amber-400 cursor-pointer"
                  />
                  <p className="text-[10px] text-slate-400 leading-tight">{def.explanation}</p>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </aside>
  );
};
