'use client';
import { useEffect, useRef, useState } from 'react';

const REEL_URL = '/api/media/out/reel.mp4';

const selectClass =
  'w-full rounded-lg border border-white/10 bg-[#0d0817] px-3 py-2 text-sm text-[#f5efe0] focus:border-[#e8c874]/60 focus:outline-none focus:ring-2 focus:ring-[#e8c874]/40';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.18em] text-[#a89f8d]">
        {label}
        {hint && <span className="ml-1 tracking-normal text-[#e8c874]/50">{hint}</span>}
      </span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

/** Mounted only once a render has finished, so the cache-busting `?t=` is stamped exactly
 *  once per completed render instead of on every re-render (which would restart playback
 *  every time a select below it changes). */
function ReelPlayer() {
  const [src] = useState(() => `${REEL_URL}?t=${Date.now()}`);
  return (
    <div className="mt-4 flex flex-wrap items-end gap-4">
      <video controls src={src} className="aspect-[9/16] w-64 rounded-xl ring-1 ring-white/10" />
      <a
        href={src}
        download="reel.mp4"
        className="rounded-lg border border-[#e8c874]/40 px-3 py-1.5 text-sm text-[#e8c874] transition-colors hover:bg-[#e8c874]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e8c874]/60"
      >
        Download
      </a>
    </div>
  );
}

export function GeneratePanel() {
  const [chapters, setChapters] = useState<number[]>([]);
  const [ch, setCh] = useState(1);
  const [vs, setVs] = useState(1);
  const [assets, setAssets] = useState<{ file: string; kind: string }[]>([]);
  const [bg, setBg] = useState(''); // '' = Auto
  const [preview, setPreview] = useState<{ hindi: string } | null>(null);
  const [log, setLog] = useState('');
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<null | boolean>(null);
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => { fetch('/api/state').then((r) => r.json()).then((s) => setChapters(s.chapters)); }, []);
  useEffect(() => { fetch('/api/assets').then((r) => r.json()).then(setAssets); }, []);
  useEffect(() => {
    fetch(`/api/verse/${encodeURIComponent(`gita:${ch}:${vs}`)}`).then((r) => (r.ok ? r.json() : null)).then(setPreview);
  }, [ch, vs]);
  // Additive to the effects above: the mount-only asset fetch would leave a just-uploaded image
  // missing from the background dropdown until a page reload, which breaks the design spec's §6
  // end-to-end flow ("upload one image -> generate 2:47 with it manually picked"). Same
  // 'assets-changed' event Library already listens to, dispatched by UploadZone.
  useEffect(() => {
    const reload = () => { fetch('/api/assets').then((r) => r.json()).then(setAssets); };
    window.addEventListener('assets-changed', reload);
    return () => window.removeEventListener('assets-changed', reload);
  }, []);

  async function generate() {
    setRunning(true); setLog(''); setDone(null);
    const res = await fetch('/api/generate', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ref: `gita:${ch}:${vs}`, background: bg || undefined }),
    });
    if (res.status === 409) { setLog('A render is already in progress.'); setRunning(false); setDone(false); return; }
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let all = '';
    for (;;) {
      const { value, done: d } = await reader.read();
      if (d) break;
      all += dec.decode(value, { stream: true });
      setLog(all);
      logRef.current?.scrollTo(0, 1e9);
    }
    setRunning(false);
    setDone(/\nEXIT 0\n?$/.test(all));
  }

  const verseCount = chapters[ch - 1] ?? 1;
  const images = assets.filter((a) => a.kind === 'image');
  const clips = assets.filter((a) => a.kind !== 'image');

  return (
    <section className="rounded-xl bg-[#161028] p-4 ring-1 ring-white/5">
      <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#a89f8d]">Generate</h2>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="chapter" hint="अध्याय">
          <select
            aria-label="chapter"
            className={selectClass}
            value={ch}
            onChange={(e) => {
              setCh(Number(e.target.value));
              setVs(1); // the new chapter may be shorter than the current verse number
            }}
          >
            {Array.from({ length: chapters.length || 18 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}</option>
            ))}
          </select>
        </Field>

        <Field label="verse" hint="श्लोक">
          <select
            aria-label="verse"
            className={selectClass}
            value={vs}
            onChange={(e) => setVs(Number(e.target.value))}
          >
            {Array.from({ length: verseCount }, (_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}</option>
            ))}
          </select>
        </Field>

        <Field label="background">
          <select aria-label="background" className={selectClass} value={bg} onChange={(e) => setBg(e.target.value)}>
            <option value="">Auto (rotation)</option>
            {images.length > 0 && (
              <optgroup label="images">
                {images.map((a) => (
                  <option key={a.file} value={a.file}>{a.file}</option>
                ))}
              </optgroup>
            )}
            {clips.length > 0 && (
              <optgroup label="clips">
                {clips.map((a) => (
                  <option key={a.file} value={a.file}>{a.file}</option>
                ))}
              </optgroup>
            )}
          </select>
        </Field>
      </div>

      <p className="mt-3 text-sm text-[#f5efe0]">
        <span className="mr-2 text-[#e8c874] tabular-nums">गीता {ch}.{vs}</span>
        {/* `preview` is null both before the first fetch resolves and on a 404, so the empty
            state stays neutral rather than flashing an error on load — every ref the selects
            can produce exists in sources/gita.json (all 18 chapters are 1..N contiguous). */}
        <span className={preview ? 'text-[#a89f8d]' : 'text-[#a89f8d]/40'}>{preview ? preview.hindi : '—'}</span>
      </p>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={generate}
          disabled={running}
          className="rounded-lg bg-[#e8c874] px-4 py-2 text-sm font-medium text-[#0d0817] transition-colors hover:bg-[#f2d894] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e8c874]/60 disabled:opacity-50"
        >
          {running ? 'Rendering…' : 'Generate'}
        </button>
        <span className="text-xs text-[#a89f8d]">
          {running ? 'dry run — nothing is posted; takes a couple of minutes' : 'dry run — renders out/reel.mp4 only'}
        </span>
      </div>

      {(log || running) && (
        <pre
          ref={logRef}
          className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[#0d0817] p-3 font-mono text-[11px] leading-relaxed text-[#a89f8d] ring-1 ring-white/5"
        >
          {log || 'starting…'}
        </pre>
      )}

      {done === true && <ReelPlayer />}
      {done === false && <p className="mt-3 text-sm text-red-400">failed — log above</p>}
    </section>
  );
}
