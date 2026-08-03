import type { Timings } from '../shared/types.ts';

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
