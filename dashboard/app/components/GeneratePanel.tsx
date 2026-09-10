'use client';
import { useEffect, useRef, useState } from 'react';

const REEL_URL = '/api/media/out/reel.mp4';

/** The generate route answers errors as `{ error }` JSON (400 bad ref/background, 409 lock), but
 *  an unhandled server fault can still come back as plain text or HTML — read the body once and
 *  surface whatever is actually there rather than assuming a shape. */
async function errorDetail(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    if (typeof parsed?.error === 'string') return parsed.error;
  } catch {
    /* not JSON — fall through to the raw body */
  }
  return text.trim() || res.statusText || 'request failed';
}

const selectClass =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.18em] text-muted">
        {label}
        {hint && <span className="ml-1 tracking-normal text-accent-text/50">{hint}</span>}
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
      <video controls src={src} className="aspect-[9/16] w-64 rounded-xl ring-1 ring-line" />
      <a
        href={src}
        download="reel.mp4"
        className="rounded-lg border border-accent/50 px-3 py-1.5 text-sm text-accent-text transition-colors hover:bg-accent/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
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
  const [format, setFormat] = useState(''); // '' = Auto (config)
  const [preview, setPreview] = useState<{ hindi: string } | null>(null);
  const [log, setLog] = useState('');
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<null | boolean>(null);
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => { fetch('/api/state').then((r) => r.json()).then((s) => setChapters(s.chapters)); }, []);
  useEffect(() => { fetch('/api/assets').then((r) => r.json()).then(setAssets); }, []);
  // Aborted on change so a slow response for an older ch/vs can't land after — and overwrite —
  // the preview for the verse the user has since selected. Abort rejections are swallowed: the
  // newer request owns the preview now, and there is nothing to report.
  useEffect(() => {
    const ac = new AbortController();
    fetch(`/api/verse/${encodeURIComponent(`gita:${ch}:${vs}`)}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then(setPreview)
      .catch(() => {});
    return () => ac.abort();
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

  const appendLog = (line: string) => setLog((l) => (l ? `${l}\n${line}` : line));

  // Every exit path goes through `finally { setRunning(false) }`: a throw anywhere below (network
  // drop, server restart mid-stream, a body that never arrives) used to leave `running` true
  // forever, which sticks the button on "Rendering…" with no way back short of a reload. Errors
  // are appended to the log rather than swallowed — design spec §5, failures show the real error.
  async function generate() {
    setRunning(true); setLog(''); setDone(null);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ref: `gita:${ch}:${vs}`, background: bg || undefined, format: format || undefined }),
      });
      if (res.status === 409) { setLog('A render is already in progress.'); setDone(false); return; }
      if (!res.ok) { appendLog(`HTTP ${res.status}: ${await errorDetail(res)}`); setDone(false); return; }
      if (!res.body) { appendLog('The server sent no response body — nothing to stream.'); setDone(false); return; }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let all = '';
      for (;;) {
        const { value, done: d } = await reader.read();
        if (d) break;
        all += dec.decode(value, { stream: true });
        setLog(all);
        logRef.current?.scrollTo(0, 1e9);
      }
      setDone(/\nEXIT 0\n?$/.test(all));
    } catch (e) {
      appendLog(e instanceof Error ? e.message : String(e));
      setDone(false);
    } finally {
      setRunning(false);
    }
  }

  const verseCount = chapters[ch - 1] ?? 1;
  const images = assets.filter((a) => a.kind === 'image');
  // `kind === 'clip'`, not `!== 'image'`: /api/assets also lists the mp3 music pool now (the
  // Studio's music picker reads it), and an mp3 is not a background this select may offer.
  const clips = assets.filter((a) => a.kind === 'clip');

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">Generate</h2>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

        <Field label="format">
          <select
            aria-label="format"
            className={selectClass}
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          >
            <option value="">Auto (config)</option>
            <option value="classic">Classic</option>
            <option value="cinema">Cinema</option>
          </select>
        </Field>
      </div>

      <p className="mt-3 text-sm text-fg">
        <span className="mr-2 text-accent-text tabular-nums">गीता {ch}.{vs}</span>
        {/* `preview` is null both before the first fetch resolves and on a 404, so the empty
            state stays neutral rather than flashing an error on load — every ref the selects
            can produce exists in sources/gita.json (all 18 chapters are 1..N contiguous). */}
        <span className={preview ? 'text-muted' : 'text-muted/40'}>{preview ? preview.hindi : '—'}</span>
      </p>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={generate}
          disabled={running}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-ink transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50"
        >
          {running ? 'Rendering…' : 'Generate'}
        </button>
        <span className="text-xs text-muted">
          {running ? 'dry run — nothing is posted; takes a couple of minutes' : 'dry run — renders out/reel.mp4 only'}
        </span>
      </div>

      {(log || running) && (
        <pre
          ref={logRef}
          className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-video p-3 font-mono text-[11px] leading-relaxed text-muted ring-1 ring-line"
        >
          {log || 'starting…'}
        </pre>
      )}

      {done === true && <ReelPlayer />}
      {done === false && <p className="mt-3 text-sm text-danger">failed — log above</p>}
    </section>
  );
}
