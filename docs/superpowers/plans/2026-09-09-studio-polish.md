# Studio & Format Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four new fonts (beats + kicker), a no-overlap sequential transition with a gap, a `/quotes` page (all verse beats + favorites + user-authored custom quotes), and per-reel image prompts — all wired into Studio.

**Architecture:** Style tokens grow (`beatFont` widened, `kickerFont`, `transition`, `gapSec`, `promptPrefix`) in `shared/reel-style.ts`; a pure `shared/font-map.ts` owns font-family names shared by the render (`video/fonts.ts`, components) and Studio; `computeCinemaTimeline` gains a sequential branch; a pure `shared/prompts.ts` builds prompts (curated file + chapter-theme fallback); custom quotes are a validated JSON collection (`shared/custom-quotes.ts`) rendered through `CinemaReel` via a `cinema.closing` override and a `custom:<id>` ref; the dashboard gains quotes/prompt/custom-quote APIs behind the `Backend` seam and a `/quotes` page.

**Tech Stack:** existing root toolchain (TS strict ESM, vitest, Remotion 4.0.505, `@remotion/fonts`), existing dashboard (Next 16 + Tailwind 4 + `@remotion/player`), OFL fonts from the google/fonts repo.

**Spec:** docs/superpowers/specs/2026-09-09-studio-polish-design.md

## Global Constraints

- New style keys default to today's look: `beatFont 'display'`, `kickerFont 'serif'`, `transition 'crossfade'`, `gapSec 0.4`, `promptPrefix` = `"Cinematic devotional painting, ultra-detailed, richly coloured, no text —"`. `validateStyle` never throws; every existing preset stays valid.
- Fonts embed as data URLs via `scripts/embed-fonts.ts` → `video/fonts-embedded.ts` (both the TTFs under `public/assets/fonts/` and the generated file are committed; never HTTP at render); variable fonts load with weight range `'400 700'`; every font-family CSS stack ends with `NotoSerifDevanagari`.
- Sequential mode: `start_i = start_{i-1} + dur_{i-1} + gapSec` (no overlap); closing starts `lastEnd + gapSec`; crossfade mode byte-identical to today; 12s floor + 59.5s cap unchanged.
- Beat rules single-sourced (`BEAT_MIN/BEAT_MAX/BEAT_MAX_CHARS`, `NO_EMOJI` from `shared/beats.ts`) — custom-quote lines obey them; attribution ≤60, kicker ≤30, prompt ≤300, all emoji-free.
- Refs: verse `gita:c:v` and custom `custom:<slug>` where slug matches `/^[a-z0-9][a-z0-9-]{2,47}$/`; every ref check (`parseArgs`, generate route, `generateStream`) uses the one `REF_PATTERN` from `shared/custom-quotes.ts`.
- No on-screen emoji; `assertLocalOrigin` FIRST on every mutating route; shared-file writers go through the serialized `queue` in `local-backend.ts`; JSON files written 2-space + trailing newline; sync pathspec gains `sources/quotes-meta.json sources/custom-quotes.json`.
- Browser-graph modules (`shared/reel-style.ts`, `shared/background-kind.ts`, and the new `shared/font-map.ts`, `shared/prompts.ts`, `shared/custom-quotes.ts`) must never import `node:*` (Turbopack panics).
- Root `npm test` + `npm run typecheck` + `npm run typecheck --prefix dashboard` green per task; classic format untouched; conventional commits with trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Structure

```
shared/font-map.ts (+.test.ts)             # T1 pure: FAMILY, BeatFont/KickerFont, fontFamilyFor, kickerFamilyFor
shared/reel-style.ts (+.test.ts)           # T1/T2/T3: new tokens
scripts/embed-fonts.ts, video/fonts-embedded.ts, video/fonts.ts, public/assets/fonts/*, public/assets/manifest.json  # T1
video/components/{BeatCard,Kicker,ClosingCard}.tsx   # T1 font stacks; T4 closing override
pipeline/timeline.ts (+.test.ts)           # T2 sequential branch
shared/prompts.ts (+.test.ts)              # T3 CHAPTER_THEMES, GENERIC_THEME, motif, promptBody, promptFor
sources/prompts.json + scripts/prompts-validate.test.ts   # T3 curated prompts (147)
shared/custom-quotes.ts (+.test.ts)        # T4 CustomQuote, REF_PATTERN, validateCustomQuote, slugId, placeholderVerse
sources/custom-quotes.json ([]), sources/quotes-meta.json ({})   # T4
shared/types.ts                            # T4 cinema.closing
video/CinemaReel.tsx                       # T4 passes closing
pipeline/run.ts (+.test.ts)                # T4 custom refs, custom props/captions
post/captions.ts (+.test.ts)               # T4 custom caption variants
dashboard/lib/{backend,local-backend}.ts   # T5 new seam methods, REF_PATTERN, sync paths
dashboard/app/api/{quotes,quotes/meta,prompts/[ref],custom-quotes,custom-quotes/[id]}/route.ts, api/generate/route.ts   # T5
dashboard/app/quotes/page.tsx, app/components/quotes/{QuotesTable,CustomQuoteForm}.tsx   # T6
dashboard/app/studio/page.tsx, app/components/studio/{StyleControls,MediaControls}.tsx, app/page.tsx   # T6
README.md                                  # T7
```

---

### Task 1: Fonts + kicker font token

**Files:**
- Create: `shared/font-map.ts`, `shared/font-map.test.ts`, `public/assets/fonts/Cinzel-Variable.ttf`, `public/assets/fonts/PlayfairDisplay-Variable.ttf`, `public/assets/fonts/Montserrat-Variable.ttf`, `public/assets/fonts/BebasNeue-Regular.ttf`
- Modify: `shared/reel-style.ts`, `shared/reel-style.test.ts`, `scripts/embed-fonts.ts` (then regenerate `video/fonts-embedded.ts`), `video/fonts.ts`, `video/components/BeatCard.tsx`, `video/components/Kicker.tsx`, `video/components/ClosingCard.tsx`, `public/assets/manifest.json` (`fonts` entries), `dashboard/app/components/studio/StyleControls.tsx`

**Interfaces:**
- Produces `shared/font-map.ts`:
  ```ts
  export const FAMILY = { display: 'ArchivoBlack', serif: 'NotoSerif', devanagari: 'NotoSerifDevanagari',
    cinzel: 'Cinzel', playfair: 'PlayfairDisplay', montserrat: 'Montserrat', bebas: 'BebasNeue' } as const;
  export type BeatFont = 'display' | 'serif' | 'cinzel' | 'playfair' | 'montserrat' | 'bebas';
  export type KickerFont = 'serif' | 'cinzel' | 'montserrat';
  export const BEAT_FONTS: readonly BeatFont[]; export const KICKER_FONTS: readonly KickerFont[];
  export const FONT_LABELS: Record<BeatFont, string>;   // 'Archivo Black', 'Noto Serif', 'Cinzel', 'Playfair Display', 'Montserrat', 'Bebas Neue'
  export function fontFamilyFor(font: BeatFont): string;     // "ArchivoBlack, NotoSerifDevanagari"
  export function kickerFamilyFor(font: KickerFont): string; // "Cinzel, NotoSerifDevanagari"
  ```
- `ReelStyle.beatFont: BeatFont` (widened), `ReelStyle.kickerFont: KickerFont` (new, default `'serif'`).

- [ ] **Step 1: Write the failing tests**

`shared/font-map.test.ts`:
```ts
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
```
Append to `shared/reel-style.test.ts`:
```ts
  it('accepts the new beat fonts and defaults/validates kickerFont', () => {
    expect(validateStyle({ beatFont: 'cinzel' }).beatFont).toBe('cinzel');
    expect(validateStyle({ beatFont: 'bebas' }).beatFont).toBe('bebas');
    expect(validateStyle({ beatFont: 'comic' }).beatFont).toBe('display');
    expect(validateStyle({}).kickerFont).toBe('serif');
    expect(validateStyle({ kickerFont: 'cinzel' }).kickerFont).toBe('cinzel');
    expect(validateStyle({ kickerFont: 'bebas' }).kickerFont).toBe('serif');
  });
```

- [ ] **Step 2: Run to verify they fail** — `npx vitest run shared/font-map.test.ts shared/reel-style.test.ts` → FAIL (module not found / `kickerFont` undefined).

- [ ] **Step 3: Implement `shared/font-map.ts`** (pure — no remotion, no node imports):
```ts
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
```
`shared/reel-style.ts`: import `BEAT_FONTS, KICKER_FONTS, type BeatFont, type KickerFont`; type fields `beatFont: BeatFont; kickerFont: KickerFont;`; `DEFAULT_STYLE` adds `kickerFont: 'serif'`; `validateStyle`: `beatFont: oneOf(o.beatFont, BEAT_FONTS, DEFAULT_STYLE.beatFont)`, `kickerFont: oneOf(o.kickerFont, KICKER_FONTS, DEFAULT_STYLE.kickerFont)`.

- [ ] **Step 4: Download the fonts** into `public/assets/fonts/` (brackets URL-encoded; saved under bracket-free names because `[wght]` breaks shell globs and Next's file watcher):
```bash
cd public/assets/fonts
curl -fsSL -o Cinzel-Variable.ttf 'https://raw.githubusercontent.com/google/fonts/main/ofl/cinzel/Cinzel%5Bwght%5D.ttf'
curl -fsSL -o PlayfairDisplay-Variable.ttf 'https://raw.githubusercontent.com/google/fonts/main/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf'
curl -fsSL -o Montserrat-Variable.ttf 'https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf'
curl -fsSL -o BebasNeue-Regular.ttf 'https://raw.githubusercontent.com/google/fonts/main/ofl/bebasneue/BebasNeue-Regular.ttf'
file *.ttf   # every line must say "TrueType Font data"
```
If a URL 404s, list `https://api.github.com/repos/google/fonts/contents/ofl/<family>` and take the `.ttf` there (keep the local names above). Manifest `fonts` entries (same shape as the existing four): `{ "file": "Cinzel-Variable.ttf", "url": "<the encoded URL above>", "license": "OFL-1.1", "source": "https://github.com/google/fonts/tree/main/ofl/cinzel" }` etc. (Playfair source `…/ofl/playfairdisplay`, Montserrat `…/ofl/montserrat`, Bebas `…/ofl/bebasneue`).

- [ ] **Step 5: Embed + register.** `scripts/embed-fonts.ts` `fonts` array gains `['CINZEL_VAR', 'public/assets/fonts/Cinzel-Variable.ttf']`, `['PLAYFAIR_VAR', …PlayfairDisplay-Variable.ttf]`, `['MONTSERRAT_VAR', …Montserrat-Variable.ttf]`, `['BEBAS_400', …BebasNeue-Regular.ttf]`; run `npx tsx scripts/embed-fonts.ts`. `video/fonts.ts`:
```ts
import { FAMILY } from '../shared/font-map.ts';
import { BEBAS_400, CINZEL_VAR, DEVANAGARI_400, DEVANAGARI_700, DISPLAY_400, LATIN_400, MONTSERRAT_VAR, PLAYFAIR_VAR } from './fonts-embedded.ts';
export const DEVANAGARI = FAMILY.devanagari; export const LATIN = FAMILY.serif; export const DISPLAY = FAMILY.display;
// …existing four loadFont calls unchanged…
loadFont({ family: FAMILY.cinzel, url: CINZEL_VAR, weight: '400 700', format: 'truetype' });
loadFont({ family: FAMILY.playfair, url: PLAYFAIR_VAR, weight: '400 700', format: 'truetype' });
loadFont({ family: FAMILY.montserrat, url: MONTSERRAT_VAR, weight: '400 700', format: 'truetype' });
loadFont({ family: FAMILY.bebas, url: BEBAS_400, weight: '400', format: 'truetype' });
```

- [ ] **Step 6: Components.** `BeatCard`: `fontFamily: fontFamilyFor(style.beatFont)` (drop the `DISPLAY`/`LATIN` import). `Kicker`: both the kicker line and the handle line use `fontFamily: kickerFamilyFor(style.kickerFont)`. `ClosingCard`: the `BHAGAVAD GITA c.v` line and the handle line use `kickerFamilyFor(style.kickerFont)`; the shloka line keeps `DEVANAGARI`. `StyleControls`: beat-font `<select>` options = `BEAT_FONTS.map(f => <option value={f}>{FONT_LABELS[f]}</option>)`; add `<Field label="kicker font">` select over `KICKER_FONTS` (labels via `FONT_LABELS`) → `onChange({ kickerFont })`.

- [ ] **Step 7: Verify.** `npm test && npm run typecheck && npm run typecheck --prefix dashboard`. Visual: one dry-run to get props (`npm run generate -- --verse gita:2:47 --format cinema --dry-run`, run detached + poll; ~2–3 min), then for `beatFont:'cinzel', kickerFont:'cinzel'` and for `beatFont:'bebas', kickerFont:'montserrat'` write `out/props-<name>.json` = `out/props.json` with `style` patched, and render stills of a mid-beat frame and the closing frame: `npx remotion still video/index.ts CinemaReel out/still-<name>.png --props=out/props-<name>.json --frame=<F>` (mid-beat F = `round((beats[0].startSec+1)*30)`, closing F = `round((closingStartSec+1)*30)`). Read the PNGs: fonts visibly differ from the default look, no tofu boxes, the Devanagari shloka line intact.

- [ ] **Step 8: Commit** — `git add -A shared video scripts public/assets/fonts public/assets/manifest.json dashboard/app/components/studio/StyleControls.tsx && git commit -m "feat: four new fonts with beat and kicker font tokens"`

---

### Task 2: Sequential transition

**Files:**
- Modify: `shared/reel-style.ts`, `shared/reel-style.test.ts`, `pipeline/timeline.ts`, `pipeline/timeline.test.ts`, `pipeline/run.ts` (timeline call site), `dashboard/app/studio/page.tsx` (timeline call site), `dashboard/app/components/studio/StyleControls.tsx`

**Interfaces:**
- Produces: `ReelStyle.transition: 'crossfade' | 'sequential'` (default `'crossfade'`), `ReelStyle.gapSec: number` (0–1.5, default 0.4); `computeCinemaTimeline(beats, style?: Pick<ReelStyle, 'durationScale' | 'crossfadeSec' | 'transition' | 'gapSec'>)`.

- [ ] **Step 1: Failing tests.** Append to `shared/reel-style.test.ts`:
```ts
  it('transition + gap tokens default and clamp', () => {
    expect(validateStyle({}).transition).toBe('crossfade');
    expect(validateStyle({}).gapSec).toBe(0.4);
    expect(validateStyle({ transition: 'sequential', gapSec: 9 }).gapSec).toBe(1.5);
    expect(validateStyle({ gapSec: -1 }).gapSec).toBe(0);
    expect(validateStyle({ transition: 'spin' }).transition).toBe('crossfade');
  });
```
Append to `pipeline/timeline.test.ts`:
```ts
describe('computeCinemaTimeline sequential mode', () => {
  const beats = ['One line here for the first beat.', 'Two lines here, second beat.', 'Three lines here, third beat.'];
  const seq = { durationScale: 1, crossfadeSec: 0.35, transition: 'sequential' as const, gapSec: 0.5 };

  it('no overlap: each beat starts a gap after the previous one ends; closing after the last gap', () => {
    const t = computeCinemaTimeline(beats, seq);
    for (let i = 1; i < t.beats.length; i++)
      expect(t.beats[i].startSec).toBeCloseTo(t.beats[i - 1].startSec + t.beats[i - 1].durSec + 0.5, 5);
    const last = t.beats[t.beats.length - 1];
    expect(t.closingStartSec).toBeCloseTo(last.startSec + last.durSec + 0.5, 5);
  });

  it('crossfade mode is byte-identical with the new tokens present', () => {
    expect(computeCinemaTimeline(beats, { durationScale: 1, crossfadeSec: 0.35, transition: 'crossfade', gapSec: 0.4 }))
      .toEqual(computeCinemaTimeline(beats));
  });

  it('sequential mode is longer than crossfade for the same beats', () => {
    expect(computeCinemaTimeline(beats, seq).totalSec).toBeGreaterThan(computeCinemaTimeline(beats).totalSec);
  });

  it('sequential mode keeps the 12s floor and the no-overlap rule after durationScale', () => {
    const t = computeCinemaTimeline(['Short one.', 'Short two.'], { ...seq, durationScale: 0.7, gapSec: 1.5 });
    expect(t.totalSec).toBeGreaterThanOrEqual(12);
    expect(t.beats[1].startSec).toBeCloseTo(t.beats[0].startSec + t.beats[0].durSec + 1.5, 5);
  });
});
```
- [ ] **Step 2: Run → FAIL.** `npx vitest run shared/reel-style.test.ts pipeline/timeline.test.ts`
- [ ] **Step 3: Implement.** `validateStyle`: `transition: oneOf(o.transition, ['crossfade', 'sequential'] as const, DEFAULT_STYLE.transition)`, `gapSec: num(o.gapSec, DEFAULT_STYLE.gapSec, 0, 1.5)`; `DEFAULT_STYLE` adds `transition: 'crossfade', gapSec: 0.4`. `pipeline/timeline.ts`:
```ts
export function computeCinemaTimeline(
  beats: string[],
  style?: Pick<ReelStyle, 'durationScale' | 'crossfadeSec' | 'transition' | 'gapSec'>,
): CinemaTimings {
  …
  const transition = style?.transition ?? 'crossfade';
  const gapSec = style?.gapSec ?? 0.4;
  // Crossfade overlaps the next beat by the fade length; sequential lets the beat fade fully out,
  // holds the image alone for gapSec, then starts the next beat — no overlap (spec §3).
  const advance = (durSec: number) => (transition === 'sequential' ? durSec + gapSec : durSec - crossfadeSec);
  …  cursor = startSec + advance(durSec);          // natural pass
  …  scaledCursor = startSec + advance(durSec);    // scaled pass
```
Nothing else changes (closing start is the cursor, which already includes the trailing gap). Call sites pass the whole style: `pipeline/run.ts` → `computeCinemaTimeline(beats, style)`; `dashboard/app/studio/page.tsx` → `computeCinemaTimeline(liveBeats, style)`. `StyleControls`: `<Field label="transition">` select (`crossfade` → "Crossfade (overlap)", `sequential` → "Sequential (fade out, gap, fade in)"); rename the `crossfade` Slider label to `fade`; add `<Slider label="gap" min={0} max={1.5} step={0.05} …>` rendered only when `style.transition === 'sequential'`.
- [ ] **Step 4: PASS + typechecks.** `npm test && npm run typecheck && npm run typecheck --prefix dashboard`.
- [ ] **Step 5: Commit** — `git commit -am "feat: sequential no-overlap transition with gap"`

---

### Task 3: Image prompts — engine + curated file

**Files:**
- Create: `shared/prompts.ts`, `shared/prompts.test.ts`, `sources/prompts.json`, `scripts/prompts-validate.test.ts`
- Modify: `shared/reel-style.ts`, `shared/reel-style.test.ts`

**Interfaces:**
- Produces `shared/prompts.ts`:
  ```ts
  export const CHAPTER_THEMES: Record<number, string>;   // 1..18
  export const GENERIC_THEME: string;                    // used for chapter 0 / unknown (custom quotes)
  export function motif(hook: string): string;           // 2-4 content words, comma-joined, may be ''
  export function promptBody(chapter: number, hook: string, curated?: string | null): string;  // curated ?? `${theme}, ${motif}`
  export function promptFor(chapter: number, hook: string, curated: string | null | undefined, prefix: string): string; // `${prefix} ${body}` trimmed
  ```
- `ReelStyle.promptPrefix: string` (trimmed, ≤200 chars; non-string → default; `''` allowed).
- `sources/prompts.json` = `{ [ref]: string }` with a key for every key of `sources/beats.json`.

- [ ] **Step 1: Failing tests.** `shared/prompts.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { CHAPTER_THEMES, GENERIC_THEME, motif, promptBody, promptFor } from './prompts.ts';

describe('prompts', () => {
  it('has a theme for all 18 chapters', () => {
    for (let c = 1; c <= 18; c++) expect(CHAPTER_THEMES[c].length).toBeGreaterThan(20);
  });
  it('motif keeps 2-4 content words from a hook and drops stop words', () => {
    const m = motif('Do the work. Release the outcome.');
    expect(m.split(', ').length).toBeLessThanOrEqual(4);
    expect(m).toMatch(/work/);
    expect(m).toMatch(/release/);
    expect(m).not.toMatch(/\bthe\b/);
    expect(motif('कर्म करो')).toBe('');
  });
  it('curated body wins; fallback is theme + motif; unknown chapter uses the generic theme', () => {
    expect(promptBody(2, 'x', 'Arjuna kneeling.')).toBe('Arjuna kneeling.');
    expect(promptBody(2, 'Do the work.', null).startsWith(CHAPTER_THEMES[2])).toBe(true);
    expect(promptBody(0, 'Do the work.', undefined).startsWith(GENERIC_THEME)).toBe(true);
    expect(promptBody(0, 'कर्म करो', undefined)).toBe(GENERIC_THEME);   // empty motif → no dangling comma
  });
  it('promptFor is deterministic and prefixed', () => {
    expect(promptFor(2, 'x', 'Arjuna kneeling.', 'PREFIX —')).toBe('PREFIX — Arjuna kneeling.');
    expect(promptFor(2, 'x', 'Arjuna kneeling.', '')).toBe('Arjuna kneeling.');
    const a = promptFor(2, 'Do the work. Release the outcome.', undefined, 'P —');
    expect(a).toBe(promptFor(2, 'Do the work. Release the outcome.', undefined, 'P —'));
    expect(a).toMatch(/work/);
  });
});
```
`scripts/prompts-validate.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { NO_EMOJI } from '../shared/beats.ts';

describe('sources/prompts.json', () => {
  const prompts = JSON.parse(readFileSync('sources/prompts.json', 'utf8')) as Record<string, string>;
  const beats = JSON.parse(readFileSync('sources/beats.json', 'utf8')) as Record<string, string[]>;
  const verses = new Set((JSON.parse(readFileSync('sources/gita.json', 'utf8')) as { verses: { ref: string }[] }).verses.map((v) => v.ref));

  it('covers every curated-beat verse and only real verses', () => {
    for (const ref of Object.keys(beats)) expect(prompts[ref], `${ref} missing prompt`).toBeTypeOf('string');
    for (const ref of Object.keys(prompts)) expect(verses.has(ref), `${ref} is not a verse`).toBe(true);
  });
  it('every prompt obeys the rules (60-300 chars, no emoji, no on-image text instructions)', () => {
    for (const [ref, p] of Object.entries(prompts)) {
      expect(p.length, ref).toBeGreaterThanOrEqual(60);
      expect(p.length, ref).toBeLessThanOrEqual(300);
      expect(NO_EMOJI.test(p), ref).toBe(false);
      expect(p, ref).not.toMatch(/\b(text|caption|typography|lettering|title|words|subtitle)\b/i);
    }
  });
  it('prompts are not copy-pasted across verses', () => {
    expect(new Set(Object.values(prompts)).size).toBe(Object.keys(prompts).length);
  });
});
```
Append to `shared/reel-style.test.ts`:
```ts
  it('promptPrefix defaults, trims, caps at 200 and allows empty', () => {
    expect(validateStyle({}).promptPrefix).toBe(DEFAULT_STYLE.promptPrefix);
    expect(validateStyle({ promptPrefix: 42 }).promptPrefix).toBe(DEFAULT_STYLE.promptPrefix);
    expect(validateStyle({ promptPrefix: '  x  ' }).promptPrefix).toBe('x');
    expect(validateStyle({ promptPrefix: 'y'.repeat(500) }).promptPrefix).toHaveLength(200);
    expect(validateStyle({ promptPrefix: '' }).promptPrefix).toBe('');
  });
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `shared/prompts.ts`:**
```ts
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
```
`shared/reel-style.ts`: `promptPrefix: string` in the type; `DEFAULT_STYLE.promptPrefix = 'Cinematic devotional painting, ultra-detailed, richly coloured, no text —'`; `validateStyle`: `promptPrefix: typeof o.promptPrefix === 'string' ? o.promptPrefix.trim().slice(0, 200) : DEFAULT_STYLE.promptPrefix`.
- [ ] **Step 4: Author `sources/prompts.json`** — one entry per key of `sources/beats.json` (147), keys in the same order as `beats.json`. Read each verse's beats (`sources/beats.json`) and english (`sources/gita.json`) first. Rules: English; 60–300 chars; describe a SCENE (subject, setting, light, mood) tied to the verse's teaching; Krishna/Arjuna/deities in dignified classical Indian-painting iconography; never mention text, captions, lettering or titles; no real-person likeness; no emoji; each prompt unique; vary settings across neighbouring verses using the verse's own imagery (rivers, lamps, storms, lotus, the inverted tree, a still flame, a tortoise drawing in its limbs, a leaf on water, and so on) rather than 30 identical chariot scenes. Write with a script (`node -e` building the object) or by hand; validate with `npx vitest run scripts/prompts-validate.test.ts`.
- [ ] **Step 5: PASS (all suites) + typechecks.** `npm test && npm run typecheck && npm run typecheck --prefix dashboard`
- [ ] **Step 6: Commit** — `git add shared/prompts.ts shared/prompts.test.ts sources/prompts.json scripts/prompts-validate.test.ts shared/reel-style.ts shared/reel-style.test.ts && git commit -m "feat: image prompt engine with curated prompts for 147 verses"`

---

### Task 4: Custom quotes — model, closing override, pipeline, captions

**Files:**
- Create: `shared/custom-quotes.ts`, `shared/custom-quotes.test.ts`, `sources/custom-quotes.json` (content `[]`), `sources/quotes-meta.json` (content `{}`)
- Modify: `shared/types.ts`, `video/components/ClosingCard.tsx`, `video/CinemaReel.tsx`, `pipeline/run.ts`, `pipeline/run.test.ts`, `post/captions.ts`, `post/captions.test.ts`

**Interfaces:**
- Produces `shared/custom-quotes.ts`:
  ```ts
  export type CustomQuote = { id: string; lines: string[]; attribution: string; kicker: string; prompt: string; createdAt: string };
  export const CUSTOM_REF_PREFIX = 'custom:';
  export const CUSTOM_ID = /^[a-z0-9][a-z0-9-]{2,47}$/;
  export const REF_PATTERN = /^(?:[a-z]+:\d+:\d+|custom:[a-z0-9][a-z0-9-]{2,47})$/;
  export const DEFAULT_ATTRIBUTION = 'श्रीकृष्ण'; export const DEFAULT_KICKER = 'श्रीकृष्ण कहते हैं';
  export const ATTRIBUTION_MAX = 60; export const KICKER_MAX = 30; export const PROMPT_MAX = 300;
  export function slugId(firstLine: string, rand: string): string;
  export function validateCustomQuote(input: unknown, existingIds: string[], now?: Date): CustomQuote;  // throws Error on rule violations
  export function customQuoteProblem(input: { lines: string[]; attribution: string; kicker: string; prompt: string }): string | null; // client-side mirror, never throws
  export function placeholderVerse(q: CustomQuote): Verse;
  export function customRef(id: string): string;   // `custom:${id}`
  ```
- `ReelProps.cinema.closing?: { line: string; reference: string }`.
- `post/captions.ts`: `customYoutubeTitle(hook, attribution)`, `customYoutubeDescription(lines, attribution)`, `customInstagramCaption(lines, attribution)`.
- Pipeline: `npm run generate -- --verse custom:<id> [--dry-run] [--overrides f]` renders the quote in cinema format.

- [ ] **Step 1: Failing tests.** `shared/custom-quotes.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { REF_PATTERN, customQuoteProblem, placeholderVerse, slugId, validateCustomQuote } from './custom-quotes.ts';

describe('custom quotes', () => {
  it('fills defaults, mints a slug id and stamps createdAt', () => {
    const q = validateCustomQuote({ lines: ['Do the work.', 'Release the outcome.'] }, [], new Date('2026-09-09T00:00:00Z'));
    expect(q.attribution).toBe('श्रीकृष्ण');
    expect(q.kicker).toBe('श्रीकृष्ण कहते हैं');
    expect(q.prompt).toBe('');
    expect(q.id).toMatch(/^do-the-work-[a-z0-9]{4}$/);
    expect(q.createdAt).toBe('2026-09-09T00:00:00.000Z');
  });
  it('rejects rule violations with the rule in the message', () => {
    expect(() => validateCustomQuote({ lines: ['only one.'] }, [])).toThrow(/2-6/);
    expect(() => validateCustomQuote({ lines: ['a.', 'b 🙏.'] }, [])).toThrow(/emoji/);
    expect(() => validateCustomQuote({ lines: ['a.', 'x'.repeat(91)] }, [])).toThrow(/90/);
    expect(() => validateCustomQuote({ lines: ['a.', ' '] }, [])).toThrow(/empty/);
    expect(() => validateCustomQuote({ lines: ['a.', 'b.'], attribution: 'x'.repeat(61) }, [])).toThrow(/60/);
    expect(() => validateCustomQuote({ lines: ['a.', 'b.'], kicker: 'x'.repeat(31) }, [])).toThrow(/30/);
    expect(() => validateCustomQuote({ lines: ['a.', 'b.'], prompt: 'x'.repeat(301) }, [])).toThrow(/300/);
    expect(() => validateCustomQuote({ lines: ['a.', 'b.'], attribution: 'ॐ 🙏' }, [])).toThrow(/emoji/);
    expect(() => validateCustomQuote(null, [])).toThrow(/object/);
  });
  it('keeps a provided valid id, rejects a bad id, refuses duplicates', () => {
    expect(validateCustomQuote({ id: 'my-quote-1', lines: ['a.', 'b.'] }, []).id).toBe('my-quote-1');
    expect(() => validateCustomQuote({ id: 'My Quote', lines: ['a.', 'b.'] }, [])).toThrow(/id/);
    expect(() => validateCustomQuote({ id: 'my-quote-1', lines: ['a.', 'b.'] }, ['my-quote-1'])).toThrow(/exists/);
  });
  it('slugId handles Devanagari-only and long first lines', () => {
    expect(slugId('कर्म करो', 'ab12')).toBe('quote-ab12');
    expect(slugId('Do the work. Release the outcome. Stay steady.', 'zz99')).toMatch(/^do-the-work-release-the-outcome-sta-zz99$/);
  });
  it('customQuoteProblem mirrors the rules without throwing', () => {
    expect(customQuoteProblem({ lines: ['a.', 'b.'], attribution: 'x', kicker: 'k', prompt: '' })).toBeNull();
    expect(customQuoteProblem({ lines: ['a.'], attribution: 'x', kicker: 'k', prompt: '' })).toMatch(/2/);
    expect(customQuoteProblem({ lines: ['a.', 'b.'], attribution: 'x'.repeat(61), kicker: 'k', prompt: '' })).toMatch(/60/);
  });
  it('placeholderVerse shape and REF_PATTERN', () => {
    const v = placeholderVerse(validateCustomQuote({ id: 'abc-123', lines: ['a.', 'b.'], attribution: 'Meera' }, []));
    expect(v).toMatchObject({ book: 'custom', ref: 'custom:abc-123', chapter: 0, verse: 0, sanskrit: ['Meera'], english: 'a. b.' });
    expect(v.attribution.english).toBe('custom quote');
    expect(REF_PATTERN.test('gita:2:47')).toBe(true);
    expect(REF_PATTERN.test('custom:abc-123')).toBe(true);
    expect(REF_PATTERN.test('custom:..')).toBe(false);
    expect(REF_PATTERN.test('custom:ab')).toBe(false);
    expect(REF_PATTERN.test('Custom:abc')).toBe(false);
  });
});
```
Append to `post/captions.test.ts` (import the three new functions):
```ts
describe('custom quote captions', () => {
  it('title = hook | attribution #Shorts, ≤100, word-boundary truncation', () => {
    expect(customYoutubeTitle('Do the work.', 'श्रीकृष्ण')).toBe('Do the work. | श्रीकृष्ण #Shorts');
    const long = customYoutubeTitle('word '.repeat(40).trim(), 'Meera Bai');
    expect(long.length).toBeLessThanOrEqual(100);
    expect(long.endsWith('… | Meera Bai #Shorts')).toBe(true);
  });
  it('description carries every line, the attribution and the hashtags — and no translation line', () => {
    const d = customYoutubeDescription(['One.', 'Two.'], 'Meera Bai');
    expect(d).toContain('One.\nTwo.');
    expect(d).toContain('— Meera Bai');
    expect(d).toContain('#bhagavadgita');
    expect(d).not.toMatch(/Translation basis/);
  });
  it('instagram caption opens with the hook and stays ≤2200', () => {
    const c = customInstagramCaption(['One.', 'Two.'], 'Meera Bai');
    expect(c.startsWith('One.')).toBe(true);
    expect(c).toContain('— Meera Bai');
    expect(customInstagramCaption(Array(6).fill('x'.repeat(90)), 'y'.repeat(60)).length).toBeLessThanOrEqual(2200);
  });
});
```
Append to `pipeline/run.test.ts` `parseArgs` block:
```ts
  it('accepts custom refs and rejects malformed ones', () => {
    expect(parseArgs(['--verse', 'custom:my-quote-1', '--dry-run'])).toEqual({ verse: 'custom:my-quote-1', dryRun: true });
    expect(() => parseArgs(['--verse', 'custom:..'])).toThrow(/format/);
  });
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `shared/custom-quotes.ts`** (imports only `./beats.ts` constants and `type Verse` from `./types.ts`):
```ts
import { BEAT_MAX, BEAT_MAX_CHARS, BEAT_MIN, NO_EMOJI } from './beats.ts';
import type { Verse } from './types.ts';

export type CustomQuote = { id: string; lines: string[]; attribution: string; kicker: string; prompt: string; createdAt: string };
export const CUSTOM_REF_PREFIX = 'custom:';
export const CUSTOM_ID = /^[a-z0-9][a-z0-9-]{2,47}$/;
export const REF_PATTERN = /^(?:[a-z]+:\d+:\d+|custom:[a-z0-9][a-z0-9-]{2,47})$/;
export const DEFAULT_ATTRIBUTION = 'श्रीकृष्ण';
export const DEFAULT_KICKER = 'श्रीकृष्ण कहते हैं';
export const ATTRIBUTION_MAX = 60;
export const KICKER_MAX = 30;
export const PROMPT_MAX = 300;

export const customRef = (id: string) => `${CUSTOM_REF_PREFIX}${id}`;

export function slugId(firstLine: string, rand: string): string {
  const base = firstLine.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').trim().replace(/[\s-]+/g, '-').slice(0, 32).replace(/-+$/, '');
  return `${base || 'quote'}-${rand}`;
}

const rand4 = () => Math.random().toString(36).slice(2, 6).padEnd(4, '0');

function checkText(label: string, v: unknown, max: number, fallback: string): string {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v !== 'string') throw new Error(`${label} must be a string`);
  const s = v.trim();
  if (s.length > max) throw new Error(`${label} exceeds ${max} chars`);
  if (NO_EMOJI.test(s)) throw new Error(`${label} contains emoji`);
  return s;
}

export function customQuoteProblem(q: { lines: string[]; attribution: string; kicker: string; prompt: string }): string | null {
  const lines = q.lines.map((l) => l.trim());
  if (lines.some((l) => !l)) return 'every line needs text';
  if (lines.length < BEAT_MIN || lines.length > BEAT_MAX) return `${BEAT_MIN}-${BEAT_MAX} lines`;
  if (lines.some((l) => l.length > BEAT_MAX_CHARS)) return `lines are capped at ${BEAT_MAX_CHARS} characters`;
  if (lines.some((l) => NO_EMOJI.test(l))) return 'emoji are not allowed on screen';
  if (q.attribution.trim().length > ATTRIBUTION_MAX) return `attribution is capped at ${ATTRIBUTION_MAX} characters`;
  if (NO_EMOJI.test(q.attribution)) return 'attribution: emoji are not allowed on screen';
  if (q.kicker.trim().length > KICKER_MAX) return `kicker is capped at ${KICKER_MAX} characters`;
  if (NO_EMOJI.test(q.kicker)) return 'kicker: emoji are not allowed on screen';
  if (q.prompt.trim().length > PROMPT_MAX) return `prompt is capped at ${PROMPT_MAX} characters`;
  return null;
}

export function validateCustomQuote(input: unknown, existingIds: string[], now: Date = new Date()): CustomQuote {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('custom quote must be an object');
  const o = input as Record<string, unknown>;
  if (!Array.isArray(o.lines) || !o.lines.every((l) => typeof l === 'string')) throw new Error('lines must be an array of strings');
  const lines = (o.lines as string[]).map((l) => l.trim());
  if (lines.length < BEAT_MIN || lines.length > BEAT_MAX) throw new Error(`${BEAT_MIN}-${BEAT_MAX} lines required, got ${lines.length}`);
  for (const l of lines) {
    if (!l) throw new Error('empty line');
    if (l.length > BEAT_MAX_CHARS) throw new Error(`line exceeds ${BEAT_MAX_CHARS} chars: "${l.slice(0, 40)}…"`);
    if (NO_EMOJI.test(l)) throw new Error(`emoji not allowed on screen: "${l}"`);
  }
  const attribution = checkText('attribution', o.attribution, ATTRIBUTION_MAX, DEFAULT_ATTRIBUTION);
  const kicker = checkText('kicker', o.kicker, KICKER_MAX, DEFAULT_KICKER);
  const prompt = checkText('prompt', o.prompt, PROMPT_MAX, '');
  let id: string;
  if (o.id !== undefined && o.id !== null && o.id !== '') {
    if (typeof o.id !== 'string' || !CUSTOM_ID.test(o.id)) throw new Error('id must be a slug: 3-48 chars of a-z, 0-9, -');
    id = o.id;
  } else {
    id = slugId(lines[0], rand4());
  }
  if (existingIds.includes(id)) throw new Error(`a custom quote with id "${id}" already exists`);
  const createdAt = typeof o.createdAt === 'string' && !Number.isNaN(Date.parse(o.createdAt)) ? o.createdAt : now.toISOString();
  return { id, lines, attribution, kicker, prompt, createdAt };
}

export function placeholderVerse(q: CustomQuote): Verse {
  return {
    book: 'custom', ref: customRef(q.id), chapter: 0, verse: 0, sanskrit: [q.attribution], hindi: '',
    english: q.lines.join(' '), attribution: { hindi: '', english: 'custom quote' },
  };
}
```
`shared/types.ts`: `cinema?: { kicker: string; beats: string[]; timings: CinemaTimings; closing?: { line: string; reference: string } }`.
`ClosingCard`: props gain `closing?: { line: string; reference: string }`; big line = `closing ? closing.line : shlokaLine` with `fontFamily: closing ? fontFamilyFor('serif') : DEVANAGARI` (mixed-script safe); the reference row renders `closing ? closing.reference : \`BHAGAVAD GITA ${verse.chapter}.${verse.verse}\`` and is omitted entirely when `closing && !closing.reference`. `CinemaReel`: `<ClosingCard verse={p.verse} handle={p.brand.handle} style={style} closing={c.closing} />`.
`post/captions.ts`: extract the title-fit logic into `function fitTitle(hook: string, suffix: string): string` used by `cinemaYoutubeTitle` (unchanged output) and:
```ts
export function customYoutubeTitle(hook: string, attribution: string): string {
  return fitTitle(hook, ` | ${attribution} #Shorts`);
}
export function customYoutubeDescription(lines: string[], attribution: string): string {
  return [lines.join('\n'), '', `— ${attribution}`, '', HASHTAGS.join(' ')].join('\n');
}
export function customInstagramCaption(lines: string[], attribution: string): string {
  const body = [lines[0], '', lines.slice(1).join('\n'), '', `— ${attribution}`, '', HASHTAGS.join(' ')].join('\n');
  return body.length <= 2200 ? body : body.slice(0, 2199) + '…';
}
```
`pipeline/run.ts`: `parseArgs` tests `REF_PATTERN` (message: `--verse must have format book:chapter:verse (e.g. gita:2:47) or custom:<id>, got: …`). In `main()`, before the verse lookup:
```ts
const customQuote = args.verse?.startsWith(CUSTOM_REF_PREFIX) ? loadCustomQuote(args.verse.slice(CUSTOM_REF_PREFIX.length)) : null;
…
const verse = customQuote ? placeholderVerse(customQuote) : sources.verses.find((v) => v.ref === target.ref);
…
if (customQuote && args.format === 'classic') throw new Error('custom quotes render only in the cinema format');
const format: 'classic' | 'cinema' = customQuote ? 'cinema' : (args.format ?? config.format ?? 'classic');
```
with `function loadCustomQuote(id: string): CustomQuote` reading `sources/custom-quotes.json` (`[]` when absent) and throwing `custom quote "<id>" not found (have: a, b, c)` when missing. In the cinema branch: `const curated = customQuote ? customQuote.lines : beatsFile[verse.ref];` kicker `customQuote ? customQuote.kicker : \`GITA ${verse.chapter}.${verse.verse}\``; `cinema: { kicker, beats, timings, ...(customQuote ? { closing: { line: customQuote.attribution, reference: '' } } : {}) }`; captions `customQuote ? { title: customYoutubeTitle(beats[0], customQuote.attribution), description: customYoutubeDescription(beats, customQuote.attribution) } : …` and `instaCaption = customQuote ? customInstagramCaption(beats, customQuote.attribution) : cinemaInstagramCaption(verse, beats)`. (`releaseTag('custom:x')` → `reel-custom-x`, a valid tag; `recordPost` with a custom ref is harmless to `pickNext`.)
Create `sources/custom-quotes.json` = `[]\n` and `sources/quotes-meta.json` = `{}\n`.
- [ ] **Step 4: Golden dry-run.** Temporarily append a quote: `npx tsx -e "import {validateCustomQuote} from './shared/custom-quotes.ts'; import {writeFileSync} from 'node:fs'; writeFileSync('sources/custom-quotes.json', JSON.stringify([validateCustomQuote({ id: 'golden-test-1', lines: ['Do the work.', 'Release the outcome.', 'Stay steady in both.'], attribution: 'श्रीकृष्ण' }, [])], null, 2) + '\n')"`; run `npm run generate -- --verse custom:golden-test-1 --dry-run` detached (`nohup … > out/custom.log 2>&1 &`) and poll the log; on `✔ rendered`, still the closing frame from `out/props.json` (`closingStartSec + 1`) and a mid-beat frame → Read: the attribution line + handle, NO "BHAGAVAD GITA" row, kicker reads "श्रीकृष्ण कहते हैं" in Devanagari (no tofu). Then `git checkout sources/custom-quotes.json` (committed file stays `[]`).
- [ ] **Step 5: PASS + typechecks.** `npm test && npm run typecheck && npm run typecheck --prefix dashboard`
- [ ] **Step 6: Commit** — `git add -A shared video pipeline post sources/custom-quotes.json sources/quotes-meta.json && git commit -m "feat: custom quotes — model, closing-card override, pipeline and captions"`

---

### Task 5: Backend + APIs (quotes, favorites, prompts, custom quotes, ref validation, sync paths)

**Files:**
- Modify: `dashboard/lib/backend.ts`, `dashboard/lib/local-backend.ts`, `dashboard/app/api/generate/route.ts`
- Create: `dashboard/app/api/quotes/route.ts`, `dashboard/app/api/quotes/meta/route.ts`, `dashboard/app/api/prompts/[ref]/route.ts`, `dashboard/app/api/custom-quotes/route.ts`, `dashboard/app/api/custom-quotes/[id]/route.ts`

**Interfaces:**
- Produces on `Backend` (`dashboard/lib/backend.ts`):
  ```ts
  export type QuoteRow = { ref: string; chapter: number; verse: number; hook: string; beats: string[]; curated: boolean; favorite: boolean; prompt: string; promptCurated: boolean };
  listQuotes(): Promise<QuoteRow[]>;                       // all verses of sources/gita.json in file order
  setFavorite(ref: string, favorite: boolean): Promise<void>;   // throws on unknown verse ref
  getCuratedPrompt(ref: string): Promise<string | null>;   // verse: sources/prompts.json[ref] ?? null; custom: quote.prompt || null; unknown ref → null
  listCustomQuotes(): Promise<CustomQuote[]>;
  createCustomQuote(input: unknown): Promise<CustomQuote>;
  updateCustomQuote(id: string, input: unknown): Promise<CustomQuote>;   // throws 'not found'; keeps id + createdAt
  deleteCustomQuote(id: string): Promise<void>;            // throws 'not found'
  ```
- Routes: `GET /api/quotes` → `QuoteRow[]`; `POST /api/quotes/meta` `{ ref, favorite }` → `{ ok: true }`; `GET /api/prompts/[ref]` → `{ curated: string | null }`; `GET /api/custom-quotes` → `CustomQuote[]`; `POST /api/custom-quotes` → `CustomQuote` (201); `PUT /api/custom-quotes/[id]` → `CustomQuote`; `DELETE /api/custom-quotes/[id]` → `{ ok: true }`. Validation/`not found` errors → 400/404 `{ error }`.
- `generateStream` and the generate route validate `ref` with `REF_PATTERN`.

- [ ] **Step 1: Backend.** In `local-backend.ts` add (imports: `promptFor` from `shared/prompts.ts`; `CUSTOM_REF_PREFIX, REF_PATTERN, validateCustomQuote, type CustomQuote` from `shared/custom-quotes.ts`):
```ts
const PROMPTS_PATH = () => join(REPO_ROOT, 'sources/prompts.json');
const META_PATH = () => join(REPO_ROOT, 'sources/quotes-meta.json');
const CUSTOM_PATH = () => join(REPO_ROOT, 'sources/custom-quotes.json');

async function readJson<T>(path: string, fallback: T): Promise<T> {
  if (!existsSync(path)) return fallback;
  return JSON.parse(await readFile(path, 'utf8')) as T;
}
type QuotesMeta = Record<string, { favorite: boolean }>;

async function listQuotes(): Promise<QuoteRow[]> {
  const [sources, beatsFile, prompts, meta, style] = await Promise.all([
    readJson<{ verses: Verse[] }>(join(REPO_ROOT, 'sources/gita.json'), { verses: [] }),
    readJson<Record<string, string[]>>(BEATS_PATH(), {}),
    readJson<Record<string, string>>(PROMPTS_PATH(), {}),
    readJson<QuotesMeta>(META_PATH(), {}),
    getStyle(),
  ]);
  return sources.verses.map((v) => {
    const curated = beatsFile[v.ref];
    const beats = curated ?? beatsFromTranslation(v.english);
    const hook = beats[0] ?? '';
    return {
      ref: v.ref, chapter: v.chapter, verse: v.verse, hook, beats, curated: Boolean(curated),
      favorite: meta[v.ref]?.favorite ?? false,
      prompt: promptFor(v.chapter, hook, prompts[v.ref], style.promptPrefix),
      promptCurated: v.ref in prompts,
    };
  });
}

function setFavorite(ref: string, favorite: boolean): Promise<void> {
  const result = queue.then(() => setFavoriteExclusive(ref, favorite));
  queue = result.then(() => undefined, () => undefined);
  return result;
}
async function setFavoriteExclusive(ref: string, favorite: boolean): Promise<void> {
  if (!(await getVerse(ref))) throw new Error(`unknown ref ${ref}`);
  const meta = await readJson<QuotesMeta>(META_PATH(), {});
  if (favorite) meta[ref] = { favorite: true };
  else delete meta[ref];
  await writeFile(META_PATH(), JSON.stringify(meta, null, 2) + '\n');
}

async function getCuratedPrompt(ref: string): Promise<string | null> {
  if (ref.startsWith(CUSTOM_REF_PREFIX)) {
    const q = (await listCustomQuotes()).find((c) => c.id === ref.slice(CUSTOM_REF_PREFIX.length));
    return q?.prompt || null;
  }
  const prompts = await readJson<Record<string, string>>(PROMPTS_PATH(), {});
  return prompts[ref] ?? null;
}

async function listCustomQuotes(): Promise<CustomQuote[]> {
  return readJson<CustomQuote[]>(CUSTOM_PATH(), []);
}
// All three writers share `queue` (same read-modify-write hazard as saveBeats).
function createCustomQuote(input: unknown): Promise<CustomQuote> {
  const result = queue.then(async () => {
    const all = await listCustomQuotes();
    const q = validateCustomQuote(input, all.map((c) => c.id));
    await writeFile(CUSTOM_PATH(), JSON.stringify([...all, q], null, 2) + '\n');
    return q;
  });
  queue = result.then(() => undefined, () => undefined);
  return result;
}
function updateCustomQuote(id: string, input: unknown): Promise<CustomQuote> {
  const result = queue.then(async () => {
    const all = await listCustomQuotes();
    const i = all.findIndex((c) => c.id === id);
    if (i === -1) throw new Error(`custom quote "${id}" not found`);
    const patch = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const q = validateCustomQuote({ ...all[i], ...patch, id, createdAt: all[i].createdAt }, all.filter((c) => c.id !== id).map((c) => c.id));
    all[i] = q;
    await writeFile(CUSTOM_PATH(), JSON.stringify(all, null, 2) + '\n');
    return q;
  });
  queue = result.then(() => undefined, () => undefined);
  return result;
}
function deleteCustomQuote(id: string): Promise<void> {
  const result = queue.then(async () => {
    const all = await listCustomQuotes();
    if (!all.some((c) => c.id === id)) throw new Error(`custom quote "${id}" not found`);
    await writeFile(CUSTOM_PATH(), JSON.stringify(all.filter((c) => c.id !== id), null, 2) + '\n');
  });
  queue = result.then(() => undefined, () => undefined);
  return result;
}
```
`generateStream`: replace the inline regex with `if (typeof ref !== 'string' || !REF_PATTERN.test(ref)) throw new Error('bad ref');`. `sync()`: both the `git add` list and the `git commit -- …` pathspec gain `'sources/quotes-meta.json', 'sources/custom-quotes.json'`; commit message → `'chore: sync dashboard edits (backgrounds, style, beats, quotes)'`. Register all new methods on `localBackend` and declare them (with doc comments in the existing style) on `Backend`; export `QuoteRow` from `backend.ts`.

- [ ] **Step 2: Routes** (each mutating handler begins with `const rejected = assertLocalOrigin(req); if (rejected) return rejected;`, invalid JSON → 400 `{ error: 'invalid JSON body' }`):
  - `quotes/route.ts`: `GET` → `Response.json(await getBackend().listQuotes())`.
  - `quotes/meta/route.ts`: `POST` body `{ ref, favorite }`; `typeof ref === 'string' && REF_PATTERN.test(ref) && typeof favorite === 'boolean'` else 400; backend throw → 400 `{ error }`; ok → `{ ok: true }`.
  - `prompts/[ref]/route.ts`: `GET`; `decodeURIComponent(ref)` must match `REF_PATTERN` else 400; → `{ curated }`.
  - `custom-quotes/route.ts`: `GET` list; `POST` → `createCustomQuote(body)` → 201 with the quote; throw → 400.
  - `custom-quotes/[id]/route.ts`: `PUT` → `updateCustomQuote(id, body)`; `DELETE` → `deleteCustomQuote(id)` → `{ ok: true }`; `/not found/` → 404, other throws → 400. `id` must match `CUSTOM_ID` else 400.
  - `generate/route.ts`: add `if (typeof ref !== 'string' || !REF_PATTERN.test(ref)) return Response.json({ error: 'invalid ref' }, { status: 400 });` before the background check.

- [ ] **Step 3: Curl verification** (start `npm run dashboard` detached, log to the scratchpad; kill it at the end):
  - `GET /api/quotes` → 701 rows; `gita:2:47` has `curated: true`, `promptCurated: true`, `prompt` starting with the default prefix; `gita:1:5` has `promptCurated: false` and a chapter-1 theme in `prompt`.
  - `POST /api/quotes/meta {"ref":"gita:2:47","favorite":true}` → `sources/quotes-meta.json` shows it; `favorite:false` removes it; `{"ref":"gita:99:1"}` → 400; no `Origin` header → the origin guard's rejection.
  - `POST /api/custom-quotes` valid → 201 with id; `{"lines":["one."]}` → 400 with `2-6`; `PUT /api/custom-quotes/<id>` `{ "attribution": "Meera" }` → updated, `createdAt` unchanged; `GET /api/prompts/custom:<id>` → `{ curated: null }`; `GET /api/prompts/gita:2:47` → the curated body; `POST /api/generate {"ref":"custom:<id>","format":"cinema"}` streams to `EXIT 0` (poll — a few minutes); `{"ref":"custom:.."}` → 400 `invalid ref`; `DELETE /api/custom-quotes/<id>` → `{ ok: true }`, second delete → 404.
  - Finish with `git status` clean apart from your code changes (restore `sources/*.json` via `git checkout` if a test row is left behind).
- [ ] **Step 4: Root tests + both typechecks green.**
- [ ] **Step 5: Commit** — `git add dashboard && git commit -m "feat: quotes, favorites, prompts and custom-quote APIs behind the seam"`

---

### Task 6: `/quotes` page + Studio additions

**Files:**
- Create: `dashboard/app/quotes/page.tsx`, `dashboard/app/components/quotes/QuotesTable.tsx`, `dashboard/app/components/quotes/CustomQuoteForm.tsx`
- Modify: `dashboard/app/page.tsx` (nav link), `dashboard/app/studio/page.tsx`, `dashboard/app/components/studio/StyleControls.tsx`, `dashboard/app/components/studio/MediaControls.tsx`

**Interfaces:**
- Consumes Task 5 routes and `QuoteRow`; `promptFor`, `customQuoteProblem`, `placeholderVerse`, `customRef`, `CustomQuote`, `beatsProblem`.
- Produces: `/quotes` page; Studio source model `type Source = { kind: 'verse'; ch: number; vs: number } | { kind: 'custom'; id: string }`; `MediaControls` gains a required `prompt: string` prop; Studio deep link `/studio?ref=gita:2:47` / `/studio?ref=custom:<id>`.

- [ ] **Step 1: `/quotes` page.** `page.tsx` ('use client'): fetches `/api/quotes` and `/api/custom-quotes` on mount; header like Studio's (title "Quotes", links "← Control room" and "Studio →"); renders `<QuotesTable rows onFavorite onSaveBeats />` then a **Custom quotes** section: list of existing quotes (lines, attribution, kicker, prompt preview; buttons **Open in Studio** → `/studio?ref=custom:<id>`, **Edit** → loads into the form, **Delete** → `DELETE` after `window.confirm`) and `<CustomQuoteForm />` (create or edit mode; **Save** → `POST`/`PUT`; status line like Studio's `beatsStatus`).
  `QuotesTable`: controls row — search `<input aria-label="search quotes">` (case-insensitive over ref/hook/beats), chapter `<select aria-label="chapter filter">` (All + 1..18), `<Toggle label="curated only">`, `<Toggle label="favorites only">`, count "N of 701". Rows (`<table>` in an `overflow-x-auto` wrapper): ref (`गीता c.v`, mono) · hook · beats count with an **Edit** button that expands an inline editor under the row (inputs per beat, `maxLength={BEAT_MAX_CHARS}`, `+ beat`, `beatsProblem` live, **Save** → `POST /api/beats/[ref]`, **Cancel**) · ⭐ button (`aria-label="favorite gita:2:47"`, `aria-pressed`) → `POST /api/quotes/meta`, optimistic + revert on error · prompt cell: first 70 chars + **Copy** (`navigator.clipboard.writeText(row.prompt)`, button text flips to "Copied" for 1.5s; `aria-label="copy prompt gita:2:47"`) · **Studio** link `/studio?ref=<ref>`. Render at most 200 rows and say "showing first 200 — narrow the search" when more match (keeps the DOM small).
  `CustomQuoteForm`: lines editor (same row UI as `BeatsEditor`: inputs, ↑/↓/✕, `+ line`), attribution (`maxLength={ATTRIBUTION_MAX}`, placeholder `श्रीकृष्ण`), kicker (`maxLength={KICKER_MAX}`, placeholder `श्रीकृष्ण कहते हैं`), prompt `<textarea maxLength={PROMPT_MAX}>`; `customQuoteProblem` disables Save and shows the message; blank attribution/kicker submit as `''` so the server applies the defaults.
  `app/page.tsx`: next to the existing `Studio →` link add `Quotes →` (`href="/quotes"`, same classes).
- [ ] **Step 2: Studio.** `StyleControls`: (already has beat font, kicker font, transition, gap, fade from T1/T2) add `<Field label="prompt prefix">` `<input maxLength={200}>` → `onChange({ promptPrefix })` spanning both grid columns. `MediaControls`: new prop `prompt: string`; after the background strip add an **image prompt** block (`<p className={labelClass}>image prompt</p>`, a read-only `<textarea aria-label="image prompt" readOnly rows={3}>` and a **Copy** ghost button with the same "Copied" flip). `studio/page.tsx`:
  - state `source: Source` (default `{ kind: 'verse', ch: 2, vs: 47 }`), `customQuotes: CustomQuote[]` (fetched with the other mounts), `curatedPrompt: string | null`.
  - `ref = source.kind === 'verse' ? \`gita:${ch}:${vs}\` : customRef(source.id)`.
  - Deep link: in a mount effect read `new URLSearchParams(window.location.search).get('ref')`; `gita:c:v` → `setSource({kind:'verse', ch, vs})`; `custom:<id>` → `setSource({kind:'custom', id})` (do NOT use `useSearchParams` — it forces a Suspense boundary in Next 16 builds).
  - Loading per source: verse mode = today's `/api/verse` + `/api/beats` fetches; custom mode = find the quote in `customQuotes` (refetch `/api/custom-quotes` if missing) → `setVerse(placeholderVerse(q))`, `setBeats(q.lines)`, `setCurated(true)`. Both modes fetch `/api/prompts/<ref>` → `setCuratedPrompt`.
  - `prompt = promptFor(verse?.chapter ?? 0, liveBeats[0] ?? '', curatedPrompt, style.promptPrefix)` (memo) → `<MediaControls prompt={prompt} …/>`.
  - Preview props: `cinema: { kicker: source.kind === 'custom' ? quote.kicker : \`GITA ${verse.chapter}.${verse.verse}\`, beats: liveBeats, timings, ...(source.kind === 'custom' ? { closing: { line: quote.attribution, reference: '' } } : {}) }`.
  - Verse panel: the chapter/verse selects get a third `<select aria-label="source">` FIRST: option "Bhagavad Gita" + an optgroup "Custom quotes" listing `customQuotes` (label = first line, value = `custom:<id>`) + a link "manage on /quotes". In custom mode hide chapter/verse selects and show `quote.kicker · quote.attribution`.
  - `saveBeats` in custom mode → `PUT /api/custom-quotes/<id>` `{ lines: liveBeats }` (status "saved to sources/custom-quotes.json"), then update `customQuotes` in state. `render()` posts `ref` (custom refs included) — the pipeline handles the rest.
- [ ] **Step 3: Verify in a real browser** (Playwright MCP against `npm run dashboard`, started detached; kill it after): `/quotes` shows "701" in the count; search `outcome` narrows to a list containing `गीता 2.47`; ⭐ on 2.47 → reload → still pressed → un-star; inline beats edit on 2.47: change beat 1 → Save → `GET /api/beats/gita:2:47` reflects it → restore via the same UI (or `git checkout sources/beats.json` at the end); create a custom quote (3 lines, blank attribution) → appears with `श्रीकृष्ण` → **Open in Studio** → Player mounts, the beats editor shows the 3 lines, the source select shows the quote, the closing card text is present in the DOM near the end (seek the Player via its controls or assert `preview.totalSec` ≥ 12 through the visible duration label); in Studio switch beat font to Cinzel and transition to Sequential with gap 0.6 → the Player DOM contains an element with `font-family` starting `Cinzel` and the duration label increases; the image-prompt textarea starts with the prompt prefix; Copy flips to "Copied". Delete the test quote from `/quotes`. Finish: kill the server, `git status` clean except your code changes (restore `styles/cinema.json` / `sources/*.json` with `git checkout` if needed), both typechecks + root suite green.
- [ ] **Step 4: Commit** — `git add dashboard && git commit -m "feat: quotes page with favorites and custom quotes; studio fonts, transition and prompt controls"`

---

### Task 7: E2E proof + docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: End-to-end proof.** With the server up: `POST /api/custom-quotes` (3 lines, attribution `Meera Bai`), `POST /api/style` with the current style plus `{ beatFont: 'cinzel', kickerFont: 'cinzel', transition: 'sequential', gapSec: 0.6 }`; kill the server; `npm run generate -- --verse custom:<id> --dry-run` detached + poll → `out/props.json` shows `style.transition === 'sequential'`, `cinema.closing.line === 'Meera Bai'`, and `cinema.timings.beats[1].startSec === beats[0].startSec + beats[0].durSec + 0.6`; extract a mid-beat still and the closing still (`npx remotion still … --props=out/props.json --frame=F`) → Read: Cinzel beats, "Meera Bai" closing card, no BHAGAVAD GITA row. Restore: `git checkout styles/cinema.json sources/custom-quotes.json`.
- [ ] **Step 2: README.** New/updated sections: Studio controls (fonts incl. kicker font, transition modes + gap + fade, prompt prefix); `/quotes` page (search/filter, favorites in `sources/quotes-meta.json`, inline beat edits, Copy prompt, Open in Studio); Custom quotes (`sources/custom-quotes.json`, rules, how they render — kicker + attribution card, `npm run generate -- --verse custom:<id>`, captions); Image prompts (curated `sources/prompts.json` for 147 verses, chapter-theme fallback, prefix lives in the saved style, paste into any AI art tool then upload the result in Studio → Media). Mention the sync now also commits `sources/quotes-meta.json` and `sources/custom-quotes.json`.
- [ ] **Step 3: All checks green** (`npm test && npm run typecheck && npm run typecheck --prefix dashboard`), tree clean.
- [ ] **Step 4: Commit** — `git add README.md && git commit -m "docs: quotes page, custom quotes, fonts, transitions and image prompts"`
