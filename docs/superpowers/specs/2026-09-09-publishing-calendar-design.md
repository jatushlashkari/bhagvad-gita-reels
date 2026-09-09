# Publishing Calendar (Sub-project B) — Design Spec

**Date:** 2026-09-09
**Status:** Approved in design; SEQUENCED AFTER Sub-project A (studio polish). Written now so the full picture is recorded; its implementation plan is produced after A ships.
**Goal:** Replace "cron renders and posts the next verse" with a reviewable calendar: every generated reel is a row with per-platform schedule date/time and editable post text for Instagram, Facebook (new), and YouTube; the automation auto-fills upcoming days and an hourly scheduler publishes what's due.

## 1. Decisions with the user (2026-09-09)

- Auto-fill + user control (not fully manual, not history-only).
- Platforms: Instagram Reels, Facebook Reels (new), YouTube Shorts.
- Post customization = per-platform caption/hashtags/title per reel, prefilled from templates.

## 2. Data model (committed, like `state.json`)

`schedule.json` → `{ items: ScheduleItem[] }`
```ts
type Platform = 'instagram' | 'facebook' | 'youtube';
type PostStatus = 'draft' | 'scheduled' | 'published' | 'failed' | 'skipped';
type ScheduleItem = {
  id: string;                     // slug: <ref-slug>-<yyyymmdd>-<4 random>
  ref: string;                    // 'gita:2:47' | 'custom:<id>'
  format: 'classic' | 'cinema';
  hook: string;                   // display text for the table
  renderedAt: string;             // ISO
  asset: { releaseTag: string; url: string };   // GitHub release asset (public URL, permanent archive)
  thumbnail: string;              // 'thumbs/<id>.jpg' under public/ (≈200px wide, committed)
  posts: Record<Platform, { at: string | null; status: PostStatus; caption: string; title?: string; id?: string; publishedAt?: string; error?: string }>;
};
```
- `state.json` keeps recording posted refs (compat with the classic queue) — the publisher writes both.
- `config.json` gains `schedule: { daysAhead: 3, defaultTimes: { instagram: '07:00', facebook: '07:05', youtube: '07:10' }, timezone: 'Asia/Kolkata' }` and `mode: 'daily' | 'calendar'` (B ships with `calendar` as the new default; secrets gate still prevents any posting).

## 3. Automation (GitHub Actions)

- New `publisher.yml`: hourly cron (`0 * * * *`), arm64 runner, two steps via `tsx pipeline/publisher.ts`:
  1. **Auto-fill** — pure planner `planAutoFill(now, items, order, state, config)` returns verses to render so that scheduled posts cover the next `daysAhead` days at the default slot times (next free day after the last scheduled date); each render = existing cinema/classic pipeline + release upload + thumbnail still + new `ScheduleItem` with `posts[*].status = 'scheduled'`. Verses already posted (state.json) or already queued are skipped. Custom quotes are never auto-filled (user schedules them from the calendar).
  2. **Publish due** — pure `duePosts(now, items)`; each due post published via the platform module (`post/youtube.ts` with `publishAt`-free immediate upload, `post/instagram.ts`, new `post/facebook.ts`); status → `published` (+ platform id) or `failed` (+ error, retried next hour up to 3 times, then stays failed and emails via job failure).
- `schedule.json` + `state.json` committed `if: always()`; artifact fallback preserved.
- `daily-reel.yml` stays but is skipped when `config.mode === 'calendar'` (one guard step) — deleted after a week of calendar operation.

## 4. Facebook Reels (`post/facebook.ts`)

- Graph API Reels flow: `POST /{page-id}/video_reels {upload_phase: 'start'}` → upload by hosted URL (`file_url` = release asset URL) → `POST /{page-id}/video_reels {upload_phase: 'finish', video_id, video_state: 'PUBLISHED', description}`; poll status until ready. Pure `facebookFinishParams(caption, videoId)` builder tested.
- Secrets: `FB_PAGE_ID`, `FB_PAGE_ACCESS_TOKEN` (page token derived from the long-lived user token of the existing Meta app; permissions `pages_manage_posts`, `pages_read_engagement`, `publish_video`). SETUP.md gains the section; token longevity documented (page tokens from long-lived user tokens don't expire).

## 5. Dashboard `/calendar`

- Table rows = `ScheduleItem`s sorted by earliest post time: thumbnail, hook/ref, and three platform cells — datetime-local input (stored as ISO in the configured timezone), status badge, **Edit post** drawer (caption, hashtags, title where applicable; prefilled from `post/captions.ts` templates; per-platform).
- Row actions: re-render (new asset, keeps schedule), delete (only while no post is published), **Publish now** (enabled only when the local `.env` holds that platform's secrets; otherwise tooltip "publishes from the cloud at its scheduled time").
- Studio's Render result gains **Add to calendar** (choose date; slots prefilled from defaults) — creates the item (release upload + thumbnail) without waiting for auto-fill.
- Sync pathspec += `schedule.json public/thumbs`.

## 6. Error handling

Auto-fill never blocks publishing (runs first but failures are logged and the publish step still runs); a failed platform never blocks the others; publish idempotency: a post is attempted only while `status === 'scheduled'` and flips to `published` before the next item; hourly re-run retries `failed` posts ≤3 times (attempt counter in the post record); missing secrets → status `skipped` with reason (never a crash); malformed `schedule.json` → loud failure (it's the source of truth, unlike the style preset).

## 7. Testing

Pure planners (`planAutoFill` day/slot/timezone math, skip rules; `duePosts`; status transitions incl. retry cap), Facebook param builders, captions prefill; workflow dry-run via `workflow_dispatch` with a `dry_run` flag (renders + schedules, no publishing); calendar UI via Playwright (edit post, retime, add from Studio); go-live remains gated on secrets and on the user's supervised first publish.

## 8. Out of scope

Native platform scheduling APIs (we publish at due time ourselves), analytics, comments/replies, multi-account, Facebook token auto-refresh (documented as not needed), Stories.
