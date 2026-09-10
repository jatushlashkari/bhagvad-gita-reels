'use client';
import { useEffect, useState } from 'react';
import { PLATFORMS } from '../../../../shared/schedule.ts';
import type { ConnectionsView } from '../../../lib/backend.ts';
import { headingClass, panelClass } from '../ui.tsx';

const SETUP: Record<string, string> = {
  youtube: 'SETUP.md §4 — Google Cloud → YouTube refresh token',
  instagram: 'SETUP.md §3 — Meta app → Instagram token',
  facebook: 'SETUP.md §3b — Facebook Page → Reels token',
};

function Dot({ on }: { on: boolean | null }) {
  return (
    <span
      className={`inline-block size-2 rounded-full ${on === null ? 'bg-muted' : on ? 'bg-success' : 'bg-danger'}`}
      aria-hidden
    />
  );
}

export function ConnectionsCard() {
  const [view, setView] = useState<ConnectionsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/connections')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setView)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <section className={panelClass}>
      <h2 className="text-base font-semibold text-fg">Connections</h2>
      <p className="mt-1 text-sm text-muted">
        Where each platform&rsquo;s secrets are. Set them with <code>gh secret set</code> and{' '}
        <code>.env</code> — the panel never writes them.
      </p>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {view && (
        <>
          {/* pr-6 on every cell but the last: headingClass widens the letters with
              tracking-[0.18em], and with no gutter the four labels ran together into one
              string ("PLATFORM THIS MACHINE (.ENV)"). Body cells match it so a long key
              list can't butt against the next column either. */}
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className={headingClass}>
                <th scope="col" className="py-1 pr-6 text-left">platform</th>
                <th scope="col" className="py-1 pr-6 text-left">this machine (.env)</th>
                <th scope="col" className="py-1 pr-6 text-left">GitHub Actions</th>
                <th scope="col" className="py-1 text-left">how to set</th>
              </tr>
            </thead>
            <tbody>
              {PLATFORMS.map((p) => (
                <tr key={p} className="border-t border-line">
                  <td className="py-2 pr-6 text-fg">{p}</td>
                  <td className="py-2 pr-6 text-muted">
                    <Dot on={view.platforms[p].local} />{' '}
                    {view.platforms[p].local ? (
                      'present'
                    ) : (
                      // `missingLocal`, not `secrets`: name the keys this machine is actually
                      // short of, never the platform's whole list — someone two keys into
                      // YouTube's three needs to be told about the third. Never a value, just
                      // the env var names, so they know exactly what to add to .env.
                      <span className="font-mono text-[11px]">{view.platforms[p].missingLocal.join(', ')}</span>
                    )}
                  </td>
                  <td className="py-2 pr-6 text-muted">
                    <Dot on={view.platforms[p].actions} />{' '}
                    {view.platforms[p].actions === null ? 'unknown' : view.platforms[p].actions ? 'present' : 'missing'}
                  </td>
                  <td className="py-2 text-muted">{SETUP[p]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-sm text-muted">
            Workflows: daily-reel <strong className="text-fg">{view.workflows['daily-reel']}</strong> · publisher{' '}
            <strong className="text-fg">{view.workflows.publisher}</strong>
            {!view.ghAvailable && ' — GitHub CLI not available here, so only the local column is known.'}
          </p>
        </>
      )}
    </section>
  );
}
