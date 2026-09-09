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
  const target = Date.UTC(y, m - 1, d, h, mi); // the wall time, reinterpreted as if it were UTC (offset-0 guess)
  // Guess an instant, read the zone's wall clock at that guess, and re-derive the instant as
  // `target` minus the offset the zone showed. Stop once the guess stops moving — a real fixed
  // point — rather than once the raw reading matches `guess` exactly: for a fixed-offset zone
  // (e.g. Asia/Kolkata, +5:30 year-round) that reading is always `guess` shifted by the zone's
  // offset, so it never equals `guess` itself and a "diff to zero" check would keep "correcting"
  // forever. A second pass only changes the answer across a DST transition.
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const p = partsIn(new Date(guess), tz);
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
    const next = target - (asUtc - guess);
    if (next === guess) break;
    guess = next;
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
