import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const TOKENS = [
  'bg', 'surface', 'surface-2', 'line', 'fg', 'muted',
  'accent', 'accent-text', 'ink', 'success', 'warning', 'danger', 'video',
] as const;

describe('dashboard theme tokens', () => {
  const css = readFileSync('dashboard/app/globals.css', 'utf8');
  const darkAt = css.indexOf("html[data-theme='dark']");
  const themeAt = css.indexOf('@theme');

  it('defines every token in the light and the dark theme', () => {
    expect(darkAt).toBeGreaterThan(0);
    expect(themeAt).toBeGreaterThan(darkAt);
    const light = css.slice(css.indexOf(':root'), darkAt);
    const dark = css.slice(darkAt, themeAt);
    for (const t of TOKENS) {
      expect(light, `light --${t}`).toMatch(new RegExp(`--${t}:\\s*\\S`));
      expect(dark, `dark --${t}`).toMatch(new RegExp(`--${t}:\\s*\\S`));
    }
  });

  it('maps every token to a colour utility with @theme inline', () => {
    // `inline` matters: without it the utilities bake in the :root value and the
    // data-theme swap never reaches them.
    expect(css).toMatch(/@theme inline\s*\{/);
    for (const t of TOKENS) expect(css).toMatch(new RegExp(`--color-${t}:\\s*var\\(--${t}\\)`));
  });

  it('applies the stored theme before paint', () => {
    const layout = readFileSync('dashboard/app/layout.tsx', 'utf8');
    expect(layout).toMatch(/gita\.theme/);
    expect(layout).toMatch(/dangerouslySetInnerHTML/);
  });
});
