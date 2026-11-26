import { CarSpec } from '../types/game';
import type { ConcreteEngineSoundProfile } from '../three/gameplayUpgrades';
import {
  clampAudioValue,
  MAX_CONCURRENT_SFX_VOICES,
  SFX_COOLDOWN_MS,
  shouldTriggerCooldown,
} from './audioSafety';

export type EngineCharacter = ConcreteEngineSoundProfile | CarSpec['bodyStyle'];

interface EngineAcousticProfile {
  mainHarmonics: number[];
  harmHarmonics: number[];
  pitchScale: number;
  detuneRatio: number;
  harmRatio: number;
  idleChopRate: number;
  chopIdleDepth: number;
  chopLoadDepth: number;
  raspMult: number;
  hasTurbo: boolean;
  isElectric: boolean;
  gearWhineBase: number;
  barkBaseHz: number;
  barkRangeHz: number;
}

const ENGINE_ACOUSTICS: Record<ConcreteEngineSoundProfile, EngineAcousticProfile> = {
  i4_turbo: {
    mainHarmonics: [1.0, 0.82, 0.56, 0.36, 0.22, 0.12, 0.06],
    harmHarmonics: [0.48, 0.94, 0.62, 0.32, 0.16],
    pitchScale: 0.92,
    detuneRatio: 1.011,
    harmRatio: 1.5,
    idleChopRate: 15.5,
    chopIdleDepth: 0.028,
    chopLoadDepth: 0.014,
    raspMult: 1.28,
    hasTurbo: true,
    isElectric: false,
    gearWhineBase: 0.008,
    barkBaseHz: 540,
    barkRangeHz: 620,
  },
  v6_twin_turbo: {
    mainHarmonics: [1.0, 0.84, 0.72, 0.52, 0.34, 0.20, 0.09],
    harmHarmonics: [0.58, 0.96, 0.80, 0.48, 0.25],
    pitchScale: 1.02,
    detuneRatio: 1.012,
    harmRatio: 1.5,
    idleChopRate: 16,
    chopIdleDepth: 0.025,
    chopLoadDepth: 0.014,
    raspMult: 1.34,
    hasTurbo: true,
    isElectric: false,
    gearWhineBase: 0.018,
    barkBaseHz: 590,
    barkRangeHz: 680,
  },
  v8_muscle: {
    mainHarmonics: [1.0, 0.98, 0.78, 0.56, 0.36, 0.20, 0.09],
    harmHarmonics: [0.88, 0.96, 0.74, 0.44, 0.22],
    pitchScale: 0.64,
    detuneRatio: 1.02,
    harmRatio: 1.333,
    idleChopRate: 10.6,
    chopIdleDepth: 0.058,
    chopLoadDepth: 0.02,
    raspMult: 1.42,
    hasTurbo: false,
    isElectric: false,
    gearWhineBase: 0.011,
    barkBaseHz: 430,
    barkRangeHz: 420,
  },
  v10_screamer: {
    mainHarmonics: [0.90, 1.0, 0.88, 0.64, 0.44, 0.26, 0.13],
    harmHarmonics: [0.46, 0.94, 0.92, 0.58, 0.32],
    pitchScale: 1.26,
    detuneRatio: 1.007,
    harmRatio: 2.0,
    idleChopRate: 20,
    chopIdleDepth: 0.016,
    chopLoadDepth: 0.011,
    raspMult: 1.36,
    hasTurbo: false,
    isElectric: false,
    gearWhineBase: 0.019,
    barkBaseHz: 690,
    barkRangeHz: 780,
  },
  v12_hyper: {
    mainHarmonics: [0.88, 1.0, 0.94, 0.74, 0.52, 0.32, 0.16],
    harmHarmonics: [0.40, 0.98, 0.94, 0.66, 0.38],
    pitchScale: 1.4,
    detuneRatio: 1.006,
    harmRatio: 2.0,
    idleChopRate: 22,
    chopIdleDepth: 0.014,
    chopLoadDepth: 0.009,
    raspMult: 1.24,
    hasTurbo: false,
    isElectric: false,
    gearWhineBase: 0.021,
    barkBaseHz: 740,
    barkRangeHz: 820,
  },
  rotary_brap: {
    mainHarmonics: [0.98, 0.92, 0.80, 0.66, 0.48, 0.30, 0.15],
    harmHarmonics: [0.76, 0.98, 0.88, 0.62, 0.34],
    pitchScale: 1.46,
    detuneRatio: 1.022,
    harmRatio: 2.0,
    idleChopRate: 8.6,
    chopIdleDepth: 0.075,
    chopLoadDepth: 0.022,
    raspMult: 1.48,
    hasTurbo: true,
    isElectric: false,
    gearWhineBase: 0.015,
    barkBaseHz: 650,
    barkRangeHz: 740,
  },
  flat6_gt: {
    mainHarmonics: [0.98, 0.86, 0.72, 0.54, 0.36, 0.22, 0.10],
    harmHarmonics: [0.64, 0.92, 0.80, 0.52, 0.28],
    pitchScale: 1.12,
    detuneRatio: 1.015,
    harmRatio: 1.5,
    idleChopRate: 13.5,
    chopIdleDepth: 0.032,
    chopLoadDepth: 0.015,
    raspMult: 1.38,
    hasTurbo: false,
    isElectric: false,
    gearWhineBase: 0.02,
    barkBaseHz: 610,
    barkRangeHz: 700,
  },
  electric_whine: {
    mainHarmonics: [0.95, 0.18, 0.06, 0.02],
    harmHarmonics: [0.85, 0.28, 0.1],
    pitchScale: 1.85,
    detuneRatio: 1.002,
    harmRatio: 2.0,
    idleChopRate: 16,
    chopIdleDepth: 0.0,
    chopLoadDepth: 0.0,
    raspMult: 0.0,
    hasTurbo: false,
    isElectric: true,
    gearWhineBase: 0.032,
    barkBaseHz: 900,
    barkRangeHz: 900,
  },
};

function normalizeEngineStyle(style: EngineCharacter): ConcreteEngineSoundProfile {
  if (style in ENGINE_ACOUSTICS) {
    return style as ConcreteEngineSoundProfile;
  }
  switch (style) {
    case 'muscle':
      return 'v8_muscle';
    case 'gtr':
      return 'v6_twin_turbo';
    case 'exotic':
      return 'v10_screamer';
    case 'sedan':
    case 'coupe':
    default:
      return 'i4_turbo';
  }
}

function createExhaustWave(ctx: AudioContext, harmonics: number[]): PeriodicWave {
  const real = new Float32Array(harmonics.length + 1);
  const imag = new Float32Array(harmonics.length + 1);
  for (let i = 0; i < harmonics.length; i++) {
    imag[i + 1] = harmonics[i];
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

function makeWarmSaturationCurve(drive = 2.0): Float32Array<ArrayBuffer> {
  const samples = 1024;
  const buffer = new ArrayBuffer(samples * 4);
  const curve = new Float32Array(buffer);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.tanh(x * drive + 0.12 * x * x - 0.03 * x * x * x);
  }
  return curve;
}

function makeBrickwallSafetyCurve(ceiling = 0.92): Float32Array<ArrayBuffer> {
  const samples = 1024;
  const buffer = new ArrayBuffer(samples * 4);
  const curve = new Float32Array(buffer);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    // Softly saturates hot transients and strictly caps output below 0 dBFS
    curve[i] = Math.tanh(x * 1.1) * ceiling;
  }
  return curve;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterMixBus: GainNode | null = null;
  private masterCompressor: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private safetyLimiter: DynamicsCompressorNode | null = null;
  private safetyClipper: WaveShaperNode | null = null;
  private musicGain: GainNode | null = null;
  private garageHallSend: GainNode | null = null;

  // Multi-voice combustion engine synth
  private engineOscMain: OscillatorNode | null = null;
  private engineOscBankB: OscillatorNode | null = null;
  private engineOscHarm: OscillatorNode | null = null;
  private engineOscSub: OscillatorNode | null = null;
  private engineBankBGain: GainNode | null = null;
  private engineHarmGain: GainNode | null = null;
  private engineSubGain: GainNode | null = null;

  // Combustion firing-pulse noise rasp
  private raspFilter: BiquadFilterNode | null = null;
  private raspVca: GainNode | null = null;
  private raspModOsc: OscillatorNode | null = null;
  private raspModDepth: GainNode | null = null;

  // Cam-lobe chop placed BEFORE final engine fader so gain never swings negative when muted/idle
  private chopLfo: OscillatorNode | null = null;
  private chopDepth: GainNode | null = null;
  private engineChopVca: GainNode | null = null;

  private gearWhineOsc: OscillatorNode | null = null;
  private gearWhineFilter: BiquadFilterNode | null = null;
  private gearWhineGain: GainNode | null = null;

  private engineShaper: WaveShaperNode | null = null;
  private engineCabinet: BiquadFilterNode | null = null;
  private engineBarkFilter: BiquadFilterNode | null = null;
  private engineLowpass: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private tunnelSendGain: GainNode | null = null;

  // Dynamic mechanical & environment noise layers
  private intakeFilter: BiquadFilterNode | null = null;
  private intakeGain: GainNode | null = null;
  private turboSpoolFilter: BiquadFilterNode | null = null;
  private turboSpoolGain: GainNode | null = null;
  private nosNoiseFilter: BiquadFilterNode | null = null;
  private nosNoiseGain: GainNode | null = null;

  // 3-layer tire friction
  private tireScrubFilter: BiquadFilterNode | null = null;
  private tireScrubGain: GainNode | null = null;
  private tireLowFilter: BiquadFilterNode | null = null;
  private tireLowGain: GainNode | null = null;
  private tireHighFilter: BiquadFilterNode | null = null;
  private tireHighGain: GainNode | null = null;

  private curbRumbleGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private scrapeFilter: BiquadFilterNode | null = null;
  private scrapeGain: GainNode | null = null;

  // Horn-filtered RPD Police Siren
  private sirenOscA: OscillatorNode | null = null;
  private sirenOscB: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;

  private noiseBuffer: AudioBuffer | null = null;
  private warmCurve: Float32Array<ArrayBuffer> | null = null;
  private waves: Partial<Record<ConcreteEngineSoundProfile, { main: PeriodicWave; harm: PeriodicWave }>> = {};
  private muted = false;
  private initialized = false;
  private lastGear = 1;
  private prevThrottle = false;
  private prevNos = false;
  private popCooldown = 0;
  private blowoffCooldown = 0;
  private lastUpdatePerfMs = 0;
  private carStyle: ConcreteEngineSoundProfile = 'i4_turbo';

  private activeVoices = 0;
  private lastSfxMs: Record<keyof typeof SFX_COOLDOWN_MS, number> = {
    impact: -1,
    woodSmash: -1,
    exhaustPop: -1,
    turboBlowoff: -1,
    beep: -1,
    landingThump: -1,
    garageRev: -1,
    cameraFlash: -1,
    radioSquelch: -1,
    upgradeClunk: -1,
    uiClick: -1,
    perfectLaunch: -1,
    comboMilestone: -1,
    gearShift: -1,
  };
  private scheduledTimeouts = new Set<number>();
  private resumeListenerAttached = false;

  public init() {
    if (this.initialized) {
      this.ensureRunning();
      return;
    }
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx({ latencyHint: 'interactive' });

    // Master signal chain:
    // masterMixBus -> masterCompressor (soft glue) -> masterGain -> safetyLimiter (brickwall) -> safetyClipper (-0.7 dBFS) -> destination
    this.masterMixBus = this.ctx.createGain();
    this.masterMixBus.gain.value = 1.0;

    this.masterCompressor = this.ctx.createDynamicsCompressor();
    this.masterCompressor.threshold.value = -15;
    this.masterCompressor.knee.value = 12;
    this.masterCompressor.ratio.value = 3.2;
    this.masterCompressor.attack.value = 0.004;
    this.masterCompressor.release.value = 0.16;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.54;

    this.safetyLimiter = this.ctx.createDynamicsCompressor();
    this.safetyLimiter.threshold.value = -2.5;
    this.safetyLimiter.knee.value = 0;
    this.safetyLimiter.ratio.value = 20;
    this.safetyLimiter.attack.value = 0.001;
    this.safetyLimiter.release.value = 0.08;

    this.safetyClipper = this.ctx.createWaveShaper();
    this.safetyClipper.curve = makeBrickwallSafetyCurve(0.92);
    this.safetyClipper.oversample = 'none';

    this.masterMixBus.connect(this.masterCompressor);
    this.masterCompressor.connect(this.masterGain);
    this.masterGain.connect(this.safetyLimiter);
    this.safetyLimiter.connect(this.safetyClipper);
    this.safetyClipper.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.52;
    this.musicGain.connect(this.masterMixBus);

    // Rich pink+brown+air textured noise buffer (3 seconds)
    const sampleRate = this.ctx.sampleRate;
    this.noiseBuffer = this.ctx.createBuffer(1, Math.floor(sampleRate * 3), sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.996 * b0 + white * 0.032;
      b1 = 0.982 * b1 + white * 0.038;
      b2 = 0.94 * b2 + white * 0.048;
      data[i] = (b0 + b1 + b2 + white * 0.18) * 0.45;
    }

    // Lightweight stereo ambience delay loop (zero FFT convolution overhead -> zero audio thread dropouts)
    const hallDelayL = this.ctx.createDelay(0.2);
    hallDelayL.delayTime.value = 0.052;
    const hallDelayR = this.ctx.createDelay(0.2);
    hallDelayR.delayTime.value = 0.079;
    const hallLp = this.ctx.createBiquadFilter();
    hallLp.type = 'lowpass';
    hallLp.frequency.value = 1550;
    const hallFb = this.ctx.createGain();
    hallFb.gain.value = 0.22;
    this.garageHallSend = this.ctx.createGain();
    this.garageHallSend.gain.value = 0.18;

    this.garageHallSend.connect(hallDelayL);
    hallDelayL.connect(hallDelayR);
    hallDelayR.connect(hallLp);
    hallLp.connect(hallFb);
    hallFb.connect(hallDelayL);
    hallLp.connect(this.masterMixBus);

    this.warmCurve = makeWarmSaturationCurve(3.4);

    const profileEntries = Object.keys(ENGINE_ACOUSTICS) as ConcreteEngineSoundProfile[];
    for (const key of profileEntries) {
      const spec = ENGINE_ACOUSTICS[key];
      this.waves[key] = {
        main: createExhaustWave(this.ctx, spec.mainHarmonics),
        harm: createExhaustWave(this.ctx, spec.harmHarmonics),
      };
    }

    this.engineShaper = this.ctx.createWaveShaper();
    this.engineShaper.curve = this.warmCurve;
    this.engineShaper.oversample = 'none';

    this.engineCabinet = this.ctx.createBiquadFilter();
    this.engineCabinet.type = 'peaking';
    this.engineCabinet.frequency.value = 145;
    this.engineCabinet.Q.value = 1.15;
    this.engineCabinet.gain.value = 4.6;

    this.engineBarkFilter = this.ctx.createBiquadFilter();
    this.engineBarkFilter.type = 'peaking';
    this.engineBarkFilter.frequency.value = 600;
    this.engineBarkFilter.Q.value = 1.45;
    this.engineBarkFilter.gain.value = 2.6;

    this.engineLowpass = this.ctx.createBiquadFilter();
    this.engineLowpass.type = 'lowpass';
    this.engineLowpass.frequency.value = 390;
    this.engineLowpass.Q.value = 1.05;

    this.engineChopVca = this.ctx.createGain();
    this.engineChopVca.gain.value = 1.0;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;

    this.engineOscMain = this.ctx.createOscillator();
    this.engineOscBankB = this.ctx.createOscillator();
    this.engineOscHarm = this.ctx.createOscillator();
    this.engineOscSub = this.ctx.createOscillator();
    this.engineOscSub.type = 'sine';

    this.engineBankBGain = this.ctx.createGain();
    this.engineBankBGain.gain.value = 0.64;
    this.engineHarmGain = this.ctx.createGain();
    this.engineHarmGain.gain.value = 0.46;
    this.engineSubGain = this.ctx.createGain();
    this.engineSubGain.gain.value = 0.66;

    // Cam-lobe chop modulates engineChopVca (nominal 1.0) so engineGain can cleanly reach 0
    this.chopLfo = this.ctx.createOscillator();
    this.chopLfo.type = 'sine';
    this.chopLfo.frequency.value = 14;
    this.chopDepth = this.ctx.createGain();
    this.chopDepth.gain.value = 0;
    this.chopLfo.connect(this.chopDepth);
    this.chopDepth.connect(this.engineChopVca.gain);
    this.chopLfo.start();

    // Firing-rate amplitude-modulated noise rasp: strictly positive VCA floor when active
    const raspSrc = this.ctx.createBufferSource();
    raspSrc.buffer = this.noiseBuffer;
    raspSrc.loop = true;
    this.raspFilter = this.ctx.createBiquadFilter();
    this.raspFilter.type = 'bandpass';
    this.raspFilter.frequency.value = 460;
    this.raspFilter.Q.value = 1.25;
    this.raspVca = this.ctx.createGain();
    this.raspVca.gain.value = 0;
    this.raspModOsc = this.ctx.createOscillator();
    this.raspModOsc.type = 'triangle';
    this.raspModOsc.frequency.value = 48;
    this.raspModDepth = this.ctx.createGain();
    this.raspModDepth.gain.value = 0;
    this.raspModOsc.connect(this.raspModDepth);
    this.raspModDepth.connect(this.raspVca.gain);
    raspSrc.connect(this.raspFilter);
    this.raspFilter.connect(this.raspVca);
    this.raspVca.connect(this.engineShaper);
    raspSrc.start();
    this.raspModOsc.start();

    this.engineOscMain.connect(this.engineShaper);
    this.engineOscBankB.connect(this.engineBankBGain);
    this.engineBankBGain.connect(this.engineShaper);
    this.engineOscHarm.connect(this.engineHarmGain);
    this.engineHarmGain.connect(this.engineShaper);
    this.engineOscSub.connect(this.engineSubGain);
    this.engineSubGain.connect(this.engineCabinet);

    this.engineShaper.connect(this.engineCabinet);
    this.engineCabinet.connect(this.engineBarkFilter);
    this.engineBarkFilter.connect(this.engineLowpass);
    this.engineLowpass.connect(this.engineChopVca);
    this.engineChopVca.connect(this.engineGain);
    this.engineGain.connect(this.masterMixBus);

    // Lightweight tunnel metallic slapback bus
    const tunnelDelay = this.ctx.createDelay(0.2);
    tunnelDelay.delayTime.value = 0.054;
    const tunnelFeedback = this.ctx.createGain();
    tunnelFeedback.gain.value = 0.28;
    const tunnelBand = this.ctx.createBiquadFilter();
    tunnelBand.type = 'bandpass';
    tunnelBand.frequency.value = 640;
    tunnelBand.Q.value = 0.8;
    this.tunnelSendGain = this.ctx.createGain();
    this.tunnelSendGain.gain.value = 0;

    this.engineGain.connect(this.tunnelSendGain);
    this.tunnelSendGain.connect(tunnelDelay);
    tunnelDelay.connect(tunnelBand);
    tunnelBand.connect(tunnelFeedback);
    tunnelFeedback.connect(tunnelDelay);
    tunnelBand.connect(this.masterMixBus);

    this.applyCarWaveform();
    this.engineOscMain.start();
    this.engineOscBankB.start();
    this.engineOscHarm.start();
    this.engineOscSub.start();

    // Cold airbox intake suction roar
    const intakeSrc = this.ctx.createBufferSource();
    intakeSrc.buffer = this.noiseBuffer;
    intakeSrc.loop = true;
    this.intakeFilter = this.ctx.createBiquadFilter();
    this.intakeFilter.type = 'bandpass';
    this.intakeFilter.frequency.value = 460;
    this.intakeFilter.Q.value = 1.3;
    this.intakeGain = this.ctx.createGain();
    this.intakeGain.gain.value = 0;
    intakeSrc.connect(this.intakeFilter);
    this.intakeFilter.connect(this.intakeGain);
    this.intakeGain.connect(this.masterMixBus);
    intakeSrc.start();

    // Sequential dog-box / straight-cut transmission whine (smoothed Q to avoid shrill ear fatigue)
    this.gearWhineOsc = this.ctx.createOscillator();
    this.gearWhineOsc.type = 'triangle';
    this.gearWhineOsc.frequency.value = 480;
    this.gearWhineFilter = this.ctx.createBiquadFilter();
    this.gearWhineFilter.type = 'bandpass';
    this.gearWhineFilter.frequency.value = 1100;
    this.gearWhineFilter.Q.value = 2.0;
    this.gearWhineGain = this.ctx.createGain();
    this.gearWhineGain.gain.value = 0;
    this.gearWhineOsc.connect(this.gearWhineFilter);
    this.gearWhineFilter.connect(this.gearWhineGain);
    this.gearWhineGain.connect(this.masterMixBus);
    this.gearWhineOsc.start();

    // Twin-scroll turbocharger compressor spool (tamed Q & ceiling frequency)
    const turboSrc = this.ctx.createBufferSource();
    turboSrc.buffer = this.noiseBuffer;
    turboSrc.loop = true;
    this.turboSpoolFilter = this.ctx.createBiquadFilter();
    this.turboSpoolFilter.type = 'bandpass';
    this.turboSpoolFilter.frequency.value = 1800;
    this.turboSpoolFilter.Q.value = 2.8;
    this.turboSpoolGain = this.ctx.createGain();
    this.turboSpoolGain.gain.value = 0;
    turboSrc.connect(this.turboSpoolFilter);
    this.turboSpoolFilter.connect(this.turboSpoolGain);
    this.turboSpoolGain.connect(this.masterMixBus);
    turboSrc.start();

    // Nitrous oxide purge + blue jet burn
    const nosSource = this.ctx.createBufferSource();
    nosSource.buffer = this.noiseBuffer;
    nosSource.loop = true;
    this.nosNoiseFilter = this.ctx.createBiquadFilter();
    this.nosNoiseFilter.type = 'bandpass';
    this.nosNoiseFilter.frequency.value = 740;
    this.nosNoiseFilter.Q.value = 0.9;
    this.nosNoiseGain = this.ctx.createGain();
    this.nosNoiseGain.gain.value = 0;
    nosSource.connect(this.nosNoiseFilter);
    this.nosNoiseFilter.connect(this.nosNoiseGain);
    this.nosNoiseGain.connect(this.masterMixBus);
    nosSource.start();

    // 3-Layer Tire Scrub + Rubber Howl + Soft High Squeal (gentle Q)
    const tireSource = this.ctx.createBufferSource();
    tireSource.buffer = this.noiseBuffer;
    tireSource.loop = true;

    this.tireScrubFilter = this.ctx.createBiquadFilter();
    this.tireScrubFilter.type = 'bandpass';
    this.tireScrubFilter.frequency.value = 440;
    this.tireScrubFilter.Q.value = 1.4;
    this.tireScrubGain = this.ctx.createGain();
    this.tireScrubGain.gain.value = 0;
    tireSource.connect(this.tireScrubFilter);
    this.tireScrubFilter.connect(this.tireScrubGain);
    this.tireScrubGain.connect(this.masterMixBus);

    this.tireLowFilter = this.ctx.createBiquadFilter();
    this.tireLowFilter.type = 'bandpass';
    this.tireLowFilter.frequency.value = 900;
    this.tireLowFilter.Q.value = 2.4;
    this.tireLowGain = this.ctx.createGain();
    this.tireLowGain.gain.value = 0;
    tireSource.connect(this.tireLowFilter);
    this.tireLowFilter.connect(this.tireLowGain);
    this.tireLowGain.connect(this.masterMixBus);

    this.tireHighFilter = this.ctx.createBiquadFilter();
    this.tireHighFilter.type = 'bandpass';
    this.tireHighFilter.frequency.value = 1650;
    this.tireHighFilter.Q.value = 2.3;
    this.tireHighGain = this.ctx.createGain();
    this.tireHighGain.gain.value = 0;
    tireSource.connect(this.tireHighFilter);
    this.tireHighFilter.connect(this.tireHighGain);
    this.tireHighGain.connect(this.masterMixBus);
    tireSource.start();

    // Shoulder Curb / Rumble Strip vibration noise
    const curbSrc = this.ctx.createBufferSource();
    curbSrc.buffer = this.noiseBuffer;
    curbSrc.loop = true;
    const curbFilter = this.ctx.createBiquadFilter();
    curbFilter.type = 'lowpass';
    curbFilter.frequency.value = 160;
    this.curbRumbleGain = this.ctx.createGain();
    this.curbRumbleGain.gain.value = 0;
    curbSrc.connect(curbFilter);
    curbFilter.connect(this.curbRumbleGain);
    this.curbRumbleGain.connect(this.masterMixBus);
    curbSrc.start();

    // Aerodynamic Wind & Slipstream Rush
    const windSrc = this.ctx.createBufferSource();
    windSrc.buffer = this.noiseBuffer;
    windSrc.loop = true;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 460;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    windSrc.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.masterMixBus);
    windSrc.start();

    // Concrete/Guardrail Spark Wall Scrape layer
    const scrapeSrc = this.ctx.createBufferSource();
    scrapeSrc.buffer = this.noiseBuffer;
    scrapeSrc.loop = true;
    this.scrapeFilter = this.ctx.createBiquadFilter();
    this.scrapeFilter.type = 'bandpass';
    this.scrapeFilter.frequency.value = 1750;
    this.scrapeFilter.Q.value = 1.5;
    this.scrapeGain = this.ctx.createGain();
    this.scrapeGain.gain.value = 0;
    scrapeSrc.connect(this.scrapeFilter);
    this.scrapeFilter.connect(this.scrapeGain);
    this.scrapeGain.connect(this.masterMixBus);
    scrapeSrc.start();

    // Warm Horn-Filtered RPD Police Siren
    this.sirenOscA = this.ctx.createOscillator();
    this.sirenOscA.type = 'sawtooth';
    this.sirenOscB = this.ctx.createOscillator();
    this.sirenOscB.type = 'triangle';
    const sirenHorn = this.ctx.createBiquadFilter();
    sirenHorn.type = 'bandpass';
    sirenHorn.frequency.value = 960;
    sirenHorn.Q.value = 1.4;
    const sirenSmooth = this.ctx.createBiquadFilter();
    sirenSmooth.type = 'lowpass';
    sirenSmooth.frequency.value = 1350;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOscA.connect(sirenHorn);
    this.sirenOscB.connect(sirenHorn);
    sirenHorn.connect(sirenSmooth);
    sirenSmooth.connect(this.sirenGain);
    this.sirenGain.connect(this.masterMixBus);
    this.sirenOscA.start();
    this.sirenOscB.start();

    this.initialized = true;
    this.armResumeListener();
    this.ensureRunning();
  }

  private armResumeListener() {
    if (this.resumeListenerAttached || typeof window === 'undefined') return;
    this.resumeListenerAttached = true;
    const wake = () => {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => {
          // ignore autoplay restriction
        });
      }
    };
    window.addEventListener('pointerdown', wake, { passive: true });
    window.addEventListener('keydown', wake, { passive: true });
  }

  private ensureRunning(): boolean {
    if (!this.ctx) return false;
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {
        // ignore if called outside gesture
      });
    }
    return this.ctx.state === 'running';
  }

  private scheduleTimeout(fn: () => void, delayMs: number) {
    const id = window.setTimeout(() => {
      this.scheduledTimeouts.delete(id);
      fn();
    }, delayMs);
    this.scheduledTimeouts.add(id);
  }

  private clearScheduledTimeouts() {
    this.scheduledTimeouts.forEach((id) => window.clearTimeout(id));
    this.scheduledTimeouts.clear();
  }

  private canPlaySfx(key: keyof typeof SFX_COOLDOWN_MS, critical = false): boolean {
    if (!this.ctx || !this.masterMixBus || this.muted) return false;
    if (this.ctx.state !== 'running') {
      void this.ctx.resume().catch(() => {});
    }
    const nowMs = performance.now();
    if (!shouldTriggerCooldown(this.lastSfxMs[key], nowMs, SFX_COOLDOWN_MS[key])) {
      return false;
    }
    if (!critical && this.activeVoices >= MAX_CONCURRENT_SFX_VOICES) {
      return false;
    }
    this.lastSfxMs[key] = nowMs;
    return true;
  }

  private trackAndCleanupVoice(
    endNode: AudioScheduledSourceNode,
    nodesToDisconnect: AudioNode[],
    maxLifetimeMs: number,
  ) {
    this.activeVoices++;
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      this.activeVoices = Math.max(0, this.activeVoices - 1);
      for (let i = 0; i < nodesToDisconnect.length; i++) {
        try {
          nodesToDisconnect[i].disconnect();
        } catch {
          // ignore already-disconnected nodes
        }
      }
    };
    endNode.onended = cleanup;
    window.setTimeout(cleanup, maxLifetimeMs + 80);
  }

  private setParamTarget(param: AudioParam | undefined, value: number, now: number, tc: number, min = 0, max = 20000) {
    if (!param) return;
    const safe = clampAudioValue(value, min, min, max);
    const safeTc = clampAudioValue(tc, 0.04, 0.005, 1.0);
    param.setTargetAtTime(safe, now, safeTc);
  }

  private applyCarWaveform() {
    const w = this.waves[this.carStyle] ?? this.waves.i4_turbo;
    if (!w) return;
    this.engineOscMain?.setPeriodicWave(w.main);
    this.engineOscBankB?.setPeriodicWave(w.main);
    this.engineOscHarm?.setPeriodicWave(w.harm);
  }

  public setCarStyle(style: EngineCharacter) {
    this.carStyle = normalizeEngineStyle(style);
    if (this.initialized) {
      this.applyCarWaveform();
    }
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.setParamTarget(this.masterGain.gain, muted ? 0 : 0.54, this.ctx.currentTime, 0.05, 0, 0.8);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public getAudioContext(): AudioContext | null {
    return this.ctx;
  }

  public getMusicDestination(): AudioNode | null {
    return this.musicGain;
  }

  public getNoiseBuffer(): AudioBuffer | null {
    return this.noiseBuffer;
  }

  public stopRaceLoops() {
    this.clearScheduledTimeouts();
    if (!this.ctx || !this.initialized) return;
    const now = this.ctx.currentTime;
    this.setParamTarget(this.engineGain?.gain, 0, now, 0.06, 0, 1);
    this.setParamTarget(this.chopDepth?.gain, 0, now, 0.04, 0, 0.1);
    this.setParamTarget(this.raspVca?.gain, 0, now, 0.04, 0, 1);
    this.setParamTarget(this.raspModDepth?.gain, 0, now, 0.04, 0, 0.2);
    this.setParamTarget(this.intakeGain?.gain, 0, now, 0.05, 0, 1);
    this.setParamTarget(this.gearWhineGain?.gain, 0, now, 0.05, 0, 1);
    this.setParamTarget(this.turboSpoolGain?.gain, 0, now, 0.05, 0, 1);
    this.setParamTarget(this.nosNoiseGain?.gain, 0, now, 0.05, 0, 1);
    this.setParamTarget(this.tireScrubGain?.gain, 0, now, 0.05, 0, 1);
    this.setParamTarget(this.tireLowGain?.gain, 0, now, 0.05, 0, 1);
    this.setParamTarget(this.tireHighGain?.gain, 0, now, 0.05, 0, 1);
    this.setParamTarget(this.curbRumbleGain?.gain, 0, now, 0.05, 0, 1);
    this.setParamTarget(this.windGain?.gain, 0, now, 0.05, 0, 1);
    this.setParamTarget(this.scrapeGain?.gain, 0, now, 0.04, 0, 1);
    this.setParamTarget(this.sirenGain?.gain, 0, now, 0.06, 0, 1);
    this.setParamTarget(this.tunnelSendGain?.gain, 0, now, 0.06, 0, 1);
    this.prevNos = false;
  }

  private getAcousticProfile(): EngineAcousticProfile {
    return ENGINE_ACOUSTICS[this.carStyle] ?? ENGINE_ACOUSTICS.i4_turbo;
  }

  private getPitchScale(): number {
    return this.getAcousticProfile().pitchScale;
  }

  public update(params: {
    active: boolean;
    rpm: number;
    throttle: boolean;
    gear: number;
    speedKmh?: number;
    nosActive: boolean;
    driftSlip: number;
    copProximity: number;
    onCurb?: boolean;
    airborne?: boolean;
    inTunnel?: boolean;
    drafting?: boolean;
    nearBarrier?: boolean;
    wallScrape?: number;
    wheelspin?: number;
    timeScale: number;
  }) {
    if (!this.initialized || !this.ctx) return;
    if (!params.active) {
      this.stopRaceLoops();
      return;
    }

    this.ensureRunning();

    const perfNow = performance.now();
    const dt =
      this.lastUpdatePerfMs > 0
        ? clampAudioValue((perfNow - this.lastUpdatePerfMs) / 1000, 0.016, 0.001, 0.1)
        : 0.016;
    this.lastUpdatePerfMs = perfNow;

    if (this.popCooldown > 0) this.popCooldown = Math.max(0, this.popCooldown - dt);
    if (this.blowoffCooldown > 0) this.blowoffCooldown = Math.max(0, this.blowoffCooldown - dt);

    const now = this.ctx.currentTime;
    const safeRpm = clampAudioValue(params.rpm, 0.2, 0.05, 1.0);
    const safeTimeScale = clampAudioValue(params.timeScale, 1.0, 0.25, 1.5);
    const acoustic = this.getAcousticProfile();
    const timeSlow = safeTimeScale < 0.7 ? 0.62 : 1.0;
    const pitchFactor = timeSlow * acoustic.pitchScale;
    const speedKmh = clampAudioValue(params.speedKmh ?? safeRpm * 200, 0, 0, 480);

    // Upshift ignition-cut gunshot bark + compressor-surge turbo flutter + multi-pop overrun (muted for EV)
    if (!acoustic.isElectric) {
      if (params.gear > this.lastGear && params.gear > 1) {
        if (acoustic.hasTurbo && this.blowoffCooldown <= 0) {
          this.triggerTurboBlowoff(1.0);
          this.blowoffCooldown = 0.24;
        }
        const upshiftPop = this.carStyle === 'v8_muscle' || this.carStyle === 'rotary_brap' ? 0.32 : 0.26;
        this.triggerExhaustPop(upshiftPop);
        this.scheduleTimeout(() => this.triggerExhaustPop(upshiftPop * 0.65), 62);
      } else if (params.gear < this.lastGear && params.gear >= 1 && speedKmh > 48 && this.popCooldown <= 0) {
        this.triggerExhaustPop(0.28);
        this.scheduleTimeout(() => this.triggerExhaustPop(0.21), 72);
        this.scheduleTimeout(() => this.triggerExhaustPop(0.15), 148);
        this.popCooldown = 0.28;
      } else if (this.prevThrottle && !params.throttle && safeRpm > 0.46 && this.popCooldown <= 0) {
        if (acoustic.hasTurbo && safeRpm > 0.6 && this.blowoffCooldown <= 0) {
          this.triggerTurboBlowoff(0.88);
          this.blowoffCooldown = 0.3;
        }
        const overrunPop = this.carStyle === 'v8_muscle' || this.carStyle === 'rotary_brap' ? 0.28 : 0.23;
        this.triggerExhaustPop(overrunPop);
        this.scheduleTimeout(() => this.triggerExhaustPop(overrunPop * 0.72), 84);
        this.scheduleTimeout(() => this.triggerExhaustPop(overrunPop * 0.48), 165);
        this.popCooldown = 0.35;
      }
    }
    if (params.nosActive && !this.prevNos) {
      this.triggerNosIgnite();
    }
    this.lastGear = params.gear;
    this.prevThrottle = params.throttle;
    this.prevNos = params.nosActive;

    const redlineActive = !acoustic.isElectric && params.throttle && safeRpm > 0.962;
    const redlineCut = redlineActive && Math.sin(now * 86) > 0.38 ? 0.52 : 1.0;

    const baseFreq = acoustic.isElectric
      ? (115 + speedKmh * 1.5 + safeRpm * 145) * timeSlow
      : (40 + safeRpm * 146) * pitchFactor;

    this.setParamTarget(this.engineOscMain?.frequency, baseFreq, now, 0.024, 20, 1450);
    this.setParamTarget(this.engineOscBankB?.frequency, baseFreq * acoustic.detuneRatio, now, 0.024, 20, 1450);
    this.setParamTarget(this.engineOscHarm?.frequency, baseFreq * acoustic.harmRatio, now, 0.024, 20, 2250);
    this.setParamTarget(this.engineOscSub?.frequency, baseFreq * 0.5, now, 0.024, 15, 720);

    // Strictly positive firing-rate exhaust rasp (0 for pure EV turbine)
    const raspBase = acoustic.isElectric
      ? 0
      : (params.throttle ? 0.24 + safeRpm * 0.25 : 0.14 + safeRpm * 0.09) * acoustic.raspMult;
    this.setParamTarget(this.raspModOsc?.frequency, Math.max(24, baseFreq), now, 0.028, 20, 460);
    this.setParamTarget(
      this.raspFilter?.frequency,
      300 + safeRpm * 1050 + (params.throttle ? 260 : 0),
      now,
      0.038,
      120,
      2500,
    );
    this.setParamTarget(this.raspVca?.gain, raspBase, now, 0.036, 0, 0.62);
    this.setParamTarget(this.raspModDepth?.gain, raspBase * 0.44, now, 0.036, 0, 0.24);

    this.setParamTarget(this.chopLfo?.frequency, Math.max(acoustic.idleChopRate, baseFreq * 0.26), now, 0.05, 7, 85);
    this.setParamTarget(
      this.chopDepth?.gain,
      params.throttle ? acoustic.chopLoadDepth : acoustic.chopIdleDepth,
      now,
      0.05,
      0,
      0.09,
    );

    this.setParamTarget(
      this.engineBarkFilter?.frequency,
      acoustic.barkBaseHz + safeRpm * acoustic.barkRangeHz,
      now,
      0.04,
      200,
      2500,
    );
    this.setParamTarget(
      this.engineBarkFilter?.gain,
      acoustic.isElectric ? 0.5 : params.throttle ? 5.2 : 1.7,
      now,
      0.04,
      0,
      6.0,
    );

    const filterCutoff =
      (acoustic.isElectric
        ? 680 + speedKmh * 5.6 + (params.throttle ? 420 : 0)
        : 260 + safeRpm * 1260 + (params.throttle ? 560 : 60) + (params.nosActive ? 340 : 0)) *
      (safeTimeScale < 0.7 ? 0.55 : 1.0);
    this.setParamTarget(this.engineLowpass?.frequency, filterCutoff, now, 0.036, 150, 3100);

    const targetEngineGain = acoustic.isElectric
      ? 0.06 + (params.throttle ? 0.13 : 0.025) + Math.min(0.12, speedKmh / 2200)
      : (0.19 + (params.throttle ? 0.21 : 0.045) + safeRpm * 0.11 + (params.nosActive ? 0.04 : 0)) * redlineCut;
    this.setParamTarget(this.engineGain?.gain, targetEngineGain, now, 0.028, 0, 0.56);
    this.setParamTarget(this.tunnelSendGain?.gain, params.inTunnel ? (acoustic.isElectric ? 0.26 : 0.55) : 0, now, 0.06, 0, 0.65);

    // Cold-airbox intake suction growl (muted for EV)
    this.setParamTarget(this.intakeFilter?.frequency, 380 + safeRpm * 1080, now, 0.04, 200, 2150);
    this.setParamTarget(
      this.intakeGain?.gain,
      acoustic.isElectric ? 0 : params.throttle ? (0.034 + safeRpm * 0.062) * redlineCut : 0.008,
      now,
      0.035,
      0,
      0.15,
    );

    // Straight-cut dog-box / EV inverter transmission whine (capped <= 2100 Hz)
    if (acoustic.isElectric && speedKmh > 2) {
      const evWhineFreq = clampAudioValue((240 + speedKmh * 5.4 + safeRpm * 180) * timeSlow, 420, 220, 2050);
      this.setParamTarget(this.gearWhineOsc?.frequency, evWhineFreq, now, 0.035, 200, 2100);
      this.setParamTarget(this.gearWhineFilter?.frequency, Math.min(2200, evWhineFreq * 1.15), now, 0.035, 220, 2200);
      const evLoadMult = params.throttle ? 1.0 : 0.48;
      this.setParamTarget(
        this.gearWhineGain?.gain,
        acoustic.gearWhineBase * evLoadMult * Math.min(1, 0.25 + speedKmh / 140),
        now,
        0.04,
        0,
        0.06,
      );
    } else if (!acoustic.isElectric && acoustic.gearWhineBase > 0.004 && speedKmh > 60) {
      const whineFreq = clampAudioValue((330 + speedKmh * 2.9 + safeRpm * 160) * timeSlow, 620, 250, 1980);
      this.setParamTarget(this.gearWhineOsc?.frequency, whineFreq, now, 0.045, 200, 2000);
      this.setParamTarget(this.gearWhineFilter?.frequency, Math.min(2100, whineFreq * 1.12), now, 0.045, 250, 2100);
      const loadMult = params.throttle ? 1.0 : 0.45;
      this.setParamTarget(
        this.gearWhineGain?.gain,
        acoustic.gearWhineBase * loadMult * Math.min(1, (speedKmh - 60) / 120),
        now,
        0.05,
        0,
        0.048,
      );
    } else {
      this.setParamTarget(this.gearWhineGain?.gain, 0, now, 0.06, 0, 0.06);
    }

    // Twin-scroll turbocharger compressor whistle (turbo cars only)
    if (acoustic.hasTurbo && params.throttle && safeRpm > 0.30) {
      const spoolFreq = (1500 + safeRpm * 1020) * timeSlow;
      this.setParamTarget(this.turboSpoolFilter?.frequency, spoolFreq, now, 0.045, 800, 2500);
      this.setParamTarget(this.turboSpoolGain?.gain, 0.036 * (safeRpm - 0.28), now, 0.045, 0, 0.058);
    } else {
      this.setParamTarget(this.turboSpoolGain?.gain, 0, now, 0.08, 0, 0.058);
    }

    // Aerodynamic wind rush
    const baseWind = speedKmh > 95 ? Math.min(0.13, ((speedKmh - 95) / 215) * 0.13) : 0;
    const extraWind = (params.drafting ? 0.045 : 0) + (params.nearBarrier && speedKmh > 105 ? 0.032 : 0);
    const windCutoff = (440 + speedKmh * 2.1 + (params.drafting ? 320 : 0)) * (safeTimeScale < 0.7 ? 0.55 : 1.0);
    this.setParamTarget(this.windFilter?.frequency, windCutoff, now, 0.06, 200, 1800);
    this.setParamTarget(this.windGain?.gain, Math.min(0.2, baseWind + extraWind), now, 0.06, 0, 0.25);

    // NOS Afterburner Jet
    this.setParamTarget(this.nosNoiseFilter?.frequency, params.nosActive ? 820 + safeRpm * 280 : 680, now, 0.04, 300, 1750);
    this.setParamTarget(this.nosNoiseGain?.gain, params.nosActive ? 0.24 : 0, now, 0.035, 0, 0.28);

    // 3-Layer Tire Scrub + Squeal (warm, non-fatiguing Q)
    const wheelspin = params.airborne ? 0 : clampAudioValue(params.wheelspin ?? 0, 0, 0, 1.5);
    const driftSlip = clampAudioValue(params.driftSlip, 0, 0, 1.5);
    const slip = params.airborne ? 0 : Math.max(driftSlip, wheelspin * 0.78);
    const scrubVol = slip > 0.1 ? Math.min(0.1, (slip - 0.1) * 0.17) : 0;
    const lowTire = slip > 0.17 ? Math.min(0.085, (slip - 0.17) * 0.16) : 0;
    const highTire = slip > 0.27 ? Math.min(0.052, (slip - 0.27) * 0.12) : 0;
    this.setParamTarget(this.tireScrubFilter?.frequency, 420 + slip * 190, now, 0.04, 250, 900);
    this.setParamTarget(this.tireLowFilter?.frequency, 840 + slip * 260 + Math.sin(now * 24) * 38, now, 0.035, 500, 1450);
    this.setParamTarget(this.tireHighFilter?.frequency, 1480 + slip * 310 + Math.cos(now * 19) * 28, now, 0.035, 1100, 1950);
    this.setParamTarget(this.tireScrubGain?.gain, scrubVol, now, 0.035, 0, 0.14);
    this.setParamTarget(this.tireLowGain?.gain, lowTire, now, 0.035, 0, 0.12);
    this.setParamTarget(this.tireHighGain?.gain, highTire, now, 0.035, 0, 0.08);

    // Concrete Barrier / Guardrail Scrape Sparks audio
    const scrape = clampAudioValue(params.wallScrape ?? 0, 0, 0, 1);
    if (scrape > 0.05) {
      this.setParamTarget(this.scrapeFilter?.frequency, 1450 + scrape * 850 + Math.sin(now * 36) * 180, now, 0.03, 900, 2400);
      this.setParamTarget(this.scrapeGain?.gain, Math.min(0.13, scrape * 0.13), now, 0.03, 0, 0.16);
    } else {
      this.setParamTarget(this.scrapeGain?.gain, 0, now, 0.04, 0, 0.16);
    }

    // Rumble Strip / Shoulder Curb Clatter
    this.setParamTarget(
      this.curbRumbleGain?.gain,
      params.onCurb && !params.airborne && speedKmh > 28 ? Math.min(0.17, speedKmh / 950) : 0,
      now,
      0.03,
      0,
      0.22,
    );

    // Warm Horn-Filtered RPD Siren
    const copProx = clampAudioValue(params.copProximity, 0, 0, 1);
    if (copProx > 0.05 && this.sirenOscA && this.sirenOscB && this.sirenGain) {
      const isYelp = copProx > 0.52;
      const cycleSpeed = isYelp ? 14.5 : 4.2;
      const phaseA = Math.sin(now * cycleSpeed);
      const phaseB = Math.sin(now * cycleSpeed + 0.35);
      const baseHz = isYelp ? 760 : 660;
      const sweepHz = isYelp ? 210 : 195;
      this.setParamTarget(this.sirenOscA.frequency, (baseHz + phaseA * sweepHz) * timeSlow, now, 0.02, 220, 1300);
      this.setParamTarget(this.sirenOscB.frequency, (baseHz * 1.07 + phaseB * sweepHz) * timeSlow, now, 0.02, 220, 1400);
      this.setParamTarget(this.sirenGain.gain, copProx * 0.055, now, 0.07, 0, 0.08);
    } else {
      this.setParamTarget(this.sirenGain?.gain, 0, now, 0.08, 0, 0.08);
    }
  }

  private triggerNosIgnite() {
    if (!this.ctx || !this.masterMixBus || this.muted || this.activeVoices >= MAX_CONCURRENT_SFX_VOICES) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(195, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.28);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.34, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.masterMixBus);
    osc.start(now);
    osc.stop(now + 0.31);
    this.trackAndCleanupVoice(osc, [osc, lp, g], 310);

    if (this.noiseBuffer) {
      const purgeSrc = this.ctx.createBufferSource();
      purgeSrc.buffer = this.noiseBuffer;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.setValueAtTime(2600, now);
      hp.frequency.exponentialRampToValueAtTime(1150, now + 0.16);
      hp.Q.value = 1.6;
      const pg = this.ctx.createGain();
      pg.gain.setValueAtTime(0.16, now);
      pg.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
      purgeSrc.connect(hp);
      hp.connect(pg);
      pg.connect(this.masterMixBus);
      purgeSrc.start(now);
      purgeSrc.stop(now + 0.18);
      this.trackAndCleanupVoice(purgeSrc, [purgeSrc, hp, pg], 180);
    }
  }

  private triggerTurboBlowoff(scale = 1.0) {
    if (!this.noiseBuffer || !this.canPlaySfx('turboBlowoff')) return;
    const ctx = this.ctx!;
    const bus = this.masterMixBus!;
    const now = ctx.currentTime;
    const safeScale = clampAudioValue(scale, 1.0, 0.2, 1.25);
    const pulseCount =
      this.carStyle === 'v6_twin_turbo' || this.carStyle === 'i4_turbo' || this.carStyle === 'rotary_brap' ? 4 : 2;
    for (let i = 0; i < pulseCount; i++) {
      const start = now + i * 0.044;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2450 - i * 330, start);
      filter.frequency.exponentialRampToValueAtTime(840, start + 0.046);
      filter.Q.value = 3.1;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime((0.115 * safeScale) / (i * 0.72 + 1), start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.05);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(bus);
      src.start(start);
      src.stop(start + 0.056);
      this.trackAndCleanupVoice(src, [src, filter, gain], (i + 1) * 55 + 50);
    }
  }

  private triggerExhaustPop(level = 0.25) {
    if (!this.noiseBuffer || !this.canPlaySfx('exhaustPop')) return;
    const ctx = this.ctx!;
    const bus = this.masterMixBus!;
    const now = ctx.currentTime;
    const safeLevel = clampAudioValue(level, 0.25, 0.06, 0.44);

    // Punchy gunshot low-mid snap
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.11);

    const oscLp = ctx.createBiquadFilter();
    oscLp.type = 'lowpass';
    oscLp.frequency.setValueAtTime(850, now);
    oscLp.frequency.exponentialRampToValueAtTime(140, now + 0.11);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(safeLevel * 0.92, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(oscLp);
    oscLp.connect(oscGain);
    oscGain.connect(bus);
    osc.start(now);
    osc.stop(now + 0.13);
    this.trackAndCleanupVoice(osc, [osc, oscLp, oscGain], 130);

    // Metallic exhaust crack transient
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 920;
    filt.Q.value = 1.45;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(safeLevel * 0.74, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
    src.connect(filt);
    filt.connect(ng);
    ng.connect(bus);
    if (this.garageHallSend) ng.connect(this.garageHallSend);
    src.start(now);
    src.stop(now + 0.105);
    this.trackAndCleanupVoice(src, [src, filt, ng], 110);
  }

  public triggerLandingThump() {
    if (!this.canPlaySfx('landingThump')) return;
    const ctx = this.ctx!;
    const bus = this.masterMixBus!;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(96, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.32, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(g);
    g.connect(bus);
    osc.start(now);
    osc.stop(now + 0.23);
    this.trackAndCleanupVoice(osc, [osc, g], 230);

    if (this.noiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 320;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.18, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      src.connect(lp);
      lp.connect(ng);
      ng.connect(bus);
      src.start(now);
      src.stop(now + 0.13);
      this.trackAndCleanupVoice(src, [src, lp, ng], 130);
    }
  }

  public triggerImpact(intensity: number) {
    if (!this.noiseBuffer || !this.canPlaySfx('impact')) return;
    const ctx = this.ctx!;
    const bus = this.masterMixBus!;
    const now = ctx.currentTime;
    const clamped = clampAudioValue(intensity, 0.45, 0.15, 0.9);

    // Heavy body/chassis thump (controlled peak so collisions never hurt ears)
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(110, now);
    sub.frequency.exponentialRampToValueAtTime(28, now + 0.24);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(clamped * 0.42, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    sub.connect(subGain);
    subGain.connect(bus);
    sub.start(now);
    sub.stop(now + 0.27);
    this.trackAndCleanupVoice(sub, [sub, subGain], 270);

    // Crushed sheet-metal midrange crunch
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1180, now);
    filter.frequency.exponentialRampToValueAtTime(210, now + 0.24);
    filter.Q.value = 1.0;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(clamped * 0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    if (this.garageHallSend) gain.connect(this.garageHallSend);
    src.start(now);
    src.stop(now + 0.26);
    this.trackAndCleanupVoice(src, [src, filter, gain], 260);
  }

  public triggerRadioSquelch() {
    if (!this.noiseBuffer || !this.canPlaySfx('radioSquelch')) return;
    const ctx = this.ctx!;
    const bus = this.masterMixBus!;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 1850;
    filt.Q.value = 2.0;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.075, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    src.connect(filt);
    filt.connect(g);
    g.connect(bus);
    src.start(now);
    src.stop(now + 0.1);
    this.trackAndCleanupVoice(src, [src, filt, g], 100);

    const chirp = ctx.createOscillator();
    chirp.type = 'sine';
    chirp.frequency.setValueAtTime(1420, now + 0.01);
    chirp.frequency.setValueAtTime(1100, now + 0.045);
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.045, now + 0.01);
    cg.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    chirp.connect(cg);
    cg.connect(bus);
    chirp.start(now + 0.01);
    chirp.stop(now + 0.09);
    this.trackAndCleanupVoice(chirp, [chirp, cg], 90);
  }

  public triggerBeep(high = false) {
    if (!this.canPlaySfx('beep')) return;
    const ctx = this.ctx!;
    const bus = this.masterMixBus!;
    const now = ctx.currentTime;

    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(high ? 142 : 96, now);
    sub.frequency.exponentialRampToValueAtTime(38, now + 0.14);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.18, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    sub.connect(subGain);
    subGain.connect(bus);
    sub.start(now);
    sub.stop(now + 0.16);
    this.trackAndCleanupVoice(sub, [sub, subGain], 160);

    const baseF = high ? 587.33 : 392.0;
    const ratios = high ? [1.0, 1.5] : [1.0, 1.008];
    ratios.forEach((r) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(baseF * r, now);
      if (high) osc.frequency.exponentialRampToValueAtTime(baseF * r * 1.15, now + 0.09);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(high ? 2100 : 1450, now);
      filter.frequency.exponentialRampToValueAtTime(580, now + 0.22);
      filter.Q.value = 1.4;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.072, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (high ? 0.24 : 0.16));
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(bus);
      if (this.garageHallSend) gain.connect(this.garageHallSend);
      osc.start(now);
      osc.stop(now + 0.26);
      this.trackAndCleanupVoice(osc, [osc, filter, gain], 260);
    });
  }

  public triggerGarageRev(style: EngineCharacter) {
    this.init();
    if (!this.canPlaySfx('garageRev', true)) return;
    const ctx = this.ctx!;
    const bus = this.masterMixBus!;
    this.setCarStyle(style);
    const acoustic = this.getAcousticProfile();
    const now = ctx.currentTime;
    const scale = acoustic.pitchScale;

    const osc = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const oscSub = ctx.createOscillator();
    oscSub.type = 'sine';

    const w = this.waves[this.carStyle] ?? this.waves.i4_turbo!;
    osc.setPeriodicWave(w.main);
    oscB.setPeriodicWave(w.main);
    osc2.setPeriodicWave(w.harm);

    const bankMix = ctx.createGain();
    bankMix.gain.value = acoustic.isElectric ? 0.38 : 0.64;
    const harmMix = ctx.createGain();
    harmMix.gain.value = acoustic.isElectric ? 0.58 : 0.48;
    const subMix = ctx.createGain();
    subMix.gain.value = acoustic.isElectric ? 0.16 : 0.64;

    const startF = (acoustic.isElectric ? 140 : 46) * scale;
    const blipF = (acoustic.isElectric ? 460 : 168) * scale;
    const peakF = (acoustic.isElectric ? 710 : 216) * scale;
    const detune = acoustic.detuneRatio;
    const harmRatio = acoustic.harmRatio;

    osc.frequency.setValueAtTime(startF, now);
    osc.frequency.exponentialRampToValueAtTime(blipF, now + 0.15);
    osc.frequency.exponentialRampToValueAtTime(startF * 1.5, now + 0.33);
    osc.frequency.exponentialRampToValueAtTime(peakF, now + 0.54);
    osc.frequency.exponentialRampToValueAtTime(startF * 1.1, now + 1.25);

    oscB.frequency.setValueAtTime(startF * detune, now);
    oscB.frequency.exponentialRampToValueAtTime(blipF * detune, now + 0.15);
    oscB.frequency.exponentialRampToValueAtTime(startF * 1.5 * detune, now + 0.33);
    oscB.frequency.exponentialRampToValueAtTime(peakF * detune, now + 0.54);
    oscB.frequency.exponentialRampToValueAtTime(startF * 1.1 * detune, now + 1.25);

    osc2.frequency.setValueAtTime(startF * harmRatio, now);
    osc2.frequency.exponentialRampToValueAtTime(blipF * harmRatio, now + 0.15);
    osc2.frequency.exponentialRampToValueAtTime(startF * 1.5 * harmRatio, now + 0.33);
    osc2.frequency.exponentialRampToValueAtTime(peakF * harmRatio, now + 0.54);
    osc2.frequency.exponentialRampToValueAtTime(startF * 1.1 * harmRatio, now + 1.25);

    oscSub.frequency.setValueAtTime(startF * 0.5, now);
    oscSub.frequency.exponentialRampToValueAtTime(blipF * 0.5, now + 0.15);
    oscSub.frequency.exponentialRampToValueAtTime(startF * 0.75, now + 0.33);
    oscSub.frequency.exponentialRampToValueAtTime(peakF * 0.5, now + 0.54);
    oscSub.frequency.exponentialRampToValueAtTime(startF * 0.55, now + 1.25);

    const shaper = ctx.createWaveShaper();
    shaper.curve = this.warmCurve ?? makeWarmSaturationCurve(3.4);
    shaper.oversample = 'none';

    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(acoustic.isElectric ? 900 : 340, now);
    filt.frequency.exponentialRampToValueAtTime(acoustic.isElectric ? 2450 : 1850, now + 0.15);
    filt.frequency.exponentialRampToValueAtTime(acoustic.isElectric ? 1150 : 560, now + 0.33);
    filt.frequency.exponentialRampToValueAtTime(acoustic.isElectric ? 2900 : 2250, now + 0.54);
    filt.frequency.exponentialRampToValueAtTime(acoustic.isElectric ? 760 : 280, now + 1.25);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(acoustic.isElectric ? 0.2 : 0.3, now + 0.11);
    gain.gain.linearRampToValueAtTime(acoustic.isElectric ? 0.24 : 0.34, now + 0.53);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.28);

    osc.connect(shaper);
    oscB.connect(bankMix);
    bankMix.connect(shaper);
    osc2.connect(harmMix);
    harmMix.connect(shaper);
    shaper.connect(filt);
    oscSub.connect(subMix);
    subMix.connect(filt);
    filt.connect(gain);
    gain.connect(bus);
    if (this.garageHallSend) gain.connect(this.garageHallSend);

    osc.start(now);
    oscB.start(now);
    osc2.start(now);
    oscSub.start(now);
    osc.stop(now + 1.3);
    oscB.stop(now + 1.3);
    osc2.stop(now + 1.3);
    oscSub.stop(now + 1.3);

    this.trackAndCleanupVoice(
      osc,
      [osc, oscB, osc2, oscSub, bankMix, harmMix, subMix, shaper, filt, gain],
      1300,
    );

    if (!acoustic.isElectric) {
      this.scheduleTimeout(() => {
        if (acoustic.hasTurbo) this.triggerTurboBlowoff(1.0);
        this.triggerExhaustPop(this.carStyle === 'v8_muscle' || this.carStyle === 'rotary_brap' ? 0.32 : 0.26);
      }, 575);
      this.scheduleTimeout(() => this.triggerExhaustPop(0.22), 690);
      this.scheduleTimeout(() => this.triggerExhaustPop(0.16), 815);
    }
  }

  public triggerUpgradeClunk() {
    this.init();
    if (!this.canPlaySfx('upgradeClunk')) return;
    const ctx = this.ctx!;
    const bus = this.masterMixBus!;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(64, now + 0.11);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(g);
    g.connect(bus);
    if (this.garageHallSend) g.connect(this.garageHallSend);
    osc.start(now);
    osc.stop(now + 0.14);
    this.trackAndCleanupVoice(osc, [osc, g], 140);

    if (this.noiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1650;
      bp.Q.value = 2.2;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.085, now + 0.04);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      src.connect(bp);
      bp.connect(ng);
      ng.connect(bus);
      src.start(now + 0.04);
      src.stop(now + 0.15);
      this.trackAndCleanupVoice(src, [src, bp, ng], 150);
    }
  }

  public triggerUiClick() {
    this.init();
    if (!this.canPlaySfx('uiClick')) return;
    const ctx = this.ctx!;
    const bus = this.masterMixBus!;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(190, now + 0.035);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.085, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    osc.connect(g);
    g.connect(bus);
    osc.start(now);
    osc.stop(now + 0.05);
    this.trackAndCleanupVoice(osc, [osc, g], 50);
  }

  public triggerCountdownTick(isGo: boolean) {
    if (!this.ctx || !this.masterMixBus || this.muted) return;
    this.ensureRunning();
    const now = this.ctx.currentTime;

    if (!isGo) {
      const sub = this.ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(124, now);
      sub.frequency.exponentialRampToValueAtTime(40, now + 0.22);
      const subG = this.ctx.createGain();
      subG.gain.setValueAtTime(0.28, now);
      subG.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      sub.connect(subG);
      subG.connect(this.masterMixBus);
      sub.start(now);
      sub.stop(now + 0.25);
      this.trackAndCleanupVoice(sub, [sub, subG], 250);

      [220.0, 329.63].forEach((freq) => {
        const osc = this.ctx!.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);
        const filt = this.ctx!.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.setValueAtTime(1750, now);
        filt.frequency.exponentialRampToValueAtTime(460, now + 0.2);
        filt.Q.value = 1.6;
        const g = this.ctx!.createGain();
        g.gain.setValueAtTime(0.09, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(filt);
        filt.connect(g);
        g.connect(this.masterMixBus!);
        if (this.garageHallSend) g.connect(this.garageHallSend);
        osc.start(now);
        osc.stop(now + 0.24);
        this.trackAndCleanupVoice(osc, [osc, filt, g], 240);
      });
    } else {
      const boom = this.ctx.createOscillator();
      boom.type = 'sine';
      boom.frequency.setValueAtTime(110, now);
      boom.frequency.exponentialRampToValueAtTime(32, now + 0.4);
      const boomG = this.ctx.createGain();
      boomG.gain.setValueAtTime(0.4, now);
      boomG.gain.exponentialRampToValueAtTime(0.001, now + 0.44);
      boom.connect(boomG);
      boomG.connect(this.masterMixBus);
      boom.start(now);
      boom.stop(now + 0.46);
      this.trackAndCleanupVoice(boom, [boom, boomG], 460);

      [261.63, 392.0, 523.25].forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + idx * 0.014);
        const filt = this.ctx!.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.setValueAtTime(900, now + idx * 0.014);
        filt.frequency.exponentialRampToValueAtTime(2400, now + 0.14);
        filt.frequency.exponentialRampToValueAtTime(950, now + 0.58);
        filt.Q.value = 1.5;
        const g = this.ctx!.createGain();
        g.gain.setValueAtTime(0.085, now + idx * 0.014);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc.connect(filt);
        filt.connect(g);
        g.connect(this.masterMixBus!);
        if (this.garageHallSend) g.connect(this.garageHallSend);
        osc.start(now + idx * 0.014);
        osc.stop(now + 0.62);
        this.trackAndCleanupVoice(osc, [osc, filt, g], 620);
      });

      if (this.noiseBuffer) {
        const whoosh = this.ctx.createBufferSource();
        whoosh.buffer = this.noiseBuffer;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(420, now);
        bp.frequency.exponentialRampToValueAtTime(1950, now + 0.25);
        bp.Q.value = 1.2;
        const wg = this.ctx.createGain();
        wg.gain.setValueAtTime(0.17, now);
        wg.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
        whoosh.connect(bp);
        bp.connect(wg);
        wg.connect(this.masterMixBus);
        whoosh.start(now);
        whoosh.stop(now + 0.34);
        this.trackAndCleanupVoice(whoosh, [whoosh, bp, wg], 340);
      }

      const acoustic = this.getAcousticProfile();
      if (!acoustic.isElectric) {
        this.triggerExhaustPop(0.24);
        if (acoustic.hasTurbo) {
          this.scheduleTimeout(() => this.triggerTurboBlowoff(0.85), 110);
        }
      }
    }
  }

  public triggerSpeedbreaker(active: boolean) {
    if (!this.ctx || !this.masterMixBus || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(active ? 220 : 54, now);
    osc.frequency.exponentialRampToValueAtTime(active ? 44 : 250, now + 0.24);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.24, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.27);
    osc.connect(g);
    g.connect(this.masterMixBus);
    osc.start(now);
    osc.stop(now + 0.28);
    this.trackAndCleanupVoice(osc, [osc, g], 280);
  }

  public triggerCameraFlash() {
    if (!this.noiseBuffer || !this.canPlaySfx('cameraFlash')) return;
    const ctx = this.ctx!;
    const bus = this.masterMixBus!;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 2100;
    hp.Q.value = 1.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.15, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    src.connect(hp);
    hp.connect(g);
    g.connect(bus);
    src.start(now);
    src.stop(now + 0.07);
    this.trackAndCleanupVoice(src, [src, hp, g], 70);

    const chirp = ctx.createOscillator();
    chirp.type = 'sine';
    chirp.frequency.setValueAtTime(1280, now + 0.025);
    chirp.frequency.exponentialRampToValueAtTime(860, now + 0.14);
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.11, now + 0.025);
    cg.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    chirp.connect(cg);
    cg.connect(bus);
    chirp.start(now + 0.025);
    chirp.stop(now + 0.17);
    this.trackAndCleanupVoice(chirp, [chirp, cg], 170);
  }

  public triggerWoodSmash() {
    if (!this.noiseBuffer || !this.canPlaySfx('woodSmash')) return;
    const ctx = this.ctx!;
    const bus = this.masterMixBus!;
    const now = ctx.currentTime;
    [0, 0.032, 0.068].forEach((offset, idx) => {
      const t = now + offset;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 880 + idx * 360;
      bp.Q.value = 1.5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.22 / (idx + 1), t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.095);
      src.connect(bp);
      bp.connect(g);
      g.connect(bus);
      src.start(t);
      src.stop(t + 0.11);
      this.trackAndCleanupVoice(src, [src, bp, g], (offset + 0.11) * 1000);
    });
  }

  public triggerLapComplete(isFinalLap: boolean) {
    if (!this.ctx || !this.masterMixBus || this.muted) return;
    this.ensureRunning();
    const now = this.ctx.currentTime;

    const punch = this.ctx.createOscillator();
    punch.type = 'sine';
    punch.frequency.setValueAtTime(isFinalLap ? 132 : 108, now);
    punch.frequency.exponentialRampToValueAtTime(34, now + 0.24);
    const punchG = this.ctx.createGain();
    punchG.gain.setValueAtTime(isFinalLap ? 0.34 : 0.26, now);
    punchG.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    punch.connect(punchG);
    punchG.connect(this.masterMixBus);
    punch.start(now);
    punch.stop(now + 0.28);
    this.trackAndCleanupVoice(punch, [punch, punchG], 280);

    if (this.noiseBuffer) {
      const sweep = this.ctx.createBufferSource();
      sweep.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(360, now);
      bp.frequency.exponentialRampToValueAtTime(2050, now + 0.2);
      bp.Q.value = 1.2;
      const sg = this.ctx.createGain();
      sg.gain.setValueAtTime(0.15, now);
      sg.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      sweep.connect(bp);
      bp.connect(sg);
      sg.connect(this.masterMixBus);
      sweep.start(now);
      sweep.stop(now + 0.26);
      this.trackAndCleanupVoice(sweep, [sweep, bp, sg], 260);
    }

    const chord = isFinalLap ? [293.66, 440.0, 587.33] : [261.63, 392.0, 523.25];
    chord.forEach((freq, idx) => {
      const t = now + idx * 0.045;
      const osc = this.ctx!.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);
      const filt = this.ctx!.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.setValueAtTime(1450, t);
      filt.frequency.exponentialRampToValueAtTime(2200, t + 0.11);
      filt.frequency.exponentialRampToValueAtTime(780, t + 0.42);
      filt.Q.value = 1.5;
      const g = this.ctx!.createGain();
      g.gain.setValueAtTime(0.085, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.44);
      osc.connect(filt);
      filt.connect(g);
      g.connect(this.masterMixBus!);
      if (this.garageHallSend) g.connect(this.garageHallSend);
      osc.start(t);
      osc.stop(t + 0.46);
      this.trackAndCleanupVoice(osc, [osc, filt, g], (idx * 0.045 + 0.46) * 1000);
    });

    const acoustic = this.getAcousticProfile();
    if (isFinalLap && acoustic.hasTurbo) {
      this.scheduleTimeout(() => this.triggerTurboBlowoff(0.75), 110);
    }
  }

  public triggerFinishFanfare(won: boolean) {
    if (!this.ctx || !this.masterMixBus || this.muted) return;
    this.ensureRunning();
    const now = this.ctx.currentTime;

    if (won) {
      const boom = this.ctx.createOscillator();
      boom.type = 'sine';
      boom.frequency.setValueAtTime(116, now);
      boom.frequency.exponentialRampToValueAtTime(30, now + 0.56);
      const boomG = this.ctx.createGain();
      boomG.gain.setValueAtTime(0.42, now);
      boomG.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      boom.connect(boomG);
      boomG.connect(this.masterMixBus);
      boom.start(now);
      boom.stop(now + 0.62);
      this.trackAndCleanupVoice(boom, [boom, boomG], 620);

      const secondHit = this.ctx.createOscillator();
      secondHit.type = 'sine';
      secondHit.frequency.setValueAtTime(106, now + 0.24);
      secondHit.frequency.exponentialRampToValueAtTime(32, now + 0.72);
      const secondG = this.ctx.createGain();
      secondG.gain.setValueAtTime(0.36, now + 0.24);
      secondG.gain.exponentialRampToValueAtTime(0.001, now + 0.76);
      secondHit.connect(secondG);
      secondG.connect(this.masterMixBus);
      secondHit.start(now + 0.24);
      secondHit.stop(now + 0.78);
      this.trackAndCleanupVoice(secondHit, [secondHit, secondG], 780);

      const hits = [
        { t: now, freqs: [261.63, 392.0, 523.25], dur: 0.34 },
        { t: now + 0.24, freqs: [293.66, 392.0, 493.88, 783.99], dur: 0.9 },
      ];
      hits.forEach((hit) => {
        hit.freqs.forEach((freq) => {
          const osc = this.ctx!.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, hit.t);
          const filt = this.ctx!.createBiquadFilter();
          filt.type = 'lowpass';
          filt.frequency.setValueAtTime(1050, hit.t);
          filt.frequency.exponentialRampToValueAtTime(2400, hit.t + 0.14);
          filt.frequency.exponentialRampToValueAtTime(1050, hit.t + hit.dur);
          filt.Q.value = 1.5;
          const g = this.ctx!.createGain();
          g.gain.setValueAtTime(0.082, hit.t);
          g.gain.exponentialRampToValueAtTime(0.001, hit.t + hit.dur);
          osc.connect(filt);
          filt.connect(g);
          g.connect(this.masterMixBus!);
          if (this.garageHallSend) g.connect(this.garageHallSend);
          osc.start(hit.t);
          osc.stop(hit.t + hit.dur + 0.03);
          this.trackAndCleanupVoice(osc, [osc, filt, g], (hit.t - now + hit.dur + 0.04) * 1000);
        });
      });

      const acoustic = this.getAcousticProfile();
      if (!acoustic.isElectric) {
        this.triggerExhaustPop(0.24);
        this.scheduleTimeout(() => this.triggerExhaustPop(0.2), 245);
        if (acoustic.hasTurbo) {
          this.scheduleTimeout(() => this.triggerTurboBlowoff(0.85), 340);
        }
      }
    } else {
      const drop = this.ctx.createOscillator();
      drop.type = 'sine';
      drop.frequency.setValueAtTime(128, now);
      drop.frequency.exponentialRampToValueAtTime(32, now + 0.62);
      const dropG = this.ctx.createGain();
      dropG.gain.setValueAtTime(0.4, now);
      dropG.gain.exponentialRampToValueAtTime(0.001, now + 0.66);
      drop.connect(dropG);
      dropG.connect(this.masterMixBus);
      drop.start(now);
      drop.stop(now + 0.68);
      this.trackAndCleanupVoice(drop, [drop, dropG], 680);

      [220.0, 196.0, 146.83].forEach((freq, idx) => {
        const t = now + idx * 0.16;
        const osc = this.ctx!.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.94, t + 0.45);
        const filt = this.ctx!.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.setValueAtTime(920, t);
        filt.frequency.exponentialRampToValueAtTime(320, t + 0.45);
        filt.Q.value = 1.4;
        const g = this.ctx!.createGain();
        g.gain.setValueAtTime(0.095, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.48);
        osc.connect(filt);
        filt.connect(g);
        g.connect(this.masterMixBus!);
        if (this.garageHallSend) g.connect(this.garageHallSend);
        osc.start(t);
        osc.stop(t + 0.5);
        this.trackAndCleanupVoice(osc, [osc, filt, g], (idx * 0.16 + 0.52) * 1000);
      });
    }
  }

  public triggerGearShift() {
    if (!this.ctx || !this.masterMixBus || this.muted) return;
    if (!this.canPlaySfx('gearShift')) return;
    const ctx = this.ctx;
    const bus = this.masterMixBus;
    const now = ctx.currentTime;

    const thump = ctx.createOscillator();
    thump.type = 'triangle';
    thump.frequency.setValueAtTime(165, now);
    thump.frequency.exponentialRampToValueAtTime(52, now + 0.085);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.16, now);
    tg.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    thump.connect(tg);
    tg.connect(bus);
    thump.start(now);
    thump.stop(now + 0.095);
    this.trackAndCleanupVoice(thump, [thump, tg], 110);

    const acoustic = this.getAcousticProfile();
    if (acoustic.isElectric) return;
    if (acoustic.hasTurbo) {
      this.triggerTurboBlowoff(0.65);
    } else {
      this.triggerExhaustPop(0.32);
    }
  }

  public triggerPerfectLaunch() {
    if (!this.ctx || !this.masterMixBus || this.muted) return;
    if (!this.canPlaySfx('perfectLaunch', true)) return;
    const ctx = this.ctx;
    const bus = this.masterMixBus;
    const now = ctx.currentTime;

    const kick = ctx.createOscillator();
    kick.type = 'sine';
    kick.frequency.setValueAtTime(148, now);
    kick.frequency.exponentialRampToValueAtTime(36, now + 0.34);
    const kg = ctx.createGain();
    kg.gain.setValueAtTime(0.36, now);
    kg.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    kick.connect(kg);
    kg.connect(bus);
    kick.start(now);
    kick.stop(now + 0.38);
    this.trackAndCleanupVoice(kick, [kick, kg], 380);

    [440, 659.25, 880].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const t = now + idx * 0.04;
      osc.frequency.setValueAtTime(freq, t);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.11, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      osc.connect(og);
      og.connect(bus);
      if (this.garageHallSend) og.connect(this.garageHallSend);
      osc.start(t);
      osc.stop(t + 0.26);
      this.trackAndCleanupVoice(osc, [osc, og], (idx * 0.04 + 0.26) * 1000);
    });
  }

  public triggerComboMilestone(multiplier: number) {
    if (!this.ctx || !this.masterMixBus || this.muted) return;
    if (!this.canPlaySfx('comboMilestone')) return;
    const ctx = this.ctx;
    const bus = this.masterMixBus;
    const now = ctx.currentTime;
    const safeMult = Math.max(2, Math.min(5, Math.round(multiplier)));
    const baseFreq = 392 * Math.pow(1.12, safeMult - 2);

    [1, 1.5].forEach((ratio, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const t = now + idx * 0.035;
      osc.frequency.setValueAtTime(baseFreq * ratio, t);
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.setValueAtTime(2200, t);
      filt.frequency.exponentialRampToValueAtTime(680, t + 0.22);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.078, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      osc.connect(filt);
      filt.connect(g);
      g.connect(bus);
      if (this.garageHallSend) g.connect(this.garageHallSend);
      osc.start(t);
      osc.stop(t + 0.25);
      this.trackAndCleanupVoice(osc, [osc, filt, g], (idx * 0.035 + 0.26) * 1000);
    });
  }
}

export const soundEngine = new SoundEngine();
