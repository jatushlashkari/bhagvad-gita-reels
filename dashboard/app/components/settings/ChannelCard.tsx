'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FORMATS, MODES, DAILY_PLATFORMS, validateConfigPatch, type ConfigView, type DailyPlatform } from '../../../../shared/config.ts';
import { BUSY_MESSAGE } from '../ui.tsx';
import { SettingsCard } from './SettingsCard.tsx';
import { CheckboxRow, SelectField, TextField } from './fields.tsx';

const MODE_HINT: Record<string, string> = {
  calendar: 'the hourly publisher fills and posts the calendar',
  daily: 'the old 7:00 AM workflow posts the next verse',
};

export function ChannelCard({
  config,
  chapters,
  onSaved,
}: {
  config: ConfigView;
  chapters: number[];
  onSaved: (next: ConfigView) => void;
}) {
  const [draft, setDraft] = useState(config);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const [chapter, verse] = useMemo(() => {
    const [, c, v] = draft.startRef.split(':');
    return [Number(c) || 1, Number(v) || 1];
  }, [draft.startRef]);

  const patch = useMemo(() => {
    const p: Record<string, unknown> = {};
    if (draft.handle !== config.handle) p.handle = draft.handle;
    if (draft.startRef !== config.startRef) p.startRef = draft.startRef;
    if (draft.format !== config.format) p.format = draft.format;
    if (draft.mode !== config.mode) p.mode = draft.mode;
    if (draft.platforms.join() !== config.platforms.join()) p.platforms = draft.platforms;
    return p;
  }, [draft, config]);
  const dirty = Object.keys(patch).length > 0;
  // The same validator the route runs, so a field that would be refused says so here first.
  const localErrors = useMemo(() => {
    if (!dirty) return {};
    const r = validateConfigPatch(patch);
    return r.ok ? {} : r.errors;
  }, [patch, dirty]);
  const errors = { ...localErrors, ...serverErrors };

  // A save from the *sibling* card also replaces `config` (same `setConfig` in the page), which
  // would otherwise stomp an unsaved edit here just because a fresh object arrived. Only resync
  // when this card has nothing of its own pending.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (!dirtyRef.current) setDraft(config);
  }, [config]);

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
        body: JSON.stringify(patch),
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
      setDraft(next);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }

  const togglePlatform = (p: DailyPlatform, on: boolean) =>
    setDraft((d) => ({ ...d, platforms: DAILY_PLATFORMS.filter((x) => (x === p ? on : d.platforms.includes(x))) }));

  return (
    <SettingsCard
      title="Channel"
      description="Who the reels are for and what the automation renders by default."
      dirty={dirty}
      saving={saving}
      error={error}
      saved={saved}
      invalid={Object.keys(errors).length > 0}
      onSave={save}
    >
      <TextField
        label="handle"
        hint="stamped on every reel"
        value={draft.handle}
        placeholder="@yourhandle"
        maxLength={31}
        error={errors.handle}
        onChange={(handle) => setDraft((d) => ({ ...d, handle }))}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="default format"
          value={draft.format}
          options={FORMATS.map((f) => ({ value: f, label: f }))}
          error={errors.format}
          onChange={(format) => setDraft((d) => ({ ...d, format: format as ConfigView['format'] }))}
        />
        <SelectField
          label="mode"
          hint={MODE_HINT[draft.mode]}
          value={draft.mode}
          options={MODES.map((m) => ({ value: m, label: m }))}
          error={errors.mode}
          onChange={(mode) => setDraft((d) => ({ ...d, mode: mode as ConfigView['mode'] }))}
        />
        <SelectField
          label="start chapter"
          value={String(chapter)}
          options={Array.from({ length: chapters.length || 18 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
          onChange={(c) => setDraft((d) => ({ ...d, startRef: `gita:${c}:1` }))}
        />
        <SelectField
          label="start verse"
          hint="auto-fill walks forward from here"
          value={String(verse)}
          options={Array.from({ length: chapters[chapter - 1] ?? 1 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
          error={errors.startRef}
          onChange={(v) => setDraft((d) => ({ ...d, startRef: `gita:${chapter}:${v}` }))}
        />
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted">daily-mode platforms</p>
        <div className="mt-2 space-y-2">
          {DAILY_PLATFORMS.map((p) => (
            <CheckboxRow
              key={p}
              label={p}
              checked={draft.platforms.includes(p)}
              onChange={(on) => togglePlatform(p, on)}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">Facebook publishes from the calendar, so it is not listed here.</p>
        {errors.platforms && <p className="mt-1 text-xs text-danger">{errors.platforms}</p>}
      </div>
    </SettingsCard>
  );
}
