import { describe, it, expect } from 'vitest';
import { computeTimeline, TimelineTooLongError } from './timeline.ts';

const base = { introDurSec: 3.2, meaningDurSec: 14, englishText: 'x'.repeat(80) };

describe('computeTimeline', () => {
  it('computes monotonic segment starts from audio durations', () => {
    const t = computeTimeline(base);
    expect(t.titleSec).toBe(2);
    expect(t.shlokaSec).toBe(8); // max(8, 3.2 + 4)
    expect(t.meaningStartSec).toBeCloseTo(10, 5);
    expect(t.meaningSec).toBeCloseTo(14.8, 5); // narration + 0.8 pad
    expect(t.englishStartSec).toBeCloseTo(24.8, 5);
    expect(t.englishSec).toBeCloseTo(80 / 15, 2); // clamped 3.5..6
    expect(t.outroStartSec).toBeCloseTo(24.8 + 80 / 15, 2);
    expect(t.totalSec).toBeCloseTo(t.outroStartSec + 4 + 0.7, 2);
    expect(t.introAudioStartSec).toBe(t.shlokaStartSec);
    expect(t.meaningAudioStartSec).toBe(t.meaningStartSec);
  });

  it('long intro stretches the shloka section', () => {
    expect(computeTimeline({ ...base, introDurSec: 9 }).shlokaSec).toBe(13);
  });

  it('clamps english reading time', () => {
    expect(computeTimeline({ ...base, englishText: 'hi' }).englishSec).toBe(3.5);
    expect(computeTimeline({ ...base, englishText: 'x'.repeat(400) }).englishSec).toBe(6);
  });

  it('throws TimelineTooLongError past 59.5s', () => {
    expect(() => computeTimeline({ ...base, meaningDurSec: 45 })).toThrow(TimelineTooLongError);
  });
});
