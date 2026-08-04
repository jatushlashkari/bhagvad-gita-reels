'use client';
import { useEffect, useState } from 'react';

type State = {
  lastPosted: { ref: string; youtube?: string; instagram?: string } | null;
  nextRef: string | null;
  totalPosted: number;
  chapters: number[];
};

type SyncResult = { ok: boolean; output: string };

/** `gita:2:47` -> `2.47` — the compact form used everywhere in the dashboard chrome
 *  (the reel itself spells it out as "अध्याय 2 • श्लोक 47"). */
function refLabel(ref: string): string {
  const [, chapter, verse] = ref.split(':');
  return chapter && verse ? `${chapter}.${verse}` : ref;
}

function Chip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-[#0d0817] px-3 py-2 ring-1 ring-white/5">
      <dt className="text-[10px] uppercase tracking-[0.18em] text-[#a89f8d]">{label}</dt>
      <dd className="mt-1 flex items-baseline gap-2 text-lg text-[#f5efe0] tabular-nums">{children}</dd>
    </div>
  );
}

export function StatusBar() {
  const [state, setState] = useState<State | null>(null);
  const [sync, setSync] = useState<SyncResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch('/api/state')
      .then((r) => r.json())
      .then(setState)
      .catch(() => setState(null));
  }, []);

  async function runSync() {
    setSyncing(true);
    setSync(null);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      setSync((await res.json()) as SyncResult);
    } catch (e) {
      setSync({ ok: false, output: e instanceof Error ? e.message : String(e) });
    } finally {
      setOpen(true);
      setSyncing(false);
    }
  }

  const posted = state?.lastPosted;

  return (
    <section className="rounded-xl bg-[#161028] p-4 ring-1 ring-white/5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#a89f8d]">Status</h2>
        <button
          type="button"
          onClick={runSync}
          disabled={syncing}
          className="rounded-lg bg-[#e8c874] px-3 py-1.5 text-sm font-medium text-[#0d0817] transition-colors hover:bg-[#f2d894] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e8c874]/60 disabled:opacity-50"
        >
          {syncing ? 'Syncing…' : 'Sync to GitHub'}
        </button>
      </div>

      <dl className="mt-3 grid gap-3 sm:grid-cols-3">
        <Chip label="last posted">
          {posted ? (
            <>
              <span>{refLabel(posted.ref)}</span>
              <span className="text-xs text-[#a89f8d]">
                <span className={posted.youtube ? 'text-[#e8c874]' : 'opacity-40'}>
                  {posted.youtube ? '✔' : '·'} YT
                </span>
                <span className="mx-1 opacity-30">|</span>
                <span className={posted.instagram ? 'text-[#e8c874]' : 'opacity-40'}>
                  {posted.instagram ? '✔' : '·'} IG
                </span>
              </span>
            </>
          ) : (
            <span className="text-base text-[#a89f8d]">nothing posted yet</span>
          )}
        </Chip>
        <Chip label="next verse">
          {state?.nextRef ? (
            <span className="text-[#e8c874]">{refLabel(state.nextRef)}</span>
          ) : (
            <span className="text-base text-[#a89f8d]">{state ? 'none queued' : '…'}</span>
          )}
        </Chip>
        <Chip label="total posted">
          <span>{state ? state.totalPosted : '…'}</span>
        </Chip>
      </dl>

      {sync && (
        <div className={`mt-3 rounded-lg border ${sync.ok ? 'border-white/10' : 'border-red-500/70'}`}>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs text-[#a89f8d] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e8c874]/60"
          >
            <span className={sync.ok ? 'text-[#a89f8d]' : 'text-red-400'}>
              {sync.ok ? 'sync ok' : 'sync failed'} — git output
            </span>
            <span aria-hidden className="opacity-60">{open ? '▾' : '▸'}</span>
          </button>
          {open && (
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words border-t border-white/5 px-3 py-2 font-mono text-[11px] leading-relaxed text-[#a89f8d]">
              {sync.output || '(no output)'}
            </pre>
          )}
        </div>
      )}
    </section>
  );
}
