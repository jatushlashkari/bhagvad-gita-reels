import { describe, it, expect } from 'vitest';
import { slugifyImageName, appendImageEntry } from './assets-store.ts';

describe('slugifyImageName', () => {
  it('kebabs and forces .jpg', () => {
    expect(slugifyImageName('Shri Krishna ART (1).PNG', [])).toBe('shri-krishna-art-1.jpg');
  });
  it('suffixes on collision', () => {
    expect(slugifyImageName('k.png', ['k.jpg'])).toBe('k-2.jpg');
    expect(slugifyImageName('k.png', ['k.jpg', 'k-2.jpg'])).toBe('k-3.jpg');
  });
});

describe('appendImageEntry', () => {
  const base = { backgrounds: [], music: [], fonts: [], images: [] };
  it('appends a user-provided entry once', () => {
    const m1 = appendImageEntry(base as never, 'k.jpg');
    expect(m1.images[0]).toEqual({ file: 'k.jpg', url: '', license: 'User-provided', source: 'dashboard upload' });
    expect(appendImageEntry(m1, 'k.jpg').images).toHaveLength(1);
  });
});
