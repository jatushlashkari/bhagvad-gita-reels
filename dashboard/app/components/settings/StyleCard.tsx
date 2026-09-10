'use client';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_STYLE, type ReelStyle } from '../../../../shared/reel-style.ts';
import type { Verse } from '../../../../shared/types.ts';
import { buildCinemaPreviewProps } from '../studio/preview-props.ts';
import { BUSY_MESSAGE } from '../ui.tsx';
import { SettingsCard } from './SettingsCard.tsx';
import { StyleFields } from './StyleFields.tsx';

// video/fonts.ts calls loadFont() at module scope — browser only, same as Studio.
const PreviewPane = dynamic(() => import('../studio/PreviewPane.tsx').then((m) => m.PreviewPane), {
  ssr: false,
  loading: () => <div className="aspect-[9/16] w-full animate-pulse rounded-lg bg-video" />,
});

const SAMPLE_REF = 'gita:2:47';

export function StyleCard({ handle, tracks }: { handle: string; tracks: { file: string }[] }) {
  const [style, setStyle] = useState<ReelStyle>(DEFAULT_STYLE);
  const [savedStyle, setSavedStyle] = useState<ReelStyle | null>(null);
  const [verse, setVerse] = useState<Verse | null>(null);
  const [beats, setBeats] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/style').then((r) => r.json()).then((s: ReelStyle) => { setStyle(s); setSavedStyle(s); }).catch(() => {});
    fetch(`/api/verse/${encodeURIComponent(SAMPLE_REF)}`).then((r) => (r.ok ? r.json() : null)).then(setVerse).catch(() => {});
    fetch(`/api/beats/${encodeURIComponent(SAMPLE_REF)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { beats: string[] } | null) => setBeats(b?.beats.slice(0, 2) ?? []))
      .catch(() => {});
  }, []);

  const preview = useMemo(
    () => (verse ? buildCinemaPreviewProps({ verse, beats, style, handle, backgroundRel: null, musicRel: null }) : { props: null, totalSec: 0, error: null }),
    [verse, beats, style, handle],
  );
  const dirty = savedStyle !== null && JSON.stringify(style) !== JSON.stringify(savedStyle);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/style', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(style) });
      if (!res.ok) {
        // saveStyle has no render-lock check today, so 409 is unreachable in practice — mapped
        // anyway, matching the other settings cards' contract for the day a shared lock is added.
        setError(res.status === 409 ? BUSY_MESSAGE : `save failed (${res.status})`);
        return;
      }
      const written = (await res.json()) as ReelStyle;
      // Adopt what the server actually wrote: it clamps, and the form must not drift.
      setStyle(written);
      setSavedStyle(written);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsCard
      title="Channel style"
      description="The look every render starts from. Studio can override it for one reel."
      dirty={dirty}
      saving={saving}
      error={error}
      saved={saved}
      // No field here can be individually invalid: every control is DOM-constrained
      // (select/range/color, promptPrefix's maxLength) — nothing to gate Save on.
      invalid={false}
      onSave={save}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(220px,300px)] lg:items-start">
        <StyleFields style={style} tracks={tracks} onChange={(patch) => setStyle((s) => ({ ...s, ...patch }))} />
        <PreviewPane inputProps={preview.props} totalSec={preview.totalSec} error={preview.error} note={`sample: ${SAMPLE_REF}`} />
      </div>
    </SettingsCard>
  );
}
