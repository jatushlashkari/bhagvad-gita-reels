# Bhagavad Gita Reels — रोज़ एक श्लोक 🙏

Fully automated daily reels: every morning at 7:00 AM IST, GitHub Actions picks the next Gita verse (1.1 → 18.78, ~2 years of content), generates a Hindi voiceover, renders a 1080×1920 video — Sanskrit shloka in animated Devanagari, Hindi + English meaning, devotional footage, music — and posts it to **YouTube Shorts** and **Instagram Reels**. ₹0/month.

## How it works

```
schedule (07:00 IST)
  → pick next verse from state.json          pipeline/select.ts
  → Hindi TTS narration (edge-tts)           voice/tts.ts
  → timeline stretched to the audio          pipeline/timeline.ts
  → Remotion render over licensed footage    video/ + public/assets/
  → archive as GitHub Release (public URL)   pipeline/release.ts
  → post to YouTube + Instagram              post/
  → commit state.json                        (never double-posts)
```

Failures email you and attach the rendered MP4 as a workflow artifact for manual posting. Platforms fail independently; re-runs only retry what's missing.

## Commands

```bash
npm run studio                                   # live preview/design in the browser
npm run generate -- --verse gita:2:47 --dry-run  # render one verse, post nothing
npm run assets                                   # fetch + normalize backgrounds/music
npm test && npm run typecheck                    # checks
```

## Setup

One-time platform setup (Meta app, Google OAuth, secrets): see **SETUP.md**.

## Adding more scriptures later

Drop a `sources/<book>.json` in the same schema (see `sources/gita.json`) and point `config.json` at it. Everything downstream is book-agnostic.

## Content licensing

Verse text/translations: public-domain dataset (github.com/gita/gita, Unlicense) — Hindi: Swami Ramsukhdas, English: Swami Sivananda, attributed in every caption. Footage/music: CC0 / Public Domain / CC BY only, each recorded with license + source in `public/assets/manifest.json`; CC BY credits are appended to YouTube descriptions automatically. Fonts: Noto Serif (OFL-1.1).
