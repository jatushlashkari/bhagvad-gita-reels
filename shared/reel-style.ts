import { BEAT_FONTS, KICKER_FONTS, type BeatFont, type KickerFont } from './font-map.ts';

export type ReelStyle = {
  beatFont: BeatFont;
  kickerFont: KickerFont;
  beatSizePx: number;
  textColor: string;
  accentColor: string;
  scrimStrength: number;
  durationScale: number;
  crossfadeSec: number;
  transition: 'crossfade' | 'sequential';
  gapSec: number;
  kenBurns: 'off' | 'gentle' | 'strong';
  showKicker: boolean;
  showHandle: boolean;
  musicMode: 'silent' | 'track' | 'rotation';
  musicFile: string | null;
  promptPrefix: string;
};

export const PROMPT_PREFIX_MAX = 200;

export const DEFAULT_STYLE: ReelStyle = {
  beatFont: 'display', kickerFont: 'serif', beatSizePx: 64, textColor: '#ffffff', accentColor: '#e8c874',
  scrimStrength: 0.45, durationScale: 1, crossfadeSec: 0.35, transition: 'crossfade', gapSec: 0.4, kenBurns: 'gentle',
  showKicker: true, showHandle: true, musicMode: 'silent', musicFile: null,
  promptPrefix: 'Cinematic devotional painting, ultra-detailed, richly coloured, no text —',
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (v: unknown, d: number, lo: number, hi: number) =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : d;
const oneOf = <T extends string>(v: unknown, opts: readonly T[], d: T): T =>
  typeof v === 'string' && (opts as readonly string[]).includes(v) ? (v as T) : d;
const color = (v: unknown, d: string) =>
  typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : d;
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

export function validateStyle(s: unknown): ReelStyle {
  const o = (s && typeof s === 'object' && !Array.isArray(s) ? s : {}) as Record<string, unknown>;
  return {
    beatFont: oneOf(o.beatFont, BEAT_FONTS, DEFAULT_STYLE.beatFont),
    kickerFont: oneOf(o.kickerFont, KICKER_FONTS, DEFAULT_STYLE.kickerFont),
    beatSizePx: num(o.beatSizePx, DEFAULT_STYLE.beatSizePx, 40, 96),
    textColor: color(o.textColor, DEFAULT_STYLE.textColor),
    accentColor: color(o.accentColor, DEFAULT_STYLE.accentColor),
    scrimStrength: num(o.scrimStrength, DEFAULT_STYLE.scrimStrength, 0, 1),
    durationScale: num(o.durationScale, DEFAULT_STYLE.durationScale, 0.7, 1.5),
    crossfadeSec: num(o.crossfadeSec, DEFAULT_STYLE.crossfadeSec, 0.2, 0.8),
    transition: oneOf(o.transition, ['crossfade', 'sequential'] as const, DEFAULT_STYLE.transition),
    gapSec: num(o.gapSec, DEFAULT_STYLE.gapSec, 0, 1.5),
    kenBurns: oneOf(o.kenBurns, ['off', 'gentle', 'strong'] as const, DEFAULT_STYLE.kenBurns),
    showKicker: bool(o.showKicker, true),
    showHandle: bool(o.showHandle, true),
    musicMode: oneOf(o.musicMode, ['silent', 'track', 'rotation'] as const, DEFAULT_STYLE.musicMode),
    musicFile: typeof o.musicFile === 'string' && o.musicFile.length <= 200 ? o.musicFile : null,
    promptPrefix: typeof o.promptPrefix === 'string' ? o.promptPrefix.trim().slice(0, PROMPT_PREFIX_MAX) : DEFAULT_STYLE.promptPrefix,
  };
}
