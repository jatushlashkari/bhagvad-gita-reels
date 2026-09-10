'use client';
import type { ReelStyle } from '../../../../shared/reel-style.ts';
import { StyleFields } from '../settings/StyleFields.tsx';
import { ghostButtonClass, headingClass, panelClass } from '../ui.tsx';
import Link from 'next/link';

/** Studio edits a *copy* of the channel style for this render only. Saving the look
 *  for every future reel lives on Settings, so there is exactly one place that writes
 *  styles/cinema.json. */
export function StyleControls({
  style,
  savedStyle,
  tracks,
  onChange,
  onReset,
  resetting = false,
  resetError = null,
}: {
  style: ReelStyle;
  savedStyle: ReelStyle | null;
  tracks: { file: string }[];
  onChange: (patch: Partial<ReelStyle>) => void;
  /** Re-reads styles/cinema.json — Reset restores what is on disk now, not a snapshot
   *  taken when this page loaded, so a style saved in another tab is what comes back. */
  onReset: () => void;
  resetting?: boolean;
  /** Why the re-read failed. Shown rather than swallowed: a Reset that silently does
   *  nothing looks like a broken button. */
  resetError?: string | null;
}) {
  const modified = savedStyle !== null && JSON.stringify(style) !== JSON.stringify(savedStyle);
  return (
    <section className={panelClass}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={headingClass}>Look — this render only</h2>
        {modified && <span className="text-xs text-warning">modified</span>}
      </div>
      <div className="mt-3">
        <StyleFields style={style} tracks={tracks} onChange={onChange} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className={ghostButtonClass} disabled={!modified || resetting} onClick={onReset}>
          {resetting ? 'Resetting…' : 'Reset to channel style'}
        </button>
        <Link href="/settings#style" className="text-xs text-accent-text hover:underline">
          Edit the channel style in Settings
        </Link>
        {resetError && <span className="text-xs text-danger">{resetError}</span>}
      </div>
    </section>
  );
}
