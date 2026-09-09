# Studio Panel — Design Spec

**Date:** 2026-09-09
**Status:** Approved pending user review
**Goal:** A Studio tab in the dashboard with a live, in-browser preview of the actual CinemaReel composition and full creative control — typography/style, inline beat editing, image AND music uploads, silent-mode — persisted as a committed style preset that every render (manual and daily) consumes. Outcome of the 2026-09-09 checkpoint: cinema does NOT become the daily default until the user approves a look they tuned themselves.

## 1. Decisions from checkpoint feedback

1. User verdict on v1 cinema look: too basic; stock music inadequate; seed paintings inadequate. Remedy = user-controlled customization, not another Claude-guessed aesthetic.
2. Music: user uploads their own tracks (recorded `User-provided` in the manifest, same policy as images) AND a **silent mode** for adding trending audio in the Instagram app at post time. The Kevin MacLeod tracks remain solely for the classic format; the cinema preset defaults to `silent` until the user chooses otherwise.
3. `seed-rrv-yashoda-krishna.jpg` is removed (checkpoint ruling: moderation risk + user dislikes the seeds); remaining seeds stay as placeholders until user uploads.
4. Full panel scope confirmed by user (not the phased or settings-only variants).

## 2. Style system (single source of truth)

- New `shared/reel-style.ts`:
  ```ts
  export type ReelStyle = {
    beatFont: 'display' | 'serif';        // ArchivoBlack | NotoSerif
    beatSizePx: number;                    // default 64, range 40-96
    textColor: string;                     // default '#ffffff'
    accentColor: string;                   // default '#e8c874' (kicker/reference)
    scrimStrength: number;                 // 0..1, default 0.45 (radial core alpha)
    durationScale: number;                 // 0.7..1.5 multiplier on per-beat durations, default 1
    crossfadeSec: number;                  // 0.2..0.8, default 0.35
    kenBurns: 'off' | 'gentle' | 'strong'; // default 'gentle' (current), strong doubles travel
    showKicker: boolean;                   // default true
    showHandle: boolean;                   // default true
    musicMode: 'silent' | 'track' | 'rotation';  // default 'silent'
    musicFile: string | null;              // basename in music pool when musicMode='track'
  };
  export const DEFAULT_STYLE: ReelStyle = { …exact defaults above… };
  export function validateStyle(s: unknown): ReelStyle;  // clamps ranges, fills missing keys from defaults
  ```
- Preset file: `styles/cinema.json` (committed). Absent file → `DEFAULT_STYLE`. Dashboard writes it via a new API; Sync stages it (sync pathspec grows to include `styles/` and `sources/beats.json`).
- `ReelProps.style?: ReelStyle` (optional; components fall back to DEFAULT_STYLE). CinemaReel + its components consume style tokens for everything the table in §4 lists; `computeCinemaTimeline(beats, style?)` applies `durationScale`/`crossfadeSec`. Classic format ignores style entirely.

## 3. Pipeline consumption

- `pipeline/run.ts` cinema branch: loads `styles/cinema.json` (validateStyle) → timeline + props.style; music resolution by `musicMode` (silent → null; track → `style.musicFile` validated against pool; rotation → current pickAsset behavior).
- One-off overrides for Studio renders: `--overrides <file>` flag; the JSON may carry `{ beats?: string[], style?: ReelStyle, music?: string|null }` and wins over preset/curated for that render only. The dashboard writes `out/studio-overrides.json` and passes the flag through the backend seam.
- Persisting edited beats: separate explicit action (never implicit) — `POST /api/beats { ref, beats }` validates via `validateBeatsFile` semantics and rewrites the `sources/beats.json` entry (sorted keys preserved).

## 4. Studio tab (dashboard `/studio`)

- **Live preview:** `@remotion/player` rendering the real `CinemaReel` with current controls' props — instant updates, loop, scrub. Dashboard `package.json` adds `remotion`, `@remotion/player`, `@remotion/fonts` pinned to the root's exact minor (bundled by Next from the shared `video/` sources).
  - Media URLs in the browser: new `resolveMedia(src)` helper in `video/` — absolute (`/`…, `http`…) passes through, otherwise `staticFile(src)`. The Player passes `/api/media/public/...` URLs; the render pipeline keeps today's relative paths. `/api/media` whitelist gains `public/assets/music/`.
  - Named risk + fallback: if Next/Turbopack fights the Player bundling, fallback is a dedicated `next dev`-served route using webpack (`next dev` without turbopack for the dashboard script) — accepted before heavier alternatives.
- **Controls (right column):**
  - Verse picker (chapter/verse, shows curated-vs-fallback badge) + **beats editor**: one input per line, add/remove/reorder, live 90-char counters; "Save beats for this verse" (explicit persist).
  - Style: every `ReelStyle` field via select/slider/color inputs; live preview reflects each immediately; "Save as channel style" writes `styles/cinema.json`.
  - Media: background picker (thumbnails incl. uploads), music section — upload mp3 (≤20 MB, `public/assets/music/`, manifest `User-provided`), mini audio players, mode radio (silent / this track / rotation).
  - **Render this reel** → generate with `out/studio-overrides.json` (does not persist anything), streaming log + player, same lock/409 behavior.
- Existing Generate panel stays; Studio is a new page with a nav link.

## 5. Uploads (music)

`POST /api/upload` gains audio support: `.mp3` → saved to `public/assets/music/` (slug + collision suffix as images), manifest `music` entry `{ file, url: '', license: 'User-provided', source: 'dashboard upload' }`. No transcode in v1 (mp3 passthrough); size cap 20 MB; same origin-guard + serialized-write queue.

## 6. Testing

- Unit: `validateStyle` (clamps, fills, rejects junk), timeline with `durationScale`/`crossfadeSec`, run.ts overrides merge precedence (overrides > preset > defaults; curated beats vs override beats), beats-persist validation path, music-mode resolution incl. `track` with missing file (falls back to silent with a warning, never crashes daily).
- Browser (Playwright): Studio loads, Player plays, a style change visibly alters preview props, beats edit reflects in preview, music upload appears, Save writes `styles/cinema.json`, Render produces a reel honoring the overrides (grep props.json).
- Regression: classic renders and all existing suites untouched/green.
- Final gate unchanged: the USER approves a self-tuned look before `config.format` flips to cinema (still the deferred Task-8 of the cinema plan).

## 7. Out of scope

Image-generation API, trending-audio automation, styling the classic format, multiple named presets, per-beat individual timing overrides, audio waveform trimming, collaborative editing.
