'use client';
import { useRef, useState } from 'react';

type Result = { name: string; ok: boolean; text: string };

export function UploadZone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[]>([]);

  // Sequential on purpose: the backend serializes saveImage anyway (slug pick + manifest
  // read-modify-write share one queue), so firing them in parallel would only scramble the
  // order of the per-file feedback below without finishing any sooner.
  async function upload(files: ArrayLike<File>) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setBusy(true);
    setResults([]);
    for (const file of list) {
      const body = new FormData();
      body.append('file', file);
      let result: Result;
      try {
        const res = await fetch('/api/upload', { method: 'POST', body });
        const data = await res.json();
        result = res.ok
          ? { name: file.name, ok: true, text: `saved as ${data.file}` }
          : { name: file.name, ok: false, text: data.error ?? `upload failed (${res.status})` };
      } catch (e) {
        result = { name: file.name, ok: false, text: e instanceof Error ? e.message : 'upload failed' };
      }
      setResults((r) => [...r, result]);
      if (result.ok) window.dispatchEvent(new Event('assets-changed'));
    }
    setBusy(false);
  }

  return (
    <section className="rounded-xl bg-[#161028] p-4 ring-1 ring-white/5">
      <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#a89f8d]">Upload backgrounds</h2>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(e) => {
          const files = e.target.files;
          if (files) void upload(files);
          e.target.value = ''; // so re-picking the same file fires onChange again
        }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void upload(e.dataTransfer.files);
        }}
        disabled={busy}
        className={`mt-3 flex w-full flex-col items-center gap-1 rounded-lg border-2 border-dashed px-4 py-10 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e8c874]/60 disabled:cursor-progress ${
          over
            ? 'border-[#e8c874] bg-[#e8c874]/10'
            : 'border-[#e8c874]/30 hover:border-[#e8c874]/60 hover:bg-[#e8c874]/5'
        }`}
      >
        <span className="text-sm text-[#f5efe0]">
          {busy ? 'Uploading…' : 'Drop images here, or click to pick'}
        </span>
        <span className="text-xs text-[#a89f8d]">jpg / png / webp · up to 15 MB · resized to 1080×1920</span>
      </button>

      <p className="mt-2 text-xs text-[#a89f8d]">
        Upload only images you have the right to use — they&rsquo;re recorded as user-provided in the licensing
        manifest.
      </p>

      {results.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs">
          {results.map((r, i) => (
            <li key={`${r.name}-${i}`} className={r.ok ? 'text-[#a89f8d]' : 'text-red-400'}>
              <span className="text-[#f5efe0]">{r.name}</span>
              {' — '}
              {r.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
