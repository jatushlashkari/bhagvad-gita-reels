export const FAMILY = {
  display: 'ArchivoBlack', serif: 'NotoSerif', devanagari: 'NotoSerifDevanagari',
  cinzel: 'Cinzel', playfair: 'PlayfairDisplay', montserrat: 'Montserrat', bebas: 'BebasNeue',
} as const;
export type BeatFont = 'display' | 'serif' | 'cinzel' | 'playfair' | 'montserrat' | 'bebas';
export type KickerFont = 'serif' | 'cinzel' | 'montserrat';
export const BEAT_FONTS: readonly BeatFont[] = ['display', 'serif', 'cinzel', 'playfair', 'montserrat', 'bebas'];
export const KICKER_FONTS: readonly KickerFont[] = ['serif', 'cinzel', 'montserrat'];
export const FONT_LABELS: Record<BeatFont, string> = {
  display: 'Archivo Black', serif: 'Noto Serif', cinzel: 'Cinzel', playfair: 'Playfair Display',
  montserrat: 'Montserrat', bebas: 'Bebas Neue',
};
// Every stack falls back to the Devanagari face so Hindi kickers/attributions never render as tofu.
export const fontFamilyFor = (f: BeatFont): string => `${FAMILY[f]}, ${FAMILY.devanagari}`;
export const kickerFamilyFor = (f: KickerFont): string => `${FAMILY[f]}, ${FAMILY.devanagari}`;
