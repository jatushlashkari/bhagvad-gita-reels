import { describe, it, expect } from 'vitest';
import { parseArgs, resolveCinemaInputs } from './run.ts';
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
});
