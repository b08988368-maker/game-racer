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

// Curated NFS Most Wanted style soundtrack:
// Mix of custom aggressive Breakbeat/Nu-Metal/Industrial Synth compositions + verified HTTP-200 heavy tracks
export const EA_TRAX_PLAYLIST: EaTraxEntry[] = [
  {
    id: 'mw_nine_overdrive',
    title: 'Nine Thou Overdrive',
    artist: 'Rockport Soundworks',
    genre: 'Breakbeat / Nu-Metal',
    kind: 'synth',
    bpm: 132,
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
    id: 'mw_blackridge_break',
    title: 'Blackridge Breakbeat',
    artist: 'Rockport Soundworks',
    genre: 'Industrial Electro',
    kind: 'synth',
    bpm: 138,
    bassPattern: [34, 34, 0, 37, 34, 0, 41, 0, 34, 34, 44, 0, 41, 39, 37, 0],
    leadPattern: [58, 0, 61, 65, 0, 61, 58, 0, 70, 0, 68, 65, 61, 0, 60, 0],
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
    id: 'mw_rosewood_numetal',
    title: 'Rosewood Riot',
    artist: 'Rockport Soundworks',
    genre: 'Nu-Metal Riff',
    kind: 'synth',
    bpm: 128,
    bassPattern: [33, 0, 33, 33, 36, 0, 38, 0, 33, 0, 40, 38, 36, 0, 35, 36],
    leadPattern: [57, 0, 60, 0, 64, 62, 60, 0, 57, 0, 67, 0, 64, 60, 59, 0],
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
    id: 'mw_camden_dnb',
    title: 'Camden Docks DnB',
    artist: 'Rockport Soundworks',
    genre: 'Dark Drum & Bass',
    kind: 'synth',
    bpm: 162,
    bassPattern: [36, 0, 0, 39, 0, 36, 43, 0, 36, 0, 46, 0, 43, 41, 39, 0],
    leadPattern: [72, 0, 67, 0, 63, 0, 67, 70, 72, 0, 75, 0, 70, 67, 63, 0],
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
    id: 'mw_condition5',
    title: 'Condition 5 Interceptor',
    artist: 'Rockport Soundworks',
    genre: 'Pursuit Darksynth',
    kind: 'synth',
    bpm: 142,
    bassPattern: [35, 35, 0, 38, 35, 0, 42, 43, 35, 35, 0, 47, 45, 42, 38, 0],
    leadPattern: [59, 62, 66, 0, 67, 66, 62, 0, 71, 0, 69, 66, 62, 59, 62, 0],
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
    id: 'mw_darkling',
    title: 'Darkling',
    artist: 'Kevin MacLeod',
    genre: 'Dark Tension',
    kind: 'stream',
    url: `${INCOMPETECH_BASE}Darkling.mp3`,
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
    title: "Razor's Requiem",
    artist: 'Rockport Soundworks',
    genre: 'Boss Industrial Metal',
    kind: 'synth',
    bpm: 144,
    bassPattern: [36, 36, 48, 36, 39, 36, 43, 41, 36, 36, 48, 36, 46, 43, 41, 39],
    leadPattern: [60, 0, 72, 67, 63, 0, 67, 70, 60, 0, 75, 72, 70, 67, 63, 62],
  },
];

const TRACK_TO_INDEX: Record<TrackId, number> = {
  rockport_loop: 0,
  rosewood_park: 4,
  hwy99_speedway: 1,
  camden_coast: 6,
  rosewood_canyon: 8,
  heritage_forest: 2,
  gray_point_bay: 5,
  silverton_pass: 3,
  downtown_labyrinth: 12,
  blackridge_summit: 15,
};

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

  // Multi-layered Industrial Breakbeat & Nu-Metal Synth Engine
  private synthActive = false;
  private synthTimer: number | null = null;
  private synthStep = 0;
  private synthNextTime = 0;
  private noiseBuf: AudioBuffer | null = null;

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
    if (this.mode === 'menu' && !this.running) {
      return 'Safe House Groove · Rockport Soundworks';
    }
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
      } else if ((entry?.kind === 'synth' || this.mode === 'menu') && !this.synthActive) {
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
    if (this.audioEl) {
      this.audioEl.pause();
    }
    this.notify();
    this.activateSynthLoop();
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
      if (this.mode === 'menu') this.mode = 'race';
      this.playIndex(this.currentIdx);
    } else {
      this.notify();
    }
    return this.getCurrentTrackLabel();
  }

  public prevTrack(): string {
    this.currentIdx = (this.currentIdx - 1 + EA_TRAX_PLAYLIST.length) % EA_TRAX_PLAYLIST.length;
    if (this.running) {
      if (this.mode === 'menu') this.mode = 'race';
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

  private ensureAudioElement(): HTMLAudioElement {
    if (!this.audioEl) {
      const el = new Audio();
      el.preload = 'auto';
      el.addEventListener('ended', () => {
        if (this.running && this.mode === 'race') {
          this.nextTrack();
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
          : this.pursuitActive
            ? Math.min(0.74, 0.56 + this.heatLevel * 0.03)
            : 0.5;
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
            ? 0.28
            : this.pursuitActive
              ? Math.min(0.56, 0.42 + this.heatLevel * 0.028)
              : 0.42;
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
      if (this.running) {
        this.activateSynthLoop();
      }
    });
  }

  private ensureNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuf && this.noiseBuf.sampleRate === ctx.sampleRate) {
      return this.noiseBuf;
    }
    const len = Math.floor(ctx.sampleRate * 0.4);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      ch[i] = Math.random() * 2 - 1;
    }
    this.noiseBuf = buf;
    return buf;
  }

  private activateSynthLoop() {
    if (this.synthActive) return;
    this.synthActive = true;
    const ctx = soundEngine.getAudioContext();
    const dest = soundEngine.getMusicDestination();
    if (!ctx || !dest) return;
    this.syncPlaybackVolume();
    this.synthStep = 0;
    this.synthNextTime = ctx.currentTime + 0.05;
    if (this.synthTimer === null) {
      this.synthTimer = window.setInterval(() => this.scheduleSynthStep(), 45);
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

    const isMenuGroove = this.mode === 'menu' && EA_TRAX_PLAYLIST[this.currentIdx]?.kind !== 'synth';
    const entry = EA_TRAX_PLAYLIST[this.currentIdx] ?? EA_TRAX_PLAYLIST[0];
    const bpm = isMenuGroove ? 94 : entry.bpm + (this.pursuitActive ? this.heatLevel * 2 : 0);
    const stepDur = 60 / bpm / 4;
    if (this.synthNextTime < ctx.currentTime - 0.25) {
      this.synthNextTime = ctx.currentTime + 0.03;
    }

    const noiseBuf = this.ensureNoiseBuffer(ctx);
    const menuBass = [36, 0, 0, 36, 0, 0, 39, 0, 36, 0, 0, 41, 0, 39, 36, 0];
    const bassSeq = isMenuGroove
      ? menuBass
      : entry.bassPattern ?? [36, 0, 36, 39, 36, 0, 41, 43, 36, 0, 36, 46, 43, 41, 39, 0];
    const leadSeq = isMenuGroove
      ? [60, 0, 0, 0, 63, 0, 0, 0, 67, 0, 0, 0, 65, 0, 63, 0]
      : entry.leadPattern ?? [60, 0, 63, 0, 67, 0, 65, 63, 60, 0, 70, 0, 67, 63, 65, 0];

    while (this.synthNextTime < ctx.currentTime + 0.14) {
      const s = this.synthStep % 16;
      const bar = Math.floor(this.synthStep / 16) % 4;
      const t = this.synthNextTime;

      // 1. Punchy sub-thump Breakbeat Kick (syncopated NFS Most Wanted groove)
      const kickHit = isMenuGroove
        ? s === 0 || s === 6 || s === 10
        : s === 0 || s === 3 || s === 6 || s === 10 || (this.pursuitActive && s === 14);
      if (kickHit) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(128, t);
        osc.frequency.exponentialRampToValueAtTime(42, t + 0.09);
        g.gain.setValueAtTime(isMenuGroove ? 0.26 : 0.34, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
        osc.connect(g);
        g.connect(dest);
        osc.start(t);
        osc.stop(t + 0.14);
      }

      // 2. Tight Snappy Snare / Rim Clap on backbeats (4 and 12 + ghost hit on 15 in pursuit)
      const snareHit = s === 4 || s === 12 || (!isMenuGroove && this.pursuitActive && this.heatLevel >= 3 && s === 15);
      if (snareHit) {
        const ghost = s === 15 ? 0.45 : 1.0;
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = isMenuGroove ? 1450 : 1950;
        bp.Q.value = 0.85;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime((isMenuGroove ? 0.12 : 0.22) * ghost, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
        src.connect(bp);
        bp.connect(ng);
        ng.connect(dest);
        src.start(t);
        src.stop(t + 0.12);

        const body = ctx.createOscillator();
        body.type = 'triangle';
        body.frequency.setValueAtTime(210, t);
        body.frequency.exponentialRampToValueAtTime(115, t + 0.06);
        const bg = ctx.createGain();
        bg.gain.setValueAtTime(0.14 * ghost, t);
        bg.gain.exponentialRampToValueAtTime(0.001, t + 0.075);
        body.connect(bg);
        bg.connect(dest);
        body.start(t);
        body.stop(t + 0.08);
      }

      // 3. Crisp Metallic Hi-Hats (double-time during race/pursuit)
      const hatHit = isMenuGroove ? s % 2 === 0 : true;
      if (hatHit) {
        const openHat = s === 2 || s === 10;
        const accent = s % 4 === 2 ? 1.0 : 0.48;
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 6200;
        const hg = ctx.createGain();
        hg.gain.setValueAtTime((isMenuGroove ? 0.032 : 0.055) * accent, t);
        hg.gain.exponentialRampToValueAtTime(0.001, t + (openHat ? 0.07 : 0.032));
        src.connect(hp);
        hp.connect(hg);
        hg.connect(dest);
        src.start(t);
        src.stop(t + 0.08);
      }

      // 4. Aggressive Distorted Bass Guitar / Sub-Saw Riff (with bar 4 turnaround transpose)
      const baseRoot = bassSeq[s];
      if (baseRoot > 0) {
        const transpose = bar === 3 && s >= 8 ? 3 : bar === 2 && s >= 12 ? -2 : 0;
        const freq = 440 * Math.pow(2, (baseRoot + transpose - 69) / 12);
        const osc = ctx.createOscillator();
        const sub = ctx.createOscillator();
        const lp = ctx.createBiquadFilter();
        const g = ctx.createGain();
        osc.type = isMenuGroove ? 'triangle' : 'sawtooth';
        sub.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        sub.frequency.setValueAtTime(freq * 0.5, t);
        lp.type = 'lowpass';
        const cutoff = isMenuGroove ? 420 : this.pursuitActive ? 780 + this.heatLevel * 120 : 720;
        lp.frequency.setValueAtTime(cutoff * 1.45, t);
        lp.frequency.exponentialRampToValueAtTime(cutoff * 0.55, t + stepDur * 1.25);
        lp.Q.value = 2.4;
        g.gain.setValueAtTime(0.002, t);
        g.gain.linearRampToValueAtTime(isMenuGroove ? 0.14 : 0.21, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.35);
        osc.connect(lp);
        sub.connect(lp);
        lp.connect(g);
        g.connect(dest);
        osc.start(t);
        sub.start(t);
        osc.stop(t + stepDur * 1.45);
        sub.stop(t + stepDur * 1.45);
      }

      // 5. Industrial Power-Chord / Darksynth Lead Stabs (intensifies in race & pursuit)
      const leadMidi = leadSeq[s];
      if (leadMidi > 0 && (!isMenuGroove || bar % 2 === 1)) {
        const transpose = bar === 3 && s >= 8 ? 3 : 0;
        const f1 = 440 * Math.pow(2, (leadMidi + transpose - 69) / 12);
        const f2 = f1 * 1.498; // fifth power-chord harmonic
        const o1 = ctx.createOscillator();
        const o2 = ctx.createOscillator();
        const bp = ctx.createBiquadFilter();
        const lg = ctx.createGain();
        o1.type = 'sawtooth';
        o2.type = 'square';
        o1.frequency.setValueAtTime(f1, t);
        o2.frequency.setValueAtTime(f2, t);
        bp.type = 'lowpass';
        bp.frequency.setValueAtTime(isMenuGroove ? 920 : 1950 + (this.pursuitActive ? this.heatLevel * 220 : 0), t);
        bp.frequency.exponentialRampToValueAtTime(540, t + stepDur * 1.8);
        bp.Q.value = 1.8;
        const amp = isMenuGroove ? 0.045 : this.pursuitActive ? 0.095 : 0.075;
        lg.gain.setValueAtTime(0.001, t);
        lg.gain.linearRampToValueAtTime(amp, t + 0.01);
        lg.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.8);
        o1.connect(bp);
        o2.connect(bp);
        bp.connect(lg);
        lg.connect(dest);
        o1.start(t);
        o2.start(t);
        o1.stop(t + stepDur * 1.9);
        o2.stop(t + stepDur * 1.9);
      }

      this.synthNextTime += stepDur;
      this.synthStep = (this.synthStep + 1) % 64;
    }
  }
}

export const musicEngine = new MusicEngine();
