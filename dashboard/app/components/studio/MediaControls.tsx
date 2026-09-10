'use client';
import { useRef, useState } from 'react';
import { Field, ghostButtonClass, headingClass, labelClass, panelClass, selectClass } from '../ui.tsx';

export type Asset = { file: string; rel: string; kind: 'clip' | 'image' | 'music'; license: string };

export function MediaControls({
  assets,
  background,
  onBackground,
  prompt,
  onAssetsChanged,
}: {
  assets: Asset[];
  /** Selected background *file name* (what POST /api/generate takes), '' = Auto rotation. */
  background: string;
  onBackground: (file: string) => void;
  /** The image prompt for the current source, composed by the page so the *unsaved* prefix
   *  shows here immediately — there is nothing to save, it is copy-out only. */
  prompt: string;
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
              background === '' ? 'ring-2 ring-accent' : 'ring-line hover:ring-accent/50'
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
                background === a.file ? 'ring-2 ring-accent' : 'ring-line hover:ring-accent/50'
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

      {/* Plain block, not a two-column grid: the music mode/track selects moved to the Look
          panel, so the upload is the only field left and the second column sat empty. */}
      <div className="mt-5">
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
    </section>
  );
}
