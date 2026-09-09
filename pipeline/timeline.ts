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

type CinemaSeq = { startSec: number; durSec: number };

// 12s-floor pad for the natural (pre-scale) pacing: if the timeline (beats +
// closing) undershoots the 12s minimum, grow beat 0 and the closing card by
// equal "excess" amounts so both gain proportionally, then land exactly on 12s.
function padToFloor(
  seq: CinemaSeq[],
  closingStartSec: number,
  closingSec: number,
  totalSec: number,
): { seq: CinemaSeq[]; closingStartSec: number; closingSec: number; totalSec: number } {
  if (totalSec >= 12) return { seq, closingStartSec, closingSec, totalSec };
  const totalPad = 12 - totalSec;
  const excess = seq[0].durSec - 2.4;
  const pad_closing = (totalPad + excess) / 2;
  const pad_beat = pad_closing - excess;
  const paddedSeq = seq.map((b, i) =>
    i === 0 ? { ...b, durSec: b.durSec + pad_beat } : { ...b, startSec: b.startSec + pad_beat },
  );
  return {
    seq: paddedSeq,
    closingStartSec: closingStartSec + pad_beat,
    closingSec: closingSec + pad_closing,
    totalSec: 12,
  };
}

// Post-scale 12s-floor re-check. durationScale can push an already
// floor-satisfying (or freshly re-padded) natural timeline back under 12s —
// e.g. scale < 1 compressing a multi-beat sequence that didn't need padding
// pre-scale. Deliberately NOT reusing padToFloor's symmetric beat/closing
// split here: growing beat 0 again would partially undo the very
// durationScale the caller asked for, and worst on exactly the beats most
// likely to need this path (a single short beat scaled down — see
// pipeline/timeline.test.ts "durationScale multiplies per-beat durations",
// which pins beats[0].durSec to precisely rawDurSec * durationScale). The
// closing card is a fixed signature moment, not part of the per-beat pacing
// durationScale controls, so any post-scale shortfall is made up there
// instead — it always can, since closingSec has no upper bound.
function padClosingToFloor(closingSec: number, totalSec: number): { closingSec: number; totalSec: number } {
  if (totalSec >= 12) return { closingSec, totalSec };
  return { closingSec: closingSec + (12 - totalSec), totalSec: 12 };
}

export function computeCinemaTimeline(
  beats: string[],
  style?: Pick<ReelStyle, 'durationScale' | 'crossfadeSec' | 'transition' | 'gapSec'>,
): CinemaTimings {
  if (beats.length < 1) throw new Error('cinema needs at least one beat');
  const kickerInSec = 0.8;
  const crossfadeSec = style?.crossfadeSec ?? 0.35;
  const durationScale = style?.durationScale ?? 1;
  const transition = style?.transition ?? 'crossfade';
  const gapSec = style?.gapSec ?? 0.4;
  // Crossfade overlaps the next beat by the fade length; sequential lets the beat fade fully out,
  // holds the image alone for gapSec, then starts the next beat — no overlap (spec §3).
  const advance = (durSec: number) => (transition === 'sequential' ? durSec + gapSec : durSec - crossfadeSec);
  const closingBase = 3.2;
  let cursor = 1.0;
  const seq = beats.map((b) => {
    const durSec = beatDurationSec(b);
    const startSec = cursor;
    cursor = startSec + advance(durSec);
    return { startSec, durSec };
  });
  const natural = padToFloor(seq, cursor, closingBase, cursor + closingBase + 0.5);

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
  const scaledSeq = natural.seq.map((b) => {
    const durSec = b.durSec * durationScale;
    const startSec = scaledCursor;
    scaledCursor = startSec + advance(durSec);
    return { startSec, durSec };
  });
  const scaledClosingStartSec = scaledCursor;
  const scaledTotalSec = scaledCursor + natural.closingSec + 0.5;
  const final = padClosingToFloor(natural.closingSec, scaledTotalSec);

  if (final.totalSec > 59.5) throw new TimelineTooLongError(final.totalSec);
  return {
    kickerInSec,
    beats: scaledSeq,
    crossfadeSec,
    closingStartSec: scaledClosingStartSec,
    closingSec: final.closingSec,
    totalSec: final.totalSec,
  };
}
