import { describe, it, expect } from 'vitest';
import { beatsFromTranslation, validateBeatsFile, beatDurationSec } from './beats.ts';

describe('beatDurationSec', () => {
  it('applies clamp(1.8 + chars/16, 2.4, 4.2)', () => {
    expect(beatDurationSec('x'.repeat(16))).toBeCloseTo(2.8, 5); // 1.8 + 1
    expect(beatDurationSec('hi')).toBe(2.4);                     // clamped low
    expect(beatDurationSec('x'.repeat(80))).toBe(4.2);           // clamped high
  });
});

describe('beatsFromTranslation', () => {
  it('splits sentences, strips vocatives, caps at 5', () => {
    const b = beatsFromTranslation(
      'O Arjuna, your right is to work only. Never to its fruits. Do not let results be your motive. Nor attach to inaction. Stand firm in yoga. Abandon attachment.',
    );
    expect(b).toHaveLength(5);
    expect(b[0]).toBe('Your right is to work only.');
  });

  it('splits a single sentence at its natural midpoint to reach 2 beats', () => {
    const b = beatsFromTranslation('The wise grieve neither for the living, nor for the dead.');
    expect(b).toHaveLength(2);
    expect(b[0].endsWith(',') || b[0].endsWith('.')).toBe(true);
    expect(b[1].length).toBeGreaterThan(0);
  });

  it('single sentence without punctuation splits at middle word boundary', () => {
    const b = beatsFromTranslation('He who sees inaction in action truly sees');
    expect(b).toHaveLength(2);
    expect(b.join(' ').replace(/[.]/g, '')).toContain('inaction in action');
  });

  it('trims long sentences at a word boundary to <=90 chars with ellipsis', () => {
    const long = 'This sentence is deliberately stretched with many additional words so that it comfortably exceeds the ninety character limit imposed on beats.';
    const b = beatsFromTranslation(long + ' Second sentence.');
    expect(b[0].length).toBeLessThanOrEqual(90);
    expect(b[0].endsWith('…')).toBe(true);
    expect(b[0]).not.toMatch(/\s…$/);
  });

  it('ensures terminal punctuation and capitalized first letter', () => {
    const b = beatsFromTranslation('the mind is restless. hard to control');
    for (const line of b) {
      expect(line[0]).toBe(line[0].toUpperCase());
      expect(/[.!?…,]$/.test(line)).toBe(true);
    }
  });
});

describe('validateBeatsFile', () => {
  const refs = new Set(['gita:2:47']);
  it('accepts a valid file', () => {
    expect(() => validateBeatsFile({ 'gita:2:47': ['Do the work.', 'Release the outcome.'] }, refs)).not.toThrow();
  });
  it('rejects unknown refs, wrong counts, long lines, emoji', () => {
    expect(() => validateBeatsFile({ 'gita:9:99': ['a.', 'b.'] }, refs)).toThrow(/unknown ref/);
    expect(() => validateBeatsFile({ 'gita:2:47': ['only one.'] }, refs)).toThrow(/2-6/);
    expect(() => validateBeatsFile({ 'gita:2:47': ['a.'.repeat(60), 'b.'] }, refs)).toThrow(/90/);
    expect(() => validateBeatsFile({ 'gita:2:47': ['ok line.', 'bad 🙏.'] }, refs)).toThrow(/emoji/);
  });
});
