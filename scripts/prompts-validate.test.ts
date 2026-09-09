import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { NO_EMOJI } from '../shared/beats.ts';

describe('sources/prompts.json', () => {
  const prompts = JSON.parse(readFileSync('sources/prompts.json', 'utf8')) as Record<string, string>;
  const beats = JSON.parse(readFileSync('sources/beats.json', 'utf8')) as Record<string, string[]>;
  const verses = new Set(
    (JSON.parse(readFileSync('sources/gita.json', 'utf8')) as { verses: { ref: string }[] }).verses.map((v) => v.ref),
  );

  it('covers every curated-beat verse and only real verses', () => {
    for (const ref of Object.keys(beats)) expect(prompts[ref], `${ref} missing prompt`).toBeTypeOf('string');
    for (const ref of Object.keys(prompts)) expect(verses.has(ref), `${ref} is not a verse`).toBe(true);
  });
  it('every prompt obeys the rules (60-300 chars, no emoji, no on-image text instructions)', () => {
    for (const [ref, p] of Object.entries(prompts)) {
      expect(p.length, ref).toBeGreaterThanOrEqual(60);
      expect(p.length, ref).toBeLessThanOrEqual(300);
      expect(NO_EMOJI.test(p), ref).toBe(false);
      expect(p, ref).not.toMatch(/\b(text|caption|typography|lettering|title|words|subtitle)\b/i);
    }
  });
  it('prompts are not copy-pasted across verses', () => {
    expect(new Set(Object.values(prompts)).size).toBe(Object.keys(prompts).length);
  });
});
