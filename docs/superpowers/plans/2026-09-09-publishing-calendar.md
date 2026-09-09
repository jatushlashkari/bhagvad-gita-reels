# Publishing Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace "cron renders and posts the next verse" with a reviewable calendar: every generated reel is a `schedule.json` row with per-platform date/time and editable post text for Instagram, Facebook (new) and YouTube; an hourly workflow auto-fills upcoming days and publishes what is due; a `/calendar` page edits it all.

**Architecture:** A browser-safe `shared/schedule.ts` owns the data model, validation and timezone helpers; pure planners in `pipeline/schedule-plan.ts` decide what to render and what is due; `post/facebook.ts` adds the Reels API; ONE orchestrator, `pipeline/publisher.ts`, is the only code that creates or mutates calendar rows with side effects (render → release → thumbnail → captions → row; publish → row + `state.json`) and is invoked both by `.github/workflows/publisher.yml` and — through the existing render lock — by the dashboard. The dashboard gains calendar seam methods, routes, a `/calendar` page and an "Add to calendar" action in Studio.

**Tech Stack:** existing root toolchain (TS strict ESM, vitest, execa, ffmpeg-static, googleapis, `gh` CLI), Meta Graph API v23 (Facebook Reels), existing dashboard (Next 16 + Tailwind 4), GitHub Actions on `ubuntu-24.04-arm`.

**Spec:** docs/superpowers/specs/2026-09-09-publishing-calendar-design.md

## Global Constraints

- Data model verbatim from spec §2: `schedule.json` = `{ items: ScheduleItem[] }`; `Platform = 'instagram' | 'facebook' | 'youtube'`; `PostStatus = 'draft' | 'scheduled' | 'published' | 'failed' | 'skipped'`; `ScheduleItem = { id, ref, format, hook, renderedAt, asset: { releaseTag, url }, thumbnail, posts: Record<Platform, { at: string | null; status; caption; title?; id?; publishedAt?; error?; attempts?: number }> }` plus one plan addition: `credits: string[]` (CC BY credits captured at render time for the YouTube description). `id` = `<ref-slug>-<yyyymmdd>-<4 random>` (e.g. `gita-2-47-20260912-a1b2`); `thumbnail` = `thumbs/<id>.jpg` under `public/` (≈200 px wide, committed).
- `config.json` gains `schedule: { daysAhead: 3, defaultTimes: { instagram: '07:00', facebook: '07:05', youtube: '07:10' }, timezone: 'Asia/Kolkata' }` and `mode: 'calendar'` (B ships with calendar as the default; `'daily'` keeps the old behaviour). `platforms` stays `["youtube","instagram"]` for daily mode; calendar mode publishes to every key of `defaultTimes`.
- Malformed `schedule.json` → loud failure (throw); absent file → `{ items: [] }`. `state.json` keeps recording posted refs (`recordPost`) for every platform the publisher posts.
- Publish idempotency: a post is attempted only while `status === 'scheduled'` (or `'failed'` with `attempts < 3`), and `schedule.json` is rewritten after EVERY post result before the next attempt. Missing secrets → `status: 'skipped'` with the reason in `error`, never a crash. A failed platform never blocks the others; auto-fill failures never block publishing.
- Times are stored as UTC ISO strings; the UI and the planner work in `config.schedule.timezone`; no timezone library — `Intl.DateTimeFormat` only.
- Custom quotes (`custom:<id>` refs) are never auto-filled; the user adds them from Studio.
- Single render path: rows are only created/re-rendered by `pipeline/publisher.ts` (which spawns `npm run generate -- --verse <ref> --format <f> --dry-run` and reads `out/props.json`); the dashboard never renders a calendar row itself.
- `SCHEDULE_SKIP_RELEASE=1` (env, test-only) skips the GitHub Release upload and stores `asset.url = ''` so local verification never publishes anything to GitHub.
- Dashboard rules unchanged: `assertLocalOrigin` FIRST on every mutating route; every writer of a shared file goes through the serialized `queue` in `local-backend.ts`; JSON written 2-space + trailing newline; browser modules (`shared/schedule.ts`) never import `node:*`/remotion; sync pathspec += `schedule.json public/thumbs`; media whitelist += `public/thumbs/`.
- Secrets: `FB_PAGE_ID`, `FB_PAGE_ACCESS_TOKEN` (new), existing `YT_*`, `IG_*`; never printed, never committed; the new workflow is committed enabled by GitHub's default and must be disabled (`gh workflow disable publisher`) right after the first push until go-live (same practice as `daily-reel`).
- Root `npm test` + `npm run typecheck` + `npm run typecheck --prefix dashboard` green per task; conventional commits with trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; never `git add -A` at the repo root.

## File Structure

```
shared/schedule.ts (+.test.ts)            # T1 types, PLATFORMS, DEFAULT_SCHEDULE_CONFIG, validateScheduleFile, itemSlug, localToIso, isoToLocal, sortItems, postWindow
pipeline/schedule-plan.ts (+.test.ts)     # T2 pure: planAutoFill, duePosts, applyPublishResult, prefillPosts, hookFor, creditsFor
post/facebook.ts (+.test.ts)              # T3 Reels API param builders + postFacebook (injectable fetch/sleep); SETUP.md Facebook section
pipeline/publisher.ts (+.test.ts)         # T4 CLI orchestrator: --auto-fill --publish-due --add --rerender --publish-item --dry-run --now --days
pipeline/schedule-io.ts (+.test.ts)       # T4 readSchedule/writeSchedule (atomic), thumbnail (ffmpeg-static), downloadAsset, parseDotenv/loadDotenv, resolveVerse
pipeline/select.ts (+.test.ts)            # T4 PlatformKey += 'facebook'
pipeline/run.ts                           # T4 guard: facebook only in calendar mode
config.json, schedule.json ({ items: [] }), public/thumbs/.gitkeep   # T4
.github/workflows/publisher.yml, daily.yml (mode guard), README.md automation   # T5
shared/media-path.ts (+.test.ts), dashboard/lib/{backend,local-backend}.ts, dashboard/app/api/calendar/**   # T6
dashboard/app/calendar/page.tsx, app/components/calendar/{CalendarTable,PostDrawer,AddToCalendar}.tsx, app/studio/page.tsx, app/page.tsx   # T7
README.md (calendar section), SETUP.md (go-live steps)   # T8
```

---

### Task 1: Data model, validation and timezone helpers (`shared/schedule.ts`)

**Files:**
- Create: `shared/schedule.ts`, `shared/schedule.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Platform = 'instagram' | 'facebook' | 'youtube';
  export const PLATFORMS: readonly Platform[];              // ['instagram', 'facebook', 'youtube']
  export type PostStatus = 'draft' | 'scheduled' | 'published' | 'failed' | 'skipped';
  export type PostRecord = { at: string | null; status: PostStatus; caption: string; title?: string; id?: string; publishedAt?: string; error?: string; attempts?: number };
  export type ScheduleItem = { id: string; ref: string; format: 'classic' | 'cinema'; hook: string; renderedAt: string; asset: { releaseTag: string; url: string }; thumbnail: string; credits: string[]; posts: Record<Platform, PostRecord> };
  export type ScheduleFile = { items: ScheduleItem[] };
  export type ScheduleConfig = { daysAhead: number; defaultTimes: Record<Platform, string>; timezone: string };
  export const DEFAULT_SCHEDULE_CONFIG: ScheduleConfig;    // 3 / 07:00, 07:05, 07:10 / Asia/Kolkata
  export const MAX_ATTEMPTS = 3; export const CAPTION_MAX = 2200; export const TITLE_MAX = 100;
  export const ITEM_ID = /^[a-z0-9][a-z0-9-]{2,79}$/;
  export function validateScheduleConfig(input: unknown): ScheduleConfig;   // never throws: clamps/defaults (daysAhead 1–14, HH:mm times, IANA tz checked via Intl)
  export function validateScheduleFile(input: unknown): ScheduleFile;       // THROWS on malformed (spec §6)
  export function itemSlug(ref: string, date: string, rand: string): string; // 'gita:2:47','2026-09-12','a1b2' → 'gita-2-47-20260912-a1b2'
  export function localToIso(date: string, time: string, tz: string): string;   // '2026-09-12','07:00','Asia/Kolkata' → '2026-09-12T01:30:00.000Z'
  export function isoToLocal(iso: string, tz: string): { date: string; time: string };  // inverse (minute precision)
  export function localDateOf(now: Date, tz: string): string;               // 'YYYY-MM-DD' of `now` in tz
  export function addDays(date: string, n: number): string;                 // calendar arithmetic on 'YYYY-MM-DD'
  export function sortItems(items: ScheduleItem[]): ScheduleItem[];         // by earliest non-null post.at, then renderedAt; stable
  ```

- [ ] **Step 1: Write the failing tests** (`shared/schedule.test.ts`):
```ts
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SCHEDULE_CONFIG, PLATFORMS, addDays, isoToLocal, itemSlug, localDateOf, localToIso, sortItems,
  validateScheduleConfig, validateScheduleFile, type ScheduleItem,
} from './schedule.ts';

const post = (at: string | null) => ({ at, status: 'scheduled' as const, caption: 'c' });
const item = (id: string, at: string | null, renderedAt = '2026-09-09T00:00:00.000Z'): ScheduleItem => ({
  id, ref: 'gita:2:47', format: 'cinema', hook: 'h', renderedAt, asset: { releaseTag: 'reel-gita-2-47', url: '' },
  thumbnail: `thumbs/${id}.jpg`, credits: [], posts: { instagram: post(at), facebook: post(at), youtube: post(at) },
});

describe('timezone helpers (Intl only)', () => {
  it('IST wall time → UTC ISO and back', () => {
    expect(localToIso('2026-09-12', '07:00', 'Asia/Kolkata')).toBe('2026-09-12T01:30:00.000Z');
    expect(isoToLocal('2026-09-12T01:30:00.000Z', 'Asia/Kolkata')).toEqual({ date: '2026-09-12', time: '07:00' });
  });
  it('handles a DST zone on both sides of the change', () => {
    expect(localToIso('2026-07-01', '09:00', 'Europe/London')).toBe('2026-07-01T08:00:00.000Z');
    expect(localToIso('2026-12-01', '09:00', 'Europe/London')).toBe('2026-12-01T09:00:00.000Z');
  });
  it('localDateOf crosses midnight correctly', () => {
    expect(localDateOf(new Date('2026-09-11T20:00:00Z'), 'Asia/Kolkata')).toBe('2026-09-12');
    expect(localDateOf(new Date('2026-09-11T20:00:00Z'), 'UTC')).toBe('2026-09-11');
  });
  it('addDays rolls months and years', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('ids and config', () => {
  it('itemSlug shape', () => {
    expect(itemSlug('gita:2:47', '2026-09-12', 'a1b2')).toBe('gita-2-47-20260912-a1b2');
    expect(itemSlug('custom:my-quote-x9', '2026-09-12', 'a1b2')).toBe('custom-my-quote-x9-20260912-a1b2');
  });
  it('validateScheduleConfig clamps and defaults without throwing', () => {
    expect(validateScheduleConfig(undefined)).toEqual(DEFAULT_SCHEDULE_CONFIG);
    expect(validateScheduleConfig({ daysAhead: 99 }).daysAhead).toBe(14);
    expect(validateScheduleConfig({ daysAhead: 0 }).daysAhead).toBe(1);
    expect(validateScheduleConfig({ defaultTimes: { instagram: '25:99' } }).defaultTimes.instagram).toBe('07:00');
    expect(validateScheduleConfig({ timezone: 'Mars/Olympus' }).timezone).toBe('Asia/Kolkata');
    expect(validateScheduleConfig({ timezone: 'UTC', defaultTimes: { youtube: '18:30' } })).toEqual({
      ...DEFAULT_SCHEDULE_CONFIG, timezone: 'UTC', defaultTimes: { ...DEFAULT_SCHEDULE_CONFIG.defaultTimes, youtube: '18:30' },
    });
  });
  it('validateScheduleFile accepts a good file and throws loudly on a bad one', () => {
    const good = { items: [item('gita-2-47-20260912-a1b2', '2026-09-12T01:30:00.000Z')] };
    expect(validateScheduleFile(good)).toEqual(good);
    expect(() => validateScheduleFile({ items: [{ ...good.items[0], posts: {} }] })).toThrow(/posts/);
    expect(() => validateScheduleFile({ items: [{ ...good.items[0], id: 'Bad Id' }] })).toThrow(/id/);
    expect(() => validateScheduleFile({ items: [{ ...good.items[0], posts: { ...good.items[0].posts, youtube: { ...post(null), status: 'sent' } } }] })).toThrow(/status/);
    expect(() => validateScheduleFile('nope')).toThrow(/items/);
    expect(PLATFORMS).toEqual(['instagram', 'facebook', 'youtube']);
  });
});

describe('sortItems', () => {
  it('orders by earliest post time, unscheduled last, stable', () => {
    const a = item('a', '2026-09-13T01:30:00.000Z');
    const b = item('b', '2026-09-12T01:30:00.000Z');
    const c = item('c', null, '2026-09-08T00:00:00.000Z');
    const d = item('d', null, '2026-09-07T00:00:00.000Z');
    expect(sortItems([a, c, b, d]).map((i) => i.id)).toEqual(['b', 'a', 'd', 'c']);
  });
});
```
- [ ] **Step 2: Run → FAIL** (`npx vitest run shared/schedule.test.ts`).
- [ ] **Step 3: Implement `shared/schedule.ts`** (no imports at all):
```ts
export type Platform = 'instagram' | 'facebook' | 'youtube';
export const PLATFORMS: readonly Platform[] = ['instagram', 'facebook', 'youtube'];
export type PostStatus = 'draft' | 'scheduled' | 'published' | 'failed' | 'skipped';
export const POST_STATUSES: readonly PostStatus[] = ['draft', 'scheduled', 'published', 'failed', 'skipped'];
export type PostRecord = { at: string | null; status: PostStatus; caption: string; title?: string; id?: string; publishedAt?: string; error?: string; attempts?: number };
export type ScheduleItem = {
  id: string; ref: string; format: 'classic' | 'cinema'; hook: string; renderedAt: string;
  asset: { releaseTag: string; url: string }; thumbnail: string; credits: string[]; posts: Record<Platform, PostRecord>;
};
export type ScheduleFile = { items: ScheduleItem[] };
export type ScheduleConfig = { daysAhead: number; defaultTimes: Record<Platform, string>; timezone: string };
export const DEFAULT_SCHEDULE_CONFIG: ScheduleConfig = {
  daysAhead: 3, defaultTimes: { instagram: '07:00', facebook: '07:05', youtube: '07:10' }, timezone: 'Asia/Kolkata',
};
export const MAX_ATTEMPTS = 3;
export const CAPTION_MAX = 2200;
export const TITLE_MAX = 100;
export const ITEM_ID = /^[a-z0-9][a-z0-9-]{2,79}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

function isTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

export function validateScheduleConfig(input: unknown): ScheduleConfig {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const times = (o.defaultTimes && typeof o.defaultTimes === 'object' ? o.defaultTimes : {}) as Record<string, unknown>;
  const defaultTimes = { ...DEFAULT_SCHEDULE_CONFIG.defaultTimes };
  for (const p of PLATFORMS) if (typeof times[p] === 'string' && HHMM.test(times[p] as string)) defaultTimes[p] = times[p] as string;
  const days = typeof o.daysAhead === 'number' && Number.isFinite(o.daysAhead) ? Math.min(14, Math.max(1, Math.round(o.daysAhead))) : DEFAULT_SCHEDULE_CONFIG.daysAhead;
  return { daysAhead: days, defaultTimes, timezone: isTimezone(o.timezone) ? o.timezone : DEFAULT_SCHEDULE_CONFIG.timezone };
}

function bad(msg: string): never { throw new Error(`schedule.json: ${msg}`); }

export function validateScheduleFile(input: unknown): ScheduleFile {
  if (!input || typeof input !== 'object' || !Array.isArray((input as { items?: unknown }).items)) bad('items must be an array');
  const items = (input as { items: unknown[] }).items.map((raw, i) => {
    const it = (raw && typeof raw === 'object' ? raw : bad(`items[${i}] is not an object`)) as Record<string, unknown>;
    if (typeof it.id !== 'string' || !ITEM_ID.test(it.id)) bad(`items[${i}].id is not a slug`);
    if (typeof it.ref !== 'string' || !it.ref) bad(`${it.id}: ref missing`);
    if (it.format !== 'classic' && it.format !== 'cinema') bad(`${it.id}: format must be classic|cinema`);
    if (typeof it.hook !== 'string') bad(`${it.id}: hook missing`);
    if (typeof it.renderedAt !== 'string' || Number.isNaN(Date.parse(it.renderedAt))) bad(`${it.id}: renderedAt is not a date`);
    const asset = it.asset as Record<string, unknown> | undefined;
    if (!asset || typeof asset.releaseTag !== 'string' || typeof asset.url !== 'string') bad(`${it.id}: asset.releaseTag/url missing`);
    if (typeof it.thumbnail !== 'string') bad(`${it.id}: thumbnail missing`);
    const credits = Array.isArray(it.credits) && it.credits.every((c) => typeof c === 'string') ? (it.credits as string[]) : [];
    const posts = it.posts as Record<string, unknown> | undefined;
    if (!posts || typeof posts !== 'object') bad(`${it.id}: posts missing`);
    const out = {} as Record<Platform, PostRecord>;
    for (const p of PLATFORMS) {
      const r = posts[p] as Record<string, unknown> | undefined;
      if (!r || typeof r !== 'object') bad(`${it.id}: posts.${p} missing`);
      if (r.at !== null && (typeof r.at !== 'string' || Number.isNaN(Date.parse(r.at)))) bad(`${it.id}: posts.${p}.at is not a date`);
      if (!POST_STATUSES.includes(r.status as PostStatus)) bad(`${it.id}: posts.${p}.status invalid`);
      if (typeof r.caption !== 'string') bad(`${it.id}: posts.${p}.caption missing`);
      const rec: PostRecord = { at: r.at as string | null, status: r.status as PostStatus, caption: r.caption };
      for (const k of ['title', 'id', 'publishedAt', 'error'] as const) if (typeof r[k] === 'string') rec[k] = r[k] as string;
      if (typeof r.attempts === 'number') rec.attempts = r.attempts;
      out[p] = rec;
    }
    return { id: it.id, ref: it.ref, format: it.format, hook: it.hook, renderedAt: it.renderedAt, asset: { releaseTag: asset.releaseTag, url: asset.url }, thumbnail: it.thumbnail, credits, posts: out } as ScheduleItem;
  });
  return { items };
}

export const itemSlug = (ref: string, date: string, rand: string) => `${ref.replace(/[^a-z0-9]+/g, '-')}-${date.replace(/-/g, '')}-${rand}`;

// Wall-clock parts of an instant in `tz`, via Intl (no tz library).
function partsIn(instant: Date, tz: string): { y: number; m: number; d: number; h: number; mi: number } {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const get = (t: string) => Number(f.formatToParts(instant).find((p) => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour') % 24, mi: get('minute') };
}
const pad = (n: number) => String(n).padStart(2, '0');

export function localToIso(date: string, time: string, tz: string): string {
  if (!YMD.test(date) || !HHMM.test(time)) throw new Error(`bad local time ${date} ${time}`);
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  // Guess the instant as if the wall time were UTC, read the zone's wall time at that guess, and shift
  // the guess by the difference from the REQUESTED wall time (never from the moving guess — comparing
  // against the guess corrects a fixed-offset zone twice). A second pass catches a DST edge at the guess.
  const target = Date.UTC(y, m - 1, d, h, mi);
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const p = partsIn(new Date(guess), tz);
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
    const diff = asUtc - target;
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess).toISOString();
}

export function isoToLocal(iso: string, tz: string): { date: string; time: string } {
  const p = partsIn(new Date(iso), tz);
  return { date: `${p.y}-${pad(p.m)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.mi)}` };
}

export const localDateOf = (now: Date, tz: string) => isoToLocal(now.toISOString(), tz).date;

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

const earliestAt = (it: ScheduleItem) => {
  const ats = PLATFORMS.map((p) => it.posts[p].at).filter((a): a is string => a !== null).map(Date.parse);
  return ats.length ? Math.min(...ats) : Number.POSITIVE_INFINITY;
};
export function sortItems(items: ScheduleItem[]): ScheduleItem[] {
  return [...items].sort((a, b) => earliestAt(a) - earliestAt(b) || Date.parse(a.renderedAt) - Date.parse(b.renderedAt));
}
```
- [ ] **Step 4: PASS + typechecks** (`npm test && npm run typecheck && npm run typecheck --prefix dashboard`).
- [ ] **Step 5: Commit** — `git add shared/schedule.ts shared/schedule.test.ts && git commit -m "feat: schedule data model, validation and timezone helpers"`

---

### Task 2: Pure planners (`pipeline/schedule-plan.ts`)

**Files:**
- Create: `pipeline/schedule-plan.ts`, `pipeline/schedule-plan.test.ts`

**Interfaces:**
- Consumes: Task 1 types/helpers; `StateFile` from `pipeline/select.ts`; captions from `post/captions.ts` (`youtubeTitle`, `youtubeDescription`, `instagramCaption`, `cinemaYoutubeTitle`, `cinemaYoutubeDescription`, `cinemaInstagramCaption`, `customYoutubeTitle`, `customYoutubeDescription`, `customInstagramCaption`); `ReelProps` from `shared/types.ts`; `Manifest` type from `scripts/fetch-assets.ts` (type-only).
- Produces:
  ```ts
  export function planAutoFill(now: Date, items: ScheduleItem[], order: string[], state: StateFile, cfg: ScheduleConfig): { ref: string; date: string }[];
  export function duePosts(now: Date, items: ScheduleItem[]): { itemId: string; platform: Platform }[];   // scheduled & at<=now, or failed & attempts<MAX_ATTEMPTS & at<=now; ordered by at
  export type PublishResult = { ok: true; id: string } | { ok: false; error: string } | { skipped: string };
  export function applyPublishResult(post: PostRecord, result: PublishResult, at: string): PostRecord;
  export function hookFor(props: ReelProps): string;                 // cinema → beats[0]; classic → first Hindi sentence; custom → first line
  export function creditsFor(props: ReelProps, manifest: Manifest): string[];
  export function prefillPosts(props: ReelProps, credits: string[], date: string, cfg: ScheduleConfig): Record<Platform, PostRecord>;  // status 'scheduled', at = localToIso(date, defaultTimes[p], tz), captions per format
  ```

- [ ] **Step 1: Failing tests** (`pipeline/schedule-plan.test.ts`):
```ts
import { describe, it, expect } from 'vitest';
import { applyPublishResult, duePosts, hookFor, planAutoFill, prefillPosts } from './schedule-plan.ts';
import { DEFAULT_SCHEDULE_CONFIG, type PostRecord, type ScheduleItem } from '../shared/schedule.ts';
import type { ReelProps } from '../shared/types.ts';

const cfg = DEFAULT_SCHEDULE_CONFIG; // IST, 07:00/07:05/07:10
const P = (at: string | null, status: PostRecord['status'] = 'scheduled', extra: Partial<PostRecord> = {}): PostRecord => ({ at, status, caption: 'c', ...extra });
const I = (id: string, ref: string, at: string | null, posts?: Partial<ScheduleItem['posts']>): ScheduleItem => ({
  id, ref, format: 'cinema', hook: 'h', renderedAt: '2026-09-09T00:00:00.000Z', asset: { releaseTag: 't', url: '' }, thumbnail: `thumbs/${id}.jpg`, credits: [],
  posts: { instagram: P(at), facebook: P(at), youtube: P(at), ...posts },
});
const order = ['gita:1:1', 'gita:1:2', 'gita:1:3', 'gita:1:4', 'gita:1:5'];
const noState = { posted: [] };

describe('planAutoFill', () => {
  it('fills the next daysAhead days starting today when the first slot is still ahead', () => {
    // 2026-09-10 05:00 IST = 2026-09-09T23:30Z; slots at 07:00 IST are ahead → today counts
    const plan = planAutoFill(new Date('2026-09-09T23:30:00Z'), [], order, noState, cfg);
    expect(plan).toEqual([{ ref: 'gita:1:1', date: '2026-09-10' }, { ref: 'gita:1:2', date: '2026-09-11' }, { ref: 'gita:1:3', date: '2026-09-12' }]);
  });
  it('starts tomorrow once the earliest slot has passed', () => {
    const plan = planAutoFill(new Date('2026-09-10T02:00:00Z'), [], order, noState, cfg); // 07:30 IST
    expect(plan[0]).toEqual({ ref: 'gita:1:1', date: '2026-09-11' });
  });
  it('skips days already covered and refs already used or posted', () => {
    const items = [I('a', 'gita:1:1', '2026-09-11T01:30:00.000Z')];
    const state = { posted: [{ ref: 'gita:1:2', youtube: { id: 'x', at: 'y' } }] };
    const plan = planAutoFill(new Date('2026-09-09T23:30:00Z'), items, order, state, cfg);
    expect(plan).toEqual([{ ref: 'gita:1:3', date: '2026-09-10' }, { ref: 'gita:1:4', date: '2026-09-12' }]);
  });
  it('a skipped/failed row still counts as covering its day; an unscheduled row does not', () => {
    const covered = I('a', 'gita:1:1', '2026-09-10T01:30:00.000Z', { instagram: P('2026-09-10T01:30:00.000Z', 'skipped') });
    const unscheduled = I('b', 'gita:1:2', null);
    const plan = planAutoFill(new Date('2026-09-09T23:30:00Z'), [covered, unscheduled], order, noState, cfg);
    expect(plan.map((p) => p.date)).toEqual(['2026-09-11', '2026-09-12']);
    expect(plan.map((p) => p.ref)).toEqual(['gita:1:3', 'gita:1:4']);
  });
  it('stops when the verse order is exhausted', () => {
    expect(planAutoFill(new Date('2026-09-09T23:30:00Z'), [], ['gita:1:1'], noState, cfg)).toHaveLength(1);
  });
});

describe('duePosts', () => {
  it('returns scheduled posts whose time has come, ordered by time, and failed ones under the retry cap', () => {
    const items = [
      I('late', 'gita:1:1', '2026-09-10T01:35:00.000Z'),
      I('early', 'gita:1:2', '2026-09-10T01:30:00.000Z', { youtube: P('2026-09-10T01:30:00.000Z', 'published'), facebook: P('2026-09-10T01:30:00.000Z', 'failed', { attempts: 1 }) }),
      I('capped', 'gita:1:3', '2026-09-10T01:00:00.000Z', { instagram: P('2026-09-10T01:00:00.000Z', 'failed', { attempts: 3 }), facebook: P('2026-09-10T01:00:00.000Z', 'skipped'), youtube: P(null) }),
      I('future', 'gita:1:4', '2026-09-11T01:30:00.000Z'),
    ];
    expect(duePosts(new Date('2026-09-10T01:40:00Z'), items)).toEqual([
      { itemId: 'early', platform: 'instagram' }, { itemId: 'early', platform: 'facebook' },
      { itemId: 'late', platform: 'instagram' }, { itemId: 'late', platform: 'facebook' }, { itemId: 'late', platform: 'youtube' },
    ]);
  });
});

describe('applyPublishResult', () => {
  const base = P('2026-09-10T01:30:00.000Z');
  it('success → published with id + publishedAt, error cleared', () => {
    expect(applyPublishResult({ ...base, error: 'old' }, { ok: true, id: 'v1' }, '2026-09-10T02:00:00.000Z'))
      .toEqual({ ...base, status: 'published', id: 'v1', publishedAt: '2026-09-10T02:00:00.000Z' });
  });
  it('failure → failed with attempts+1 and the error', () => {
    expect(applyPublishResult(base, { ok: false, error: 'boom' }, 'x')).toEqual({ ...base, status: 'failed', attempts: 1, error: 'boom' });
    expect(applyPublishResult({ ...base, status: 'failed', attempts: 2 }, { ok: false, error: 'again' }, 'x').attempts).toBe(3);
  });
  it('skipped → skipped with the reason, attempts untouched', () => {
    expect(applyPublishResult(base, { skipped: 'missing secrets: FB_PAGE_ID' }, 'x')).toEqual({ ...base, status: 'skipped', error: 'missing secrets: FB_PAGE_ID' });
  });
});

describe('prefill', () => {
  const verse = { book: 'gita', ref: 'gita:2:47', chapter: 2, verse: 47, sanskrit: ['कर्मण्येवाधिकारस्ते'], hindi: 'तुम्हारा अधिकार कर्म पर है। फल पर नहीं।', english: 'You have a right to work. Never to its fruits.', attribution: { hindi: 'h', english: 'e' } };
  const cinema: ReelProps = { verse, timings: {} as ReelProps['timings'], format: 'cinema', cinema: { kicker: 'GITA 2.47', beats: ['Do the work.', 'Release the outcome.'], timings: {} as never }, audio: { introFile: null, meaningFile: null }, media: { background: null, music: null }, brand: { handle: '@h' } };
  const classic: ReelProps = { ...cinema, format: undefined, cinema: undefined };
  const custom: ReelProps = { ...cinema, verse: { ...verse, book: 'custom', ref: 'custom:x-1', chapter: 0, verse: 0, sanskrit: ['Meera Bai'] }, cinema: { ...cinema.cinema!, kicker: 'k', closing: { line: 'Meera Bai', reference: '' } } };

  it('hookFor per format', () => {
    expect(hookFor(cinema)).toBe('Do the work.');
    expect(hookFor(classic)).toBe('तुम्हारा अधिकार कर्म पर है।');
    expect(hookFor(custom)).toBe('Do the work.');
  });
  it('prefillPosts: times from the config, captions per format, facebook mirrors instagram', () => {
    const posts = prefillPosts(cinema, ['credit A'], '2026-09-12', cfg);
    expect(posts.instagram.at).toBe('2026-09-12T01:30:00.000Z');
    expect(posts.facebook.at).toBe('2026-09-12T01:35:00.000Z');
    expect(posts.youtube.at).toBe('2026-09-12T01:40:00.000Z');
    expect(posts.youtube.title).toBe('Do the work. | Bhagavad Gita 2.47 #Shorts');
    expect(posts.youtube.caption).toContain('credit A');
    expect(posts.facebook.caption).toBe(posts.instagram.caption);
    expect(Object.values(posts).every((p) => p.status === 'scheduled')).toBe(true);
    expect(prefillPosts(classic, [], '2026-09-12', cfg).youtube.title).toBe('गीता ज्ञान | अध्याय 2 श्लोक 47 | Bhagavad Gita #Shorts');
    expect(prefillPosts(custom, [], '2026-09-12', cfg).youtube.title).toBe('Do the work. | Meera Bai #Shorts');
  });
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `pipeline/schedule-plan.ts`:**
```ts
import { MAX_ATTEMPTS, PLATFORMS, addDays, localDateOf, localToIso, isoToLocal, type Platform, type PostRecord, type ScheduleConfig, type ScheduleItem } from '../shared/schedule.ts';
import type { StateFile } from './select.ts';
import type { ReelProps } from '../shared/types.ts';
import type { Manifest } from '../scripts/fetch-assets.ts';
import { cinemaInstagramCaption, cinemaYoutubeDescription, cinemaYoutubeTitle, customInstagramCaption, customYoutubeDescription, customYoutubeTitle, instagramCaption, youtubeDescription, youtubeTitle } from '../post/captions.ts';

const earliestTime = (cfg: ScheduleConfig) => [...PLATFORMS].map((p) => cfg.defaultTimes[p]).sort()[0];

export function planAutoFill(now: Date, items: ScheduleItem[], order: string[], state: StateFile, cfg: ScheduleConfig) {
  const today = localDateOf(now, cfg.timezone);
  const first = Date.parse(localToIso(today, earliestTime(cfg), cfg.timezone)) > now.getTime() ? today : addDays(today, 1);
  const covered = new Set<string>();
  for (const it of items) for (const p of PLATFORMS) { const at = it.posts[p].at; if (at) covered.add(isoToLocal(at, cfg.timezone).date); }
  const used = new Set<string>([...items.map((i) => i.ref), ...state.posted.map((e) => e.ref)]);
  const plan: { ref: string; date: string }[] = [];
  for (let i = 0; i < cfg.daysAhead; i++) {
    const date = addDays(first, i);
    if (covered.has(date)) continue;
    const ref = order.find((r) => !used.has(r));
    if (!ref) break;
    used.add(ref);
    plan.push({ ref, date });
  }
  return plan;
}

export function duePosts(now: Date, items: ScheduleItem[]): { itemId: string; platform: Platform }[] {
  const due: { itemId: string; platform: Platform; at: number }[] = [];
  for (const it of items) for (const p of PLATFORMS) {
    const post = it.posts[p];
    if (!post.at || Date.parse(post.at) > now.getTime()) continue;
    const retry = post.status === 'failed' && (post.attempts ?? 0) < MAX_ATTEMPTS;
    if (post.status === 'scheduled' || retry) due.push({ itemId: it.id, platform: p, at: Date.parse(post.at) });
  }
  return due.sort((a, b) => a.at - b.at).map(({ itemId, platform }) => ({ itemId, platform }));
}

export type PublishResult = { ok: true; id: string } | { ok: false; error: string } | { skipped: string };

export function applyPublishResult(post: PostRecord, result: PublishResult, at: string): PostRecord {
  if ('skipped' in result) return { ...post, status: 'skipped', error: result.skipped };
  if (result.ok) { const { error: _dropped, ...rest } = post; void _dropped; return { ...rest, status: 'published', id: result.id, publishedAt: at }; }
  return { ...post, status: 'failed', attempts: (post.attempts ?? 0) + 1, error: result.error };
}

const isCustom = (props: ReelProps) => props.verse.book === 'custom';
const attributionOf = (props: ReelProps) => props.cinema?.closing?.line ?? props.verse.sanskrit[0] ?? '';

export function hookFor(props: ReelProps): string {
  if (props.cinema) return props.cinema.beats[0] ?? '';
  return props.verse.hindi.split('।')[0] + '।';
}

export function creditsFor(props: ReelProps, manifest: Manifest): string[] {
  const base = (rel: string | null) => rel?.split('/').pop() ?? '';
  return [
    [...manifest.backgrounds, ...manifest.images].find((e) => e.file === base(props.media.background))?.credit,
    manifest.music.find((e) => e.file === base(props.media.music))?.credit,
  ].filter((c): c is string => Boolean(c));
}

export function prefillPosts(props: ReelProps, credits: string[], date: string, cfg: ScheduleConfig): Record<Platform, PostRecord> {
  const v = props.verse;
  const beats = props.cinema?.beats ?? [];
  let title: string, description: string, caption: string;
  if (props.cinema && isCustom(props)) {
    title = customYoutubeTitle(beats[0] ?? '', attributionOf(props)); description = customYoutubeDescription(beats, attributionOf(props)); caption = customInstagramCaption(beats, attributionOf(props));
  } else if (props.cinema) {
    title = cinemaYoutubeTitle(v, beats[0] ?? ''); description = cinemaYoutubeDescription(v, beats); caption = cinemaInstagramCaption(v, beats);
  } else {
    title = youtubeTitle(v); description = youtubeDescription(v); caption = instagramCaption(v);
  }
  if (credits.length) description = `${description}\n\n${credits.join('\n')}`;
  const at = (p: Platform) => localToIso(date, cfg.defaultTimes[p], cfg.timezone);
  return {
    instagram: { at: at('instagram'), status: 'scheduled', caption },
    facebook: { at: at('facebook'), status: 'scheduled', caption },
    youtube: { at: at('youtube'), status: 'scheduled', caption: description, title },
  };
}
```
(`Manifest`'s `AssetEntry` has an optional `credit` — check `scripts/fetch-assets.ts`; if `images` entries lack `credit` in the type, narrow with `'credit' in e`.) At publish time the YouTube description is `post.caption` verbatim — credits are already inside it, so the publisher passes `credits: []` to `postYoutube`.
- [ ] **Step 4: PASS + typechecks; commit** — `git add pipeline/schedule-plan.ts pipeline/schedule-plan.test.ts && git commit -m "feat: calendar planners — auto-fill, due posts, result transitions, caption prefill"`

---

### Task 3: Facebook Reels (`post/facebook.ts`) + SETUP section

**Files:**
- Create: `post/facebook.ts`, `post/facebook.test.ts`
- Modify: `SETUP.md` (new section "3b. Facebook Page → Reels token", after §3)

**Interfaces:**
- Produces:
  ```ts
  export const FB_GRAPH = 'https://graph.facebook.com/v23.0';
  export const FB_UPLOAD = 'https://rupload.facebook.com/video-upload/v23.0';
  export type FacebookEnv = { pageId: string; accessToken: string };
  export function facebookStartParams(token: string): URLSearchParams;                        // upload_phase=start
  export function facebookUploadHeaders(token: string, fileUrl: string): Record<string, string>; // Authorization: OAuth <token>, file_url
  export function facebookFinishParams(caption: string, videoId: string, token: string): URLSearchParams; // upload_phase=finish, video_id, video_state=PUBLISHED, description
  export type FacebookDeps = { fetch: typeof fetch; sleep: (ms: number) => Promise<void> };
  export async function postFacebook(videoUrl: string, env: FacebookEnv, caption: string, deps?: Partial<FacebookDeps>): Promise<string>;  // resolves to the video id
  ```
- Flow (Meta "Reels Publishing API" for Pages): `POST ${FB_GRAPH}/${pageId}/video_reels` with `facebookStartParams` → `{ video_id, upload_url }`; `POST ${FB_UPLOAD}/${video_id}` with `facebookUploadHeaders(token, videoUrl)` and an empty body → `{ success: true }`; `POST ${FB_GRAPH}/${pageId}/video_reels` with `facebookFinishParams` → `{ success: true }`; then poll `GET ${FB_GRAPH}/${video_id}?fields=status&access_token=…` every 10 s up to 30 times until `status.video_status === 'ready'` (or `status.publishing_phase.status === 'complete'`); `'error'` → throw with the body.

- [ ] **Step 1: Failing tests** (`post/facebook.test.ts`):
```ts
import { describe, it, expect } from 'vitest';
import { FB_GRAPH, FB_UPLOAD, facebookFinishParams, facebookStartParams, facebookUploadHeaders, postFacebook } from './facebook.ts';

describe('facebook reels param builders', () => {
  it('start / upload / finish', () => {
    expect(facebookStartParams('T').get('upload_phase')).toBe('start');
    expect(facebookStartParams('T').get('access_token')).toBe('T');
    expect(facebookUploadHeaders('T', 'https://x/reel.mp4')).toEqual({ Authorization: 'OAuth T', file_url: 'https://x/reel.mp4' });
    const f = facebookFinishParams('hello', 'V1', 'T');
    expect(f.get('upload_phase')).toBe('finish');
    expect(f.get('video_id')).toBe('V1');
    expect(f.get('video_state')).toBe('PUBLISHED');
    expect(f.get('description')).toBe('hello');
    expect(f.get('access_token')).toBe('T');
  });
});

function fakeFetch(script: Array<{ match: RegExp; body: unknown; status?: number }>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const step = script.find((s) => s.match.test(url));
    if (!step) throw new Error(`unexpected fetch ${url}`);
    return new Response(JSON.stringify(step.body), { status: step.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

describe('postFacebook', () => {
  const env = { pageId: 'PAGE', accessToken: 'T' };
  it('runs start → upload → finish → status ready and returns the video id', async () => {
    const { fetch, calls } = fakeFetch([
      { match: /\/PAGE\/video_reels$/, body: { video_id: 'V1', upload_url: 'u' } },
      { match: /rupload\.facebook\.com\/video-upload\/v23\.0\/V1$/, body: { success: true } },
      { match: /\/V1\?fields=status/, body: { status: { video_status: 'ready' } } },
    ]);
    const id = await postFacebook('https://x/reel.mp4', env, 'cap', { fetch, sleep: async () => {} });
    expect(id).toBe('V1');
    expect(calls[0].url).toBe(`${FB_GRAPH}/PAGE/video_reels`);
    expect(String(calls[0].init?.body)).toContain('upload_phase=start');
    expect(calls[1].url).toBe(`${FB_UPLOAD}/V1`);
    expect((calls[1].init?.headers as Record<string, string>).file_url).toBe('https://x/reel.mp4');
    expect(String(calls[2].init?.body)).toContain('upload_phase=finish');
    expect(String(calls[2].init?.body)).toContain('video_state=PUBLISHED');
    expect(calls[3].url).toContain('/V1?fields=status');
  });
  it('throws on an API error and on a processing error', async () => {
    const bad = fakeFetch([{ match: /video_reels$/, body: { error: { message: 'nope' } }, status: 400 }]);
    await expect(postFacebook('https://x/r.mp4', env, 'c', { fetch: bad.fetch, sleep: async () => {} })).rejects.toThrow(/400/);
    const err = fakeFetch([
      { match: /\/PAGE\/video_reels$/, body: { video_id: 'V1' } },
      { match: /rupload/, body: { success: true } },
      { match: /fields=status/, body: { status: { video_status: 'error', processing_phase: { error: 'bad file' } } } },
    ]);
    await expect(postFacebook('https://x/r.mp4', env, 'c', { fetch: err.fetch, sleep: async () => {} })).rejects.toThrow(/error/);
  });
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `post/facebook.ts`** (mirror `post/instagram.ts`'s style: `fbFetch` throws `Facebook API <status>: <body>`; `postFacebook` polls with the injected `sleep`, default `setTimeout` from `node:timers/promises`; start and finish both POST `${FB_GRAPH}/${pageId}/video_reels` with `URLSearchParams` bodies; the upload POST sends the headers from `facebookUploadHeaders` and no body). `access_token` never appears in thrown messages (strip it from URLs before including them).
- [ ] **Step 4: `SETUP.md` §3b** — "Facebook Page → Reels token": prerequisites (a Facebook Page; the same Meta app from §3 with the **Facebook Login for Business** product added); permissions `pages_manage_posts`, `pages_read_engagement`, `publish_video`; how to get a **long-lived user token** (Graph API Explorer → generate user token with those permissions → exchange via `GET /oauth/access_token?grant_type=fb_exchange_token&client_id=…&client_secret=…&fb_exchange_token=…`), then the **Page token** from `GET /me/accounts` (page tokens derived from a long-lived user token do not expire — state this and that no refresh workflow is needed); where the Page ID is; **Secrets produced:** `FB_PAGE_ID`, `FB_PAGE_ACCESS_TOKEN` set with `gh secret set`. Keep the numbered-step voice of §3.
- [ ] **Step 5: PASS + typechecks; commit** — `git add post/facebook.ts post/facebook.test.ts SETUP.md && git commit -m "feat: facebook reels publishing module"`

---

### Task 4: The publisher orchestrator (`pipeline/publisher.ts`, `pipeline/schedule-io.ts`) + config

**Files:**
- Create: `pipeline/publisher.ts`, `pipeline/publisher.test.ts`, `pipeline/schedule-io.ts`, `pipeline/schedule-io.test.ts`, `schedule.json` (`{ "items": [] }`), `public/thumbs/.gitkeep`
- Modify: `config.json`, `pipeline/select.ts` (+test), `pipeline/run.ts`

**Interfaces:**
- Consumes: Tasks 1–3; `publishReleaseAsset`/`releaseTag` (`pipeline/release.ts`); `readState`/`writeState`/`recordPost`/`verseOrder` (`pipeline/select.ts`); `postYoutube`, `postInstagram`, `postFacebook`; `readManifest` (`scripts/fetch-assets.ts`); `placeholderVerse` (`shared/custom-quotes.ts`); `loadStylePreset` is NOT needed (the CLI render reads the preset itself).
- Produces:
  - `pipeline/select.ts`: `PlatformKey = 'youtube' | 'instagram' | 'facebook'`; `PostedEntry` gains `facebook?: { id: string; at: string }`.
  - `pipeline/schedule-io.ts`:
    ```ts
    export async function readSchedule(path: string): Promise<ScheduleFile>;          // ENOENT → { items: [] }; malformed → throws (validateScheduleFile)
    export async function writeSchedule(path: string, file: ScheduleFile): Promise<void>;   // tmp + rename, 2-space + newline
    export async function thumbnail(videoPath: string, outPath: string): Promise<void>;     // ffmpeg-static: -ss 1.5 -frames:v 1 -vf scale=200:-2, mkdir -p
    export async function downloadAsset(url: string, dest: string): Promise<void>;        // fetch → file (follows redirects); throws on !ok
    export function parseDotenv(text: string): Record<string, string>;                     // KEY=VALUE, quotes, comments, blank lines
    export function loadDotenv(path: string, env: NodeJS.ProcessEnv): void;                // sets keys that are not already set
    export function resolveVerse(ref: string, sources: { verses: Verse[] }, quotes: CustomQuote[]): Verse;  // throws when unknown
    export function secretsFor(platform: Platform, env: NodeJS.ProcessEnv): { ok: true } | { ok: false; missing: string[] };
    ```
    Secret keys: youtube `YT_CLIENT_ID YT_CLIENT_SECRET YT_REFRESH_TOKEN`; instagram `IG_USER_ID IG_ACCESS_TOKEN`; facebook `FB_PAGE_ID FB_PAGE_ACCESS_TOKEN`.
  - `pipeline/publisher.ts` (all exported for tests; `main()` guarded by `process.argv[1]?.endsWith('publisher.ts')`):
    ```ts
    export type PublisherArgs = { autoFill: boolean; publishDue: boolean; add?: { ref: string; date: string; format?: 'classic' | 'cinema'; fromLastRender: boolean }; rerender?: string; publishItem?: { id: string; platform: Platform }; dryRun: boolean; now: Date; days?: number };
    export function parsePublisherArgs(argv: string[], now?: Date): PublisherArgs;   // no subcommand flag → autoFill + publishDue
    export type Io = { root: string; env: NodeJS.ProcessEnv; log: (line: string) => void; run: (cmd: string, args: string[]) => Promise<void>; release: (ref: string, file: string) => Promise<string>; thumb: typeof thumbnail; download: typeof downloadAsset; post: { youtube: typeof postYoutube; instagram: typeof postInstagram; facebook: typeof postFacebook } };
    export function defaultIo(root: string): Io;
    export async function renderRow(ref: string, date: string, format: 'classic' | 'cinema', io: Io, opts: { fromLastRender?: boolean; existing?: ScheduleItem }): Promise<ScheduleItem>;
    export async function runAutoFill(args: PublisherArgs, io: Io): Promise<void>;
    export async function runPublishDue(args: PublisherArgs, io: Io): Promise<void>;
    export async function runPublishOne(itemId: string, platform: Platform, args: PublisherArgs, io: Io): Promise<void>;
    export async function main(argv: string[]): Promise<void>;
    ```
- CLI: `npx tsx pipeline/publisher.ts [--auto-fill] [--publish-due] [--add <ref> --date YYYY-MM-DD [--format f] [--from-last-render]] [--rerender <itemId>] [--publish-item <id> --platform <p>] [--dry-run] [--now <iso>] [--days <n>]`.

- [ ] **Step 1: Failing tests.** `pipeline/select.test.ts` (append): `recordPost(state, 'gita:1:1', 'facebook', 'f1', 't')` stores `facebook`, and `pickNext` treats `facebook` in `platforms` like the others. `pipeline/schedule-io.test.ts`: `parseDotenv` (`A=1\n# c\nB="two words"\nC='x'\n\nD=e=f` → `{A:'1',B:'two words',C:'x',D:'e=f'}`); `loadDotenv` does not override existing keys; `secretsFor('facebook', {})` → `{ ok: false, missing: ['FB_PAGE_ID', 'FB_PAGE_ACCESS_TOKEN'] }`; `readSchedule` on a tmp dir: ENOENT → `{ items: [] }`, malformed JSON → throws, `writeSchedule` round-trips with a trailing newline; `resolveVerse('custom:abc', sources, [quote])` → placeholder verse, unknown → throws. `pipeline/publisher.test.ts` with a fake `Io` (in-memory `root` = a tmp dir containing `config.json`, `sources/gita.json` (3 verses), `schedule.json`, `state.json`, `out/`; `run` writes a fake `out/props.json` + touches `out/reel.mp4`; `release` returns `https://example.com/${ref}.mp4`; `thumb` touches the file; `post.*` return ids or throw per test):
```ts
  it('parsePublisherArgs: defaults to auto-fill + publish-due; parses subcommands; rejects bad refs/dates', …);
  it('runAutoFill renders one row per planned day, writes schedule.json after each row, keeps going after a failed render', …);   // 2 of 3 rows written when the 2nd render throws; the 3rd still renders
  it('runAutoFill --dry-run still renders and schedules (spec: renders + schedules, no publishing)', …);
  it('runPublishDue publishes due posts in order, writes state.json for each success, marks failures with attempts, skips with reason when secrets are missing, and never touches future posts', …);
  it('runPublishDue --dry-run logs "would publish" and changes nothing', …);
  it('--add --from-last-render reuses out/props.json when its verse.ref matches, otherwise renders', …);
  it('--rerender keeps posts, updates renderedAt/asset/thumbnail', …);
  it('a custom ref renders in cinema format and is never auto-filled', …);
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.** `select.ts`: extend the union/type. `run.ts`: in the posting loop, `if (platform === 'facebook') throw new Error('facebook posting runs from the calendar publisher (config.mode "calendar"), not the daily pipeline')` before the youtube/instagram branch. `schedule-io.ts` per the interface (ffmpeg via `execa(ffmpegPath, ['-y', '-ss', '1.5', '-i', videoPath, '-frames:v', '1', '-vf', 'scale=200:-2', outPath])`). `publisher.ts`:
  - `renderRow`: unless `fromLastRender && out/props.json exists && props.verse.ref === ref`, `io.run('npm', ['run', 'generate', '--', '--verse', ref, '--format', format, '--dry-run'])`; read `out/props.json`; `hook = hookFor(props)`; `credits = creditsFor(props, readManifest())`; `id = existing?.id ?? itemSlug(ref, date, rand4())`; `url = env.SCHEDULE_SKIP_RELEASE ? '' : await io.release(ref, 'out/reel.mp4')`; `await io.thumb('out/reel.mp4', 'public/thumbs/<id>.jpg')`; posts = `existing?.posts ?? prefillPosts(props, credits, date, cfg)`; return the item (`renderedAt = args.now.toISOString()`).
  - `runAutoFill`: config (`validateScheduleConfig(config.schedule)`), `order = verseOrder(sources.verses, config.startRef)`, `format = config.format ?? 'classic'`; `plan = planAutoFill(now, items, order, state, cfg)` limited to `args.days` when given; for each: try `renderRow` → push → `writeSchedule`; catch → `io.log('✖ auto-fill <ref>: <msg>')` and continue.
  - `runPublishDue`: reload schedule; for each `duePosts(now, items)`: `secretsFor` → skipped; else if `dryRun` → log; else call the platform (youtube: `io.download(asset.url, tmp)` then `postYoutube(verse, tmp, env, [], { title: post.title ?? '', description: post.caption })`; instagram: `postInstagram(verse, asset.url, env, post.caption)`; facebook: `postFacebook(asset.url, env, post.caption)`); `asset.url === ''` → `{ ok: false, error: 'no asset url (rendered with SCHEDULE_SKIP_RELEASE)' }`; apply `applyPublishResult`; `writeSchedule` after each; on success also `recordPost` + `writeState`. Log one line per post: `✔ <id> <platform> <postId>` / `✖ …` / `↷ skipped …`.
  - `main`: `loadDotenv('.env', process.env)`; `parsePublisherArgs`; run in order add → rerender → publishItem → autoFill → publishDue; exit 1 only if a requested add/rerender/publishItem failed (auto-fill/publish failures are recorded in the files, and the workflow's commit step must still run).
  - `config.json`: add `"mode": "calendar"` and the `schedule` block; keep the rest.
- [ ] **Step 4: Local verification** (never publishes): `export PATH="$HOME/.local/bin:$PATH"` (edge-tts, for classic), then `SCHEDULE_SKIP_RELEASE=1 npx tsx pipeline/publisher.ts --auto-fill --days 1 --dry-run --now 2026-09-10T02:00:00Z` (detached + poll; one real render ≈2–3 min) → `schedule.json` has one item dated 2026-09-11 IST slots, `public/thumbs/<id>.jpg` exists (Read it: a real frame ≈200 px wide), captions prefilled; then `npx tsx pipeline/publisher.ts --publish-due --dry-run --now 2026-09-11T03:00:00Z` → three "would publish" lines, files unchanged; then `npx tsx pipeline/publisher.ts --publish-due --now 2026-09-11T03:00:00Z` with NO secrets in env → all three posts `skipped` with `missing secrets: …`, `state.json` untouched. Restore: `git checkout -- schedule.json state.json && git clean -f public/thumbs`.
- [ ] **Step 5: PASS + typechecks; commit** — `git add pipeline/publisher.ts pipeline/publisher.test.ts pipeline/schedule-io.ts pipeline/schedule-io.test.ts pipeline/select.ts pipeline/select.test.ts pipeline/run.ts config.json schedule.json public/thumbs/.gitkeep && git commit -m "feat: calendar publisher — auto-fill, due publishing, add/rerender, facebook + state compat"`

---

### Task 5: Workflows + automation docs

**Files:**
- Create: `.github/workflows/publisher.yml`
- Modify: `.github/workflows/daily.yml`, `README.md` ("How it works" + a new "Publishing calendar (automation)" paragraph)

- [ ] **Step 1: `publisher.yml`** — copy `daily.yml`'s job skeleton (arm64 runner, edge-tts, assets cache keyed on the manifest, `npm ci`, `npm run assets`, `npx remotion browser ensure`), with: `name: publisher`; `on.schedule: - cron: '0 * * * *'`; `workflow_dispatch.inputs.dry_run` (boolean, "Render + schedule only — publish nothing"); `concurrency: { group: publisher, cancel-in-progress: false }`; `permissions: contents: write`; the run step env adds `FB_PAGE_ID`, `FB_PAGE_ACCESS_TOKEN` and `GH_TOKEN: ${{ github.token }}`, `REMOTION_CONCURRENCY: '2'`, and runs `FLAGS=""; [ "$DRY_RUN" = "true" ] && FLAGS="--dry-run"; npx tsx pipeline/publisher.ts $FLAGS`; the always-run commit step adds `schedule.json state.json public/thumbs` with message `chore: calendar run [skip ci]` and the same pull --rebase/push dance; the artifact step uploads `out/reel.mp4` if present.
- [ ] **Step 2: `daily.yml` guard** — add a step before "Generate and post": `- id: mode\n  run: echo "mode=$(node -p "require('./config.json').mode || 'daily'")" >> "$GITHUB_OUTPUT"` and put `if: steps.mode.outputs.mode != 'calendar'` on the generate step, plus a step that echoes `calendar mode — daily-reel is idle; publisher.yml owns posting` when skipped. (Keep the artifact/commit steps; they are harmless no-ops.)
- [ ] **Step 3: README** — replace the "How it works" diagram's first line with the calendar flow (`publisher (hourly) → auto-fill upcoming days (render + release + thumbnail + captions) → publish what is due → commit schedule.json`), keep the daily-mode description as the `mode: 'daily'` fallback, document `config.json.schedule`, `SCHEDULE_SKIP_RELEASE`, the `publisher.yml` `dry_run` input, and that the workflow stays disabled until go-live (`gh workflow enable publisher`).
- [ ] **Step 4: Validate the YAML** — `node -e "const y=require('yaml')"` is not available; instead run `npx --yes yaml-lint .github/workflows/publisher.yml .github/workflows/daily.yml` (or `python3 -c 'import yaml,sys; [yaml.safe_load(open(f)) for f in sys.argv[1:]]' …` if PyYAML exists) and read both files once more against `daily.yml`'s known-good structure. `npm test` + typechecks green.
- [ ] **Step 5: Commit** — `git add .github/workflows/publisher.yml .github/workflows/daily.yml README.md && git commit -m "feat: hourly publisher workflow with calendar-mode guard on daily-reel"`

---

### Task 6: Dashboard backend + calendar APIs

**Files:**
- Modify: `shared/media-path.ts` (+test), `dashboard/lib/backend.ts`, `dashboard/lib/local-backend.ts`
- Create: `dashboard/app/api/calendar/route.ts` (GET), `dashboard/app/api/calendar/items/route.ts` (POST add → stream), `dashboard/app/api/calendar/items/[id]/route.ts` (DELETE; POST rerender → stream), `dashboard/app/api/calendar/items/[id]/[platform]/route.ts` (PATCH post), `dashboard/app/api/calendar/publish/route.ts` (POST publish-now → stream)

**Interfaces:**
- Produces on `Backend`:
  ```ts
  export type CalendarView = { items: ScheduleItem[]; config: ScheduleConfig; secrets: Record<Platform, boolean>; mode: 'daily' | 'calendar' };
  getCalendar(): Promise<CalendarView>;                 // readSchedule (throws → route 500 with the message: the file is the source of truth), sorted; secrets via secretsFor(loadDotenv('.env') + process.env)
  updatePost(id: string, platform: Platform, patch: { at?: string | null; caption?: string; title?: string; status?: 'scheduled' | 'skipped' }): Promise<ScheduleItem>;   // queue; validates (ISO/null, caption ≤2200, title ≤100, status only from failed|skipped|scheduled|draft → scheduled (resets attempts + error) or scheduled|draft → skipped); published posts are immutable except caption/title → throws 'published posts cannot be edited'
  deleteItem(id: string): Promise<void>;                // throws 'has published posts' when any post is published; removes public/thumbs/<id>.jpg
  calendarCommand(args: string[]): ReadableStream<Uint8Array> | 'locked';   // spawns `npx tsx pipeline/publisher.ts …` exactly like generateStream (lock, detached group, SIGINT cancel, PATH += ~/.local/bin, EXIT <code> trailer); args are validated by the caller
  ```
- Routes: `GET /api/calendar`; `POST /api/calendar/items { ref, date, format?, fromLastRender? }` → validates `REF_PATTERN`, `YYYY-MM-DD`, format → `calendarCommand(['--add', ref, '--date', date, ...])` stream or 409 locked; `POST /api/calendar/items/[id]` `{ action: 'rerender' }` → `calendarCommand(['--rerender', id])`; `DELETE /api/calendar/items/[id]` → `{ ok: true }` / 409 `{ error }`; `PATCH /api/calendar/items/[id]/[platform]` body = patch → the updated item; `POST /api/calendar/publish { id, platform }` → 400 unless `secrets[platform]` locally, else `calendarCommand(['--publish-item', id, '--platform', platform])` stream. `id` must match `ITEM_ID`, `platform` must be in `PLATFORMS`. Origin guard first on every mutating handler.
- `shared/media-path.ts`: `ALLOWED_MEDIA` += `'public/thumbs/'` (+ test "allows a thumbnail under public/thumbs"). `sync()` pathspec += `'schedule.json', 'public/thumbs'`; message `chore: sync dashboard edits (backgrounds, style, beats, quotes, calendar)`.

- [ ] **Step 1: Implement** following `local-backend.ts`'s patterns (`readJson`, `queue`, the `generateStream` spawn/lock/cancel code — factor the spawn into a shared `spawnStream(args: string[])` used by both `generateStream` and `calendarCommand` so the lock/cancel logic exists once).
- [ ] **Step 2: Curl verification** (server detached; kill after): `GET /api/calendar` → `{ items: [], config: {...IST...}, secrets: { instagram: false, facebook: false, youtube: false }, mode: 'calendar' }`; `POST /api/calendar/items {"ref":"gita:2:47","date":"2026-09-20","format":"cinema"}` with `SCHEDULE_SKIP_RELEASE=1` exported in the server's env → streams a render to `EXIT 0`, then `GET /api/calendar` shows the row with three scheduled posts at 01:30/01:35/01:40Z and `GET /api/media/public/thumbs/<id>.jpg` → 200 image; `PATCH …/<id>/youtube {"at":"2026-09-20T03:00:00.000Z","title":"Custom title"}` → updated; `{"status":"skipped"}` → skipped; `{"status":"scheduled"}` → scheduled with attempts 0; `{"caption":"x".repeat(2201)}` → 400; `POST /api/calendar/publish {"id":…,"platform":"youtube"}` → 400 (no local secrets); `DELETE …/<id>` → `{ ok: true }` and the thumb is gone; origin guard: `-H 'Origin: https://evil.example'` on PATCH → 403. Restore `schedule.json` (`git checkout`) and `public/thumbs`.
- [ ] **Step 3: Root tests + both typechecks green; commit** — `git add shared/media-path.ts shared/media-path.test.ts dashboard && git commit -m "feat: calendar APIs behind the seam — list, edit posts, add, rerender, publish now"`

---

### Task 7: `/calendar` page, Studio "Add to calendar", navigation

**Files:**
- Create: `dashboard/app/calendar/page.tsx`, `dashboard/app/components/calendar/CalendarTable.tsx`, `dashboard/app/components/calendar/PostDrawer.tsx`, `dashboard/app/components/calendar/AddToCalendar.tsx`
- Modify: `dashboard/app/studio/page.tsx` (Render section), `dashboard/app/page.tsx` (nav link "Calendar →"), `dashboard/app/components/StatusBar.tsx` (chip "next scheduled" from `/api/calendar` when mode is calendar)

**Interfaces:**
- Consumes Task 6 routes; `isoToLocal`/`localToIso`/`sortItems`/`PLATFORMS` from `shared/schedule.ts` (browser-safe); `REF_PATTERN` from `shared/custom-quotes.ts`.

- [ ] **Step 1: `/calendar` page** ('use client'; header like Studio's with "← Control room" / "Studio →"; loads `GET /api/calendar`; shows `mode` badge; `CalendarTable rows`): one row per item — thumbnail (`/api/media/public/thumbs/<id>.jpg`, 40 px wide), hook + `ref` + format + `renderedAt` (local tz); three platform cells each with: `<input type="datetime-local" aria-label="<platform> time <id>">` whose value is `isoToLocal(at, tz)` joined as `YYYY-MM-DDTHH:mm` and whose change → `PATCH { at: localToIso(date, time, tz) }` (blur/Enter, optimistic + revert on error); a status badge (`data-status`) with `error` as its `title`; buttons **Edit** (opens `PostDrawer`), **Publish now** (`disabled` unless `secrets[platform]`, `title` "publishes from the cloud at its scheduled time" when disabled; runs the stream and shows the log inline), **Retry** (failed/skipped → `PATCH { status: 'scheduled' }`), **Skip** (scheduled → `{ status: 'skipped' }`); row actions **Re-render** (stream) and **Delete** (`window.confirm`; disabled when any post is published). `PostDrawer`: caption `<textarea maxLength={CAPTION_MAX}>` with a counter, title `<input maxLength={TITLE_MAX}>` for youtube only, Save → PATCH, Cancel. Empty state: "Nothing scheduled — the hourly publisher fills the next N days, or add a reel from Studio."
- [ ] **Step 2: `AddToCalendar`** (in Studio's Render section, shown when `done === true`): `<input type="date" aria-label="calendar date">` defaulting to `addDays(localDateOf(new Date(), tz), 1)`, button **Add to calendar** → `POST /api/calendar/items { ref, date, format: 'cinema', fromLastRender: true }`, streams the log (release upload + thumbnail take a few seconds), on `EXIT 0` shows "scheduled — open calendar" linking to `/calendar`. Home page gains `Calendar →`; StatusBar gains a "next scheduled" chip (earliest future `at` across items, in local tz) when `mode === 'calendar'`.
- [ ] **Step 3: Browser verification** (Playwright MCP; server detached with `SCHEDULE_SKIP_RELEASE=1`; kill after): `/calendar` empty state → Studio: render 2:47 is too slow for a browser session, so create a row via the API (`POST /api/calendar/items` with `fromLastRender: true` after one CLI dry-run of 2:47) → `/calendar` shows the row with a thumbnail and three badges `scheduled`; change the youtube time via the datetime input → reload → persisted; Edit → change caption → Save → reload → persisted; Skip → badge `skipped`; Retry → `scheduled`; Publish now is disabled with the tooltip; Delete → row gone. Then the Studio flow: with the same last render, click **Add to calendar** (date = tomorrow) → log ends in EXIT 0 → link to `/calendar` shows the new row. Restore files (`git checkout -- schedule.json; git clean -f public/thumbs`).
- [ ] **Step 4: Both typechecks + root suite; commit** — `git add dashboard && git commit -m "feat: calendar page with per-platform scheduling, post editing and publish-now; studio add-to-calendar"`

---

### Task 8: End-to-end proof + docs

**Files:**
- Modify: `README.md` (Dashboard → "Calendar" section), `SETUP.md` (§7 supervised first run rewritten for calendar mode; go-live = set secrets → `gh workflow enable publisher` → dispatch with `dry_run` → watch the first hour)

- [ ] **Step 1: E2E** — with `SCHEDULE_SKIP_RELEASE=1`: `npx tsx pipeline/publisher.ts --auto-fill --days 2 --dry-run --now 2026-09-10T02:00:00Z` (two renders, detached + poll) → `schedule.json` has two rows on consecutive days with prefilled captions and thumbnails; `npx tsx pipeline/publisher.ts --publish-due --now 2026-09-12T03:00:00Z` (no secrets) → six `skipped` posts with reasons, `state.json` untouched; `GET /api/calendar` (server up briefly) shows six `skipped` badges; Retry one via PATCH → `scheduled`. Restore `schedule.json`, `state.json`, `public/thumbs`.
- [ ] **Step 2: README "Calendar"** — what a row is, where thumbnails/assets live, per-platform times (stored UTC, shown in `config.schedule.timezone`), editing captions, Retry/Skip/Publish now (local secrets in `.env`: list the keys), Re-render/Delete rules, the Studio "Add to calendar" flow, how auto-fill picks verses (next unposted in order; custom quotes only by hand), retries ≤3 and `skipped` semantics, sync now includes `schedule.json` + `public/thumbs`.
- [ ] **Step 3: SETUP §7** — rewrite for calendar mode (secrets incl. `FB_*`; `gh workflow enable publisher`; first `workflow_dispatch` with `dry_run` to see rows appear; then let the hour tick; success gate 7 days across three platforms); note `daily-reel` is idle in calendar mode.
- [ ] **Step 4: All checks green; commit** — `git add README.md SETUP.md && git commit -m "docs: publishing calendar — dashboard, automation and go-live"`
- [ ] **Step 5: Hand off** — the controller disables the new workflow right after the first push (`gh workflow disable publisher`) and records it; the user's go-live steps stay in SETUP.md.
