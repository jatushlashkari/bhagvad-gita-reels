// Image-prompt engine. Curated prompts live in sources/prompts.json; when a verse
// has none (custom quotes, uncurated verses) we fall back to the chapter's theme
// plus a motif lifted from the hook beat, so every reel still gets a usable prompt.
export const CHAPTER_THEMES: Record<number, string> = {
  1: 'Two armies facing each other on the plain of Kurukshetra at dawn, conch shells raised, banners in the wind',
  2: 'Arjuna seated in his chariot on the battlefield, Krishna turned toward him, calm amid the waiting armies',
  3: 'A farmer working a sunlit field at daybreak, hands in the soil, a distant temple on the horizon',
  4: 'Krishna revealing ancient knowledge beneath a great banyan tree, soft dawn light through the leaves',
  5: 'A sage seated in stillness on a riverbank, water flowing past, morning mist rising',
  6: 'A yogi meditating on a mountain ledge at sunrise, the steady flame of a lamp beside him',
  7: 'Krishna standing amid the elements, sun, ocean, wind and stars gathered around him',
  8: 'A lone traveler at the moment of departure, a path leading into golden light beyond a dark gate',
  9: 'A humble devotee offering a leaf, a flower and water at a small shrine, a glowing lamp, evening sky',
  10: 'Krishna as the radiance within all things, sunlight on the Ganga, the Himalayas, the ocean, a lion',
  11: 'The cosmic form of Krishna filling the sky with countless faces and arms, blazing like a thousand suns',
  12: 'A devotee walking a quiet village road at dusk, a temple bell, a peaceful golden atmosphere',
  13: 'A vast field under an open sky, a single figure standing as the silent witness of all that grows',
  14: 'Three streams of light, clear white, restless red and dim smoke, meeting in a still forest clearing',
  15: 'An immense inverted banyan tree with its roots in the heavens and its branches reaching to the earth',
  16: 'A crossroads at twilight, one path lit by a steady lamp, the other lost in shadow and storm',
  17: 'Three offerings on an altar, a pure ghee lamp, a spiced feast and neglected embers, beneath a temple canopy',
  18: 'Arjuna rising in his chariot with his bow, resolve restored, Krishna smiling, the sun breaking over Kurukshetra',
};
export const GENERIC_THEME = 'Krishna in serene golden light beneath a flowering tree, a peaceful devotional scene, soft dawn haze';

const STOP = new Set(
  'a an the and or but of to in on for with your you is are it its that this not do be was were will can what who when from into than then too very just only ever never every all any some more most no yes his her him he she they them we our us my me i am as at by so if let one has have had does did been being there here where why how'.split(' '),
);

export function motif(hook: string): string {
  return hook.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w)).slice(0, 4).join(', ');
}

export function promptBody(chapter: number, hook: string, curated?: string | null): string {
  if (curated) return curated;
  const theme = CHAPTER_THEMES[chapter] ?? GENERIC_THEME;
  const m = motif(hook);
  return m ? `${theme}, ${m}` : theme;
}

export function promptFor(chapter: number, hook: string, curated: string | null | undefined, prefix: string): string {
  return `${prefix.trim()} ${promptBody(chapter, hook, curated)}`.trim();
}
