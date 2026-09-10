import { describe, it, expect } from 'vitest';
import { DEFAULT_STYLE } from '../shared/reel-style.ts';
import { buildCinemaPreviewProps } from '../dashboard/app/components/studio/preview-props.ts';
import type { Verse } from '../shared/types.ts';

const verse: Verse = {
  book: 'gita', ref: 'gita:2:47', chapter: 2, verse: 47,
  sanskrit: ['कर्मण्येवाधिकारस्ते'], hindi: 'तुम्हारा अधिकार कर्म पर है।',
  english: 'You have a right to work.', attribution: { hindi: 'h', english: 'e' },
};

describe('buildCinemaPreviewProps', () => {
  it('builds cinema props with the kicker, media and style it was given', () => {
    const r = buildCinemaPreviewProps({
      verse, beats: ['Do the work.', 'Release the outcome.'], style: DEFAULT_STYLE,
      handle: '@h', backgroundRel: 'assets/images/x.jpg', musicRel: null,
    });
    expect(r.error).toBeNull();
    expect(r.props?.format).toBe('cinema');
    expect(r.props?.cinema?.kicker).toBe('GITA 2.47');
    expect(r.props?.cinema?.beats).toEqual(['Do the work.', 'Release the outcome.']);
    expect(r.props?.media.background).toBe('/api/media/public/assets/images/x.jpg');
    expect(r.totalSec).toBeGreaterThanOrEqual(12);
  });

  it('takes a kicker and closing override (custom quotes) and a null background', () => {
    const r = buildCinemaPreviewProps({
      verse, beats: ['One.', 'Two.'], style: DEFAULT_STYLE, handle: '@h',
      backgroundRel: null, musicRel: null, kicker: 'श्रीकृष्ण कहते हैं',
      closing: { line: 'श्रीकृष्ण', reference: '' },
    });
    expect(r.props?.cinema?.kicker).toBe('श्रीकृष्ण कहते हैं');
    expect(r.props?.cinema?.closing).toEqual({ line: 'श्रीकृष्ण', reference: '' });
    expect(r.props?.media.background).toBeNull();
  });

  it('reports a timeline failure instead of throwing', () => {
    const r = buildCinemaPreviewProps({ verse, beats: [], style: DEFAULT_STYLE, handle: '@h', backgroundRel: null, musicRel: null });
    expect(r.props).toBeNull();
    expect(r.error).toMatch(/beat/);
  });
});
