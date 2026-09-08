# Cinema Format (v3) — Design Spec

**Date:** 2026-09-09
**Status:** Approved pending user review
**Goal:** Replace the on-screen reel experience with a reference-driven format — one epic image (Cosmveda-style) + swapping English text beats (Daily-Gita-style) — while reusing the entire existing machine (dataset, pipeline, posting automation, dashboard). Supersedes the unbuilt Krishna Vaani v2 spec (2026-08-05).

## 1. Decisions made with the user (2026-09-09)

Style references studied live: instagram.com/askcosmveda (epic AI deity art, letterspaced type, English-first, small scripture ref) and instagram.com/gitaeditt (one held visual; gold kicker "GITA (2.62-63) SAYS"; bold modern one-liners swapping per beat).

1. **English beats** on screen, with the Devanagari shloka as the closing authenticity card.
2. **Imagery:** user-uploaded AI art via the existing dashboard forms the pool; seeded at launch with 3-5 public-domain classics (Raja Ravi Varma Krishna paintings, Wikimedia Commons, PD-Art) so the format works before uploads exist. Image-generation API is a documented seam only.
3. **Beats:** hand-curated file for ~120 verses + deterministic auto-fallback for the rest. ₹0, no runtime LLM.
4. **Audio: music only** (existing licensed pool, rotated; gentle fade in/out). No TTS in this format. Honest limitation recorded: trending IG audio cannot be automated; user may manually swap audio on special posts.
5. Cinema becomes the **daily default**; classic stays renderable via `--format classic`. Krishna Vaani spec marked superseded, nothing to remove (never built).

## 2. The reel (~18-26s, 1080×1920@30, no on-screen emoji)

| Segment | Screen |
|---|---|
| 0-1s | Image fades in, Ken Burns already drifting; gold letterspaced kicker `GITA 2.47` (top-center, small); handle watermark top corner |
| Beat 1 (hook) | First beats line, big bold white, max ~2 wrapped lines |
| Beats 2..N | Lines swap with 0.35s crossfade; per-beat duration `clamp(1.8 + chars/16, 2.4, 4.2)` s |
| Final card (~3.2s) | First Sanskrit line (Devanagari) + `Bhagavad Gita 2.47` + handle; music resolves and fades |

- **Typography:** beats — Archivo Black (OFL, embedded as data URL like existing fonts); kicker — Noto Serif tracked-out caps, gold `#e8c874`; Sanskrit — Noto Serif Devanagari (existing).
- **Legibility:** soft radial vignette behind the text zone (center-weighted, ~45% black at core fading to 0) instead of the classic format's full gradient wash; plus the existing text shadow.
- **Backgrounds:** images only, via the existing Ken Burns component; deterministic pick (existing `pickAsset`); dashboard hand-pick works unchanged. Empty image pool → fall back to video-clip pool; both empty → gradient (never blocks).
- Total duration = kicker lead-in + Σ beats + final card; floor 12s (pad hook + final card equally), cap 59.5s (fallback builder max-beats guarantees this statically — no runtime retry needed).

## 3. Beats data

- `sources/beats.json`: `{ "gita:2:47": ["Do the work. Release the outcome.", "You control the effort.", …], … }` — first line is the hook; 2-6 lines; curated set of ~120 authored during implementation (user-editable file; theme-faithful to the verse — hard content rule, no invented quotes).
- **Fallback builder** (pure, tested): `beatsFromTranslation(english: string): string[]` — sentence-split; strip leading vocatives ("O Arjuna,", "O son of Kunti,"); trim to ≤90 chars at word boundaries with "…"; max 5, min 2 (short translations may yield a single sentence → split on ";"/"," midpoint as second beat, else duplicate-free single beat plus shloka card carries the weight… no: min 2 enforced by splitting the one sentence at its natural midpoint when needed).
- Validation suite: every curated ref exists in `sources/gita.json`; 2-6 beats; ≤90 chars; no emoji/non-ASCII beyond typographic quotes/dashes.

## 4. Pipeline & captions

- `shared/types.ts`: `ReelProps.format?: 'classic' | 'cinema'` (default classic for fixture compatibility) + `cinema?: { kicker: string; beats: string[]; timings: CinemaTimings }`.
- `pipeline/timeline.ts` + `computeCinemaTimeline(beats: string[], sanskritFirstLine: string): CinemaTimings` (pure; per-beat starts/durations, crossfade overlap, floor/cap).
- `pipeline/run.ts`: format = `--format` override → else `config.format` (new key, default `"cinema"`). Cinema path: no TTS; beats = curated ?? fallback; render composition `CinemaReel`; caption variants: YT title `"<hook> | Bhagavad Gita <c>.<v> #Shorts"` (≤100 chars, hook truncated at word boundary), IG caption = hook + beat lines + shloka + attribution + existing hashtag set (emoji allowed in captions — platform text, never rendered by Chrome).
- `video/`: new `CinemaReel` composition (id `CinemaReel`) + components `Kicker`, `BeatCard` (crossfade pair), `ClosingCard`, `RadialScrim`; reuses `Background` (Ken Burns), fonts module (+ Archivo Black), music `<Audio>` pattern with volume envelope (no ducking needed — no voice).
- Posting/state/release/workflows/CI: **zero changes**.

## 5. Image pool & seam

- Cinema pool = `public/assets/images/*` (manifest-tracked, as today). Launch seeds: 3-5 PD-Art Raja Ravi Varma Krishna paintings fetched from Wikimedia Commons during implementation, recorded in `manifest.json` images section with license `Public domain (PD-Art)` + source URLs; normalized to 1080×1920 cover at ingest (sharp via dashboard path or one-off script — same output contract as uploads).
- Image-API seam (documented, NOT built): a future `imagegen/` module with `generateImage(prompt: string): Promise<{ file: string }>` that writes into the images pool + manifest with license `AI-generated (user account)`; invoked manually or by a weekly pool-filler workflow. Nothing in v1 imports it.

## 6. Dashboard

Generate panel gains a **Format** select — `Auto (config)` / `Classic` / `Cinema` — passed as `format` through `Backend.generate(ref, background?, format?)` and the route (validation: `classic|cinema` or absent). No other UI change.

## 7. Testing

- Unit: `beatsFromTranslation` (vocative strip, char caps, min/max, midpoint split), `computeCinemaTimeline` (adaptive durations, floor/cap, monotonic starts, crossfade overlap math), cinema caption templates (length caps, hook-first), beats.json validation.
- Golden dry-runs: `gita:2:47 --format cinema` (curated) and `gita:1:1 --format cinema` (fallback beats) + classic regression (`gita:2:47 --format classic`).
- Stills of kicker/hook/mid-beat/closing frames inspected, then **USER CHECKPOINT: watch 1-2 full rendered reels over the seed paintings and approve the look before `config.format` flips the daily default to cinema.**

## 8. Out of scope

Image-API implementation, trending-audio automation, per-verse image theming/tags, word-level kinetic typography, Hindi beat variants, analytics, re-posting already-posted verses in the new format, any change to posting cadence or platforms.
