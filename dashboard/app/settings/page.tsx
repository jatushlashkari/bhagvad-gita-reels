'use client';
import { useCallback, useEffect, useState } from 'react';
import type { ConfigView } from '../../../shared/config.ts';
import { PageHeader } from '../components/shell/PageHeader.tsx';
import { ChannelCard } from '../components/settings/ChannelCard.tsx';
import { ScheduleCard } from '../components/settings/ScheduleCard.tsx';

export default function SettingsPage() {
  const [config, setConfig] = useState<ConfigView | null>(null);
  const [chapters, setChapters] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/config')
      .then(async (r) => {
        const body = (await r.json()) as ConfigView & { error?: string };
        if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
        return body;
      })
      .then(setConfig)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    fetch('/api/state')
      .then((r) => r.json())
      .then((s: { chapters: number[] }) => setChapters(s.chapters))
      .catch(() => {});
  }, []);
  useEffect(load, [load]);

  return (
    <>
      <PageHeader title="Settings" description="Everything the reels and the automation read." />
      {error && <p className="mb-4 text-sm text-danger">{error}</p>}
      {!config && !error && <p className="text-sm text-muted">loading…</p>}
      {config && (
        <div className="space-y-6">
          <ChannelCard config={config} chapters={chapters} onSaved={setConfig} />
          <ScheduleCard config={config} onSaved={setConfig} />
        </div>
      )}
    </>
  );
}
