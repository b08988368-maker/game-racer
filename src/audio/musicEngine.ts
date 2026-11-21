import { TrackId } from '../types/game';
import { soundEngine } from './soundEngine';

type GuitarArticulation = 'pm' | 'open' | 'accent';

interface TrackComposition {
  title: string;
  bpm: number;
  riffCutoff: number;
  subMode: 'drop' | 'industrial' | 'electro';
  /** 32-step (2 bars of 16th notes) drop-tuned baritone guitar/synth power-chord roots in MIDI (0 = rest) */
  riffSteps: number[];
  /** Articulation per step: palm mute (tight chug), open sustain, or screaming octave accent */
  riffArt: GuitarArticulation[];
  /** 32-step sub-bass roots (octave below riff) */
  bassSteps: number[];
  /** 32-step industrial/nu-metal secondary lead/arp or harmonic stab (0 = rest) */
  hookSteps: number[];
  kickSteps: number[];
  snareSteps: number[];
  hatSteps: number[];
  crashSteps: number[];
}

// Heavy Drop-C / Drop-B / D-minor PS2 Need for Speed: Most Wanted style nu-metal, industrial & dark breakbeat OST
const TRACK_COMPOSITIONS: Record<TrackId, TrackComposition> = {
  rockport_loop: {
    title: 'Nine Thou Ignition',
    bpm: 140,
    riffCutoff: 2400,
    subMode: 'drop',
    // Heavy Drop-D nu-metal syncopated chug + tritone turnaround on Bar 2
    riffSteps: [
      38, 38, 0, 41, 38, 0, 43, 0, 38, 38, 45, 0, 43, 41, 44, 0,
      38, 38, 0, 41, 38, 0, 46, 0, 45, 0, 44, 43, 41, 0, 38, 41,
    ],
    riffArt: [
      'accent', 'pm', 'pm', 'open', 'pm', 'pm', 'accent', 'pm', 'pm', 'pm', 'open', 'pm', 'accent', 'pm', 'open', 'pm',
      'accent', 'pm', 'pm', 'open', 'pm', 'pm', 'accent', 'pm', 'accent', 'pm', 'pm', 'open', 'accent', 'pm', 'pm', 'open',
    ],
    bassSteps: [
      26, 26, 0, 29, 26, 0, 31, 0, 26, 26, 33, 0, 31, 29, 32, 0,
      26, 26, 0, 29, 26, 0, 34, 0, 33, 0, 32, 31, 29, 0, 26, 29,
    ],
    hookSteps: [
      50, 0, 0, 0, 53, 0, 55, 0, 0, 0, 57, 0, 0, 56, 0, 0,
      50, 0, 0, 0, 58, 0, 57, 0, 56, 0, 0, 55, 53, 0, 50, 0,
    ],
    kickSteps: [
      1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 1, 0, 0, 1, 1, 0,
      1, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1,
    ],
    snareSteps: [
      0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1,
      0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0,
    ],
    hatSteps: [
      1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1,
      1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1,
    ],
    crashSteps: [
      1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0,
    ],
  },
  rosewood_park: {
    title: 'Campus Overdrive',
    bpm: 136,
    riffCutoff: 2600,
    subMode: 'drop',
    // E-minor driving alternative rock / breakbeat overdrive
    riffSteps: [
      40, 40, 0, 47, 40, 0, 43, 45, 40, 40, 0, 47, 48, 0, 45, 43,
      40, 40, 0, 47, 40, 0, 50, 0, 48, 47, 45, 0, 43, 42, 40, 0,
    ],
    riffArt: [
      'accent', 'pm', 'pm', 'open', 'pm', 'pm', 'accent', 'open', 'accent', 'pm', 'pm', 'open', 'accent', 'pm', 'open', 'pm',
      'accent', 'pm', 'pm', 'open', 'pm', 'pm', 'accent', 'pm', 'open', 'pm', 'accent', 'pm', 'open', 'pm', 'accent', 'pm',
    ],
    bassSteps: [
      28, 28, 0, 35, 28, 0, 31, 33, 28, 28, 0, 35, 36, 0, 33, 31,
      28, 28, 0, 35, 28, 0, 38, 0, 36, 35, 33, 0, 31, 30, 28, 0,
    ],
    hookSteps: [
      52, 0, 0, 59, 0, 0, 55, 0, 52, 0, 0, 59, 60, 0, 57, 0,
      52, 0, 0, 59, 0, 0, 62, 0, 60, 0, 57, 0, 55, 54, 52, 0,
    ],
    kickSteps: [
      1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 1,
      1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1,
    ],
    snareSteps: [
      0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0,
      0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1,
    ],
    hatSteps: [
      1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1,
    ],
    crashSteps: [
      1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ],
  },
  hwy99_speedway: {
    title: '350 Velocity',
    bpm: 162,
    riffCutoff: 3100,
    subMode: 'electro',
    // Relentless Drum & Bass / Electro-Industrial Pendulum-style high-speed pulse (F minor)
    riffSteps: [
      41, 0, 41, 41, 0, 48, 41, 0, 44, 0, 46, 0, 41, 48, 46, 44,
      41, 0, 41, 41, 0, 49, 41, 0, 46, 0, 48, 0, 49, 48, 46, 44,
    ],
    riffArt: [
      'accent', 'pm', 'pm', 'pm', 'pm', 'open', 'pm', 'pm', 'accent', 'pm', 'open', 'pm', 'accent', 'open', 'pm', 'pm',
      'accent', 'pm', 'pm', 'pm', 'pm', 'open', 'pm', 'pm', 'accent', 'pm', 'open', 'pm', 'accent', 'accent', 'pm', 'open',
    ],
    bassSteps: [
      29, 29, 29, 29, 29, 36, 29, 29, 32, 32, 34, 34, 29, 36, 34, 32,
      29, 29, 29, 29, 29, 37, 29, 29, 34, 34, 36, 36, 37, 36, 34, 32,
    ],
    hookSteps: [
      53, 56, 60, 0, 63, 0, 60, 56, 53, 0, 60, 63, 65, 0, 63, 60,
      53, 56, 61, 0, 65, 0, 61, 56, 53, 0, 61, 65, 68, 0, 65, 63,
    ],
    kickSteps: [
      1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1,
      1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0,
    ],
    snareSteps: [
      0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1,
      0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0,
    ],
    hatSteps: [
      1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    ],
    crashSteps: [
      1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0,
    ],
  },
  camden_coast: {
    title: 'Shipyard Storm',
    bpm: 138,
    riffCutoff: 2150,
    subMode: 'industrial',
    // Heavy Drop-C dark coastal industrial breakbeat
    riffSteps: [
      36, 0, 39, 0, 43, 0, 41, 39, 36, 0, 39, 43, 44, 0, 43, 41,
      36, 0, 39, 36, 43, 0, 44, 0, 42, 0, 41, 39, 36, 36, 39, 41,
    ],
    riffArt: [
      'accent', 'pm', 'open', 'pm', 'accent', 'pm', 'pm', 'open', 'accent', 'pm', 'pm', 'open', 'accent', 'pm', 'open', 'pm',
      'accent', 'pm', 'pm', 'pm', 'open', 'pm', 'accent', 'pm', 'accent', 'pm', 'open', 'pm', 'pm', 'pm', 'accent', 'open',
    ],
    bassSteps: [
      24, 24, 27, 24, 31, 24, 29, 27, 24, 24, 27, 31, 32, 24, 31, 29,
      24, 24, 27, 24, 31, 24, 32, 24, 30, 24, 29, 27, 24, 24, 27, 29,
    ],
    hookSteps: [
      48, 0, 51, 55, 0, 53, 51, 0, 48, 55, 0, 56, 55, 0, 53, 51,
      48, 0, 51, 0, 55, 0, 56, 55, 54, 0, 53, 51, 48, 0, 51, 0,
    ],
    kickSteps: [
      1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0,
      1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0,
    ],
    snareSteps: [
      0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1,
      0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1,
    ],
    hatSteps: [
      1, 0, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1,
      1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1,
    ],
    crashSteps: [
      1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ],
  },
  rosewood_canyon: {
    title: 'Red Rock Rumble',
    bpm: 134,
    riffCutoff: 2350,
    subMode: 'drop',
    // Heavy stoner-fuzz A-minor riff
    riffSteps: [
      33, 33, 0, 36, 38, 0, 36, 33, 33, 0, 40, 0, 38, 36, 33, 31,
      33, 33, 0, 36, 38, 0, 41, 40, 38, 36, 38, 0, 40, 38, 36, 33,
    ],
    riffArt: [
      'accent', 'pm', 'pm', 'open', 'accent', 'pm', 'open', 'pm', 'accent', 'pm', 'open', 'pm', 'accent', 'pm', 'open', 'pm',
      'accent', 'pm', 'pm', 'open', 'accent', 'pm', 'accent', 'open', 'pm', 'pm', 'accent', 'pm', 'open', 'pm', 'accent', 'open',
    ],
    bassSteps: [
      21, 21, 0, 24, 26, 0, 24, 21, 21, 0, 28, 0, 26, 24, 21, 19,
      21, 21, 0, 24, 26, 0, 29, 28, 26, 24, 26, 0, 28, 26, 24, 21,
    ],
    hookSteps: [
      57, 0, 60, 0, 62, 60, 57, 0, 64, 0, 62, 60, 57, 0, 55, 0,
      57, 0, 60, 0, 62, 0, 65, 64, 62, 60, 62, 0, 64, 0, 60, 57,
    ],
    kickSteps: [
      1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0,
      1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0,
    ],
    snareSteps: [
      0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1,
      0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0,
    ],
    hatSteps: [
      1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0,
      1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1,
    ],
    crashSteps: [
      1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0,
    ],
  },
  heritage_forest: {
    title: 'Timberline Drift',
    bpm: 144,
    riffCutoff: 2700,
    subMode: 'electro',
    // Fast D-minor dark electro-rock hybrid
    riffSteps: [
      38, 0, 45, 0, 41, 0, 43, 45, 38, 0, 48, 0, 45, 43, 41, 0,
      38, 0, 45, 38, 41, 43, 45, 0, 46, 0, 45, 0, 43, 41, 40, 38,
    ],
    riffArt: [
      'accent', 'pm', 'open', 'pm', 'accent', 'pm', 'pm', 'open', 'accent', 'pm', 'open', 'pm', 'accent', 'pm', 'open', 'pm',
      'accent', 'pm', 'pm', 'pm', 'accent', 'pm', 'open', 'pm', 'accent', 'pm', 'open', 'pm', 'pm', 'pm', 'accent', 'open',
    ],
    bassSteps: [
      26, 26, 33, 26, 29, 26, 31, 33, 26, 26, 36, 26, 33, 31, 29, 26,
      26, 26, 33, 26, 29, 31, 33, 26, 34, 26, 33, 26, 31, 29, 28, 26,
    ],
    hookSteps: [
      50, 53, 57, 0, 62, 0, 60, 57, 53, 57, 60, 0, 57, 55, 53, 52,
      50, 53, 57, 0, 62, 60, 57, 0, 58, 0, 57, 0, 55, 53, 52, 50,
    ],
    kickSteps: [
      1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0,
      1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1,
    ],
    snareSteps: [
      0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0,
      0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0,
    ],
    hatSteps: [
      1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1,
      1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    ],
    crashSteps: [
      1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0,
    ],
  },
  gray_point_bay: {
    title: 'Turnpike Siren',
    bpm: 148,
    riffCutoff: 2850,
    subMode: 'electro',
    // G-minor driving highway gated breakbeat
    riffSteps: [
      43, 43, 0, 43, 46, 46, 0, 46, 43, 43, 0, 43, 50, 48, 46, 43,
      43, 43, 0, 43, 46, 46, 0, 48, 51, 0, 50, 0, 48, 46, 45, 43,
    ],
    riffArt: [
      'accent', 'pm', 'pm', 'pm', 'accent', 'pm', 'pm', 'open', 'accent', 'pm', 'pm', 'pm', 'accent', 'pm', 'open', 'pm',
      'accent', 'pm', 'pm', 'pm', 'accent', 'pm', 'pm', 'open', 'accent', 'pm', 'open', 'pm', 'accent', 'pm', 'open', 'pm',
    ],
    bassSteps: [
      31, 31, 43, 31, 34, 34, 46, 34, 31, 31, 43, 31, 38, 36, 34, 31,
      31, 31, 43, 31, 34, 34, 46, 36, 39, 31, 38, 31, 36, 34, 33, 31,
    ],
    hookSteps: [
      55, 0, 58, 62, 0, 67, 62, 0, 55, 58, 62, 0, 65, 62, 60, 58,
      55, 0, 58, 62, 0, 67, 65, 62, 63, 0, 62, 0, 60, 58, 57, 55,
    ],
    kickSteps: [
      1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0,
      1, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 1, 1,
    ],
    snareSteps: [
      0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1,
      0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0,
    ],
    hatSteps: [
      0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    ],
    crashSteps: [
      1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ],
  },
  silverton_pass: {
    title: 'Blast Furnace',
    bpm: 146,
    riffCutoff: 2250,
    subMode: 'industrial',
    // C#-minor pounding industrial metal stomp
    riffSteps: [
      37, 37, 0, 40, 37, 0, 42, 43, 37, 0, 44, 37, 42, 40, 39, 37,
      37, 37, 0, 40, 37, 0, 43, 0, 44, 37, 43, 37, 42, 40, 38, 37,
    ],
    riffArt: [
      'accent', 'pm', 'pm', 'open', 'pm', 'pm', 'accent', 'open', 'accent', 'pm', 'open', 'pm', 'accent', 'pm', 'pm', 'open',
      'accent', 'pm', 'pm', 'open', 'pm', 'pm', 'accent', 'pm', 'accent', 'pm', 'open', 'pm', 'accent', 'open', 'pm', 'pm',
    ],
    bassSteps: [
      25, 25, 0, 28, 25, 0, 30, 31, 25, 0, 32, 25, 30, 28, 27, 25,
      25, 25, 0, 28, 25, 0, 31, 0, 32, 25, 31, 25, 30, 28, 26, 25,
    ],
    hookSteps: [
      49, 0, 52, 0, 54, 55, 54, 52, 49, 0, 56, 0, 55, 54, 52, 49,
      49, 0, 52, 0, 55, 56, 55, 52, 56, 0, 55, 0, 54, 52, 50, 49,
    ],
    kickSteps: [
      1, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 0,
      1, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1,
    ],
    snareSteps: [
      0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0,
      0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1,
    ],
    hatSteps: [
      1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1,
      1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1,
    ],
    crashSteps: [
      1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0,
    ],
  },
  downtown_labyrinth: {
    title: 'Midnight Grid',
    bpm: 142,
    riffCutoff: 2750,
    subMode: 'industrial',
    // E-Phrygian dark cyber-industrial grit
    riffSteps: [
      40, 40, 0, 40, 41, 41, 0, 41, 40, 40, 0, 40, 43, 45, 43, 41,
      40, 40, 0, 41, 47, 0, 46, 0, 45, 0, 43, 0, 41, 40, 39, 40,
    ],
    riffArt: [
      'accent', 'pm', 'pm', 'pm', 'accent', 'pm', 'pm', 'open', 'accent', 'pm', 'pm', 'pm', 'accent', 'open', 'pm', 'pm',
      'accent', 'pm', 'pm', 'open', 'accent', 'pm', 'open', 'pm', 'accent', 'pm', 'open', 'pm', 'pm', 'pm', 'accent', 'open',
    ],
    bassSteps: [
      28, 28, 40, 28, 29, 29, 41, 29, 28, 28, 40, 28, 31, 33, 31, 29,
      28, 28, 40, 29, 35, 28, 34, 28, 33, 28, 31, 28, 29, 28, 27, 28,
    ],
    hookSteps: [
      52, 53, 56, 59, 64, 59, 56, 53, 52, 56, 59, 62, 64, 62, 59, 56,
      52, 53, 59, 64, 67, 64, 62, 59, 57, 56, 55, 53, 52, 0, 56, 0,
    ],
    kickSteps: [
      1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 1, 0,
      1, 0, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1,
    ],
    snareSteps: [
      0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1,
      0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0,
    ],
    hatSteps: [
      1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    ],
    crashSteps: [
      1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ],
  },
  blackridge_summit: {
    title: 'Apex Razorline',
    bpm: 158,
    riffCutoff: 3200,
    subMode: 'drop',
    // Blacklist #1 Razor Final Boss Anthem: relentless Drop-B double-kick nu-metal/D&B assault
    riffSteps: [
      35, 35, 47, 35, 38, 35, 42, 47, 35, 35, 47, 35, 43, 42, 40, 38,
      35, 35, 47, 35, 41, 35, 42, 47, 46, 0, 45, 43, 42, 40, 38, 41,
    ],
    riffArt: [
      'accent', 'pm', 'open', 'pm', 'accent', 'pm', 'open', 'accent', 'accent', 'pm', 'open', 'pm', 'accent', 'pm', 'open', 'pm',
      'accent', 'pm', 'open', 'pm', 'accent', 'pm', 'open', 'accent', 'accent', 'pm', 'open', 'pm', 'accent', 'open', 'accent', 'open',
    ],
    bassSteps: [
      23, 23, 35, 23, 26, 23, 30, 35, 23, 23, 35, 23, 31, 30, 28, 26,
      23, 23, 35, 23, 29, 23, 30, 35, 34, 23, 33, 31, 30, 28, 26, 29,
    ],
    hookSteps: [
      59, 62, 66, 0, 71, 0, 69, 66, 62, 66, 71, 0, 69, 67, 66, 62,
      59, 62, 66, 0, 71, 0, 70, 66, 71, 0, 70, 67, 66, 64, 62, 59,
    ],
    kickSteps: [
      1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1,
      1, 1, 1, 0, 0, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1,
    ],
    snareSteps: [
      0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1,
      0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 1,
    ],
    hatSteps: [
      1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    ],
    crashSteps: [
      1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0,
    ],
  },
};

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function makeOverdriveCurve(drive: number): Float32Array<ArrayBuffer> {
  const samples = 1024;
  const buffer = new ArrayBuffer(samples * 4);
  const curve = new Float32Array(buffer);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    // Asymmetric diode tube clipping for fat heavy guitar harmonics without thin buzz
    curve[i] = Math.tanh(x * drive + 0.16 * x * x) * 0.94;
  }
  return curve;
}

class MusicEngine {
  private timerId: number | null = null;
  private running = false;
  private paused = false;
  private trackId: TrackId = 'rockport_loop';
  private stepIndex = 0;
  private nextNoteTime = 0;
  private pursuitActive = false;
  private heatLevel = 1;

  // Dedicated heavy master & instrument buses built lazily on current AudioContext
  private wiredCtx: AudioContext | null = null;
  private busComp: DynamicsCompressorNode | null = null;
  private guitarDistBus: WaveShaperNode | null = null;
  private subBassBus: WaveShaperNode | null = null;
  private drumBus: WaveShaperNode | null = null;

  public getTrackTitle(trackId: TrackId): string {
    return TRACK_COMPOSITIONS[trackId]?.title ?? 'Nine Thou Ignition';
  }

  private ensureAudioBuses(ctx: AudioContext, dest: AudioNode) {
    if (this.wiredCtx === ctx && this.busComp && this.guitarDistBus && this.subBassBus && this.drumBus) {
      return;
    }

    // Master bus compressor + warm soft-limiter
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.14;

    const masterClip = ctx.createWaveShaper();
    masterClip.curve = makeOverdriveCurve(1.35);
    comp.connect(masterClip);
    masterClip.connect(dest);

    // Guitar / Riff Overdrive Cabinet Bus: Asymmetric Drive -> Highpass -> Mid Bite -> Cab Lowpass -> Stereo Slapback
    const guitarShaper = ctx.createWaveShaper();
    guitarShaper.curve = makeOverdriveCurve(6.8);
    guitarShaper.oversample = '2x';

    const gHp = ctx.createBiquadFilter();
    gHp.type = 'highpass';
    gHp.frequency.value = 135;

    const gMid = ctx.createBiquadFilter();
    gMid.type = 'peaking';
    gMid.frequency.value = 1150;
    gMid.Q.value = 1.3;
    gMid.gain.value = 6.0;

    const gCabLp = ctx.createBiquadFilter();
    gCabLp.type = 'lowpass';
    gCabLp.frequency.value = 3200;
    gCabLp.Q.value = 0.9;

    const gOut = ctx.createGain();
    gOut.gain.value = 0.56;

    const gDelay = ctx.createDelay(0.2);
    gDelay.delayTime.value = 0.042;
    const gDelayGain = ctx.createGain();
    gDelayGain.gain.value = 0.20;

    guitarShaper.connect(gHp);
    gHp.connect(gMid);
    gMid.connect(gCabLp);
    gCabLp.connect(gOut);
    gOut.connect(comp);
    gOut.connect(gDelay);
    gDelay.connect(gDelayGain);
    gDelayGain.connect(comp);

    // Reese Sub Bass Bus: Warm Saturation -> Tight 290Hz Lowpass
    const subShaper = ctx.createWaveShaper();
    subShaper.curve = makeOverdriveCurve(2.2);
    const subLp = ctx.createBiquadFilter();
    subLp.type = 'lowpass';
    subLp.frequency.value = 290;
    subLp.Q.value = 1.2;
    const subOut = ctx.createGain();
    subOut.gain.value = 0.85;
    subShaper.connect(subLp);
    subLp.connect(subOut);
    subOut.connect(comp);

    // Drum Bus: Punch Saturation -> Compressor
    const drumShaper = ctx.createWaveShaper();
    drumShaper.curve = makeOverdriveCurve(1.8);
    const drumOut = ctx.createGain();
    drumOut.gain.value = 0.95;
    drumShaper.connect(drumOut);
    drumOut.connect(comp);

    this.wiredCtx = ctx;
    this.busComp = comp;
    this.guitarDistBus = guitarShaper;
    this.subBassBus = subShaper;
    this.drumBus = drumShaper;
  }

  public startTrack(trackId: TrackId) {
    this.trackId = trackId;
    this.paused = false;
    soundEngine.init();
    const ctx = soundEngine.getAudioContext();
    const dest = soundEngine.getMusicDestination();
    if (!ctx || !dest) return;

    this.ensureAudioBuses(ctx, dest);
    this.stepIndex = 0;
    this.nextNoteTime = ctx.currentTime + 0.06;
    if (!this.running) {
      this.running = true;
      this.timerId = window.setInterval(() => this.scheduler(), 65);
    }
  }

  public setPursuitIntensity(active: boolean, heatLevel: number) {
    this.pursuitActive = active;
    this.heatLevel = heatLevel;
  }

  public setPaused(paused: boolean) {
    this.paused = paused;
    const ctx = soundEngine.getAudioContext();
    const dest = soundEngine.getMusicDestination() as GainNode | null;
    if (ctx && dest) {
      dest.gain.setTargetAtTime(paused ? 0.08 : 0.62, ctx.currentTime, 0.06);
    }
    if (!paused && ctx && this.running) {
      this.nextNoteTime = Math.max(this.nextNoteTime, ctx.currentTime + 0.05);
    }
  }

  public stop() {
    this.running = false;
    this.paused = false;
    this.pursuitActive = false;
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private scheduler() {
    if (!this.running || this.paused || soundEngine.isMuted()) return;
    const ctx = soundEngine.getAudioContext();
    const dest = soundEngine.getMusicDestination();
    if (!ctx || !dest || ctx.state !== 'running') return;

    this.ensureAudioBuses(ctx, dest);
    const comp = TRACK_COMPOSITIONS[this.trackId] ?? TRACK_COMPOSITIONS.rockport_loop;
    const effectiveBpm = comp.bpm + (this.pursuitActive ? Math.min(12, this.heatLevel * 2.4) : 0);
    const stepDuration = 60 / effectiveBpm / 4;

    if (this.nextNoteTime < ctx.currentTime - 0.25) {
      this.nextNoteTime = ctx.currentTime + 0.04;
    }

    while (this.nextNoteTime < ctx.currentTime + 0.18) {
      this.scheduleStep(ctx, comp, this.stepIndex, this.nextNoteTime, stepDuration);
      this.nextNoteTime += stepDuration;
      this.stepIndex = (this.stepIndex + 1) % 32;
    }
  }

  private scheduleStep(
    ctx: AudioContext,
    comp: TrackComposition,
    step: number,
    time: number,
    stepDur: number,
  ) {
    const drumDest = this.drumBus ?? this.busComp!;
    const guitarDest = this.guitarDistBus ?? this.busComp!;
    const bassDest = this.subBassBus ?? this.busComp!;
    const noiseBuf = soundEngine.getNoiseBuffer();

    // 1. Punchy Layered Rock/Breakbeat Kick Drum (plus double-kick tension at Heat 3+)
    const extraPursuitKick = this.pursuitActive && this.heatLevel >= 3 && (step % 16 === 7 || step % 16 === 15);
    if (comp.kickSteps[step] || extraPursuitKick) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(118, time);
      osc.frequency.exponentialRampToValueAtTime(36, time + 0.12);
      g.gain.setValueAtTime(extraPursuitKick ? 0.28 : 0.44, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
      osc.connect(g);
      g.connect(drumDest);
      osc.start(time);
      osc.stop(time + 0.17);

      // Beater click transient so kick cuts cleanly through sub bass
      const click = ctx.createOscillator();
      const cg = ctx.createGain();
      click.type = 'triangle';
      click.frequency.setValueAtTime(240, time);
      click.frequency.exponentialRampToValueAtTime(68, time + 0.025);
      cg.gain.setValueAtTime(0.22, time);
      cg.gain.exponentialRampToValueAtTime(0.001, time + 0.028);
      click.connect(cg);
      cg.connect(drumDest);
      click.start(time);
      click.stop(time + 0.032);
    }

    // 2. Heavy Compressed Rock Snare
    if (comp.snareSteps[step] && noiseBuf) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const filt = ctx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.value = 1850;
      filt.Q.value = 0.9;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.28, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
      src.connect(filt);
      filt.connect(g);
      g.connect(drumDest);
      src.start(time);
      src.stop(time + 0.15);

      const body = ctx.createOscillator();
      const bg = ctx.createGain();
      body.type = 'triangle';
      body.frequency.setValueAtTime(185, time);
      body.frequency.exponentialRampToValueAtTime(92, time + 0.08);
      bg.gain.setValueAtTime(0.24, time);
      bg.gain.exponentialRampToValueAtTime(0.001, time + 0.10);
      body.connect(bg);
      bg.connect(drumDest);
      body.start(time);
      body.stop(time + 0.11);
    }

    // 3. Aggressive Crash Cymbal on downbeats/turnarounds
    if (comp.crashSteps[step] && noiseBuf) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 3800;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.14, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.42);
      src.connect(hp);
      hp.connect(g);
      g.connect(drumDest);
      src.start(time);
      src.stop(time + 0.44);
    }

    // 4. Driving Metallic Hi-Hat Groove
    if ((comp.hatSteps[step] || (this.pursuitActive && this.heatLevel >= 3)) && noiseBuf) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const filt = ctx.createBiquadFilter();
      filt.type = 'highpass';
      filt.frequency.value = 6800;
      const g = ctx.createGain();
      const vol = comp.hatSteps[step] ? 0.08 : 0.04;
      g.gain.setValueAtTime(vol, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.042);
      src.connect(filt);
      filt.connect(g);
      g.connect(drumDest);
      src.start(time);
      src.stop(time + 0.05);
    }

    // 5. Drop-Tuned Distorted Power-Chord Guitar Stack (Root + Fifth + Octave detuned)
    const riffMidi = comp.riffSteps[step];
    const art = comp.riffArt[step] ?? 'pm';
    if (riffMidi > 0) {
      const chordIntervals = art === 'accent' ? [0, 7, 12] : [0, 7];
      const durMult = art === 'pm' ? 0.62 : art === 'open' ? 1.55 : 1.85;
      const cutoff =
        (art === 'pm' ? comp.riffCutoff * 0.65 : comp.riffCutoff) *
        (this.pursuitActive ? 1.25 : 1.0);

      const chordFilter = ctx.createBiquadFilter();
      chordFilter.type = 'lowpass';
      chordFilter.frequency.setValueAtTime(cutoff, time);
      chordFilter.frequency.exponentialRampToValueAtTime(Math.max(420, cutoff * 0.38), time + stepDur * durMult);
      chordFilter.Q.value = 1.6;

      const env = ctx.createGain();
      const peakGain = art === 'pm' ? 0.11 : art === 'accent' ? 0.16 : 0.135;
      env.gain.setValueAtTime(0.002, time);
      env.gain.linearRampToValueAtTime(peakGain, time + 0.006);
      env.gain.exponentialRampToValueAtTime(0.001, time + stepDur * durMult);

      chordFilter.connect(env);
      env.connect(guitarDest);

      for (let i = 0; i < chordIntervals.length; i++) {
        const freq = midiToHz(riffMidi + chordIntervals[i]);
        const oscA = ctx.createOscillator();
        oscA.type = 'sawtooth';
        oscA.frequency.setValueAtTime(freq, time);
        oscA.detune.setValueAtTime(i === 0 ? -7 : 5, time);
        oscA.connect(chordFilter);
        oscA.start(time);
        oscA.stop(time + stepDur * durMult + 0.02);

        if (i === 0) {
          // Thick doubled tracking oscillator on root
          const oscB = ctx.createOscillator();
          oscB.type = 'sawtooth';
          oscB.frequency.setValueAtTime(freq, time);
          oscB.detune.setValueAtTime(7, time);
          oscB.connect(chordFilter);
          oscB.start(time);
          oscB.stop(time + stepDur * durMult + 0.02);
        }
      }
    }

    // 6. Deep Detuned Reese / Drop Sub-Bass
    const bassMidi = comp.bassSteps[step];
    if (bassMidi > 0) {
      const f = midiToHz(bassMidi);
      const dur = stepDur * 1.15;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.002, time);
      g.gain.linearRampToValueAtTime(0.24, time + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, time + dur);
      g.connect(bassDest);

      const sub1 = ctx.createOscillator();
      sub1.type = 'sawtooth';
      sub1.frequency.setValueAtTime(f, time);
      sub1.detune.setValueAtTime(-9, time);
      sub1.connect(g);
      sub1.start(time);
      sub1.stop(time + dur + 0.02);

      const sub2 = ctx.createOscillator();
      sub2.type = comp.subMode === 'electro' ? 'square' : 'triangle';
      sub2.frequency.setValueAtTime(f, time);
      sub2.detune.setValueAtTime(9, time);
      sub2.connect(g);
      sub2.start(time);
      sub2.stop(time + dur + 0.02);
    }

    // 7. Aggressive Industrial / Electro Counter-Hook (routed through guitar overdrive at lower register)
    const hookMidi = comp.hookSteps[step];
    if (hookMidi > 0) {
      const hookOsc = ctx.createOscillator();
      hookOsc.type = comp.subMode === 'electro' ? 'sawtooth' : 'square';
      hookOsc.frequency.setValueAtTime(midiToHz(hookMidi), time);

      const lp = ctx.createBiquadFilter();
      lp.type = 'bandpass';
      lp.frequency.setValueAtTime(1450 + (this.pursuitActive ? 550 : 0), time);
      lp.Q.value = 1.4;

      const hg = ctx.createGain();
      const vol = this.pursuitActive ? 0.085 : 0.055;
      hg.gain.setValueAtTime(0.002, time);
      hg.gain.linearRampToValueAtTime(vol, time + 0.01);
      hg.gain.exponentialRampToValueAtTime(0.001, time + stepDur * 1.35);

      hookOsc.connect(lp);
      lp.connect(hg);
      hg.connect(guitarDest);
      hookOsc.start(time);
      hookOsc.stop(time + stepDur * 1.4);
    }

    // 8. Pursuit Siren-Harmonic Industrial Pulse (Heat 2+)
    if (this.pursuitActive && this.heatLevel >= 2 && (step % 8 === 0) && riffMidi > 0) {
      const stab = ctx.createOscillator();
      stab.type = 'sawtooth';
      stab.frequency.setValueAtTime(midiToHz(riffMidi + 19), time); // gritty fifth above octave
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.032 + Math.min(0.032, this.heatLevel * 0.006), time);
      sg.gain.exponentialRampToValueAtTime(0.001, time + stepDur * 2.2);
      stab.connect(sg);
      sg.connect(guitarDest);
      stab.start(time);
      stab.stop(time + stepDur * 2.3);
    }
  }
}

export const musicEngine = new MusicEngine();
