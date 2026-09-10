import { describe, it, expect } from 'vitest';
import { NAV, isActive } from '../dashboard/app/components/shell/nav.ts';

describe('sidebar navigation', () => {
  it('lists the pages in order, each href unique', () => {
    expect(NAV.map((i) => i.href)).toEqual(['/', '/studio', '/quotes', '/calendar', '/library']);
    expect(new Set(NAV.map((i) => i.href)).size).toBe(NAV.length);
    expect(NAV.every((i) => i.label.length > 0)).toBe(true);
  });

  it('marks the current tab, and only it', () => {
    expect(isActive('/', '/')).toBe(true);
    expect(isActive('/studio', '/')).toBe(false);
    expect(isActive('/studio', '/studio')).toBe(true);
    expect(isActive('/studio/', '/studio')).toBe(true);
    expect(isActive('/studio/deep', '/studio')).toBe(true);
    expect(isActive('/studiox', '/studio')).toBe(false);
    expect(isActive('/quotes', '/studio')).toBe(false);
  });
});
