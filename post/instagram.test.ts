import { describe, it, expect } from 'vitest';
import { reelContainerParams, IG_GRAPH } from './instagram.ts';

describe('reelContainerParams', () => {
  it('builds reel container params', () => {
    const p = reelContainerParams('caption text', 'https://example.com/reel.mp4');
    expect(p.get('media_type')).toBe('REELS');
    expect(p.get('video_url')).toBe('https://example.com/reel.mp4');
    expect(p.get('caption')).toBe('caption text');
    expect(p.get('share_to_feed')).toBe('true');
  });

  it('graph base is instagram.com (Instagram Login API, not facebook.com)', () => {
    expect(IG_GRAPH).toContain('graph.instagram.com');
  });

  it('container params carry a custom caption verbatim', () => {
    expect(reelContainerParams('custom caption', 'https://x/y.mp4').get('caption')).toBe('custom caption');
  });
});
