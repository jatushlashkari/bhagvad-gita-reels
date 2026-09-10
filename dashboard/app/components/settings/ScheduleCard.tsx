'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PLATFORMS } from '../../../../shared/schedule.ts';
import { validateConfigPatch, type ConfigView } from '../../../../shared/config.ts';
import { BUSY_MESSAGE } from '../ui.tsx';
import { SettingsCard } from './SettingsCard.tsx';
import { NumberField, SelectField, TimeField } from './fields.tsx';

/** Intl.supportedValuesOf is in every browser this panel runs in; the fallback keeps
 *  the select usable rather than empty if it ever is not.
 *
 *  The current zone is always first, whether or not the list already contains it: this is a
 *  native <select> over ~420 entries with no search box of its own (it has the browser's
 *  type-ahead, which is what ships here), so the zone you are already on should never need
 *  scrolling for. Filtering it out of the tail keeps the option keys unique. */
function timezones(current: string): string[] {
  let all: string[];
  try {
    all = (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone');
  } catch {
    all = ['Asia/Kolkata', 'UTC'];
  }
  return [current, ...all.filter((t) => t !== current)];
}

export function ScheduleCard({ config, onSaved }: { config: ConfigView; onSaved: (next: ConfigView) => void }) {
  const [draft, setDraft] = useState(config.schedule);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const dirty = JSON.stringify(draft) !== JSON.stringify(config.schedule);
  const localErrors = useMemo(() => {
    if (!dirty) return {};
    const r = validateConfigPatch({ schedule: draft });
    return r.ok ? {} : r.errors;
  }, [draft, dirty]);
  const errors = { ...localErrors, ...serverErrors };

  // A save from the *sibling* card also replaces `config` (same `setConfig` in the page), which
  // would otherwise stomp an unsaved edit here just because a fresh object arrived. Only resync
  // when this card has nothing of its own pending.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (!dirtyRef.current) setDraft(config.schedule);
  }, [config.schedule]);

  // A stale server error (from a prior failed save) must not survive the next edit — otherwise
  // fixing the field back to the current config value disables Save and leaves the message stuck.
  useEffect(() => setServerErrors({}), [draft]);

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
        if (res.status === 409) setError(BUSY_MESSAGE);
        else if (body.errors) setServerErrors(body.errors);
        else setError(body.error ?? `save failed (${res.status})`);
        return;
      }
      const next = body as ConfigView;
      onSaved(next);
      setDraft(next.schedule);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsCard
      id="schedule"
      title="Publishing schedule"
      description="How far ahead the publisher fills the calendar, and the slot each platform gets."
      dirty={dirty}
      saving={saving}
      error={error}
      saved={saved}
      invalid={Object.keys(errors).length > 0}
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
