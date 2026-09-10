'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CUSTOM_REF_PREFIX,
  REF_PATTERN,
  customRef,
  placeholderVerse,
  type CustomQuote,
} from '../../../shared/custom-quotes.ts';
import { promptFor } from '../../../shared/prompts.ts';
import { DEFAULT_STYLE, type ReelStyle } from '../../../shared/reel-style.ts';
import type { ReelProps, Verse } from '../../../shared/types.ts';
import { AddToCalendar } from '../components/calendar/AddToCalendar.tsx';
import { PageHeader } from '../components/shell/PageHeader.tsx';
import { ROTATION_NOTE } from '../components/settings/StyleFields.tsx';
import { BeatsEditor, beatsProblem } from '../components/studio/BeatsEditor.tsx';
import { MediaControls, type Asset } from '../components/studio/MediaControls.tsx';
import { buildCinemaPreviewProps } from '../components/studio/preview-props.ts';
import { StyleControls } from '../components/studio/StyleControls.tsx';
import { Field, buttonClass, headingClass, panelClass, selectClass } from '../components/ui.tsx';

// `video/fonts.ts` calls loadFont() (→ `new FontFace(...)`) at module scope, and a client
// component's module graph still executes during SSR — so the whole Remotion subtree, Player
// included, is loaded browser-only.
const PreviewPane = dynamic(() => import('../components/studio/PreviewPane.tsx').then((m) => m.PreviewPane), {
  ssr: false,
  loading: () => <div className="aspect-[9/16] w-full animate-pulse rounded-xl bg-surface" />,
});

const REEL_URL = '/api/media/out/reel.mp4';

/** What the Studio is pointed at: a Bhagavad Gita verse, or one of the user's own quotes.
 *  Everything downstream (the ref, the beats, the preview's kicker and closing card) reads
 *  from this one value, so the two modes can never half-apply. */
type Source = { kind: 'verse'; ch: number; vs: number } | { kind: 'custom'; id: string };

const GITA_OPTION = 'gita';

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
      <video controls src={src} className="aspect-[9/16] w-48 rounded-xl ring-1 ring-line" />
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

export default function StudioPage() {
  const [chapters, setChapters] = useState<number[]>([]);
  const [handle, setHandle] = useState('');
  const [source, setSource] = useState<Source>({ kind: 'verse', ch: 2, vs: 47 });
  const ref = source.kind === 'verse' ? `gita:${source.ch}:${source.vs}` : customRef(source.id);

  const [customQuotes, setCustomQuotes] = useState<CustomQuote[]>([]);
  // Distinguishes "the list has not arrived yet" from "this id is not in the list".
  const [customLoaded, setCustomLoaded] = useState(false);
  const [verse, setVerse] = useState<Verse | null>(null);
  const [beats, setBeats] = useState<string[]>([]);
  const [curated, setCurated] = useState(false);
  const [curatedPrompt, setCuratedPrompt] = useState<string | null>(null);
  const [style, setStyle] = useState<ReelStyle>(DEFAULT_STYLE);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [background, setBackground] = useState(''); // file name; '' = Auto rotation

  // The channel's saved look, fetched once below — the baseline Studio's edits are compared
  // against for the "modified" badge, and what Reset to channel style restores.
  const [savedStyle, setSavedStyle] = useState<ReelStyle | null>(null);
  const [savingBeats, setSavingBeats] = useState(false);
  const [beatsStatus, setBeatsStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const [log, setLog] = useState('');
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<null | boolean>(null);
  // Frozen at the moment a render succeeds (see `render()`), never read live from `ref` — otherwise
  // changing the verse after a successful render would let "Add to calendar" archive the old
  // out/reel.mp4 under the newly selected ref instead of the one it was actually rendered from.
  const [renderedRef, setRenderedRef] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  const loadAssets = useCallback(() => {
    fetch('/api/assets')
      .then((r) => r.json())
      .then(setAssets)
      .catch(() => {});
  }, []);

  const loadCustomQuotes = useCallback(() => {
    fetch('/api/custom-quotes')
      .then((r) => r.json())
      .then((qs: CustomQuote[]) => {
        setCustomQuotes(qs);
        setCustomLoaded(true);
      })
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
      .then((s: ReelStyle) => {
        setStyle(s);
        setSavedStyle(s);
      })
      .catch(() => {});
    loadAssets();
    loadCustomQuotes();
  }, [loadAssets, loadCustomQuotes]);

  // `?ref=` deep link (the Quotes page's "Studio" / "Open in Studio" links). Read from
  // window.location rather than useSearchParams: that hook forces the whole page under a
  // Suspense boundary in Next 16, and this is a one-shot read of the entry URL.
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('ref');
    if (!param || !REF_PATTERN.test(param)) return;
    if (param.startsWith(CUSTOM_REF_PREFIX)) {
      setSource({ kind: 'custom', id: param.slice(CUSTOM_REF_PREFIX.length) });
      return;
    }
    const [, ch, vs] = param.split(':');
    setSource({ kind: 'verse', ch: Number(ch), vs: Number(vs) });
  }, []);

  // The quote behind a custom source. Missing means "not fetched yet", or an id that no longer
  // exists — both render as the loading skeleton plus the note in the Source panel.
  const quote = useMemo(
    () => (source.kind === 'custom' ? customQuotes.find((q) => q.id === source.id) ?? null : null),
    [source, customQuotes],
  );

  // One refetch per unknown id: a deep link can name a quote created after this page loaded,
  // but retrying on every new (still missing) list would spin forever on a deleted id.
  const refetchedFor = useRef<string | null>(null);
  useEffect(() => {
    if (source.kind !== 'custom' || quote || !customLoaded || refetchedFor.current === source.id) return;
    refetchedFor.current = source.id;
    loadCustomQuotes();
  }, [source, quote, customLoaded, loadCustomQuotes]);

  // Switching between a verse and a custom quote clears the old text; paging through verses does
  // not, so the Player is only torn down when the two sources genuinely can't share a frame.
  const prevKind = useRef(source.kind);

  // Aborted on ref change so a slow response for an older ref can't land after — and overwrite
  // — the beats the user is now editing (same pattern as GeneratePanel's verse preview).
  useEffect(() => {
    const ac = new AbortController();
    const encoded = encodeURIComponent(ref);
    setBeatsStatus(null);
    if (prevKind.current !== source.kind) {
      prevKind.current = source.kind;
      setVerse(null);
      setBeats([]);
      setCurated(false);
    }
    // Both modes: sources/prompts.json for a verse, the quote's own prompt for a custom ref.
    // Dropped first so the box can never offer another ref's curated text to the Copy button —
    // until the fetch lands it shows the chapter-theme fallback, which at least belongs here.
    setCuratedPrompt(null);
    fetch(`/api/prompts/${encoded}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((p: { curated: string | null } | null) => setCuratedPrompt(p?.curated ?? null))
      .catch(() => {});
    if (source.kind === 'verse') {
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
    }
    return () => ac.abort();
  }, [ref, source]);

  // A custom quote needs no fetch — its lines are the beats and its placeholder verse is what
  // pipeline/run.ts builds for the same ref, so the preview matches the render.
  useEffect(() => {
    if (source.kind !== 'custom' || !quote) return;
    setVerse(placeholderVerse(quote));
    setBeats(quote.lines);
    setCurated(true);
  }, [source, quote]);

  const patchStyle = useCallback((patch: Partial<ReelStyle>) => {
    setStyle((s) => ({ ...s, ...patch }));
  }, []);

  // Remembered so a hop to a custom quote and back returns to the verse you were on rather
  // than to the 2.47 default.
  const lastVerse = useRef({ ch: 2, vs: 47 });
  function selectSource(value: string) {
    if (value === GITA_OPTION) {
      setSource({ kind: 'verse', ...lastVerse.current });
      return;
    }
    if (source.kind === 'verse') lastVerse.current = { ch: source.ch, vs: source.vs };
    setSource({ kind: 'custom', id: value.slice(CUSTOM_REF_PREFIX.length) });
  }

  // Blank rows are "not written yet", not "render an empty card": they are dropped from the
  // preview and from every payload, exactly as pipeline/run.ts treats an empty override list.
  const liveBeats = useMemo(() => beats.map((b) => b.trim()).filter(Boolean), [beats]);
  const backgroundRel = useMemo(
    () => assets.find((a) => a.file === background)?.rel ?? null,
    [assets, background],
  );
  const tracks = useMemo(() => assets.filter((a) => a.kind === 'music'), [assets]);

  // computeCinemaTimeline throws on an empty beat list (and on a >59.5s reel); computeTimeline can
  // throw the same way for a very long translation. Either one has to surface as text next to the
  // controls — a throw inside the render tree would tear the Player down instead. Both live inside
  // buildCinemaPreviewProps now, so this memo only handles the Studio-specific source reconciliation.
  const preview = useMemo<{ props: ReelProps | null; totalSec: number; error: string | null }>(() => {
    const custom = source.kind === 'custom' ? quote : null;
    // `verse` is one paint behind `source` right after a switch. Painting a quote's placeholder
    // verse as "GITA 0.0" — or a Gita verse under a quote's closing card — is worse than showing
    // the loading skeleton for that frame.
    if (!verse || (verse.book === 'custom') !== (source.kind === 'custom')) {
      return { props: null, totalSec: 0, error: null };
    }
    if (source.kind === 'custom' && !custom) return { props: null, totalSec: 0, error: null };
    // Rotation resolves per verse inside the pipeline, so there is no single track to preview —
    // it plays silent, and StyleFields' note says so.
    const musicRel = style.musicMode === 'track' && style.musicFile ? `assets/music/${style.musicFile}` : null;
    return buildCinemaPreviewProps({
      verse,
      beats: liveBeats,
      style,
      handle,
      backgroundRel,
      musicRel,
      // Kicker and closing card exactly as pipeline/run.ts builds them for the same ref: a
      // custom quote signs off with its attribution and has no romanised reference row.
      kicker: custom ? custom.kicker : undefined,
      closing: custom ? { line: custom.attribution, reference: '' } : undefined,
    });
  }, [verse, liveBeats, style, backgroundRel, handle, source, quote]);

  // Composed here rather than read from /api/quotes so the *unsaved* prefix in the Look panel
  // shows up in the box immediately — same call the server makes for the Quotes table.
  const prompt = useMemo(
    () => promptFor(verse?.chapter ?? 0, liveBeats[0] ?? '', curatedPrompt, style.promptPrefix),
    [verse, liveBeats, curatedPrompt, style.promptPrefix],
  );

  async function saveBeats() {
    setSavingBeats(true);
    setBeatsStatus(null);
    try {
      // A custom quote's beats *are* its lines — they live in the quote itself, not in the
      // per-verse beats file, so the same button patches the quote instead.
      const res =
        source.kind === 'custom'
          ? await fetch(`/api/custom-quotes/${encodeURIComponent(source.id)}`, {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ lines: liveBeats }),
            })
          : await fetch(`/api/beats/${encodeURIComponent(ref)}`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ beats: liveBeats }),
            });
      if (!res.ok) {
        setBeatsStatus({ ok: false, text: `HTTP ${res.status}: ${await errorDetail(res)}` });
        return;
      }
      if (source.kind === 'custom') {
        const saved = (await res.json()) as CustomQuote;
        setCustomQuotes((qs) => qs.map((q) => (q.id === saved.id ? saved : q)));
        setBeatsStatus({ ok: true, text: 'saved to sources/custom-quotes.json' });
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
      const success = /\nEXIT 0\n?$/.test(all);
      setDone(success);
      // `ref` here is the value closed over when this render() call started, not whatever the
      // picker shows by the time the stream finishes — so this always names the cut on disk.
      if (success) setRenderedRef(ref);
    } catch (e) {
      appendLog(e instanceof Error ? e.message : String(e));
      setDone(false);
    } finally {
      setRunning(false);
    }
  }

  // A verse/quote change must drop the stale player and Add-to-calendar control, not leave them
  // pointing at a cut that no longer matches what's selected. Skipped while a render is in
  // flight: that call's own completion handler above decides `done`/`renderedRef` for the ref it
  // was actually invoked with, and must not be second-guessed by a selection change mid-stream.
  useEffect(() => {
    if (running) return;
    setDone(null);
    setRenderedRef(null);
  }, [ref]);

  const verseCount = source.kind === 'verse' ? chapters[source.ch - 1] ?? 1 : 1;
  const problem = beatsProblem(beats);
  const previewNote =
    style.musicMode === 'rotation' ? ROTATION_NOTE : style.musicMode === 'track' && !style.musicFile ? 'no track selected — silent' : null;

  return (
    <>
      <PageHeader
        title="Studio"
        description="Live preview of the exact render — tune this cut before you render it."
      />
      <div className="space-y-6">
        <section className={panelClass}>
          <h2 className={headingClass}>Source</h2>
          <div className={`mt-3 grid gap-3 ${source.kind === 'verse' ? 'sm:grid-cols-4' : 'sm:grid-cols-2'}`}>
            <Field label="source">
              <select
                aria-label="source"
                className={selectClass}
                value={source.kind === 'verse' ? GITA_OPTION : ref}
                onChange={(e) => selectSource(e.target.value)}
              >
                <option value={GITA_OPTION}>Bhagavad Gita</option>
                {customQuotes.length > 0 && (
                  <optgroup label="Custom quotes">
                    {customQuotes.map((q) => (
                      <option key={q.id} value={customRef(q.id)}>
                        {q.lines[0]}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </Field>

            {source.kind === 'verse' ? (
              <>
                <Field label="chapter" hint="अध्याय">
                  <select
                    aria-label="chapter"
                    className={selectClass}
                    value={source.ch}
                    onChange={(e) => setSource({ kind: 'verse', ch: Number(e.target.value), vs: 1 })} // the new chapter may be shorter than the current verse number
                  >
                    {Array.from({ length: chapters.length || 18 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {i + 1}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="verse" hint="श्लोक">
                  <select
                    aria-label="verse"
                    className={selectClass}
                    value={source.vs}
                    onChange={(e) => setSource({ kind: 'verse', ch: source.ch, vs: Number(e.target.value) })}
                  >
                    {Array.from({ length: verseCount }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {i + 1}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="self-end text-sm">
                  <span className="mr-2 text-accent-text tabular-nums">गीता {source.ch}.{source.vs}</span>
                  <span className={verse ? 'text-muted' : 'text-muted/40'}>{verse ? verse.hindi : '—'}</span>
                </div>
              </>
            ) : (
              <div className="self-end text-sm">
                {quote ? (
                  <>
                    <span className="mr-2 text-accent-text">{quote.kicker}</span>
                    <span className="text-muted">· {quote.attribution}</span>
                  </>
                ) : (
                  <span className="text-muted/40">{customLoaded ? 'quote not found' : '—'}</span>
                )}
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-muted">
            <Link href="/quotes" className="text-accent-text transition-colors hover:underline">
              manage on /quotes
            </Link>
          </p>
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
              savedStyle={savedStyle}
              tracks={tracks}
              onChange={patchStyle}
              onReset={() => savedStyle && setStyle(savedStyle)}
            />
            <MediaControls
              assets={assets}
              background={background}
              onBackground={setBackground}
              prompt={prompt}
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
                <span className="text-xs text-muted">
                  {problem ?? (running
                    ? 'dry run — nothing is posted; takes a couple of minutes'
                    : 'dry run — renders out/reel.mp4 with these unsaved edits')}
                </span>
              </div>

              {(log || running) && (
                <pre
                  ref={logRef}
                  data-testid="render-log"
                  className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-video p-3 font-mono text-[11px] leading-relaxed text-muted ring-1 ring-line"
                >
                  {log || 'starting…'}
                </pre>
              )}
              {done === true && renderedRef && (
                <>
                  <ReelPlayer />
                  {/* Only after a successful render: "Add to calendar" schedules the cut now sitting
                      in out/, so offering it before one exists would archive someone else's reel.
                      `renderedRef`, not the live `ref` — see its declaration above — so a verse
                      change right after rendering can't archive the old file under the new ref. */}
                  <AddToCalendar sourceRef={renderedRef} />
                </>
              )}
              {done === false && <p className="mt-3 text-sm text-danger">failed — log above</p>}
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
