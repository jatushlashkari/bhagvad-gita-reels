import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pickNext, recordPost, verseOrder, readState, writeState, type StateFile } from './select.ts';
import type { Verse } from '../shared/types.ts';

const order = ['gita:1:1', 'gita:1:2', 'gita:1:3'];
const P: ('youtube' | 'instagram')[] = ['youtube', 'instagram'];

describe('pickNext', () => {
  it('fresh state → first verse, both platforms missing', () => {
    expect(pickNext(order, { posted: [] }, P)).toEqual({ ref: 'gita:1:1', missing: ['youtube', 'instagram'] });
  });

  it('partial post → same verse, only missing platform (never advances past a half-posted verse)', () => {
    const s: StateFile = { posted: [{ ref: 'gita:1:1', youtube: { id: 'y1', at: 't' } }] };
    expect(pickNext(order, s, P)).toEqual({ ref: 'gita:1:1', missing: ['instagram'] });
  });

  it('fully posted → next verse', () => {
    const s: StateFile = {
      posted: [{ ref: 'gita:1:1', youtube: { id: 'y', at: 't' }, instagram: { id: 'i', at: 't' } }],
    };
    expect(pickNext(order, s, P)?.ref).toBe('gita:1:2');
  });

  it('all done → null', () => {
    const s: StateFile = {
      posted: order.map((ref) => ({ ref, youtube: { id: 'y', at: 't' }, instagram: { id: 'i', at: 't' } })),
    };
    expect(pickNext(order, s, P)).toBeNull();
  });

  it('single-platform config ignores the other platform', () => {
    const s: StateFile = { posted: [{ ref: 'gita:1:1', youtube: { id: 'y', at: 't' } }] };
    expect(pickNext(order, s, ['youtube'])?.ref).toBe('gita:1:2');
  });

  it('treats facebook in platforms like the others', () => {
    const s: StateFile = {
      posted: [{ ref: 'gita:1:1', youtube: { id: 'y', at: 't' }, instagram: { id: 'i', at: 't' } }],
    };
    expect(pickNext(order, s, ['youtube', 'instagram', 'facebook'])).toEqual({
      ref: 'gita:1:1',
      missing: ['facebook'],
    });
  });
});

describe('recordPost', () => {
  it('adds platform result without mutating input', () => {
    const s: StateFile = { posted: [] };
    const s2 = recordPost(s, 'gita:1:1', 'youtube', 'vid123', '2026-08-03T02:00:00Z');
    expect(s.posted).toHaveLength(0);
    expect(s2.posted[0]).toEqual({ ref: 'gita:1:1', youtube: { id: 'vid123', at: '2026-08-03T02:00:00Z' } });
  });

  it('merges second platform into the existing entry', () => {
    const s1 = recordPost({ posted: [] }, 'gita:1:1', 'youtube', 'y1', 't1');
    const s2 = recordPost(s1, 'gita:1:1', 'instagram', 'i1', 't2');
    expect(s2.posted).toHaveLength(1);
    expect(s2.posted[0].youtube?.id).toBe('y1');
    expect(s2.posted[0].instagram?.id).toBe('i1');
  });

  it('stores a facebook post (calendar mode publishes there too)', () => {
    const s = recordPost({ posted: [] }, 'gita:1:1', 'facebook', 'f1', 't');
    expect(s.posted[0]).toEqual({ ref: 'gita:1:1', facebook: { id: 'f1', at: 't' } });
    expect(recordPost(s, 'gita:1:1', 'facebook', 'f2', 't2').posted[0].facebook).toEqual({ id: 'f2', at: 't2' });
  });
});

describe('verseOrder', () => {
  const verses = [{ ref: 'gita:1:1' }, { ref: 'gita:1:2' }, { ref: 'gita:1:3' }] as Verse[];

  it('slices at startRef', () => {
    expect(verseOrder(verses, 'gita:1:2')).toEqual(['gita:1:2', 'gita:1:3']);
  });

  it('throws on unknown startRef', () => {
    expect(() => verseOrder(verses, 'gita:9:9')).toThrow(/startRef/);
  });
});

describe('state IO', () => {
  it('round-trips atomically', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'state-'));
    const p = join(dir, 'state.json');
    const s = recordPost({ posted: [] }, 'gita:1:1', 'youtube', 'y1', 't1');
    await writeState(p, s);
    expect(await readState(p)).toEqual(s);
    expect(readFileSync(p, 'utf8').endsWith('\n')).toBe(true);
  });

  it('readState on missing file returns empty state', async () => {
    expect(await readState(join(tmpdir(), 'nope-' + Math.random() + '.json'))).toEqual({ posted: [] });
  });
});
