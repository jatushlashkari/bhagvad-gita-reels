'use client';
import { useEffect, useMemo, useState } from 'react';
import { PLATFORMS } from '../../../../shared/schedule.ts';
import { validateConfigPatch, type ConfigView } from '../../../../shared/config.ts';
import { SettingsCard } from './SettingsCard.tsx';
import { NumberField, SelectField, TimeField } from './fields.tsx';

/** Intl.supportedValuesOf is in every browser this panel runs in; the fallback keeps
 *  the select usable rather than empty if it ever is not. */
function timezones(current: string): string[] {
  try {
    const all = (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone');
    return all.includes(current) ? all : [current, ...all];
  } catch {
    return [current, 'Asia/Kolkata', 'UTC'];
  }
}

export function ScheduleCard({ config, onSaved }: { config: ConfigView; onSaved: (next: ConfigView) => void }) {
  const [draft, setDraft] = useState(config.schedule);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  useEffect(() => setDraft(config.schedule), [config.schedule]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(config.schedule);
  const localErrors = useMemo(() => {
    if (!dirty) return {};
    const r = validateConfigPatch({ schedule: draft });
    return r.ok ? {} : r.errors;
  }, [draft, dirty]);
  const errors = { ...localErrors, ...serverErrors };

  async function save() {
    setSaving(true);
    setError(null);
    setServerErrors({});
    try {
      const res = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ schedule: draft }),
      });
      const body = (await res.json().catch(() => ({}))) as { errors?: Record<string, string>; error?: string } & Partial<ConfigView>;
      if (!res.ok) {
        if (body.errors) setServerErrors(body.errors);
        else setError(body.error ?? `save failed (${res.status})`);
        return;
      }
      onSaved(body as ConfigView);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsCard
      title="Publishing schedule"
      description="How far ahead the publisher fills the calendar, and the slot each platform gets."
      dirty={dirty}
      saving={saving}
      error={error}
      saved={saved}
      onSave={save}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label="days ahead"
          hint="1-14"
          value={draft.daysAhead}
          min={1}
          max={14}
          error={errors['schedule.daysAhead']}
          onChange={(daysAhead) => setDraft((d) => ({ ...d, daysAhead }))}
        />
        <SelectField
          label="time zone"
          value={draft.timezone}
          options={timezones(draft.timezone).map((t) => ({ value: t, label: t }))}
          error={errors['schedule.timezone']}
          onChange={(timezone) => setDraft((d) => ({ ...d, timezone }))}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {PLATFORMS.map((p) => (
          <TimeField
            key={p}
            label={`${p} time`}
            value={draft.defaultTimes[p]}
            error={errors[`schedule.defaultTimes.${p}`]}
            onChange={(v) => setDraft((d) => ({ ...d, defaultTimes: { ...d.defaultTimes, [p]: v } }))}
          />
        ))}
      </div>
      <p className="text-xs text-muted">Times are wall-clock in the zone above; the calendar stores them as UTC.</p>
    </SettingsCard>
  );
}
