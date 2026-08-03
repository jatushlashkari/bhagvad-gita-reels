import { loadFont } from '@remotion/fonts';
import { cancelRender, continueRender, delayRender, staticFile } from 'remotion';

export const DEVANAGARI = 'NotoSerifDevanagari';
export const LATIN = 'NotoSerif';

const handle = delayRender('loading fonts');

Promise.all([
  loadFont({ family: DEVANAGARI, url: staticFile('assets/fonts/NotoSerifDevanagari-Regular.ttf'), weight: '400' }),
  loadFont({ family: DEVANAGARI, url: staticFile('assets/fonts/NotoSerifDevanagari-Bold.ttf'), weight: '700' }),
  loadFont({ family: LATIN, url: staticFile('assets/fonts/NotoSerif-Regular.ttf'), weight: '400' }),
])
  .then(() => continueRender(handle))
  .catch((err) => cancelRender(err));
