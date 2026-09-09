import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDotenv, parseDotenv, readSchedule, resolveVerse, secretsFor, writeSchedule } from './schedule-io.ts';
import type { ScheduleFile } from '../shared/schedule.ts';
import type { CustomQuote } from '../shared/custom-quotes.ts';
import type { Verse } from '../shared/types.ts';

const tmp = (prefix: string) => mkdtempSync(join(tmpdir(), prefix));

const verse: Verse = {
  book: 'gita', ref: 'gita:2:47', chapter: 2, verse: 47, sanskrit: ['कर्मण्येवाधिकारस्ते'],
  hindi: 'तुम्हारा अधिकार कर्म पर है।', english: 'You have a right to work.', attribution: { hindi: 'h', english: 'e' },
};
const quote: CustomQuote = {
  id: 'abc', lines: ['Do the work.', 'Release the outcome.'], attribution: 'Meera Bai', kicker: 'k',
  prompt: '', createdAt: '2026-09-09T00:00:00.000Z',
};
const item = {
  id: 'gita-2-47-20260912-a1b2', ref: 'gita:2:47', format: 'cinema' as const, hook: 'Do the work.',
  renderedAt: '2026-09-09T00:00:00.000Z', asset: { releaseTag: 'reel-gita-2-47', url: 'https://example.com/r.mp4' },
  thumbnail: 'thumbs/gita-2-47-20260912-a1b2.jpg', credits: ['credit A'],
  posts: {
    instagram: { at: '2026-09-12T01:30:00.000Z', status: 'scheduled' as const, caption: 'ig' },
    facebook: { at: '2026-09-12T01:35:00.000Z', status: 'scheduled' as const, caption: 'fb' },
    youtube: { at: '2026-09-12T01:40:00.000Z', status: 'scheduled' as const, caption: 'yt', title: 't' },
  },
};

describe('parseDotenv', () => {
  it('reads KEY=VALUE, strips quotes, ignores comments and blank lines, keeps = inside values', () => {
    expect(parseDotenv(`A=1\n# c\nB="two words"\nC='x'\n\nD=e=f`)).toEqual({ A: '1', B: 'two words', C: 'x', D: 'e=f' });
  });
});

describe('loadDotenv', () => {
  it('sets missing keys and never overrides what the environment already has', () => {
    const dir = tmp('dotenv-');
    const path = join(dir, '.env');
    writeFileSync(path, 'FB_PAGE_ID=from-file\nIG_USER_ID=also-from-file\n');
    const env = { FB_PAGE_ID: 'from-env' } as NodeJS.ProcessEnv;
    loadDotenv(path, env);
    expect(env.FB_PAGE_ID).toBe('from-env');
    expect(env.IG_USER_ID).toBe('also-from-file');
  });

  it('is a no-op when the file is absent', () => {
    const env = {} as NodeJS.ProcessEnv;
    loadDotenv(join(tmp('dotenv-'), '.env'), env);
    expect(env).toEqual({});
  });
});

describe('secretsFor', () => {
  it('lists what is missing per platform', () => {
    expect(secretsFor('facebook', {})).toEqual({ ok: false, missing: ['FB_PAGE_ID', 'FB_PAGE_ACCESS_TOKEN'] });
    expect(secretsFor('youtube', { YT_CLIENT_ID: 'a' })).toEqual({ ok: false, missing: ['YT_CLIENT_SECRET', 'YT_REFRESH_TOKEN'] });
    expect(secretsFor('instagram', { IG_USER_ID: 'a', IG_ACCESS_TOKEN: 'b' })).toEqual({ ok: true });
  });

  it('treats an empty value as missing (CI passes absent secrets as empty strings)', () => {
    expect(secretsFor('instagram', { IG_USER_ID: 'a', IG_ACCESS_TOKEN: '' })).toEqual({ ok: false, missing: ['IG_ACCESS_TOKEN'] });
  });
});

describe('schedule file IO', () => {
  it('an absent file reads as an empty calendar', async () => {
    expect(await readSchedule(join(tmp('sched-'), 'schedule.json'))).toEqual({ items: [] });
  });

  it('malformed JSON throws — the calendar is the source of truth', async () => {
    const path = join(tmp('sched-'), 'schedule.json');
    writeFileSync(path, '{ "items": [');
    await expect(readSchedule(path)).rejects.toThrow();
  });

  it('a structurally invalid item throws with the validator message', async () => {
    const path = join(tmp('sched-'), 'schedule.json');
    writeFileSync(path, JSON.stringify({ items: [{ ...item, posts: { instagram: item.posts.instagram } }] }));
    await expect(readSchedule(path)).rejects.toThrow(/posts\.facebook missing/);
  });

  it('round-trips through write → read, 2-space indented with a trailing newline', async () => {
    const path = join(tmp('sched-'), 'schedule.json');
    const file: ScheduleFile = { items: [item] };
    await writeSchedule(path, file);
    const raw = readFileSync(path, 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw).toContain('\n  "items": [');
    expect(await readSchedule(path)).toEqual(file);
  });
});

describe('resolveVerse', () => {
  const sources = { verses: [verse] };

  it('finds a source verse and builds a placeholder for a custom quote', () => {
    expect(resolveVerse('gita:2:47', sources, [])).toEqual(verse);
    const placeholder = resolveVerse('custom:abc', sources, [quote]);
    expect(placeholder.ref).toBe('custom:abc');
    expect(placeholder.book).toBe('custom');
    expect(placeholder.english).toBe('Do the work. Release the outcome.');
  });

  it('throws on an unknown ref or an unknown custom id', () => {
    expect(() => resolveVerse('gita:9:9', sources, [])).toThrow(/gita:9:9/);
    expect(() => resolveVerse('custom:nope', sources, [quote])).toThrow(/nope/);
  });
});
