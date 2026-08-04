import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listBackgroundPool, resolveBackground, kenBurnsVariant } from './backgrounds.ts';

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'pool-'));
  mkdirSync(join(root, 'public/assets/backgrounds'), { recursive: true });
  mkdirSync(join(root, 'public/assets/images'), { recursive: true });
  for (const f of ['b.mp4', 'a.mp4', 'skip.txt']) writeFileSync(join(root, 'public/assets/backgrounds', f), '');
  for (const f of ['k.jpg', 'z.webp', 'skip.mov']) writeFileSync(join(root, 'public/assets/images', f), '');
  return root;
}

describe('listBackgroundPool', () => {
  it('merges clips and images, sorted by rel, filtering junk', () => {
    const pool = listBackgroundPool(fixtureRoot());
    expect(pool.map((p) => p.rel)).toEqual([
      'assets/backgrounds/a.mp4',
      'assets/backgrounds/b.mp4',
      'assets/images/k.jpg',
      'assets/images/z.webp',
    ]);
    expect(pool[2].kind).toBe('image');
    expect(pool[0].kind).toBe('clip');
  });

  it('missing dirs → empty contribution', () => {
    expect(listBackgroundPool(mkdtempSync(join(tmpdir(), 'empty-')))).toEqual([]);
  });
});

describe('resolveBackground', () => {
  it('finds by basename', () => {
    const pool = listBackgroundPool(fixtureRoot());
    expect(resolveBackground('k.jpg', pool).rel).toBe('assets/images/k.jpg');
  });
  it('throws with the available list', () => {
    const pool = listBackgroundPool(fixtureRoot());
    expect(() => resolveBackground('nope.jpg', pool)).toThrow(/available: .*a\.mp4/);
  });
});

describe('kenBurnsVariant', () => {
  it('is deterministic and in range', () => {
    const v = kenBurnsVariant('gita:2:47:assets/images/k.jpg');
    expect(v).toBe(kenBurnsVariant('gita:2:47:assets/images/k.jpg'));
    expect([0, 1, 2, 3]).toContain(v);
  });
  it('varies across seeds', () => {
    const vs = new Set(Array.from({ length: 40 }, (_, i) => kenBurnsVariant(`gita:1:${i}:x.jpg`)));
    expect(vs.size).toBeGreaterThan(1);
  });
});
