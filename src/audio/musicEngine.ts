import { TrackId } from '../types/game';
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

const INCOMPETECH_BASE = 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/';
const SOUNDHELIX_BASE = 'https://www.soundhelix.com/examples/mp3/';

// Curated High-Adrenaline Street Racing Soundtrack:
// All stream URLs are verified HTTP 200 MP3s paired with a studio-grade Web Audio synth engine.
export const EA_TRAX_PLAYLIST: EaTraxEntry[] = [
  {
    id: 'mw_overheat',
    title: 'Overheat (Turbo Mix)',
    artist: 'Kevin MacLeod',
    genre: 'Electronic Rock',
    kind: 'stream',
    url: `${INCOMPETECH_BASE}Overheat.mp3`,
    bpm: 138,
    bassPattern: [36, 0, 36, 39, 36, 0, 41, 43, 36, 0, 36, 46, 43, 41, 39, 0],
    leadPattern: [60, 0, 63, 0, 67, 0, 65, 63, 60, 0, 70, 0, 67, 63, 65, 0],
  },
  {
    id: 'mw_metalmania',
    title: 'Metalmania',
    artist: 'Kevin MacLeod',
    genre: 'Heavy Metal',
    kind: 'stream',
    url: `${INCOMPETECH_BASE}Metalmania.mp3`,
    bpm: 146,
  },
  {
    id: 'mw_cut_and_run',
    title: 'Cut and Run',
    artist: 'Kevin MacLeod',
    genre: 'Action Breakbeat',
    kind: 'stream',
    url: `${INCOMPETECH_BASE}Cut%20and%20Run.mp3`,
    bpm: 140,
  },
  {
    id: 'mw_mechanolith',
    title: 'Mechanolith',
    artist: 'Kevin MacLeod',
    genre: 'Industrial Metal',
    kind: 'stream',
    url: `${INCOMPETECH_BASE}Mechanolith.mp3`,
    bpm: 144,
  },
  {
    id: 'mw_furious_freak',
    title: 'Furious Freak',
    artist: 'Kevin MacLeod',
    genre: 'High-Octane Rock',
    kind: 'stream',
    url: `${INCOMPETECH_BASE}Furious%20Freak.mp3`,
    bpm: 142,
  },
  {
    id: 'mw_volatile',
    title: 'Volatile Reaction',
    artist: 'Kevin MacLeod',
    genre: 'Dark Action Electro',
    kind: 'stream',
    url: `${INCOMPETECH_BASE}Volatile%20Reaction.mp3`,
    bpm: 148,
  },
  {
    id: 'mw_edm_detection',
    title: 'EDM Detection Mode',
    artist: 'Kevin MacLeod',
    genre: 'Phonk / Big Room EDM',
    kind: 'stream',
    url: `${INCOMPETECH_BASE}EDM%20Detection%20Mode.mp3`,
    bpm: 128,
  },
  {
    id: 'mw_ouroboros',
    title: 'Ouroboros',
    artist: 'Kevin MacLeod',
    genre: 'Cyber Breakbeat',
    kind: 'stream',
    url: `${INCOMPETECH_BASE}Ouroboros.mp3`,
    bpm: 146,
  },
  {
    id: 'mw_motherlode',
    title: 'Motherlode',
    artist: 'Kevin MacLeod',
    genre: 'Hard Arena Rock',
    kind: 'stream',
    url: `${INCOMPETECH_BASE}Motherlode.mp3`,
    bpm: 138,
  },
  {
    id: 'mw_severe_tire_damage',
    title: 'Severe Tire Damage',
    artist: 'Kevin MacLeod',
    genre: 'Street Chase Rock',
    kind: 'stream',
    url: `${INCOMPETECH_BASE}Severe%20Tire%20Damage.mp3`,
    bpm: 145,
  },
  {
    id: 'mw_movement_prop',
    title: 'Movement Proposition',
    artist: 'Kevin MacLeod',
    genre: 'High-Speed Chase',
    kind: 'stream',
    url: `${INCOMPETECH_BASE}Movement%20Proposition.mp3`,
    bpm: 144,
  },
  {
    id: 'mw_soundhelix_pulse',
    title: 'Midnight Skyline Drive',
    artist: 'SoundHelix Collective',
    genre: 'Electro Trance',
    kind: 'stream',
    url: `${SOUNDHELIX_BASE}SoundHelix-Song-8.mp3`,
    bpm: 136,
  },
  {
    id: 'mw_mta',
    title: 'Metro Alley Hustle',
    artist: 'Kevin MacLeod',
    genre: 'Urban Breakbeat',
    kind: 'stream',
    url: `${INCOMPETECH_BASE}MTA.mp3`,
    bpm: 130,
  },
  {
    id: 'mw_cyborg_ninja',
    title: 'Cyborg Ninja',
    artist: 'Kevin MacLeod',
    genre: 'Synth Metal',
    kind: 'stream',
    url: `${INCOMPETECH_BASE}Cyborg%20Ninja.mp3`,
    bpm: 145,
  },
  {
    id: 'mw_future_gladiator',
    title: 'Future Gladiator',
    artist: 'Kevin MacLeod',
    genre: 'Heavy Electronic',
    kind: 'stream',
    url: `${INCOMPETECH_BASE}Future%20Gladiator.mp3`,
    bpm: 150,
  },
  {
    id: 'mw_razor_requiem',
    title: "Black Vortex (Boss Mix)",
    artist: 'Kevin MacLeod',
    genre: 'Boss Industrial Metal',
    kind: 'stream',
    url: `${INCOMPETECH_BASE}Black%20Vortex.mp3`,
    bpm: 148,
    bassPattern: [36, 36, 48, 36, 39, 36, 43, 41, 36, 36, 48, 36, 46, 43, 41, 39],
    leadPattern: [60, 0, 72, 67, 63, 0, 67, 70, 60, 0, 75, 72, 70, 67, 63, 62],
  },
  {
    id: 'mw_phonk_overdrive',
    title: 'Nine Thou Phonk Overdrive',
    artist: 'Rockport Soundworks',
    genre: 'Phonk / Trap Metal',
    kind: 'synth',
    bpm: 134,
    bassPattern: [36, 0, 36, 39, 36, 0, 41, 43, 36, 0, 36, 46, 43, 41, 39, 0],
    leadPattern: [60, 0, 63, 0, 67, 0, 65, 63, 60, 0, 70, 0, 67, 63, 65, 0],
  },
];

const TRACK_TO_INDEX: Record<TrackId, number> = {
  rockport_loop: 0,
  rosewood_park: 4,
  hwy99_speedway: 1,
  camden_coast: 2,
  rosewood_canyon: 8,
  heritage_forest: 7,
  gray_point_bay: 5,
  silverton_pass: 3,
  downtown_labyrinth: 11,
  blackridge_summit: 15,
};

function makeDistortionCurve(amount = 42): Float32Array<ArrayBuffer> {
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
    // Play a real energetic track in the Safe House garage too (user can skip any time)
    if (this.currentIdx < 0 || this.currentIdx >= EA_TRAX_PLAYLIST.length) {
      this.currentIdx = 6; // EDM Detection Mode
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

  private ensureAudioElement(): HTMLAudioElement {
    if (!this.audioEl) {
      const el = new Audio();
      el.preload = 'auto';
      el.addEventListener('ended', () => {
        if (this.running) {
          this.nextTrack();
        }
      });
      el.addEventListener('playing', () => {
        // Real MP3 started cleanly — turn off fallback synth if it was running
        if (this.synthActive && EA_TRAX_PLAYLIST[this.currentIdx]?.kind === 'stream') {
          this.stopSynthLoop();
        }
      });
      el.addEventListener('error', () => {
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
          ? 0.14
          : this.mode === 'menu'
            ? 0.42
            : this.pursuitActive
              ? Math.min(0.82, 0.62 + this.heatLevel * 0.04)
              : 0.58;
        this.audioEl.volume = targetVol;
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
            ? 0.32
            : this.pursuitActive
              ? Math.min(0.62, 0.46 + this.heatLevel * 0.03)
              : 0.48;
      dest.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.08);
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
      comp.ratio.value = 6;
      comp.attack.value = 0.004;
      comp.release.value = 0.14;
      comp.connect(dest);
      this.masterBus = comp;
    }
    if (!this.driveShaper || this.driveShaper.context !== ctx) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = makeDistortionCurve(36);
      shaper.oversample = '2x';
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
    if (this.synthNextTime < ctx.currentTime - 0.25) {
      this.synthNextTime = ctx.currentTime + 0.03;
    }

    const noiseBuf = this.ensureNoiseBuffer(ctx);
    const bassSeq = entry.bassPattern ?? [36, 0, 36, 39, 36, 0, 41, 43, 36, 0, 36, 46, 43, 41, 39, 0];
    const leadSeq = entry.leadPattern ?? [60, 0, 63, 0, 67, 0, 65, 63, 60, 0, 70, 0, 67, 63, 65, 0];

    while (this.synthNextTime < ctx.currentTime + 0.14) {
      const s = this.synthStep % 16;
      const bar = Math.floor(this.synthStep / 16) % 4;
      const t = this.synthNextTime;

      // 1. Punchy 808 Sub Kick (Phonk / Electronic-Rock Drive)
      const kickHit = s === 0 || s === 3 || s === 6 || s === 10 || (this.pursuitActive && s === 14);
      if (kickHit) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(148, t);
        osc.frequency.exponentialRampToValueAtTime(44, t + 0.095);
        g.gain.setValueAtTime(isMenuGroove ? 0.3 : 0.42, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.connect(g);
        g.connect(bus);
        osc.start(t);
        osc.stop(t + 0.19);
      }

      // 2. Crisp Trap/Rock Snare + Layered Clap
      const snareHit = s === 4 || s === 12 || (!isMenuGroove && bar === 3 && s === 15);
      if (snareHit) {
        const ghost = s === 15 ? 0.52 : 1.0;
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 2150;
        bp.Q.value = 0.75;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime((isMenuGroove ? 0.16 : 0.28) * ghost, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
        src.connect(bp);
        bp.connect(ng);
        ng.connect(bus);
        src.start(t);
        src.stop(t + 0.14);

        const body = ctx.createOscillator();
        body.type = 'triangle';
        body.frequency.setValueAtTime(225, t);
        body.frequency.exponentialRampToValueAtTime(118, t + 0.065);
        const bg = ctx.createGain();
        bg.gain.setValueAtTime(0.18 * ghost, t);
        bg.gain.exponentialRampToValueAtTime(0.001, t + 0.085);
        body.connect(bg);
        bg.connect(bus);
        body.start(t);
        body.stop(t + 0.09);
      }

      // 3. Driving Hi-Hats + 32nd-note Phonk Rolls on Bar Turnaround
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
        hp.frequency.value = 7200;
        const hg = ctx.createGain();
        hg.gain.setValueAtTime((isMenuGroove ? 0.035 : 0.065) * accent, ht);
        hg.gain.exponentialRampToValueAtTime(0.001, ht + (openHat ? 0.08 : 0.032));
        src.connect(hp);
        hp.connect(hg);
        hg.connect(bus);
        src.start(ht);
        src.stop(ht + 0.09);
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
        const cutoff = isMenuGroove ? 640 : this.pursuitActive ? 1150 + this.heatLevel * 140 : 960;
        lp.frequency.setValueAtTime(cutoff * 1.6, t);
        lp.frequency.exponentialRampToValueAtTime(cutoff * 0.45, t + stepDur * 1.3);
        lp.Q.value = 2.6;
        g.gain.setValueAtTime(0.002, t);
        g.gain.linearRampToValueAtTime(isMenuGroove ? 0.14 : 0.22, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.4);
        osc.connect(lp);
        lp.connect(g);
        g.connect(drive);
        sub.connect(g);
        osc.start(t);
        sub.start(t);
        osc.stop(t + stepDur * 1.48);
        sub.stop(t + stepDur * 1.48);
      }

      // 5. Saturated Phonk Cowbell / Overdriven Guitar Power-Chord Lead
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
        bp.frequency.setValueAtTime(isMenuGroove ? 1100 : 1850 + (this.pursuitActive ? this.heatLevel * 200 : 0), t);
        bp.Q.value = 1.4;
        const amp = isMenuGroove ? 0.055 : this.pursuitActive ? 0.105 : 0.085;
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
      }

      this.synthNextTime += stepDur;
      this.synthStep = (this.synthStep + 1) % 64;
    }
  }
}

export const musicEngine = new MusicEngine();
