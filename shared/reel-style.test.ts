import { describe, it, expect } from 'vitest';
import { DEFAULT_STYLE, validateStyle } from './reel-style.ts';

describe('validateStyle', () => {
  it('returns defaults for junk input', () => {
    expect(validateStyle(null)).toEqual(DEFAULT_STYLE);
    expect(validateStyle('x')).toEqual(DEFAULT_STYLE);
  });
  it('fills missing keys and keeps valid ones', () => {
    const s = validateStyle({ beatSizePx: 72, accentColor: '#ffcc00' });
    expect(s.beatSizePx).toBe(72);
    expect(s.accentColor).toBe('#ffcc00');
    expect(s.musicMode).toBe('silent');
  });
  it('clamps numeric ranges', () => {
    const s = validateStyle({ beatSizePx: 400, scrimStrength: 9, durationScale: 0.1, crossfadeSec: 5 });
    expect(s.beatSizePx).toBe(96);
    expect(s.scrimStrength).toBe(1);
    expect(s.durationScale).toBe(0.7);
    expect(s.crossfadeSec).toBe(0.8);
  });
  it('coerces invalid enums/colors to defaults', () => {
    const s = validateStyle({ beatFont: 'comic-sans', kenBurns: 'wild', musicMode: 'loud', textColor: 'javascript:evil' });
    expect(s.beatFont).toBe('display');
    expect(s.kenBurns).toBe('gentle');
    expect(s.musicMode).toBe('silent');
    expect(s.textColor).toBe('#ffffff');
  });
  it('never throws', () => {
    for (const bad of [undefined, 42, [], { musicFile: {} }]) expect(() => validateStyle(bad)).not.toThrow();
  });
  it('accepts the new beat fonts and defaults/validates kickerFont', () => {
    expect(validateStyle({ beatFont: 'cinzel' }).beatFont).toBe('cinzel');
    expect(validateStyle({ beatFont: 'bebas' }).beatFont).toBe('bebas');
    expect(validateStyle({ beatFont: 'comic' }).beatFont).toBe('display');
    expect(validateStyle({}).kickerFont).toBe('serif');
    expect(validateStyle({ kickerFont: 'cinzel' }).kickerFont).toBe('cinzel');
    expect(validateStyle({ kickerFont: 'bebas' }).kickerFont).toBe('serif');
  });
  it('transition + gap tokens default and clamp', () => {
    expect(validateStyle({}).transition).toBe('crossfade');
    expect(validateStyle({}).gapSec).toBe(0.4);
    expect(validateStyle({ transition: 'sequential', gapSec: 9 }).gapSec).toBe(1.5);
    expect(validateStyle({ gapSec: -1 }).gapSec).toBe(0);
    expect(validateStyle({ transition: 'spin' }).transition).toBe('crossfade');
  });
});
