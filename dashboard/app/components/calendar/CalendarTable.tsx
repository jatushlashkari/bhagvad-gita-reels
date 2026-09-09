'use client';
import { Fragment, useEffect, useRef, useState } from 'react';
import {
  PLATFORMS,
  isoToLocal,
  localToIso,
  type Platform,
  type PostStatus,
  type ScheduleConfig,
  type ScheduleItem,
} from '../../../../shared/schedule.ts';
import type { PostPatch } from '../../../lib/backend.ts';
import { iconButtonClass, labelClass, selectClass } from '../studio/ui.tsx';
import { PostDrawer } from './PostDrawer.tsx';

/** Every 409 from the calendar routes means one thing to whoever is looking at the table:
 *  something else holds the render lock. The server says "publisher running" even when the holder
 *  is a Studio render, so the UI restates it as what to do about it. Exported because the page's
 *  PATCH/DELETE answer the same 409 and two drifting sentences would be worse than one import. */
export const BUSY = 'a render or the publisher is running — try again in a moment';

/** Exactly what the disabled "Publish now" says: without local credentials this machine cannot
 *  post at all, but the hourly GitHub workflow still will, at the time in the row. */
const NO_SECRETS = 'publishes from the cloud at its scheduled time';

/** Same reader as GeneratePanel's, the Studio's and the Quotes page's: the routes answer
 *  `{ error }` JSON, but an unhandled server fault can still arrive as plain text or HTML — read
 *  the body once and surface what is there. */
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

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

const cellClass = 'px-2 py-3 align-top';
const headClass = `${labelClass} px-2 pb-2 text-left font-normal`;

const STATUS_CLASS: Record<PostStatus, string> = {
  draft: 'text-[#a89f8d] ring-white/10',
  scheduled: 'text-[#e8c874] ring-[#e8c874]/30',
  published: 'text-emerald-300 ring-emerald-400/30',
  failed: 'text-red-400 ring-red-400/40',
  skipped: 'text-[#a89f8d]/60 ring-white/10',
};

const localStamp = (iso: string, tz: string) => {
  const { date, time } = isoToLocal(iso, tz);
  return `${date} ${time}`;
};

/** The scheduled time for one post. The draft is local so a half-typed value is never sent, and
 *  it re-adopts the stored time whenever that changes — which is also how an optimistic edit the
 *  server rejected snaps back, since the page reverts the row it owns. */
function TimeCell({
  item,
  platform,
  tz,
  onCommit,
}: {
  item: ScheduleItem;
  platform: Platform;
  tz: string;
  onCommit: (patch: PostPatch) => void;
}) {
  const post = item.posts[platform];
  const stored = post.at ? `${isoToLocal(post.at, tz).date}T${isoToLocal(post.at, tz).time}` : '';
  const [draft, setDraft] = useState(stored);
  useEffect(() => setDraft(stored), [stored]);

  // A published post's time is the record of when it actually went out — the backend rejects an
  // edit to it, so the input says so up front rather than failing on blur.
  const published = post.status === 'published';

  function commit() {
    if (draft === stored) return;
    // Clearing the field is a real value, not a typo: `at: null` is how the calendar spells
    // "no time yet" and the publisher leaves such a post alone.
    if (!draft) {
      onCommit({ at: null });
      return;
    }
    const [date, time] = draft.split('T');
    let iso: string;
    try {
      // Always the instant, never the zone-less `datetime-local` string: the server would read a
      // bare "2026-09-20T07:00" in ITS timezone, not in the calendar's.
      iso = localToIso(date, (time ?? '').slice(0, 5), tz);
    } catch {
      setDraft(stored); // a shape the browser should never produce — snap back rather than guess
      return;
    }
    onCommit({ at: iso });
  }

  return (
    <input
      type="datetime-local"
      aria-label={`${platform} time ${item.id}`}
      className={`${selectClass} min-w-[13rem] disabled:opacity-50`}
      value={draft}
      disabled={published}
      title={published ? 'published — its time is the record of what went out' : undefined}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      // Enter blurs rather than committing directly, so the commit happens exactly once through
      // the same path whichever way the field is left.
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

/** One streaming run — a publish or a re-render. Only one can be in flight (they take the same
 *  render lock), so the table tracks a single one and shows its log under the row that started it. */
type Run = { id: string; label: string; text: string; done: boolean | null };

export function CalendarTable({
  items,
  config,
  secrets,
  onPatch,
  onDelete,
  onReload,
}: {
  items: ScheduleItem[];
  config: ScheduleConfig;
  secrets: Record<Platform, boolean>;
  /** PATCH one post. The page owns `items`, so it does the optimistic merge and the revert;
   *  this resolves to an error message, or null when the write landed. */
  onPatch: (id: string, platform: Platform, patch: PostPatch) => Promise<string | null>;
  /** DELETE one row — same contract: a message, or null when the row is gone. */
  onDelete: (id: string) => Promise<string | null>;
  /** Re-read /api/calendar. A publish or re-render rewrites rows through the CLI, so the table
   *  never guesses at the outcome — it asks. */
  onReload: () => void;
}) {
  const [drawer, setDrawer] = useState<{ id: string; platform: Platform } | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [running, setRunning] = useState(false);
  // Row-scoped so a failed time edit or Skip is reported next to the row it belongs to rather
  // than in a page-wide banner that says nothing about which row it means.
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);
  const logRef = useRef<HTMLPreElement>(null);
  const tz = config.timezone;

  async function patch(id: string, platform: Platform, p: PostPatch) {
    setRowError(null);
    const problem = await onPatch(id, platform, p);
    if (problem) setRowError({ id, text: problem });
  }

  async function remove(item: ScheduleItem) {
    if (!window.confirm(`Delete "${item.hook}" from the calendar? The row and its thumbnail go away.`)) return;
    setRowError(null);
    const problem = await onDelete(item.id);
    if (problem) {
      setRowError({ id: item.id, text: problem });
      return;
    }
    // Nothing may keep pointing at a row that no longer exists.
    if (drawer?.id === item.id) setDrawer(null);
    if (run?.id === item.id) setRun(null);
  }

  /** Runs one of the two streaming endpoints and shows its log under `id`'s row. Ends with a
   *  re-read either way: `EXIT 0` only means the CLI finished — the row carries the outcome, and
   *  a failed publish still leaves an error and an attempt count behind. */
  async function stream(id: string, label: string, request: () => Promise<Response>) {
    setRowError(null);
    setRun({ id, label, text: '', done: null });
    setRunning(true);
    try {
      const res = await request();
      if (!res.ok) {
        const detail = await errorDetail(res);
        setRun({ id, label, text: res.status === 409 ? BUSY : `HTTP ${res.status}: ${detail}`, done: false });
        return;
      }
      if (!res.body) {
        setRun({ id, label, text: 'The server sent no response body — nothing to stream.', done: false });
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let all = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        all += dec.decode(value, { stream: true });
        setRun({ id, label, text: all, done: null });
        logRef.current?.scrollTo(0, 1e9);
      }
      setRun({ id, label, text: all, done: /\nEXIT 0\n?$/.test(all) });
    } catch (e) {
      setRun({ id, label, text: message(e), done: false });
    } finally {
      setRunning(false);
      onReload();
    }
  }

  const rerender = (item: ScheduleItem) =>
    stream(item.id, 're-render', () =>
      fetch(`/api/calendar/items/${encodeURIComponent(item.id)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'rerender' }),
      }),
    );

  const publishNow = (item: ScheduleItem, platform: Platform) =>
    stream(item.id, `${platform} publish`, () =>
      fetch('/api/calendar/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: item.id, platform }),
      }),
    );

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[1040px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/10">
            <th className={headClass}>reel</th>
            {PLATFORMS.map((p) => (
              <th key={p} className={headClass}>
                {p}
              </th>
            ))}
            <th className={headClass}>row</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            // A row that already published something is the record of that — the backend refuses
            // to delete it, so the button says why instead of asking and then failing.
            const publishedSomewhere = PLATFORMS.some((p) => item.posts[p].status === 'published');
            const expanded = drawer?.id === item.id || run?.id === item.id || rowError?.id === item.id;
            return (
              <Fragment key={item.id}>
                <tr className="border-b border-white/5 align-top">
                  <td className={cellClass}>
                    <div className="flex gap-3">
                      {/* plain <img>, not next/image: thumbnails live in the repo's public/thumbs,
                          outside dashboard/public, so they are only reachable through /api/media. */}
                      <img
                        src={`/api/media/public/thumbs/${item.id}.jpg`}
                        alt=""
                        loading="lazy"
                        width={40}
                        className="h-auto w-10 shrink-0 rounded ring-1 ring-white/10"
                      />
                      <div className="min-w-0">
                        <p className="text-[#f5efe0]">{item.hook}</p>
                        <p className="mt-1 text-xs text-[#a89f8d]">
                          <span className="text-[#e8c874]">{item.ref}</span> · {item.format}
                        </p>
                        <p className="text-xs text-[#a89f8d]/70">rendered {localStamp(item.renderedAt, tz)}</p>
                      </div>
                    </div>
                  </td>

                  {PLATFORMS.map((platform) => {
                    const post = item.posts[platform];
                    const noSecrets = !secrets[platform];
                    const published = post.status === 'published';
                    return (
                      <td key={platform} className={cellClass}>
                        <TimeCell
                          item={item}
                          platform={platform}
                          tz={tz}
                          onCommit={(p) => void patch(item.id, platform, p)}
                        />
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span
                            data-status={post.status}
                            title={post.error}
                            className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] ring-1 ${STATUS_CLASS[post.status]}`}
                          >
                            {post.status}
                          </span>
                          <button
                            type="button"
                            aria-label={`edit ${platform} ${item.id}`}
                            className={iconButtonClass}
                            onClick={() =>
                              setDrawer((d) =>
                                d?.id === item.id && d.platform === platform ? null : { id: item.id, platform },
                              )
                            }
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            aria-label={`publish ${platform} ${item.id} now`}
                            className={iconButtonClass}
                            // Three reasons this cannot run, each said out loud in the tooltip: no
                            // credentials on this machine, the post already went out, or the render
                            // lock is held by the run whose log is on screen.
                            disabled={noSecrets || published || running}
                            title={noSecrets ? NO_SECRETS : published ? 'already published' : running ? BUSY : undefined}
                            onClick={() => void publishNow(item, platform)}
                          >
                            Publish now
                          </button>
                          {(post.status === 'failed' || post.status === 'skipped') && (
                            <button
                              type="button"
                              aria-label={`retry ${platform} ${item.id}`}
                              className={iconButtonClass}
                              onClick={() => void patch(item.id, platform, { status: 'scheduled' })}
                            >
                              Retry
                            </button>
                          )}
                          {post.status === 'scheduled' && (
                            <button
                              type="button"
                              aria-label={`skip ${platform} ${item.id}`}
                              className={iconButtonClass}
                              onClick={() => void patch(item.id, platform, { status: 'skipped' })}
                            >
                              Skip
                            </button>
                          )}
                        </div>
                        {post.error && <p className="mt-1 max-w-56 text-[11px] text-red-400">{post.error}</p>}
                      </td>
                    );
                  })}

                  <td className={cellClass}>
                    <div className="flex flex-col items-start gap-1.5">
                      <button
                        type="button"
                        aria-label={`re-render ${item.id}`}
                        className={iconButtonClass}
                        disabled={running}
                        title={running ? BUSY : 'renders this reel again and replaces its asset'}
                        onClick={() => void rerender(item)}
                      >
                        Re-render
                      </button>
                      <button
                        type="button"
                        aria-label={`delete ${item.id}`}
                        className={iconButtonClass}
                        disabled={publishedSomewhere}
                        title={publishedSomewhere ? 'a row with published posts is the record of them' : undefined}
                        onClick={() => void remove(item)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>

                {/* The expanded area is a sibling <tr> rather than nested markup: a table row may
                    only hold cells, and both the drawer and the log want the full width. */}
                {expanded && (
                  <tr className="border-b border-white/5 bg-[#0d0817]/60">
                    <td className={cellClass} colSpan={PLATFORMS.length + 2}>
                      {rowError?.id === item.id && <p className="text-sm text-red-400">{rowError.text}</p>}
                      {drawer?.id === item.id && (
                        <PostDrawer
                          key={`${item.id}:${drawer.platform}`}
                          platform={drawer.platform}
                          post={item.posts[drawer.platform]}
                          onSave={(p) => onPatch(item.id, drawer.platform, p)}
                          onClose={() => setDrawer(null)}
                        />
                      )}
                      {run?.id === item.id && (
                        <div className="mt-3">
                          <p className={labelClass}>{run.label}</p>
                          <pre
                            ref={logRef}
                            data-testid="calendar-log"
                            className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[#0d0817] p-3 font-mono text-[11px] leading-relaxed text-[#a89f8d] ring-1 ring-white/5"
                          >
                            {run.text || 'starting…'}
                          </pre>
                          {run.done === true && (
                            <p className="mt-2 text-xs text-[#a89f8d]">
                              {run.label} finished — the row above carries the outcome
                            </p>
                          )}
                          {run.done === false && (
                            <p className="mt-2 text-sm text-red-400">{run.label} failed — log above</p>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
