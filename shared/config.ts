import { PLATFORMS, validateScheduleConfig, type ScheduleConfig } from './schedule.ts';

export const FORMATS = ['classic', 'cinema'] as const;
export type ReelFormat = (typeof FORMATS)[number];
export const MODES = ['calendar', 'daily'] as const;
export type ConfigMode = (typeof MODES)[number];
/** The daily pipeline posts to these two. Facebook publishes from the calendar only
 *  (pipeline/run.ts refuses it in the daily loop), so it is deliberately not offered. */
export const DAILY_PLATFORMS = ['youtube', 'instagram'] as const;
export type DailyPlatform = (typeof DAILY_PLATFORMS)[number];

export const HANDLE_RE = /^@[A-Za-z0-9._]{1,30}$/;
export const VERSE_REF_RE = /^[a-z]+:\d+:\d+$/;
export const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export type ConfigView = {
  handle: string;
  startRef: string;
  platforms: DailyPlatform[];
  format: ReelFormat;
  mode: ConfigMode;
  schedule: ScheduleConfig;
};
export type ConfigPatch = Partial<ConfigView>;
export type PatchResult = { ok: true; value: ConfigPatch } | { ok: false; errors: Record<string, string> };

const KEYS: readonly string[] = ['handle', 'startRef', 'platforms', 'format', 'mode', 'schedule'];

function isTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Validates a partial settings change. Never throws: the form renders `errors` under
 *  the offending fields and the route answers them as a 400, so both sides say the
 *  same thing. Only the keys present are checked — a card saves its own fields. */
export function validateConfigPatch(input: unknown, opts: { verseRefs?: Set<string> } = {}): PatchResult {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return { ok: false, errors: { _: 'expected an object of settings' } };
  const patch = input as Record<string, unknown>;
  if (Object.keys(patch).length === 0) return { ok: false, errors: { _: 'nothing to save' } };

  const errors: Record<string, string> = {};
  const value: ConfigPatch = {};
  for (const key of Object.keys(patch)) if (!KEYS.includes(key)) errors[key] = 'unknown setting';

  if ('handle' in patch) {
    const handle = typeof patch.handle === 'string' ? patch.handle.trim() : '';
    if (!HANDLE_RE.test(handle)) errors.handle = 'use @ then 1-30 letters, digits, dots or underscores';
    else value.handle = handle;
  }

  if ('startRef' in patch) {
    const ref = typeof patch.startRef === 'string' ? patch.startRef.trim() : '';
    if (!VERSE_REF_RE.test(ref)) errors.startRef = 'use book:chapter:verse, e.g. gita:1:1';
    else if (opts.verseRefs && !opts.verseRefs.has(ref)) errors.startRef = `${ref} is not a verse in sources/gita.json`;
    else value.startRef = ref;
  }

  if ('platforms' in patch) {
    const list = patch.platforms;
    if (!Array.isArray(list)) errors.platforms = 'expected a list of platforms';
    else if (list.includes('facebook')) errors.platforms = 'Facebook publishes from the calendar, not the daily run';
    else if (!list.every((p) => (DAILY_PLATFORMS as readonly unknown[]).includes(p))) errors.platforms = 'unknown platform';
    else if (list.length === 0) errors.platforms = 'pick at least one platform';
    else value.platforms = DAILY_PLATFORMS.filter((p) => list.includes(p));
  }

  if ('format' in patch) {
    if (!(FORMATS as readonly unknown[]).includes(patch.format)) errors.format = `expected ${FORMATS.join(' or ')}`;
    else value.format = patch.format as ReelFormat;
  }

  if ('mode' in patch) {
    if (!(MODES as readonly unknown[]).includes(patch.mode)) errors.mode = `expected ${MODES.join(' or ')}`;
    else value.mode = patch.mode as ConfigMode;
  }

  if ('schedule' in patch) {
    const s = patch.schedule;
    if (!s || typeof s !== 'object' || Array.isArray(s)) errors.schedule = 'expected an object';
    else {
      const o = s as Record<string, unknown>;
      if (typeof o.daysAhead !== 'number' || !Number.isInteger(o.daysAhead) || o.daysAhead < 1 || o.daysAhead > 14)
        errors['schedule.daysAhead'] = 'a whole number of days, 1 to 14';
      const times = (o.defaultTimes && typeof o.defaultTimes === 'object' ? o.defaultTimes : {}) as Record<string, unknown>;
      for (const p of PLATFORMS)
        if (typeof times[p] !== 'string' || !HHMM_RE.test(times[p] as string))
          errors[`schedule.defaultTimes.${p}`] = 'use HH:mm, e.g. 07:00';
      if (!isTimezone(o.timezone)) errors['schedule.timezone'] = 'unknown time zone';
      // The pipeline's reader clamps; a form must not silently change what you typed,
      // so the value is only accepted once every field above passed.
      if (!Object.keys(errors).some((k) => k.startsWith('schedule'))) value.schedule = validateScheduleConfig(s);
    }
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value };
}

/** config.json as parsed from disk + a validated patch -> the object to write back.
 *  The spread order is the whole point: `raw` first, so a root key this panel never
 *  learned about (a hand-added `voice` block, say) survives a Settings save instead of
 *  being dropped by the rewrite. Pure and free of file IO so it can be tested directly —
 *  the merge used to be one inline expression in the dashboard's backend, which is a
 *  module the root test suite cannot even import. */
export function mergeConfig(raw: Record<string, unknown>, patch: ConfigPatch): Record<string, unknown> {
  return { ...raw, ...patch };
}
