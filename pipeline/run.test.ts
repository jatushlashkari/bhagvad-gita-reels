import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, resolveCinemaInputs, loadStylePreset } from './run.ts';
import { DEFAULT_STYLE } from '../shared/reel-style.ts';

describe('parseArgs', () => {
  it('parses verse override and dry-run flag', () => {
    expect(parseArgs(['--verse', 'gita:2:47', '--dry-run'])).toEqual({ verse: 'gita:2:47', dryRun: true });
  });

  it('defaults to no override, live mode', () => {
    expect(parseArgs([])).toEqual({ dryRun: false });
  });

  it('rejects malformed verse refs', () => {
    expect(() => parseArgs(['--verse', '2.47'])).toThrow(/format/);
  });

  it('parses a background override', () => {
    expect(parseArgs(['--background', 'krishna.jpg'])).toEqual({ dryRun: false, background: 'krishna.jpg' });
  });

  it('parses a format override', () => {
    expect(parseArgs(['--format', 'cinema'])).toEqual({ dryRun: false, format: 'cinema' });
  });

  it('rejects unknown formats', () => {
    expect(() => parseArgs(['--format', 'fancy'])).toThrow(/classic|cinema/);
  });

  it('parseArgs accepts --overrides path', () => {
    expect(parseArgs(['--overrides', 'out/o.json'])).toEqual({ dryRun: false, overrides: 'out/o.json' });
  });
});

describe('resolveCinemaInputs', () => {
  const base = { verse: undefined, dryRun: true, background: undefined, format: 'cinema' as const, overrides: undefined };

  it('precedence: overrides beats > curated > fallback', () => {
    const r = resolveCinemaInputs(base, ['Curated one.', 'Curated two.'], 'Plain english sentence. Another.', DEFAULT_STYLE, { beats: ['Override A.', 'Override B.'] }, [], 'gita:2:47');
    expect(r.beats).toEqual(['Override A.', 'Override B.']);
    const r2 = resolveCinemaInputs(base, ['Curated one.', 'Curated two.'], 'x. y.', DEFAULT_STYLE, null, [], 'gita:2:47');
    expect(r2.beats[0]).toBe('Curated one.');
    const r3 = resolveCinemaInputs(base, undefined, 'Plain english sentence. Another.', DEFAULT_STYLE, null, [], 'gita:2:47');
    expect(r3.usedFallbackBeats).toBe(true);
  });

  it('style merge clamps junk override on top of preset', () => {
    const preset = { ...DEFAULT_STYLE, beatSizePx: 72 };
    const r = resolveCinemaInputs(base, undefined, 'x. y.', preset, { style: { beatSizePx: 400, kenBurns: 'wild' } }, [], 'gita:1:1');
    expect(r.style.beatSizePx).toBe(96);
    expect(r.style.kenBurns).toBe('gentle');
  });

  it('music: silent mode → null; track present → file; track missing → null (warn); rotation → deterministic pick; override music wins incl. explicit null', () => {
    const pool = ['a.mp3', 'b.mp3'];
    expect(resolveCinemaInputs(base, undefined, 'x. y.', { ...DEFAULT_STYLE, musicMode: 'silent' }, null, pool, 'gita:1:1').music).toBeNull();
    expect(resolveCinemaInputs(base, undefined, 'x. y.', { ...DEFAULT_STYLE, musicMode: 'track', musicFile: 'a.mp3' }, null, pool, 'gita:1:1').music).toBe('a.mp3');
    expect(resolveCinemaInputs(base, undefined, 'x. y.', { ...DEFAULT_STYLE, musicMode: 'track', musicFile: 'gone.mp3' }, null, pool, 'gita:1:1').music).toBeNull();
    expect(pool).toContain(resolveCinemaInputs(base, undefined, 'x. y.', { ...DEFAULT_STYLE, musicMode: 'rotation' }, null, pool, 'gita:1:1').music);
    expect(resolveCinemaInputs(base, undefined, 'x. y.', { ...DEFAULT_STYLE, musicMode: 'rotation' }, { music: null }, pool, 'gita:1:1').music).toBeNull();
  });

  it('override beat exceeding 90 chars throws, naming the offending beat', () => {
    const tooLong = 'x'.repeat(91);
    expect(() =>
      resolveCinemaInputs(base, undefined, 'x. y.', DEFAULT_STYLE, { beats: ['Fine.', tooLong] }, [], 'gita:1:1'),
    ).toThrow(/xxxxxxxxxx/);
  });

  it('override beat containing emoji throws, naming the offending beat', () => {
    expect(() =>
      resolveCinemaInputs(base, undefined, 'x. y.', DEFAULT_STYLE, { beats: ['Nice beat 🙏.'] }, [], 'gita:1:1'),
    ).toThrow(/Nice beat/);
  });

  it('override beats exceeding 6 entries throws', () => {
    const seven = Array.from({ length: 7 }, (_, i) => `Beat ${i}.`);
    expect(() =>
      resolveCinemaInputs(base, undefined, 'x. y.', DEFAULT_STYLE, { beats: seven }, [], 'gita:1:1'),
    ).toThrow(/max 6/);
  });

  it('override beats: [] is treated as absent, falling through to curated/fallback', () => {
    const r = resolveCinemaInputs(base, ['Curated one.', 'Curated two.'], 'x. y.', DEFAULT_STYLE, { beats: [] }, [], 'gita:1:1');
    expect(r.beats).toEqual(['Curated one.', 'Curated two.']);
    expect(r.usedFallbackBeats).toBe(false);

    const r2 = resolveCinemaInputs(base, undefined, 'Plain english sentence. Another.', DEFAULT_STYLE, { beats: [] }, [], 'gita:1:1');
    expect(r2.usedFallbackBeats).toBe(true);
  });

  it('override music string not present in musicPool → warn + null (not a throw)', () => {
    const r = resolveCinemaInputs(base, undefined, 'x. y.', DEFAULT_STYLE, { music: 'missing.mp3' }, ['a.mp3'], 'gita:1:1');
    expect(r.music).toBeNull();
  });
});

describe('loadStylePreset', () => {
  it('absent file → DEFAULT_STYLE', () => {
    const dir = mkdtempSync(join(tmpdir(), 'style-'));
    expect(loadStylePreset(join(dir, 'nope.json'))).toEqual(DEFAULT_STYLE);
  });

  it('malformed JSON → DEFAULT_STYLE, does not throw', () => {
    const dir = mkdtempSync(join(tmpdir(), 'style-'));
    const file = join(dir, 'cinema.json');
    writeFileSync(file, '{{{not json');
    expect(() => loadStylePreset(file)).not.toThrow();
    expect(loadStylePreset(file)).toEqual(DEFAULT_STYLE);
  });

  it('valid JSON → validated style, unspecified fields defaulted', () => {
    const dir = mkdtempSync(join(tmpdir(), 'style-'));
    const file = join(dir, 'cinema.json');
    writeFileSync(file, JSON.stringify({ beatSizePx: 72 }));
    const style = loadStylePreset(file);
    expect(style.beatSizePx).toBe(72);
    expect(style).toEqual({ ...DEFAULT_STYLE, beatSizePx: 72 });
  });
});
