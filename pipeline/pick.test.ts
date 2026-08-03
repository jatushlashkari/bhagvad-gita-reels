import { describe, it, expect } from 'vitest';
import { pickAsset } from './pick.ts';

describe('pickAsset', () => {
  it('is deterministic for a ref', () => {
    const files = ['a.mp4', 'b.mp4', 'c.mp4'];
    expect(pickAsset('gita:2:47', files)).toBe(pickAsset('gita:2:47', files));
  });

  it('is independent of input order', () => {
    expect(pickAsset('gita:2:47', ['b.mp4', 'a.mp4', 'c.mp4'])).toBe(
      pickAsset('gita:2:47', ['c.mp4', 'a.mp4', 'b.mp4']),
    );
  });

  it('spreads across the pack', () => {
    const files = Array.from({ length: 12 }, (_, i) => `bg${i}.mp4`);
    const picks = new Set(Array.from({ length: 50 }, (_, i) => pickAsset(`gita:1:${i + 1}`, files)));
    expect(picks.size).toBeGreaterThan(6);
  });

  it('throws on empty list', () => {
    expect(() => pickAsset('gita:1:1', [])).toThrow();
  });
});
