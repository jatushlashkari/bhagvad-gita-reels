import { computeCinemaTimeline, computeTimeline } from '../../../../pipeline/timeline.ts';
import type { ReelStyle } from '../../../../shared/reel-style.ts';
import type { ReelProps, Verse } from '../../../../shared/types.ts';

/** The single place the panel turns editor state into the exact props the renderer
 *  gets — Studio's live preview and the Settings style preview must never drift. */
export function buildCinemaPreviewProps(input: {
  verse: Verse;
  beats: string[];
  style: ReelStyle;
  handle: string;
  backgroundRel: string | null;
  musicRel: string | null;
  kicker?: string;
  closing?: { line: string; reference: string };
}): { props: ReelProps | null; totalSec: number; error: string | null } {
  try {
    const timings = computeCinemaTimeline(input.beats, input.style);
    const props: ReelProps = {
      verse: input.verse,
      // Unused by CinemaReel, required by the shared ReelProps — built exactly as
      // pipeline/run.ts builds it, so a translation that breaks the render breaks here.
      timings: computeTimeline({ introDurSec: 3, meaningDurSec: 10, englishText: input.verse.english }),
      format: 'cinema',
      cinema: {
        kicker: input.kicker ?? `GITA ${input.verse.chapter}.${input.verse.verse}`,
        beats: input.beats,
        timings,
        ...(input.closing ? { closing: input.closing } : {}),
      },
      style: input.style,
      audio: { introFile: null, meaningFile: null },
      media: {
        background: input.backgroundRel ? `/api/media/public/${input.backgroundRel}` : null,
        music: input.musicRel ? `/api/media/public/${input.musicRel}` : null,
      },
      brand: { handle: input.handle },
    };
    return { props, totalSec: timings.totalSec, error: null };
  } catch (e) {
    return { props: null, totalSec: 0, error: e instanceof Error ? e.message : String(e) };
  }
}
