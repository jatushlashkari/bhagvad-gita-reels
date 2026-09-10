import { describe, it, expect } from 'vitest';
import { DEFAULT_SCHEDULE_CONFIG } from './schedule.ts';
import { mergeConfig, validateConfigPatch } from './config.ts';

const ok = (r: ReturnType<typeof validateConfigPatch>) => {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r.errors)}`);
  return r.value;
};
const errs = (r: ReturnType<typeof validateConfigPatch>) => (r.ok ? {} : r.errors);

describe('validateConfigPatch', () => {
  it('rejects non-objects, empty patches and unknown keys', () => {
    expect(errs(validateConfigPatch(null))._).toMatch(/object/);
    expect(errs(validateConfigPatch([]))._).toMatch(/object/);
    expect(errs(validateConfigPatch({}))._).toMatch(/nothing/);
    expect(errs(validateConfigPatch({ colour: 'red' })).colour).toMatch(/unknown/);
  });

  it('handle: shape checked, trimmed', () => {
    expect(ok(validateConfigPatch({ handle: '  @gita.daily_1 ' })).handle).toBe('@gita.daily_1');
    expect(errs(validateConfigPatch({ handle: 'gita' })).handle).toMatch(/@/);
    expect(errs(validateConfigPatch({ handle: '@' })).handle).toBeTruthy();
    expect(errs(validateConfigPatch({ handle: `@${'x'.repeat(31)}` })).handle).toBeTruthy();
    expect(errs(validateConfigPatch({ handle: '@has space' })).handle).toBeTruthy();
  });

  it('startRef: shape and, when the verse list is given, existence', () => {
    expect(ok(validateConfigPatch({ startRef: 'gita:1:1' })).startRef).toBe('gita:1:1');
    expect(errs(validateConfigPatch({ startRef: '1:1' })).startRef).toMatch(/book:chapter:verse/);
    const verseRefs = new Set(['gita:1:1']);
    expect(errs(validateConfigPatch({ startRef: 'gita:99:1' }, { verseRefs })).startRef).toMatch(/not a verse/);
    expect(ok(validateConfigPatch({ startRef: 'gita:1:1' }, { verseRefs })).startRef).toBe('gita:1:1');
  });

  it('platforms: canonical order, deduped, facebook named as calendar-only', () => {
    expect(ok(validateConfigPatch({ platforms: ['instagram', 'youtube', 'instagram'] })).platforms).toEqual(['youtube', 'instagram']);
    expect(errs(validateConfigPatch({ platforms: [] })).platforms).toMatch(/at least one/);
    expect(errs(validateConfigPatch({ platforms: ['facebook'] })).platforms).toMatch(/calendar/);
    expect(errs(validateConfigPatch({ platforms: ['tiktok'] })).platforms).toMatch(/unknown/);
    expect(errs(validateConfigPatch({ platforms: 'youtube' })).platforms).toMatch(/list/);
  });

  it('format and mode come from the shared lists', () => {
    expect(ok(validateConfigPatch({ format: 'cinema' })).format).toBe('cinema');
    expect(errs(validateConfigPatch({ format: 'narrated' })).format).toMatch(/classic/);
    expect(ok(validateConfigPatch({ mode: 'daily' })).mode).toBe('daily');
    expect(errs(validateConfigPatch({ mode: 'hourly' })).mode).toMatch(/calendar/);
  });

  it('schedule: every field checked, errors keyed by field path', () => {
    expect(ok(validateConfigPatch({ schedule: DEFAULT_SCHEDULE_CONFIG })).schedule).toEqual(DEFAULT_SCHEDULE_CONFIG);
    const bad = validateConfigPatch({
      schedule: { ...DEFAULT_SCHEDULE_CONFIG, daysAhead: 99, defaultTimes: { ...DEFAULT_SCHEDULE_CONFIG.defaultTimes, youtube: '25:00' }, timezone: 'Mars/Olympus' },
    });
    expect(errs(bad)['schedule.daysAhead']).toMatch(/1 to 14/);
    expect(errs(bad)['schedule.defaultTimes.youtube']).toMatch(/HH:mm/);
    expect(errs(bad)['schedule.timezone']).toMatch(/time zone/);
    expect(errs(validateConfigPatch({ schedule: 'now' })).schedule).toMatch(/object/);
  });

  it('collects errors from every field in one pass', () => {
    const e = errs(validateConfigPatch({ handle: 'x', format: 'nope' }));
    expect(Object.keys(e).sort()).toEqual(['format', 'handle']);
  });
});

describe('mergeConfig', () => {
  it('keeps root keys the settings panel knows nothing about', () => {
    const raw = { handle: '@old', voice: { rate: '+8%' }, notes: ['keep me'] };
    const merged = mergeConfig(raw, ok(validateConfigPatch({ handle: '@new' })));
    expect(merged).toEqual({ handle: '@new', voice: { rate: '+8%' }, notes: ['keep me'] });
  });

  it('overwrites only the keys the patch carries', () => {
    const raw = { handle: '@old', format: 'classic', mode: 'daily' };
    expect(mergeConfig(raw, ok(validateConfigPatch({ format: 'cinema' })))).toEqual({
      handle: '@old', format: 'cinema', mode: 'daily',
    });
  });

  it('does not mutate the parsed file it was handed', () => {
    const raw = { handle: '@old', voice: { rate: '+8%' } };
    mergeConfig(raw, ok(validateConfigPatch({ handle: '@new' })));
    expect(raw).toEqual({ handle: '@old', voice: { rate: '+8%' } });
  });
});
