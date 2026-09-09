import { describe, it, expect } from 'vitest';
import { CHAPTER_THEMES, GENERIC_THEME, motif, promptBody, promptFor } from './prompts.ts';

describe('prompts', () => {
  it('has a theme for all 18 chapters', () => {
    for (let c = 1; c <= 18; c++) expect(CHAPTER_THEMES[c].length).toBeGreaterThan(20);
  });
  it('motif keeps 2-4 content words from a hook and drops stop words', () => {
    const m = motif('Do the work. Release the outcome.');
    expect(m.split(', ').length).toBeLessThanOrEqual(4);
    expect(m).toMatch(/work/);
    expect(m).toMatch(/release/);
    expect(m).not.toMatch(/\bthe\b/);
    expect(motif('कर्म करो')).toBe('');
  });
  it('curated body wins; fallback is theme + motif; unknown chapter uses the generic theme', () => {
    expect(promptBody(2, 'x', 'Arjuna kneeling.')).toBe('Arjuna kneeling.');
    expect(promptBody(2, 'Do the work.', null).startsWith(CHAPTER_THEMES[2])).toBe(true);
    expect(promptBody(0, 'Do the work.', undefined).startsWith(GENERIC_THEME)).toBe(true);
    expect(promptBody(0, 'कर्म करो', undefined)).toBe(GENERIC_THEME); // empty motif → no dangling comma
  });
  it('promptFor is deterministic and prefixed', () => {
    expect(promptFor(2, 'x', 'Arjuna kneeling.', 'PREFIX —')).toBe('PREFIX — Arjuna kneeling.');
    expect(promptFor(2, 'x', 'Arjuna kneeling.', '')).toBe('Arjuna kneeling.');
    const a = promptFor(2, 'Do the work. Release the outcome.', undefined, 'P —');
    expect(a).toBe(promptFor(2, 'Do the work. Release the outcome.', undefined, 'P —'));
    expect(a).toMatch(/work/);
  });
});
