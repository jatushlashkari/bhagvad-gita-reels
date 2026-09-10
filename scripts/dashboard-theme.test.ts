import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
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

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe('dashboard uses the palette, not raw colours', () => {
  const files = walk('dashboard/app').filter((f) => /\.tsx?$/.test(f));

  it('has files to check', () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it('contains no raw hex colour', () => {
    const offenders = files.filter((f) => /#[0-9a-fA-F]{6}\b/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('contains no palette, white or black colour class', () => {
    // e.g. text-red-400, ring-white/5, border-white/10, bg-black/40 — all of which
    // have a token equivalent (danger / line / fg-with-opacity).
    const banned = /\b(?:bg|text|border|ring|from|to|via|accent|fill|stroke|divide|outline|decoration|shadow)-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{2,3})?(?:\/\d{1,3})?\b/;
    const offenders = files.filter((f) => banned.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
