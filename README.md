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

## Dashboard

A local control room for the pipeline — upload backgrounds, generate/preview any verse on demand, and push new backgrounds into the daily rotation, all from a browser instead of the CLI.

```bash
npm install --prefix dashboard   # one-time
npm run dashboard                # http://localhost:4000
```

On your phone, open the same URL with your Mac's LAN IP instead of `localhost` (e.g. `http://192.168.1.23:4000` — find it via System Settings → WiFi → Details, or `ipconfig getifaddr en0`), as long as the phone is on the same WiFi; the dev server listens on all interfaces.

- **Upload** a background image (jpg/png/webp, ≤15 MB) — it's resized to 1080×1920 and recorded as `"User-provided"` in `public/assets/manifest.json`, the same licensing ledger the CC0/CC BY footage uses.
- **Generate** renders any verse on demand — optionally pinned to one background from the pool — with a live streaming log and a playable/downloadable result. It's a dry run: nothing is posted, `state.json` is untouched.
- **Sync** commits the uploaded images + manifest and pushes, so the next scheduled run picks them up in its background rotation.

Only one render runs at a time; a second Generate while one is in flight is rejected until the first finishes.

### Studio

`/studio` is where you design the cinema look — a live Remotion `<Player>` preview of any verse,
fed by the same code the render uses, so what you see is what gets rendered.

- **Beats** — edit the on-screen text per beat (2–6 of them), reorder, or add/remove; the preview
  updates as you type.
- **Style** — beat font/size, text/accent colors, scrim strength, timing, Ken Burns, kicker/handle
  toggles. **Save as channel style** writes the preset to `styles/cinema.json`, which every cinema
  render (Studio's own **Render** button and the daily pipeline) reads from. It's a normal file in
  the repo, so it travels with the dashboard's **Sync** like the background library does.
- **Media** — pick a background from the pool, and set music mode: silent, a specific track, or
  rotation (silent in the preview — the daily pick is deterministic per verse and happens
  server-side). Upload your own mp3 from the same panel.
- **Render** in Studio is always a dry run with your current edits layered on as one-off overrides
  — nothing is posted, `state.json` is untouched, and it never changes `styles/cinema.json` by
  itself (only **Save as channel style** does that).

Uploaded music stays on this machine — `public/assets/music/` is gitignored, so **Sync** never
pushes it. The scheduled cloud run can't use `musicMode: "track"` until that track is committed or
hosted somewhere the workflow can reach; until then it renders silent with a warning instead of
failing.

The daily scheduled run still uses `config.json`'s `"format"` (`classic` by default) regardless of
what you preview in Studio — flip it to `"cinema"` yourself once you've saved a style you're happy
with.

## Setup

One-time platform setup (Meta app, Google OAuth, secrets): see **SETUP.md**.

## Adding more scriptures later

Drop a `sources/<book>.json` in the same schema (see `sources/gita.json`) and point `config.json` at it. Everything downstream is book-agnostic.

## Content licensing

Verse text/translations: public-domain dataset (github.com/gita/gita, Unlicense) — Hindi: Swami Ramsukhdas, English: Swami Sivananda, attributed in every caption. Footage/music: CC0 / Public Domain / CC BY only, each recorded with license + source in `public/assets/manifest.json`; CC BY credits are appended to YouTube descriptions automatically. Fonts: Noto Serif (OFL-1.1).
