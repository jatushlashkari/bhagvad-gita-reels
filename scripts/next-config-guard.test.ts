import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

// The dashboard's remotion resolve-alias is load-bearing: without it the Studio's
// <Player> and the root-imported CinemaReel resolve two separate remotion module
// instances (two React contexts) and /studio breaks with "useCurrentFrame can only
// be called inside a component that was passed to <Player>". This guard exists so
// an innocent next.config.ts cleanup can't silently delete it.
describe('dashboard/next.config.ts remotion alias guard', () => {
  const src = readFileSync('dashboard/next.config.ts', 'utf8');

  it('keeps the Turbopack resolveAlias for the bare remotion specifier', () => {
    expect(src).toMatch(/turbopack:\s*\{\s*resolveAlias:\s*\{\s*remotion:/);
  });

  it('keeps the webpack exact-match alias (remotion$)', () => {
    expect(src).toMatch(/remotion\$/);
  });
});
