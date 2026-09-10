# Bhagavad Gita Reels — रोज़ एक श्लोक 🙏

Fully automated Gita reels: an hourly GitHub Actions publisher keeps the next few days of posts rendered and ready, then publishes each one at its own scheduled time — Sanskrit shloka in animated Devanagari, Hindi + English meaning, devotional footage, music, a Hindi voiceover — across **YouTube Shorts**, **Instagram Reels** and **Facebook Reels**. Verses run 1.1 → 18.78, about two years of content, ₹0/month. A simpler one-verse-a-morning mode (YouTube + Instagram only) is still available as a fallback — see "How it works" below.

## How it works

```
publisher (hourly) → auto-fill upcoming days (render + release + thumbnail + captions) → publish what is due → commit schedule.json
```

Default mode is `config.json`'s `"mode": "calendar"`: `.github/workflows/publisher.yml` runs the line above every hour, keeping `config.schedule.daysAhead` days of rows rendered and ready — each archived as a GitHub Release asset, thumbnailed, and pre-filled with per-platform captions — then publishing whichever posts have reached their scheduled time, and committing `schedule.json` (+ `state.json`, `public/thumbs/`) so a re-run never double-posts. The `publisher` workflow ships **disabled** until its secrets and a supervised first run are ready — see "Publishing calendar (automation)" just below for the full config and how to turn it on.

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

## Publishing calendar (automation)

`.github/workflows/publisher.yml` runs `npx tsx pipeline/publisher.ts` on an hourly cron (plus an
on-demand `workflow_dispatch`), auto-filling upcoming rows and publishing whatever is due. It shares
`daily-reel`'s runner, asset cache, and `YT_*`/`IG_*`/`GH_TOKEN` secrets, adding `FB_PAGE_ID` /
`FB_PAGE_ACCESS_TOKEN` for Facebook.

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
Release, leaving `asset.url` empty. Such a row will fail with "no asset url" once secrets exist —
test-only — which makes it safe to exercise auto-fill without littering the repo's Releases page.

A manual run (Actions tab → **publisher** → *Run workflow*) offers a `dry_run` input — the same idea
as the CLI's `--dry-run`: rows still get rendered and scheduled, nothing gets posted.

Like `daily-reel` and `refresh-instagram-token`, `publisher` stays **disabled** until its secrets
and a supervised first run are ready. Turn it on with `gh workflow enable publisher` when you're
ready to go live — see SETUP.md.

## Commands

```bash
npm run studio                                   # live preview/design in the browser
npm run generate -- --verse gita:2:47 --dry-run  # render one verse, post nothing
npm run assets                                   # fetch + normalize backgrounds/music
npm test && npm run typecheck                    # checks
```

## Dashboard

A local admin panel for the pipeline — light by default, dark on request — with a left-hand
sidebar and six pages, all from a browser instead of the CLI:

- **Overview** (`/`) — where the channel stands, and a quick render.
- **Studio** (`/studio`) — a live preview of the exact render; tune this cut before you render it.
- **Quotes** (`/quotes`) — every verse, your favourites, and your own custom quotes.
- **Calendar** (`/calendar`) — what goes out, where, and when.
- **Library** (`/library`) — the backgrounds and music the reels draw from.
- **Settings** (`/settings`) — everything the reels and the automation read.

A light/dark toggle sits in the sidebar; the choice is remembered per-browser.

```bash
npm install --prefix dashboard   # one-time
npm run dashboard                # http://localhost:4000
```

On your phone, open the same URL with your Mac's LAN IP instead of `localhost` (e.g. `http://192.168.1.23:4000` — find it via System Settings → WiFi → Details, or `ipconfig getifaddr en0`), as long as the phone is on the same WiFi; the dev server listens on all interfaces.

- **Upload**, on Library, takes a background image (jpg/png/webp, ≤15 MB) — it's resized to 1080×1920 and recorded as `"User-provided"` in `public/assets/manifest.json`, the same licensing ledger the CC0/CC BY footage uses.
- **Generate**, on Overview, renders any verse on demand — optionally pinned to one background from the pool — with a live streaming log and a playable/downloadable result. It's a dry run: nothing is posted, `state.json` is untouched.
- **Settings** edits `config.json` (handle, default format, start verse, daily-mode platforms, mode), the publishing schedule (days ahead, per-platform times, timezone), and the channel style (`styles/cinema.json`) that every cinema render starts from — Studio can override it for one render at a time (see Studio below).
- **Connections**, the fourth card on Settings, is read-only: which platform secrets exist on this machine (`.env`) and, when `gh` is available, in the repo's GitHub Actions, plus whether the `daily-reel` and `publisher` workflows are enabled. The panel never writes a secret — set them yourself with `gh secret set` and `.env`, per SETUP.md.
- **Sync**, on Overview, commits the uploaded images + manifest, the saved channel settings and style, curated beats, your quote favorites and custom quotes, and the calendar itself (`config.json`, `styles/cinema.json`, `sources/beats.json`, `sources/quotes-meta.json`, `sources/custom-quotes.json`, `schedule.json`, `public/thumbs/`) — then pushes, so the next scheduled run picks it all up.

Only one render runs at a time; a second Generate while one is in flight is rejected until the first finishes.

### Studio

`/studio` is where you design the cinema look — a live Remotion `<Player>` preview of any verse,
fed by the same code the render uses, so what you see is what gets rendered.

- **Beats** — edit the on-screen text per beat (2–6 of them), reorder, or add/remove; the preview
  updates as you type.
- **Look — this render only** — starts from the saved channel style and lets you tweak, just for
  this cut, a beat font (six faces: Archivo Black, Noto Serif, Cinzel, Playfair Display,
  Montserrat, Bebas Neue) and a separate kicker font (Noto Serif, Cinzel or Montserrat) for the
  top line and the closing-card handle, text/accent colors, scrim strength, timing, Ken Burns,
  kicker/handle toggles, the beat **transition** — crossfade (the next beat overlaps as this one
  fades out) or sequential (this beat fades fully out, the image holds alone for a **gap**, then
  the next beat fades in) — with its **fade** and **gap** lengths, and a **prompt prefix** (the
  art-direction line every image prompt starts with — see Image prompts below). A **modified**
  badge appears as soon as you diverge from the saved style, and **Reset to channel style**
  discards the changes. The style itself — the preset in `styles/cinema.json` that every cinema
  render (the scheduled pipeline, daily or calendar, and any other Studio session) starts from,
  and that travels with the dashboard's **Sync** — is edited on **Settings**, not here; a link in
  this panel jumps straight there.
- **Media** — pick a background from the pool, and set music mode: silent, a specific track, or
  rotation (silent in the preview — the daily pick is deterministic per verse and happens
  server-side). Upload your own mp3 from the same panel.
- **Render** in Studio is always a dry run with your current edits layered on as one-off overrides
  — nothing is posted, `state.json` is untouched, and `styles/cinema.json` is never touched from
  here; only Settings' **Channel style** card writes it.

Uploaded music stays on this machine — `public/assets/music/` is gitignored, so **Sync** never
pushes it. The scheduled cloud run can't use `musicMode: "track"` until that track is committed or
hosted somewhere the workflow can reach; until then it renders silent with a warning instead of
failing.

Every scheduled render — daily mode's morning run, or calendar mode's auto-fill — still uses
`config.json`'s `"format"` (`classic` by default) regardless of what you preview in Studio; flip it
to `"cinema"` yourself once you've saved a style you're happy with.

### Calendar

`/calendar` lists every row the publisher knows about, one render per row and one post per
platform. A **row** is a single rendered reel — a ref (a verse like `gita:2:47`, or a custom
quote's `custom:<id>`), the format it was rendered in, when it was rendered, its credits and
thumbnail — carrying three **posts**, one each for Instagram, Facebook and YouTube, every post with
its own scheduled time, status and caption (YouTube also gets its own title).

- **Thumbnails and the video itself** — the reel is archived only as a GitHub Release asset
  (`asset.url`); the repo keeps just a small still, `public/thumbs/<id>.jpg`, cut from ~1.5s into
  the reel. A row rendered with `SCHEDULE_SKIP_RELEASE=1` (the local/test escape hatch above) has
  an empty `asset.url` and can never be published.
- **Times** — each platform's time input reads and writes in `config.schedule.timezone`, but
  `schedule.json` always stores the underlying UTC instant; an edit commits on blur or Enter.
- **Editing captions** — Edit opens a drawer with the caption (≤2200 chars, with a live counter)
  and, for YouTube only, a title (≤100 chars); Save writes just that platform's post. A published
  post still accepts a caption/title fix — nothing else about it.
- **Retry / Skip / Publish now** — Skip is offered on a `scheduled` post, Retry on a `failed` or
  `skipped` one. Publish now ignores the scheduled time and runs the same CLI the hourly workflow
  does, so it needs this machine's own secrets in `.env`: `YT_CLIENT_ID`, `YT_CLIENT_SECRET`,
  `YT_REFRESH_TOKEN`, `IG_USER_ID`, `IG_ACCESS_TOKEN`, `FB_PAGE_ID`, `FB_PAGE_ACCESS_TOKEN`.
  Without them locally, the button is disabled with a tooltip explaining the post still goes out
  from the cloud at its scheduled time.
- **Re-render / Delete** — Re-render renders the row's ref again (a fresh video, release asset and
  thumbnail), keeping its id and every hand-edited post; it only refuses while a render or the
  publisher is already running. Delete removes the row and its thumbnail, but refuses once any of
  its posts has published — that row is the record of what went out.
- **Studio's "Add to calendar"** — once a Studio render finishes, a control appears beneath it to
  schedule that exact cut: pick a date (defaults to tomorrow, in the calendar's own timezone), and
  it reuses the render already sitting in `out/`, so archiving and thumbnailing takes seconds
  rather than minutes. It always schedules as `cinema` format, the only composition Studio renders.
- **How auto-fill picks a verse** — the next verse in canonical order starting at `config.startRef`
  that isn't already in `schedule.json` or in `state.json`'s posted history — the same order daily
  mode walks. Custom quotes are never auto-picked; they only reach the calendar by hand, from
  Studio's "Add to calendar" or the CLI's `--add`.
- **Retries and `skipped`** — a `failed` post — the platform call itself errored, or a
  `SCHEDULE_SKIP_RELEASE` row fails with "no asset url" once secrets exist, since it was never
  given anything to publish — is retried automatically by the hourly publisher, up to 3 attempts
  total, before it's left alone. `skipped` (no local or cloud secrets for that platform yet) is
  never retried automatically — it sits until an operator presses Retry here, or runs
  `--publish-item` from the CLI.
- **Sync** (see above) now also commits and pushes `schedule.json` and `public/thumbs/`, so a
  calendar edited here reaches the cloud publisher too.
- **Staying in sync with the cloud** — once it's live, the hourly publisher commits
  `schedule.json`, `state.json` and `public/thumbs/` to `main` on its own every hour. Run
  `git pull` before editing the calendar locally, and if Sync is rejected as non-fast-forward,
  pull first and retry.

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
saved style, so changing it on Settings' **Channel style** card re-styles every prompt at once;
tweaking it in Studio's **Look** panel previews the effect for this render only, without saving it.

Copy a prompt from the `/quotes` table (per verse) or from Studio's **Media** panel (the current
source's prompt, live as you edit beats or the prefix) — both have a **Copy** button. Paste it into
your AI art tool, then upload the result from Library's **Upload** panel (jpg/png/webp,
≤15 MB) and pick it as this verse's background from Studio's **Media** panel.

## Setup

One-time platform setup (Meta app, Google OAuth, secrets): see **SETUP.md**.

## Adding more scriptures later

Drop a `sources/<book>.json` in the same schema (see `sources/gita.json`) and point `config.json` at it. Everything downstream is book-agnostic.

## Content licensing

Verse text/translations: public-domain dataset (github.com/gita/gita, Unlicense) — Hindi: Swami Ramsukhdas, English: Swami Sivananda, attributed in every caption. Footage/music: CC0 / Public Domain / CC BY only, each recorded with license + source in `public/assets/manifest.json`; CC BY credits are appended to YouTube descriptions automatically. Fonts: Noto Serif, Archivo Black, Cinzel, Playfair Display, Montserrat, Bebas Neue (all OFL-1.1, github.com/google/fonts).
