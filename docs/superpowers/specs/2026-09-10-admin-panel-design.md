# Admin Panel — Light Theme, Left Navigation, Settings Page — Design Spec

**Date:** 2026-09-10
**Status:** Approved in design; written for user review before planning.
**Goal:** Turn the dashboard into a light-themed admin panel with a left navigation bar and six pages, add a dark toggle on the same design tokens, and give every reel-related setting a home on a Settings page that edits `config.json` and `styles/cinema.json` with validation.

## 1. Decisions with the user (2026-09-10)

- Settings page holds: channel identity & defaults (`config.json`), publishing schedule (`config.json.schedule`), the channel style (moved from Studio; `styles/cinema.json`), and read-only connection status.
- Light is the default theme; a Light/Dark toggle in the sidebar, remembered per browser.
- Six pages in the left navigation: **Overview · Studio · Quotes · Calendar · Library · Settings**.
- Approach: CSS design tokens + Tailwind utilities, sidebar in the root layout, no component library, no new dependencies.

## 2. Shell and theme

- **Tokens** (`dashboard/app/globals.css`): `--bg`, `--surface`, `--surface-2`, `--border`, `--text`, `--muted`, `--accent` (fills), `--accent-text` (links/labels on light), `--success`, `--warning`, `--danger`, `--video-bg` (always dark). Light values on `:root`: bg `#f6f4ef`, surface `#ffffff`, surface-2 `#f1ede4`, border `#e6e1d6`, text `#1d1a16`, muted `#6b655c`, accent `#e8c874`, accent-text `#b8912e`, success `#2f7d4f`, warning `#b26a00`, danger `#b3261e`, video-bg `#0d0817`. Dark values under `html[data-theme="dark"]` reproduce today's palette (bg `#0d0817`, surface `#161028`, surface-2 `#1c1533`, border `rgba(255,255,255,0.08)`, text `#f5efe0`, muted `#a89f8d`, accent/accent-text `#e8c874`, danger `#f87171`). Tailwind 4 `@theme` maps them to utilities (`bg-bg`, `bg-surface`, `text-text`, `text-muted`, `border-border`, `bg-accent`, `text-accent-text`, …). `color-scheme` follows the theme.
- **Rule:** components use token utilities only. A vitest test (`scripts/dashboard-tokens.test.ts`) greps `dashboard/app/**/*.tsx` for raw hex colours and fails on any occurrence outside `globals.css` (the Remotion `video/` tree is exempt — it is the reel).
- **Theme toggle:** `ThemeToggle` sets `data-theme` on `<html>` and stores `gita.theme` in `localStorage`; an inline script in `layout.tsx` applies the stored theme before paint (no flash); default light.
- **Layout** (`dashboard/app/layout.tsx` + `components/shell/{Sidebar,PageHeader,ThemeToggle}.tsx`): a fixed 240 px sidebar (brand "गीता Reels", six links with icons and an active state derived from `usePathname`, a server-health dot from `/api/state`, the theme toggle and the handle at the bottom); collapses to a 64 px icon rail below 1024 px and to a top bar + hamburger drawer below 768 px. The content column has `PageHeader { title, description, actions? }`; pages no longer render their own headers or cross-links. Keyboard: links are real `<a>`s, the drawer traps focus and closes on Escape.
- **Video surfaces stay dark:** the Remotion Player, `ReelPlayer`, thumbnails and render logs sit on `bg-video-bg` in both themes.

## 3. Pages

- **Overview** (`/`): status chips (last posted, next verse, next scheduled, total posted), Sync to GitHub with its output disclosure, and **Quick generate** (verse + background + format → streamed render → player/download — today's `GeneratePanel`, restyled). Upload zone and library move out.
- **Studio** (`/studio`): unchanged behaviour except: Look/Media controls are **per-render overrides**; the "Save as channel style" button becomes **Reset to channel style** (reloads `styles/cinema.json`) with a "modified" badge when the live values differ from the saved style and a link "Edit channel style in Settings".
- **Quotes** (`/quotes`), **Calendar** (`/calendar`): restyled to tokens; the calendar's config strip links to Settings › Schedule.
- **Library** (`/library`): the upload zone (images, mp3) and the backgrounds/music library (today's `UploadZone` + `Library`), music rows ready for mood tags later.
- **Settings** (`/settings`): four cards, each with its own Save and an "unsaved changes" marker (see §4).

## 4. Settings page

1. **Channel** → `config.json` root: `handle` (`/^@[A-Za-z0-9._]{1,30}$/`), `format` (from a shared `FORMATS` constant: `classic`, `cinema`; `narrated` joins when SP1 lands), `startRef` (chapter + verse selects fed by `/api/state.chapters`), `platforms` (YouTube/Instagram checkboxes; note "Facebook posts from the calendar"), `mode` (`calendar` | `daily`, one-line explanation each).
2. **Publishing schedule** → `config.json.schedule`: `daysAhead` (1–14), `defaultTimes` (three `HH:mm` inputs), `timezone` (searchable select over `Intl.supportedValuesOf('timeZone')`, current value first). Validated by `validateScheduleConfig` (existing) — the form shows the clamped/rejected value.
3. **Channel style** → `styles/cinema.json`: the Look + Media controls (`StyleControls` + the music mode/track/prompt-prefix parts of `MediaControls`, extracted into a shared `StyleForm`), with a live Player preview on a fixed sample verse (gita 2:47, first two curated beats) beside them; Save → existing `POST /api/style`.
4. **Connections** (read-only): per platform — local `.env` secrets present (from `secretsFor`), GitHub Actions secrets present (`gh secret list`), and the `daily-reel` / `publisher` workflow states (`gh workflow list --all`); each row links to the SETUP.md step; when `gh` is missing or not authenticated the card says so instead of failing.

**Shared validation** (`shared/config.ts`, browser-safe): `ConfigFile` type (`handle, startRef, platforms, format, mode?, schedule?, narration?, script?` — unknown keys preserved), `FORMATS`, `MODES`, `validateConfigPatch(patch, verseRefs?)` returning `{ ok: true, value } | { ok: false, errors: Record<field, message> }` (never throws). The route re-validates; unknown keys in the patch are rejected.

**Backend seam:** `getConfig(): Promise<ConfigFile>`; `updateConfig(patch): Promise<ConfigFile>` (queue-serialized read-modify-write, validated with the verse list, keeps unknown keys, writes 2-space + newline); `getConnections(): Promise<{ platforms: Record<Platform, { local: boolean; actions: boolean | null }>; workflows: Record<'daily-reel' | 'publisher', 'active' | 'disabled' | 'unknown'>; ghAvailable: boolean }>`. Routes: `GET/PATCH /api/config`, `GET /api/connections`; origin guard first on PATCH; validation → 400 `{ errors }`. `sync()` pathspec += `config.json`; message `chore: sync dashboard edits (backgrounds, style, beats, quotes, calendar, config)`.

## 5. Error handling

Invalid field → inline message under the field, card Save disabled until fixed; server 400 → the same messages from `errors`; 409 (publisher running) on config save → "a render or the publisher is running — try again in a moment" (config is read by running jobs, so it is refused while the lock is held, like calendar edits); `gh` missing → Connections shows "GitHub CLI not available on this machine" and still shows local `.env` status; malformed `config.json` on disk → Settings shows the parse error and offers nothing to save (the CLI would fail loudly too); theme preference unreadable (private mode) → light.

## 6. Testing

Units: `validateConfigPatch` (every rule, unknown keys, clamp/reject semantics), `updateConfig` preserving unknown keys, connections aggregation with a fake `gh` (present/absent/unauthenticated), the raw-hex grep test, sidebar route table (active-state resolution). Browser (Playwright): every page renders in light and dark with no contrast regressions on key text (spot-check computed colours), sidebar active state per route, phone-width drawer opens/closes, Settings: change handle → Save → `/api/config` reflects it → invalid handle shows the inline error; schedule time edit → `/calendar` shows the new default; style save from Settings → Studio's "modified" badge logic; Overview quick generate still streams; Library upload still works. Regression: root suite green; render pipeline untouched (no `video/` or `pipeline/` changes).

## 7. Out of scope

Login/auth and secret editing (SP2), mood tags UI (SP1), notifications, mobile-first redesign of the Studio Player controls, i18n of the panel chrome, a component library.
