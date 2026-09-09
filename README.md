# Bhagavad Gita Reels — रोज़ एक श्लोक 🙏

Fully automated daily reels: every morning at 7:00 AM IST, GitHub Actions picks the next Gita verse (1.1 → 18.78, ~2 years of content), generates a Hindi voiceover, renders a 1080×1920 video — Sanskrit shloka in animated Devanagari, Hindi + English meaning, devotional footage, music — and posts it to **YouTube Shorts** and **Instagram Reels**. ₹0/month.

## How it works

```
publisher (hourly) → auto-fill upcoming days (render + release + thumbnail + captions) → publish what is due → commit schedule.json
```

Default mode is `config.json`'s `"mode": "calendar"`: `.github/workflows/publisher.yml` runs the line above every hour, keeping `config.schedule.daysAhead` days of rows rendered and ready — each archived as a GitHub Release asset, thumbnailed, and pre-filled with per-platform captions — then publishing whichever posts have reached their scheduled time, and committing `schedule.json` (+ `state.json`, `public/thumbs/`) so a re-run never double-posts. Details below, under "Publishing calendar (automation)".

`"mode": "daily"` is the original fallback — one verse, once a morning:

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
- **Sync** commits the uploaded images + manifest, the saved style and curated beats, and your quote favorites and custom quotes (`styles/cinema.json`, `sources/beats.json`, `sources/quotes-meta.json`, `sources/custom-quotes.json`) — then pushes, so the next scheduled run picks it all up.

Only one render runs at a time; a second Generate while one is in flight is rejected until the first finishes.

### Studio

`/studio` is where you design the cinema look — a live Remotion `<Player>` preview of any verse,
fed by the same code the render uses, so what you see is what gets rendered.

- **Beats** — edit the on-screen text per beat (2–6 of them), reorder, or add/remove; the preview
  updates as you type.
- **Look** — a beat font (six faces: Archivo Black, Noto Serif, Cinzel, Playfair Display,
  Montserrat, Bebas Neue) and a separate kicker font (Noto Serif, Cinzel or Montserrat) for the
  top line and the closing-card handle, text/accent colors, scrim strength, timing, Ken Burns,
  kicker/handle toggles, the beat **transition** — crossfade (the next beat overlaps as this one
  fades out) or sequential (this beat fades fully out, the image holds alone for a **gap**, then
  the next beat fades in) — with its **fade** and **gap** lengths, and a **prompt prefix** (the
  art-direction line every image prompt starts with — see Image prompts below). **Save as channel
  style** writes the preset to `styles/cinema.json`, which every cinema render (Studio's own
  **Render** button and the daily pipeline) reads from. It's a normal file in the repo, so it
  travels with the dashboard's **Sync** like the background library does.
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

### Quotes

`/quotes` is the searchable index of every verse, plus your own. Search by ref, hook or beat text,
filter by chapter, and toggle curated-only / favorites-only; favoriting a row (⭐) writes to
`sources/quotes-meta.json`. Edit a verse's beats inline, right in the table (same 2–6 lines, ≤90
chars rule as Studio's editor) — saving re-reads the row so the hook, curated flag and image prompt
never drift from `sources/beats.json`. Every row's image prompt has a **Copy** button, and
**Studio** opens that verse at `/studio?ref=<ref>` — the deep link Studio reads on load.

A second panel lists your custom quotes with **Open in Studio**, **Edit** and **Delete**, and the
form to write a new one — see Custom quotes below.

### Custom quotes

Your own text, rendered through the same cinema pipeline as a verse. Create, edit or delete one on
`/quotes`'s Custom quotes panel: 2–6 lines (≤90 chars each, no emoji), an optional **attribution**
(≤60 chars, defaults to `श्रीकृष्ण`) for the closing card, an optional **kicker** (≤30 chars,
defaults to `श्रीकृष्ण कहते हैं`) for the top line, and an optional **image prompt** (≤300 chars —
leave it blank to fall back to the generic theme). Quotes are stored in `sources/custom-quotes.json`;
each gets an id — a slug of its first line plus four random characters — used as its ref,
`custom:<id>`.

A custom quote always renders in the cinema format (`--format classic` is rejected for one) with
its kicker as the top line, and a closing card that shows the attribution in place of a verse
reference — no romanised "BHAGAVAD GITA chapter.verse" row. Render or preview one exactly like a
verse, by ref:

```bash
npm run generate -- --verse custom:<id> --dry-run
```

It also appears in Studio's **source** selector, under a "Custom quotes" group, and its lines can
be edited from there too — Studio's **Save beats** button patches the quote in place instead of
writing to `sources/beats.json` when a custom quote is selected. Captions follow the same shape as a
verse's, with the attribution standing in for the Sanskrit/reference block: the YouTube title is
`hook | attribution #Shorts`, and the description and Instagram caption close with `— attribution`
where a verse's would carry its Sanskrit text and translation credit.

### Image prompts

Every verse and custom quote gets an image prompt for backgrounds you generate yourself with
whatever AI art tool you use — the pipeline never calls one. It's a curated body — from
`sources/prompts.json` (147 verses today), or a custom quote's own `prompt` field — when one
exists, else the verse's chapter theme plus a few motif words lifted from its hook beat. Either way
it's prefixed with the style's **prompt prefix** (the art-direction line, e.g. "Cinematic
devotional painting, ultra-detailed, richly coloured, no text —") — just another field on the
saved style, so changing it in Studio's **Look** panel and saving re-styles every prompt at once.

Copy a prompt from the `/quotes` table (per verse) or from Studio's **Media** panel (the current
source's prompt, live as you edit beats or the prefix) — both have a **Copy** button. Paste it into
your AI art tool, then upload the result from the control room's **Upload** panel (jpg/png/webp,
≤15 MB) and pick it as this verse's background from Studio's **Media** panel.

## Publishing calendar (automation)

`.github/workflows/publisher.yml` runs `npx tsx pipeline/publisher.ts` on an hourly cron (plus an
on-demand `workflow_dispatch`), auto-filling upcoming rows and publishing whatever is due — see
"How it works" above. It shares `daily-reel`'s runner, asset cache, and `YT_*`/`IG_*`/`GH_TOKEN`
secrets, adding `FB_PAGE_ID` / `FB_PAGE_ACCESS_TOKEN` for Facebook.

`config.json`'s `schedule` block drives auto-fill:

```json
"schedule": {
  "daysAhead": 3,
  "defaultTimes": { "instagram": "07:00", "facebook": "07:05", "youtube": "07:10" },
  "timezone": "Asia/Kolkata"
}
```

- **`daysAhead`** (1–14) — how many days of upcoming rows stay rendered and scheduled at all times.
- **`defaultTimes`** — the local `HH:MM` each platform's post gets when a row is auto-filled, one
  slot per platform so they go out staggered rather than all at once.
- **`timezone`** — the IANA zone `defaultTimes` are read in (and the calendar UI displays them in);
  posting times are stored as UTC underneath.

`SCHEDULE_SKIP_RELEASE=1` is a local/test escape hatch — it renders a row without creating a GitHub
Release, leaving `asset.url` empty. Such a row can never be published (the publisher refuses it),
which makes it safe to exercise auto-fill without littering the repo's Releases page.

A manual run (Actions tab → **publisher** → *Run workflow*) offers a `dry_run` input — the same idea
as the CLI's `--dry-run`: rows still get rendered and scheduled, nothing gets posted.

Like `daily-reel` and `refresh-instagram-token`, `publisher` stays **disabled** until its secrets
and a supervised first run are ready. Turn it on with `gh workflow enable publisher` when you're
ready to go live — see SETUP.md.

## Setup

One-time platform setup (Meta app, Google OAuth, secrets): see **SETUP.md**.

## Adding more scriptures later

Drop a `sources/<book>.json` in the same schema (see `sources/gita.json`) and point `config.json` at it. Everything downstream is book-agnostic.

## Content licensing

Verse text/translations: public-domain dataset (github.com/gita/gita, Unlicense) — Hindi: Swami Ramsukhdas, English: Swami Sivananda, attributed in every caption. Footage/music: CC0 / Public Domain / CC BY only, each recorded with license + source in `public/assets/manifest.json`; CC BY credits are appended to YouTube descriptions automatically. Fonts: Noto Serif, Archivo Black, Cinzel, Playfair Display, Montserrat, Bebas Neue (all OFL-1.1, github.com/google/fonts).
