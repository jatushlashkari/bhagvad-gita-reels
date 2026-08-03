# Gita Reels Automation — Design Spec

**Date:** 2026-08-03
**Status:** Approved pending user review
**Goal:** A fully hands-off system that generates and posts one Bhagavad Gita verse reel per day to YouTube Shorts and Instagram Reels, at ₹0/month running cost, extensible to other scriptures later.

## 1. Product summary

Every day at 7:00 AM IST, the system picks the next verse (sequential: 1.1 → 18.78, ~700 days of content), generates a Hindi voiceover of its meaning, renders a 1080×1920 video with animated Devanagari typography over devotional background footage, and posts it to YouTube Shorts and Instagram Reels with auto-written titles, captions, and hashtags. No human involvement on the happy path; email + downloadable video fallback on failure.

## 2. The reel (creative spec)

Duration adapts to voiceover length (~30–45 s). Timeline is computed **from** the narration audio duration, never the reverse.

| Segment | Visual | Audio |
|---|---|---|
| 0–2 s | Title fade-in: श्रीमद्भगवद्गीता + "अध्याय X • श्लोक Y" | Flute/tanpura music bed starts |
| ~2–12 s | Sanskrit shloka revealed line-by-line, elegant Devanagari serif | Voiceover: "भगवद्गीता, अध्याय …, श्लोक …" |
| ~12–28 s | Hindi meaning (synced to narration), then English translation below | Hindi narration of the meaning; music ducked under voice |
| final ~5 s | Outro: "रोज़ एक श्लोक 🙏 Follow करें" + account handle | Music swells, fades |

- **Background:** one clip auto-picked per verse from a pack of 10–15 royalty-free devotional loops (temple, diya, Ganga, sunrise, clouds), with a dark gradient overlay for text legibility. Deterministic pick (hash of chapter:verse) so re-renders are reproducible.
- **Music:** 2–3 bundled royalty-free instrumental tracks, rotated the same way. Ducked ~-12 dB under narration.
- **Typography:** Noto Serif Devanagari (Sanskrit/Hindi) + a complementary Latin serif for English. Both open-source, bundled in repo.
- **Voiceover language decision:** narration speaks the *Hindi meaning only*. The Sanskrit shloka is displayed, not TTS-recited — AI Sanskrit pronunciation is unreliable and getting it wrong is worse than not doing it. Sanskrit recitation stays behind an off-by-default experiment flag.
- **Branding:** handle/watermark text comes from `config.json`.

## 3. Architecture

Single public GitHub repository = code + data + state + scheduler + archive. No servers.

```
config.json                  # handle, cron-relevant settings, TTS provider choice, start verse
sources/gita.json            # all 700 verses: {book, chapter, verse, sanskrit, hindi, english, attribution}
assets/
  manifest.json              # pinned URLs + licenses for backgrounds/music (fetched by script, CI-cached)
  fonts/                     # committed (small)
voice/                       # TTS adapters behind one interface: text → {mp3, durationSec}
video/                       # Remotion project (React/TS): the storyboard as code
post/
  youtube.ts                 # YouTube Data API v3 upload
  instagram.ts               # Instagram Graph API reel publish
  captions.ts                # template-based titles/captions/hashtags (deterministic, no LLM in v1)
pipeline/run.ts              # orchestrator: pick → tts → render → publish → record
state.json                   # per-verse, per-platform posting record with timestamps + video IDs/links
.github/workflows/
  daily.yml                  # the alarm clock (cron 01:30 UTC = 07:00 IST) + manual trigger
  refresh-token.yml          # weekly Instagram long-lived-token refresh
```

**Language:** TypeScript/Node everywhere (Remotion is React-based; one language, one runtime).

**Key decisions**

- **Renderer — Remotion.** Frames render in a real browser engine, so Devanagari ligatures and animations are correct and premium-looking. `remotion studio` gives a free local preview UI for design iteration.
- **TTS — pluggable adapter, default `edge-tts`** (Microsoft neural voice `hi-IN-MadhurNeural`, warm male; zero cost, zero API key). Trade-off: it is an unofficial API; if it ever breaks, config-switch to Sarvam AI (excellent Hindi, free tier, needs key) or ElevenLabs (paid). The adapter interface makes this a one-line change.
- **Scheduler/compute — GitHub Actions** on a public repo (unlimited free minutes; daily job estimated ~10 min).
- **Instagram media hosting:** the Graph API requires the video at a public URL. Each day's MP4 is attached to a GitHub Release tagged `reel-<chapter>-<verse>` — this both feeds Instagram and becomes a permanent public archive of every reel.
- **State in the repo:** `state.json` is committed by the workflow after each post. The repo is the database; a re-run can never double-post because publishing is gated on state.
- **Extensibility:** everything downstream of `sources/*.json` is book-agnostic. Adding Ramayana/Chanakya later = add a JSON file in the same schema + queue config; zero pipeline changes.

## 4. Daily data flow

1. Cron fires → checkout repo, restore asset cache (backgrounds/music fetched from pinned URLs on cache miss).
2. `pipeline/run.ts` reads `state.json` + `sources/gita.json` → selects next unposted verse.
3. TTS adapter → `narration.mp3` + duration.
4. Remotion render → `reel.mp4` (1080×1920, H.264, ~30–45 s).
5. Create GitHub Release with MP4 asset → public URL.
6. Post to YouTube (OAuth refresh token from repo secrets); post to Instagram (long-lived token from repo secrets, media URL from step 5).
7. Update `state.json` per platform (success/failure independent), commit + push.
8. On any failure: job fails → GitHub emails the user; MP4 uploaded as workflow artifact regardless, for manual posting.

## 5. Error handling

- **Per-platform independence:** YouTube failing never blocks Instagram, and vice versa. State records each separately; the next run retries only what's missing before advancing to a new verse.
- **Idempotency:** every publish checks `state.json` first. Manual re-runs are safe.
- **TTS failure:** one retry, then fail loudly (email + artifact). No silent voice-quality downgrade.
- **Token expiry:** Instagram long-lived tokens (~60 days) auto-refreshed weekly by `refresh-token.yml` (writes back via `gh secret set`). YouTube refresh tokens don't expire in production-mode apps; if revoked, the run fails loudly with a re-auth instruction in the log.
- **Honest platform caveat:** until Google's one-time API audit/verification clears (free form, submitted during setup), YouTube API uploads may be forced private — during that window the daily Short needs one manual "make public" tap. Instagram has no equivalent problem for own-account posting.

## 6. Testing

- **Unit tests (vitest):** verse selection/queue advancement, state transitions, idempotency (the silent-bug zone that could cause double-posts or skipped verses).
- **Dry-run mode:** `npm run generate -- --verse 2:47 --dry-run` renders video + audio, skips publishing. Used in CI on PRs with a tiny render to catch breakage.
- **Visual check:** during build, render 3 golden verses (1.1, 2.47, 18.66 — short, medium, long text) and review together in Remotion Studio before going live.
- **Go-live gate:** 7 consecutive fully-automatic days on both platforms = v1 success criterion.

## 7. One-time user setup (guided, ~1 hour)

1. GitHub account + this repo pushed public.
2. Instagram account converted to free Professional (Creator) type.
3. Meta developer app → Instagram API with Instagram Login → long-lived access token → repo secret.
4. Google Cloud project → YouTube Data API v3 enabled → OAuth client → one-time consent → refresh token → repo secret. Submit the free API audit form early (see §5 caveat).
5. TTS: none needed for default edge-tts; only if switching providers later.

## 8. Content licensing (implementation checkpoint, not optional)

- Verse text + translations sourced from an open Gita dataset; **verify the specific Hindi/English translations are public-domain or openly licensed before bundling** (public-domain fallbacks exist, e.g., 19th-century English translations; several open Hindi datasets). Attribution string stored per source in `sources/*.json` and appended to captions where required.
- Backgrounds/music only from explicit-license libraries (Pexels/Pixabay license: free for commercial use, no attribution required); `assets/manifest.json` records the license + URL for every asset.

## 9. Out of scope for v1 (explicitly deferred)

Facebook Reels (≈40 lines later, same Meta app), other scripture datasets (schema ready), Sanskrit recitation experiment, LLM-written unique captions, analytics/engagement tracking, comment auto-replies, multi-account support.
