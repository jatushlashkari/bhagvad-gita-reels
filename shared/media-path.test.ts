import { describe, it, expect } from 'vitest';
import { join, normalize } from 'node:path';
import { ALLOWED_MEDIA, isAllowedMediaPath } from './media-path.ts';

describe('isAllowedMediaPath', () => {
  it('rejects a simple parent-escape', () => {
    expect(isAllowedMediaPath(['..', '..', 'secret'].join('/'))).toBe(false);
  });

  it('rejects a deep escape that normalizes past the repo root', () => {
    const joined = ['public', 'assets', 'backgrounds', 'x', '..', '..', '..', '..', '..', '..', 'etc', 'passwd'].join(
      '/',
    );
    expect(isAllowedMediaPath(joined)).toBe(false);
  });

  it('allows an absolute-looking embedded segment by prefix, but path.join keeps it under the root', () => {
    // The joined string contains a leading-slash segment ("/etc/passwd"), which could look like
    // it smuggles an absolute path. normalize() collapses the doubled slash instead of re-rooting,
    // so this resolves to a harmless nested path under the allowed prefix, not a real escape.
    const joined = ['public', 'assets', 'backgrounds', '/etc/passwd'].join('/');
    expect(isAllowedMediaPath(joined)).toBe(true);

    const fakeRoot = '/repo';
    const resolved = join(fakeRoot, normalize(joined));
    expect(resolved).toBe('/repo/public/assets/backgrounds/etc/passwd');
    expect(resolved.startsWith(`${fakeRoot}/`)).toBe(true);
  });

  it('rejects an empty path', () => {
    expect(isAllowedMediaPath('')).toBe(false);
  });

  it('allows the exact whitelisted file', () => {
    expect(isAllowedMediaPath('out/reel.mp4')).toBe(true);
  });

  it('rejects a suffix trick on the exact-match entry', () => {
    expect(isAllowedMediaPath('out/reel.mp4.evil')).toBe(false);
  });

  it('allows ordinary files under the whitelisted directories', () => {
    expect(isAllowedMediaPath('public/assets/images/sample-gradient.jpg')).toBe(true);
    expect(isAllowedMediaPath('public/assets/backgrounds/clip.mp4')).toBe(true);
  });

  it('exports the whitelist itself', () => {
    expect(ALLOWED_MEDIA).toEqual([
      'public/assets/backgrounds/',
      'public/assets/images/',
      'public/assets/music/',
      'out/reel.mp4',
    ]);
  });

  it('allows an ordinary file under the music directory', () => {
    expect(isAllowedMediaPath(['public', 'assets', 'music', 't.mp3'].join('/'))).toBe(true);
  });

  it('rejects an escape attempt rooted under the music directory', () => {
    expect(isAllowedMediaPath(['public', 'assets', 'music', '..', '..', 'secret'].join('/'))).toBe(false);
  });
});
