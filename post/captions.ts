import type { Verse } from '../shared/types.ts';

export const HASHTAGS = [
  '#bhagavadgita',
  '#gita',
  '#krishna',
  '#geetagyan',
  '#गीता',
  '#sanatandharma',
  '#spirituality',
  '#hindi',
  '#shlok',
  '#reels',
];

const truncate = (s: string, max: number): string => (s.length <= max ? s : s.slice(0, max - 1) + '…');

export function introText(v: Verse): string {
  return `भगवद्गीता, अध्याय ${v.chapter}, श्लोक ${v.verse}।`;
}

export function youtubeTitle(v: Verse): string {
  return `गीता ज्ञान | अध्याय ${v.chapter} श्लोक ${v.verse} | Bhagavad Gita #Shorts`;
}

export function youtubeDescription(v: Verse): string {
  return [
    v.sanskrit.join('\n'),
    '',
    `हिंदी अर्थ: ${v.hindi}`,
    '',
    `English: ${v.english}`,
    '',
    `अनुवाद/Translations: ${v.attribution.hindi}; ${v.attribution.english}`,
    '',
    HASHTAGS.join(' '),
  ].join('\n');
}

export function instagramCaption(v: Verse): string {
  const firstSentence = v.hindi.split('।')[0] + '।';
  const hook = truncate(firstSentence, 120);
  const body = [
    hook,
    '',
    v.sanskrit.join('\n'),
    '',
    `हिंदी अर्थ: ${truncate(v.hindi, 400)}`,
    '',
    `English: ${truncate(v.english, 400)}`,
    '',
    `(${v.attribution.hindi}; ${v.attribution.english})`,
    '',
    HASHTAGS.join(' '),
  ].join('\n');
  return truncate(body, 2200);
}
