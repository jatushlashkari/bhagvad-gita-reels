import { describe, it, expect } from 'vitest';
import { applyPublishResult, duePosts, hookFor, planAutoFill, prefillPosts } from './schedule-plan.ts';
import { DEFAULT_SCHEDULE_CONFIG, type PostRecord, type ScheduleItem } from '../shared/schedule.ts';
import type { ReelProps } from '../shared/types.ts';

const cfg = DEFAULT_SCHEDULE_CONFIG; // IST, 07:00/07:05/07:10
const P = (at: string | null, status: PostRecord['status'] = 'scheduled', extra: Partial<PostRecord> = {}): PostRecord => ({ at, status, caption: 'c', ...extra });
const I = (id: string, ref: string, at: string | null, posts?: Partial<ScheduleItem['posts']>): ScheduleItem => ({
  id, ref, format: 'cinema', hook: 'h', renderedAt: '2026-09-09T00:00:00.000Z', asset: { releaseTag: 't', url: '' }, thumbnail: `thumbs/${id}.jpg`, credits: [],
  posts: { instagram: P(at), facebook: P(at), youtube: P(at), ...posts },
});
const order = ['gita:1:1', 'gita:1:2', 'gita:1:3', 'gita:1:4', 'gita:1:5'];
const noState = { posted: [] };

describe('planAutoFill', () => {
  it('fills the next daysAhead days starting today when the first slot is still ahead', () => {
    // 2026-09-10 05:00 IST = 2026-09-09T23:30Z; slots at 07:00 IST are ahead → today counts
    const plan = planAutoFill(new Date('2026-09-09T23:30:00Z'), [], order, noState, cfg);
    expect(plan).toEqual([{ ref: 'gita:1:1', date: '2026-09-10' }, { ref: 'gita:1:2', date: '2026-09-11' }, { ref: 'gita:1:3', date: '2026-09-12' }]);
  });
  it('starts tomorrow once the earliest slot has passed', () => {
    const plan = planAutoFill(new Date('2026-09-10T02:00:00Z'), [], order, noState, cfg); // 07:30 IST
    expect(plan[0]).toEqual({ ref: 'gita:1:1', date: '2026-09-11' });
  });
  it('skips days already covered and refs already used or posted', () => {
    const items = [I('a', 'gita:1:1', '2026-09-11T01:30:00.000Z')];
    const state = { posted: [{ ref: 'gita:1:2', youtube: { id: 'x', at: 'y' } }] };
    const plan = planAutoFill(new Date('2026-09-09T23:30:00Z'), items, order, state, cfg);
    expect(plan).toEqual([{ ref: 'gita:1:3', date: '2026-09-10' }, { ref: 'gita:1:4', date: '2026-09-12' }]);
  });
  it('a skipped/failed row still counts as covering its day; an unscheduled row does not', () => {
    const covered = I('a', 'gita:1:1', '2026-09-10T01:30:00.000Z', { instagram: P('2026-09-10T01:30:00.000Z', 'skipped') });
    const unscheduled = I('b', 'gita:1:2', null);
    const plan = planAutoFill(new Date('2026-09-09T23:30:00Z'), [covered, unscheduled], order, noState, cfg);
    expect(plan.map((p) => p.date)).toEqual(['2026-09-11', '2026-09-12']);
    expect(plan.map((p) => p.ref)).toEqual(['gita:1:3', 'gita:1:4']);
  });
  it('stops when the verse order is exhausted', () => {
    expect(planAutoFill(new Date('2026-09-09T23:30:00Z'), [], ['gita:1:1'], noState, cfg)).toHaveLength(1);
  });
});

describe('duePosts', () => {
  it('returns scheduled posts whose time has come, ordered by time, and failed ones under the retry cap', () => {
    const items = [
      I('late', 'gita:1:1', '2026-09-10T01:35:00.000Z'),
      I('early', 'gita:1:2', '2026-09-10T01:30:00.000Z', { youtube: P('2026-09-10T01:30:00.000Z', 'published'), facebook: P('2026-09-10T01:30:00.000Z', 'failed', { attempts: 1 }) }),
      I('capped', 'gita:1:3', '2026-09-10T01:00:00.000Z', { instagram: P('2026-09-10T01:00:00.000Z', 'failed', { attempts: 3 }), facebook: P('2026-09-10T01:00:00.000Z', 'skipped'), youtube: P(null) }),
      I('future', 'gita:1:4', '2026-09-11T01:30:00.000Z'),
    ];
    expect(duePosts(new Date('2026-09-10T01:40:00Z'), items)).toEqual([
      { itemId: 'early', platform: 'instagram' }, { itemId: 'early', platform: 'facebook' },
      { itemId: 'late', platform: 'instagram' }, { itemId: 'late', platform: 'facebook' }, { itemId: 'late', platform: 'youtube' },
    ]);
  });
});

describe('applyPublishResult', () => {
  const base = P('2026-09-10T01:30:00.000Z');
  it('success → published with id + publishedAt, error cleared', () => {
    expect(applyPublishResult({ ...base, error: 'old' }, { ok: true, id: 'v1' }, '2026-09-10T02:00:00.000Z'))
      .toEqual({ ...base, status: 'published', id: 'v1', publishedAt: '2026-09-10T02:00:00.000Z' });
  });
  it('failure → failed with attempts+1 and the error', () => {
    expect(applyPublishResult(base, { ok: false, error: 'boom' }, 'x')).toEqual({ ...base, status: 'failed', attempts: 1, error: 'boom' });
    expect(applyPublishResult({ ...base, status: 'failed', attempts: 2 }, { ok: false, error: 'again' }, 'x').attempts).toBe(3);
  });
  it('skipped → skipped with the reason, attempts untouched', () => {
    expect(applyPublishResult(base, { skipped: 'missing secrets: FB_PAGE_ID' }, 'x')).toEqual({ ...base, status: 'skipped', error: 'missing secrets: FB_PAGE_ID' });
  });
});

describe('prefill', () => {
  const verse = { book: 'gita', ref: 'gita:2:47', chapter: 2, verse: 47, sanskrit: ['कर्मण्येवाधिकारस्ते'], hindi: 'तुम्हारा अधिकार कर्म पर है। फल पर नहीं।', english: 'You have a right to work. Never to its fruits.', attribution: { hindi: 'h', english: 'e' } };
  const cinema: ReelProps = { verse, timings: {} as ReelProps['timings'], format: 'cinema', cinema: { kicker: 'GITA 2.47', beats: ['Do the work.', 'Release the outcome.'], timings: {} as never }, audio: { introFile: null, meaningFile: null }, media: { background: null, music: null }, brand: { handle: '@h' } };
  const classic: ReelProps = { ...cinema, format: undefined, cinema: undefined };
  const custom: ReelProps = { ...cinema, verse: { ...verse, book: 'custom', ref: 'custom:x-1', chapter: 0, verse: 0, sanskrit: ['Meera Bai'] }, cinema: { ...cinema.cinema!, kicker: 'k', closing: { line: 'Meera Bai', reference: '' } } };

  it('hookFor per format', () => {
    expect(hookFor(cinema)).toBe('Do the work.');
    expect(hookFor(classic)).toBe('तुम्हारा अधिकार कर्म पर है।');
    expect(hookFor(custom)).toBe('Do the work.');
  });
  it('prefillPosts: times from the config, captions per format, facebook mirrors instagram', () => {
    const posts = prefillPosts(cinema, ['credit A'], '2026-09-12', cfg);
    expect(posts.instagram.at).toBe('2026-09-12T01:30:00.000Z');
    expect(posts.facebook.at).toBe('2026-09-12T01:35:00.000Z');
    expect(posts.youtube.at).toBe('2026-09-12T01:40:00.000Z');
    expect(posts.youtube.title).toBe('Do the work. | Bhagavad Gita 2.47 #Shorts');
    expect(posts.youtube.caption).toContain('credit A');
    expect(posts.facebook.caption).toBe(posts.instagram.caption);
    expect(Object.values(posts).every((p) => p.status === 'scheduled')).toBe(true);
    expect(prefillPosts(classic, [], '2026-09-12', cfg).youtube.title).toBe('गीता ज्ञान | अध्याय 2 श्लोक 47 | Bhagavad Gita #Shorts');
    expect(prefillPosts(custom, [], '2026-09-12', cfg).youtube.title).toBe('Do the work. | Meera Bai #Shorts');
  });
});
