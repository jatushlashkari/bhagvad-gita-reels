import { describe, it, expect } from 'vitest';
import { buildYoutubeRequest } from './youtube.ts';
import type { Verse } from '../shared/types.ts';

const v: Verse = {
  book: 'gita',
  ref: 'gita:2:47',
  chapter: 2,
  verse: 47,
  sanskrit: ['कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।'],
  hindi: 'तेरा कर्म करने में ही अधिकार है, फलों में कभी नहीं।',
  english: 'Your right is to action alone, never to its fruits.',
  attribution: { hindi: 'Test Swami (repo)', english: 'Test Translator (repo)' },
};

describe('buildYoutubeRequest', () => {
  it('builds a public, not-for-kids upload request', () => {
    const r = buildYoutubeRequest(v);
    expect(r.snippet.title).toContain('अध्याय 2 श्लोक 47');
    expect(r.snippet.categoryId).toBe('22');
    expect(r.status.privacyStatus).toBe('public');
    expect(r.status.selfDeclaredMadeForKids).toBe(false);
  });

  it('description carries the verse content', () => {
    const r = buildYoutubeRequest(v);
    expect(r.snippet.description).toContain(v.sanskrit[0]);
    expect(r.snippet.description).toContain(v.hindi);
  });

  it('appends extra credit lines when provided', () => {
    const r = buildYoutubeRequest(v, ['Music: Kevin MacLeod (incompetech.com), CC BY 3.0']);
    expect(r.snippet.description).toContain('Kevin MacLeod');
  });

  it('override replaces title/description; default stays classic', () => {
    const r = buildYoutubeRequest(v, [], { title: 'T', description: 'D' });
    expect(r.snippet.title).toBe('T');
    expect(r.snippet.description).toBe('D');
    expect(buildYoutubeRequest(v).snippet.title).toContain('गीता ज्ञान');
  });
});
