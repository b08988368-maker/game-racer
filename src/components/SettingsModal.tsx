import React, { useEffect, useState } from 'react';
import {
  Bot,
  Check,
  CloudRain,
  Copy,
  Download,
  Gamepad2,
  Ghost,
  Keyboard,
  Monitor,
  RotateCcw,
  Shield,
  Sliders,
  Smartphone,
  Sun,
  Trophy,
  X,
} from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import {
  AiSettings,
  DEFAULT_AI_SETTINGS,
  RUBBER_BANDING_LABELS,
  RubberBandingMode,
} from '../config/aiConfig';
import {
  ASSIST_LABELS,
  HANDLING_PRESETS,
  HandlingMode,
} from '../config/physicsConfig';
import {
  CONTROL_ACTION_LABELS,
  ControlAction,
  ControlBindings,
  formatKeyCode,
  GRAPHICS_QUALITY_PRESETS,
  GraphicsQuality,
  TouchControlsMode,
} from '../config/settingsConfig';
import { WEATHER_MODE_OPTIONS, WeatherMode } from '../config/weatherConfig';
import { formatTimeMs, TRACKS } from '../data/gameData';
import {
  exportGhostShareCode,
  GhostRunData,
  importGhostShareCode,
  loadAllGhosts,
  loadOfflineTrackRecords,
  TrackBestRecord,
} from '../three/ghostAndRewind';
import { AssistSettings } from '../types/game';

interface Props {
  graphicsQuality: GraphicsQuality;
  touchControlsMode: TouchControlsMode;
  handlingMode: HandlingMode;
  assists: AssistSettings;
  controlBindings: ControlBindings;
  aiSettings: AiSettings;
  showGhost: boolean;
  skipCountdownOnRestart: boolean;
  weatherMode: WeatherMode;
  dynamicDayNight: boolean;
  policeEnabled: boolean;
  aeLookEnabled: boolean;
  gamepadConnected: boolean;
  gamepadId: string | null;
  onChangeGraphicsQuality: (q: GraphicsQuality) => void;
  onChangeTouchControlsMode: (m: TouchControlsMode) => void;
  onSelectHandlingMode: (m: HandlingMode) => void;
  onToggleAssist: (k: keyof AssistSettings) => void;
  onUpdateBinding: (action: ControlAction, slot: 'primary' | 'secondary', code: string | undefined) => void;
  onResetBindings: () => void;
  onChangeAiSettings: (patch: Partial<AiSettings>) => void;
  onResetAiSettings: () => void;
  onToggleShowGhost: () => void;
  onToggleSkipCountdown: () => void;
  onChangeWeatherMode: (w: WeatherMode) => void;
  onToggleDynamicDayNight: () => void;
  onTogglePoliceEnabled: () => void;
  onToggleAeLook: () => void;
  onCapturingChange?: (capturing: boolean) => void;
  onClose: () => void;
}

type SettingsTab = 'display' | 'ai' | 'controls';

export const SettingsModal: React.FC<Props> = ({
  graphicsQuality,
  touchControlsMode,
  handlingMode,
  assists,
  controlBindings,
  aiSettings,
  showGhost,
  skipCountdownOnRestart,
  weatherMode,
  dynamicDayNight,
  policeEnabled,
  aeLookEnabled,
  gamepadConnected,
  gamepadId,
  onChangeGraphicsQuality,
  onChangeTouchControlsMode,
  onSelectHandlingMode,
  onToggleAssist,
  onUpdateBinding,
  onResetBindings,
  onChangeAiSettings,
  onResetAiSettings,
  onToggleShowGhost,
  onToggleSkipCountdown,
  onChangeWeatherMode,
  onToggleDynamicDayNight,
  onTogglePoliceEnabled,
  onToggleAeLook,
  onCapturingChange,
  onClose,
}) => {
  const [tab, setTab] = useState<SettingsTab>('display');
  const [listening, setListening] = useState<{ action: ControlAction; slot: 'primary' | 'secondary' } | null>(null);
  const [ghostImportRaw, setGhostImportRaw] = useState('');
  const [ghostFeedback, setGhostFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [recordsRefresh, setRecordsRefresh] = useState(0);

  const offlineRecords: TrackBestRecord[] = Object.values(loadOfflineTrackRecords()).sort((a, b) =>
    a.trackId.localeCompare(b.trackId),
  );
  const savedGhosts: Record<string, GhostRunData> = loadAllGhosts();
  void recordsRefresh;

  useEffect(() => {
    onCapturingChange?.(Boolean(listening));
    return () => onCapturingChange?.(false);
  }, [listening, onCapturingChange]);

  useEffect(() => {
    if (!listening) return;
    const handleCapture = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        setListening(null);
        return;
      }
      onUpdateBinding(listening.action, listening.slot, e.code);
      setListening(null);
      soundEngine.triggerUiClick();
    };
    window.addEventListener('keydown', handleCapture, true);
    return () => window.removeEventListener('keydown', handleCapture, true);
  }, [listening, onUpdateBinding]);

  const drivingActions = CONTROL_ACTION_LABELS.filter((a) => a.category === 'Driving');
  const toolActions = CONTROL_ACTION_LABELS.filter((a) => a.category === 'Camera & Tools');

  const handleCopyGhost = async (key: string, ghost: GhostRunData) => {
    try {
      const code = exportGhostShareCode(ghost);
      await navigator.clipboard.writeText(code);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      setGhostFeedback({ ok: false, msg: 'Clipboard unavailable in this browser context.' });
    }
  };

  const handleImportGhost = () => {
    const res = importGhostShareCode(ghostImportRaw);
    if (res.ok) {
      soundEngine.triggerUpgradeClunk();
      setGhostImportRaw('');
      setRecordsRefresh((n) => n + 1);
      const trackName = TRACKS.find((t) => t.id === res.data.trackId)?.name ?? res.data.trackId;
      setGhostFeedback({
        ok: true,
        msg: `Imported ghost for ${trackName} (${res.data.mode.toUpperCase()} · ${formatTimeMs(res.data.timeMs)})`,
      });
    } else {
      setGhostFeedback({ ok: false, msg: res.error });
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#06070A]/82 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col nfs-chamfer nfs-carbon-bg border border-white/18 border-l-4 border-l-amber-400 shadow-2xl overflow-hidden">
        <div className="h-1.5 w-full nfs-hazard-stripe border-b border-white/10 shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 bg-[#0A0C11] border-b border-white/12 shrink-0">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="font-display italic uppercase tracking-wider text-xl font-bold text-white leading-none">
                Driver &amp; System Settings
              </h2>
              <p className="text-[11px] font-mono-tabular text-slate-400 mt-0.5">
                Saved offline automatically · Physics AI, Rewind, Ghosts &amp; Controls
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              soundEngine.triggerUiClick();
              onClose();
            }}
            className="p-1.5 nfs-chamfer-sm bg-white/8 hover:bg-white/16 border border-white/15 text-slate-300 hover:text-white cursor-pointer"
            aria-label="Close Settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sub-Tabs */}
        <div className="flex flex-wrap items-center gap-2 px-5 pt-3 pb-2 bg-[#0D1017] border-b border-white/10 shrink-0">
          <button
            type="button"
            onClick={() => {
              soundEngine.triggerUiClick();
              setTab('display');
            }}
            className={`px-3.5 py-1.5 nfs-chamfer-sm font-display uppercase tracking-wider font-bold text-xs flex items-center gap-1.5 border cursor-pointer transition-colors ${
              tab === 'display'
                ? 'bg-amber-400 text-black border-amber-300'
                : 'bg-[#141822] text-slate-300 border-white/15 hover:text-white'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Graphics &amp; Handling</span>
          </button>
          <button
            type="button"
            onClick={() => {
              soundEngine.triggerUiClick();
              setTab('ai');
            }}
            className={`px-3.5 py-1.5 nfs-chamfer-sm font-display uppercase tracking-wider font-bold text-xs flex items-center gap-1.5 border cursor-pointer transition-colors ${
              tab === 'ai'
                ? 'bg-amber-400 text-black border-amber-300'
                : 'bg-[#141822] text-slate-300 border-white/15 hover:text-white'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>AI, Rewind &amp; Ghosts</span>
          </button>
          <button
            type="button"
            onClick={() => {
              soundEngine.triggerUiClick();
              setTab('controls');
            }}
            className={`px-3.5 py-1.5 nfs-chamfer-sm font-display uppercase tracking-wider font-bold text-xs flex items-center gap-1.5 border cursor-pointer transition-colors ${
              tab === 'controls'
                ? 'bg-amber-400 text-black border-amber-300'
                : 'bg-[#141822] text-slate-300 border-white/15 hover:text-white'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>Keybindings &amp; Gamepad</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {tab === 'display' ? (
            <>
              {/* Graphics Quality */}
              <section className="space-y-2">
                <div className="text-xs font-display uppercase tracking-wider font-bold text-amber-400">
                  Graphics Quality
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {(['low', 'medium', 'high'] as GraphicsQuality[]).map((qKey) => {
                    const spec = GRAPHICS_QUALITY_PRESETS[qKey];
                    const active = graphicsQuality === qKey;
                    return (
                      <button
                        key={qKey}
                        type="button"
                        onClick={() => {
                          soundEngine.triggerUiClick();
                          onChangeGraphicsQuality(qKey);
                        }}
                        className={`text-left p-3 nfs-chamfer-sm border transition-colors cursor-pointer ${
                          active
                            ? 'bg-amber-400/15 border-amber-400 text-white'
                            : 'bg-[#0C0F16] border-white/12 text-slate-300 hover:border-white/30'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-display uppercase font-bold text-sm">{spec.label}</span>
                          {active && (
                            <span className="text-[10px] font-mono-tabular uppercase font-bold text-amber-300">
                              ACTIVE
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 leading-snug">{spec.description}</p>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Touch Controls */}
              <section className="space-y-2 pt-3 border-t border-white/10">
                <div className="flex items-center gap-2 text-xs font-display uppercase tracking-wider font-bold text-cyan-300">
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>On-Screen Touch Controls</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'auto', label: 'Auto (Mobile)', desc: 'Shows on small/touch viewports' },
                      { id: 'always', label: 'Always On', desc: 'Visible on all screen sizes' },
                      { id: 'off', label: 'Off', desc: 'Hide touch buttons completely' },
                    ] as { id: TouchControlsMode; label: string; desc: string }[]
                  ).map((opt) => {
                    const active = touchControlsMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          soundEngine.triggerUiClick();
                          onChangeTouchControlsMode(opt.id);
                        }}
                        className={`text-left p-2.5 nfs-chamfer-sm border transition-colors cursor-pointer ${
                          active
                            ? 'bg-cyan-500/18 border-cyan-400 text-white'
                            : 'bg-[#0C0F16] border-white/12 text-slate-300 hover:border-white/30'
                        }`}
                      >
                        <div className="font-display uppercase font-bold text-xs">{opt.label}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">{opt.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Handling Mode & Assists */}
              <section className="space-y-2.5 pt-3 border-t border-white/10">
                <div className="text-xs font-display uppercase tracking-wider font-bold text-amber-400">
                  Default Handling Mode &amp; Assists
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['arcade', 'balanced', 'sim_lite'] as HandlingMode[]).map((mKey) => {
                    const m = HANDLING_PRESETS[mKey];
                    const active = handlingMode === mKey;
                    return (
                      <button
                        key={mKey}
                        type="button"
                        onClick={() => {
                          soundEngine.triggerUiClick();
                          onSelectHandlingMode(mKey);
                        }}
                        className={`p-2.5 nfs-chamfer-sm border text-left transition-colors cursor-pointer ${
                          active
                            ? 'bg-amber-400 text-black border-amber-300'
                            : 'bg-[#0C0F16] text-slate-200 border-white/12 hover:border-amber-400/50'
                        }`}
                      >
                        <div className="font-display uppercase font-bold text-xs">{m.label}</div>
                        <div className={`text-[10px] mt-0.5 leading-tight ${active ? 'text-black/80' : 'text-slate-400'}`}>
                          {m.tagline}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {ASSIST_LABELS.map((item) => {
                    const enabled = assists[item.key];
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          soundEngine.triggerUiClick();
                          onToggleAssist(item.key);
                        }}
                        className="text-left px-3 py-2 nfs-chamfer-sm bg-[#0C0F16] hover:bg-[#131823] border border-white/12 flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white truncate">{item.label}</div>
                          <div className="text-[10px] text-slate-400 leading-tight">{item.explanation}</div>
                        </div>
                        <span
                          className={`shrink-0 px-2 py-0.5 text-[10px] font-mono-tabular font-bold uppercase nfs-chamfer-sm border ${
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

              {/* Atmosphere, Dynamic Weather & Police */}
              <section className="space-y-2.5 pt-3 border-t border-white/10">
                <div className="flex items-center gap-2 text-xs font-display uppercase tracking-wider font-bold text-cyan-300">
                  <CloudRain className="w-3.5 h-3.5" />
                  <span>Dynamic Weather, Day/Night &amp; Police Patrols</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {WEATHER_MODE_OPTIONS.map((wOpt) => {
                    const active = weatherMode === wOpt.id;
                    return (
                      <button
                        key={wOpt.id}
                        type="button"
                        onClick={() => {
                          soundEngine.triggerUiClick();
                          onChangeWeatherMode(wOpt.id);
                        }}
                        className={`text-left p-2.5 nfs-chamfer-sm border transition-colors cursor-pointer ${
                          active
                            ? 'bg-cyan-500/18 border-cyan-400 text-white'
                            : 'bg-[#0C0F16] border-white/12 text-slate-300 hover:border-white/30'
                        }`}
                      >
                        <div className="font-display uppercase font-bold text-xs">{wOpt.label}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">{wOpt.desc}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.triggerUiClick();
                      onToggleDynamicDayNight();
                    }}
                    className="text-left px-3 py-2 nfs-chamfer-sm bg-[#0C0F16] hover:bg-[#131823] border border-white/12 flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white truncate">Dynamic Day / Night Loop</div>
                        <div className="text-[10px] text-slate-400 leading-tight">
                          Sun angle &amp; ambient exposure shift live
                        </div>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 px-2 py-0.5 text-[10px] font-mono-tabular font-bold uppercase nfs-chamfer-sm border ${
                        dynamicDayNight
                          ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300'
                          : 'bg-white/6 border-white/15 text-slate-400'
                      }`}
                    >
                      {dynamicDayNight ? 'ON' : 'OFF'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.triggerUiClick();
                      onTogglePoliceEnabled();
                    }}
                    className="text-left px-3 py-2 nfs-chamfer-sm bg-[#0C0F16] hover:bg-[#131823] border border-white/12 flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Shield className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white truncate">Police Patrols (Pure Racing Toggle)</div>
                        <div className="text-[10px] text-slate-400 leading-tight">
                          Disable patrols in races &amp; free roam
                        </div>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 px-2 py-0.5 text-[10px] font-mono-tabular font-bold uppercase nfs-chamfer-sm border ${
                        policeEnabled
                          ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300'
                          : 'bg-red-500/20 border-red-400/60 text-red-300'
                      }`}
                    >
                      {policeEnabled ? 'ON' : 'OFF'}
                    </span>
                  </button>
                </div>
              </section>
            </>
          ) : tab === 'ai' ? (
            <>
              {/* Physics AI Controls */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-display uppercase tracking-wider font-bold text-amber-400">
                      Physics AI Rivals &amp; Adaptive Intensity
                    </div>
                    <p className="text-[11px] text-slate-400">
                      AI obeys the exact same 120 Hz tire, gearbox, and barrier physics — no teleporting or wall clipping.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.triggerUiClick();
                      onResetAiSettings();
                    }}
                    className="px-2.5 py-1 nfs-chamfer-sm bg-[#161B26] hover:bg-[#1F2636] border border-white/15 text-[10px] font-mono-tabular uppercase text-slate-200 flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Default ({Math.round(DEFAULT_AI_SETTINGS.pace * 100)}%)</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="p-3 nfs-chamfer-sm bg-[#0C0F16] border border-white/12 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-mono-tabular">
                      <span className="font-semibold text-white">AI Pace</span>
                      <span className="text-amber-300 font-bold">{Math.round(aiSettings.pace * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0.75}
                      max={1.25}
                      step={0.02}
                      value={aiSettings.pace}
                      onChange={(e) => onChangeAiSettings({ pace: parseFloat(e.target.value) })}
                      className="w-full accent-amber-400 cursor-pointer"
                    />
                    <div className="text-[10px] text-slate-400">Corner entry speed &amp; throttle exit push</div>
                  </div>

                  <div className="p-3 nfs-chamfer-sm bg-[#0C0F16] border border-white/12 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-mono-tabular">
                      <span className="font-semibold text-white">Aggression</span>
                      <span className="text-amber-300 font-bold">{Math.round(aiSettings.aggression * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={aiSettings.aggression}
                      onChange={(e) => onChangeAiSettings({ aggression: parseFloat(e.target.value) })}
                      className="w-full accent-amber-400 cursor-pointer"
                    />
                    <div className="text-[10px] text-slate-400">Slipstream lunges, defensive blocks &amp; NOS usage</div>
                  </div>

                  <div className="p-3 nfs-chamfer-sm bg-[#0C0F16] border border-white/12 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-mono-tabular">
                      <span className="font-semibold text-white">Mistake Rate</span>
                      <span className="text-cyan-300 font-bold">{Math.round(aiSettings.mistakeRate * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={aiSettings.mistakeRate}
                      onChange={(e) => onChangeAiSettings({ mistakeRate: parseFloat(e.target.value) })}
                      className="w-full accent-cyan-400 cursor-pointer"
                    />
                    <div className="text-[10px] text-slate-400">Human late-braking &amp; corner exit bobbles</div>
                  </div>
                </div>

                {/* Rubber-Banding */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-display uppercase tracking-wider font-bold text-slate-300">
                    Rubber-Banding Mode
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(['off', 'light', 'classic'] as RubberBandingMode[]).map((rb) => {
                      const info = RUBBER_BANDING_LABELS[rb];
                      const active = aiSettings.rubberBanding === rb;
                      return (
                        <button
                          key={rb}
                          type="button"
                          onClick={() => {
                            soundEngine.triggerUiClick();
                            onChangeAiSettings({ rubberBanding: rb });
                          }}
                          className={`text-left p-2.5 nfs-chamfer-sm border transition-colors cursor-pointer ${
                            active
                              ? 'bg-amber-400/15 border-amber-400 text-white'
                              : 'bg-[#0C0F16] border-white/12 text-slate-300 hover:border-white/30'
                          }`}
                        >
                          <div className="font-display uppercase font-bold text-xs">{info.label}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">{info.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Toggles */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.triggerUiClick();
                      onChangeAiSettings({ adaptiveIntensity: !aiSettings.adaptiveIntensity });
                    }}
                    className="text-left px-3 py-2 nfs-chamfer-sm bg-[#0C0F16] hover:bg-[#131823] border border-white/12 flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <div>
                      <div className="text-xs font-semibold text-white">Adaptive Intensity</div>
                      <div className="text-[10px] text-slate-400 leading-tight">Pack stays fierce even on Easy</div>
                    </div>
                    <span
                      className={`px-2 py-0.5 text-[10px] font-mono-tabular font-bold uppercase nfs-chamfer-sm border ${
                        aiSettings.adaptiveIntensity
                          ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300'
                          : 'bg-white/6 border-white/15 text-slate-400'
                      }`}
                    >
                      {aiSettings.adaptiveIntensity ? 'ON' : 'OFF'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.triggerUiClick();
                      onToggleShowGhost();
                    }}
                    className="text-left px-3 py-2 nfs-chamfer-sm bg-[#0C0F16] hover:bg-[#131823] border border-white/12 flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <div>
                      <div className="text-xs font-semibold text-white">Best Run Ghost [G]</div>
                      <div className="text-[10px] text-slate-400 leading-tight">Cyan holographic personal best</div>
                    </div>
                    <span
                      className={`px-2 py-0.5 text-[10px] font-mono-tabular font-bold uppercase nfs-chamfer-sm border ${
                        showGhost
                          ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-300'
                          : 'bg-white/6 border-white/15 text-slate-400'
                      }`}
                    >
                      {showGhost ? 'ON' : 'OFF'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.triggerUiClick();
                      onToggleSkipCountdown();
                    }}
                    className="text-left px-3 py-2 nfs-chamfer-sm bg-[#0C0F16] hover:bg-[#131823] border border-white/12 flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <div>
                      <div className="text-xs font-semibold text-white">Fast Restart Grid</div>
                      <div className="text-[10px] text-slate-400 leading-tight">Skip countdown on [Bksp] restart</div>
                    </div>
                    <span
                      className={`px-2 py-0.5 text-[10px] font-mono-tabular font-bold uppercase nfs-chamfer-sm border ${
                        skipCountdownOnRestart
                          ? 'bg-amber-400/20 border-amber-400/60 text-amber-300'
                          : 'bg-white/6 border-white/15 text-slate-400'
                      }`}
                    >
                      {skipCountdownOnRestart ? 'ON' : 'OFF'}
                    </span>
                  </button>
                </div>
              </section>

              {/* Offline Best Records & Ghost Share */}
              <section className="space-y-2.5 pt-3 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-display uppercase tracking-wider font-bold text-cyan-300">
                    <Trophy className="w-3.5 h-3.5" />
                    <span>Offline Track Records &amp; Ghost Share</span>
                  </div>
                  <span className="text-[10px] font-mono-tabular text-slate-400">
                    {offlineRecords.length} record{offlineRecords.length === 1 ? '' : 's'} saved locally
                  </span>
                </div>

                {offlineRecords.length === 0 ? (
                  <div className="p-3 nfs-chamfer-sm bg-[#0C0F16] border border-white/10 text-xs text-slate-400">
                    Finish a Sprint, Circuit, Tollbooth, or Blacklist duel to record your personal best &amp; ghost car offline.
                  </div>
                ) : (
                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                    {offlineRecords.map((rec) => {
                      const k = `${rec.trackId}::${rec.mode}`;
                      const ghost = savedGhosts[k];
                      const trackName = TRACKS.find((t) => t.id === rec.trackId)?.name ?? rec.trackId;
                      return (
                        <div
                          key={k}
                          className="flex items-center justify-between gap-2 px-3 py-2 nfs-chamfer-sm bg-[#0C0F16] border border-white/10 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-white truncate">
                              {trackName}{' '}
                              <span className="text-[10px] font-mono-tabular uppercase text-amber-400">
                                [{rec.mode}]
                              </span>
                            </div>
                            <div className="text-[10px] font-mono-tabular text-slate-400 truncate">
                              {rec.carName} · Best Lap {formatTimeMs(rec.bestLapMs)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono-tabular font-bold text-emerald-400">
                              {formatTimeMs(rec.timeMs)}
                            </span>
                            {ghost && (
                              <button
                                type="button"
                                onClick={() => void handleCopyGhost(k, ghost)}
                                className="px-2 py-1 nfs-chamfer-sm bg-[#161B26] hover:bg-cyan-500/20 border border-cyan-400/40 text-[10px] font-mono-tabular font-bold text-cyan-200 flex items-center gap-1 cursor-pointer"
                              >
                                {copiedKey === k ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                <span>{copiedKey === k ? 'COPIED' : 'GHOST'}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Import Ghost JSON Share Code */}
                <div className="p-3 nfs-chamfer-sm bg-[#0C0F16] border border-white/12 space-y-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-display uppercase tracking-wider font-bold text-slate-200">
                    <Ghost className="w-3.5 h-3.5 text-cyan-300" />
                    <span>Import Challenger Ghost Share JSON</span>
                  </div>
                  <div className="flex gap-2">
                    <textarea
                      rows={2}
                      value={ghostImportRaw}
                      onChange={(e) => setGhostImportRaw(e.target.value)}
                      placeholder='Paste exported ghost JSON string here...'
                      className="flex-1 bg-[#080A0F] border border-white/15 px-2.5 py-1.5 text-[11px] font-mono-tabular text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                    />
                    <button
                      type="button"
                      onClick={handleImportGhost}
                      className="px-3 py-1.5 nfs-chamfer-sm bg-cyan-500/25 hover:bg-cyan-500/35 border border-cyan-400/60 text-cyan-200 font-display uppercase font-bold text-xs flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Import</span>
                    </button>
                  </div>
                  {ghostFeedback && (
                    <div
                      className={`text-[11px] font-mono-tabular ${
                        ghostFeedback.ok ? 'text-emerald-300' : 'text-red-400'
                      }`}
                    >
                      {ghostFeedback.msg}
                    </div>
                  )}
                </div>
              </section>
            </>
          ) : (
            <>
              {/* Gamepad Status */}
              <section className="p-3.5 nfs-chamfer-sm bg-[#0C0F16] border border-white/12 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-display uppercase tracking-wider font-bold text-cyan-300">
                    <Gamepad2 className="w-4 h-4" />
                    <span>Gamepad Controller</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-mono-tabular font-bold uppercase nfs-chamfer-sm border ${
                      gamepadConnected
                        ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300'
                        : 'bg-white/6 border-white/15 text-slate-400'
                    }`}
                  >
                    {gamepadConnected ? 'CONNECTED' : 'NOT DETECTED'}
                  </span>
                </div>
                <div className="text-[11px] font-mono-tabular text-slate-300 truncate">
                  {gamepadConnected && gamepadId
                    ? gamepadId
                    : 'Press any button on an Xbox / PlayStation / USB gamepad to activate analog triggers & steering.'}
                </div>
                <div className="text-[10px] font-mono-tabular text-slate-400 pt-1 border-t border-white/8">
                  RT/A: Throttle · LT/X: Brake · L-Stick: Analog Steer · B: Handbrake · RB/Y: NOS · LB: Breaker · Start: Pause · Back: Camera · D-Pad Up: Reset
                </div>
              </section>

              {/* Quick Look/Drive Layout & Reset */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.triggerUiClick();
                    onToggleAeLook();
                  }}
                  className={`px-3 py-1.5 nfs-chamfer-sm border text-xs font-mono-tabular font-bold uppercase cursor-pointer transition-colors ${
                    aeLookEnabled
                      ? 'bg-cyan-500/18 border-cyan-400/60 text-cyan-200'
                      : 'bg-[#131722] border-white/20 text-slate-200'
                  }`}
                >
                  {aeLookEnabled ? 'Preset: Arrows Drive + A/E Look' : 'Preset: WASD Drive + Q/E Look'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.triggerUiClick();
                    onResetBindings();
                  }}
                  className="px-3 py-1.5 nfs-chamfer-sm bg-[#161B26] hover:bg-[#1F2636] border border-white/20 text-xs font-display uppercase tracking-wider font-bold text-slate-200 flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Defaults</span>
                </button>
              </div>

              {/* Remappable Keys Table */}
              {[
                { title: 'Driving Controls', items: drivingActions },
                { title: 'Camera, Audio & Tools', items: toolActions },
              ].map((group) => (
                <section key={group.title} className="space-y-1.5">
                  <div className="text-[11px] font-display uppercase tracking-wider font-bold text-amber-400">
                    {group.title}
                  </div>
                  <div className="space-y-1">
                    {group.items.map(({ action, label }) => {
                      const pair = controlBindings[action];
                      const capPrimary = listening?.action === action && listening.slot === 'primary';
                      const capSecondary = listening?.action === action && listening.slot === 'secondary';
                      return (
                        <div
                          key={action}
                          className="flex items-center justify-between gap-3 px-3 py-1.5 nfs-chamfer-sm bg-[#0C0F16] border border-white/10"
                        >
                          <span className="text-xs font-medium text-slate-200">{label}</span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setListening({ action, slot: 'primary' })}
                              className={`min-w-[84px] px-2.5 py-1 nfs-chamfer-sm border text-[11px] font-mono-tabular font-bold cursor-pointer transition-colors ${
                                capPrimary
                                  ? 'bg-amber-400 text-black border-amber-300'
                                  : 'bg-[#161B26] hover:border-amber-400/60 text-white border-white/18'
                              }`}
                            >
                              {capPrimary ? 'PRESS KEY...' : formatKeyCode(pair.primary)}
                            </button>
                            <button
                              type="button"
                              onClick={() => setListening({ action, slot: 'secondary' })}
                              className={`min-w-[84px] px-2.5 py-1 nfs-chamfer-sm border text-[11px] font-mono-tabular cursor-pointer transition-colors ${
                                capSecondary
                                  ? 'bg-amber-400 text-black border-amber-300 font-bold'
                                  : 'bg-[#11151E] hover:border-amber-400/50 text-slate-300 border-white/12'
                              }`}
                            >
                              {capSecondary ? 'PRESS KEY...' : formatKeyCode(pair.secondary)}
                            </button>
                            {pair.secondary && (
                              <button
                                type="button"
                                onClick={() => onUpdateBinding(action, 'secondary', undefined)}
                                title="Clear secondary key"
                                className="px-1.5 py-1 text-[10px] font-mono-tabular text-slate-400 hover:text-red-400 cursor-pointer"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#0A0C11] border-t border-white/12 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={() => {
              soundEngine.triggerUiClick();
              onClose();
            }}
            className="px-5 py-2 nfs-chamfer-sm bg-amber-400 hover:bg-amber-300 text-black font-display uppercase tracking-wider font-bold text-xs cursor-pointer transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

