# Studio Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/studio` dashboard page with a live Remotion Player preview of `CinemaReel` and full creative control (style tokens, inline beat editing, image+music uploads, silent mode), persisted as a committed preset (`styles/cinema.json`) consumed by every cinema render.

**Architecture:** A `ReelStyle` token module (`shared/reel-style.ts`) becomes the single styling source: CinemaReel components consume tokens, `computeCinemaTimeline` takes pacing from them, `pipeline/run.ts` loads the preset plus optional one-off `--overrides`. The dashboard gains style/beats/music APIs behind the existing `Backend` seam and a Studio page whose browser preview recomputes timings client-side (all timeline/beats code is already pure).

**Tech Stack:** existing root toolchain; dashboard adds `remotion` + `@remotion/player` + `@remotion/fonts` pinned to the root's exact resolved version.

**Spec:** docs/superpowers/specs/2026-09-09-studio-panel-design.md

## Global Constraints

- `ReelStyle` defaults exactly as the spec §2 block (beatSizePx 64, accent `#e8c874`, scrim 0.45, durationScale 1, crossfadeSec 0.35, kenBurns 'gentle', kicker/handle true, musicMode 'silent', musicFile null). `validateStyle` NEVER throws — it clamps/coerces junk to valid values (daily automation must never die on a bad preset).
- `ReelProps.style` optional; every consumer falls back to `DEFAULT_STYLE`; all existing fixtures/tests stay valid and green.
- Overrides (`--overrides <file>`) win over preset over defaults, apply to that render only, never persist.
- Music modes: silent → `media.music = null`; track → `style.musicFile` validated against the pool, missing file → warn + silent (never crash); rotation → existing `pickAsset`.
- Dashboard remotion deps pinned to the EXACT version in root `package-lock.json` (`node -e "console.log(require('./package-lock.json').packages['node_modules/remotion'].version)"`).
- No on-screen emoji; conventional commits + trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; root + dashboard typecheck and root `npm test` green per task; classic format untouched.
- Sync pathspec grows to exactly: `public/assets/images public/assets/manifest.json styles sources/beats.json`.
- Uploads: mp3 ≤20 MB → `public/assets/music/`, manifest `music` entry `{ file, url: '', license: 'User-provided', source: 'dashboard upload' }`; `/api/media` whitelist gains `public/assets/music/`.

## File Structure

```
shared/reel-style.ts (+.test.ts)        # T1: ReelStyle, DEFAULT_STYLE, validateStyle
pipeline/timeline.ts (+.test.ts)        # T2: style-aware computeCinemaTimeline
video/media.ts                          # T2: resolveMedia helper
video/CinemaReel.tsx, components/{BeatCard,Kicker,ClosingCard,RadialScrim,Background}.tsx   # T2: token consumption
shared/types.ts                         # T2: ReelProps.style?: ReelStyle
pipeline/run.ts (+run.test.ts)          # T3: preset load, --overrides, musicMode
styles/cinema.json                      # T3: committed default preset
dashboard/lib/{backend,local-backend}.ts, app/api/{style,beats/[ref]}/route.ts, app/api/upload/route.ts, app/api/media/[...path]/route.ts, app/api/generate/route.ts   # T4
dashboard/app/studio/page.tsx + app/components/studio/{PreviewPane,StyleControls,BeatsEditor,MediaControls}.tsx   # T5
dashboard/package.json                  # T5: player deps
README.md, seed removal, e2e            # T6
```

---

### Task 1: `shared/reel-style.ts` (TDD)

**Files:** Create `shared/reel-style.ts`, `shared/reel-style.test.ts`

**Interfaces:**
- Produces: `type ReelStyle` (spec §2 exact shape), `DEFAULT_STYLE: ReelStyle`, `validateStyle(s: unknown): ReelStyle`.

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_STYLE, validateStyle } from './reel-style.ts';

describe('validateStyle', () => {
  it('returns defaults for junk input', () => {
    expect(validateStyle(null)).toEqual(DEFAULT_STYLE);
    expect(validateStyle('x')).toEqual(DEFAULT_STYLE);
  });
  it('fills missing keys and keeps valid ones', () => {
    const s = validateStyle({ beatSizePx: 72, accentColor: '#ffcc00' });
    expect(s.beatSizePx).toBe(72);
    expect(s.accentColor).toBe('#ffcc00');
    expect(s.musicMode).toBe('silent');
  });
  it('clamps numeric ranges', () => {
    const s = validateStyle({ beatSizePx: 400, scrimStrength: 9, durationScale: 0.1, crossfadeSec: 5 });
    expect(s.beatSizePx).toBe(96);
    expect(s.scrimStrength).toBe(1);
    expect(s.durationScale).toBe(0.7);
    expect(s.crossfadeSec).toBe(0.8);
  });
  it('coerces invalid enums/colors to defaults', () => {
    const s = validateStyle({ beatFont: 'comic-sans', kenBurns: 'wild', musicMode: 'loud', textColor: 'javascript:evil' });
    expect(s.beatFont).toBe('display');
    expect(s.kenBurns).toBe('gentle');
    expect(s.musicMode).toBe('silent');
    expect(s.textColor).toBe('#ffffff');
  });
  it('never throws', () => {
    for (const bad of [undefined, 42, [], { musicFile: {} }]) expect(() => validateStyle(bad)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run → FAIL. Step 3: Implement**

```ts
export type ReelStyle = {
  beatFont: 'display' | 'serif';
  beatSizePx: number;
  textColor: string;
  accentColor: string;
  scrimStrength: number;
  durationScale: number;
  crossfadeSec: number;
  kenBurns: 'off' | 'gentle' | 'strong';
  showKicker: boolean;
  showHandle: boolean;
  musicMode: 'silent' | 'track' | 'rotation';
  musicFile: string | null;
};

export const DEFAULT_STYLE: ReelStyle = {
  beatFont: 'display', beatSizePx: 64, textColor: '#ffffff', accentColor: '#e8c874',
  scrimStrength: 0.45, durationScale: 1, crossfadeSec: 0.35, kenBurns: 'gentle',
  showKicker: true, showHandle: true, musicMode: 'silent', musicFile: null,
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (v: unknown, d: number, lo: number, hi: number) =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : d;
const oneOf = <T extends string>(v: unknown, opts: readonly T[], d: T): T =>
  typeof v === 'string' && (opts as readonly string[]).includes(v) ? (v as T) : d;
const color = (v: unknown, d: string) =>
  typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : d;
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

export function validateStyle(s: unknown): ReelStyle {
  const o = (s && typeof s === 'object' && !Array.isArray(s) ? s : {}) as Record<string, unknown>;
  return {
    beatFont: oneOf(o.beatFont, ['display', 'serif'] as const, DEFAULT_STYLE.beatFont),
    beatSizePx: num(o.beatSizePx, DEFAULT_STYLE.beatSizePx, 40, 96),
    textColor: color(o.textColor, DEFAULT_STYLE.textColor),
    accentColor: color(o.accentColor, DEFAULT_STYLE.accentColor),
    scrimStrength: num(o.scrimStrength, DEFAULT_STYLE.scrimStrength, 0, 1),
    durationScale: num(o.durationScale, DEFAULT_STYLE.durationScale, 0.7, 1.5),
    crossfadeSec: num(o.crossfadeSec, DEFAULT_STYLE.crossfadeSec, 0.2, 0.8),
    kenBurns: oneOf(o.kenBurns, ['off', 'gentle', 'strong'] as const, DEFAULT_STYLE.kenBurns),
    showKicker: bool(o.showKicker, true),
    showHandle: bool(o.showHandle, true),
    musicMode: oneOf(o.musicMode, ['silent', 'track', 'rotation'] as const, DEFAULT_STYLE.musicMode),
    musicFile: typeof o.musicFile === 'string' && o.musicFile.length <= 200 ? o.musicFile : null,
  };
}
```

- [ ] **Step 4: PASS + typecheck. Step 5: Commit** — `git commit -m "feat: reel style tokens with never-throw validation"`

---

### Task 2: Style-aware timeline + CinemaReel token consumption

**Files:**
- Modify: `pipeline/timeline.ts` (+test), `shared/types.ts` (`style?: ReelStyle` on ReelProps; import type from shared/reel-style.ts), `video/CinemaReel.tsx`, `video/components/{BeatCard,Kicker,ClosingCard,RadialScrim,Background}.tsx`
- Create: `video/media.ts`

**Interfaces:**
- Produces: `computeCinemaTimeline(beats: string[], style?: Pick<ReelStyle, 'durationScale' | 'crossfadeSec'>): CinemaTimings`; `resolveMedia(src: string): string`; each cinema component takes a required `style: ReelStyle` prop (CinemaReel resolves `p.style ?? DEFAULT_STYLE` once and passes down).

- [ ] **Step 1: Failing timeline tests** (append)

```ts
  it('durationScale multiplies per-beat durations', () => {
    const base = computeCinemaTimeline(['A steady line of text here.']);
    const fast = computeCinemaTimeline(['A steady line of text here.'], { durationScale: 0.7, crossfadeSec: 0.35 });
    expect(fast.beats[0].durSec).toBeCloseTo(base.beats[0].durSec * 0.7, 5);
  });
  it('crossfadeSec flows into sequencing and output', () => {
    const t = computeCinemaTimeline(['One line here.', 'Two lines here.'], { durationScale: 1, crossfadeSec: 0.6 });
    expect(t.crossfadeSec).toBe(0.6);
    expect(t.beats[1].startSec).toBeCloseTo(t.beats[0].startSec + t.beats[0].durSec - 0.6, 5);
  });
  it('no style argument reproduces previous behavior', () => {
    expect(computeCinemaTimeline(['Do the work. Release the outcome.']).crossfadeSec).toBe(0.35);
  });
```

- [ ] **Step 2: FAIL → implement**: `durSec = beatDurationSec(b) * (style?.durationScale ?? 1)`, `crossfadeSec = style?.crossfadeSec ?? 0.35` (floor/cap/padding logic unchanged, using the variable crossfade).

- [ ] **Step 3: `video/media.ts`**

```ts
import { staticFile } from 'remotion';
// Player (browser) passes absolute /api/media/... URLs; the render pipeline passes
// staticFile-relative paths. One resolver keeps both worlds working.
export const resolveMedia = (src: string): string => (/^(https?:)?\//.test(src) ? src : staticFile(src));
```

- [ ] **Step 4: Token consumption** (exact mapping; keep all existing animation curves):
  - `CinemaReel.tsx`: `const style = validateStyle(p.style);` (import from shared) — pass `style` to every child; `Audio src={resolveMedia(p.media.music)}`; music volume envelope unchanged.
  - `BeatCard`: `fontFamily: style.beatFont === 'serif' ? LATIN : DISPLAY`, `fontSize: style.beatSizePx`, `color: style.textColor`, fade uses the sequence's `fadeSec` prop as today.
  - `RadialScrim`: core alpha `style.scrimStrength`, mid alpha `style.scrimStrength * 0.62`, else identical gradient geometry.
  - `Kicker`: return `null` when `!style.showKicker`; kicker color `style.accentColor`; handle line rendered only when `style.showHandle`.
  - `ClosingCard`: reference line color `style.accentColor`; handle line gated by `style.showHandle`.
  - `Background`: `Img`/`OffthreadVideo` srcs via `resolveMedia`; Ken Burns intensity: `off` → fixed `scale(1.08)`, no translate; `gentle` → current values; `strong` → double travel (`0.2 * t` scale delta, `±5%`/`±4%`/`±3%` pans). Implement as a multiplier `m = {off: 0, gentle: 1, strong: 2}[style.kenBurns]` applied to the existing deltas, with base scale 1.08 when `m === 0`. Background gains the `style` prop; GitaReel's call site passes `DEFAULT_STYLE` (classic look unchanged — gentle default).
- [ ] **Step 5: Verify** — `npm test && npm run typecheck`; two stills from the cinema fixture (`--frame=60` and closing) with a HAND-WRITTEN temp props file (in `out/`, uncommitted) that sets `{ style: { beatFont:'serif', beatSizePx: 80, accentColor:'#ff9933', scrimStrength: 0.8, kenBurns:'strong', showHandle:false } }` — Read both stills: serif beats at 80px, orange kicker, darker scrim, no handle. Then re-render the untouched fixture still and confirm it is visually identical to the committed look (defaults path).
- [ ] **Step 6: Commit** — `git commit -m "feat: cinema components consume style tokens; style-aware timeline; media resolver"`

---

### Task 3: Pipeline preset + overrides + music modes

**Files:**
- Modify: `pipeline/run.ts` (+`pipeline/run.test.ts`)
- Create: `styles/cinema.json` (exactly `DEFAULT_STYLE` serialized, 2-space + newline)

**Interfaces:**
- Produces: `parseArgs` gains `overrides?: string` (`--overrides <path>`, file must exist at use time); exported pure `resolveCinemaInputs(args, curated: string[] | undefined, english: string, preset: ReelStyle, ov: Overrides | null, musicPool: string[], ref: string): { beats: string[]; style: ReelStyle; music: string | null; usedFallbackBeats: boolean }` where `type Overrides = { beats?: string[]; style?: unknown; music?: string | null }` — THE testable merge core; run.ts cinema branch becomes a thin caller.

- [ ] **Step 1: Failing tests**

```ts
import { resolveCinemaInputs } from './run.ts';
import { DEFAULT_STYLE } from '../shared/reel-style.ts';

const base = { verse: undefined, dryRun: true, background: undefined, format: 'cinema' as const, overrides: undefined };

describe('resolveCinemaInputs', () => {
  it('precedence: overrides beats > curated > fallback', () => {
    const r = resolveCinemaInputs(base, ['Curated one.', 'Curated two.'], 'Plain english sentence. Another.', DEFAULT_STYLE, { beats: ['Override A.', 'Override B.'] }, [], 'gita:2:47');
    expect(r.beats).toEqual(['Override A.', 'Override B.']);
    const r2 = resolveCinemaInputs(base, ['Curated one.', 'Curated two.'], 'x. y.', DEFAULT_STYLE, null, [], 'gita:2:47');
    expect(r2.beats[0]).toBe('Curated one.');
    const r3 = resolveCinemaInputs(base, undefined, 'Plain english sentence. Another.', DEFAULT_STYLE, null, [], 'gita:2:47');
    expect(r3.usedFallbackBeats).toBe(true);
  });
  it('style merge clamps junk override on top of preset', () => {
    const preset = { ...DEFAULT_STYLE, beatSizePx: 72 };
    const r = resolveCinemaInputs(base, undefined, 'x. y.', preset, { style: { beatSizePx: 400, kenBurns: 'wild' } }, [], 'gita:1:1');
    expect(r.style.beatSizePx).toBe(96);
    expect(r.style.kenBurns).toBe('gentle');
  });
  it('music: silent mode → null; track present → file; track missing → null (warn); rotation → deterministic pick; override music wins incl. explicit null', () => {
    const pool = ['a.mp3', 'b.mp3'];
    expect(resolveCinemaInputs(base, undefined, 'x. y.', { ...DEFAULT_STYLE, musicMode: 'silent' }, null, pool, 'gita:1:1').music).toBeNull();
    expect(resolveCinemaInputs(base, undefined, 'x. y.', { ...DEFAULT_STYLE, musicMode: 'track', musicFile: 'a.mp3' }, null, pool, 'gita:1:1').music).toBe('a.mp3');
    expect(resolveCinemaInputs(base, undefined, 'x. y.', { ...DEFAULT_STYLE, musicMode: 'track', musicFile: 'gone.mp3' }, null, pool, 'gita:1:1').music).toBeNull();
    expect(pool).toContain(resolveCinemaInputs(base, undefined, 'x. y.', { ...DEFAULT_STYLE, musicMode: 'rotation' }, null, pool, 'gita:1:1').music);
    expect(resolveCinemaInputs(base, undefined, 'x. y.', { ...DEFAULT_STYLE, musicMode: 'rotation' }, { music: null }, pool, 'gita:1:1').music).toBeNull();
  });
  it('parseArgs accepts --overrides path', () => {
    expect(parseArgs(['--overrides', 'out/o.json'])).toEqual({ dryRun: false, overrides: 'out/o.json' });
  });
});
```

- [ ] **Step 2: FAIL → implement.** `resolveCinemaInputs` pure (uses `validateStyle({ ...preset, ...(ov?.style ?? {}) })` — spread of validated-preset + raw override then validate ONCE; beats precedence as tested with `beatsFromTranslation(english)` fallback; music per the modes with `pickAsset(ref, pool)` for rotation). run.ts: load preset (`styles/cinema.json` if exists → `validateStyle(JSON.parse(…))`, else `DEFAULT_STYLE`); load overrides file when flag present (missing file → throw with clear message); call `resolveCinemaInputs`; `props.style = r.style`; music path `assets/music/${r.music}` when non-null; log line gains `style=preset|overridden` marker. Commit `styles/cinema.json` with DEFAULT_STYLE content.
- [ ] **Step 3: Golden dry-run** — `npm run generate -- --verse gita:2:47 --format cinema --dry-run` → EXIT 0, `music=none` (silent default), props.json contains the style block. Then with a temp overrides file (`{ "style": { "beatSizePx": 80 }, "beats": ["Test beat one.", "Test beat two."] }`) → props.json shows both. `npm test` + typecheck green.
- [ ] **Step 4: Commit** — `git commit -m "feat: style preset, render overrides, music modes in cinema pipeline"`

---

### Task 4: Backend + APIs (style, beats, music upload, media, generate overrides, sync paths)

**Files:**
- Modify: `dashboard/lib/backend.ts`, `dashboard/lib/local-backend.ts`, `dashboard/app/api/upload/route.ts`, `dashboard/app/api/media/[...path]/route.ts`, `dashboard/app/api/generate/route.ts`, `shared/media-path.ts` (+test)
- Create: `dashboard/app/api/style/route.ts`, `dashboard/app/api/beats/[ref]/route.ts`

**Interfaces:**
- Produces on `Backend`: `getStyle(): Promise<ReelStyle>`; `saveStyle(s: unknown): Promise<ReelStyle>` (validateStyle → write `styles/cinema.json` → return validated); `getBeats(ref): Promise<{ beats: string[]; curated: boolean }>` (curated entry or `beatsFromTranslation` of the verse's english); `saveBeats(ref, beats: string[]): Promise<void>` (validate: ref exists, 2-6 lines, ≤90, no emoji — reject 400 on violation; rewrite `sources/beats.json` with sorted keys); `saveAudio(name, data): Promise<AssetInfo>` (mp3 ≤20 MB → music dir via the existing serialized queue, manifest music entry); `generate(ref, background?, format?, overrides?: { beats?: string[]; style?: unknown; music?: string | null })` — writes `out/studio-overrides.json`, appends `--overrides out/studio-overrides.json`.
- Routes: `GET/POST /api/style`; `GET/POST /api/beats/<uri-encoded ref>`; upload route branches on extension (.mp3 → saveAudio); generate route forwards `overrides` after light shape validation (beats: array of ≤6 strings; music: string|null; style: object) — origin guard stays FIRST everywhere.
- `getVerse(ref)` / `GET /api/verse/[ref]` now returns the FULL `Verse` object (ref, book, chapter, verse, sanskrit, hindi, english, attribution) — the Studio preview needs it for `ReelProps.verse`; the existing GeneratePanel consumer keeps working (it reads a subset).
- `ALLOWED_MEDIA` gains `'public/assets/music/'` (+ regression test rows: music path allowed, `music/../` escape rejected).

- [ ] **Step 1: Failing test for the whitelist addition** (append to `shared/media-path.test.ts`): `['public','assets','music','t.mp3']` allowed; `['public','assets','music','..','..','secret']` rejected.
- [ ] **Step 2: FAIL → implement all of the above** following the file's existing patterns exactly (origin guard first; queue reuse for saveAudio; pathspec sync update to the Global Constraints list; 2-space+newline JSON writes everywhere).
- [ ] **Step 3: Curl verification** (dev server up, then killed): GET /api/style → defaults; POST /api/style junk `{beatSizePx: 400}` → returns clamped 96 and file written; GET /api/beats/gita:2:47 → curated true; POST /api/beats bad (1 line) → 400; POST /api/beats gita:2:47 with a valid 3-line edit → sources/beats.json updated (then git-restore that edit to keep the tree clean); upload a tone mp3 (generate via ffmpeg `-f lavfi -i sine=frequency=220:duration=8`) → appears in manifest + `/api/media/public/assets/music/<slug>.mp3` → 200; generate with `{"overrides":{"style":{"beatSizePx":80}}}` → stream shows `style=overridden`, EXIT 0. Cleanup test artifacts (tone mp3 + manifest entry) before commit.
- [ ] **Step 4: Root `npm test` + both typechecks green. Commit** — `git commit -m "feat: style/beats/music APIs and override-capable generate behind the seam"`

---

### Task 5: Studio page with live Player

**Files:**
- Modify: `dashboard/package.json` (add `remotion`, `@remotion/player`, `@remotion/fonts` at the root's exact resolved version), `dashboard/app/page.tsx` (nav link "Studio →")
- Create: `dashboard/app/studio/page.tsx`, `dashboard/app/components/studio/PreviewPane.tsx`, `StyleControls.tsx`, `BeatsEditor.tsx`, `MediaControls.tsx`

**Interfaces:**
- Consumes: all Task 4 APIs; `CinemaReel` + `resolveMedia` + `computeCinemaTimeline` + `validateStyle`/`DEFAULT_STYLE` + `FPS/WIDTH/HEIGHT` imported RELATIVELY from the repo root packages (`../../../video/CinemaReel.tsx` etc. — the dashboard already compiles cross-directory root TS).
- Produces: `/studio` page — left `PreviewPane` (Remotion `<Player>` with `component={CinemaReel}`, `inputProps` built from current state, `durationInFrames=Math.round(timings.totalSec*FPS)`, `compositionWidth/Height`, `fps`, `controls loop`, `style={{width:'100%'}}`), right column stacking `BeatsEditor`, `StyleControls`, `MediaControls`, action bar (Save style / Save beats / Render).

- [ ] **Step 1: Deps** — read the root lock's remotion version, `npm install --prefix dashboard remotion@<V> @remotion/player@<V> @remotion/fonts@<V>`.
- [ ] **Step 2: State model in `studio/page.tsx`** (client component): `{ ref, verse (full Verse from /api/verse), beats, curated, style, background (rel|null) }`; `timings = useMemo(() => computeCinemaTimeline(beats.filter(Boolean), style), [beats, style])` with try/catch → invalid states show the error inline instead of crashing the Player; `inputProps: ReelProps` built with `media: { background: background ? `/api/media/public/${background}` : null, music: style.musicMode === 'track' && style.musicFile ? `/api/media/public/assets/music/${style.musicFile}` : null }` (rotation previews silent with a note — deterministic pick lives server-side).
- [ ] **Step 3: Controls** (concrete contract; use the established panel/select/slider styling tokens):
  - `BeatsEditor`: one `<input>` per beat (90-char `maxLength`, live counter, red at limit), ↑/↓/✕ per row, "+ beat" (≤6), badge `curated`/`auto`; "Save beats" → POST, button disabled while beats invalid (any empty, <2, >6).
  - `StyleControls`: beatFont select; beatSizePx range 40-96; two `<input type="color">`; scrimStrength/durationScale/crossfadeSec ranges (0-1 step .05 / 0.7-1.5 step .05 / 0.2-0.8 step .05); kenBurns select; showKicker/showHandle checkboxes; "Save as channel style" → POST /api/style, confirmation shows the saved JSON.
  - `MediaControls`: background thumbnail strip (images first) with Auto option; music mode radio (silent / this track / rotation) + track select from music pool + upload input (mp3, posts to /api/upload) refreshing the pool; note under rotation: "preview plays silent; daily render picks per verse".
  - Render button: POST /api/generate `{ ref, background, format:'cinema', overrides: { beats, style, music: <null when silent, file when track, undefined when rotation> } }`, stream to a log pane (reuse GeneratePanel's reader pattern incl. 409/error handling), then `<video>` player of `/api/media/out/reel.mp4?t=…`.
- [ ] **Step 4: Verify in a real browser (Playwright tools)**: /studio loads with 2:47; Player is playing (assert the player element progresses); edit beat 1 text → new text visible inside the Player DOM; move beatSizePx slider → computed font-size changes in Player DOM; switch beatFont to serif → font-family changes; Save style → GET /api/style returns the change (then restore defaults via POST and confirm); Render with an edited beat → log streams to EXIT 0 and video element appears. Screenshot the full page for the report. Kill server; `npm run typecheck --prefix dashboard` + root suite green.
  - If the Player fails to bundle under Turbopack: fallback per spec — change the dashboard `dev` script to `next dev --webpack -p 4000 -H 0.0.0.0`, document in the report, retry. Escalate only if BOTH bundlers fail.
- [ ] **Step 5: Commit** — `git commit -m "feat: studio page — live player preview with style, beats, media controls"`

---

### Task 6: Seed removal + E2E + docs

**Files:**
- Delete: `public/assets/images/seed-rrv-yashoda-krishna.jpg` (+ its manifest entry)
- Modify: `README.md` (Studio section under Dashboard: what it controls, preset file path, silent-mode note, beats editing note)

- [ ] **Step 1:** Remove the seed + manifest entry (checkpoint ruling; cite in commit body). `npm test` green (no test references it).
- [ ] **Step 2: End-to-end preset proof (CLI honors what Studio saved):** POST a distinctive style via /api/style (e.g. beatSizePx 76, accentColor `#ff9933`, musicMode silent) with the dev server up, kill server, then `npm run generate -- --verse gita:12:13 --format cinema --dry-run` → grep out/props.json for `"beatSizePx": 76` and `"music": null`; extract + Read one still — orange kicker, larger text. Then restore `styles/cinema.json` to DEFAULT_STYLE content (the user hasn't chosen a look yet) and commit that state.
- [ ] **Step 3:** README section; root+dashboard checks green. **Commit** — `git commit -m "feat: studio e2e proof, yashoda seed removed, docs"`
- [ ] **Step 4: USER CHECKPOINT — STOP.** Open the dashboard `/studio` for the user. The user tunes the look themselves; the cinema-default flip (old plan's Task 8) happens only after they save a style they love and say so.
