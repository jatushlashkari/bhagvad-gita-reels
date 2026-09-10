# Narrated Reels (Sub-project 1 of the automation program) — Design Spec

**Date:** 2026-09-10
**Status:** Approved in design; written for user review before planning.
**Goal:** A third reel format, `narrated`: an AI-written, verse-grounded narration in Hindi or English (chosen per reel), spoken by a free neural voice, with karaoke-style captions timed to each spoken word, over the existing cinema visuals — reviewed and approved in Studio before anything renders.

## 0. Program context and decisions (2026-09-10)

The user asked for the full automation approach (AI scripts + voice + synced captions; an always-on queue/runs panel; in-panel Connect + auto-publish; growth automations). It is decomposed into four sub-projects, built in this order, each with its own spec → plan → build:

1. **SP1 — Narrated reels** (this spec). Runs on today's infrastructure (CLI + GitHub Actions + local dashboard).
2. **SP2 — Always-on control room**: the dashboard deployed to a **separate new server** (Node + PM2 behind an HTTPS reverse proxy, password login + session), the hourly publisher moved from GitHub Actions into a restart-safe worker loop, a Runs page (history, progress, logs, retry), renders on the server. GitHub Actions keeps only CI.
3. **SP3 — Connect + auto-publish**: OAuth "Connect" for YouTube/Instagram/Facebook (Threads/X optional) in Settings, tokens stored server-side, signed public URLs for fetch-by-URL platforms, per-platform publish chains with jittered gaps and pairing, redeploy-to-front, skip-if-published. Needs SP2's public HTTPS domain.
4. **SP4 — Growth automations**: comment auto-replies / keyword DMs, a "what to make next" ideas board (themes, festivals, verses that performed well), weekly compilations, the cost/usage dashboard.

Decisions that bind all four:
- **AI providers:** scripts via **OpenRouter** (default) or **NVIDIA NIM** (free alternative); both are OpenAI-compatible chat-completions endpoints. No OpenAI account.
- **Voice:** the free `edge-tts` neural voices already used by the classic format (`hi-IN-MadhurNeural`/`hi-IN-SwaraNeural`, `en-IN-PrabhatNeural`/`en-IN-NeerjaNeural`). Verified 2026-09-10: with `boundary="WordBoundary"` edge-tts 7.2.8 returns per-word `offset`/`duration` for Hindi and English (e.g. कर्म 0.10 s, करो 0.39 s, फल 0.89 s) — **the caption clock needs no speech-recognition alignment**.
- **Language:** selectable per reel (Hindi or English narration + captions), with a config default.
- **Instagram music:** there is no official API for Instagram's music library or trending audio, and a licensed track cannot be attached to an API-published reel; scraping the private mobile API is out. Decision: **automatic by default with our own cleared music pool** (Meta Sound Collection tracks, the existing CC tracks, user uploads), plus a **per-reel "post to Instagram manually with trending audio" switch** that renders a voice-only variant and holds the Instagram slot.

## 1. The reel

- **Format id `narrated`** beside `classic` and `cinema`: `--format narrated`, Studio format select, `config.json.format` may be `narrated`.
- **Visuals = the cinema look**, all current style tokens honoured: one image with Ken Burns, gold kicker (`GITA c.v` or the custom quote's kicker), closing card (Sanskrit line + reference, or the custom attribution), scrim. **No hook card**: the reel opens directly on the image with the voice; the first caption line is the hook sentence.
- **Captions** replace the beat cards: a rolling window of `captionWords` words (2–5, default 3) from the narration, one line, centred horizontally, vertical position `captionPosition` (fraction of height, 0.55–0.85, default 0.72 — above the platform UI zone), font = `beatFont`, size from `beatSizePx` (captions cap at 72 px), white text, the currently spoken word in `accentColor`, a dark rounded box behind the line with `captionBoxOpacity` (0–1, default 0.55). Devanagari and Latin both render (fonts already embedded). Captions can be turned off per reel (`captionsOn: false` in the plan) for voice-only reels.
- **Audio**: narration synthesised by edge-tts in the reel's language and voice, then mastered by the bundled ffmpeg (`highpass=f=80, acompressor(threshold −18 dB, ratio 3), loudnorm(I=−14, TP=−1.5, LRA=8), alimiter(0.95)`) to `public/generated/narration.<lang>.mp3`. Music (when the style/music pick provides a track) plays under the voice at a constant 0.10 volume with the existing 2.2 s end fade; the voice plays at 1.0 starting at 0.4 s. Remotion mixes the two `<Audio>` tracks; no ffmpeg mixing pass.
- **Timeline** (`computeNarratedTimeline(voiceDurationSec, style)`): voice starts at 0.4 s; closing card starts `voiceEnd + 0.6` (+ `gapSec` when the transition is sequential — same token semantics as cinema); closing 3.2 s + 0.5 s tail; floor 12 s (closing absorbs the shortfall, as cinema does post-scale); cap 59.5 s. A narration that would breach the cap is rejected at **draft** time by word count, never at render.
- **Word timing**: `voice/edge_tts_words.py` (checked in) runs `edge_tts.Communicate(text, voice, rate, boundary="WordBoundary")` and prints `{ words: [{ text, start, end }] }` while writing the mp3. It is executed with the interpreter that owns the edge-tts install: `EDGE_TTS_PYTHON` env if set, else the shim's shebang interpreter (pipx layout), else `python3 -m`-style fallback (`pip install edge-tts` in CI). `voice/narrate.ts` exports `synthNarration(text, { voice, rate }) → { path, durationSec, words }` with the same plausibility guard as `synthHindi` plus "at least one word boundary".

## 2. Script generation

**Grounding.** The model sees only: chapter/verse, Sanskrit lines, Hindi meaning, English meaning, the curated beats for the verse (if any), or — for a custom quote — its lines and attribution. Prompt rule #1: every claim must be supported by that text; no added stories, chapter summaries, or scholarly attributions. A cliché blocklist travels inside the prompt ("in today's fast-paced world", "game-changer", "hey guys", "don't forget to like and subscribe", "unlock", "dive in", …). Three gold-standard sample narrations (one Hindi, two English) calibrate tone: calm, direct, second person, one idea per reel, present tense.

**Output — `scriptPlan` (`shared/script-plan.ts`, browser-safe):**
```ts
type ScriptPlan = {
  ref: string; lang: 'hi' | 'en'; version: 1;
  hooks: string[];            // 5 candidate opening sentences, ≤ 12 words each
  hook: string;               // the chosen one (editable)
  narration: string;          // 60–90 words, hard ceiling 100; Hindi in Devanagari only
  captionLines: string[];     // derived from narration: ≤ 7 words per line, in order
  youtube: { title: string; description: string; tags: string[] };
  instagramCaption: string;   // ≤ 2200 incl. hashtags
  hashtags: string[];
  imageMood: string;          // 2–4 words for the music picker, e.g. "calm dawn hope"
  captionsOn: boolean;        // default true
  instagram: { manual: boolean };   // "post manually with trending audio" (default false)
  voice?: string;             // edge-tts voice override
  provenance: { provider: 'openrouter' | 'nvidia' | 'deterministic'; model: string; judge?: { model: string; scores: number[] }; generatedAt: string; sourceHash: string; edited: boolean };
};
```
`validatePlan(plan)` enforces: 5 hooks (non-empty, ≤ 12 words, no emoji, hook ∈ hooks or edited), narration 20–100 words (Devanagari-only for `hi`: no `[A-Za-z]` runs longer than 3 chars except the word "Gita"), no blocklisted phrase, `captionLines` re-derivable from the narration, YouTube title ≤ 100, description ≤ 5000, Instagram caption ≤ 2200, tags ≤ 15, `imageMood` 1–4 words. `deriveCaptionLines(narration)` and `wordCount(text)` (Devanagari-aware: split on whitespace/danda) are pure and shared with Studio.

**Providers (`script/providers.ts`).** `chatJson({ provider, model, messages, apiKey, fetch, timeoutMs })` → parsed JSON, with one retry on malformed JSON/timeout. OpenRouter: `https://openrouter.ai/api/v1/chat/completions` (`Authorization: Bearer OPENROUTER_API_KEY`, `HTTP-Referer`/`X-Title` headers set). NVIDIA: `https://integrate.api.nvidia.com/v1/chat/completions` (`NVIDIA_API_KEY`). Default models (all configurable in `config.json.script`): OpenRouter script `deepseek/deepseek-v4-flash`, judge `google/gemini-3.5-flash`; NVIDIA script `minimaxai/minimax-m3`, judge the same model. `response_format: { type: 'json_object' }` where supported, otherwise the prompt demands a bare JSON object and the parser strips code fences.

**Best-of-3 with a judge (`script/generate.ts`, `script/judge.ts`).** `candidates` (default 3) plans are generated in parallel with temperature 0.9; each is validated (a failing candidate is regenerated once; if all fail, the draft fails listing the reasons). The judge scores each candidate 0–25 on Hook, **Faithfulness to the verse (weighted ×2)**, Clarity, Tightness (told to be harsh and spread the scores) and the highest total wins; the losers' best hooks are merged into the winner's `hooks` (deduped, still 5). Provenance records model + scores.

**Deterministic fallback (`script/deterministic.ts`).** No key or `--script-provider deterministic`: English = curated beats (or `beatsFromTranslation`) joined as the narration, hooks = first beat + 4 variants (question form, imperative, "Gita 2.47:" prefix, …); Hindi = the first 2–3 sentences of the Hindi meaning; captions/titles from the existing caption templates. Provenance `provider: 'deterministic'`; the calendar row shows "deterministic script".

**Cost ledger (`script/ledger.ts`).** Every model call appends `{ at, ref, lang, kind: 'script'|'judge', provider, model, promptTokens, completionTokens, costUsd? }` to `out/ledger.jsonl` (gitignored); `aggregateLedger()` gives today / 7-day / all-time totals per provider/model; `GET /api/ledger` and a small Studio readout. Cost is estimated from a `config.json.script.prices` table when present, else omitted.

**Unattended runs.** Auto-fill (calendar mode) uses the **deterministic** provider unless `config.json.script.autoFillUsesAi` is `true` — no unattended spend by default; rows say which it was.

## 3. Review flow, storage, UI, CLI

**Flow.** (1) **Draft**: `npm run generate -- --verse <ref> --format narrated --lang hi --draft` (or Studio's *Draft script*) runs only the script step and writes `sources/scripts/<ref-slug>.<lang>.json` (the plan; `<ref-slug>` = ref with `:` → `-`). No audio, no render. (2) **Review** in Studio (see UI). (3) **Render** (`--format narrated --lang hi`, Studio's *Render this cut*) loads the saved plan verbatim (or drafts deterministically when none exists and no `--draft` was asked — CI path), synthesises the voice with word timings, masters it, picks music by mood, builds the timeline, renders `NarratedReel`, and — when `instagram.manual` is set — also renders `out/reel-voice-only.mp4` (music muted). `out/props.json` gains `narration: { lang, voiceFile, words, captionLines, hookLine, captionsOn }`; post text comes from the plan (`youtube.title/description`, `instagramCaption` for Instagram and Facebook).

**Storage (committed like beats/prompts).** `sources/scripts/*.json` — sync pathspec += `sources/scripts`. Music manifest entries gain optional `moods: string[]` (tagged in Studio → Media; untagged = "any"); `shared/music-pick.ts` `pickTrack(mood, tracks, ref)` scores tag overlap, then falls back to "any", then to silent — deterministic per ref. Meta Sound Collection tracks are downloaded by the user (login-gated, no URL fetch) into `public/assets/music/` with license `Meta Sound Collection`; like all uploads they are local-only until SP2 renders on the server (CI renders in SP1 can only use manifest tracks with URLs — documented). Voice files live under `public/generated/` (gitignored), voice previews under `public/generated/previews/<hash>.mp3` (media whitelist += `public/generated/previews/`).

**Studio.** Format select gains `narrated`. New **Script** panel (only for `narrated`): language switch (hi/en) with the default from config; voice select (the four Indian voices); the 5 hooks as clickable options + an editable chosen hook; narration textarea with live word count (red past 100); caption lines shown read-only, derived live; YouTube title/description and Instagram caption editable; `captionsOn` toggle; "post to Instagram manually with trending audio" switch; **Draft script** (streams the CLI `--draft`, then loads the file), **↻ New script** (keeps the current text in a "previous" slot with a Restore link until you save), **Preview voice** (`POST /api/voice/preview` → `{ url, words, durationSec }`, mp3 cached by text+voice hash, plays inline, and its word timings drive the Player captions from then on), **Save script** (`POST /api/scripts/[ref]?lang=` → validated, `edited: true`). Look panel gains the caption tokens; Media panel gains per-track mood tags and shows the mood picker's choice for the current plan; the Player preview uses saved word timings when a preview/render exists for the current text, else estimates (2.5 words/s, equal split) so captions still show. Render posts `format: 'narrated', lang` and the plan is read from disk (unsaved edits are refused with "save the script first" — the plan is the contract). `/quotes` rows show `script hi ✓ · en ·` and a **Draft** action per language (streams; one at a time under the render lock). Ledger readout ("today ₹/$ · 7 d · all time") in Studio's Script panel.

**Calendar/publisher.** `prefillPosts` uses the plan's texts when `format === 'narrated'`. `instagram.manual` → the Instagram post is created as `draft` with `note: 'post manually with trending audio'`, the row's asset gains `voiceOnlyUrl` (second release asset `reel-voice-only.mp4`), the calendar shows *Download voice-only · Copy caption · Mark as posted* (sets `published` with `id: 'manual'`); the publisher never auto-publishes a `draft` (existing semantics). YouTube/Facebook publish the music version automatically.

**CLI flags.** `--format narrated`, `--lang hi|en` (default `config.narration.defaultLang`), `--draft`, `--script-provider openrouter|nvidia|deterministic`, `--script-model <id>`, `--voice <edge-tts voice>`, `--no-music`. `config.json` gains `narration: { defaultLang: 'hi', voices: { hi: 'hi-IN-MadhurNeural', en: 'en-IN-PrabhatNeural' }, rate: '+0%' }` and `script: { provider: 'openrouter', model, judgeModel, candidates: 3, autoFillUsesAi: false, prices?: {...} }`. Env: `OPENROUTER_API_KEY`, `NVIDIA_API_KEY` (never printed; `.env` loaded like the publisher does).

## 4. Error handling

Missing/invalid key or provider outage when AI was explicitly requested → the draft fails loudly (never a silent deterministic substitute); unattended auto-fill uses the deterministic provider and flags the row. Malformed JSON / rule violation → the candidate is regenerated once; all three failing → draft fails with the reasons. Narration over 100 words → rejected at draft with the count. Edge-tts returns no word boundaries or implausibly short audio → render aborts before the timeline. No mood match → "any" → silent, logged. Verse/beats edited after the draft (sourceHash mismatch) → Studio warning, not a block. Unsaved Studio edits at render → refused ("save the script first").

## 5. Testing

Pure units: prompt builder (grounding text present, blocklist embedded, language clause, gold samples), `validatePlan` (every rule), `deriveCaptionLines`/`wordCount` (Devanagari), judge scoring + hook merge, deterministic fallback (hi/en), `pickTrack`, caption windowing (`captionWindows(words, n)`: no overlaps, last window held to voice end), `computeNarratedTimeline` (floor/cap/sequential gap), the mastering filter-graph string, ledger aggregation; providers with an injected fetch (OpenRouter + NVIDIA request shapes, retry on malformed JSON, timeout). Golden dry-runs: one Hindi and one English render with the deterministic provider (no key) → stills of a mid-caption frame and the closing card checked by eye; `props.json` carries words + captionLines; the voice-only variant exists when `instagram.manual` is set. Browser (Playwright): Studio draft (deterministic) → edit hook → preview voice → save → render posts `narrated`; `/quotes` indicator. Regression: classic and cinema renders unchanged; all 206 tests green.

## 6. Out of scope

Always-on server, Runs panel, OAuth Connect, auto-publish chains (SP2–SP3); comment/DM automations, ideas board, compilations (SP4); OpenAI/Whisper alignment; image generation; translation of custom quotes; Instagram music library access (no API exists); per-word caption animations beyond highlight (bounce/scale) — a style token can be added later.
