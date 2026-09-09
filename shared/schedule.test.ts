import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SCHEDULE_CONFIG, PLATFORMS, addDays, isoToLocal, itemSlug, localDateOf, localToIso, sortItems,
  validateScheduleConfig, validateScheduleFile, type ScheduleItem,
} from './schedule.ts';

const post = (at: string | null) => ({ at, status: 'scheduled' as const, caption: 'c' });
const item = (id: string, at: string | null, renderedAt = '2026-09-09T00:00:00.000Z'): ScheduleItem => ({
  id, ref: 'gita:2:47', format: 'cinema', hook: 'h', renderedAt, asset: { releaseTag: 'reel-gita-2-47', url: '' },
  thumbnail: `thumbs/${id}.jpg`, credits: [], posts: { instagram: post(at), facebook: post(at), youtube: post(at) },
});

describe('timezone helpers (Intl only)', () => {
  it('IST wall time → UTC ISO and back', () => {
    expect(localToIso('2026-09-12', '07:00', 'Asia/Kolkata')).toBe('2026-09-12T01:30:00.000Z');
    expect(isoToLocal('2026-09-12T01:30:00.000Z', 'Asia/Kolkata')).toEqual({ date: '2026-09-12', time: '07:00' });
  });
  it('handles a DST zone on both sides of the change', () => {
    expect(localToIso('2026-07-01', '09:00', 'Europe/London')).toBe('2026-07-01T08:00:00.000Z');
    expect(localToIso('2026-12-01', '09:00', 'Europe/London')).toBe('2026-12-01T09:00:00.000Z');
  });
  it('localDateOf crosses midnight correctly', () => {
    expect(localDateOf(new Date('2026-09-11T20:00:00Z'), 'Asia/Kolkata')).toBe('2026-09-12');
    expect(localDateOf(new Date('2026-09-11T20:00:00Z'), 'UTC')).toBe('2026-09-11');
  });
  it('addDays rolls months and years', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('ids and config', () => {
  it('itemSlug shape', () => {
    expect(itemSlug('gita:2:47', '2026-09-12', 'a1b2')).toBe('gita-2-47-20260912-a1b2');
    expect(itemSlug('custom:my-quote-x9', '2026-09-12', 'a1b2')).toBe('custom-my-quote-x9-20260912-a1b2');
  });
  it('validateScheduleConfig clamps and defaults without throwing', () => {
    expect(validateScheduleConfig(undefined)).toEqual(DEFAULT_SCHEDULE_CONFIG);
    expect(validateScheduleConfig({ daysAhead: 99 }).daysAhead).toBe(14);
    expect(validateScheduleConfig({ daysAhead: 0 }).daysAhead).toBe(1);
    expect(validateScheduleConfig({ defaultTimes: { instagram: '25:99' } }).defaultTimes.instagram).toBe('07:00');
    expect(validateScheduleConfig({ timezone: 'Mars/Olympus' }).timezone).toBe('Asia/Kolkata');
    expect(validateScheduleConfig({ timezone: 'UTC', defaultTimes: { youtube: '18:30' } })).toEqual({
      ...DEFAULT_SCHEDULE_CONFIG, timezone: 'UTC', defaultTimes: { ...DEFAULT_SCHEDULE_CONFIG.defaultTimes, youtube: '18:30' },
    });
  });
  it('validateScheduleFile accepts a good file and throws loudly on a bad one', () => {
    const good = { items: [item('gita-2-47-20260912-a1b2', '2026-09-12T01:30:00.000Z')] };
    expect(validateScheduleFile(good)).toEqual(good);
    expect(() => validateScheduleFile({ items: [{ ...good.items[0], posts: {} }] })).toThrow(/posts/);
    expect(() => validateScheduleFile({ items: [{ ...good.items[0], id: 'Bad Id' }] })).toThrow(/id/);
    expect(() => validateScheduleFile({ items: [{ ...good.items[0], posts: { ...good.items[0].posts, youtube: { ...post(null), status: 'sent' } } }] })).toThrow(/status/);
    expect(() => validateScheduleFile('nope')).toThrow(/items/);
    expect(PLATFORMS).toEqual(['instagram', 'facebook', 'youtube']);
  });
  it('credits: optional on input, but must be an array of strings when present', () => {
    const good = { items: [item('gita-2-47-20260912-a1b2', '2026-09-12T01:30:00.000Z')] };
    const bare = { ...good.items[0] } as Partial<ScheduleItem>;
    delete bare.credits;
    expect(validateScheduleFile({ items: [bare] }).items[0].credits).toEqual([]);
    expect(() => validateScheduleFile({ items: [{ ...good.items[0], credits: 'x' }] })).toThrow(/credits/);
    expect(() => validateScheduleFile({ items: [{ ...good.items[0], credits: [1] }] })).toThrow(/credits/);
  });
});

describe('sortItems', () => {
  it('orders by earliest post time, unscheduled last, stable', () => {
    const a = item('a', '2026-09-13T01:30:00.000Z');
    const b = item('b', '2026-09-12T01:30:00.000Z');
    const c = item('c', null, '2026-09-08T00:00:00.000Z');
    const d = item('d', null, '2026-09-07T00:00:00.000Z');
    expect(sortItems([a, c, b, d]).map((i) => i.id)).toEqual(['b', 'a', 'd', 'c']);
  });
});
