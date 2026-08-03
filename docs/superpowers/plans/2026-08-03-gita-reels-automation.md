# Gita Reels Automation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A GitHub-Actions-scheduled pipeline that daily generates a Bhagavad Gita verse reel (Remotion video + Hindi edge-tts voiceover + music) and posts it to YouTube Shorts and Instagram Reels, recording state in the repo.

**Architecture:** One public repo = code + verse data + state + scheduler + archive. A TypeScript orchestrator (`pipeline/run.ts`) picks the next verse from `state.json`, synthesizes narration, computes a timeline from audio durations, renders via Remotion CLI, publishes the MP4 as a GitHub Release asset (public URL for Instagram), posts per-platform independently, and commits updated state. Spec: `docs/superpowers/specs/2026-08-03-gita-reels-automation-design.md`.

**Tech Stack:** Node ≥20, TypeScript (strict, ESM), Remotion v4 (`@remotion/cli`, `@remotion/fonts`), React 19, `edge-tts` (Python CLI, voice `hi-IN-MadhurNeural`), `music-metadata`, `execa`, `googleapis`, vitest, GitHub Actions, `gh` CLI.

## Global Constraints

- Node ≥ 20; `"type": "module"`; TypeScript `strict: true`. Plain JS never added — TS only.
- Video: 1080×1920, 30 fps, H.264 MP4, total duration ≤ 59.5 s (Shorts limit).
- Voice: edge-tts `hi-IN-MadhurNeural`. Narration = Hindi meaning only; Sanskrit is never TTS-recited (spec §2).
- ₹0/month: no paid APIs, no LLM calls; captions are deterministic templates.
- Every bundled media asset must have license + source URL recorded in `public/assets/manifest.json` (spec §8). Verse translations must be openly licensed/public-domain with attribution stored in `sources/gita.json`.
- `state.json` is the single posting record; every publish is gated on it (idempotent re-runs, spec §5). Platforms fail independently.
- Deterministic rendering: background/music picked by hash of verse ref, never `Math.random()`.
- Schedule: cron `30 1 * * *` UTC (= 07:00 IST). Repo is public.
- Committed: fonts, `sources/`, `state.json`, `fixtures/`. Gitignored: `out/`, `public/generated/`, `public/assets/backgrounds/`, `public/assets/music/`, `node_modules/`, `.env`.
- Commits use conventional-commit style (`feat:`, `test:`, `chore:`, `docs:`, `ci:`).

## File Structure

```
package.json, tsconfig.json, vitest.config.ts, remotion.config.ts, .gitignore, .env.example
config.json                    # brand handle, startRef, platform toggles
shared/types.ts                # Verse, Timings, ReelProps, FPS/WIDTH/HEIGHT — single source of truth
sources/gita.json              # built dataset (committed)
scripts/build-sources.ts       # raw dataset → sources/gita.json + validation
scripts/fetch-assets.ts        # manifest → download backgrounds/music
scripts/youtube-auth.ts        # one-time OAuth → refresh token
pipeline/run.ts                # orchestrator (CLI: --verse, --dry-run)
pipeline/timeline.ts           # pure timeline math
pipeline/select.ts             # pickNext / recordPost / state IO
pipeline/release.ts            # gh release upload → public URL
voice/tts.ts                   # edge-tts adapter → {path, durationSec}
post/captions.ts               # titles/descriptions/captions/intro text (pure)
post/youtube.ts                # upload Short
post/instagram.ts              # container → poll → publish; token refresh
video/index.ts, video/Root.tsx, video/GitaReel.tsx
video/components/{Background,TitleCard,Shloka,Meaning,Outro}.tsx
video/fonts.ts
public/assets/fonts/*.ttf      # committed (OFL)
public/assets/manifest.json    # asset URLs + licenses
fixtures/props-2-47.json       # golden props for studio/CI smoke render
state.json
.github/workflows/{ci.yml,daily.yml,refresh-token.yml}
SETUP.md, README.md, LICENSE
```

### Shared interfaces (defined once in Task 1, used everywhere)

```ts
// shared/types.ts
export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export type Verse = {
  book: string;                // 'gita'
  ref: string;                 // 'gita:2:47'
  chapter: number;
  verse: number;
  sanskrit: string[];          // shloka lines for line-by-line reveal
  hindi: string;               // meaning (narrated + shown)
  english: string;             // meaning (shown only)
  attribution: { hindi: string; english: string };
};

export type Timings = {
  titleSec: number;
  shlokaStartSec: number; shlokaSec: number;
  meaningStartSec: number; meaningSec: number;
  englishStartSec: number; englishSec: number;
  outroStartSec: number; outroSec: number;
  totalSec: number;
  introAudioStartSec: number;   // when intro VO starts (= shlokaStartSec)
  meaningAudioStartSec: number; // when meaning VO starts (= meaningStartSec)
};

export type ReelProps = {
  verse: Verse;
  timings: Timings;
  audio: { introFile: string | null; meaningFile: string | null }; // staticFile()-relative, null = silent
  media: { background: string | null; music: string | null };      // null = gradient / no music
  brand: { handle: string };
};
```

---

### Task 1: Scaffold — repo skeleton, toolchain, shared types

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `remotion.config.ts`, `.gitignore`, `.env.example`, `config.json`, `shared/types.ts`, `LICENSE` (MIT), `README.md` (3-line stub), `state.json` (`{"posted": []}`)

**Interfaces:**
- Produces: `shared/types.ts` exactly as in "Shared interfaces" above; `config.json` shape `{ "handle": "@yourhandle", "startRef": "gita:1:1", "platforms": ["youtube", "instagram"] }`.

- [ ] **Step 1: Init npm project and install deps**

```bash
npm init -y
npm i remotion@^4 @remotion/cli@^4 @remotion/fonts@^4 react@^19 react-dom@^19
npm i execa@^9 music-metadata@^10 googleapis@^144
npm i -D typescript@^5 tsx@^4 vitest@^3 @types/react@^19 @types/node@^22
```

Then edit `package.json`: set `"type": "module"`, `"private": true`, and scripts:

```json
{
  "scripts": {
    "studio": "remotion studio video/index.ts",
    "render:smoke": "remotion render video/index.ts GitaReel out/smoke.mp4 --props=fixtures/props-2-47.json --frames=0-15",
    "generate": "tsx pipeline/run.ts",
    "sources:build": "tsx scripts/build-sources.ts",
    "assets": "tsx scripts/fetch-assets.ts",
    "auth:youtube": "tsx scripts/youtube-auth.ts",
    "test": "vitest run --passWithNoTests",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: Write config files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "jsx": "react-jsx", "strict": true, "noEmit": true, "skipLibCheck": true,
    "resolveJsonModule": true, "esModuleInterop": true, "types": ["node"]
  },
  "include": ["shared", "pipeline", "voice", "post", "video", "scripts"]
}
```

`remotion.config.ts`:
```ts
import { Config } from '@remotion/cli/config';
Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['**/*.test.ts'] } });
```

`.gitignore`:
```
node_modules/
out/
public/generated/
public/assets/backgrounds/
public/assets/music/
.env
*.log
```

`.env.example`:
```
YT_CLIENT_ID=
YT_CLIENT_SECRET=
YT_REFRESH_TOKEN=
IG_USER_ID=
IG_ACCESS_TOKEN=
GH_PAT=
```

`config.json`, `state.json`, `shared/types.ts` (verbatim from header sections), MIT `LICENSE`, stub `README.md`.

- [ ] **Step 3: Verify toolchain**

Run: `npm run typecheck` → exits 0. Run: `npm test` → exits 0 (no test files yet; `--passWithNoTests` covers this).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: scaffold toolchain, shared types, config"
```

---

### Task 2: Verse dataset — `sources/gita.json` (+ license verification, spec §8)

**Files:**
- Create: `scripts/build-sources.ts`, `sources/gita.json`, `scripts/build-sources.test.ts` (validator unit-tested against the built file)

**Interfaces:**
- Produces: `sources/gita.json` = `{ "book": "gita", "verses": Verse[] }` in canonical order (1:1 … 18:78); `validateSources(data): asserts` exported from `scripts/build-sources.ts`.

- [ ] **Step 1: Download a raw open Gita dataset**

Primary source: `https://github.com/gita/gita` (the bhagavadgita.io open dataset — `data/verse.json`, `data/translation.json`, `data/authors.json`). Download raw files into `out/raw/` with curl. **Check the repo's LICENSE file first.** Decision procedure (record outcome in the commit message):
1. If the license permits redistribution → pick one Hindi and one English translation author present in the data (prefer widely-redistributed swami translations; note author names).
2. If unclear/restrictive → fallback dataset `https://github.com/vedicscriptures/gita` (same check), else public-domain English (Annie Besant, 1895) via manual ingestion and an openly licensed Hindi source. Do not bundle anything whose license you could not verify — this checkpoint is a spec requirement, not optional.

- [ ] **Step 2: Write the validator + failing test**

In `scripts/build-sources.ts` export:

```ts
import type { Verse } from '../shared/types.ts';
export function validateSources(data: { book: string; verses: Verse[] }): void {
  if (data.book !== 'gita') throw new Error('book must be gita');
  const chapters = new Map<number, number[]>();
  for (const v of data.verses) {
    if (!v.sanskrit.length || !v.hindi.trim() || !v.english.trim())
      throw new Error(`empty field at ${v.ref}`);
    if (v.ref !== `gita:${v.chapter}:${v.verse}`) throw new Error(`bad ref ${v.ref}`);
    if (!v.attribution.hindi || !v.attribution.english) throw new Error(`missing attribution at ${v.ref}`);
    (chapters.get(v.chapter) ?? chapters.set(v.chapter, []).get(v.chapter)!).push(v.verse);
  }
  if (chapters.size !== 18) throw new Error(`expected 18 chapters, got ${chapters.size}`);
  for (const [ch, nums] of chapters)
    nums.forEach((n, i) => { if (n !== i + 1) throw new Error(`chapter ${ch} not contiguous at ${n}`); });
  const total = data.verses.length;
  if (total < 700 || total > 701) throw new Error(`expected 700–701 verses, got ${total}`);
  const spot: Record<number, number> = { 1: 47, 2: 72, 18: 78 };
  for (const [ch, n] of Object.entries(spot))
    if (chapters.get(Number(ch))!.length !== n) throw new Error(`chapter ${ch} should have ${n} verses`);
}
```

`scripts/build-sources.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { validateSources } from './build-sources.ts';

describe('sources/gita.json', () => {
  it('is complete, contiguous, attributed', () => {
    const data = JSON.parse(readFileSync('sources/gita.json', 'utf8'));
    expect(() => validateSources(data)).not.toThrow();
  });
  it('validator rejects a broken dataset', () => {
    expect(() => validateSources({ book: 'gita', verses: [] })).toThrow(/18 chapters/);
  });
});
```

- [ ] **Step 3: Run tests → first test FAILS** (`sources/gita.json` missing). Run: `npm test`.

- [ ] **Step 4: Write the transform `main()`**

In the same script: read raw files, map to `Verse` (split `sanskrit` on `\n` into lines, trim empties; `ref` = `gita:${chapter}:${verse}`; attribution strings = `"<author name> (<source repo>)"`, constants `AUTHOR_HINDI` / `AUTHOR_ENGLISH` at top of file chosen in Step 1), sort by chapter then verse, run `validateSources`, write `sources/gita.json` (2-space JSON). Adjust field mapping to the actual raw keys observed in Step 1 — the validator is the contract.

- [ ] **Step 5: Build + verify**

Run: `npm run sources:build` then `npm test` → PASS. Spot-check `gita:2:47` text renders correctly (contains कर्मण्येवाधिकारस्ते).

- [ ] **Step 6: Commit**

```bash
git add scripts/ sources/ && git commit -m "feat: build gita verse dataset with verified licensing/attribution (<licence noted>)"
```

---

### Task 3: Timeline math — `pipeline/timeline.ts`

**Files:**
- Create: `pipeline/timeline.ts`, `pipeline/timeline.test.ts`

**Interfaces:**
- Produces: `computeTimeline(input: { introDurSec: number; meaningDurSec: number; englishText: string }): Timings`; `class TimelineTooLongError extends Error { totalSec: number }`; re-exports nothing else.

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { computeTimeline, TimelineTooLongError } from './timeline.ts';

const base = { introDurSec: 3.2, meaningDurSec: 14, englishText: 'x'.repeat(80) };

describe('computeTimeline', () => {
  it('computes monotonic segment starts from audio durations', () => {
    const t = computeTimeline(base);
    expect(t.titleSec).toBe(2);
    expect(t.shlokaSec).toBe(8);                       // max(8, 3.2 + 4)
    expect(t.meaningStartSec).toBeCloseTo(10, 5);
    expect(t.meaningSec).toBeCloseTo(14.8, 5);         // narration + 0.8 pad
    expect(t.englishStartSec).toBeCloseTo(24.8, 5);
    expect(t.englishSec).toBeCloseTo(80 / 15, 2);      // clamped 3.5..6
    expect(t.outroStartSec).toBeCloseTo(24.8 + 80 / 15, 2);
    expect(t.totalSec).toBeCloseTo(t.outroStartSec + 4 + 0.7, 2);
    expect(t.introAudioStartSec).toBe(t.shlokaStartSec);
    expect(t.meaningAudioStartSec).toBe(t.meaningStartSec);
  });
  it('long intro stretches the shloka section', () => {
    expect(computeTimeline({ ...base, introDurSec: 9 }).shlokaSec).toBe(13);
  });
  it('clamps english reading time', () => {
    expect(computeTimeline({ ...base, englishText: 'hi' }).englishSec).toBe(3.5);
    expect(computeTimeline({ ...base, englishText: 'x'.repeat(400) }).englishSec).toBe(6);
  });
  it('throws TimelineTooLongError past 59.5s', () => {
    expect(() => computeTimeline({ ...base, meaningDurSec: 45 })).toThrow(TimelineTooLongError);
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npm test`, module not found).

- [ ] **Step 3: Implement**

```ts
import type { Timings } from '../shared/types.ts';
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export class TimelineTooLongError extends Error {
  constructor(public totalSec: number) { super(`reel would be ${totalSec.toFixed(1)}s (> 59.5s)`); }
}

export function computeTimeline(input: { introDurSec: number; meaningDurSec: number; englishText: string }): Timings {
  const titleSec = 2;
  const shlokaStartSec = titleSec;
  const shlokaSec = Math.max(8, input.introDurSec + 4);
  const meaningStartSec = shlokaStartSec + shlokaSec;
  const meaningSec = input.meaningDurSec + 0.8;
  const englishStartSec = meaningStartSec + meaningSec;
  const englishSec = clamp(input.englishText.length / 15, 3.5, 6);
  const outroStartSec = englishStartSec + englishSec;
  const outroSec = 4;
  const totalSec = outroStartSec + outroSec + 0.7;
  if (totalSec > 59.5) throw new TimelineTooLongError(totalSec);
  return { titleSec, shlokaStartSec, shlokaSec, meaningStartSec, meaningSec,
    englishStartSec, englishSec, outroStartSec, outroSec, totalSec,
    introAudioStartSec: shlokaStartSec, meaningAudioStartSec: meaningStartSec };
}
```

- [ ] **Step 4: Run → PASS.** `npm run typecheck` → 0.

- [ ] **Step 5: Commit** — `git add pipeline/ && git commit -m "feat: audio-driven reel timeline with 60s guard"`

---

### Task 4: Hindi TTS adapter — `voice/tts.ts`

**Files:**
- Create: `voice/tts.ts`, `voice/tts.test.ts`

**Interfaces:**
- Consumes: nothing internal.
- Produces: `synthHindi(text: string, outPath: string, opts?: { rate?: string }): Promise<{ path: string; durationSec: number }>`; `VOICE = 'hi-IN-MadhurNeural'`.

- [ ] **Step 1: Failing unit test (argument building — pure part)**

Split the command construction into a pure function so it's testable without network:

```ts
// voice/tts.test.ts
import { describe, it, expect } from 'vitest';
import { ttsArgs, VOICE } from './tts.ts';

describe('ttsArgs', () => {
  it('builds edge-tts args with default rate', () => {
    expect(ttsArgs('नमस्ते', '/tmp/a.mp3')).toEqual([
      '--voice', VOICE, '--rate', '+0%', '--text', 'नमस्ते', '--write-media', '/tmp/a.mp3',
    ]);
  });
  it('accepts a rate override', () => {
    expect(ttsArgs('x', 'o.mp3', { rate: '+15%' })).toContain('+15%');
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement adapter with CLI fallback**

```ts
import { execa } from 'execa';
import { parseFile } from 'music-metadata';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export const VOICE = 'hi-IN-MadhurNeural';

export function ttsArgs(text: string, outPath: string, opts?: { rate?: string }): string[] {
  return ['--voice', VOICE, '--rate', opts?.rate ?? '+0%', '--text', text, '--write-media', outPath];
}

async function runEdgeTts(args: string[]): Promise<void> {
  try { await execa('edge-tts', args); }
  catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT')
      await execa('python3', ['-m', 'edge_tts', ...args]); // pip-installed module fallback
    else throw e;
  }
}

export async function synthHindi(text: string, outPath: string, opts?: { rate?: string }) {
  await mkdir(dirname(outPath), { recursive: true });
  await runEdgeTts(ttsArgs(text, outPath, opts));
  const durationSec = (await parseFile(outPath)).format.duration ?? 0;
  if (durationSec < 0.5) throw new Error(`TTS produced suspicious duration ${durationSec}s for: ${text.slice(0, 40)}`);
  return { path: outPath, durationSec };
}
```

- [ ] **Step 4: Unit tests PASS**, then manual smoke (requires `pip install edge-tts` locally):

Run: `npx tsx -e "import('./voice/tts.ts').then(m => m.synthHindi('भगवद्गीता, अध्याय दो, श्लोक सैंतालीस', 'out/smoke-tts.mp3')).then(console.log)"`
Expected: `{ path: 'out/smoke-tts.mp3', durationSec: ~3–4 }`. Listen to the file once — voice should be warm male Hindi.

- [ ] **Step 5: Commit** — `git add voice/ && git commit -m "feat: hindi tts adapter over edge-tts with duration probe"`

---

### Task 5: Remotion video — the storyboard as code

**Files:**
- Create: `video/index.ts`, `video/Root.tsx`, `video/GitaReel.tsx`, `video/fonts.ts`, `video/components/Background.tsx`, `video/components/TitleCard.tsx`, `video/components/Shloka.tsx`, `video/components/Meaning.tsx`, `video/components/Outro.tsx`, `fixtures/props-2-47.json`, `public/assets/fonts/NotoSerifDevanagari-Regular.ttf` + `NotoSerifDevanagari-Bold.ttf` + `NotoSerif-Regular.ttf` (download from Google Fonts GitHub — OFL license, record in manifest later)

**Interfaces:**
- Consumes: `ReelProps`, `Timings`, `FPS/WIDTH/HEIGHT` from `shared/types.ts`.
- Produces: Remotion composition id **`GitaReel`**; `calculateMetadata` sets `durationInFrames = Math.round(props.timings.totalSec * FPS)`. CLI contract used later by the orchestrator: `npx remotion render video/index.ts GitaReel <out.mp4> --props=<props.json>`.

- [ ] **Step 1: Fixture props** — `fixtures/props-2-47.json` with the real 2.47 verse (copy text from `sources/gita.json`), `timings` = output of `computeTimeline({ introDurSec: 3.2, meaningDurSec: 14, englishText: <english> })` (compute once via `tsx -e`, paste literal numbers), `audio: { introFile: null, meaningFile: null }`, `media: { background: null, music: null }`, `brand: { handle: "@yourhandle" }`.

- [ ] **Step 2: Entry + Root**

```tsx
// video/index.ts
import { registerRoot } from 'remotion';
import { Root } from './Root.tsx';
registerRoot(Root);
```

```tsx
// video/Root.tsx
import { Composition } from 'remotion';
import { GitaReel } from './GitaReel.tsx';
import { FPS, HEIGHT, WIDTH, type ReelProps } from '../shared/types.ts';
import fixture from '../fixtures/props-2-47.json';

export const Root: React.FC = () => (
  <Composition
    id="GitaReel"
    component={GitaReel}
    width={WIDTH} height={HEIGHT} fps={FPS}
    durationInFrames={30 * 35}
    defaultProps={fixture as ReelProps}
    calculateMetadata={({ props }) => ({ durationInFrames: Math.round(props.timings.totalSec * FPS) })}
  />
);
```

- [ ] **Step 3: Fonts** — download the three TTFs into `public/assets/fonts/`, then:

```ts
// video/fonts.ts
import { loadFont } from '@remotion/fonts';
import { staticFile } from 'remotion';
export const DEVANAGARI = 'NotoSerifDevanagari';
export const LATIN = 'NotoSerif';
export const fontsReady = Promise.all([
  loadFont({ family: DEVANAGARI, url: staticFile('assets/fonts/NotoSerifDevanagari-Regular.ttf'), weight: '400' }),
  loadFont({ family: DEVANAGARI, url: staticFile('assets/fonts/NotoSerifDevanagari-Bold.ttf'), weight: '700' }),
  loadFont({ family: LATIN, url: staticFile('assets/fonts/NotoSerif-Regular.ttf'), weight: '400' }),
]);
```

Call `fontsReady` via `delayRender`/`continueRender` inside `GitaReel` (useEffect-free pattern: module-level `delayRender` in `fonts.ts` is simplest — `const handle = delayRender('fonts'); fontsReady.then(() => continueRender(handle));`).

- [ ] **Step 4: Components** (each ≤ ~80 lines; shared style: text shadowed `0 2px 24px rgba(0,0,0,.8)`, horizontal padding 96px, centered column):

`Background.tsx` — if `media.background` null: full-screen animated gradient (slow 40s hue drift between deep indigo `#1a1033` → warm maroon `#3d0f1e`, subtle radial glow center-top); else `<OffthreadVideo src={staticFile(media.background)} muted loop>` scaled to cover. Always overlay `linear-gradient(180deg, rgba(0,0,0,.55), rgba(0,0,0,.35) 40%, rgba(0,0,0,.75))`.

`TitleCard.tsx` — centered श्रीमद्भगवद्गीता (Devanagari bold, 88px, gold `#e8c874`) + `अध्याय {chapter} • श्लोक {verse}` (48px, ivory). Fade in over 0.5s, persists as a small header (scale/translate to top, 40px) once shloka starts — implement with `interpolate(frame, ...)` on opacity/translateY/scale, `Easing.out(Easing.cubic)`.

`Shloka.tsx` — verse lines revealed sequentially: line *i* fades/slides up starting at `shlokaStartSec + i * (shlokaSec * 0.6 / lines)`, each over 0.6s. Devanagari 400, 60px, line-height 1.7, ivory `#f5efe0`. Whole section fades out over the 0.7s before `meaningStartSec`.

`Meaning.tsx` — at `meaningStartSec`: label "अर्थ" (gold, 40px) + Hindi meaning (Devanagari, 52px, ≤ 12 words highlighted progressively is NOT required — static block, fade in 0.7s). At `englishStartSec`: English meaning fades in below (Latin serif italic, 40px, `#d8d2c4`). Both fade out 0.7s before `outroStartSec`.

`Outro.tsx` — "रोज़ एक श्लोक 🙏" (64px) + "Follow करें • {brand.handle}" (44px, gold), fade in + gentle scale 1.0→1.04; global fade-to-black over the final 0.7s of the reel.

`GitaReel.tsx` — composes everything inside `<AbsoluteFill>`:

```tsx
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { FPS, type ReelProps } from '../shared/types.ts';
// … component imports, fonts side-effect import
export const GitaReel: React.FC<ReelProps> = (p) => {
  const frame = useCurrentFrame();
  const s = (sec: number) => Math.round(sec * FPS);
  const musicVolume = (f: number) => {
    const t = f / FPS;
    const inVoice =
      (t >= p.timings.introAudioStartSec && t <= p.timings.introAudioStartSec + 4) ||
      (t >= p.timings.meaningAudioStartSec && t <= p.timings.englishStartSec);
    const target = inVoice ? 0.10 : 0.28;                     // duck under narration
    const fadeOut = interpolate(t, [p.timings.totalSec - 2, p.timings.totalSec], [1, 0], { extrapolateLeft: 'clamp' });
    return target * fadeOut;
  };
  return (
    <AbsoluteFill style={{ backgroundColor: '#0d0817' }}>
      <Background media={p.media} />
      <TitleCard verse={p.verse} timings={p.timings} />
      <Sequence from={s(p.timings.shlokaStartSec)} durationInFrames={s(p.timings.shlokaSec)}>
        <Shloka lines={p.verse.sanskrit} timings={p.timings} />
      </Sequence>
      <Sequence from={s(p.timings.meaningStartSec)}>
        <Meaning verse={p.verse} timings={p.timings} />
      </Sequence>
      <Sequence from={s(p.timings.outroStartSec)}>
        <Outro brand={p.brand} timings={p.timings} />
      </Sequence>
      {p.media.music && <Audio src={staticFile(p.media.music)} volume={musicVolume} loop />}
      {p.audio.introFile && (
        <Sequence from={s(p.timings.introAudioStartSec)}>
          <Audio src={staticFile(p.audio.introFile)} />
        </Sequence>
      )}
      {p.audio.meaningFile && (
        <Sequence from={s(p.timings.meaningAudioStartSec)}>
          <Audio src={staticFile(p.audio.meaningFile)} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};
```

(Exact animation curves inside components are the implementer's judgment; the section boundaries, sizes, colors, and fade durations above are the contract.)

- [ ] **Step 5: Verify in studio + smoke render**

Run: `npm run studio` → composition `GitaReel` plays; Devanagari ligatures correct (कर्मण्येवाधिकारस्ते not broken); sections appear/disappear at fixture timings.
Run: `npm run render:smoke` → exits 0, `out/smoke.mp4` exists.

- [ ] **Step 6: USER CHECKPOINT — do not proceed to Task 6 until done.** Show the user the reel in Remotion Studio (or a full fixture render: `npx remotion render video/index.ts GitaReel out/preview-2-47.mp4 --props=fixtures/props-2-47.json`). Collect feedback on typography/colors/pacing; apply small adjustments; re-confirm.

- [ ] **Step 7: Commit** — `git add video/ fixtures/ public/assets/fonts/ && git commit -m "feat: remotion storyboard composition with fonts and fixture"`

---

### Task 6: Asset pack — manifest, fetch script, deterministic picker

**Files:**
- Create: `public/assets/manifest.json`, `scripts/fetch-assets.ts`, `pipeline/pick.ts`, `pipeline/pick.test.ts`

**Interfaces:**
- Produces: `pickAsset(ref: string, files: string[]): string` (pure, fnv-1a hash mod length, throws on empty list); manifest schema `{ backgrounds: Entry[], music: Entry[], fonts: Entry[] }` where `Entry = { file: string; url: string; license: string; source: string }`; `npm run assets` downloads any missing files to `public/assets/{backgrounds,music}/<file>` (fonts are committed, listed for license record only — fetch script skips entries whose file already exists).

- [ ] **Step 1: Failing picker test**

```ts
import { describe, it, expect } from 'vitest';
import { pickAsset } from './pick.ts';

describe('pickAsset', () => {
  it('is deterministic for a ref', () => {
    const files = ['a.mp4', 'b.mp4', 'c.mp4'];
    expect(pickAsset('gita:2:47', files)).toBe(pickAsset('gita:2:47', files));
  });
  it('spreads across the pack', () => {
    const files = Array.from({ length: 12 }, (_, i) => `bg${i}.mp4`);
    const picks = new Set(Array.from({ length: 50 }, (_, i) => pickAsset(`gita:1:${i + 1}`, files)));
    expect(picks.size).toBeGreaterThan(6);
  });
  it('throws on empty list', () => expect(() => pickAsset('gita:1:1', [])).toThrow());
});
```

- [ ] **Step 2: Run → FAIL.** **Step 3: Implement**

```ts
export function pickAsset(ref: string, files: string[]): string {
  if (files.length === 0) throw new Error('asset list is empty');
  let h = 0x811c9dc5;
  for (const c of ref) { h ^= c.codePointAt(0)!; h = Math.imul(h, 0x01000193) >>> 0; }
  return [...files].sort()[h % files.length];
}
```

- [ ] **Step 4: Curate the pack (needs web access).** Find 8–12 vertical/croppable loops on Pixabay/Pexels (keywords: *temple silhouette, diya lamp, ganga aarti, sunrise clouds, lotus pond, incense smoke, himalaya dawn*) and 2–3 instrumental tracks (*bansuri meditation, tanpura drone*). For each entry record the **direct file URL, license name, and page URL** in `manifest.json`. Both libraries' standard licenses permit commercial reuse without attribution — still record everything (Global Constraints). Also add the three committed font files under `fonts` with license `OFL-1.1` and their Google Fonts source URLs.

- [ ] **Step 5: Fetch script** — `scripts/fetch-assets.ts`: read manifest, for each entry if `public/assets/<kind>/<file>` missing → download (native `fetch`, stream to disk), print summary table, exit 1 if any download failed. Run: `npm run assets` → all files present. Re-run → "0 downloaded, N cached".

- [ ] **Step 6: Verify in studio** — edit fixture `media` to `{ "background": "assets/backgrounds/<one>.mp4", "music": "assets/music/<one>.mp3" }`, `npm run studio`, confirm video background + ducked music. Revert fixture to nulls (CI has no assets on PRs; daily workflow fetches them).

- [ ] **Step 7: Commit** — `git add public/assets/manifest.json scripts/fetch-assets.ts pipeline/pick.* && git commit -m "feat: licensed asset pack manifest, fetcher, deterministic picker"`

---

### Task 7: Captions & intro text — `post/captions.ts`

**Files:**
- Create: `post/captions.ts`, `post/captions.test.ts`

**Interfaces:**
- Produces: `introText(v: Verse): string`; `youtubeTitle(v: Verse): string` (≤ 100 chars); `youtubeDescription(v: Verse): string`; `instagramCaption(v: Verse): string` (≤ 2200 chars); `HASHTAGS: string[]` (single fixed list).

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { introText, youtubeTitle, youtubeDescription, instagramCaption } from './captions.ts';
import type { Verse } from '../shared/types.ts';

const v: Verse = {
  book: 'gita', ref: 'gita:2:47', chapter: 2, verse: 47,
  sanskrit: ['कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।'],
  hindi: 'तेरा कर्म करने में ही अधिकार है, फलों में कभी नहीं।',
  english: 'Your right is to action alone, never to its fruits.',
  attribution: { hindi: 'Test Swami (repo)', english: 'Test Translator (repo)' },
};

describe('captions', () => {
  it('intro announces chapter and verse in Hindi', () =>
    expect(introText(v)).toBe('भगवद्गीता, अध्याय 2, श्लोक 47।'));
  it('youtube title within 100 chars, has verse ref and #shorts', () => {
    expect(youtubeTitle(v).length).toBeLessThanOrEqual(100);
    expect(youtubeTitle(v)).toContain('अध्याय 2 श्लोक 47');
    expect(youtubeTitle(v).toLowerCase()).toContain('#shorts');
  });
  it('description contains shloka, both meanings, attribution', () => {
    const d = youtubeDescription(v);
    for (const s of [v.sanskrit[0], v.hindi, v.english, v.attribution.english]) expect(d).toContain(s);
  });
  it('instagram caption under 2200 chars with hashtags', () => {
    expect(instagramCaption(v).length).toBeLessThanOrEqual(2200);
    expect(instagramCaption(v)).toContain('#bhagavadgita');
  });
});
```

- [ ] **Step 2: Run → FAIL.** **Step 3: Implement** — templates:
  - `introText`: `भगवद्गीता, अध्याय ${chapter}, श्लोक ${verse}।`
  - `youtubeTitle`: `गीता ज्ञान | अध्याय ${chapter} श्लोक ${verse} | Bhagavad Gita #Shorts`
  - `youtubeDescription`: shloka lines + blank line + `हिंदी अर्थ: …` + `English: …` + blank + `अनुवाद/Translations: ${attribution.hindi}; ${attribution.english}` + blank + hashtag line.
  - `instagramCaption`: hook = first sentence of `hindi` (split on `।`, take [0] + '।'), then shloka, both meanings, attribution, then `HASHTAGS` = `['#bhagavadgita', '#gita', '#krishna', '#geetagyan', '#गीता', '#sanatandharma', '#spirituality', '#hindi', '#shlok', '#reels']`. Truncate meanings at 400 chars with … if needed to respect 2200.

- [ ] **Step 4: PASS. Step 5: Commit** — `git commit -m "feat: deterministic titles, descriptions, captions"`

---

### Task 8: Selection & state — `pipeline/select.ts`

**Files:**
- Create: `pipeline/select.ts`, `pipeline/select.test.ts`

**Interfaces:**
- Produces:
  - `type PlatformKey = 'youtube' | 'instagram'`
  - `type PostedEntry = { ref: string; youtube?: { id: string; at: string }; instagram?: { id: string; at: string } }`
  - `type StateFile = { posted: PostedEntry[] }`
  - `pickNext(order: string[], state: StateFile, platforms: PlatformKey[]): { ref: string; missing: PlatformKey[] } | null`
  - `recordPost(state: StateFile, ref: string, platform: PlatformKey, id: string, at: string): StateFile` (pure, no mutation)
  - `readState(path: string): Promise<StateFile>` / `writeState(path: string, s: StateFile): Promise<void>` (atomic: tmp + rename)
  - `verseOrder(verses: Verse[], startRef: string): string[]` (canonical order, sliced at startRef)

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { pickNext, recordPost, verseOrder, type StateFile } from './select.ts';

const order = ['gita:1:1', 'gita:1:2', 'gita:1:3'];
const P: ('youtube' | 'instagram')[] = ['youtube', 'instagram'];

describe('pickNext', () => {
  it('fresh state → first verse, both platforms missing', () =>
    expect(pickNext(order, { posted: [] }, P)).toEqual({ ref: 'gita:1:1', missing: ['youtube', 'instagram'] }));
  it('partial post → same verse, only missing platform (never advances past a half-posted verse)', () => {
    const s: StateFile = { posted: [{ ref: 'gita:1:1', youtube: { id: 'y1', at: 't' } }] };
    expect(pickNext(order, s, P)).toEqual({ ref: 'gita:1:1', missing: ['instagram'] });
  });
  it('fully posted → next verse', () => {
    const s: StateFile = { posted: [{ ref: 'gita:1:1', youtube: { id: 'y', at: 't' }, instagram: { id: 'i', at: 't' } }] };
    expect(pickNext(order, s, P)?.ref).toBe('gita:1:2');
  });
  it('all done → null', () => {
    const s: StateFile = { posted: order.map((ref) => ({ ref, youtube: { id: 'y', at: 't' }, instagram: { id: 'i', at: 't' } })) };
    expect(pickNext(order, s, P)).toBeNull();
  });
});

describe('recordPost', () => {
  it('adds platform result without mutating input', () => {
    const s: StateFile = { posted: [] };
    const s2 = recordPost(s, 'gita:1:1', 'youtube', 'vid123', '2026-08-03T02:00:00Z');
    expect(s.posted).toHaveLength(0);
    expect(s2.posted[0]).toEqual({ ref: 'gita:1:1', youtube: { id: 'vid123', at: '2026-08-03T02:00:00Z' } });
  });
});

describe('verseOrder', () => {
  it('slices at startRef', () => {
    const verses = [{ ref: 'gita:1:1' }, { ref: 'gita:1:2' }, { ref: 'gita:1:3' }] as never[];
    expect(verseOrder(verses, 'gita:1:2')).toEqual(['gita:1:2', 'gita:1:3']);
  });
});
```

- [ ] **Step 2: Run → FAIL. Step 3: Implement** (straightforward; `pickNext` walks `order`, looks up entry by ref, collects `missing = platforms.filter(p => !entry?.[p])`, returns first with `missing.length > 0`; `writeState` writes `path + '.tmp'` then `renameSync`). **Step 4: PASS + typecheck. Step 5: Commit** — `git commit -m "feat: idempotent verse selection and posting state"`

---

### Task 9: Release publisher — `pipeline/release.ts`

**Files:**
- Create: `pipeline/release.ts`, `pipeline/release.test.ts`

**Interfaces:**
- Produces: `releaseTag(ref: string): string` (`gita:2:47` → `reel-gita-2-47`); `assetUrl(repo: string, tag: string, file: string): string`; `publishReleaseAsset(ref: string, filePath: string, repo: string): Promise<string>` — creates release via `gh release create <tag> <file> --title <tag> --notes <notes>` (on "already exists" → `gh release upload <tag> <file> --clobber`), returns the public download URL.

- [ ] **Step 1: Failing tests (pure parts)**

```ts
import { describe, it, expect } from 'vitest';
import { releaseTag, assetUrl } from './release.ts';

it('tag from ref', () => expect(releaseTag('gita:2:47')).toBe('reel-gita-2-47'));
it('public asset url', () =>
  expect(assetUrl('user/repo', 'reel-gita-2-47', 'reel.mp4'))
    .toBe('https://github.com/user/repo/releases/download/reel-gita-2-47/reel.mp4'));
```

- [ ] **Step 2: FAIL → implement → PASS.** `publishReleaseAsset` shells out with `execa('gh', …)`; repo comes from `process.env.GITHUB_REPOSITORY` or `gh repo view --json nameWithOwner -q .nameWithOwner`. Known risk (documented in code comment + error message): Instagram must follow the 302 redirect on this URL; if IG rejects it, the orchestrator's error surfaces loudly — fallback is manual posting from the workflow artifact that day.

- [ ] **Step 3: Commit** — `git commit -m "feat: publish reel as github release asset (public archive + IG source url)"`

---

### Task 10: YouTube — `post/youtube.ts` + one-time auth script

**Files:**
- Create: `post/youtube.ts`, `post/youtube.test.ts`, `scripts/youtube-auth.ts`

**Interfaces:**
- Consumes: `youtubeTitle/youtubeDescription` from `post/captions.ts`.
- Produces: `buildYoutubeRequest(v: Verse): { snippet: {...}; status: {...} }` (pure); `postYoutube(v: Verse, filePath: string, env: { clientId: string; clientSecret: string; refreshToken: string }): Promise<string>` (returns videoId).

- [ ] **Step 1: Failing test for the pure builder**

```ts
import { describe, it, expect } from 'vitest';
import { buildYoutubeRequest } from './youtube.ts';
import type { Verse } from '../shared/types.ts';

const v: Verse = {
  book: 'gita', ref: 'gita:2:47', chapter: 2, verse: 47,
  sanskrit: ['कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।'],
  hindi: 'तेरा कर्म करने में ही अधिकार है, फलों में कभी नहीं।',
  english: 'Your right is to action alone, never to its fruits.',
  attribution: { hindi: 'Test Swami (repo)', english: 'Test Translator (repo)' },
};

it('builds a public, not-for-kids upload request', () => {
  const r = buildYoutubeRequest(v);
  expect(r.snippet.title).toContain('अध्याय 2 श्लोक 47');
  expect(r.snippet.categoryId).toBe('22');
  expect(r.status.privacyStatus).toBe('public');
  expect(r.status.selfDeclaredMadeForKids).toBe(false);
});
```

- [ ] **Step 2: FAIL → implement.**

```ts
import { google } from 'googleapis';
import { createReadStream } from 'node:fs';
import { youtubeTitle, youtubeDescription } from './captions.ts';
import type { Verse } from '../shared/types.ts';

export function buildYoutubeRequest(v: Verse) {
  return {
    snippet: { title: youtubeTitle(v), description: youtubeDescription(v),
      tags: ['bhagavad gita', 'gita', 'krishna', 'shorts', 'hindi'], categoryId: '22' },
    status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
  };
}

export async function postYoutube(v: Verse, filePath: string,
  env: { clientId: string; clientSecret: string; refreshToken: string }): Promise<string> {
  const oauth2 = new google.auth.OAuth2(env.clientId, env.clientSecret);
  oauth2.setCredentials({ refresh_token: env.refreshToken });
  const yt = google.youtube({ version: 'v3', auth: oauth2 });
  const res = await yt.videos.insert({
    part: ['snippet', 'status'],
    requestBody: buildYoutubeRequest(v),
    media: { body: createReadStream(filePath) },
  });
  if (!res.data.id) throw new Error('YouTube upload returned no video id');
  return res.data.id;
}
```

- [ ] **Step 3: Auth script** — `scripts/youtube-auth.ts`: reads `YT_CLIENT_ID`/`YT_CLIENT_SECRET` from env, starts a localhost HTTP server on a free port, prints the consent URL (scope `https://www.googleapis.com/auth/youtube.upload`, `access_type: 'offline'`, `prompt: 'consent'`), captures the `code` on redirect, exchanges via `oauth2.getToken(code)`, prints the refresh token with instructions to store as repo secret `YT_REFRESH_TOKEN`. (~40 lines with `node:http` + `google.auth.OAuth2`.)

- [ ] **Step 4: Unit tests PASS + typecheck. Real upload is exercised later in Task 13's supervised run** (needs user credentials from SETUP).

- [ ] **Step 5: Commit** — `git commit -m "feat: youtube shorts upload and one-time oauth script"`

---

### Task 11: Instagram — `post/instagram.ts`

**Files:**
- Create: `post/instagram.ts`, `post/instagram.test.ts`

**Interfaces:**
- Consumes: `instagramCaption` from `post/captions.ts`.
- Produces: `reelContainerParams(caption: string, videoUrl: string): URLSearchParams` (pure: `media_type=REELS`, `video_url`, `caption`, `share_to_feed=true`); `postInstagram(v: Verse, videoUrl: string, env: { userId: string; accessToken: string }): Promise<string>` (mediaId); `refreshIgToken(token: string): Promise<{ token: string; expiresInSec: number }>`. Base URL constant `IG_GRAPH = 'https://graph.instagram.com/v23.0'`.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { reelContainerParams } from './instagram.ts';

it('builds reel container params', () => {
  const p = reelContainerParams('caption text', 'https://example.com/reel.mp4');
  expect(p.get('media_type')).toBe('REELS');
  expect(p.get('video_url')).toBe('https://example.com/reel.mp4');
  expect(p.get('share_to_feed')).toBe('true');
});
```

- [ ] **Step 2: FAIL → implement.** Flow in `postInstagram` (all via native `fetch`, JSON errors thrown with response body included):
  1. `POST ${IG_GRAPH}/${userId}/media` with container params + `access_token` → `{ id: containerId }`.
  2. Poll `GET ${IG_GRAPH}/${containerId}?fields=status_code&access_token=…` every 10 s, up to 30 tries; proceed on `FINISHED`, throw on `ERROR`/timeout (include `status` in message).
  3. `POST ${IG_GRAPH}/${userId}/media_publish` with `creation_id=containerId` → `{ id: mediaId }`; return it.
  `refreshIgToken`: `GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=…` → `{ access_token, expires_in }`; throw if `expires_in < 7 * 86400` (refresh isn't sticking — surface loudly).

- [ ] **Step 3: PASS + typecheck. Step 4: Commit** — `git commit -m "feat: instagram reel publish (container/poll/publish) and token refresh"`

---

### Task 12: Orchestrator — `pipeline/run.ts`

**Files:**
- Create: `pipeline/run.ts`, `pipeline/run.test.ts`

**Interfaces:**
- Consumes: everything above, exactly as specified: `pickNext/recordPost/readState/writeState/verseOrder`, `computeTimeline` (+ `TimelineTooLongError`), `synthHindi`, `introText`, `pickAsset`, `publishReleaseAsset`, `postYoutube`, `postInstagram`, composition `GitaReel`.
- Produces: CLI `tsx pipeline/run.ts [--verse gita:2:47] [--dry-run]`; testable pure helper `parseArgs(argv: string[]): { verse?: string; dryRun: boolean }`; exit code 0 only if every configured platform succeeded (or dry-run).

- [ ] **Step 1: Failing test for `parseArgs`** (`--verse gita:2:47 --dry-run` → `{ verse: 'gita:2:47', dryRun: true }`; `[]` → `{ dryRun: false }`; bad ref format throws).

- [ ] **Step 2: FAIL → implement `main()`** in this exact order:
  1. Load `config.json`, `sources/gita.json`, `state.json`; build `order = verseOrder(verses, config.startRef)`.
  2. Target = `--verse` override (`missing` = all configured platforms not yet in state for it) or `pickNext(...)`; if `null` → log "All verses posted 🎉" and exit 0.
  3. `introText(v)` → `synthHindi(intro, 'public/generated/intro.mp3')`; `synthHindi(v.hindi, 'public/generated/meaning.mp3')`. Each synth call gets **one retry** on failure (spec §5: one retry, then fail loudly) — wrap in a 5-line `retryOnce(fn)` helper.
  4. `computeTimeline({...})`; on `TimelineTooLongError` → retry meaning TTS once with `rate: '+15%'`, recompute; second failure → throw.
  5. List `public/assets/backgrounds/*.mp4` and `music/*.mp3`; if empty → `background: null` (gradient) and warn; `pickAsset(ref, files)` otherwise.
  6. Write `out/props.json` (`ReelProps`, staticFile-relative paths like `generated/intro.mp3`), then `execa('npx', ['remotion', 'render', 'video/index.ts', 'GitaReel', 'out/reel.mp4', '--props=out/props.json'], { stdio: 'inherit' })`.
  7. `--dry-run` → print summary + exit 0.
  8. `publishReleaseAsset(...)` → url. For each platform in `target.missing` (state-gated!): try post → `state = recordPost(...)` → `writeState` **immediately after each success**; collect failures.
  9. If failures: print each with guidance, exit 1 (workflow emails; state already saved for successes — a re-run posts only what's missing).

- [ ] **Step 3: End-to-end dry-run locally**

Run: `npm run generate -- --verse gita:2:47 --dry-run`
Expected: TTS files in `public/generated/`, `out/reel.mp4` exists, plays correctly with narration synced (listen once), exit 0.

Then the two length extremes (spec §6 golden verses): `npm run generate -- --verse gita:1:1 --dry-run` and `npm run generate -- --verse gita:18:66 --dry-run` — both exit 0 and stay under 59.5 s (18:66 exercises the long-meaning/rate-retry path if needed). This is the integration test; keep the 2:47 `out/reel.mp4` for the Task 13 supervised run.

- [ ] **Step 4: Commit** — `git commit -m "feat: daily pipeline orchestrator with dry-run and per-platform state gating"`

---

### Task 13: Workflows + SETUP guide + supervised go-live

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/daily.yml`, `.github/workflows/refresh-token.yml`, `SETUP.md`, expand `README.md`

**Interfaces:**
- Consumes: repo secrets `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`, `IG_USER_ID`, `IG_ACCESS_TOKEN`, `GH_PAT` (classic PAT, `repo` scope — used only by refresh-token.yml to write the secret back).

- [ ] **Step 1: `ci.yml`** — on `push`/`pull_request`: checkout → setup-node 20 (npm cache) → `npm ci` → `npm run typecheck` → `npm test` → `npx remotion browser ensure` → `npm run render:smoke`.

- [ ] **Step 2: `daily.yml`**

```yaml
name: daily-reel
on:
  schedule: [{ cron: '30 1 * * *' }]   # 07:00 IST
  workflow_dispatch:
    inputs: { verse: { description: 'Override ref e.g. gita:2:47', required: false } }
concurrency: { group: daily-reel, cancel-in-progress: false }
permissions: { contents: write }
jobs:
  post:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: pip install edge-tts
      - uses: actions/cache@v4
        with:
          path: |
            public/assets/backgrounds
            public/assets/music
          key: assets-${{ hashFiles('public/assets/manifest.json') }}
      - run: npm ci
      - run: npm run assets
      - run: npx remotion browser ensure
      - name: Generate and post
        env:
          YT_CLIENT_ID: ${{ secrets.YT_CLIENT_ID }}
          YT_CLIENT_SECRET: ${{ secrets.YT_CLIENT_SECRET }}
          YT_REFRESH_TOKEN: ${{ secrets.YT_REFRESH_TOKEN }}
          IG_USER_ID: ${{ secrets.IG_USER_ID }}
          IG_ACCESS_TOKEN: ${{ secrets.IG_ACCESS_TOKEN }}
          GH_TOKEN: ${{ github.token }}
        run: npm run generate ${{ inputs.verse && format('-- --verse {0}', inputs.verse) || '' }}
      - name: Save reel artifact (always — manual-posting fallback)
        if: always()
        uses: actions/upload-artifact@v4
        with: { name: reel, path: out/reel.mp4, if-no-files-found: ignore }
      - name: Commit state (always — protects against double-posts after partial failure)
        if: always()
        run: |
          git config user.name 'gita-reels-bot'
          git config user.email 'actions@users.noreply.github.com'
          git add state.json
          git diff --cached --quiet || git commit -m "chore: record posted reel [skip ci]"
          git push
```

- [ ] **Step 3: `refresh-token.yml`** — weekly (`0 3 * * 0`): call `refreshIgToken` via `tsx -e`, then `gh secret set IG_ACCESS_TOKEN --body "$NEW_TOKEN"` with `GH_TOKEN: ${{ secrets.GH_PAT }}`. Fails loudly → email.

- [ ] **Step 4: Write `SETUP.md`** — numbered sections with exact click-paths and the secret each yields: (1) create GitHub repo (public) + push + `gh auth login`; (2) Instagram → Settings → Account type → switch to Professional (Creator); (3) developers.facebook.com → Create App → "Instagram API with Instagram Login" → connect the IG account → dashboard token generator → long-lived token → secrets `IG_USER_ID` + `IG_ACCESS_TOKEN`; (4) console.cloud.google.com → new project → enable *YouTube Data API v3* → OAuth consent screen (External, **Publish to production**) → Desktop OAuth client → run `npm run auth:youtube` → secrets `YT_CLIENT_ID/SECRET/REFRESH_TOKEN`; note the API-audit form link and the "uploads may be locked private until verified" caveat (spec §5); (5) create classic PAT (`repo`) → secret `GH_PAT`; (6) `pip install edge-tts` locally; (7) supervised first run instructions.

- [ ] **Step 5: USER CHECKPOINT — guided setup.** Walk the user through SETUP.md live; they create the accounts/secrets. Blocked without the user — schedule stays harmless (no secrets → loud failure + email, no partial posts).

- [ ] **Step 6: Supervised go-live** — push repo public; watch `ci.yml` green; trigger `daily.yml` via `workflow_dispatch` with `verse=gita:1:1`; verify: YouTube Short visible (or privacy-locked → note for §5 caveat), Instagram reel live, release `reel-gita-1-1` exists, `state.json` committed with both ids. Then let the schedule run; **7 consecutive automatic days = v1 done (spec §6)**.

- [ ] **Step 7: Commit** — `git add .github SETUP.md README.md && git commit -m "ci: daily reel schedule, token refresh, setup guide"`
