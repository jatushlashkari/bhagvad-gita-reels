import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import type { Verse } from '../shared/types.ts';

// Dataset: https://github.com/gita/gita (bhagavadgita.io), released under The Unlicense
// (public-domain dedication). Verified 2026-08-03 — see out/raw/LICENSE after download.
const SOURCE = 'github.com/gita/gita, Unlicense';
const AUTHOR_HINDI = 'Swami Ramsukhdas';
const AUTHOR_ENGLISH = 'Swami Sivananda';

type RawVerse = { id: number; chapter_number: number; verse_number: number; text: string };
type RawTranslation = { verse_id: number; authorName: string; lang: string; description: string };

export function cleanTranslation(s: string): string {
  return s
    .replace(/।।\s*[\d.\s-]+\s*।।/g, ' ') // verse/range markers e.g. ।।2.47।। or ।।1.16 -- 1.18।।
    .replace(/\(टिप्पणी[^)]*\)/g, ' ')     // Ramsukhdas footnote references
    .replace(/\s+/g, ' ')
    .replace(/\s+([,।;!?])/g, '$1')
    .trim();
}

export function sanskritLines(text: string): string[] {
  return text
    .replace(/।।\s*[\d.\s-]+\s*।।/g, '।।') // keep the closing double danda, drop the number
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

export function validateSources(data: { book: string; verses: Verse[] }): void {
  if (data.book !== 'gita') throw new Error('book must be gita');
  const chapters = new Map<number, number[]>();
  for (const v of data.verses) {
    if (!v.sanskrit.length || !v.hindi.trim() || !v.english.trim())
      throw new Error(`empty field at ${v.ref}`);
    if (v.ref !== `gita:${v.chapter}:${v.verse}`) throw new Error(`bad ref ${v.ref}`);
    if (!v.attribution.hindi || !v.attribution.english) throw new Error(`missing attribution at ${v.ref}`);
    if (!chapters.has(v.chapter)) chapters.set(v.chapter, []);
    chapters.get(v.chapter)!.push(v.verse);
  }
  if (chapters.size !== 18) throw new Error(`expected 18 chapters, got ${chapters.size}`);
  for (const [ch, nums] of chapters)
    nums.forEach((n, i) => {
      if (n !== i + 1) throw new Error(`chapter ${ch} not contiguous at ${n}`);
    });
  const total = data.verses.length;
  if (total < 700 || total > 701) throw new Error(`expected 700-701 verses, got ${total}`);
  const spot: Record<number, number> = { 1: 47, 2: 72, 18: 78 };
  for (const [ch, n] of Object.entries(spot))
    if (chapters.get(Number(ch))!.length !== n) throw new Error(`chapter ${ch} should have ${n} verses`);
}

function main(): void {
  for (const f of ['verse.json', 'translation.json']) {
    if (!existsSync(`out/raw/${f}`))
      throw new Error(
        `out/raw/${f} missing. Download first:\n` +
          `  curl -sL -o out/raw/${f} https://raw.githubusercontent.com/gita/gita/main/data/${f}`,
      );
  }
  const rawVerses: RawVerse[] = JSON.parse(readFileSync('out/raw/verse.json', 'utf8'));
  const rawTrans: RawTranslation[] = JSON.parse(readFileSync('out/raw/translation.json', 'utf8'));

  const hindiByVerse = new Map<number, string>();
  const englishByVerse = new Map<number, string>();
  for (const t of rawTrans) {
    if (t.authorName === AUTHOR_HINDI && t.lang === 'hindi') hindiByVerse.set(t.verse_id, t.description);
    if (t.authorName === AUTHOR_ENGLISH && t.lang === 'english') englishByVerse.set(t.verse_id, t.description);
  }

  const verses: Verse[] = rawVerses
    .slice()
    .sort((a, b) => a.chapter_number - b.chapter_number || a.verse_number - b.verse_number)
    .map((rv) => {
      const hindi = hindiByVerse.get(rv.id);
      const english = englishByVerse.get(rv.id);
      if (!hindi || !english) throw new Error(`missing translation for verse id ${rv.id}`);
      return {
        book: 'gita',
        ref: `gita:${rv.chapter_number}:${rv.verse_number}`,
        chapter: rv.chapter_number,
        verse: rv.verse_number,
        sanskrit: sanskritLines(rv.text),
        hindi: cleanTranslation(hindi),
        english: cleanTranslation(english),
        attribution: {
          hindi: `${AUTHOR_HINDI} (${SOURCE})`,
          english: `${AUTHOR_ENGLISH} (${SOURCE})`,
        },
      };
    });

  const data = { book: 'gita', verses };
  validateSources(data);
  mkdirSync('sources', { recursive: true });
  writeFileSync('sources/gita.json', JSON.stringify(data, null, 2) + '\n');
  console.log(`sources/gita.json written: ${verses.length} verses, hindi=${AUTHOR_HINDI}, english=${AUTHOR_ENGLISH}`);
}

if (process.argv[1]?.endsWith('build-sources.ts')) main();
