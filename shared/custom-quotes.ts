import { BEAT_MAX, BEAT_MAX_CHARS, BEAT_MIN, NO_EMOJI } from './beats.ts';
import type { Verse } from './types.ts';

export type CustomQuote = { id: string; lines: string[]; attribution: string; kicker: string; prompt: string; createdAt: string };
export const CUSTOM_REF_PREFIX = 'custom:';
export const CUSTOM_ID = /^[a-z0-9][a-z0-9-]{2,47}$/;
export const REF_PATTERN = /^(?:[a-z]+:\d+:\d+|custom:[a-z0-9][a-z0-9-]{2,47})$/;
export const DEFAULT_ATTRIBUTION = 'श्रीकृष्ण';
export const DEFAULT_KICKER = 'श्रीकृष्ण कहते हैं';
export const ATTRIBUTION_MAX = 60;
export const KICKER_MAX = 30;
export const PROMPT_MAX = 300;

export const customRef = (id: string) => `${CUSTOM_REF_PREFIX}${id}`;

export function slugId(firstLine: string, rand: string): string {
  const base = firstLine.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').trim().replace(/[\s-]+/g, '-').slice(0, 32).replace(/-+$/, '');
  return `${base || 'quote'}-${rand}`;
}

const rand4 = () => Math.random().toString(36).slice(2, 6).padEnd(4, '0');

function checkText(label: string, v: unknown, max: number, fallback: string): string {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v !== 'string') throw new Error(`${label} must be a string`);
  const s = v.trim();
  if (s.length > max) throw new Error(`${label} exceeds ${max} chars`);
  if (NO_EMOJI.test(s)) throw new Error(`${label} contains emoji`);
  return s;
}

export function customQuoteProblem(q: { lines: string[]; attribution: string; kicker: string; prompt: string }): string | null {
  const lines = q.lines.map((l) => l.trim());
  if (lines.some((l) => !l)) return 'every line needs text';
  if (lines.length < BEAT_MIN || lines.length > BEAT_MAX) return `${BEAT_MIN}-${BEAT_MAX} lines`;
  if (lines.some((l) => l.length > BEAT_MAX_CHARS)) return `lines are capped at ${BEAT_MAX_CHARS} characters`;
  if (lines.some((l) => NO_EMOJI.test(l))) return 'emoji are not allowed on screen';
  if (q.attribution.trim().length > ATTRIBUTION_MAX) return `attribution is capped at ${ATTRIBUTION_MAX} characters`;
  if (NO_EMOJI.test(q.attribution)) return 'attribution: emoji are not allowed on screen';
  if (q.kicker.trim().length > KICKER_MAX) return `kicker is capped at ${KICKER_MAX} characters`;
  if (NO_EMOJI.test(q.kicker)) return 'kicker: emoji are not allowed on screen';
  if (q.prompt.trim().length > PROMPT_MAX) return `prompt is capped at ${PROMPT_MAX} characters`;
  return null;
}

export function validateCustomQuote(input: unknown, existingIds: string[], now: Date = new Date()): CustomQuote {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('custom quote must be an object');
  const o = input as Record<string, unknown>;
  if (!Array.isArray(o.lines) || !o.lines.every((l) => typeof l === 'string')) throw new Error('lines must be an array of strings');
  const lines = (o.lines as string[]).map((l) => l.trim());
  if (lines.length < BEAT_MIN || lines.length > BEAT_MAX) throw new Error(`${BEAT_MIN}-${BEAT_MAX} lines required, got ${lines.length}`);
  for (const l of lines) {
    if (!l) throw new Error('empty line');
    if (l.length > BEAT_MAX_CHARS) throw new Error(`line exceeds ${BEAT_MAX_CHARS} chars: "${l.slice(0, 40)}…"`);
    if (NO_EMOJI.test(l)) throw new Error(`emoji not allowed on screen: "${l}"`);
  }
  const attribution = checkText('attribution', o.attribution, ATTRIBUTION_MAX, DEFAULT_ATTRIBUTION);
  const kicker = checkText('kicker', o.kicker, KICKER_MAX, DEFAULT_KICKER);
  const prompt = checkText('prompt', o.prompt, PROMPT_MAX, '');
  let id: string;
  if (o.id !== undefined && o.id !== null && o.id !== '') {
    if (typeof o.id !== 'string' || !CUSTOM_ID.test(o.id)) throw new Error('id must be a slug: 3-48 chars of a-z, 0-9, -');
    id = o.id;
  } else {
    id = slugId(lines[0], rand4());
  }
  if (existingIds.includes(id)) throw new Error(`a custom quote with id "${id}" already exists`);
  const createdAt = typeof o.createdAt === 'string' && !Number.isNaN(Date.parse(o.createdAt)) ? o.createdAt : now.toISOString();
  return { id, lines, attribution, kicker, prompt, createdAt };
}

export function placeholderVerse(q: CustomQuote): Verse {
  return {
    book: 'custom', ref: customRef(q.id), chapter: 0, verse: 0, sanskrit: [q.attribution], hindi: '',
    english: q.lines.join(' '), attribution: { hindi: '', english: 'custom quote' },
  };
}
