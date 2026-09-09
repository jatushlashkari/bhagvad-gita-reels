import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { validateBeatsFile } from '../shared/beats.ts';

describe('sources/beats.json', () => {
  it('exists, validates, and covers at least 100 verses', () => {
    const beats = JSON.parse(readFileSync('sources/beats.json', 'utf8'));
    const gita = JSON.parse(readFileSync('sources/gita.json', 'utf8'));
    const refs = new Set<string>(gita.verses.map((v: { ref: string }) => v.ref));
    expect(() => validateBeatsFile(beats, refs)).not.toThrow();
    expect(Object.keys(beats).length).toBeGreaterThanOrEqual(100);
  });

  it('flagship verses are covered', () => {
    const beats = JSON.parse(readFileSync('sources/beats.json', 'utf8'));
    for (const ref of ['gita:2:47', 'gita:2:62', 'gita:2:63', 'gita:4:7', 'gita:4:8', 'gita:18:66', 'gita:2:14', 'gita:6:5', 'gita:2:20', 'gita:12:15'])
      expect(beats[ref], `${ref} missing`).toBeDefined();
  });
});
