export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

import type { ReelStyle } from './reel-style.ts';

export type Verse = {
  book: string;                // 'gita'
  ref: string;                 // 'gita:2:47'
  chapter: number;
  verse: number;
  sanskrit: string[];          // shloka lines for line-by-line reveal
  hindi: string;               // meaning (narrated + shown)
  english: string;             // meaning (shown only)
  attribution: { hindi: string; english: string };
};

export type Timings = {
  titleSec: number;
  shlokaStartSec: number;
  shlokaSec: number;
  meaningStartSec: number;
  meaningSec: number;
  englishStartSec: number;
  englishSec: number;
  outroStartSec: number;
  outroSec: number;
  totalSec: number;
  introAudioStartSec: number;   // when intro VO starts (= shlokaStartSec)
  meaningAudioStartSec: number; // when meaning VO starts (= meaningStartSec)
};

export type CinemaTimings = {
  kickerInSec: number;
  crossfadeSec: number;
  beats: { startSec: number; durSec: number }[];
  closingStartSec: number;
  closingSec: number;
  totalSec: number;
};

export type ReelProps = {
  verse: Verse;
  timings: Timings;
  audio: { introFile: string | null; meaningFile: string | null }; // staticFile()-relative, null = silent
  media: { background: string | null; music: string | null };      // null = gradient / no music
  brand: { handle: string };
  format?: 'classic' | 'cinema';
  cinema?: { kicker: string; beats: string[]; timings: CinemaTimings; closing?: { line: string; reference: string } };
  style?: ReelStyle;
};
