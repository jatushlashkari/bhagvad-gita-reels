import { loadFont } from '@remotion/fonts';
import { staticFile } from 'remotion';

export const DEVANAGARI = 'NotoSerifDevanagari';
export const LATIN = 'NotoSerif';

// loadFont manages its own delayRender per font — no manual handle needed here.
// (A manual module-level delayRender starved under heavy video-decode load.)
loadFont({ family: DEVANAGARI, url: staticFile('assets/fonts/NotoSerifDevanagari-Regular.ttf'), weight: '400' });
loadFont({ family: DEVANAGARI, url: staticFile('assets/fonts/NotoSerifDevanagari-Bold.ttf'), weight: '700' });
loadFont({ family: LATIN, url: staticFile('assets/fonts/NotoSerif-Regular.ttf'), weight: '400' });
