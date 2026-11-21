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

function makeWarmSaturationCurve(drive = 1.9): Float32Array<ArrayBuffer> {
  const samples = 1024;
  const buffer = new ArrayBuffer(samples * 4);
  const curve = new Float32Array(buffer);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    // Gentle asymmetric soft-clip for warm exhaust growl without harsh digital buzz
    curve[i] = Math.tanh(x * drive + 0.08 * x * x);
  }
  return curve;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Multi-voice combustion engine synth
  private engineOscMain: OscillatorNode | null = null;
  private engineOscHarm: OscillatorNode | null = null;
  private engineOscSub: OscillatorNode | null = null;
  private engineHarmGain: GainNode | null = null;
  private engineSubGain: GainNode | null = null;
  private chopLfo: OscillatorNode | null = null;
  private chopDepth: GainNode | null = null;
  private gearWhineOsc: OscillatorNode | null = null;
  private gearWhineGain: GainNode | null = null;

  private engineShaper: WaveShaperNode | null = null;
  private engineCabinet: BiquadFilterNode | null = null;
  private engineLowpass: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private tunnelSendGain: GainNode | null = null;

  // Dynamic mechanical & environment noise layers
  private intakeFilter: BiquadFilterNode | null = null;
  private intakeGain: GainNode | null = null;
  private turboSpoolFilter: BiquadFilterNode | null = null;
  private turboSpoolGain: GainNode | null = null;
  private nosNoiseGain: GainNode | null = null;
  private tireLowFilter: BiquadFilterNode | null = null;
  private tireLowGain: GainNode | null = null;
  private tireHighFilter: BiquadFilterNode | null = null;
  private tireHighGain: GainNode | null = null;
  private curbRumbleGain: GainNode | null = null;
  private windGain: GainNode | null = null;

  // Dual-oscillator police siren
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
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.46;
    this.masterGain.connect(this.ctx.destination);

    // Rich pink+brown textured noise buffer (3 seconds)
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
      data[i] = (b0 + b1 + b2 + white * 0.16) * 0.48;
    }

    // Balanced warm exhaust spectra per engine architecture
    this.waves = {
      coupe: {
        main: createExhaustWave(this.ctx, [1.0, 0.72, 0.42, 0.22, 0.11, 0.05]),
        harm: createExhaustWave(this.ctx, [0.45, 0.92, 0.52, 0.24, 0.1]),
      },
      sedan: {
        main: createExhaustWave(this.ctx, [1.0, 0.78, 0.5, 0.28, 0.14, 0.06]),
        harm: createExhaustWave(this.ctx, [0.55, 0.9, 0.46, 0.26, 0.1]),
      },
      muscle: {
        main: createExhaustWave(this.ctx, [1.0, 0.88, 0.62, 0.38, 0.2, 0.09, 0.03]),
        harm: createExhaustWave(this.ctx, [0.76, 0.95, 0.64, 0.32, 0.14]),
      },
      gtr: {
        main: createExhaustWave(this.ctx, [1.0, 0.7, 0.56, 0.36, 0.22, 0.11, 0.04]),
        harm: createExhaustWave(this.ctx, [0.5, 0.9, 0.74, 0.38, 0.18]),
      },
      exotic: {
        main: createExhaustWave(this.ctx, [0.92, 1.0, 0.72, 0.48, 0.28, 0.15, 0.06]),
        harm: createExhaustWave(this.ctx, [0.42, 0.88, 0.86, 0.48, 0.24]),
      },
    };

    this.engineShaper = this.ctx.createWaveShaper();
    this.engineShaper.curve = makeWarmSaturationCurve(1.9);
    this.engineShaper.oversample = '2x';

    this.engineCabinet = this.ctx.createBiquadFilter();
    this.engineCabinet.type = 'peaking';
    this.engineCabinet.frequency.value = 155;
    this.engineCabinet.Q.value = 1.4;
    this.engineCabinet.gain.value = 5.5;

    this.engineLowpass = this.ctx.createBiquadFilter();
    this.engineLowpass.type = 'lowpass';
    this.engineLowpass.frequency.value = 310;
    this.engineLowpass.Q.value = 0.95;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;

    this.engineOscMain = this.ctx.createOscillator();
    this.engineOscHarm = this.ctx.createOscillator();
    this.engineOscSub = this.ctx.createOscillator();
    this.engineOscSub.type = 'sine';

    this.engineHarmGain = this.ctx.createGain();
    this.engineHarmGain.gain.value = 0.34;
    this.engineSubGain = this.ctx.createGain();
    this.engineSubGain.gain.value = 0.48;

    // Gentle idle chop LFO
    this.chopLfo = this.ctx.createOscillator();
    this.chopLfo.type = 'sine';
    this.chopLfo.frequency.value = 16;
    this.chopDepth = this.ctx.createGain();
    this.chopDepth.gain.value = 0.018;
    this.chopLfo.connect(this.chopDepth);
    this.chopDepth.connect(this.engineGain.gain);
    this.chopLfo.start();

    this.engineOscMain.connect(this.engineShaper);
    this.engineOscHarm.connect(this.engineHarmGain);
    this.engineHarmGain.connect(this.engineShaper);
    this.engineOscSub.connect(this.engineSubGain);
    this.engineSubGain.connect(this.engineCabinet);

    this.engineShaper.connect(this.engineCabinet);
    this.engineCabinet.connect(this.engineLowpass);
    this.engineLowpass.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);

    // Acoustic tunnel slapback echo bus (activates when driving inside tunnels)
    const tunnelDelay = this.ctx.createDelay(0.25);
    tunnelDelay.delayTime.value = 0.068;
    const tunnelFeedback = this.ctx.createGain();
    tunnelFeedback.gain.value = 0.32;
    const tunnelBand = this.ctx.createBiquadFilter();
    tunnelBand.type = 'bandpass';
    tunnelBand.frequency.value = 620;
    tunnelBand.Q.value = 0.9;
    this.tunnelSendGain = this.ctx.createGain();
    this.tunnelSendGain.gain.value = 0;

    this.engineGain.connect(this.tunnelSendGain);
    this.tunnelSendGain.connect(tunnelDelay);
    tunnelDelay.connect(tunnelBand);
    tunnelBand.connect(tunnelFeedback);
    tunnelFeedback.connect(tunnelDelay);
    tunnelBand.connect(this.masterGain);

    this.applyCarWaveform();
    this.engineOscMain.start();
    this.engineOscHarm.start();
    this.engineOscSub.start();

    // Deep airbox induction growl
    const intakeSrc = this.ctx.createBufferSource();
    intakeSrc.buffer = this.noiseBuffer;
    intakeSrc.loop = true;
    this.intakeFilter = this.ctx.createBiquadFilter();
    this.intakeFilter.type = 'bandpass';
    this.intakeFilter.frequency.value = 420;
    this.intakeFilter.Q.value = 1.4;
    this.intakeGain = this.ctx.createGain();
    this.intakeGain.gain.value = 0;
    intakeSrc.connect(this.intakeFilter);
    this.intakeFilter.connect(this.intakeGain);
    this.intakeGain.connect(this.masterGain);
    intakeSrc.start();

    // Subtle straight-cut race gearbox whine
    this.gearWhineOsc = this.ctx.createOscillator();
    this.gearWhineOsc.type = 'sine';
    this.gearWhineOsc.frequency.value = 460;
    const whineFilter = this.ctx.createBiquadFilter();
    whineFilter.type = 'bandpass';
    whineFilter.frequency.value = 1150;
    whineFilter.Q.value = 1.8;
    this.gearWhineGain = this.ctx.createGain();
    this.gearWhineGain.gain.value = 0;
    this.gearWhineOsc.connect(whineFilter);
    whineFilter.connect(this.gearWhineGain);
    this.gearWhineGain.connect(this.masterGain);
    this.gearWhineOsc.start();

    // Turbo spool whistle
    const turboSrc = this.ctx.createBufferSource();
    turboSrc.buffer = this.noiseBuffer;
    turboSrc.loop = true;
    this.turboSpoolFilter = this.ctx.createBiquadFilter();
    this.turboSpoolFilter.type = 'bandpass';
    this.turboSpoolFilter.frequency.value = 2400;
    this.turboSpoolFilter.Q.value = 6.5;
    this.turboSpoolGain = this.ctx.createGain();
    this.turboSpoolGain.gain.value = 0;
    turboSrc.connect(this.turboSpoolFilter);
    this.turboSpoolFilter.connect(this.turboSpoolGain);
    this.turboSpoolGain.connect(this.masterGain);
    turboSrc.start();

    // NOS Afterburner Jet Layer
    const nosSource = this.ctx.createBufferSource();
    nosSource.buffer = this.noiseBuffer;
    nosSource.loop = true;
    const nosFilter = this.ctx.createBiquadFilter();
    nosFilter.type = 'bandpass';
    nosFilter.frequency.value = 720;
    nosFilter.Q.value = 0.85;
    this.nosNoiseGain = this.ctx.createGain();
    this.nosNoiseGain.gain.value = 0;
    nosSource.connect(nosFilter);
    nosFilter.connect(this.nosNoiseGain);
    this.nosNoiseGain.connect(this.masterGain);
    nosSource.start();

    // Dual-Band Tire Screech (warm rubber howl)
    const tireSource = this.ctx.createBufferSource();
    tireSource.buffer = this.noiseBuffer;
    tireSource.loop = true;

    this.tireLowFilter = this.ctx.createBiquadFilter();
    this.tireLowFilter.type = 'bandpass';
    this.tireLowFilter.frequency.value = 960;
    this.tireLowFilter.Q.value = 3.8;
    this.tireLowGain = this.ctx.createGain();
    this.tireLowGain.gain.value = 0;
    tireSource.connect(this.tireLowFilter);
    this.tireLowFilter.connect(this.tireLowGain);
    this.tireLowGain.connect(this.masterGain);

    this.tireHighFilter = this.ctx.createBiquadFilter();
    this.tireHighFilter.type = 'bandpass';
    this.tireHighFilter.frequency.value = 1850;
    this.tireHighFilter.Q.value = 4.6;
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
    curbFilter.frequency.value = 155;
    this.curbRumbleGain = this.ctx.createGain();
    this.curbRumbleGain.gain.value = 0;
    curbSrc.connect(curbFilter);
    curbFilter.connect(this.curbRumbleGain);
    this.curbRumbleGain.connect(this.masterGain);
    curbSrc.start();

    // Aerodynamic Wind Rush
    const windSrc = this.ctx.createBufferSource();
    windSrc.buffer = this.noiseBuffer;
    windSrc.loop = true;
    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 460;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    windSrc.connect(windFilter);
    windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);
    windSrc.start();

    // Dual-Oscillator Police Siren
    this.sirenOscA = this.ctx.createOscillator();
    this.sirenOscA.type = 'triangle';
    this.sirenOscB = this.ctx.createOscillator();
    this.sirenOscB.type = 'sine';
    const sirenFilter = this.ctx.createBiquadFilter();
    sirenFilter.type = 'lowpass';
    sirenFilter.frequency.value = 1500;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOscA.connect(sirenFilter);
    this.sirenOscB.connect(sirenFilter);
    sirenFilter.connect(this.sirenGain);
    this.sirenGain.connect(this.masterGain);
    this.sirenOscA.start();
    this.sirenOscB.start();

    this.initialized = true;
  }

  private applyCarWaveform() {
    const w = this.waves[this.carStyle] ?? this.waves.coupe;
    if (!w) return;
    this.engineOscMain?.setPeriodicWave(w.main);
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
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.46, this.ctx.currentTime, 0.05);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public stopRaceLoops() {
    if (!this.ctx || !this.initialized) return;
    const now = this.ctx.currentTime;
    this.engineGain?.gain.setTargetAtTime(0, now, 0.07);
    this.intakeGain?.gain.setTargetAtTime(0, now, 0.06);
    this.gearWhineGain?.gain.setTargetAtTime(0, now, 0.06);
    this.turboSpoolGain?.gain.setTargetAtTime(0, now, 0.06);
    this.nosNoiseGain?.gain.setTargetAtTime(0, now, 0.05);
    this.tireLowGain?.gain.setTargetAtTime(0, now, 0.05);
    this.tireHighGain?.gain.setTargetAtTime(0, now, 0.05);
    this.curbRumbleGain?.gain.setTargetAtTime(0, now, 0.05);
    this.windGain?.gain.setTargetAtTime(0, now, 0.06);
    this.sirenGain?.gain.setTargetAtTime(0, now, 0.08);
    this.tunnelSendGain?.gain.setTargetAtTime(0, now, 0.08);
    this.prevNos = false;
  }

  private getPitchScale(): number {
    switch (this.carStyle) {
      case 'muscle':
        return 0.72;
      case 'gtr':
        return 1.1;
      case 'exotic':
        return 1.24;
      case 'sedan':
        return 0.98;
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
    timeScale: number;
  }) {
    if (!this.initialized || !this.ctx) return;
    if (!params.active) {
      this.stopRaceLoops();
      return;
    }

    const now = this.ctx.currentTime;
    if (this.popCooldown > 0) this.popCooldown = Math.max(0, this.popCooldown - 0.016);

    const pitchFactor = (params.timeScale < 0.7 ? 0.62 : 1.0) * this.getPitchScale();
    const speedKmh = params.speedKmh ?? params.rpm * 200;

    // Upshift turbo blowoff + meaty gearshift exhaust pop
    if (params.gear > this.lastGear && params.gear > 1) {
      this.triggerTurboBlowoff();
      this.triggerExhaustPop(0.2);
    } else if (this.prevThrottle && !params.throttle && params.rpm > 0.56 && this.popCooldown <= 0) {
      this.triggerExhaustPop(0.15);
      this.popCooldown = 0.45;
    }
    if (params.nosActive && !this.prevNos) {
      this.triggerNosIgnite();
    }
    this.lastGear = params.gear;
    this.prevThrottle = params.throttle;
    this.prevNos = params.nosActive;

    // Gentle top-gear rev limiter pulse only above 96.5% RPM
    const redlineCut =
      params.throttle && params.rpm > 0.965 && Math.sin(now * 68) > 0.55 ? 0.66 : 1.0;

    const baseFreq = (42 + params.rpm * 132) * pitchFactor;
    this.engineOscMain?.frequency.setTargetAtTime(baseFreq, now, 0.035);
    this.engineOscHarm?.frequency.setTargetAtTime(baseFreq * (this.carStyle === 'muscle' ? 1.333 : 1.5), now, 0.035);
    this.engineOscSub?.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.035);

    this.chopLfo?.frequency.setTargetAtTime(Math.max(10, baseFreq * 0.28), now, 0.05);
    this.chopDepth?.gain.setTargetAtTime(params.throttle ? 0.012 : 0.024, now, 0.05);

    const filterCutoff =
      (190 + params.rpm * 880 + (params.throttle ? 360 : 40)) * (params.timeScale < 0.7 ? 0.65 : 1.0);
    this.engineLowpass?.frequency.setTargetAtTime(filterCutoff, now, 0.045);

    const targetEngineGain = (0.14 + (params.throttle ? 0.14 : 0.03) + params.rpm * 0.08) * redlineCut;
    this.engineGain?.gain.setTargetAtTime(targetEngineGain, now, 0.035);
    this.tunnelSendGain?.gain.setTargetAtTime(params.inTunnel ? 0.36 : 0, now, 0.08);

    // Warm airbox induction snarl
    this.intakeFilter?.frequency.setTargetAtTime(340 + params.rpm * 950, now, 0.05);
    this.intakeGain?.gain.setTargetAtTime(
      params.throttle ? (0.022 + params.rpm * 0.042) * redlineCut : 0.008,
      now,
      0.045,
    );

    // Subtle straight-cut gearbox whine
    const whineAllowed = this.carStyle === 'gtr' || this.carStyle === 'exotic' || this.carStyle === 'muscle';
    if (whineAllowed && speedKmh > 75) {
      const whineFreq = (320 + speedKmh * 3.1 + params.rpm * 140) * (params.timeScale < 0.7 ? 0.65 : 1.0);
      this.gearWhineOsc?.frequency.setTargetAtTime(whineFreq, now, 0.05);
      const whineVol = (this.carStyle === 'gtr' ? 0.018 : 0.01) * Math.min(1, (speedKmh - 75) / 140);
      this.gearWhineGain?.gain.setTargetAtTime(whineVol, now, 0.06);
    } else {
      this.gearWhineGain?.gain.setTargetAtTime(0, now, 0.06);
    }

    // Turbo spool whistle
    if (params.throttle && params.rpm > 0.36 && this.carStyle !== 'muscle') {
      this.turboSpoolFilter?.frequency.setTargetAtTime(1900 + params.rpm * 2000, now, 0.05);
      this.turboSpoolGain?.gain.setTargetAtTime(0.03 * (params.rpm - 0.34), now, 0.05);
    } else {
      this.turboSpoolGain?.gain.setTargetAtTime(0, now, 0.08);
    }

    // Aerodynamic wind rush
    const windAmt = speedKmh > 110 ? Math.min(0.13, ((speedKmh - 110) / 210) * 0.13) : 0;
    this.windGain?.gain.setTargetAtTime(windAmt, now, 0.08);

    // NOS Jet
    this.nosNoiseGain?.gain.setTargetAtTime(params.nosActive ? 0.2 : 0, now, 0.04);

    // Swept Tire Screech
    const slip = params.airborne ? 0 : params.driftSlip;
    const lowTire = slip > 0.18 ? Math.min(0.14, (slip - 0.18) * 0.24) : 0;
    const highTire = slip > 0.28 ? Math.min(0.1, (slip - 0.28) * 0.2) : 0;
    this.tireLowFilter?.frequency.setTargetAtTime(880 + slip * 310 + Math.sin(now * 22) * 42, now, 0.04);
    this.tireHighFilter?.frequency.setTargetAtTime(1780 + slip * 380, now, 0.04);
    this.tireLowGain?.gain.setTargetAtTime(lowTire, now, 0.035);
    this.tireHighGain?.gain.setTargetAtTime(highTire, now, 0.035);

    // Rumble Strip / Shoulder Curb Clatter
    this.curbRumbleGain?.gain.setTargetAtTime(
      params.onCurb && !params.airborne && speedKmh > 30 ? Math.min(0.18, speedKmh / 950) : 0,
      now,
      0.03,
    );

    // Police Siren
    if (params.copProximity > 0.05 && this.sirenOscA && this.sirenOscB && this.sirenGain) {
      const cycleSpeed = params.copProximity > 0.55 ? 14.2 : 5.4;
      const tMod = Math.sin(now * cycleSpeed);
      const scale = params.timeScale < 0.7 ? 0.66 : 1.0;
      this.sirenOscA.frequency.setTargetAtTime((710 + tMod * 230) * scale, now, 0.02);
      this.sirenOscB.frequency.setTargetAtTime((785 + Math.sin(now * cycleSpeed + 0.45) * 245) * scale, now, 0.02);
      this.sirenGain.gain.setTargetAtTime(params.copProximity * 0.075, now, 0.08);
    } else {
      this.sirenGain?.gain.setTargetAtTime(0, now, 0.08);
    }
  }

  private triggerNosIgnite() {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(155, now);
    osc.frequency.exponentialRampToValueAtTime(46, now + 0.22);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.28, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  private triggerTurboBlowoff() {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const start = now + i * 0.052;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2400 - i * 360, start);
      filter.frequency.exponentialRampToValueAtTime(1050, start + 0.052);
      filter.Q.value = 4.2;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.09 / (i + 1), start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.052);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      src.start(start);
      src.stop(start + 0.058);
    }
  }

  private triggerExhaustPop(level = 0.2) {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.09);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(level, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.12);

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 540;
    filt.Q.value = 1.4;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(level * 0.55, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    src.connect(filt);
    filt.connect(ng);
    ng.connect(this.masterGain);
    src.start(now);
    src.stop(now + 0.09);
  }

  public triggerLandingThump() {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(92, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.18);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.36, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.21);
  }

  public triggerImpact(intensity: number) {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const clamped = Math.max(0.15, Math.min(1, intensity));

    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(108, now);
    sub.frequency.exponentialRampToValueAtTime(26, now + 0.24);
    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(clamped * 0.58, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    sub.connect(subGain);
    subGain.connect(this.masterGain);
    sub.start(now);
    sub.stop(now + 0.27);

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1250, now);
    filter.frequency.exponentialRampToValueAtTime(220, now + 0.24);
    filter.Q.value = 1.0;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(clamped * 0.42, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(now);
    src.stop(now + 0.27);
  }

  public triggerRadioSquelch() {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 2050;
    filt.Q.value = 2.6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.08, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.masterGain);
    src.start(now);
    src.stop(now + 0.095);
  }

  public triggerBeep(high = false) {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(high ? 784 : 440, now);
    if (high) osc.frequency.exponentialRampToValueAtTime(1046, now + 0.09);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1850;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (high ? 0.34 : 0.16));
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.36);
  }

  public triggerGarageRev(style: EngineCharacter) {
    this.init();
    if (!this.ctx || !this.masterGain || this.muted) return;
    this.setCarStyle(style);
    const now = this.ctx.currentTime;
    const scale = this.getPitchScale();

    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const w = this.waves[style] ?? this.waves.coupe!;
    osc.setPeriodicWave(w.main);
    osc2.setPeriodicWave(w.harm);

    const harmMix = this.ctx.createGain();
    harmMix.gain.value = 0.36;

    const startF = 50 * scale;
    const peakF = 195 * scale;
    osc.frequency.setValueAtTime(startF, now);
    osc.frequency.exponentialRampToValueAtTime(peakF, now + 0.28);
    osc.frequency.exponentialRampToValueAtTime(startF * 1.12, now + 0.85);

    osc2.frequency.setValueAtTime(startF * 1.5, now);
    osc2.frequency.exponentialRampToValueAtTime(peakF * 1.5, now + 0.28);
    osc2.frequency.exponentialRampToValueAtTime(startF * 1.68, now + 0.85);

    const shaper = this.ctx.createWaveShaper();
    shaper.curve = makeWarmSaturationCurve(1.9);

    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(280, now);
    filt.frequency.exponentialRampToValueAtTime(1650, now + 0.28);
    filt.frequency.exponentialRampToValueAtTime(240, now + 0.85);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.14);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

    osc.connect(shaper);
    osc2.connect(harmMix);
    harmMix.connect(shaper);
    shaper.connect(filt);
    filt.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc2.start(now);
    osc.stop(now + 0.92);
    osc2.stop(now + 0.92);
    window.setTimeout(() => this.triggerExhaustPop(0.16), 330);
  }

  public triggerUpgradeClunk() {
    this.init();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(72, now + 0.09);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.22, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.13);
  }
}

export const soundEngine = new SoundEngine();
