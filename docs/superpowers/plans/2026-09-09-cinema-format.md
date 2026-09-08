# Cinema Format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A reference-driven third reel format — one epic image with Ken Burns drift, gold `GITA c.v` kicker, bold English text beats swapping with crossfades, closing Devanagari shloka card, music only — wired as a `--format cinema` path through the existing pipeline/dashboard and (after a user look-approval checkpoint) made the daily default.

**Architecture:** New pure modules for beats (`shared/beats.ts`) and timing (`computeCinemaTimeline`), a new Remotion composition `CinemaReel` reusing the existing `Background`/fonts infrastructure, a `format` branch in `pipeline/run.ts` that skips TTS and prefers the image pool, cinema caption templates, a Format select in the dashboard through the existing backend seam, and PD-Art seed images. Posting/state/workflows untouched.

**Tech Stack:** existing root toolchain (TS strict ESM, vitest, Remotion 4, tsx, ffmpeg-static), Archivo Black (OFL, embedded data-URL like existing fonts), Wikimedia Commons API for PD seeds.

**Spec:** docs/superpowers/specs/2026-09-09-cinema-format-design.md

## Global Constraints

- No on-screen emoji ever (Linux headless renderer). Emoji allowed in captions only.
- Beat duration formula, verbatim: `clamp(1.8 + chars/16, 2.4, 4.2)` seconds; crossfade 0.35s; closing card 3.2s; total floor 12s (pad hook + closing equally), cap 59.5s (assert; statically unreachable with ≤6 beats).
- Beats content rules: 2–6 lines/verse, ≤90 chars/line, first line is the hook, theme-faithful to the verse (no invented quotes), no emoji.
- Theme tokens: gold `#e8c874`, ivory `#f5efe0`; kicker = Noto Serif tracked-out caps; beats = Archivo Black; Devanagari = Noto Serif Devanagari.
- Cinema renders: NO TTS calls; music from existing pool with fade in/out envelope; deterministic asset picks via existing `pickAsset`.
- `config.json` gains `"format"` key but stays `"classic"` until the user approves the look at the Task 8 checkpoint gate.
- All existing tests stay green; CI workflow files unchanged; root TS strict/ESM with `.ts`-extension imports; conventional commits with the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.
- Seed images: Public Domain only (PD-Art Raja Ravi Varma), recorded in `public/assets/manifest.json` `images` with source URLs; normalized to 1080×1920 JPEG.

## File Structure

```
shared/beats.ts                     # NEW pure: beatsFromTranslation, validateBeatsFile, beatDurationSec
shared/beats.test.ts                # NEW
sources/beats.json                  # NEW curated beats (~120 verses)
scripts/beats-validate.test.ts      # NEW: validates sources/beats.json against sources/gita.json
shared/types.ts                     # MOD: CinemaTimings, ReelProps.format/cinema
pipeline/timeline.ts                # MOD: + computeCinemaTimeline
pipeline/timeline.test.ts           # MOD: + cinema cases
video/CinemaReel.tsx                # NEW composition (id CinemaReel)
video/components/{Kicker,BeatCard,ClosingCard,RadialScrim}.tsx   # NEW
video/Root.tsx                      # MOD: register CinemaReel
video/fonts.ts + video/fonts-embedded.ts + scripts/embed-fonts.ts  # MOD: + Archivo Black
public/assets/fonts/ArchivoBlack-Regular.ttf                        # NEW (OFL)
fixtures/props-cinema-2-47.json     # NEW fixture (nulls for media, curated beats)
pipeline/run.ts                     # MOD: --format, config.format, cinema branch
pipeline/run.test.ts                # MOD: parseArgs format cases
post/captions.ts (+ .test.ts)       # MOD: cinema caption templates
scripts/seed-images.ts              # NEW one-off: Commons PD fetch + normalize + manifest
dashboard/lib/backend.ts, dashboard/lib/local-backend.ts, dashboard/app/api/generate/route.ts, dashboard/app/components/GeneratePanel.tsx   # MOD: format select
config.json                         # MOD (Task 8, post-checkpoint): "format": "cinema"
README.md                           # MOD (Task 8): format section
```

### Shared interfaces (single source of truth)

```ts
// added to shared/types.ts
export type CinemaTimings = {
  kickerInSec: number;                       // 0.8
  beats: { startSec: number; durSec: number }[]; // beat 0 = hook, starts at 1.0
  crossfadeSec: number;                      // 0.35
  closingStartSec: number;
  closingSec: number;                        // >= 3.2 (may grow via floor padding)
  totalSec: number;
};
// ReelProps gains:
//   format?: 'classic' | 'cinema';          // absent = classic (old fixtures stay valid)
//   cinema?: { kicker: string; beats: string[]; timings: CinemaTimings };
```

---

### Task 1: Beats engine — `shared/beats.ts`

**Files:**
- Create: `shared/beats.ts`, `shared/beats.test.ts`

**Interfaces:**
- Produces:
  - `beatsFromTranslation(english: string): string[]` — 2–5 beats derived from a translation
  - `validateBeatsFile(beats: Record<string, string[]>, verseRefs: Set<string>): void` (throws on any rule violation)
  - `beatDurationSec(text: string): number` — the Global Constraints formula
  - `NO_EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u`

- [ ] **Step 1: Failing tests**

```ts
// shared/beats.test.ts
import { describe, it, expect } from 'vitest';
import { beatsFromTranslation, validateBeatsFile, beatDurationSec } from './beats.ts';

describe('beatDurationSec', () => {
  it('applies clamp(1.8 + chars/16, 2.4, 4.2)', () => {
    expect(beatDurationSec('x'.repeat(16))).toBeCloseTo(2.8, 5); // 1.8 + 1
    expect(beatDurationSec('hi')).toBe(2.4);                     // clamped low
    expect(beatDurationSec('x'.repeat(80))).toBe(4.2);           // clamped high
  });
});

describe('beatsFromTranslation', () => {
  it('splits sentences, strips vocatives, caps at 5', () => {
    const b = beatsFromTranslation(
      'O Arjuna, your right is to work only. Never to its fruits. Do not let results be your motive. Nor attach to inaction. Stand firm in yoga. Abandon attachment.',
    );
    expect(b).toHaveLength(5);
    expect(b[0]).toBe('Your right is to work only.');
  });

  it('splits a single sentence at its natural midpoint to reach 2 beats', () => {
    const b = beatsFromTranslation('The wise grieve neither for the living, nor for the dead.');
    expect(b).toHaveLength(2);
    expect(b[0].endsWith(',') || b[0].endsWith('.')).toBe(true);
    expect(b[1].length).toBeGreaterThan(0);
  });

  it('single sentence without punctuation splits at middle word boundary', () => {
    const b = beatsFromTranslation('He who sees inaction in action truly sees');
    expect(b).toHaveLength(2);
    expect(b.join(' ').replace(/[.]/g, '')).toContain('inaction in action');
  });

  it('trims long sentences at a word boundary to <=90 chars with ellipsis', () => {
    const long = 'This sentence is deliberately stretched with many additional words so that it comfortably exceeds the ninety character limit imposed on beats.';
    const b = beatsFromTranslation(long + ' Second sentence.');
    expect(b[0].length).toBeLessThanOrEqual(90);
    expect(b[0].endsWith('…')).toBe(true);
    expect(b[0]).not.toMatch(/\s…$/);
  });

  it('ensures terminal punctuation and capitalized first letter', () => {
    const b = beatsFromTranslation('the mind is restless. hard to control');
    for (const line of b) {
      expect(line[0]).toBe(line[0].toUpperCase());
      expect(/[.!?…,]$/.test(line)).toBe(true);
    }
  });
});

describe('validateBeatsFile', () => {
  const refs = new Set(['gita:2:47']);
  it('accepts a valid file', () => {
    expect(() => validateBeatsFile({ 'gita:2:47': ['Do the work.', 'Release the outcome.'] }, refs)).not.toThrow();
  });
  it('rejects unknown refs, wrong counts, long lines, emoji', () => {
    expect(() => validateBeatsFile({ 'gita:9:99': ['a.', 'b.'] }, refs)).toThrow(/unknown ref/);
    expect(() => validateBeatsFile({ 'gita:2:47': ['only one.'] }, refs)).toThrow(/2-6/);
    expect(() => validateBeatsFile({ 'gita:2:47': ['a.'.repeat(60), 'b.'] }, refs)).toThrow(/90/);
    expect(() => validateBeatsFile({ 'gita:2:47': ['ok line.', 'bad 🙏.'] }, refs)).toThrow(/emoji/);
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npm test`, module missing).

- [ ] **Step 3: Implement**

```ts
// shared/beats.ts
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const NO_EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

export function beatDurationSec(text: string): number {
  return clamp(1.8 + text.length / 16, 2.4, 4.2);
}

const VOCATIVE = /^O [^,]{2,30},\s*/;

function polish(line: string): string {
  let s = line.trim().replace(VOCATIVE, '').trim();
  if (!s) return s;
  s = s[0].toUpperCase() + s.slice(1);
  if (s.length > 90) {
    const cut = s.lastIndexOf(' ', 89);
    s = s.slice(0, cut > 40 ? cut : 89).trimEnd() + '…';
  }
  if (!/[.!?…,]$/.test(s)) s += '.';
  return s;
}

function midpointSplit(sentence: string): [string, string] {
  const mid = sentence.length / 2;
  const punct = [...sentence.matchAll(/[,;—]\s/g)].map((m) => m.index!);
  if (punct.length > 0) {
    const at = punct.reduce((a, b) => (Math.abs(a - mid) < Math.abs(b - mid) ? a : b));
    return [sentence.slice(0, at + 1), sentence.slice(at + 1)];
  }
  const spaces = [...sentence.matchAll(/ /g)].map((m) => m.index!);
  const at = spaces.length ? spaces.reduce((a, b) => (Math.abs(a - mid) < Math.abs(b - mid) ? a : b)) : mid;
  return [sentence.slice(0, at), sentence.slice(at)];
}

export function beatsFromTranslation(english: string): string[] {
  const sentences = english
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  let beats = sentences.map(polish).filter(Boolean);
  if (beats.length === 1) {
    const [a, b] = midpointSplit(sentences[0]);
    beats = [polish(a), polish(b)].filter(Boolean);
  }
  return beats.slice(0, 5);
}

export function validateBeatsFile(beats: Record<string, string[]>, verseRefs: Set<string>): void {
  for (const [ref, lines] of Object.entries(beats)) {
    if (!verseRefs.has(ref)) throw new Error(`unknown ref ${ref}`);
    if (lines.length < 2 || lines.length > 6) throw new Error(`${ref}: 2-6 beats required, got ${lines.length}`);
    for (const line of lines) {
      if (line.length > 90) throw new Error(`${ref}: beat exceeds 90 chars: "${line.slice(0, 40)}…"`);
      if (NO_EMOJI.test(line)) throw new Error(`${ref}: emoji not allowed on screen: "${line}"`);
      if (!line.trim()) throw new Error(`${ref}: empty beat`);
    }
  }
}
```

- [ ] **Step 4: Run → PASS** (`npm test`), `npm run typecheck` → 0.
- [ ] **Step 5: Commit** — `git add shared/beats.* && git commit -m "feat: beats engine — translation fallback, duration formula, file validation"`

---

### Task 2: Curated beats — `sources/beats.json` (~120 verses)

**Files:**
- Create: `sources/beats.json`, `scripts/beats-validate.test.ts`

**Interfaces:**
- Consumes: `validateBeatsFile` (Task 1).
- Produces: committed `sources/beats.json` mapping `"gita:c:v"` → `string[]` (first line = hook).

- [ ] **Step 1: Validation test (write first — it fails on the missing file)**

```ts
// scripts/beats-validate.test.ts
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { validateBeatsFile } from '../shared/beats.ts';

describe('sources/beats.json', () => {
  it('exists, validates, and covers at least 100 verses', () => {
    const beats = JSON.parse(readFileSync('sources/beats.json', 'utf8'));
    const gita = JSON.parse(readFileSync('sources/gita.json', 'utf8'));
    const refs = new Set<string>(gita.verses.map((v: { ref: string }) => v.ref));
    expect(() => validateBeatsFile(beats, refs)).not.toThrow();
    expect(Object.keys(beats).length).toBeGreaterThanOrEqual(100);
  });

  it('flagship verses are covered', () => {
    const beats = JSON.parse(readFileSync('sources/beats.json', 'utf8'));
    for (const ref of ['gita:2:47', 'gita:2:62', 'gita:2:63', 'gita:4:7', 'gita:4:8', 'gita:18:66', 'gita:2:14', 'gita:6:5', 'gita:2:20', 'gita:12:15'])
      expect(beats[ref], `${ref} missing`).toBeDefined();
  });
});
```

- [ ] **Step 2: Run → FAIL** (file missing).

- [ ] **Step 3: Author the beats.** Editorial rules (binding):
  - Work from each verse's `hindi`/`english` in `sources/gita.json` — the beats must restate THAT verse's teaching, never a generic Krishna quote. Spot-check ambiguous ones against the Sanskrit.
  - Voice: second person, present tense, concrete, modern. Hook ≤ 60 chars, arresting ("Do the work. Release the outcome."). Subsequent beats develop the idea, one thought each. 3-5 beats typical.
  - Register: dignified, never slangy; no "bro/vibes/energy" language; no therapy-speak clichés.
  - Coverage: all of chapters 2 and 12; the famous verses of 3, 4, 6, 7, 9, 15, 18 (include every verse the classic canon quotes: 2:14, 2:20, 2:47, 2:62-63, 3:35, 4:7-8, 6:5-6, 9:22, 9:26, 12:13-15, 18:66 among them); total ≥ 120 refs.
  - Chain verses (like 2:62-63) may share overlapping narrative but each ref gets its own entry.

- [ ] **Step 4: Run → PASS** (`npm test`). Manually read 10 random entries against their verse translations — every beat's claim must be traceable to the verse.

- [ ] **Step 5: Commit** — `git add sources/beats.json scripts/beats-validate.test.ts && git commit -m "feat: curated beats for 120+ verses"`

---

### Task 3: Cinema timeline — `computeCinemaTimeline`

**Files:**
- Modify: `shared/types.ts` (add `CinemaTimings` + `ReelProps.format`/`cinema` exactly as the header block), `pipeline/timeline.ts`, `pipeline/timeline.test.ts`

**Interfaces:**
- Consumes: `beatDurationSec` from `shared/beats.ts`.
- Produces: `computeCinemaTimeline(beats: string[]): CinemaTimings` (throws `TimelineTooLongError` past 59.5 — reuse the existing error class).

- [ ] **Step 1: Failing tests** (append to `pipeline/timeline.test.ts`)

```ts
import { computeCinemaTimeline } from './timeline.ts';

describe('computeCinemaTimeline', () => {
  const beats = ['Do the work. Release the outcome.', 'You control the effort.', 'You never controlled the results.'];

  it('sequences beats with crossfade overlap from 1.0s', () => {
    const t = computeCinemaTimeline(beats);
    expect(t.kickerInSec).toBe(0.8);
    expect(t.crossfadeSec).toBe(0.35);
    expect(t.beats[0].startSec).toBe(1.0);
    expect(t.beats[1].startSec).toBeCloseTo(1.0 + t.beats[0].durSec - 0.35, 5);
    expect(t.closingStartSec).toBeCloseTo(t.beats[2].startSec + t.beats[2].durSec - 0.35, 5);
    expect(t.totalSec).toBeCloseTo(t.closingStartSec + t.closingSec + 0.5, 5);
  });

  it('applies the duration formula per beat', () => {
    const t = computeCinemaTimeline(beats);
    expect(t.beats[0].durSec).toBeCloseTo(Math.min(4.2, 1.8 + beats[0].length / 16), 5);
  });

  it('pads hook and closing equally up to the 12s floor', () => {
    const t = computeCinemaTimeline(['Short one.', 'Short two.']);
    expect(t.totalSec).toBeGreaterThanOrEqual(12);
    expect(t.beats[0].durSec).toBeGreaterThan(2.4);
    expect(t.closingSec).toBeGreaterThan(3.2);
    expect(t.beats[0].durSec - 2.4).toBeCloseTo(t.closingSec - 3.2, 5);
  });

  it('rejects empty beats and impossible lengths', () => {
    expect(() => computeCinemaTimeline([])).toThrow(/at least/);
  });
});
```

- [ ] **Step 2: Run → FAIL. Step 3: Implement** in `pipeline/timeline.ts`:

```ts
import { beatDurationSec } from '../shared/beats.ts';
import type { CinemaTimings } from '../shared/types.ts';

export function computeCinemaTimeline(beats: string[]): CinemaTimings {
  if (beats.length < 1) throw new Error('cinema needs at least one beat');
  const kickerInSec = 0.8;
  const crossfadeSec = 0.35;
  const closingBase = 3.2;
  let cursor = 1.0;
  const seq = beats.map((b) => {
    const durSec = beatDurationSec(b);
    const startSec = cursor;
    cursor = startSec + durSec - crossfadeSec;
    return { startSec, durSec };
  });
  let closingStartSec = cursor;
  let closingSec = closingBase;
  let totalSec = closingStartSec + closingSec + 0.5;
  if (totalSec < 12) {
    const pad = (12 - totalSec) / 2;
    seq[0] = { ...seq[0], durSec: seq[0].durSec + pad };
    for (let i = 1; i < seq.length; i++) seq[i] = { ...seq[i], startSec: seq[i].startSec + pad };
    closingStartSec += pad;
    closingSec += pad;
    totalSec = 12;
  }
  if (totalSec > 59.5) throw new TimelineTooLongError(totalSec);
  return { kickerInSec, beats: seq, crossfadeSec, closingStartSec, closingSec, totalSec };
}
```

- [ ] **Step 4: PASS + typecheck. Step 5: Commit** — `git commit -m "feat: cinema timeline with crossfade sequencing and 12s floor"`

---

### Task 4: `CinemaReel` composition + Archivo Black

**Files:**
- Create: `video/CinemaReel.tsx`, `video/components/Kicker.tsx`, `video/components/BeatCard.tsx`, `video/components/ClosingCard.tsx`, `video/components/RadialScrim.tsx`, `fixtures/props-cinema-2-47.json`, `public/assets/fonts/ArchivoBlack-Regular.ttf`
- Modify: `video/Root.tsx`, `video/fonts.ts`, `scripts/embed-fonts.ts` (add the new font, regenerate `video/fonts-embedded.ts`), `public/assets/manifest.json` (fonts entry, license `OFL-1.1`)

**Interfaces:**
- Consumes: `CinemaTimings`, `ReelProps` (Task 3), `Background` (existing, `{ media, seed }`), `FPS` from shared/types.
- Produces: composition id **`CinemaReel`**, `calculateMetadata` → `Math.round(props.cinema.timings.totalSec * FPS)`; font family export `DISPLAY = 'ArchivoBlack'`.

- [ ] **Step 1: Font** — download `https://raw.githubusercontent.com/google/fonts/main/ofl/archivoblack/ArchivoBlack-Regular.ttf` to `public/assets/fonts/`; add `['DISPLAY_400', 'public/assets/fonts/ArchivoBlack-Regular.ttf']` to `scripts/embed-fonts.ts`; run `npx tsx scripts/embed-fonts.ts`; in `video/fonts.ts` add `export const DISPLAY = 'ArchivoBlack';` + `loadFont({ family: DISPLAY, url: DISPLAY_400, weight: '400', format: 'truetype' });` Manifest fonts entry with the google/fonts source URL.

- [ ] **Step 2: Fixture** — `fixtures/props-cinema-2-47.json`: verse 2:47 copied from `sources/gita.json`, `format: "cinema"`, `cinema.kicker: "GITA 2.47"`, `cinema.beats` = the curated 2:47 entry from Task 2, `cinema.timings` = literal output of `computeCinemaTimeline` for those beats (compute once via `npx tsx -e`, paste), `audio` nulls, `media` nulls, brand handle placeholder. (Classic fixture untouched; `format` is optional so old fixtures remain valid.)

- [ ] **Step 3: Components** (complete code):

```tsx
// video/components/RadialScrim.tsx
import { AbsoluteFill } from 'remotion';
export const RadialScrim: React.FC = () => (
  <AbsoluteFill
    style={{
      background: 'radial-gradient(ellipse 85% 55% at 50% 52%, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.28) 55%, rgba(0,0,0,0) 100%)',
    }}
  />
);
```

```tsx
// video/components/Kicker.tsx
import { Easing, interpolate, useCurrentFrame } from 'remotion';
import { FPS } from '../../shared/types.ts';
import { LATIN } from '../fonts.ts';

export const Kicker: React.FC<{ text: string; inSec: number; handle: string }> = ({ text, inSec, handle }) => {
  const t = useCurrentFrame() / FPS;
  const opacity = interpolate(t, [0.2, 0.2 + inSec], [0, 1], {
    extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic),
  });
  return (
    <>
      <div style={{
        position: 'absolute', top: 150, width: '100%', textAlign: 'center', opacity,
        fontFamily: LATIN, fontSize: 34, letterSpacing: 14, color: '#e8c874',
        textShadow: '0 2px 18px rgba(0,0,0,0.85)',
      }}>
        {text}
      </div>
      <div style={{
        position: 'absolute', top: 70, width: '100%', textAlign: 'center', opacity: opacity * 0.75,
        fontFamily: LATIN, fontSize: 22, letterSpacing: 6, color: '#f5efe0',
        textShadow: '0 2px 14px rgba(0,0,0,0.85)',
      }}>
        {handle}
      </div>
    </>
  );
};
```

```tsx
// video/components/BeatCard.tsx  (mounted per beat inside a Sequence; handles its own fade in/out)
import { Easing, interpolate, useCurrentFrame } from 'remotion';
import { FPS } from '../../shared/types.ts';
import { DISPLAY } from '../fonts.ts';

export const BeatCard: React.FC<{ text: string; durSec: number; fadeSec: number }> = ({ text, durSec, fadeSec }) => {
  const t = useCurrentFrame() / FPS;
  const opacity =
    interpolate(t, [0, fadeSec], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.quad) }) *
    interpolate(t, [durSec - fadeSec, durSec], [1, 0], { extrapolateLeft: 'clamp', easing: Easing.in(Easing.quad) });
  const rise = interpolate(t, [0, fadeSec], [14, 0], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 110px', opacity, transform: `translateY(${rise}px)`,
    }}>
      <div style={{
        fontFamily: DISPLAY, fontSize: 64, lineHeight: 1.28, color: '#ffffff', textAlign: 'center',
        textTransform: 'none', textShadow: '0 3px 28px rgba(0,0,0,0.9)',
      }}>
        {text}
      </div>
    </div>
  );
};
```

```tsx
// video/components/ClosingCard.tsx
import { Easing, interpolate, useCurrentFrame } from 'remotion';
import { FPS, type Verse } from '../../shared/types.ts';
import { DEVANAGARI, LATIN } from '../fonts.ts';

export const ClosingCard: React.FC<{ verse: Verse; handle: string }> = ({ verse, handle }) => {
  const t = useCurrentFrame() / FPS;
  const opacity = interpolate(t, [0, 0.5], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const shlokaLine = verse.sanskrit.find((l) => !l.endsWith('उवाच')) ?? verse.sanskrit[0];
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '0 96px', opacity, textAlign: 'center',
    }}>
      <div style={{ fontFamily: DEVANAGARI, fontSize: 46, lineHeight: 1.7, color: '#f5efe0', textShadow: '0 2px 24px rgba(0,0,0,0.9)' }}>
        {shlokaLine}
      </div>
      <div style={{ fontFamily: LATIN, fontSize: 30, letterSpacing: 8, color: '#e8c874', marginTop: 44, textShadow: '0 2px 18px rgba(0,0,0,0.85)' }}>
        BHAGAVAD GITA {verse.chapter}.{verse.verse}
      </div>
      <div style={{ fontFamily: LATIN, fontSize: 24, letterSpacing: 4, color: '#f5efe0', opacity: 0.8, marginTop: 20 }}>
        {handle}
      </div>
    </div>
  );
};
```

```tsx
// video/CinemaReel.tsx
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { FPS, type ReelProps } from '../shared/types.ts';
import './fonts.ts';
import { Background } from './components/Background.tsx';
import { RadialScrim } from './components/RadialScrim.tsx';
import { Kicker } from './components/Kicker.tsx';
import { BeatCard } from './components/BeatCard.tsx';
import { ClosingCard } from './components/ClosingCard.tsx';

export const CinemaReel: React.FC<ReelProps> = (p) => {
  const frame = useCurrentFrame();
  const c = p.cinema!;
  const s = (sec: number) => Math.round(sec * FPS);

  const musicVolume = (f: number) => {
    const t = f / FPS;
    return (
      interpolate(t, [0, 1.2], [0, 0.30], { extrapolateRight: 'clamp' }) *
      interpolate(t, [c.timings.totalSec - 2.2, c.timings.totalSec], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    );
  };
  const blackout = interpolate(frame / FPS, [c.timings.totalSec - 0.5, c.timings.totalSec], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#0d0817' }}>
      <Background media={p.media} seed={`${p.verse.ref}:${p.media.background ?? ''}`} />
      <RadialScrim />
      <Kicker text={c.kicker} inSec={c.timings.kickerInSec} handle={p.brand.handle} />
      {c.beats.map((b, i) => (
        <Sequence key={i} from={s(c.timings.beats[i].startSec)} durationInFrames={s(c.timings.beats[i].durSec)}>
          <BeatCard text={b} durSec={c.timings.beats[i].durSec} fadeSec={c.timings.crossfadeSec} />
        </Sequence>
      ))}
      <Sequence from={s(c.timings.closingStartSec)}>
        <ClosingCard verse={p.verse} handle={p.brand.handle} />
      </Sequence>
      {p.media.music && <Audio src={staticFile(p.media.music)} volume={musicVolume} loop />}
      <AbsoluteFill style={{ backgroundColor: '#000', opacity: blackout, pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};
```

`video/Root.tsx`: add alongside the existing composition:

```tsx
<Composition
  id="CinemaReel"
  component={CinemaReel}
  width={WIDTH} height={HEIGHT} fps={FPS}
  durationInFrames={30 * 20}
  defaultProps={cinemaFixture as ReelProps}
  calculateMetadata={({ props }) => ({ durationInFrames: Math.round(props.cinema!.timings.totalSec * FPS) })}
/>
```

(import `cinemaFixture from '../fixtures/props-cinema-2-47.json'` and `CinemaReel`.)

- [ ] **Step 4: Verify** — `npm test && npm run typecheck`; stills over the gradient fallback:

```bash
npx remotion still video/index.ts CinemaReel out/cin-hook.png --frame=60 --props=fixtures/props-cinema-2-47.json
npx remotion still video/index.ts CinemaReel out/cin-mid.png  --frame=150 --props=fixtures/props-cinema-2-47.json
npx remotion still video/index.ts CinemaReel out/cin-close.png --frame=<closingStart*30+20> --props=fixtures/props-cinema-2-47.json
```

Read all three PNGs yourself: kicker letterspacing even, beat text bold/centered/legible, no clipping at 2-line wrap, closing card balanced. Fix sizes if wrapping breaks.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: CinemaReel composition with beats, kicker, closing card, archivo black"`

---

### Task 5: Pipeline plumbing + cinema captions

**Files:**
- Modify: `pipeline/run.ts`, `pipeline/run.test.ts`, `post/captions.ts`, `post/captions.test.ts`, `config.json` (add `"format": "classic"` — flip happens in Task 8)

**Interfaces:**
- Consumes: everything above.
- Produces: `parseArgs` → `{ verse?, dryRun, background?, format?: 'classic' | 'cinema' }` (invalid → throw listing valid values); `cinemaYoutubeTitle(v, hook)`, `cinemaYoutubeDescription(v, beats)`, `cinemaInstagramCaption(v, beats)` from `post/captions.ts`; run.ts renders composition `CinemaReel` with cinema props when format resolves to cinema.

- [ ] **Step 1: Failing tests**

`pipeline/run.test.ts` additions:
```ts
  it('parses a format override', () => {
    expect(parseArgs(['--format', 'cinema'])).toEqual({ dryRun: false, format: 'cinema' });
  });
  it('rejects unknown formats', () => {
    expect(() => parseArgs(['--format', 'fancy'])).toThrow(/classic|cinema/);
  });
```

`post/captions.test.ts` additions (reuse the existing test Verse `v`):
```ts
describe('cinema captions', () => {
  const beats = ['Do the work. Release the outcome.', 'You control the effort.'];
  it('title = hook + reference, <=100 chars, truncated at word boundary', () => {
    const t = cinemaYoutubeTitle(v, beats[0]);
    expect(t).toBe('Do the work. Release the outcome. | Bhagavad Gita 2.47 #Shorts');
    const long = cinemaYoutubeTitle(v, 'word '.repeat(40).trim() + '.');
    expect(long.length).toBeLessThanOrEqual(100);
    expect(long).toContain('| Bhagavad Gita 2.47 #Shorts');
    expect(long).not.toMatch(/\swor\b/);
  });
  it('description carries beats, shloka, attribution', () => {
    const d = cinemaYoutubeDescription(v, beats);
    for (const s of [beats[0], beats[1], v.sanskrit[0], v.attribution.english]) expect(d).toContain(s);
  });
  it('instagram caption is hook-first and under budget', () => {
    const c = cinemaInstagramCaption(v, beats);
    expect(c.startsWith(beats[0])).toBe(true);
    expect(c.length).toBeLessThanOrEqual(2200);
    expect(c).toContain('#bhagavadgita');
  });
});
```

- [ ] **Step 2: FAIL → implement.**

`post/captions.ts` additions:
```ts
export function cinemaYoutubeTitle(v: Verse, hook: string): string {
  const suffix = ` | Bhagavad Gita ${v.chapter}.${v.verse} #Shorts`;
  let h = hook;
  const budget = 100 - suffix.length;
  if (h.length > budget) {
    const cut = h.lastIndexOf(' ', budget - 1);
    h = h.slice(0, cut > 20 ? cut : budget - 1).trimEnd() + '…';
  }
  return h + suffix;
}

export function cinemaYoutubeDescription(v: Verse, beats: string[]): string {
  return [beats.join('\n'), '', v.sanskrit.join('\n'), '',
    `Translation basis: ${v.attribution.english}`, '', HASHTAGS.join(' ')].join('\n');
}

export function cinemaInstagramCaption(v: Verse, beats: string[]): string {
  const body = [beats[0], '', beats.slice(1).join('\n'), '', v.sanskrit.join('\n'), '',
    `(${v.attribution.english})`, '', HASHTAGS.join(' ')].join('\n');
  return body.length <= 2200 ? body : body.slice(0, 2199) + '…';
}
```

`pipeline/run.ts` — parseArgs: after `--background` handling:
```ts
  const fi = argv.indexOf('--format');
  const format = fi === -1 ? undefined : (argv[fi + 1] as 'classic' | 'cinema');
  if (fi !== -1 && format !== 'classic' && format !== 'cinema')
    throw new Error(`--format must be classic or cinema, got: ${argv[fi + 1] ?? '(none)'}`);
```
(include `format` in both returns). In `main()` after verse resolution:
```ts
  const format: 'classic' | 'cinema' = args.format ?? config.format ?? 'classic';
```
(`config` type gains `format?: 'classic' | 'cinema'`; add `"format": "classic"` to `config.json`.)

Cinema branch replaces the TTS+classic-timeline+render section when `format === 'cinema'`:
```ts
  if (format === 'cinema') {
    const beatsFile = JSON.parse(readFileSync('sources/beats.json', 'utf8')) as Record<string, string[]>;
    const beats = beatsFile[verse.ref] ?? beatsFromTranslation(verse.english);
    const timings = computeCinemaTimeline(beats);
    const images = pool.filter((p) => p.kind === 'image');
    const cinemaPool = images.length ? images : pool;
    const bgEntry = args.background
      ? resolveBackground(args.background, pool)
      : cinemaPool.length
        ? resolveBackground(pickAsset(verse.ref, cinemaPool.map((p) => p.file)), cinemaPool)
        : null;
    const musicFile = tracks.length ? pickAsset(verse.ref, tracks) : null;
    const props: ReelProps = {
      verse,
      timings: computeTimeline({ introDurSec: 3, meaningDurSec: 10, englishText: verse.english }), // unused by CinemaReel; satisfies the shared type
      format: 'cinema',
      cinema: { kicker: `GITA ${verse.chapter}.${verse.verse}`, beats, timings },
      audio: { introFile: null, meaningFile: null },
      media: { background: bgEntry?.rel ?? null, music: musicFile ? `assets/music/${musicFile}` : null },
      brand: { handle: config.handle },
    };
    mkdirSync('out', { recursive: true });
    writeFileSync('out/props.json', JSON.stringify(props, null, 2));
    await renderComposition('CinemaReel');
    console.log(`✔ rendered out/reel.mp4 (${timings.totalSec.toFixed(1)}s, format=cinema, bg=${bgEntry?.file ?? 'gradient'}, music=${musicFile ?? 'none'}, beats=${beats.length}${beatsFile[verse.ref] ? '' : ' [fallback]'})`);
  }
```
where `renderComposition(id: string)` is the existing render `execa` call extracted into a tiny helper both branches use (identical args except the composition id). If carrying the dummy classic `timings` grates, make `ReelProps.timings` optional in the same commit and guard the classic fixture cast — implementer's choice; state which in the report.

Captions seam: add optional `overrides?: { title: string; description: string }` to `buildYoutubeRequest(v, credits, overrides?)` and `caption?: string` to `postInstagram(v, url, env, caption?)`, both defaulting to the classic templates when absent (classic behavior byte-identical). run.ts computes cinema texts (`cinemaYoutubeTitle(verse, beats[0])`, `cinemaYoutubeDescription(verse, beats)`, `cinemaInstagramCaption(verse, beats)`) and passes them only on the cinema path. Test additions:

```ts
// post/youtube.test.ts
it('override replaces title/description; default stays classic', () => {
  const r = buildYoutubeRequest(v, [], { title: 'T', description: 'D' });
  expect(r.snippet.title).toBe('T');
  expect(r.snippet.description).toBe('D');
  expect(buildYoutubeRequest(v).snippet.title).toContain('गीता ज्ञान');
});
```
`postInstagram`'s `caption` param is exercised through `reelContainerParams` — add:
```ts
// post/instagram.test.ts
it('container params carry a custom caption verbatim', () => {
  expect(reelContainerParams('custom caption', 'https://x/y.mp4').get('caption')).toBe('custom caption');
});
```
(`postInstagram` internally switches from `instagramCaption(v)` to the `caption` argument when provided.)

- [ ] **Step 3: PASS + typecheck.**
- [ ] **Step 4: Golden dry-runs (local)**

```bash
export PATH="$HOME/.local/bin:$PATH"
npm run generate -- --verse gita:2:47 --format cinema --dry-run   # curated beats; no TTS lines in log; fast
npm run generate -- --verse gita:1:1  --format cinema --dry-run   # fallback beats path
npm run generate -- --verse gita:2:47 --format classic --dry-run  # classic regression (TTS runs)
```
Expected: all `EXIT 0`/`✔ rendered`; cinema logs show `format=cinema`, no TTS; classic unchanged.

- [ ] **Step 5: Commit** — `git commit -m "feat: cinema format plumbing — flag, config, captions, image-first pool"`

---

### Task 6: Dashboard format select

**Files:**
- Modify: `dashboard/lib/backend.ts` (`generate(ref, background?, format?)`), `dashboard/lib/local-backend.ts` (validate + pass `--format`), `dashboard/app/api/generate/route.ts` (accept/validate `format`), `dashboard/app/components/GeneratePanel.tsx` (Format select: `Auto (config)` value `''`, `Classic`, `Cinema`; include in POST body only when non-empty)

**Interfaces:**
- Consumes: Task 5's `--format` flag.
- Produces: `POST /api/generate { ref, background?, format? }` → 400 `{ error: 'invalid format' }` unless `format` is absent/`classic`/`cinema`.

- [ ] **Step 1: Wire it** — route: validate `format === undefined || format === 'classic' || format === 'cinema'` before calling the backend; backend `generateStream`: same guard (defense in depth), append `['--format', format]` to spawn args when present. UI: a third `<select>` styled like the others, default `''` labeled `Auto (config)`.
- [ ] **Step 2: Verify** — `npm run typecheck --prefix dashboard`; server up; `curl -X POST …/api/generate -d '{"ref":"gita:2:47","format":"fancy"}' -H 'content-type: application/json'` → 400; UI: generate 2:47 with Format=Cinema → log shows `format=cinema`, video plays; kill server.
- [ ] **Step 3: Commit** — `git commit -m "feat: dashboard format select through backend seam"`

---

### Task 7: Seed images + full-look renders (ends at USER CHECKPOINT)

**Files:**
- Create: `scripts/seed-images.ts`; add 3-5 files to `public/assets/images/` (committed) + manifest `images` entries

**Interfaces:**
- Consumes: Commons API (same pattern as the 2026-08-03 asset curation: `action=query&generator=search&prop=imageinfo&iiprop=url|extmetadata`, User-Agent header required); `ffmpeg-static` for normalization.
- Produces: committed seed images `seed-rrv-<slug>.jpg`, 1080×1920 cover-cropped JPEG.

- [ ] **Step 1: Script** — `scripts/seed-images.ts`: given a hardcoded list of candidate Commons file titles (search `Raja Ravi Varma Krishna` / `Raja Ravi Varma painting` with `filetype:bitmap`, choose portrait-leaning, license `Public domain`/`PD-Art` ONLY — verify `extmetadata.LicenseShortName` per file at runtime, abort on anything else), download originals, normalize: `ffmpeg -i in -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" -frames:v 1 -q:v 3 out.jpg`, write manifest entries `{ file, url: <original url>, license: <LicenseShortName>, source: <commons page> }`.
- [ ] **Step 2: Run it**; verify each seed opens (Read the images), portrait framing sensible (deity visible in center crop — discard/re-crop any where the subject is cut off; `crop` position can be adjusted per file with `crop=1080:1920:x:y` if needed).
- [ ] **Step 3: Full-look renders** — `npm run generate -- --verse gita:2:47 --format cinema --dry-run` (picks a seed image now); save as `out/cinema-2-47.mp4`; render a second verse (e.g. `gita:2:62`) for variety; extract stills of hook + closing over the real painting; Read them: text legible over the artwork, scrim not muddying the image.
- [ ] **Step 4: Commit** — `git commit -m "feat: PD-Art seed images and cinema look renders"`
- [ ] **Step 5: USER CHECKPOINT — STOP.** Present both MP4s to the user (`open out/cinema-2-47.mp4`). Task 8 runs only after explicit user approval of the look.

---

### Task 8: Flip the default + docs (post-approval only)

**Files:**
- Modify: `config.json` (`"format": "cinema"`), `README.md` (formats section: cinema default, classic via `--format classic`, beats file editing note), memory of the repo: none else.

- [ ] **Step 1:** `config.json` → `"format": "cinema"`. `npm run generate -- --dry-run` (no overrides) → renders the NEXT queue verse in cinema.
- [ ] **Step 2:** README: describe both formats, the beats file (`sources/beats.json` — edit any line, it ships next render), the image pool preference, and that classic remains available.
- [ ] **Step 3:** `npm test && npm run typecheck && npm run typecheck --prefix dashboard` → green. Commit — `git commit -m "feat: cinema becomes the daily default; docs"`
