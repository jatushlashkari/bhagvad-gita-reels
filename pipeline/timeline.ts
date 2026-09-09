import { beatDurationSec } from '../shared/beats.ts';
import type { Timings, CinemaTimings } from '../shared/types.ts';

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

export function computeCinemaTimeline(beats: string[]): CinemaTimings {
  if (beats.length < 1) throw new Error('cinema needs at least one beat');
  const kickerInSec = 0.8;
  const crossfadeSec = 0.35;
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
  if (totalSec > 59.5) throw new TimelineTooLongError(totalSec);
  return { kickerInSec, beats: seq, crossfadeSec, closingStartSec, closingSec, totalSec };
}
