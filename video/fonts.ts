import { loadFont } from '@remotion/fonts';
import { DEVANAGARI_400, DEVANAGARI_700, DISPLAY_400, LATIN_400 } from './fonts-embedded.ts';

export const DEVANAGARI = 'NotoSerifDevanagari';
export const LATIN = 'NotoSerif';
export const DISPLAY = 'ArchivoBlack';

// Fonts are embedded as data: URLs (see scripts/embed-fonts.ts) — loading them
// involves no network/server fetch, which eliminated delayRender timeouts on CI.
loadFont({ family: DEVANAGARI, url: DEVANAGARI_400, weight: '400', format: 'truetype' });
loadFont({ family: DEVANAGARI, url: DEVANAGARI_700, weight: '700', format: 'truetype' });
loadFont({ family: LATIN, url: LATIN_400, weight: '400', format: 'truetype' });
loadFont({ family: DISPLAY, url: DISPLAY_400, weight: '400', format: 'truetype' });
