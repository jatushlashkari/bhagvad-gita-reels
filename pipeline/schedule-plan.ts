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
