import { TrackId } from '../types/game';
import { clampAudioValue, stepMusicLookaheadWindow } from './audioSafety';
import { soundEngine } from './soundEngine';

export interface EaTraxEntry {
  id: string;
  title: string;
  artist: string;
  genre: string;
  kind: 'synth' | 'stream';
  url?: string;
  bpm: number;
  bassPattern?: number[];
  leadPattern?: number[];
}

// High-Adrenaline Street Racing Soundtrack: Drift Phonk & Underground Synth (Zero NEFFEX)
export const EA_TRAX_PLAYLIST: EaTraxEntry[] = [
  {
    id: 'pk_nightdrive',
    title: 'Nightdrive Phonk Mix',
    artist: 'LXST CXNTURY Style',
    genre: 'Drift Phonk',
    kind: 'stream',
    url: 'https://archive.org/download/Sz22_22/NIGHTDRIVE%20PHONK%20MIX%20%28LXST%20CXNTURY%20TYPE%29.mp3',
    bpm: 142,
    bassPattern: [36, 0, 36, 48, 36, 0, 39, 41, 36, 0, 36, 48, 43, 41, 39, 34],
    leadPattern: [72, 0, 75, 72, 79, 0, 77, 75, 72, 0, 82, 79, 77, 75, 72, 70],
  },
  {
    id: 'pk_waveloom_1',
    title: 'Waveloom Drift I',
    artist: 'Waveloom',
    genre: 'Memphis Drift Phonk',
    kind: 'stream',
    url: 'https://archive.org/download/jamendo-625614/01-2302002-Waveloom-Phonk%20Music%20Free.mp3',
    bpm: 146,
    bassPattern: [36, 36, 48, 36, 39, 36, 43, 41, 36, 36, 48, 36, 46, 43, 41, 39],
    leadPattern: [72, 0, 75, 79, 75, 0, 77, 75, 72, 0, 82, 79, 77, 75, 74, 70],
  },
  {
    id: 'pk_waveloom_2',
    title: 'Waveloom Drift II',
    artist: 'Waveloom',
    genre: 'Aggressive Cowbell Phonk',
    kind: 'stream',
    url: 'https://archive.org/download/jamendo-625614/02-2301999-Waveloom-Phonk%20Free.mp3',
    bpm: 150,
    bassPattern: [34, 0, 34, 46, 34, 0, 39, 41, 34, 0, 34, 46, 44, 41, 39, 37],
    leadPattern: [70, 74, 77, 70, 79, 0, 77, 74, 70, 74, 82, 79, 77, 74, 72, 69],
  },
  {
    id: 'pk_waveloom_3',
    title: 'Waveloom Drift III',
    artist: 'Waveloom',
    genre: 'Sub-Tunnel Phonk',
    kind: 'stream',
    url: 'https://archive.org/download/jamendo-625614/03-2302000-Waveloom-Phonk%20Free%20Music.mp3',
    bpm: 154,
    bassPattern: [36, 0, 36, 39, 41, 0, 43, 46, 36, 0, 36, 39, 43, 41, 39, 34],
    leadPattern: [72, 0, 79, 75, 72, 0, 82, 79, 75, 0, 84, 82, 79, 77, 75, 72],
  },
  {
    id: 'pk_soundore',
    title: 'Midnight Cowbell Overdrive',
    artist: 'Soundore',
    genre: 'Dark Phonk',
    kind: 'stream',
    url: 'https://archive.org/download/jamendo-612712/02-2274145-Soundore-Phonk.mp3',
    bpm: 148,
    bassPattern: [36, 0, 36, 39, 36, 0, 41, 43, 36, 0, 36, 46, 43, 41, 39, 0],
    leadPattern: [72, 75, 72, 79, 72, 75, 77, 75, 72, 82, 79, 75, 77, 75, 72, 70],
  },
  {
    id: 'sy_harbor_pulse',
    title: 'Harbor Run Overdrive',
    artist: 'Rockport Underground',
    genre: 'Dark Electro Breakbeat',
    kind: 'synth',
    bpm: 144,
    bassPattern: [38, 38, 0, 45, 38, 0, 41, 43, 38, 38, 0, 50, 45, 43, 41, 0],
    leadPattern: [62, 0, 65, 69, 74, 0, 72, 69, 62, 0, 77, 74, 72, 69, 67, 65],
  },
  {
    id: 'sy_apex_voltage',
    title: 'Apex Voltage (Highway 99)',
    artist: 'Turbo Pulse',
    genre: 'Industrial Synthwave',
    kind: 'synth',
    bpm: 152,
    bassPattern: [36, 36, 48, 36, 39, 39, 51, 39, 41, 41, 53, 41, 43, 43, 46, 43],
    leadPattern: [72, 0, 75, 72, 79, 0, 75, 79, 84, 0, 82, 79, 77, 75, 74, 72],
  },
  {
    id: 'sy_canyon_fury',
    title: 'Canyon Switchback Rush',
    artist: 'Redline Division',
    genre: 'Aggressive Bass Phonk',
    kind: 'synth',
    bpm: 149,
    bassPattern: [35, 0, 35, 47, 35, 38, 40, 42, 35, 0, 35, 47, 45, 42, 40, 38],
    leadPattern: [71, 74, 78, 0, 83, 81, 78, 74, 71, 74, 86, 83, 81, 78, 76, 74],
  },
  {
    id: 'sy_mist_runner',
    title: 'Dawn Fog Runner',
    artist: 'Ghostline Audio',
    genre: 'Liquid Drum & Bass',
    kind: 'synth',
    bpm: 162,
    bassPattern: [36, 0, 0, 43, 0, 39, 0, 41, 36, 0, 0, 48, 0, 46, 43, 41],
    leadPattern: [72, 0, 75, 0, 79, 75, 72, 0, 84, 0, 82, 79, 75, 77, 75, 72],
  },
  {
    id: 'sy_summit_devil',
    title: "Devil's Spine Pursuit",
    artist: 'Apex Syndicate',
    genre: 'Hard Trap Electro',
    kind: 'synth',
    bpm: 156,
    bassPattern: [33, 33, 45, 33, 36, 36, 48, 36, 38, 38, 50, 38, 40, 43, 45, 40],
    leadPattern: [69, 0, 72, 76, 81, 0, 79, 76, 69, 0, 84, 81, 79, 76, 74, 72],
  },
];

const TRACK_TO_INDEX: Record<TrackId, number> = {
  rockport_loop: 0,       // Nightdrive Phonk Mix
  rosewood_park: 5,       // Harbor Run Overdrive
  hwy99_speedway: 6,      // Apex Voltage
  camden_coast: 0,        // Nightdrive Phonk Mix
  rosewood_canyon: 7,     // Canyon Switchback Rush
  heritage_forest: 8,     // Dawn Fog Runner
  gray_point_bay: 4,      // Midnight Cowbell Overdrive
  silverton_pass: 2,      // Waveloom Drift II
  downtown_labyrinth: 1,  // Waveloom Drift I
  blackridge_summit: 3,   // Waveloom Drift III
};

function makeDistortionCurve(amount = 48): Float32Array<ArrayBuffer> {
  const n = 512;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

class MusicEngine {
  private audioEl: HTMLAudioElement | null = null;
  private currentIdx = 0;
  private running = false;
  private mode: 'race' | 'menu' | 'stopped' = 'stopped';
  private paused = false;
  private musicMuted = false;
  private pursuitActive = false;
  private heatLevel = 1;
  private listeners = new Set<(label: string) => void>();
  private autoplayRetryArmed = false;

  // Multi-layered Phonk / Electronic-Rock Web Audio DSP Synth Engine
  private synthActive = false;
  private synthTimer: number | null = null;
  private synthStep = 0;
  private synthNextTime = 0;
  private noiseBuf: AudioBuffer | null = null;
  private driveShaper: WaveShaperNode | null = null;
  private masterBus: DynamicsCompressorNode | null = null;
  private streamStallTimer: number | null = null;

  public subscribe(cb: (label: string) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify() {
    const label = this.getCurrentTrackLabel();
    this.listeners.forEach((cb) => cb(label));
  }

  public getTrackTitle(trackId: TrackId): string {
    const idx = TRACK_TO_INDEX[trackId] ?? 0;
    const entry = EA_TRAX_PLAYLIST[idx];
    return `${entry.title} · ${entry.artist}`;
  }

  public getCurrentTrackLabel(): string {
    const entry = EA_TRAX_PLAYLIST[this.currentIdx] ?? EA_TRAX_PLAYLIST[0];
    return `${entry.title} · ${entry.artist}`;
  }

  public getCurrentIndex(): number {
    return this.currentIdx;
  }

  public isMusicMuted(): boolean {
    return this.musicMuted;
  }

  public setMusicMuted(muted: boolean) {
    this.musicMuted = muted;
    this.syncPlaybackVolume();
    if (!muted && this.running && !this.paused && !soundEngine.isMuted()) {
      const entry = EA_TRAX_PLAYLIST[this.currentIdx];
      if (entry?.kind === 'stream' && this.audioEl && this.audioEl.paused && !this.synthActive) {
        void this.audioEl.play().catch(() => this.activateSynthLoop());
      } else if (entry?.kind === 'synth' && !this.synthActive) {
        this.activateSynthLoop();
      }
    }
  }

  public startMenuMusic() {
    if (this.mode === 'menu' && this.running) return;
    this.mode = 'menu';
    this.running = true;
    this.paused = false;
    this.pursuitActive = false;
    // Play a real Drift Phonk track in the Safe House garage (user can skip any time)
    if (this.currentIdx < 0 || this.currentIdx >= EA_TRAX_PLAYLIST.length) {
      this.currentIdx = 0;
    }
    this.playIndex(this.currentIdx);
  }

  public startTrack(trackId: TrackId) {
    this.mode = 'race';
    this.currentIdx = TRACK_TO_INDEX[trackId] ?? 0;
    this.running = true;
    this.paused = false;
    this.playIndex(this.currentIdx);
  }

  public selectTrack(index: number): string {
    this.currentIdx = ((index % EA_TRAX_PLAYLIST.length) + EA_TRAX_PLAYLIST.length) % EA_TRAX_PLAYLIST.length;
    this.mode = this.mode === 'stopped' ? 'menu' : this.mode;
    this.running = true;
    this.paused = false;
    this.playIndex(this.currentIdx);
    return this.getCurrentTrackLabel();
  }

  public nextTrack(): string {
    this.currentIdx = (this.currentIdx + 1) % EA_TRAX_PLAYLIST.length;
    if (this.running) {
      this.playIndex(this.currentIdx);
    } else {
      this.notify();
    }
    return this.getCurrentTrackLabel();
  }

  public prevTrack(): string {
    this.currentIdx = (this.currentIdx - 1 + EA_TRAX_PLAYLIST.length) % EA_TRAX_PLAYLIST.length;
    if (this.running) {
      this.playIndex(this.currentIdx);
    } else {
      this.notify();
    }
    return this.getCurrentTrackLabel();
  }

  public setPursuitIntensity(active: boolean, heatLevel: number) {
    this.pursuitActive = active;
    this.heatLevel = heatLevel;
    this.syncPlaybackVolume();
  }

  public setPaused(paused: boolean) {
    this.paused = paused;
    this.syncPlaybackVolume();
    if (!paused && this.running && !this.musicMuted && !soundEngine.isMuted()) {
      const entry = EA_TRAX_PLAYLIST[this.currentIdx];
      if (entry?.kind === 'stream' && this.audioEl && this.audioEl.paused && !this.synthActive) {
        void this.audioEl.play().catch(() => {
          // ignore autoplay restriction
        });
      }
    }
  }

  public stop() {
    this.running = false;
    this.mode = 'stopped';
    this.paused = false;
    this.pursuitActive = false;
    this.clearStreamStallTimer();
    this.stopSynthLoop();
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.currentTime = 0;
    }
  }

  private armAutoplayRetry() {
    if (this.autoplayRetryArmed || typeof window === 'undefined') return;
    this.autoplayRetryArmed = true;
    const resumeAudio = () => {
      this.autoplayRetryArmed = false;
      window.removeEventListener('pointerdown', resumeAudio);
      window.removeEventListener('keydown', resumeAudio);
      if (!this.running || this.paused || this.musicMuted || soundEngine.isMuted()) return;
      soundEngine.init();
      const entry = EA_TRAX_PLAYLIST[this.currentIdx];
      if (entry?.kind === 'stream' && this.audioEl) {
        this.audioEl
          .play()
          .then(() => {
            this.stopSynthLoop();
          })
          .catch(() => {
            if (this.running && !this.synthActive) this.activateSynthLoop();
          });
      } else if (!this.synthActive) {
        this.activateSynthLoop();
      }
    };
    window.addEventListener('pointerdown', resumeAudio, { once: true });
    window.addEventListener('keydown', resumeAudio, { once: true });
  }

  private clearStreamStallTimer() {
    if (this.streamStallTimer !== null) {
      window.clearTimeout(this.streamStallTimer);
      this.streamStallTimer = null;
    }
  }

  private armStreamStallFallback() {
    if (this.streamStallTimer !== null || !this.running || this.paused) return;
    this.streamStallTimer = window.setTimeout(() => {
      this.streamStallTimer = null;
      if (this.running && !this.paused && !this.synthActive) {
        const entry = EA_TRAX_PLAYLIST[this.currentIdx];
        if (entry?.kind === 'stream' && this.audioEl && (this.audioEl.readyState < 3 || this.audioEl.paused)) {
          this.activateSynthLoop();
        }
      }
    }, 2600);
  }

  private ensureAudioElement(): HTMLAudioElement {
    if (!this.audioEl) {
      const el = new Audio();
      el.preload = 'auto';
      el.addEventListener('ended', () => {
        this.clearStreamStallTimer();
        if (this.running) {
          this.nextTrack();
        }
      });
      el.addEventListener('playing', () => {
        this.clearStreamStallTimer();
        // Real MP3 started cleanly — turn off fallback synth if it was running
        if (this.synthActive && EA_TRAX_PLAYLIST[this.currentIdx]?.kind === 'stream') {
          this.stopSynthLoop();
        }
      });
      el.addEventListener('waiting', () => {
        this.armStreamStallFallback();
      });
      el.addEventListener('stalled', () => {
        this.armStreamStallFallback();
      });
      el.addEventListener('error', () => {
        this.clearStreamStallTimer();
        if (this.running) {
          this.activateSynthLoop();
        }
      });
      this.audioEl = el;
    }
    return this.audioEl;
  }

  private syncPlaybackVolume() {
    const globallyMuted = this.musicMuted || soundEngine.isMuted();
    if (this.audioEl) {
      if (globallyMuted) {
        this.audioEl.muted = true;
      } else {
        this.audioEl.muted = false;
        const targetVol = this.paused
          ? 0.12
          : this.mode === 'menu'
            ? 0.36
            : this.pursuitActive
              ? Math.min(0.56, 0.44 + this.heatLevel * 0.024)
              : 0.46;
        this.audioEl.volume = clampAudioValue(targetVol, 0.4, 0, 0.6);
      }
    }
    const ctx = soundEngine.getAudioContext();
    const dest = soundEngine.getMusicDestination() as GainNode | null;
    if (ctx && dest) {
      const targetGain = globallyMuted
        ? 0
        : this.paused
          ? 0.09
          : this.mode === 'menu'
            ? 0.28
            : this.pursuitActive
              ? Math.min(0.52, 0.4 + this.heatLevel * 0.022)
              : 0.42;
      dest.gain.setTargetAtTime(clampAudioValue(targetGain, 0, 0, 0.6), ctx.currentTime, 0.08);
    }
  }

  private playIndex(idx: number) {
    this.stopSynthLoop();
    const entry = EA_TRAX_PLAYLIST[idx] ?? EA_TRAX_PLAYLIST[0];
    this.notify();

    if (entry.kind === 'synth' || !entry.url) {
      if (this.audioEl) {
        this.audioEl.pause();
      }
      this.syncPlaybackVolume();
      this.activateSynthLoop();
      return;
    }

    const el = this.ensureAudioElement();
    if (el.src !== entry.url) {
      el.src = entry.url;
    }
    el.currentTime = 0;
    this.syncPlaybackVolume();
    el.play().catch(() => {
      this.armAutoplayRetry();
      if (this.running) {
        this.activateSynthLoop();
      }
    });
  }

  private ensureNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuf && this.noiseBuf.sampleRate === ctx.sampleRate) {
      return this.noiseBuf;
    }
    const len = Math.floor(ctx.sampleRate * 0.45);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      ch[i] = Math.random() * 2 - 1;
    }
    this.noiseBuf = buf;
    return buf;
  }

  private ensureSynthBus(ctx: AudioContext, dest: AudioNode): AudioNode {
    if (!this.masterBus || this.masterBus.context !== ctx) {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 12;
      comp.ratio.value = 5.0;
      comp.attack.value = 0.004;
      comp.release.value = 0.14;
      comp.connect(dest);
      this.masterBus = comp;
    }
    if (!this.driveShaper || this.driveShaper.context !== ctx) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = makeDistortionCurve(32);
      shaper.oversample = 'none';
      shaper.connect(this.masterBus);
      this.driveShaper = shaper;
    }
    return this.masterBus;
  }

  private activateSynthLoop() {
    if (this.synthActive) return;
    this.synthActive = true;
    const ctx = soundEngine.getAudioContext();
    const dest = soundEngine.getMusicDestination();
    if (!ctx || !dest) return;
    this.ensureSynthBus(ctx, dest);
    this.syncPlaybackVolume();
    this.synthStep = 0;
    this.synthNextTime = ctx.currentTime + 0.04;
    if (this.synthTimer === null) {
      this.synthTimer = window.setInterval(() => this.scheduleSynthStep(), 40);
    }
  }

  private stopSynthLoop() {
    this.synthActive = false;
    if (this.synthTimer !== null) {
      window.clearInterval(this.synthTimer);
      this.synthTimer = null;
    }
  }

  private cleanupSynthNodes(endSource: AudioScheduledSourceNode, nodes: AudioNode[], lifetimeMs: number) {
    let done = false;
    const disconnectAll = () => {
      if (done) return;
      done = true;
      for (let i = 0; i < nodes.length; i++) {
        try {
          nodes[i].disconnect();
        } catch {
          // ignore
        }
      }
    };
    endSource.onended = disconnectAll;
    window.setTimeout(disconnectAll, lifetimeMs + 90);
  }

  private scheduleSynthStep() {
    if (!this.running || !this.synthActive || this.paused || this.musicMuted || soundEngine.isMuted()) return;
    const ctx = soundEngine.getAudioContext();
    const dest = soundEngine.getMusicDestination();
    if (!ctx || !dest || ctx.state !== 'running') return;

    const bus = this.ensureSynthBus(ctx, dest);
    const drive = this.driveShaper ?? bus;

    const isMenuGroove = this.mode === 'menu';
    const entry = EA_TRAX_PLAYLIST[this.currentIdx] ?? EA_TRAX_PLAYLIST[0];
    const bpm = isMenuGroove ? 112 : entry.bpm + (this.pursuitActive ? this.heatLevel * 2 : 0);
    const stepDur = 60 / bpm / 4;
    const { startTime, maxSteps } = stepMusicLookaheadWindow(this.synthNextTime, ctx.currentTime, stepDur, 3);
    this.synthNextTime = startTime;

    const noiseBuf = this.ensureNoiseBuffer(ctx);
    const bassSeq = entry.bassPattern ?? [36, 0, 36, 39, 36, 0, 41, 43, 36, 0, 36, 46, 43, 41, 39, 0];
    const leadSeq = entry.leadPattern ?? [60, 0, 63, 0, 67, 0, 65, 63, 60, 0, 70, 0, 67, 63, 65, 0];

    let stepsScheduled = 0;
    while (this.synthNextTime < ctx.currentTime + 0.14 && stepsScheduled < maxSteps) {
      stepsScheduled++;
      const s = this.synthStep % 16;
      const bar = Math.floor(this.synthStep / 16) % 4;
      const t = this.synthNextTime;

      // 1. Punchy 808 Sub Kick
      const kickHit = s === 0 || s === 3 || s === 6 || s === 10 || (this.pursuitActive && s === 14);
      if (kickHit) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(144, t);
        osc.frequency.exponentialRampToValueAtTime(44, t + 0.095);
        g.gain.setValueAtTime(isMenuGroove ? 0.26 : 0.34, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.connect(g);
        g.connect(bus);
        osc.start(t);
        osc.stop(t + 0.19);
        this.cleanupSynthNodes(osc, [osc, g], 260);
      }

      // 2. Crisp Snare
      const snareHit = s === 4 || s === 12 || (!isMenuGroove && bar === 3 && s === 15);
      if (snareHit) {
        const ghost = s === 15 ? 0.52 : 1.0;
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1950;
        bp.Q.value = 0.75;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime((isMenuGroove ? 0.13 : 0.22) * ghost, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
        src.connect(bp);
        bp.connect(ng);
        ng.connect(bus);
        src.start(t);
        src.stop(t + 0.14);
        this.cleanupSynthNodes(src, [src, bp, ng], 220);

        const body = ctx.createOscillator();
        body.type = 'triangle';
        body.frequency.setValueAtTime(220, t);
        body.frequency.exponentialRampToValueAtTime(118, t + 0.065);
        const bg = ctx.createGain();
        bg.gain.setValueAtTime(0.14 * ghost, t);
        bg.gain.exponentialRampToValueAtTime(0.001, t + 0.085);
        body.connect(bg);
        bg.connect(bus);
        body.start(t);
        body.stop(t + 0.09);
        this.cleanupSynthNodes(body, [body, bg], 180);
      }

      // 3. Driving Hi-Hats
      const isRoll = !isMenuGroove && bar === 3 && (s === 13 || s === 14);
      const hatRepeats = isRoll ? 2 : 1;
      for (let r = 0; r < hatRepeats; r++) {
        const ht = t + r * (stepDur * 0.5);
        const openHat = s === 2 || s === 10;
        const accent = s % 4 === 2 ? 1.0 : 0.55;
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 6400;
        const hg = ctx.createGain();
        hg.gain.setValueAtTime((isMenuGroove ? 0.028 : 0.05) * accent, ht);
        hg.gain.exponentialRampToValueAtTime(0.001, ht + (openHat ? 0.08 : 0.032));
        src.connect(hp);
        hp.connect(hg);
        hg.connect(bus);
        src.start(ht);
        src.stop(ht + 0.09);
        this.cleanupSynthNodes(src, [src, hp, hg], 180);
      }

      // 4. Overdriven Distorted Bass + Sub Anchor
      const baseRoot = bassSeq[s];
      if (baseRoot > 0) {
        const transpose = bar === 3 && s >= 8 ? 3 : bar === 2 && s >= 12 ? -2 : 0;
        const freq = 440 * Math.pow(2, (baseRoot + transpose - 69) / 12);
        const osc = ctx.createOscillator();
        const sub = ctx.createOscillator();
        const lp = ctx.createBiquadFilter();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        sub.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        sub.frequency.setValueAtTime(freq * 0.5, t);
        lp.type = 'lowpass';
        const cutoff = isMenuGroove ? 640 : this.pursuitActive ? 1100 + this.heatLevel * 120 : 920;
        lp.frequency.setValueAtTime(cutoff * 1.5, t);
        lp.frequency.exponentialRampToValueAtTime(cutoff * 0.45, t + stepDur * 1.3);
        lp.Q.value = 2.0;
        g.gain.setValueAtTime(0.002, t);
        g.gain.linearRampToValueAtTime(isMenuGroove ? 0.12 : 0.19, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.4);
        osc.connect(lp);
        lp.connect(g);
        g.connect(drive);
        sub.connect(g);
        osc.start(t);
        sub.start(t);
        osc.stop(t + stepDur * 1.48);
        sub.stop(t + stepDur * 1.48);
        this.cleanupSynthNodes(osc, [osc, sub, lp, g], Math.ceil(stepDur * 1500) + 120);
      }

      // 5. Saturated Phonk Cowbell / Power-Chord Lead
      const leadMidi = leadSeq[s];
      if (leadMidi > 0 && (!isMenuGroove || bar % 2 === 1)) {
        const transpose = bar === 3 && s >= 8 ? 3 : 0;
        const f1 = 440 * Math.pow(2, (leadMidi + transpose - 69) / 12);
        const f2 = f1 * 1.498;
        const o1 = ctx.createOscillator();
        const o2 = ctx.createOscillator();
        const bp = ctx.createBiquadFilter();
        const lg = ctx.createGain();
        o1.type = 'sawtooth';
        o2.type = 'square';
        o1.frequency.setValueAtTime(f1, t);
        o2.frequency.setValueAtTime(f2, t);
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(isMenuGroove ? 1050 : 1650 + (this.pursuitActive ? this.heatLevel * 160 : 0), t);
        bp.Q.value = 1.3;
        const amp = isMenuGroove ? 0.045 : this.pursuitActive ? 0.085 : 0.07;
        lg.gain.setValueAtTime(0.001, t);
        lg.gain.linearRampToValueAtTime(amp, t + 0.008);
        lg.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.65);
        o1.connect(bp);
        o2.connect(bp);
        bp.connect(lg);
        lg.connect(drive);
        o1.start(t);
        o2.start(t);
        o1.stop(t + stepDur * 1.75);
        o2.stop(t + stepDur * 1.75);
        this.cleanupSynthNodes(o1, [o1, o2, bp, lg], Math.ceil(stepDur * 1750) + 120);
      }

      this.synthNextTime += stepDur;
      this.synthStep = (this.synthStep + 1) % 64;
    }
  }
}

export const musicEngine = new MusicEngine();
