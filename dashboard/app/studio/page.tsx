'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { computeCinemaTimeline, computeTimeline } from '../../../pipeline/timeline.ts';
import { DEFAULT_STYLE, type ReelStyle } from '../../../shared/reel-style.ts';
import type { ReelProps, Verse } from '../../../shared/types.ts';
import { BeatsEditor, beatsProblem } from '../components/studio/BeatsEditor.tsx';
import { MediaControls, ROTATION_NOTE, type Asset } from '../components/studio/MediaControls.tsx';
import { StyleControls } from '../components/studio/StyleControls.tsx';
import { Field, buttonClass, headingClass, panelClass, selectClass } from '../components/studio/ui.tsx';

// `video/fonts.ts` calls loadFont() (→ `new FontFace(...)`) at module scope, and a client
// component's module graph still executes during SSR — so the whole Remotion subtree, Player
// included, is loaded browser-only.
const PreviewPane = dynamic(() => import('../components/studio/PreviewPane.tsx').then((m) => m.PreviewPane), {
  ssr: false,
  loading: () => <div className="aspect-[9/16] w-full animate-pulse rounded-xl bg-[#161028]" />,
});

const REEL_URL = '/api/media/out/reel.mp4';

/** Same reader as GeneratePanel: the routes answer `{ error }` JSON, but an unhandled server
 *  fault can still arrive as plain text or HTML — read the body once and surface what is there. */
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

function ReelPlayer() {
  // Stamped once per completed render, not on every re-render — otherwise every slider nudge
  // below would restart playback (same reasoning as GeneratePanel's ReelPlayer).
  const [src] = useState(() => `${REEL_URL}?t=${Date.now()}`);
  return (
    <div className="mt-4 flex flex-wrap items-end gap-4">
      <video controls src={src} className="aspect-[9/16] w-48 rounded-xl ring-1 ring-white/10" />
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

export default function StudioPage() {
  const [chapters, setChapters] = useState<number[]>([]);
  const [handle, setHandle] = useState('');
  const [ch, setCh] = useState(2);
  const [vs, setVs] = useState(47);
  const ref = `gita:${ch}:${vs}`;

  const [verse, setVerse] = useState<Verse | null>(null);
  const [beats, setBeats] = useState<string[]>([]);
  const [curated, setCurated] = useState(false);
  const [style, setStyle] = useState<ReelStyle>(DEFAULT_STYLE);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [background, setBackground] = useState(''); // file name; '' = Auto rotation

  const [savingStyle, setSavingStyle] = useState(false);
  const [savedStyle, setSavedStyle] = useState<ReelStyle | null>(null);
  const [styleError, setStyleError] = useState<string | null>(null);
  const [savingBeats, setSavingBeats] = useState(false);
  const [beatsStatus, setBeatsStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const [log, setLog] = useState('');
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<null | boolean>(null);
  const logRef = useRef<HTMLPreElement>(null);

  const loadAssets = useCallback(() => {
    fetch('/api/assets')
      .then((r) => r.json())
      .then(setAssets)
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/state')
      .then((r) => r.json())
      .then((s: { chapters: number[]; handle: string }) => {
        setChapters(s.chapters);
        setHandle(s.handle);
      })
      .catch(() => {});
    fetch('/api/style')
      .then((r) => r.json())
      .then(setStyle)
      .catch(() => {});
    loadAssets();
  }, [loadAssets]);

  // Aborted on ref change so a slow response for an older verse can't land after — and overwrite
  // — the beats the user is now editing (same pattern as GeneratePanel's verse preview).
  useEffect(() => {
    const ac = new AbortController();
    const encoded = encodeURIComponent(ref);
    setBeatsStatus(null);
    fetch(`/api/verse/${encoded}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then(setVerse)
      .catch(() => {});
    fetch(`/api/beats/${encoded}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { beats: string[]; curated: boolean } | null) => {
        setBeats(b?.beats ?? []);
        setCurated(b?.curated ?? false);
      })
      .catch(() => {});
    return () => ac.abort();
  }, [ref]);

  const patchStyle = useCallback((patch: Partial<ReelStyle>) => {
    setSavedStyle(null);
    setStyle((s) => ({ ...s, ...patch }));
  }, []);

  // Blank rows are "not written yet", not "render an empty card": they are dropped from the
  // preview and from every payload, exactly as pipeline/run.ts treats an empty override list.
  const liveBeats = useMemo(() => beats.map((b) => b.trim()).filter(Boolean), [beats]);
  const backgroundRel = useMemo(
    () => assets.find((a) => a.file === background)?.rel ?? null,
    [assets, background],
  );

  // computeCinemaTimeline throws on an empty beat list (and on a >59.5s reel); computeTimeline can
  // throw the same way for a very long translation. Either one has to surface as text next to the
  // controls — a throw inside the render tree would tear the Player down instead.
  const preview = useMemo<{ props: ReelProps | null; totalSec: number; error: string | null }>(() => {
    if (!verse) return { props: null, totalSec: 0, error: null };
    try {
      const timings = computeCinemaTimeline(liveBeats, style);
      const props: ReelProps = {
        verse,
        // Unused by CinemaReel, required by the shared ReelProps — built exactly as
        // pipeline/run.ts builds it, so a translation that would break the render breaks here too.
        timings: computeTimeline({ introDurSec: 3, meaningDurSec: 10, englishText: verse.english }),
        format: 'cinema',
        cinema: { kicker: `GITA ${verse.chapter}.${verse.verse}`, beats: liveBeats, timings },
        style,
        audio: { introFile: null, meaningFile: null },
        media: {
          background: backgroundRel ? `/api/media/public/${backgroundRel}` : null,
          // Rotation resolves per verse inside the pipeline, so there is no single track to
          // preview — it plays silent, and MediaControls says so.
          music:
            style.musicMode === 'track' && style.musicFile
              ? `/api/media/public/assets/music/${style.musicFile}`
              : null,
        },
        brand: { handle },
      };
      return { props, totalSec: timings.totalSec, error: null };
    } catch (e) {
      return { props: null, totalSec: 0, error: e instanceof Error ? e.message : String(e) };
    }
  }, [verse, liveBeats, style, backgroundRel, handle]);

  async function saveStyle() {
    setSavingStyle(true);
    setStyleError(null);
    setSavedStyle(null);
    try {
      const res = await fetch('/api/style', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(style),
      });
      if (!res.ok) {
        setStyleError(`HTTP ${res.status}: ${await errorDetail(res)}`);
        return;
      }
      const written = (await res.json()) as ReelStyle;
      setSavedStyle(written);
      // The server clamps/defaults; adopting what it wrote keeps the form, the preview and
      // styles/cinema.json from drifting apart.
      setStyle(written);
    } catch (e) {
      setStyleError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingStyle(false);
    }
  }

  async function saveBeats() {
    setSavingBeats(true);
    setBeatsStatus(null);
    try {
      const res = await fetch(`/api/beats/${encodeURIComponent(ref)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ beats: liveBeats }),
      });
      if (!res.ok) {
        setBeatsStatus({ ok: false, text: `HTTP ${res.status}: ${await errorDetail(res)}` });
        return;
      }
      setBeats(liveBeats);
      setCurated(true); // sources/beats.json now has an entry for this ref
      setBeatsStatus({ ok: true, text: `saved to sources/beats.json` });
    } catch (e) {
      setBeatsStatus({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSavingBeats(false);
    }
  }

  const appendLog = (line: string) => setLog((l) => (l ? `${l}\n${line}` : line));

  // Same streaming reader as GeneratePanel, with the Studio's unsaved edits attached as
  // per-render overrides (never persisted) and format pinned to 'cinema' — config.json's default
  // is still 'classic', and the Studio only previews the cinema composition.
  async function render() {
    setRunning(true);
    setLog('');
    setDone(null);
    try {
      const overrides: { beats: string[]; style: ReelStyle; music?: string | null } = { beats: liveBeats, style };
      // `music` present-and-null = silent, present-and-a-file = that track, absent = let the
      // pipeline's per-verse rotation choose (see resolveCinemaInputs' hasOwnProperty check).
      if (style.musicMode === 'silent') overrides.music = null;
      else if (style.musicMode === 'track') overrides.music = style.musicFile;

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ref, background: background || undefined, format: 'cinema', overrides }),
      });
      if (res.status === 409) {
        setLog('A render is already in progress.');
        setDone(false);
        return;
      }
      if (!res.ok) {
        appendLog(`HTTP ${res.status}: ${await errorDetail(res)}`);
        setDone(false);
        return;
      }
      if (!res.body) {
        appendLog('The server sent no response body — nothing to stream.');
        setDone(false);
        return;
      }
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
  const problem = beatsProblem(beats);
  const previewNote =
    style.musicMode === 'rotation' ? ROTATION_NOTE : style.musicMode === 'track' && !style.musicFile ? 'no track selected — silent' : null;

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-[#e8c874]">Studio</h1>
          <p className="text-sm text-[#a89f8d]">cinema format — live preview of the exact render</p>
        </div>
        <Link href="/" className="text-sm text-[#a89f8d] transition-colors hover:text-[#e8c874]">
          ← Control room
        </Link>
      </header>

      <section className={panelClass}>
        <h2 className={headingClass}>Verse</h2>
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
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </Field>
          <Field label="verse" hint="श्लोक">
            <select aria-label="verse" className={selectClass} value={vs} onChange={(e) => setVs(Number(e.target.value))}>
              {Array.from({ length: verseCount }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </Field>
          <div className="self-end text-sm">
            <span className="mr-2 text-[#e8c874] tabular-nums">गीता {ch}.{vs}</span>
            <span className={verse ? 'text-[#a89f8d]' : 'text-[#a89f8d]/40'}>{verse ? verse.hindi : '—'}</span>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] lg:items-start">
        <div className="lg:sticky lg:top-6">
          <PreviewPane
            inputProps={preview.props}
            totalSec={preview.totalSec}
            error={preview.error}
            note={previewNote}
          />
        </div>

        <div className="space-y-6">
          <BeatsEditor
            beats={beats}
            curated={curated}
            onChange={setBeats}
            onSave={saveBeats}
            saving={savingBeats}
            status={beatsStatus}
          />
          <StyleControls
            style={style}
            onChange={patchStyle}
            onSave={saveStyle}
            saving={savingStyle}
            saved={savedStyle}
            error={styleError}
          />
          <MediaControls
            assets={assets}
            background={background}
            onBackground={setBackground}
            style={style}
            onChange={patchStyle}
            onAssetsChanged={loadAssets}
          />

          <section className={panelClass}>
            <h2 className={headingClass}>Render</h2>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className={buttonClass}
                disabled={running || problem !== null || preview.error !== null}
                onClick={render}
              >
                {running ? 'Rendering…' : 'Render this cut'}
              </button>
              <span className="text-xs text-[#a89f8d]">
                {problem ?? (running
                  ? 'dry run — nothing is posted; takes a couple of minutes'
                  : 'dry run — renders out/reel.mp4 with these unsaved edits')}
              </span>
            </div>

            {(log || running) && (
              <pre
                ref={logRef}
                data-testid="render-log"
                className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[#0d0817] p-3 font-mono text-[11px] leading-relaxed text-[#a89f8d] ring-1 ring-white/5"
              >
                {log || 'starting…'}
              </pre>
            )}
            {done === true && <ReelPlayer />}
            {done === false && <p className="mt-3 text-sm text-red-400">failed — log above</p>}
          </section>
        </div>
      </div>
    </main>
  );
}
