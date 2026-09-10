'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { sortItems, type Platform, type ScheduleItem } from '../../../shared/schedule.ts';
import type { CalendarView, PostPatch } from '../../lib/backend.ts';
import { BUSY, CalendarTable } from '../components/calendar/CalendarTable.tsx';
import { PageHeader } from '../components/shell/PageHeader.tsx';
import { headingClass, panelClass } from '../components/studio/ui.tsx';

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

/** A 409 from PATCH/DELETE is one of two things and they need opposite answers: the render lock,
 *  which clears on its own, or a row that has already published something, which never becomes
 *  deletable. Only the first is restated as BUSY. */
async function requestError(res: Response): Promise<string> {
  const detail = await errorDetail(res);
  if (res.status === 409 && !/published posts/.test(detail)) return BUSY;
  return `HTTP ${res.status}: ${detail}`;
}

/** Replaces one row and re-sorts: an edited time can move a row past its neighbours, and the API
 *  only sorts what it returns from a GET. */
const withRow = (view: CalendarView, item: ScheduleItem): CalendarView => ({
  ...view,
  items: sortItems(view.items.map((i) => (i.id === item.id ? item : i))),
});

export default function CalendarPage() {
  const [view, setView] = useState<CalendarView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/calendar');
      if (!res.ok) {
        // A malformed schedule.json is a 500 here, not an empty calendar — the message says which
        // line of the file to fix, so it is shown rather than swallowed into "nothing scheduled".
        setError(`HTTP ${res.status}: ${await errorDetail(res)}`);
        return;
      }
      setView((await res.json()) as CalendarView);
      setError(null);
    } catch (e) {
      setError(message(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Optimistic: a time that only moves after a round trip reads as an input that ate the edit.
  // The revert puts the row back exactly as it was, which is also what re-seeds the input.
  async function patchPost(id: string, platform: Platform, patch: PostPatch): Promise<string | null> {
    const previous = view?.items.find((i) => i.id === id);
    if (!previous) return `no calendar item ${id}`;
    setView((v) =>
      v ? withRow(v, { ...previous, posts: { ...previous.posts, [platform]: { ...previous.posts[platform], ...patch } } }) : v,
    );
    try {
      const res = await fetch(`/api/calendar/items/${encodeURIComponent(id)}/${platform}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        setView((v) => (v ? withRow(v, previous) : v));
        return await requestError(res);
      }
      // The server's own copy, not the guess above: it also resets attempts, clears the error a
      // Retry just healed, and normalizes the instant it stored.
      const saved = (await res.json()) as ScheduleItem;
      setView((v) => (v ? withRow(v, saved) : v));
      return null;
    } catch (e) {
      setView((v) => (v ? withRow(v, previous) : v));
      return message(e);
    }
  }

  async function deleteItem(id: string): Promise<string | null> {
    try {
      const res = await fetch(`/api/calendar/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) return await requestError(res);
      setView((v) => (v ? { ...v, items: v.items.filter((i) => i.id !== id) } : v));
      return null;
    } catch (e) {
      return message(e);
    }
  }

  return (
    <>
      <PageHeader
        title="Calendar"
        description={
          view ? `What goes out, where, and when — times in ${view.config.timezone}.` : 'What goes out, where, and when.'
        }
      />
      <div className="space-y-6">
        <section className={panelClass}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className={headingClass}>Scheduled</h2>
            {view && (
              <span className="flex items-center gap-2 text-xs text-[#a89f8d]">
                <span
                  data-mode={view.mode}
                  className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] ring-1 ${
                    view.mode === 'calendar' ? 'text-[#e8c874] ring-[#e8c874]/30' : 'text-[#a89f8d] ring-white/10'
                  }`}
                >
                  {view.mode} mode
                </span>
                <span className="tabular-nums">{view.items.length} in schedule.json</span>
              </span>
            )}
          </div>

          {/* Worth saying out loud: in daily mode the hourly workflow is switched off, so rows here
              sit untouched until config.json's `mode` says calendar. */}
          {view?.mode === 'daily' && (
            <p className="mt-3 text-sm text-[#e8c874]/80">
              config.json is in daily mode — the hourly publisher does not run, so nothing below goes out on its own.
            </p>
          )}

          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

          {view && view.items.length === 0 && (
            <p className="mt-3 text-sm text-[#a89f8d]">
              Nothing scheduled — the hourly publisher fills the next {view.config.daysAhead} days, or add a reel from{' '}
              <Link href="/studio" className="text-[#e8c874] transition-colors hover:underline">
                Studio
              </Link>
              .
            </p>
          )}

          {view && view.items.length > 0 && (
            <CalendarTable
              items={view.items}
              config={view.config}
              secrets={view.secrets}
              onPatch={patchPost}
              onDelete={deleteItem}
              onReload={() => void load()}
            />
          )}

          {!view && !error && <p className="mt-3 text-sm text-[#a89f8d]">loading…</p>}
        </section>
      </div>
    </>
  );
}
