import { describe, it, expect } from 'vitest';
import { computeTimeline, TimelineTooLongError, computeCinemaTimeline } from './timeline.ts';

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

describe('computeCinemaTimeline', () => {
  const beats = ['Do the work. Release the outcome.', 'You control the effort.', 'You never controlled the results.'];

  it('sequences beats with crossfade overlap from 1.0s', () => {
    const t = computeCinemaTimeline(beats);
    expect(t.kickerInSec).toBe(0.8);
    expect(t.crossfadeSec).toBe(0.35);
    expect(t.beats[0].startSec).toBe(1.0);
    expect(t.beats[1].startSec).toBeCloseTo(1.0 + t.beats[0].durSec - 0.35, 5);
    expect(t.closingStartSec).toBeCloseTo(t.beats[2].startSec + t.beats[2].durSec - 0.35, 5);
    expect(t.totalSec).toBeCloseTo(t.closingStartSec + t.closingSec + 0.5, 5);
  });

  it('applies the duration formula per beat', () => {
    const t = computeCinemaTimeline(beats);
    expect(t.beats[0].durSec).toBeCloseTo(Math.min(4.2, 1.8 + beats[0].length / 16), 5);
  });

  it('pads hook and closing equally up to the 12s floor', () => {
    const t = computeCinemaTimeline(['Short one.', 'Short two.']);
    expect(t.totalSec).toBeGreaterThanOrEqual(12);
    expect(t.beats[0].durSec).toBeGreaterThan(2.4);
    expect(t.closingSec).toBeGreaterThan(3.2);
    expect(t.beats[0].durSec - 2.4).toBeCloseTo(t.closingSec - 3.2, 5);
  });

  it('rejects empty beats and impossible lengths', () => {
    expect(() => computeCinemaTimeline([])).toThrow(/at least/);
  });

  it('durationScale multiplies per-beat durations', () => {
    const base = computeCinemaTimeline(['A steady line of text here.']);
    const fast = computeCinemaTimeline(['A steady line of text here.'], { durationScale: 0.7, crossfadeSec: 0.35, transition: 'crossfade', gapSec: 0.4 });
    expect(fast.beats[0].durSec).toBeCloseTo(base.beats[0].durSec * 0.7, 5);
  });
  it('crossfadeSec flows into sequencing and output', () => {
    const t = computeCinemaTimeline(['One line here.', 'Two lines here.'], { durationScale: 1, crossfadeSec: 0.6, transition: 'crossfade', gapSec: 0.4 });
    expect(t.crossfadeSec).toBe(0.6);
    expect(t.beats[1].startSec).toBeCloseTo(t.beats[0].startSec + t.beats[0].durSec - 0.6, 5);
  });
  it('no style argument reproduces previous behavior', () => {
    expect(computeCinemaTimeline(['Do the work. Release the outcome.']).crossfadeSec).toBe(0.35);
  });

  it('12s floor holds under durationScale < 1 (floor-triggering and non-floor pre-scale cases)', () => {
    const a = computeCinemaTimeline(['Short one.'], { durationScale: 0.7, crossfadeSec: 0.35, transition: 'crossfade', gapSec: 0.4 });
    expect(a.totalSec).toBeGreaterThanOrEqual(12);
    const b = computeCinemaTimeline(['One line here.', 'Two lines more.', 'Three lines yet.'], { durationScale: 0.7, crossfadeSec: 0.35, transition: 'crossfade', gapSec: 0.4 });
    expect(b.totalSec).toBeGreaterThanOrEqual(12);
    for (const t of [a, b]) for (let i = 1; i < t.beats.length; i++)
      expect(t.beats[i].startSec).toBeCloseTo(t.beats[i-1].startSec + t.beats[i-1].durSec - t.crossfadeSec, 5);
  });
});

describe('computeCinemaTimeline sequential mode', () => {
  const beats = ['One line here for the first beat.', 'Two lines here, second beat.', 'Three lines here, third beat.'];
  const seq = { durationScale: 1, crossfadeSec: 0.35, transition: 'sequential' as const, gapSec: 0.5 };

  it('no overlap: each beat starts a gap after the previous one ends; closing after the last gap', () => {
    const t = computeCinemaTimeline(beats, seq);
    for (let i = 1; i < t.beats.length; i++)
      expect(t.beats[i].startSec).toBeCloseTo(t.beats[i - 1].startSec + t.beats[i - 1].durSec + 0.5, 5);
    const last = t.beats[t.beats.length - 1];
    expect(t.closingStartSec).toBeCloseTo(last.startSec + last.durSec + 0.5, 5);
  });

  it('crossfade mode is byte-identical with the new tokens present', () => {
    expect(computeCinemaTimeline(beats, { durationScale: 1, crossfadeSec: 0.35, transition: 'crossfade', gapSec: 0.4 }))
      .toEqual(computeCinemaTimeline(beats));
  });

  it('sequential mode is longer than crossfade for the same beats', () => {
    expect(computeCinemaTimeline(beats, seq).totalSec).toBeGreaterThan(computeCinemaTimeline(beats).totalSec);
  });

  it('sequential mode keeps the 12s floor and the no-overlap rule after durationScale', () => {
    const t = computeCinemaTimeline(['Short one.', 'Short two.'], { ...seq, durationScale: 0.7, gapSec: 1.5 });
    expect(t.totalSec).toBeGreaterThanOrEqual(12);
    expect(t.beats[1].startSec).toBeCloseTo(t.beats[0].startSec + t.beats[0].durSec + 1.5, 5);
  });
});
