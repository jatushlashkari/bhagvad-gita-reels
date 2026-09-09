'use client';
import { useState } from 'react';
import { CAPTION_MAX, TITLE_MAX, type Platform, type PostRecord } from '../../../../shared/schedule.ts';
import type { PostPatch } from '../../../lib/backend.ts';
import { ghostButtonClass, labelClass, selectClass } from '../studio/ui.tsx';

/** The text editor for one platform's post: the caption every platform posts, plus YouTube's
 *  separate title. Mounted per (row, platform) — the table keys it on both — so the draft always
 *  starts from the record on screen rather than from whatever the previously open drawer held.
 *
 *  Caption and title are the two fields a *published* post still accepts (fixing a live typo is
 *  worth doing), so nothing here is gated on status: the backend rejects what it must. */
export function PostDrawer({
  platform,
  post,
  onSave,
  onClose,
}: {
  platform: Platform;
  post: PostRecord;
  /** Resolves to an error message, or null when the write landed (the drawer then closes). */
  onSave: (patch: PostPatch) => Promise<string | null>;
  onClose: () => void;
}) {
  const [caption, setCaption] = useState(post.caption);
  // YouTube is the only platform with a title of its own — instagram and facebook carry the whole
  // post in `caption`, and sending them a `title` would write a field nothing ever reads.
  const [title, setTitle] = useState(post.title ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const patch: PostPatch = { caption };
    if (platform === 'youtube') patch.title = title;
    const problem = await onSave(patch);
    setSaving(false);
    if (problem) setError(problem);
    else onClose();
  }

  return (
    <div className="rounded-lg bg-[#0d0817] p-3 ring-1 ring-white/5">
      <p className={labelClass}>{platform} post</p>

      {platform === 'youtube' && (
        <label className="mt-3 block">
          <span className="flex items-baseline justify-between">
            <span className={labelClass}>title</span>
            <span className="text-[11px] tabular-nums text-[#a89f8d]">
              {title.length} / {TITLE_MAX}
            </span>
          </span>
          <input
            aria-label="youtube title"
            className={`${selectClass} mt-1`}
            maxLength={TITLE_MAX}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
      )}

      <label className="mt-3 block">
        <span className="flex items-baseline justify-between">
          <span className={labelClass}>caption</span>
          <span className="text-[11px] tabular-nums text-[#a89f8d]">
            {caption.length} / {CAPTION_MAX}
          </span>
        </span>
        <textarea
          aria-label="caption"
          rows={6}
          className={`${selectClass} mt-1 font-mono text-[11px] leading-relaxed`}
          maxLength={CAPTION_MAX}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />
      </label>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" className={ghostButtonClass} disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className={ghostButtonClass} onClick={onClose}>
          Cancel
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </div>
  );
}
