import { describe, it, expect } from 'vitest';
import { releaseTag, assetUrl } from './release.ts';

describe('release naming', () => {
  it('tag from ref', () => {
    expect(releaseTag('gita:2:47')).toBe('reel-gita-2-47');
  });

  it('public asset url', () => {
    expect(assetUrl('user/repo', 'reel-gita-2-47', 'reel.mp4')).toBe(
      'https://github.com/user/repo/releases/download/reel-gita-2-47/reel.mp4',
    );
  });
});
