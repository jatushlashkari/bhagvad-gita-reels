# Studio & Format Polish (Sub-project A) — Design Spec

**Date:** 2026-09-09
**Status:** Approved pending user review
**Goal:** More fonts, a no-overlap sequential text transition, a Quotes page (all verse beats + user-authored custom quotes), and per-reel image prompts — all surfaced in the existing Studio. Sequenced BEFORE the Publishing Calendar (Sub-project B, separate spec).

## 1. Decisions with the user (2026-09-09)

- Quotes list = manage all verse quotes AND author standalone custom quotes (rendered as reels with an attribution card).
- "gap after one text animation dissolve" = sequential transition mode: beat fully dissolves out → gap with image alone → next beat dissolves in; no overlap.
- Image prompts are for the user's own AI art tool (copy-paste); no image API in this sub-project.

## 2. Fonts

- Add OFL faces from the google/fonts repo, embedded as data URLs exactly like the existing ones (`scripts/embed-fonts.ts` → `video/fonts-embedded.ts`, `loadFont(..., format: 'truetype')`), manifest `fonts` entries with license `OFL-1.1`:
  - Cinzel (variable `Cinzel[wght].ttf`, load weight range `'400 700'`) — the letterspaced Roman serif of the reference account
  - Playfair Display (variable, `'400 700'`)
  - Montserrat (variable, `'400 700'`)
  - Bebas Neue (static Regular)
- `ReelStyle.beatFont: 'display' | 'serif' | 'cinzel' | 'playfair' | 'montserrat' | 'bebas'` (default `'display'` unchanged).
- NEW `ReelStyle.kickerFont: 'serif' | 'cinzel' | 'montserrat'` (default `'serif'` = current look); applies to the kicker and the closing reference line. Font stacks always end with `NotoSerifDevanagari` so Devanagari kickers (custom quotes) render.
- `validateStyle` extended; every existing preset stays valid (new keys default).

## 3. Sequential transition

- `ReelStyle.transition: 'crossfade' | 'sequential'` (default `'crossfade'` = today), `ReelStyle.gapSec: number` (0–1.5, default 0.4).
- `computeCinemaTimeline(beats, style)`: crossfade mode unchanged; sequential mode → `start_i = start_{i-1} + dur_{i-1} + gapSec` (no overlap), closing card starts `lastEnd + gapSec`. `crossfadeSec` keeps its name but is the fade in/out length in both modes (UI label "Fade"). Floor (12s) and cap (59.5s) logic unchanged (sequential timelines are longer; cap still statically unreachable for ≤6 beats at max durations: 6×4.2×1.5 + 5×1.5 + ~5 ≈ 50s).
- `BeatCard` unchanged in mechanics (fade in/out over `fadeSec`); `CinemaReel` sequences from the timeline as today.
- Studio: Transition select + Gap slider (gap disabled/hidden in crossfade mode).

## 4. Quotes page (`/quotes`)

- Data endpoint `GET /api/quotes` → all verses: `{ ref, chapter, verse, hook, beats, curated, favorite, prompt, promptCurated }` (beats = curated or `beatsFromTranslation` fallback; prompt per §5).
- Table: search (text over hook/beats/ref), filters (chapter, curated-only, favorites-only), ⭐ favorite toggle (persisted in `sources/quotes-meta.json` `{ [ref]: { favorite: boolean } }` via `POST /api/quotes/meta`), inline beats edit (reuses `POST /api/beats/[ref]` rules), **Copy prompt**, **Open in Studio** (deep link `/studio?ref=…`).
- **Custom quotes** (`sources/custom-quotes.json`, committed): `[{ id, lines: string[], attribution: string, kicker: string, prompt: string, createdAt }]` — `lines` obey the beat rules (2–6, ≤90, no emoji); `attribution` ≤60 chars no emoji (default "श्रीकृष्ण"); `kicker` ≤30 chars (default "श्रीकृष्ण कहते हैं"); `prompt` free text ≤300. CRUD via `/api/custom-quotes` (list/create/update/delete); ids are slugs of the first line + short random suffix.
- Rendering custom quotes: `ReelProps.cinema` gains optional `closing?: { line: string; reference: string }` — when present, `ClosingCard` shows `line` (attribution) in place of the Sanskrit line and `reference` (e.g. "SHRI KRISHNA") in place of "BHAGAVAD GITA c.v"; `kicker` text from the quote. Pipeline: `--verse custom:<id>` loads the quote and builds props with a placeholder `Verse` (`book: 'custom'`, `sanskrit: [attribution]`, `english: lines.join(' ')`, `attribution.english: 'custom quote'`). Captions for custom quotes: cinema templates with the reference replaced by the attribution and NO translation-attribution line.
- Studio verse picker gains a "Custom quotes" group; the Quotes page has a "New custom quote" form with live validation (same rules as the editor).

## 5. Image prompts

- `sources/prompts.json` (committed): curated prompt per verse for the 147 curated-beat verses, authored during implementation. Rules: English, ≤300 chars, describes a SCENE (subject, setting, light, mood) tied to the verse's teaching; never instructs on-image text; no real-person likeness; devotional/respectful; no emoji.
- Fallback for other verses: `shared/prompts.ts` → `promptFor(verse, hook, curated?: string, prefix: string): string` = `${prefix} ${curated ?? CHAPTER_THEMES[chapter] + ', ' + motif(hook)}` where `CHAPTER_THEMES` is an 18-entry table of scene descriptors (e.g. ch. 2 "Arjuna seated in his chariot on the field of Kurukshetra, Krishna turned toward him") and `motif(hook)` extracts 2–4 concrete nouns/verbs from the hook — pure, deterministic, tested.
- `ReelStyle.promptPrefix: string` (≤200 chars, default `"Cinematic devotional painting, ultra-detailed, golden-hour light, deep cosmic blues and gold, reverent mood, no text —"`), editable in Studio so every prompt matches the user's chosen art direction.
- Surfaces: Studio Media section (prompt for the current verse/quote + Copy), Quotes page column, custom-quote form field.

## 6. Testing

- Unit: `validateStyle` (new enums/defaults/backcompat), `computeCinemaTimeline` sequential math (no-overlap starts, closing after gap, floor/cap still hold, crossfade mode byte-identical), `promptFor` (curated wins, fallback deterministic, prefix applied, motif extraction), custom-quote validation (rules + id slugging), `sources/prompts.json` validation (refs exist, ≤300, no emoji, covers the curated-beat refs), captions for custom quotes.
- Browser (Playwright): Studio shows new fonts/transition controls and previews them; `/quotes` search/filter/favorite/edit/copy work; create a custom quote → open in Studio → render (dry-run) → attribution card visible in the still.
- Regression: classic untouched; existing presets load; 117+ tests green.

## 7. Out of scope

Scheduling/publishing (Sub-project B), image-generation API, per-beat individual fonts/colors, translations of custom quotes, importing quotes from files.
