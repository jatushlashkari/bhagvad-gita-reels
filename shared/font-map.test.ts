import { describe, it, expect } from 'vitest';
import { BEAT_FONTS, FAMILY, FONT_LABELS, KICKER_FONTS, fontFamilyFor, kickerFamilyFor } from './font-map.ts';

describe('font-map', () => {
  it('every beat and kicker stack ends with the Devanagari fallback', () => {
    for (const f of BEAT_FONTS) expect(fontFamilyFor(f).endsWith(`, ${FAMILY.devanagari}`)).toBe(true);
    for (const f of KICKER_FONTS) expect(kickerFamilyFor(f).endsWith(`, ${FAMILY.devanagari}`)).toBe(true);
  });
  it('maps tokens to their families and labels', () => {
    expect(fontFamilyFor('display')).toBe('ArchivoBlack, NotoSerifDevanagari');
    expect(fontFamilyFor('cinzel').startsWith('Cinzel,')).toBe(true);
    expect(kickerFamilyFor('montserrat').startsWith('Montserrat,')).toBe(true);
    expect(kickerFamilyFor('serif').startsWith('NotoSerif,')).toBe(true);
    expect(Object.keys(FONT_LABELS).sort()).toEqual([...BEAT_FONTS].sort());
  });
});
