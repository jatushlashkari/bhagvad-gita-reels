'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { REF_PATTERN } from '../../../../shared/custom-quotes.ts';
import { DEFAULT_SCHEDULE_CONFIG, addDays, localDateOf } from '../../../../shared/schedule.ts';
import type { CalendarView } from '../../../lib/backend.ts';
import { ghostButtonClass, labelClass, selectClass } from '../studio/ui.tsx';
import { BUSY } from './CalendarTable.tsx';

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

/** Schedules the cut that is already on disk. Mounted in Studio's Render section once a render
 *  has finished, so `fromLastRender` is honest: the publisher reuses out/reel.mp4 instead of
 *  spending another few minutes rendering the same frames.
 *
 *  The prop is `sourceRef`, not `ref` — React reserves that name on every component. */
export function AddToCalendar({ sourceRef }: { sourceRef: string }) {
  // The calendar's timezone decides which day "tomorrow" is; until /api/calendar answers there is
  // no honest default date to show, so the button waits rather than defaulting to this browser's.
  const [tz, setTz] = useState(DEFAULT_SCHEDULE_CONFIG.timezone);
  const [date, setDate] = useState('');
  const [log, setLog] = useState('');
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<null | boolean>(null);
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    let cancelled = false;
    const apply = (zone: string) => {
      if (cancelled) return;
      setTz(zone);
      setDate(addDays(localDateOf(new Date(), zone), 1));
    };
    fetch('/api/calendar')
      .then((r) => (r.ok ? r.json() : null))
      // A calendar this machine cannot read is still a calendar the publisher can write to, so
      // the control stays usable on config.json's own default zone.
      .then((v: CalendarView | null) => apply(v?.config.timezone ?? DEFAULT_SCHEDULE_CONFIG.timezone))
      .catch(() => apply(DEFAULT_SCHEDULE_CONFIG.timezone));
    return () => {
      cancelled = true;
    };
  }, []);

  async function add() {
    // The route 400s on a ref it does not recognise; saying so here costs nothing and names the
    // value that was wrong.
    if (!REF_PATTERN.test(sourceRef)) {
      setLog(`${sourceRef} is not a ref the calendar accepts`);
      setDone(false);
      return;
    }
    setRunning(true);
    setLog('');
    setDone(null);
    try {
      const res = await fetch('/api/calendar/items', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // 'cinema' because that is the only composition the Studio previews and renders — the
        // reel now sitting in out/ is a cinema cut, and the row must say so.
        body: JSON.stringify({ ref: sourceRef, date, format: 'cinema', fromLastRender: true }),
      });
      if (res.status === 409) {
        setLog(BUSY);
        setDone(false);
        return;
      }
      if (!res.ok) {
        setLog(`HTTP ${res.status}: ${await errorDetail(res)}`);
        setDone(false);
        return;
      }
      if (!res.body) {
        setLog('The server sent no response body — nothing to stream.');
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
      setLog(e instanceof Error ? e.message : String(e));
      setDone(false);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mt-4 border-t border-white/5 pt-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className={labelClass}>date</span>
          <input
            type="date"
            aria-label="calendar date"
            className={`${selectClass} mt-1`}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <button type="button" className={`${ghostButtonClass} mb-0.5`} disabled={running || !date} onClick={() => void add()}>
          {running ? 'Adding…' : 'Add to calendar'}
        </button>
        <span className="mb-2 text-xs text-[#a89f8d]">
          {running
            ? 'archiving the release and cutting a thumbnail — a few seconds'
            : `schedules this cut for that day in ${tz}`}
        </span>
      </div>

      {(log || running) && (
        <pre
          ref={logRef}
          data-testid="add-log"
          className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[#0d0817] p-3 font-mono text-[11px] leading-relaxed text-[#a89f8d] ring-1 ring-white/5"
        >
          {log || 'starting…'}
        </pre>
      )}
      {done === true && (
        <p className="mt-3 text-sm text-[#a89f8d]">
          scheduled —{' '}
          <Link href="/calendar" className="text-[#e8c874] transition-colors hover:underline">
            open calendar
          </Link>
        </p>
      )}
      {done === false && <p className="mt-3 text-sm text-red-400">failed — log above</p>}
    </div>
  );
}
