'use client';
import { Player } from '@remotion/player';
import { CinemaReel } from '../../../../video/CinemaReel.tsx';
import { FPS, HEIGHT, WIDTH, type ReelProps } from '../../../../shared/types.ts';
import { headingClass, panelClass } from './ui.tsx';

/**
 * The same `CinemaReel` component the render pipeline mounts, driven by the same
 * `computeCinemaTimeline` numbers — so what plays here is what comes out of `out/reel.mp4`.
 *
 * Mounted through `next/dynamic({ ssr: false })` by the Studio page: `video/fonts.ts` calls
 * `loadFont()` (→ `new FontFace(...)`) at module scope, which only exists in a browser.
 */
export function PreviewPane({
  inputProps,
  totalSec,
  error,
  note,
}: {
  inputProps: ReelProps | null;
  totalSec: number;
  error: string | null;
  note?: string | null;
}) {
  // The Player rejects a zero/negative duration outright; `computeCinemaTimeline`'s 12s floor
  // means this clamp is unreachable in practice, and cheap insurance if that ever changes.
  const durationInFrames = Math.max(1, Math.round(totalSec * FPS));

  return (
    <section className={panelClass}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={headingClass}>Preview</h2>
        <span className="text-xs tabular-nums text-[#a89f8d]">
          {error || !inputProps ? '—' : `${totalSec.toFixed(1)}s · ${durationInFrames}f`}
        </span>
      </div>

      <div className="mt-3">
        {error ? (
          <p
            data-testid="timeline-error"
            className="rounded-lg bg-[#0d0817] p-3 text-sm text-red-400 ring-1 ring-red-500/20"
          >
            {error}
          </p>
        ) : inputProps ? (
          <div data-testid="player">
            <Player
              component={CinemaReel}
              inputProps={inputProps}
              durationInFrames={durationInFrames}
              compositionWidth={WIDTH}
              compositionHeight={HEIGHT}
              fps={FPS}
              controls
              loop
              // Deliberately no `autoPlay`: before any user gesture the page's AudioContext is
              // suspended, and the Player's time anchor is then re-pinned on every tick — the
              // controls read "Pause" while the frame counter sits on 0:00 forever (verified
              // live). Starting paused makes the first click both the play and the gesture that
              // unblocks audio, so a music preview works on the very first play.
              acknowledgeRemotionLicense
              className="rounded-lg ring-1 ring-white/10"
              style={{ width: '100%' }}
            />
          </div>
        ) : (
          <div className="aspect-[9/16] w-full animate-pulse rounded-lg bg-[#0d0817] ring-1 ring-white/5" />
        )}
      </div>

      {note && <p className="mt-3 text-xs text-[#a89f8d]">{note}</p>}
    </section>
  );
}
