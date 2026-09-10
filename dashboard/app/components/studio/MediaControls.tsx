'use client';
import { useRef, useState } from 'react';
import type { ReelStyle } from '../../../../shared/reel-style.ts';
import { Field, ghostButtonClass, headingClass, labelClass, panelClass, selectClass } from '../ui.tsx';

export type Asset = { file: string; rel: string; kind: 'clip' | 'image' | 'music'; license: string };

export const ROTATION_NOTE = 'preview plays silent; the daily render picks a track per verse';

const MUSIC_MODES: { value: ReelStyle['musicMode']; label: string }[] = [
  { value: 'silent', label: 'Silent' },
  { value: 'track', label: 'This track' },
  { value: 'rotation', label: 'Rotation' },
];

export function MediaControls({
  assets,
  background,
  onBackground,
  style,
  prompt,
  onChange,
  onAssetsChanged,
}: {
  assets: Asset[];
  /** Selected background *file name* (what POST /api/generate takes), '' = Auto rotation. */
  background: string;
  onBackground: (file: string) => void;
  style: ReelStyle;
  /** The image prompt for the current source, composed by the page so the *unsaved* prefix
   *  shows here immediately — there is nothing to save, it is copy-out only. */
  prompt: string;
  onChange: (patch: Partial<ReelStyle>) => void;
  onAssetsChanged: () => void;
}) {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState<boolean | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Images first: the cinema format's own pool prefers images over clips (pipeline/run.ts), so the
  // strip leads with what a cinema render would actually reach for.
  const images = assets.filter((a) => a.kind === 'image');
  const clips = assets.filter((a) => a.kind === 'clip');
  const backgrounds = [...images, ...clips];
  const tracks = assets.filter((a) => a.kind === 'music');

  async function upload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body });
      const payload = (await res.json().catch(() => null)) as { error?: string; file?: string; kind?: string } | null;
      if (!res.ok) {
        setUploadError(payload?.error ?? `upload failed (HTTP ${res.status})`);
        return;
      }
      onAssetsChanged();
      // Select what was just uploaded — uploading a track and then having to find it in the
      // dropdown is the kind of half-step that makes a control room feel like a form. Gated on
      // the saved asset's own `kind`, so a non-mp3 slipped past the accept filter can never end
      // up nominated as the music track.
      if (payload?.kind === 'music' && payload.file) onChange({ musicMode: 'track', musicFile: payload.file });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function copyPrompt() {
    let ok = true;
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      ok = false; // no permission, or an insecure origin — say so rather than claim a copy
    }
    setCopied(ok);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <section className={panelClass}>
      <h2 className={headingClass}>Media</h2>

      <p className="mt-3 text-[10px] uppercase tracking-[0.18em] text-muted">background</p>
      <ul className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
        <li>
          <button
            type="button"
            aria-label="background auto"
            aria-pressed={background === ''}
            onClick={() => onBackground('')}
            className={`flex aspect-[9/16] w-full items-center justify-center rounded-lg bg-video text-center text-[10px] leading-tight text-muted ring-1 transition-colors ${
              background === '' ? 'ring-2 ring-accent' : 'ring-line hover:ring-line'
            }`}
          >
            Auto
            <br />
            (rotation)
          </button>
        </li>
        {backgrounds.map((a) => (
          <li key={a.rel}>
            <button
              type="button"
              aria-label={`background ${a.file}`}
              aria-pressed={background === a.file}
              onClick={() => onBackground(a.file)}
              title={`${a.file} — ${a.license}`}
              className={`block w-full overflow-hidden rounded-lg ring-1 transition-colors ${
                background === a.file ? 'ring-2 ring-accent' : 'ring-line hover:ring-line'
              }`}
            >
              {a.kind === 'image' ? (
                // plain <img>: these live in the repo's public/assets, outside dashboard/public,
                // so they are only reachable through the /api/media route (same as Library).
                <img
                  src={`/api/media/public/${a.rel}`}
                  alt={a.file}
                  loading="lazy"
                  className="aspect-[9/16] w-full object-cover"
                />
              ) : (
                <video
                  src={`/api/media/public/${a.rel}`}
                  muted
                  playsInline
                  preload="metadata"
                  className="aspect-[9/16] w-full object-cover"
                />
              )}
            </button>
          </li>
        ))}
      </ul>

      {/* Copy-out for whichever image generator you use: the render never calls one, so this is
          the only place the composed prompt (prefix + curated body or chapter theme) is visible. */}
      <p className={`mt-5 ${labelClass}`}>image prompt</p>
      <textarea
        aria-label="image prompt"
        readOnly
        rows={3}
        value={prompt}
        className={`${selectClass} mt-2 resize-y`}
      />
      <button type="button" className={`${ghostButtonClass} mt-2`} onClick={() => void copyPrompt()}>
        {copied === null ? 'Copy' : copied ? 'Copied' : 'Copy failed'}
      </button>

      <p className="mt-5 text-[10px] uppercase tracking-[0.18em] text-muted">music</p>
      <div className="mt-2 flex flex-wrap gap-4">
        {MUSIC_MODES.map((m) => (
          <label key={m.value} className="flex items-center gap-2 text-sm text-fg">
            <input
              type="radio"
              name="music-mode"
              aria-label={`music ${m.value}`}
              className="size-4 accent-accent"
              checked={style.musicMode === m.value}
              onChange={() => onChange({ musicMode: m.value })}
            />
            {m.label}
          </label>
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="track">
          <select
            aria-label="track"
            className={selectClass}
            disabled={style.musicMode !== 'track'}
            value={style.musicFile ?? ''}
            onChange={(e) => onChange({ musicFile: e.target.value || null })}
          >
            <option value="">— none —</option>
            {tracks.map((t) => (
              <option key={t.file} value={t.file}>
                {t.file}
              </option>
            ))}
          </select>
        </Field>

        <Field label="add track" hint="mp3 ≤20 MB">
          <input
            ref={fileRef}
            type="file"
            aria-label="add track"
            accept=".mp3,audio/mpeg"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
            className={`${ghostButtonClass} block w-full cursor-pointer file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-accent/15 file:px-2 file:py-1 file:text-accent-text`}
          />
        </Field>
      </div>

      {uploading && <p className="mt-2 text-xs text-muted">uploading…</p>}
      {uploadError && <p className="mt-2 text-sm text-danger">{uploadError}</p>}
      {style.musicMode === 'rotation' && <p className="mt-3 text-xs text-accent-text/70">{ROTATION_NOTE}</p>}
      {style.musicMode === 'track' && tracks.length === 0 && (
        <p className="mt-3 text-xs text-muted">no tracks in the pool yet — add an mp3 above</p>
      )}
    </section>
  );
}
