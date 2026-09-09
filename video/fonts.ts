import { loadFont } from '@remotion/fonts';
import { FAMILY } from '../shared/font-map.ts';
import { BEBAS_400, CINZEL_VAR, DEVANAGARI_400, DEVANAGARI_700, DISPLAY_400, LATIN_400, MONTSERRAT_VAR, PLAYFAIR_VAR } from './fonts-embedded.ts';

export const DEVANAGARI = FAMILY.devanagari;
export const LATIN = FAMILY.serif;
export const DISPLAY = FAMILY.display;

// Fonts are embedded as data: URLs (see scripts/embed-fonts.ts) — loading them
// involves no network/server fetch, which eliminated delayRender timeouts on CI.
loadFont({ family: DEVANAGARI, url: DEVANAGARI_400, weight: '400', format: 'truetype' });
loadFont({ family: DEVANAGARI, url: DEVANAGARI_700, weight: '700', format: 'truetype' });
loadFont({ family: LATIN, url: LATIN_400, weight: '400', format: 'truetype' });
loadFont({ family: DISPLAY, url: DISPLAY_400, weight: '400', format: 'truetype' });
loadFont({ family: FAMILY.cinzel, url: CINZEL_VAR, weight: '400 700', format: 'truetype' });
loadFont({ family: FAMILY.playfair, url: PLAYFAIR_VAR, weight: '400 700', format: 'truetype' });
loadFont({ family: FAMILY.montserrat, url: MONTSERRAT_VAR, weight: '400 700', format: 'truetype' });
loadFont({ family: FAMILY.bebas, url: BEBAS_400, weight: '400', format: 'truetype' });
