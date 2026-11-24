import { CarSpec } from '../types/game';

type EngineCharacter = CarSpec['bodyStyle'];

function createExhaustWave(ctx: AudioContext, harmonics: number[]): PeriodicWave {
  const real = new Float32Array(harmonics.length + 1);
  const imag = new Float32Array(harmonics.length + 1);
  for (let i = 0; i < harmonics.length; i++) {
    imag[i + 1] = harmonics[i];
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

function makeWarmSaturationCurve(drive = 2.2): Float32Array<ArrayBuffer> {
  const samples = 2048;
  const buffer = new ArrayBuffer(samples * 4);
  const curve = new Float32Array(buffer);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    // Asymmetric soft tube/manifold saturation produces both even & odd engine harmonics
    curve[i] = Math.tanh(x * drive + 0.14 * x * x - 0.04 * x * x * x);
  }
  return curve;
}

function createAcousticImpulse(ctx: AudioContext, duration = 0.85, decay = 3.2): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * duration);
  const ir = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const chan = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const env = Math.pow(1 - t, decay);
      // Early concrete reflections + smooth diffuse tail
      const earlyTap =
        i === Math.floor(rate * (0.018 + ch * 0.004)) ||
        i === Math.floor(rate * (0.042 + ch * 0.007)) ||
        i === Math.floor(rate * 0.071)
          ? 0.55
          : 0;
      const raw = (Math.random() * 2 - 1) * env + earlyTap * env;
      lp = lp * 0.68 + raw * 0.32;
      chan[i] = lp * 0.65;
    }
  }
  return ir;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterCompressor: DynamicsCompressorNode | null = null;
  private musicGain: GainNode | null = null;
  private acousticConvolver: ConvolverNode | null = null;
  private garageHallSend: GainNode | null = null;

  // Multi-voice combustion engine synth
  private engineOscMain: OscillatorNode | null = null;
  private engineOscBankB: OscillatorNode | null = null;
  private engineOscHarm: OscillatorNode | null = null;
  private engineOscSub: OscillatorNode | null = null;
  private engineBankBGain: GainNode | null = null;
  private engineHarmGain: GainNode | null = null;
  private engineSubGain: GainNode | null = null;

  // Combustion firing-pulse noise rasp (makes synth sound like a real exhaust manifold)
  private raspFilter: BiquadFilterNode | null = null;
  private raspVca: GainNode | null = null;
  private raspModOsc: OscillatorNode | null = null;
  private raspModDepth: GainNode | null = null;

  private chopLfo: OscillatorNode | null = null;
  private chopDepth: GainNode | null = null;
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

  // 3-layer realistic tire friction
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
  private waves: Partial<Record<EngineCharacter, { main: PeriodicWave; harm: PeriodicWave }>> = {};
  private muted = false;
  private initialized = false;
  private lastGear = 1;
  private prevThrottle = false;
  private prevNos = false;
  private popCooldown = 0;
  private blowoffCooldown = 0;
  private carStyle: EngineCharacter = 'coupe';

  public init() {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterCompressor = this.ctx.createDynamicsCompressor();
    this.masterCompressor.threshold.value = -11;
    this.masterCompressor.knee.value = 9;
    this.masterCompressor.ratio.value = 4.2;
    this.masterCompressor.attack.value = 0.003;
    this.masterCompressor.release.value = 0.14;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.58;
    this.masterGain.connect(this.masterCompressor);
    this.masterCompressor.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.6;
    this.musicGain.connect(this.masterGain);

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
      data[i] = (b0 + b1 + b2 + white * 0.18) * 0.48;
    }

    // Shared acoustic reverb for tunnels, garage revs, and heavy crashes
    this.acousticConvolver = this.ctx.createConvolver();
    this.acousticConvolver.buffer = createAcousticImpulse(this.ctx, 0.9, 3.0);
    const reverbReturnFilter = this.ctx.createBiquadFilter();
    reverbReturnFilter.type = 'lowpass';
    reverbReturnFilter.frequency.value = 2100;
    this.acousticConvolver.connect(reverbReturnFilter);
    reverbReturnFilter.connect(this.masterGain);

    this.garageHallSend = this.ctx.createGain();
    this.garageHallSend.gain.value = 0.34;
    this.garageHallSend.connect(this.acousticConvolver);

    // Distinct engine harmonic profiles per chassis architecture
    this.waves = {
      coupe: {
        // Snappy high-revving inline-4 / turbo sport compact
        main: createExhaustWave(this.ctx, [1.0, 0.76, 0.48, 0.3, 0.17, 0.09, 0.04]),
        harm: createExhaustWave(this.ctx, [0.42, 0.95, 0.56, 0.28, 0.14]),
      },
      sedan: {
        // Boxy rally AWD boxer / turbocharged straight-6
        main: createExhaustWave(this.ctx, [1.0, 0.84, 0.55, 0.34, 0.18, 0.09, 0.04]),
        harm: createExhaustWave(this.ctx, [0.62, 0.88, 0.52, 0.3, 0.12]),
      },
      muscle: {
        // Deep lumpy cross-plane V8/V10 rumble with heavy odd/even bottom end
        main: createExhaustWave(this.ctx, [1.0, 0.92, 0.72, 0.48, 0.28, 0.14, 0.06]),
        harm: createExhaustWave(this.ctx, [0.82, 0.94, 0.68, 0.38, 0.18]),
      },
      gtr: {
        // Twin-turbo straight-6 / AWD supercar snarl
        main: createExhaustWave(this.ctx, [1.0, 0.72, 0.64, 0.44, 0.28, 0.16, 0.07]),
        harm: createExhaustWave(this.ctx, [0.54, 0.92, 0.78, 0.44, 0.22]),
      },
      exotic: {
        // Screaming flat-plane V10/V12 Italian supercar howl
        main: createExhaustWave(this.ctx, [0.88, 1.0, 0.82, 0.58, 0.38, 0.22, 0.1]),
        harm: createExhaustWave(this.ctx, [0.38, 0.9, 0.92, 0.56, 0.3]),
      },
    };

    this.engineShaper = this.ctx.createWaveShaper();
    this.engineShaper.curve = makeWarmSaturationCurve(2.25);
    this.engineShaper.oversample = '2x';

    this.engineCabinet = this.ctx.createBiquadFilter();
    this.engineCabinet.type = 'peaking';
    this.engineCabinet.frequency.value = 145;
    this.engineCabinet.Q.value = 1.3;
    this.engineCabinet.gain.value = 6.2;

    this.engineBarkFilter = this.ctx.createBiquadFilter();
    this.engineBarkFilter.type = 'peaking';
    this.engineBarkFilter.frequency.value = 620;
    this.engineBarkFilter.Q.value = 1.6;
    this.engineBarkFilter.gain.value = 2.0;

    this.engineLowpass = this.ctx.createBiquadFilter();
    this.engineLowpass.type = 'lowpass';
    this.engineLowpass.frequency.value = 340;
    this.engineLowpass.Q.value = 1.1;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;

    this.engineOscMain = this.ctx.createOscillator();
    this.engineOscBankB = this.ctx.createOscillator();
    this.engineOscHarm = this.ctx.createOscillator();
    this.engineOscSub = this.ctx.createOscillator();
    this.engineOscSub.type = 'sine';

    this.engineBankBGain = this.ctx.createGain();
    this.engineBankBGain.gain.value = 0.56;
    this.engineHarmGain = this.ctx.createGain();
    this.engineHarmGain.gain.value = 0.38;
    this.engineSubGain = this.ctx.createGain();
    this.engineSubGain.gain.value = 0.54;

    // Gentle cam-lobe idle chop LFO
    this.chopLfo = this.ctx.createOscillator();
    this.chopLfo.type = 'sine';
    this.chopLfo.frequency.value = 14;
    this.chopDepth = this.ctx.createGain();
    this.chopDepth.gain.value = 0.022;
    this.chopLfo.connect(this.chopDepth);
    this.chopDepth.connect(this.engineGain.gain);
    this.chopLfo.start();

    // Firing-rate amplitude-modulated noise rasp for authentic combustion grit
    const raspSrc = this.ctx.createBufferSource();
    raspSrc.buffer = this.noiseBuffer;
    raspSrc.loop = true;
    this.raspFilter = this.ctx.createBiquadFilter();
    this.raspFilter.type = 'bandpass';
    this.raspFilter.frequency.value = 460;
    this.raspFilter.Q.value = 1.4;
    this.raspVca = this.ctx.createGain();
    this.raspVca.gain.value = 0.25;
    this.raspModOsc = this.ctx.createOscillator();
    this.raspModOsc.type = 'sawtooth';
    this.raspModOsc.frequency.value = 48;
    this.raspModDepth = this.ctx.createGain();
    this.raspModDepth.gain.value = 0.22;
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
    this.engineLowpass.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);

    // Acoustic tunnel reverberant reflection + tight metallic slapback bus
    const tunnelDelay = this.ctx.createDelay(0.25);
    tunnelDelay.delayTime.value = 0.056;
    const tunnelFeedback = this.ctx.createGain();
    tunnelFeedback.gain.value = 0.34;
    const tunnelBand = this.ctx.createBiquadFilter();
    tunnelBand.type = 'bandpass';
    tunnelBand.frequency.value = 680;
    tunnelBand.Q.value = 0.85;
    this.tunnelSendGain = this.ctx.createGain();
    this.tunnelSendGain.gain.value = 0;

    this.engineGain.connect(this.tunnelSendGain);
    this.tunnelSendGain.connect(tunnelDelay);
    tunnelDelay.connect(tunnelBand);
    tunnelBand.connect(tunnelFeedback);
    tunnelFeedback.connect(tunnelDelay);
    tunnelBand.connect(this.masterGain);
    this.tunnelSendGain.connect(this.acousticConvolver);

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
    this.intakeFilter.Q.value = 1.5;
    this.intakeGain = this.ctx.createGain();
    this.intakeGain.gain.value = 0;
    intakeSrc.connect(this.intakeFilter);
    this.intakeFilter.connect(this.intakeGain);
    this.intakeGain.connect(this.masterGain);
    intakeSrc.start();

    // Sequential dog-box / straight-cut transmission whine
    this.gearWhineOsc = this.ctx.createOscillator();
    this.gearWhineOsc.type = 'sawtooth';
    this.gearWhineOsc.frequency.value = 480;
    this.gearWhineFilter = this.ctx.createBiquadFilter();
    this.gearWhineFilter.type = 'bandpass';
    this.gearWhineFilter.frequency.value = 1200;
    this.gearWhineFilter.Q.value = 4.2;
    this.gearWhineGain = this.ctx.createGain();
    this.gearWhineGain.gain.value = 0;
    this.gearWhineOsc.connect(this.gearWhineFilter);
    this.gearWhineFilter.connect(this.gearWhineGain);
    this.gearWhineGain.connect(this.masterGain);
    this.gearWhineOsc.start();

    // Twin-scroll turbocharger compressor spool
    const turboSrc = this.ctx.createBufferSource();
    turboSrc.buffer = this.noiseBuffer;
    turboSrc.loop = true;
    this.turboSpoolFilter = this.ctx.createBiquadFilter();
    this.turboSpoolFilter.type = 'bandpass';
    this.turboSpoolFilter.frequency.value = 2600;
    this.turboSpoolFilter.Q.value = 7.5;
    this.turboSpoolGain = this.ctx.createGain();
    this.turboSpoolGain.gain.value = 0;
    turboSrc.connect(this.turboSpoolFilter);
    this.turboSpoolFilter.connect(this.turboSpoolGain);
    this.turboSpoolGain.connect(this.masterGain);
    turboSrc.start();

    // Nitrous oxide purge + blue jet burn
    const nosSource = this.ctx.createBufferSource();
    nosSource.buffer = this.noiseBuffer;
    nosSource.loop = true;
    this.nosNoiseFilter = this.ctx.createBiquadFilter();
    this.nosNoiseFilter.type = 'bandpass';
    this.nosNoiseFilter.frequency.value = 780;
    this.nosNoiseFilter.Q.value = 0.95;
    this.nosNoiseGain = this.ctx.createGain();
    this.nosNoiseGain.gain.value = 0;
    nosSource.connect(this.nosNoiseFilter);
    this.nosNoiseFilter.connect(this.nosNoiseGain);
    this.nosNoiseGain.connect(this.masterGain);
    nosSource.start();

    // 3-Layer Tire Scrub + Rubber Howl + High Squeal
    const tireSource = this.ctx.createBufferSource();
    tireSource.buffer = this.noiseBuffer;
    tireSource.loop = true;

    this.tireScrubFilter = this.ctx.createBiquadFilter();
    this.tireScrubFilter.type = 'bandpass';
    this.tireScrubFilter.frequency.value = 460;
    this.tireScrubFilter.Q.value = 1.6;
    this.tireScrubGain = this.ctx.createGain();
    this.tireScrubGain.gain.value = 0;
    tireSource.connect(this.tireScrubFilter);
    this.tireScrubFilter.connect(this.tireScrubGain);
    this.tireScrubGain.connect(this.masterGain);

    this.tireLowFilter = this.ctx.createBiquadFilter();
    this.tireLowFilter.type = 'bandpass';
    this.tireLowFilter.frequency.value = 980;
    this.tireLowFilter.Q.value = 4.4;
    this.tireLowGain = this.ctx.createGain();
    this.tireLowGain.gain.value = 0;
    tireSource.connect(this.tireLowFilter);
    this.tireLowFilter.connect(this.tireLowGain);
    this.tireLowGain.connect(this.masterGain);

    this.tireHighFilter = this.ctx.createBiquadFilter();
    this.tireHighFilter.type = 'bandpass';
    this.tireHighFilter.frequency.value = 1920;
    this.tireHighFilter.Q.value = 5.2;
    this.tireHighGain = this.ctx.createGain();
    this.tireHighGain.gain.value = 0;
    tireSource.connect(this.tireHighFilter);
    this.tireHighFilter.connect(this.tireHighGain);
    this.tireHighGain.connect(this.masterGain);
    tireSource.start();

    // Shoulder Curb / Rumble Strip vibration noise
    const curbSrc = this.ctx.createBufferSource();
    curbSrc.buffer = this.noiseBuffer;
    curbSrc.loop = true;
    const curbFilter = this.ctx.createBiquadFilter();
    curbFilter.type = 'lowpass';
    curbFilter.frequency.value = 165;
    this.curbRumbleGain = this.ctx.createGain();
    this.curbRumbleGain.gain.value = 0;
    curbSrc.connect(curbFilter);
    curbFilter.connect(this.curbRumbleGain);
    this.curbRumbleGain.connect(this.masterGain);
    curbSrc.start();

    // Aerodynamic Wind & Slipstream Rush
    const windSrc = this.ctx.createBufferSource();
    windSrc.buffer = this.noiseBuffer;
    windSrc.loop = true;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 480;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    windSrc.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);
    windSrc.start();

    // Concrete/Guardrail Spark Wall Scrape layer
    const scrapeSrc = this.ctx.createBufferSource();
    scrapeSrc.buffer = this.noiseBuffer;
    scrapeSrc.loop = true;
    this.scrapeFilter = this.ctx.createBiquadFilter();
    this.scrapeFilter.type = 'bandpass';
    this.scrapeFilter.frequency.value = 2350;
    this.scrapeFilter.Q.value = 2.1;
    this.scrapeGain = this.ctx.createGain();
    this.scrapeGain.gain.value = 0;
    scrapeSrc.connect(this.scrapeFilter);
    this.scrapeFilter.connect(this.scrapeGain);
    this.scrapeGain.connect(this.masterGain);
    scrapeSrc.start();

    // Horn-Filtered RPD Police Wail + Yelp Siren
    this.sirenOscA = this.ctx.createOscillator();
    this.sirenOscA.type = 'sawtooth';
    this.sirenOscB = this.ctx.createOscillator();
    this.sirenOscB.type = 'triangle';
    const sirenHorn = this.ctx.createBiquadFilter();
    sirenHorn.type = 'bandpass';
    sirenHorn.frequency.value = 1120;
    sirenHorn.Q.value = 1.65;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOscA.connect(sirenHorn);
    this.sirenOscB.connect(sirenHorn);
    sirenHorn.connect(this.sirenGain);
    this.sirenGain.connect(this.masterGain);
    this.sirenOscA.start();
    this.sirenOscB.start();

    this.initialized = true;
  }

  private applyCarWaveform() {
    const w = this.waves[this.carStyle] ?? this.waves.coupe;
    if (!w) return;
    this.engineOscMain?.setPeriodicWave(w.main);
    this.engineOscBankB?.setPeriodicWave(w.main);
    this.engineOscHarm?.setPeriodicWave(w.harm);
  }

  public setCarStyle(style: EngineCharacter) {
    this.carStyle = style;
    if (this.initialized) {
      this.applyCarWaveform();
    }
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.58, this.ctx.currentTime, 0.05);
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
    if (!this.ctx || !this.initialized) return;
    const now = this.ctx.currentTime;
    this.engineGain?.gain.setTargetAtTime(0, now, 0.07);
    this.intakeGain?.gain.setTargetAtTime(0, now, 0.06);
    this.gearWhineGain?.gain.setTargetAtTime(0, now, 0.06);
    this.turboSpoolGain?.gain.setTargetAtTime(0, now, 0.06);
    this.nosNoiseGain?.gain.setTargetAtTime(0, now, 0.05);
    this.tireScrubGain?.gain.setTargetAtTime(0, now, 0.05);
    this.tireLowGain?.gain.setTargetAtTime(0, now, 0.05);
    this.tireHighGain?.gain.setTargetAtTime(0, now, 0.05);
    this.curbRumbleGain?.gain.setTargetAtTime(0, now, 0.05);
    this.windGain?.gain.setTargetAtTime(0, now, 0.06);
    this.scrapeGain?.gain.setTargetAtTime(0, now, 0.04);
    this.sirenGain?.gain.setTargetAtTime(0, now, 0.08);
    this.tunnelSendGain?.gain.setTargetAtTime(0, now, 0.08);
    this.prevNos = false;
  }

  private getPitchScale(): number {
    switch (this.carStyle) {
      case 'muscle':
        return 0.68;
      case 'gtr':
        return 1.08;
      case 'exotic':
        return 1.28;
      case 'sedan':
        return 0.96;
      default:
        return 0.94;
    }
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

    const now = this.ctx.currentTime;
    if (this.popCooldown > 0) this.popCooldown = Math.max(0, this.popCooldown - 0.016);
    if (this.blowoffCooldown > 0) this.blowoffCooldown = Math.max(0, this.blowoffCooldown - 0.016);

    const timeSlow = params.timeScale < 0.7 ? 0.6 : 1.0;
    const pitchFactor = timeSlow * this.getPitchScale();
    const speedKmh = params.speedKmh ?? params.rpm * 200;

    // Upshift ignition-cut thump + compressor-surge turbo flutter + overrun pops
    if (params.gear > this.lastGear && params.gear > 1) {
      if (this.carStyle !== 'muscle' && this.blowoffCooldown <= 0) {
        this.triggerTurboBlowoff(1.0);
        this.blowoffCooldown = 0.25;
      }
      this.triggerExhaustPop(this.carStyle === 'muscle' ? 0.26 : 0.2);
    } else if (params.gear < this.lastGear && params.gear >= 1 && speedKmh > 55 && this.popCooldown <= 0) {
      // Aggressive downshift crackle burst
      this.triggerExhaustPop(0.2);
      window.setTimeout(() => this.triggerExhaustPop(0.14), 65);
      window.setTimeout(() => this.triggerExhaustPop(0.1), 140);
      this.popCooldown = 0.28;
    } else if (this.prevThrottle && !params.throttle && params.rpm > 0.52 && this.popCooldown <= 0) {
      // Throttle-lift overrun exhaust burble + turbo flutter
      if (this.carStyle !== 'muscle' && params.rpm > 0.66 && this.blowoffCooldown <= 0) {
        this.triggerTurboBlowoff(0.75);
        this.blowoffCooldown = 0.35;
      }
      this.triggerExhaustPop(this.carStyle === 'muscle' ? 0.22 : 0.16);
      if (this.carStyle === 'sedan' || this.carStyle === 'gtr') {
        window.setTimeout(() => this.triggerExhaustPop(0.11), 85);
      }
      this.popCooldown = 0.4;
    }
    if (params.nosActive && !this.prevNos) {
      this.triggerNosIgnite();
    }
    this.lastGear = params.gear;
    this.prevThrottle = params.throttle;
    this.prevNos = params.nosActive;

    // Crisp rev-limiter spark cut above 96% RPM
    const redlineActive = params.throttle && params.rpm > 0.962;
    const redlineCut = redlineActive && Math.sin(now * 78) > 0.42 ? 0.56 : 1.0;

    const baseFreq = (40 + params.rpm * 144) * pitchFactor;
    const detuneRatio = this.carStyle === 'muscle' ? 1.014 : this.carStyle === 'exotic' ? 1.005 : 1.009;
    const harmRatio = this.carStyle === 'muscle' ? 1.333 : this.carStyle === 'exotic' ? 2.0 : 1.5;

    this.engineOscMain?.frequency.setTargetAtTime(baseFreq, now, 0.028);
    this.engineOscBankB?.frequency.setTargetAtTime(baseFreq * detuneRatio, now, 0.028);
    this.engineOscHarm?.frequency.setTargetAtTime(baseFreq * harmRatio, now, 0.028);
    this.engineOscSub?.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.028);

    // Firing-rate exhaust rasp filter tracks engine harmonic sweep
    this.raspModOsc?.frequency.setTargetAtTime(Math.max(24, baseFreq), now, 0.03);
    this.raspFilter?.frequency.setTargetAtTime(280 + params.rpm * 1050 + (params.throttle ? 240 : 0), now, 0.04);
    this.raspVca?.gain.setTargetAtTime(
      params.throttle ? 0.22 + params.rpm * 0.28 : 0.08 + params.rpm * 0.1,
      now,
      0.04,
    );

    const idleChopRate = this.carStyle === 'muscle' ? 11.5 : 16;
    this.chopLfo?.frequency.setTargetAtTime(Math.max(idleChopRate, baseFreq * 0.26), now, 0.05);
    this.chopDepth?.gain.setTargetAtTime(
      params.throttle ? 0.01 : this.carStyle === 'muscle' ? 0.036 : 0.022,
      now,
      0.05,
    );

    // Exhaust manifold tone opens sharply with throttle load
    this.engineBarkFilter?.frequency.setTargetAtTime(
      this.carStyle === 'muscle' ? 460 + params.rpm * 360 : 620 + params.rpm * 680,
      now,
      0.045,
    );
    this.engineBarkFilter?.gain.setTargetAtTime(params.throttle ? 4.8 : 1.2, now, 0.045);

    const filterCutoff =
      (220 + params.rpm * 1180 + (params.throttle ? 540 : 45) + (params.nosActive ? 320 : 0)) *
      (params.timeScale < 0.7 ? 0.52 : 1.0);
    this.engineLowpass?.frequency.setTargetAtTime(filterCutoff, now, 0.04);

    const targetEngineGain = (0.17 + (params.throttle ? 0.17 : 0.038) + params.rpm * 0.1) * redlineCut;
    this.engineGain?.gain.setTargetAtTime(targetEngineGain, now, 0.03);
    this.tunnelSendGain?.gain.setTargetAtTime(params.inTunnel ? 0.58 : 0, now, 0.07);

    // Cold-airbox intake suction growl
    this.intakeFilter?.frequency.setTargetAtTime(360 + params.rpm * 1120, now, 0.045);
    this.intakeGain?.gain.setTargetAtTime(
      params.throttle ? (0.028 + params.rpm * 0.055) * redlineCut : 0.008,
      now,
      0.04,
    );

    // Helical / dog-box race transmission whine
    const whineAllowed = this.carStyle === 'gtr' || this.carStyle === 'exotic' || this.carStyle === 'muscle';
    if (whineAllowed && speedKmh > 65) {
      const whineFreq = (340 + speedKmh * 3.4 + params.rpm * 180) * timeSlow;
      this.gearWhineOsc?.frequency.setTargetAtTime(whineFreq, now, 0.045);
      this.gearWhineFilter?.frequency.setTargetAtTime(Math.min(3400, whineFreq * 1.15), now, 0.045);
      const baseWhine = this.carStyle === 'gtr' ? 0.024 : this.carStyle === 'exotic' ? 0.018 : 0.011;
      const loadMult = params.throttle ? 1.0 : 0.45;
      this.gearWhineGain?.gain.setTargetAtTime(
        baseWhine * loadMult * Math.min(1, (speedKmh - 65) / 130),
        now,
        0.05,
      );
    } else {
      this.gearWhineGain?.gain.setTargetAtTime(0, now, 0.06);
    }

    // Twin-scroll turbocharger compressor whistle
    if (params.throttle && params.rpm > 0.34 && this.carStyle !== 'muscle') {
      const spoolFreq = (2100 + params.rpm * 2400) * timeSlow;
      this.turboSpoolFilter?.frequency.setTargetAtTime(spoolFreq, now, 0.05);
      this.turboSpoolGain?.gain.setTargetAtTime(0.036 * (params.rpm - 0.32), now, 0.05);
    } else {
      this.turboSpoolGain?.gain.setTargetAtTime(0, now, 0.08);
    }

    // Aerodynamic wind rush + drafting + close jersey-barrier slapback reflection
    const baseWind = speedKmh > 95 ? Math.min(0.15, ((speedKmh - 95) / 215) * 0.15) : 0;
    const extraWind = (params.drafting ? 0.055 : 0) + (params.nearBarrier && speedKmh > 105 ? 0.04 : 0);
    const windCutoff = (460 + speedKmh * 2.4 + (params.drafting ? 380 : 0)) * (params.timeScale < 0.7 ? 0.55 : 1.0);
    this.windFilter?.frequency.setTargetAtTime(windCutoff, now, 0.06);
    this.windGain?.gain.setTargetAtTime(Math.min(0.24, baseWind + extraWind), now, 0.06);

    // NOS Afterburner Jet
    this.nosNoiseFilter?.frequency.setTargetAtTime(params.nosActive ? 820 + params.rpm * 260 : 720, now, 0.05);
    this.nosNoiseGain?.gain.setTargetAtTime(params.nosActive ? 0.24 : 0, now, 0.04);

    // 3-Layer Tire Scrub + Squeal (drifting OR standing launch wheelspin)
    const wheelspin = params.airborne ? 0 : (params.wheelspin ?? 0);
    const slip = params.airborne ? 0 : Math.max(params.driftSlip, wheelspin * 0.78);
    const scrubVol = slip > 0.1 ? Math.min(0.12, (slip - 0.1) * 0.2) : 0;
    const lowTire = slip > 0.17 ? Math.min(0.14, (slip - 0.17) * 0.24) : 0;
    const highTire = slip > 0.27 ? Math.min(0.1, (slip - 0.27) * 0.21) : 0;
    this.tireScrubFilter?.frequency.setTargetAtTime(420 + slip * 220, now, 0.04);
    this.tireLowFilter?.frequency.setTargetAtTime(910 + slip * 330 + Math.sin(now * 26) * 48, now, 0.035);
    this.tireHighFilter?.frequency.setTargetAtTime(1820 + slip * 420 + Math.cos(now * 19) * 35, now, 0.035);
    this.tireScrubGain?.gain.setTargetAtTime(scrubVol, now, 0.035);
    this.tireLowGain?.gain.setTargetAtTime(lowTire, now, 0.035);
    this.tireHighGain?.gain.setTargetAtTime(highTire, now, 0.035);

    // Concrete Barrier / Guardrail Scrape Sparks audio
    const scrape = params.wallScrape ?? 0;
    if (scrape > 0.05) {
      this.scrapeFilter?.frequency.setTargetAtTime(1950 + scrape * 1400 + Math.sin(now * 42) * 280, now, 0.03);
      this.scrapeGain?.gain.setTargetAtTime(Math.min(0.18, scrape * 0.18), now, 0.03);
    } else {
      this.scrapeGain?.gain.setTargetAtTime(0, now, 0.04);
    }

    // Rumble Strip / Shoulder Curb Clatter
    this.curbRumbleGain?.gain.setTargetAtTime(
      params.onCurb && !params.airborne && speedKmh > 28 ? Math.min(0.2, speedKmh / 900) : 0,
      now,
      0.03,
    );

    // Authentic Dual-Mode RPD Siren (Wail at medium range -> Urgent Yelp close by)
    if (params.copProximity > 0.05 && this.sirenOscA && this.sirenOscB && this.sirenGain) {
      const isYelp = params.copProximity > 0.52;
      const cycleSpeed = isYelp ? 16.5 : 4.2;
      // Asymmetric saw/triangle sweep mimics real mechanical/electronic police sirens
      const phaseA = Math.sin(now * cycleSpeed);
      const phaseB = Math.sin(now * cycleSpeed + 0.35);
      const baseHz = isYelp ? 840 : 720;
      const sweepHz = isYelp ? 260 : 240;
      this.sirenOscA.frequency.setTargetAtTime((baseHz + phaseA * sweepHz) * timeSlow, now, 0.018);
      this.sirenOscB.frequency.setTargetAtTime((baseHz * 1.07 + phaseB * sweepHz) * timeSlow, now, 0.018);
      this.sirenGain.gain.setTargetAtTime(params.copProximity * 0.09, now, 0.07);
    } else {
      this.sirenGain?.gain.setTargetAtTime(0, now, 0.08);
    }
  }

  private triggerNosIgnite() {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(175, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.24);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.32, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.27);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.28);

    // High-pressure N2O bottle purge hiss transient
    if (this.noiseBuffer) {
      const purgeSrc = this.ctx.createBufferSource();
      purgeSrc.buffer = this.noiseBuffer;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.setValueAtTime(3400, now);
      hp.frequency.exponentialRampToValueAtTime(1600, now + 0.14);
      hp.Q.value = 1.8;
      const pg = this.ctx.createGain();
      pg.gain.setValueAtTime(0.14, now);
      pg.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      purgeSrc.connect(hp);
      hp.connect(pg);
      pg.connect(this.masterGain);
      purgeSrc.start(now);
      purgeSrc.stop(now + 0.16);
    }
  }

  private triggerTurboBlowoff(scale = 1.0) {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    // Authentic multi-blade compressor surge flutter ("stu-tu-tu-tu")
    const pulseCount = this.carStyle === 'gtr' || this.carStyle === 'sedan' ? 4 : 3;
    for (let i = 0; i < pulseCount; i++) {
      const start = now + i * 0.048;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2750 - i * 380, start);
      filter.frequency.exponentialRampToValueAtTime(980, start + 0.048);
      filter.Q.value = 5.2;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime((0.11 * scale) / (i + 1), start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.05);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      src.start(start);
      src.stop(start + 0.056);
    }
  }

  private triggerExhaustPop(level = 0.2) {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(165, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.095);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(level * 1.1, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.12);

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 640;
    filt.Q.value = 1.25;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(level * 0.68, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
    src.connect(filt);
    filt.connect(ng);
    ng.connect(this.masterGain);
    if (this.garageHallSend) ng.connect(this.garageHallSend);
    src.start(now);
    src.stop(now + 0.095);
  }

  public triggerLandingThump() {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(98, now);
    osc.frequency.exponentialRampToValueAtTime(26, now + 0.2);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.42, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.23);

    // Suspension bottom-out spring clunk
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 340;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.24, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      src.connect(lp);
      lp.connect(ng);
      ng.connect(this.masterGain);
      src.start(now);
      src.stop(now + 0.13);
    }
  }

  public triggerImpact(intensity: number) {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const clamped = Math.max(0.15, Math.min(1, intensity));

    // Heavy body/chassis thump
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(115, now);
    sub.frequency.exponentialRampToValueAtTime(24, now + 0.26);
    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(clamped * 0.64, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    sub.connect(subGain);
    subGain.connect(this.masterGain);
    sub.start(now);
    sub.stop(now + 0.29);

    // Crushed sheet-metal midrange crunch
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1350, now);
    filter.frequency.exponentialRampToValueAtTime(210, now + 0.25);
    filter.Q.value = 1.05;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(clamped * 0.46, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.27);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    if (this.garageHallSend) gain.connect(this.garageHallSend);
    src.start(now);
    src.stop(now + 0.28);

    // High-frequency glass/trim shatter burst on heavy hits
    if (clamped > 0.48) {
      const glass = this.ctx.createBufferSource();
      glass.buffer = this.noiseBuffer;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 3400;
      const gg = this.ctx.createGain();
      gg.gain.setValueAtTime((clamped - 0.4) * 0.24, now + 0.01);
      gg.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      glass.connect(hp);
      hp.connect(gg);
      gg.connect(this.masterGain);
      glass.start(now + 0.01);
      glass.stop(now + 0.18);
    }
  }

  public triggerRadioSquelch() {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 2150;
    filt.Q.value = 2.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.095, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.masterGain);
    src.start(now);
    src.stop(now + 0.1);

    // Authentic RPD VHF dispatch key-down chirp
    const chirp = this.ctx.createOscillator();
    chirp.type = 'sine';
    chirp.frequency.setValueAtTime(1680, now + 0.01);
    chirp.frequency.setValueAtTime(1240, now + 0.045);
    const cg = this.ctx.createGain();
    cg.gain.setValueAtTime(0.06, now + 0.01);
    cg.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    chirp.connect(cg);
    cg.connect(this.masterGain);
    chirp.start(now + 0.01);
    chirp.stop(now + 0.09);
  }

  public triggerBeep(high = false) {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;

    // Punchy industrial synth thump + detuned fifth stab (never a thin bare beep)
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(high ? 148 : 96, now);
    sub.frequency.exponentialRampToValueAtTime(38, now + 0.14);
    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0.24, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    sub.connect(subGain);
    subGain.connect(this.masterGain);
    sub.start(now);
    sub.stop(now + 0.16);

    const baseF = high ? 587.33 : 392.0;
    const ratios = high ? [1.0, 1.008, 1.5] : [1.0, 1.009];
    ratios.forEach((r) => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(baseF * r, now);
      if (high) osc.frequency.exponentialRampToValueAtTime(baseF * r * 1.18, now + 0.09);
      const filter = this.ctx!.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(high ? 2600 : 1550, now);
      filter.frequency.exponentialRampToValueAtTime(620, now + 0.22);
      filter.Q.value = 1.8;
      const gain = this.ctx!.createGain();
      gain.gain.setValueAtTime(0.085, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (high ? 0.26 : 0.16));
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain!);
      if (this.garageHallSend) gain.connect(this.garageHallSend);
      osc.start(now);
      osc.stop(now + 0.28);
    });
  }

  public triggerGarageRev(style: EngineCharacter) {
    this.init();
    if (!this.ctx || !this.masterGain || this.muted) return;
    this.setCarStyle(style);
    const now = this.ctx.currentTime;
    const scale = this.getPitchScale();

    const osc = this.ctx.createOscillator();
    const oscB = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const oscSub = this.ctx.createOscillator();
    oscSub.type = 'sine';

    const w = this.waves[style] ?? this.waves.coupe!;
    osc.setPeriodicWave(w.main);
    oscB.setPeriodicWave(w.main);
    osc2.setPeriodicWave(w.harm);

    const bankMix = this.ctx.createGain();
    bankMix.gain.value = 0.56;
    const harmMix = this.ctx.createGain();
    harmMix.gain.value = 0.42;
    const subMix = this.ctx.createGain();
    subMix.gain.value = 0.52;

    const startF = 46 * scale;
    const blipF = 165 * scale;
    const peakF = 212 * scale;
    const detune = style === 'muscle' ? 1.015 : 1.008;
    const harmRatio = style === 'muscle' ? 1.333 : style === 'exotic' ? 2.0 : 1.5;

    // Two-stage aggressive Safe-House dyno rev blip
    osc.frequency.setValueAtTime(startF, now);
    osc.frequency.exponentialRampToValueAtTime(blipF, now + 0.16);
    osc.frequency.exponentialRampToValueAtTime(startF * 1.45, now + 0.34);
    osc.frequency.exponentialRampToValueAtTime(peakF, now + 0.56);
    osc.frequency.exponentialRampToValueAtTime(startF * 1.1, now + 1.25);

    oscB.frequency.setValueAtTime(startF * detune, now);
    oscB.frequency.exponentialRampToValueAtTime(blipF * detune, now + 0.16);
    oscB.frequency.exponentialRampToValueAtTime(startF * 1.45 * detune, now + 0.34);
    oscB.frequency.exponentialRampToValueAtTime(peakF * detune, now + 0.56);
    oscB.frequency.exponentialRampToValueAtTime(startF * 1.1 * detune, now + 1.25);

    osc2.frequency.setValueAtTime(startF * harmRatio, now);
    osc2.frequency.exponentialRampToValueAtTime(blipF * harmRatio, now + 0.16);
    osc2.frequency.exponentialRampToValueAtTime(startF * 1.45 * harmRatio, now + 0.34);
    osc2.frequency.exponentialRampToValueAtTime(peakF * harmRatio, now + 0.56);
    osc2.frequency.exponentialRampToValueAtTime(startF * 1.1 * harmRatio, now + 1.25);

    oscSub.frequency.setValueAtTime(startF * 0.5, now);
    oscSub.frequency.exponentialRampToValueAtTime(blipF * 0.5, now + 0.16);
    oscSub.frequency.exponentialRampToValueAtTime(startF * 0.72, now + 0.34);
    oscSub.frequency.exponentialRampToValueAtTime(peakF * 0.5, now + 0.56);
    oscSub.frequency.exponentialRampToValueAtTime(startF * 0.55, now + 1.25);

    const shaper = this.ctx.createWaveShaper();
    shaper.curve = makeWarmSaturationCurve(2.2);

    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(280, now);
    filt.frequency.exponentialRampToValueAtTime(1680, now + 0.16);
    filt.frequency.exponentialRampToValueAtTime(520, now + 0.34);
    filt.frequency.exponentialRampToValueAtTime(2150, now + 0.56);
    filt.frequency.exponentialRampToValueAtTime(240, now + 1.25);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.12);
    gain.gain.linearRampToValueAtTime(0.32, now + 0.55);
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
    gain.connect(this.masterGain);
    if (this.garageHallSend) gain.connect(this.garageHallSend);

    osc.start(now);
    oscB.start(now);
    osc2.start(now);
    oscSub.start(now);
    osc.stop(now + 1.3);
    oscB.stop(now + 1.3);
    osc2.stop(now + 1.3);
    oscSub.stop(now + 1.3);

    window.setTimeout(() => {
      if (style !== 'muscle') this.triggerTurboBlowoff(0.85);
      this.triggerExhaustPop(0.2);
    }, 590);
    window.setTimeout(() => this.triggerExhaustPop(0.14), 720);
  }

  public triggerUpgradeClunk() {
    this.init();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(290, now);
    osc.frequency.exponentialRampToValueAtTime(64, now + 0.11);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.26, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(g);
    g.connect(this.masterGain);
    if (this.garageHallSend) g.connect(this.garageHallSend);
    osc.start(now);
    osc.stop(now + 0.14);

    // Pneumatic impact-wrench ratchet zip
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1800;
      bp.Q.value = 3.2;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.1, now + 0.04);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      src.connect(bp);
      bp.connect(ng);
      ng.connect(this.masterGain);
      src.start(now + 0.04);
      src.stop(now + 0.15);
    }
  }

  public triggerUiClick() {
    this.init();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(640, now);
    osc.frequency.exponentialRampToValueAtTime(190, now + 0.035);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.1, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  public triggerCountdownTick(isGo: boolean) {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    if (!isGo) {
      // Heavy sub-bass drop + aggressive detuned brass/saw grid pulse
      const sub = this.ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(128, now);
      sub.frequency.exponentialRampToValueAtTime(40, now + 0.22);
      const subG = this.ctx.createGain();
      subG.gain.setValueAtTime(0.38, now);
      subG.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      sub.connect(subG);
      subG.connect(this.masterGain);
      sub.start(now);
      sub.stop(now + 0.25);

      [220.0, 222.4, 329.63].forEach((freq) => {
        const osc = this.ctx!.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);
        const filt = this.ctx!.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.setValueAtTime(1950, now);
        filt.frequency.exponentialRampToValueAtTime(480, now + 0.2);
        filt.Q.value = 2.4;
        const g = this.ctx!.createGain();
        g.gain.setValueAtTime(0.11, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(filt);
        filt.connect(g);
        g.connect(this.masterGain!);
        if (this.garageHallSend) g.connect(this.garageHallSend);
        osc.start(now);
        osc.stop(now + 0.24);
      });
    } else {
      // Massive launch-green impact boom + stadium brass power chord + turbo bark
      const boom = this.ctx.createOscillator();
      boom.type = 'sine';
      boom.frequency.setValueAtTime(112, now);
      boom.frequency.exponentialRampToValueAtTime(30, now + 0.42);
      const boomG = this.ctx.createGain();
      boomG.gain.setValueAtTime(0.55, now);
      boomG.gain.exponentialRampToValueAtTime(0.001, now + 0.46);
      boom.connect(boomG);
      boomG.connect(this.masterGain);
      boom.start(now);
      boom.stop(now + 0.48);

      [261.63, 392.0, 523.25, 783.99].forEach((freq, idx) => {
        [-0.007, 0.007].forEach((det) => {
          const osc = this.ctx!.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq * (1 + det), now + idx * 0.014);
          const filt = this.ctx!.createBiquadFilter();
          filt.type = 'lowpass';
          filt.frequency.setValueAtTime(900, now + idx * 0.014);
          filt.frequency.exponentialRampToValueAtTime(3600, now + 0.14);
          filt.frequency.exponentialRampToValueAtTime(1100, now + 0.62);
          filt.Q.value = 2.2;
          const g = this.ctx!.createGain();
          g.gain.setValueAtTime(0.095, now + idx * 0.014);
          g.gain.exponentialRampToValueAtTime(0.001, now + 0.64);
          osc.connect(filt);
          filt.connect(g);
          g.connect(this.masterGain!);
          if (this.garageHallSend) g.connect(this.garageHallSend);
          osc.start(now + idx * 0.014);
          osc.stop(now + 0.66);
        });
      });

      if (this.noiseBuffer) {
        const whoosh = this.ctx.createBufferSource();
        whoosh.buffer = this.noiseBuffer;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(420, now);
        bp.frequency.exponentialRampToValueAtTime(2600, now + 0.25);
        bp.Q.value = 1.4;
        const wg = this.ctx.createGain();
        wg.gain.setValueAtTime(0.24, now);
        wg.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
        whoosh.connect(bp);
        bp.connect(wg);
        wg.connect(this.masterGain);
        whoosh.start(now);
        whoosh.stop(now + 0.36);
      }

      this.triggerExhaustPop(0.32);
      if (this.carStyle !== 'muscle') {
        window.setTimeout(() => this.triggerTurboBlowoff(0.95), 95);
      }
      window.setTimeout(() => this.triggerExhaustPop(0.22), 160);
    }
  }

  public triggerSpeedbreaker(active: boolean) {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(active ? 240 : 54, now);
    osc.frequency.exponentialRampToValueAtTime(active ? 44 : 280, now + 0.25);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.3, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.29);
  }

  public triggerCameraFlash() {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2800;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.22, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.masterGain);
    src.start(now);
    src.stop(now + 0.07);

    const chirp = this.ctx.createOscillator();
    chirp.type = 'sine';
    chirp.frequency.setValueAtTime(1480, now + 0.025);
    chirp.frequency.exponentialRampToValueAtTime(980, now + 0.14);
    const cg = this.ctx.createGain();
    cg.gain.setValueAtTime(0.15, now + 0.025);
    cg.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    chirp.connect(cg);
    cg.connect(this.masterGain);
    chirp.start(now + 0.025);
    chirp.stop(now + 0.17);
  }

  public triggerWoodSmash() {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    [0, 0.03, 0.065].forEach((offset, idx) => {
      const t = now + offset;
      const src = this.ctx!.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx!.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 960 + idx * 450;
      bp.Q.value = 1.9;
      const g = this.ctx!.createGain();
      g.gain.setValueAtTime(0.28 / (idx + 1), t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.095);
      src.connect(bp);
      bp.connect(g);
      g.connect(this.masterGain!);
      src.start(t);
      src.stop(t + 0.11);
    });
  }

  public triggerLapComplete(isFinalLap: boolean) {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;

    // Heavy pit-wall punch + aerodynamic whoosh
    const punch = this.ctx.createOscillator();
    punch.type = 'sine';
    punch.frequency.setValueAtTime(isFinalLap ? 135 : 110, now);
    punch.frequency.exponentialRampToValueAtTime(34, now + 0.24);
    const punchG = this.ctx.createGain();
    punchG.gain.setValueAtTime(isFinalLap ? 0.45 : 0.34, now);
    punchG.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    punch.connect(punchG);
    punchG.connect(this.masterGain);
    punch.start(now);
    punch.stop(now + 0.28);

    if (this.noiseBuffer) {
      const sweep = this.ctx.createBufferSource();
      sweep.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(360, now);
      bp.frequency.exponentialRampToValueAtTime(2800, now + 0.2);
      bp.Q.value = 1.3;
      const sg = this.ctx.createGain();
      sg.gain.setValueAtTime(0.2, now);
      sg.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      sweep.connect(bp);
      bp.connect(sg);
      sg.connect(this.masterGain);
      sweep.start(now);
      sweep.stop(now + 0.26);
    }

    const chord = isFinalLap ? [293.66, 440.0, 587.33, 880.0] : [261.63, 392.0, 523.25];
    chord.forEach((freq, idx) => {
      const t = now + idx * 0.045;
      [-0.006, 0.006].forEach((det) => {
        const osc = this.ctx!.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq * (1 + det), t);
        const filt = this.ctx!.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.setValueAtTime(1600, t);
        filt.frequency.exponentialRampToValueAtTime(3100, t + 0.11);
        filt.frequency.exponentialRampToValueAtTime(850, t + 0.42);
        filt.Q.value = 1.9;
        const g = this.ctx!.createGain();
        g.gain.setValueAtTime(0.085, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.44);
        osc.connect(filt);
        filt.connect(g);
        g.connect(this.masterGain!);
        if (this.garageHallSend) g.connect(this.garageHallSend);
        osc.start(t);
        osc.stop(t + 0.46);
      });
    });

    if (isFinalLap && this.carStyle !== 'muscle') {
      window.setTimeout(() => this.triggerTurboBlowoff(0.85), 110);
    }
  }

  public triggerFinishFanfare(won: boolean) {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;

    if (won) {
      // Heavy stadium victory sub boom + rising power-chord brass hit + celebratory exhaust bark
      const boom = this.ctx.createOscillator();
      boom.type = 'sine';
      boom.frequency.setValueAtTime(118, now);
      boom.frequency.exponentialRampToValueAtTime(28, now + 0.58);
      const boomG = this.ctx.createGain();
      boomG.gain.setValueAtTime(0.62, now);
      boomG.gain.exponentialRampToValueAtTime(0.001, now + 0.62);
      boom.connect(boomG);
      boomG.connect(this.masterGain);
      boom.start(now);
      boom.stop(now + 0.64);

      const secondHit = this.ctx.createOscillator();
      secondHit.type = 'sine';
      secondHit.frequency.setValueAtTime(108, now + 0.24);
      secondHit.frequency.exponentialRampToValueAtTime(32, now + 0.72);
      const secondG = this.ctx.createGain();
      secondG.gain.setValueAtTime(0.48, now + 0.24);
      secondG.gain.exponentialRampToValueAtTime(0.001, now + 0.76);
      secondHit.connect(secondG);
      secondG.connect(this.masterGain);
      secondHit.start(now + 0.24);
      secondHit.stop(now + 0.78);

      // Two-hit epic brass progression: C4-G4-C5 -> G4-B4-D5-G5
      const hits = [
        { t: now, freqs: [261.63, 392.0, 523.25], dur: 0.34 },
        { t: now + 0.24, freqs: [293.66, 392.0, 493.88, 783.99], dur: 0.95 },
      ];
      hits.forEach((hit) => {
        hit.freqs.forEach((freq) => {
          [-0.008, 0.008].forEach((det) => {
            const osc = this.ctx!.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq * (1 + det), hit.t);
            const filt = this.ctx!.createBiquadFilter();
            filt.type = 'lowpass';
            filt.frequency.setValueAtTime(1100, hit.t);
            filt.frequency.exponentialRampToValueAtTime(3800, hit.t + 0.14);
            filt.frequency.exponentialRampToValueAtTime(1250, hit.t + hit.dur);
            filt.Q.value = 2.0;
            const g = this.ctx!.createGain();
            g.gain.setValueAtTime(0.095, hit.t);
            g.gain.exponentialRampToValueAtTime(0.001, hit.t + hit.dur);
            osc.connect(filt);
            filt.connect(g);
            g.connect(this.masterGain!);
            if (this.garageHallSend) g.connect(this.garageHallSend);
            osc.start(hit.t);
            osc.stop(hit.t + hit.dur + 0.03);
          });
        });
      });

      this.triggerExhaustPop(0.32);
      window.setTimeout(() => this.triggerExhaustPop(0.28), 245);
      if (this.carStyle !== 'muscle') {
        window.setTimeout(() => this.triggerTurboBlowoff(1.0), 340);
      }
    } else {
      // Heavy dramatic busted/defeat low brass & sub slam
      const drop = this.ctx.createOscillator();
      drop.type = 'sine';
      drop.frequency.setValueAtTime(132, now);
      drop.frequency.exponentialRampToValueAtTime(31, now + 0.65);
      const dropG = this.ctx.createGain();
      dropG.gain.setValueAtTime(0.58, now);
      dropG.gain.exponentialRampToValueAtTime(0.001, now + 0.68);
      drop.connect(dropG);
      dropG.connect(this.masterGain);
      drop.start(now);
      drop.stop(now + 0.7);

      [220.0, 196.0, 146.83].forEach((freq, idx) => {
        const t = now + idx * 0.16;
        [-0.007, 0.007].forEach((det) => {
          const osc = this.ctx!.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq * (1 + det), t);
          osc.frequency.exponentialRampToValueAtTime(freq * (1 + det) * 0.94, t + 0.45);
          const filt = this.ctx!.createBiquadFilter();
          filt.type = 'lowpass';
          filt.frequency.setValueAtTime(980, t);
          filt.frequency.exponentialRampToValueAtTime(320, t + 0.45);
          filt.Q.value = 1.8;
          const g = this.ctx!.createGain();
          g.gain.setValueAtTime(0.11, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.48);
          osc.connect(filt);
          filt.connect(g);
          g.connect(this.masterGain!);
          if (this.garageHallSend) g.connect(this.garageHallSend);
          osc.start(t);
          osc.stop(t + 0.5);
        });
      });
    }
  }
}

export const soundEngine = new SoundEngine();
