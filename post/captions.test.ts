import { describe, it, expect } from 'vitest';
import { introText, youtubeTitle, youtubeDescription, instagramCaption, HASHTAGS } from './captions.ts';
import type { Verse } from '../shared/types.ts';

const v: Verse = {
  book: 'gita',
  ref: 'gita:2:47',
  chapter: 2,
  verse: 47,
  sanskrit: ['कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।'],
  hindi: 'तेरा कर्म करने में ही अधिकार है, फलों में कभी नहीं। अतः तू आसक्त मत हो।',
  english: 'Your right is to action alone, never to its fruits.',
  attribution: { hindi: 'Test Swami (repo)', english: 'Test Translator (repo)' },
};

describe('captions', () => {
  it('intro announces chapter and verse in Hindi', () => {
    expect(introText(v)).toBe('भगवद्गीता, अध्याय 2, श्लोक 47।');
  });

  it('youtube title within 100 chars, has verse ref and #shorts', () => {
    expect(youtubeTitle(v).length).toBeLessThanOrEqual(100);
    expect(youtubeTitle(v)).toContain('अध्याय 2 श्लोक 47');
    expect(youtubeTitle(v).toLowerCase()).toContain('#shorts');
  });

  it('description contains shloka, both meanings, attribution', () => {
    const d = youtubeDescription(v);
    for (const s of [v.sanskrit[0], v.hindi, v.english, v.attribution.english]) expect(d).toContain(s);
  });

  it('instagram caption under 2200 chars with hashtags', () => {
    expect(instagramCaption(v).length).toBeLessThanOrEqual(2200);
    expect(instagramCaption(v)).toContain('#bhagavadgita');
  });

  it('instagram hook is the first hindi sentence', () => {
    expect(instagramCaption(v).startsWith('तेरा कर्म करने में ही अधिकार है, फलों में कभी नहीं।')).toBe(true);
  });

  it('caption stays under budget even for very long meanings', () => {
    const long: Verse = { ...v, hindi: 'क'.repeat(1500), english: 'x'.repeat(1500) };
    expect(instagramCaption(long).length).toBeLessThanOrEqual(2200);
  });

  it('hashtag list is fixed and non-empty', () => {
    expect(HASHTAGS.length).toBeGreaterThanOrEqual(8);
    expect(HASHTAGS).toContain('#bhagavadgita');
  });
});
