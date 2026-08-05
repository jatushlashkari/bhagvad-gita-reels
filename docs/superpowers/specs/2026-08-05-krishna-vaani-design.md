# Krishna Vaani Format (v2) — Design Spec

**Date:** 2026-08-05
**Status:** Approved pending user review
**Goal:** A second, reach-optimized reel format — hook-first "श्रीकृष्ण कहते हैं" — driven by the same verse dataset and posting machinery, coexisting with the classic scripture-first format.

## 1. Why (from the 2026-08-04 research)

Completion rate and 3-second hold decide reach; DM-shares are weighted 3-5× likes. The classic format opens with a title card (weak cold-viewer hook) and runs 33-45s. Vaani reels open with a relatable pain-point, deliver Krishna's answer as advice, and end asking to be sent to someone — while our verse-anchored authenticity (real shloka + chapter:verse shown) differentiates us from the fake-quote accounts.

## 2. The reel (~20-26s, 1080×1920@30)

| Segment | Screen | Audio |
|---|---|---|
| Hook (max(2.5, hookDur+0.6)s) | Near-black; big ivory Hindi hook line, e.g. "जब मेहनत का फल न मिले…" | Voice speaks the hook; music low |
| Saying card (1.4s) | **"श्रीकृष्ण कहते हैं —"** gold, centered | No voice — musical beat |
| Meaning (meaningDur+0.6s) | Hindi meaning large (the advice); English translation smaller beneath | Voice narrates Hindi meaning; music ducked |
| Shloka+ref (3.2s) | Sanskrit lines + **"गीता X.Y"** in gold (authenticity mark) | Music up |
| CTA outro (3.0s) | ॐ + **"किसी अपने को भेजें"** + handle | Music swell, fade |

- Backgrounds/music: same pool, same deterministic pick, same Ken Burns for images.
- **No color emoji anywhere on-screen** (Linux renderer constraint — learned the hard way). Emoji are fine in captions (platform text, not rendered by Chrome).
- Total capped ≤ 59.5s with the same +15%-rate TTS retry; realistically 20-26s.

## 3. Hooks dataset — the only new content

`sources/hooks.json`: `{ "gita:2:47": "जब मेहनत का फल न मिले…", … }`

- ~100 hand-curated entries (drafted by Claude, user-editable), **only for verses spoken by Krishna**, hooks are theme-faithful — a hook must paraphrase what the verse actually addresses (no clickbait misattribution; this is a hard content rule).
- Hindi, ≤ 60 chars, ends with "…" style tension; no emoji.
- Validation (vitest): every key exists in `sources/gita.json`; verse's `sanskrit[0]` is not a non-Krishna speaker line for hooked verses (heuristic: exclude धृतराष्ट्र/सञ्जय/अर्जुन उवाच openers); length + no-emoji caps.

## 4. Format selection

- **Auto rule:** verse has a hook → vaani; else → classic. No schedule gymnastics: the daily sequential queue serves ch. 1 as classic (it's narrative setup anyway) and switches to vaani whenever a hooked verse comes up.
- Overrides: `pipeline/run.ts --format classic|vaani` (vaani on a hookless verse = error listing nearest hooked refs); dashboard Generate panel gains a Format select (Auto/Classic/Vaani) passed through the existing backend seam.

## 5. Implementation shape

- `pipeline/timeline.ts` gains `computeVaaniTimeline({hookDurSec, meaningDurSec, englishText})` → `VaaniTimings` (same style as classic; pure, tested).
- `shared/types.ts`: `ReelProps.format: 'classic' | 'vaani'` (default classic) + optional `vaani: { hook: string; timings: VaaniTimings }`; classic fields untouched (fixtures stay valid — `format` optional-defaulted on parse).
- `video/`: new `KrishnaVaani` composition (id `KrishnaVaani`) + components `HookCard/SayingCard/VaaniMeaning/ShlokaRef/VaaniOutro`, reusing Background, fonts, audio/ducking patterns; registered alongside `GitaReel` in Root with its own `calculateMetadata`.
- `voice/`: unchanged (two synth calls: hook line, meaning).
- `post/captions.ts`: vaani variants — YT title `"<hook> | श्रीकृष्ण कहते हैं | गीता X.Y #Shorts"` (≤100 chars, hook truncated to fit); IG caption opens with the hook, then shloka/meanings/attribution, CTA line "किसी अपने को भेजें 💛", same hashtag set. Classic captions untouched.
- `pipeline/run.ts`: resolves format (hook lookup + `--format`), branches TTS inputs, timeline, composition id, props; posting/state/release machinery completely unchanged.
- Dashboard: Format select + passing `format` through `generate` (backend seam + route validation `classic|vaani`); no other UI change.

## 6. Testing

Hooks-dataset validation suite; `computeVaaniTimeline` unit tests (min-hook clamp, cap, monotonicity); vaani caption tests (length caps, hook-first, no-emoji-on-screen fields); golden dry-runs: `gita:2:47` vaani end-to-end + stills of hook/saying/shloka-ref frames inspected visually; classic 1:1 regression dry-run (format auto-resolves classic — no hook for 1:1).

## 7. Out of scope

Analytics/A-B measurement, English-audience hook variants, per-verse thumbnails, Sanskrit recitation, changes to posting cadence (still one reel/day), back-filling vaani re-posts of already-posted verses.
