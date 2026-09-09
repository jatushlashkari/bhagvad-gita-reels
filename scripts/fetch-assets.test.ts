import { describe, it, expect } from 'vitest';
import { shouldFetchAsset } from './fetch-assets.ts';

describe('shouldFetchAsset', () => {
  it('skips user-provided uploads (empty url) — nothing to fetch, never counted as failed', () => {
    expect(shouldFetchAsset({ file: 'evening-raga.mp3', url: '', license: 'User-provided', source: 'dashboard upload' })).toBe(false);
  });

  it('fetches entries with a real url', () => {
    expect(
      shouldFetchAsset({ file: 'clip.mp4', url: 'https://commons.wikimedia.org/clip.mp4', license: 'CC0', source: 'commons' }),
    ).toBe(true);
  });
});
