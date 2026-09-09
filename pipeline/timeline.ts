import { beatDurationSec } from '../shared/beats.ts';
import type { Timings, CinemaTimings } from '../shared/types.ts';
import type { ReelStyle } from '../shared/reel-style.ts';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export class TimelineTooLongError extends Error {
  constructor(public totalSec: number) {
    super(`reel would be ${totalSec.toFixed(1)}s (> 59.5s)`);
  }
}

export function computeTimeline(input: {
  introDurSec: number;
  meaningDurSec: number;
  englishText: string;
}): Timings {
  const titleSec = 2;
  const shlokaStartSec = titleSec;
  const shlokaSec = Math.max(8, input.introDurSec + 4);
  const meaningStartSec = shlokaStartSec + shlokaSec;
  const meaningSec = input.meaningDurSec + 0.8;
  const englishStartSec = meaningStartSec + meaningSec;
  const englishSec = clamp(input.englishText.length / 15, 3.5, 6);
  const outroStartSec = englishStartSec + englishSec;
  const outroSec = 4;
  const totalSec = outroStartSec + outroSec + 0.7;
  if (totalSec > 59.5) throw new TimelineTooLongError(totalSec);
  return {
    titleSec,
    shlokaStartSec,
    shlokaSec,
    meaningStartSec,
    meaningSec,
    englishStartSec,
    englishSec,
    outroStartSec,
    outroSec,
    totalSec,
    introAudioStartSec: shlokaStartSec,
    meaningAudioStartSec: meaningStartSec,
  };
}

export function computeCinemaTimeline(
  beats: string[],
  style?: Pick<ReelStyle, 'durationScale' | 'crossfadeSec'>,
): CinemaTimings {
  if (beats.length < 1) throw new Error('cinema needs at least one beat');
  const kickerInSec = 0.8;
  const crossfadeSec = style?.crossfadeSec ?? 0.35;
  const durationScale = style?.durationScale ?? 1;
  const closingBase = 3.2;
  let cursor = 1.0;
  const seq = beats.map((b) => {
    const durSec = beatDurationSec(b);
    const startSec = cursor;
    cursor = startSec + durSec - crossfadeSec;
    return { startSec, durSec };
  });
  let closingStartSec = cursor;
  let closingSec = closingBase;
  let totalSec = closingStartSec + closingSec + 0.5;
  if (totalSec < 12) {
    const totalPad = 12 - totalSec;
    const excess = seq[0].durSec - 2.4;
    const pad_closing = (totalPad + excess) / 2;
    const pad_beat = pad_closing - excess;
    seq[0] = { ...seq[0], durSec: seq[0].durSec + pad_beat };
    for (let i = 1; i < seq.length; i++) seq[i] = { ...seq[i], startSec: seq[i].startSec + pad_beat };
    closingStartSec += pad_beat;
    closingSec += pad_closing;
    totalSec = 12;
  }
  // durationScale stretches/compresses the natural (floor/pad-balanced) per-beat
  // pacing computed above, re-run through the same crossfade-cascade formula.
  // Applying it here (rather than to the raw beatDurationSec before the 12s-floor
  // pass) keeps the floor guarantee meaningful: a single short beat always hits
  // the floor (its duration is capped at 4.2s, well under the 12s minimum), so
  // scaling the pre-floor number would be fully absorbed by the padding and never
  // show up in the output. Scaling the settled duration instead makes the knob
  // visible in every case, while durationScale=1 reproduces the pre-existing
  // numbers exactly (identical arithmetic, replayed).
  let scaledCursor = 1.0;
  const scaledSeq = seq.map((b) => {
    const durSec = b.durSec * durationScale;
    const startSec = scaledCursor;
    scaledCursor = startSec + durSec - crossfadeSec;
    return { startSec, durSec };
  });
  const scaledClosingStartSec = scaledCursor;
  const scaledTotalSec = scaledClosingStartSec + closingSec + 0.5;
  if (scaledTotalSec > 59.5) throw new TimelineTooLongError(scaledTotalSec);
  return {
    kickerInSec,
    beats: scaledSeq,
    crossfadeSec,
    closingStartSec: scaledClosingStartSec,
    closingSec,
    totalSec: scaledTotalSec,
  };
}
