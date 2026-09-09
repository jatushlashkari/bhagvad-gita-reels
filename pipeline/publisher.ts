import { existsSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
import {
  ITEM_ID, PLATFORMS, isoToLocal, itemSlug, localDateOf, validateScheduleConfig,
  type Platform, type PostRecord, type ScheduleConfig, type ScheduleItem,
} from '../shared/schedule.ts';
import { applyPublishResult, creditsFor, duePosts, hookFor, planAutoFill, prefillPosts, type PublishResult } from './schedule-plan.ts';
import { downloadAsset, loadDotenv, readSchedule, resolveVerse, secretsFor, thumbnail, writeSchedule } from './schedule-io.ts';
import { publishReleaseAsset, releaseTag } from './release.ts';
import { readState, recordPost, verseOrder, writeState, type PlatformKey } from './select.ts';
import { postYoutube } from '../post/youtube.ts';
import { postInstagram } from '../post/instagram.ts';
import { postFacebook } from '../post/facebook.ts';
import { CUSTOM_REF_PREFIX, REF_PATTERN, type CustomQuote } from '../shared/custom-quotes.ts';
import type { Manifest } from '../scripts/fetch-assets.ts';
import type { ReelProps, Verse } from '../shared/types.ts';

/** The ONLY code that creates or mutates calendar rows with side effects: render a row,
 *  archive it, thumbnail it, prefill its captions, and publish what is due — writing
 *  schedule.json (and state.json) after every single result so an interrupted run can
 *  never double-post. Decisions live in schedule-plan.ts, side effects in schedule-io.ts. */

const YMD = /^\d{4}-\d{2}-\d{2}$/;

type Config = {
  handle: string;
  startRef: string;
  platforms: PlatformKey[];
  format?: 'classic' | 'cinema';
  mode?: 'daily' | 'calendar';
  schedule?: unknown;
};

export type PublisherArgs = {
  autoFill: boolean;
  publishDue: boolean;
  add?: { ref: string; date: string; format?: 'classic' | 'cinema'; fromLastRender: boolean };
  rerender?: string;
  publishItem?: { id: string; platform: Platform };
  dryRun: boolean;
  now: Date;
  days?: number;
};

const flagValue = (argv: string[], flag: string): string | undefined => {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
};

export function parsePublisherArgs(argv: string[], now: Date = new Date()): PublisherArgs {
  const dryRun = argv.includes('--dry-run');

  let at = now;
  if (argv.includes('--now')) {
    const raw = flagValue(argv, '--now');
    if (!raw || Number.isNaN(Date.parse(raw))) throw new Error(`--now must be an ISO instant, got: ${raw ?? '(none)'}`);
    at = new Date(raw);
  }

  let days: number | undefined;
  if (argv.includes('--days')) {
    const raw = flagValue(argv, '--days');
    const n = Number(raw);
    if (!raw || !Number.isInteger(n) || n < 1) throw new Error(`--days must be a positive integer, got: ${raw ?? '(none)'}`);
    days = n;
  }

  let format: 'classic' | 'cinema' | undefined;
  if (argv.includes('--format')) {
    const raw = flagValue(argv, '--format');
    if (raw !== 'classic' && raw !== 'cinema') throw new Error(`--format must be classic or cinema, got: ${raw ?? '(none)'}`);
    format = raw;
  }

  let add: PublisherArgs['add'];
  if (argv.includes('--add')) {
    const ref = flagValue(argv, '--add');
    if (!ref || !REF_PATTERN.test(ref)) throw new Error(`--add needs a ref like gita:2:47 or custom:<id>, got: ${ref ?? '(none)'}`);
    const date = flagValue(argv, '--date');
    if (!date || !YMD.test(date)) throw new Error(`--date must be YYYY-MM-DD, got: ${date ?? '(none)'}`);
    add = { ref, date, format, fromLastRender: argv.includes('--from-last-render') };
  }

  let rerender: string | undefined;
  if (argv.includes('--rerender')) {
    const id = flagValue(argv, '--rerender');
    if (!id || !ITEM_ID.test(id)) throw new Error(`--rerender needs a calendar item id, got: ${id ?? '(none)'}`);
    rerender = id;
  }

  let publishItem: { id: string; platform: Platform } | undefined;
  if (argv.includes('--publish-item')) {
    const id = flagValue(argv, '--publish-item');
    if (!id || !ITEM_ID.test(id)) throw new Error(`--publish-item needs a calendar item id, got: ${id ?? '(none)'}`);
    const platform = flagValue(argv, '--platform') as Platform | undefined;
    if (!platform || !PLATFORMS.includes(platform)) throw new Error(`--platform must be one of ${PLATFORMS.join(', ')}, got: ${platform ?? '(none)'}`);
    publishItem = { id, platform };
  }

  // The hourly workflow runs bare: no subcommand means "do the whole job".
  const explicit = Boolean(add || rerender || publishItem) || argv.includes('--auto-fill') || argv.includes('--publish-due');
  return {
    autoFill: argv.includes('--auto-fill') || !explicit,
    publishDue: argv.includes('--publish-due') || !explicit,
    add, rerender, publishItem, dryRun, now: at, days,
  };
}

export type Io = {
  root: string;
  env: NodeJS.ProcessEnv;
  log: (line: string) => void;
  run: (cmd: string, args: string[]) => Promise<void>;
  release: (ref: string, file: string) => Promise<string>;
  thumb: typeof thumbnail;
  download: typeof downloadAsset;
  post: { youtube: typeof postYoutube; instagram: typeof postInstagram; facebook: typeof postFacebook };
};

export function defaultIo(root: string): Io {
  return {
    root,
    env: process.env,
    log: (line) => console.log(line),
    run: async (cmd, args) => {
      await execa(cmd, args, { cwd: root, stdio: 'inherit' });
    },
    release: (ref, file) => publishReleaseAsset(ref, file),
    thumb: thumbnail,
    download: downloadAsset,
    post: { youtube: postYoutube, instagram: postInstagram, facebook: postFacebook },
  };
}

const at = (io: Io, rel: string) => join(io.root, rel);
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

// Every input is read relative to io.root (not the process cwd) so a test — or a future
// caller working on a checkout elsewhere — sees its own tree, manifest included.
const loadConfig = (io: Io): { config: Config; cfg: ScheduleConfig } => {
  const config = readJson<Config>(at(io, 'config.json'));
  return { config, cfg: validateScheduleConfig(config.schedule) };
};

function verseFor(io: Io, ref: string): Verse {
  const quotesPath = at(io, 'sources/custom-quotes.json');
  return resolveVerse(
    ref,
    readJson<{ verses: Verse[] }>(at(io, 'sources/gita.json')),
    existsSync(quotesPath) ? readJson<CustomQuote[]>(quotesPath) : [],
  );
}

const rand4 = () => Math.random().toString(36).slice(2, 6).padEnd(4, '0');

/** Renders one calendar row: video → release asset → thumbnail → prefilled posts.
 *  With `existing` (a re-render) the id and every hand-edited post survive. */
export async function renderRow(
  ref: string,
  date: string,
  format: 'classic' | 'cinema',
  io: Io,
  opts: { fromLastRender?: boolean; existing?: ScheduleItem; now?: Date },
): Promise<ScheduleItem> {
  const { cfg } = loadConfig(io);
  const propsPath = at(io, 'out/props.json');
  const reelPath = at(io, 'out/reel.mp4');
  // Custom quotes have no verse text to narrate — the render CLI only accepts them as cinema.
  const fmt = ref.startsWith(CUSTOM_REF_PREFIX) ? 'cinema' : format;

  const reusable = Boolean(opts.fromLastRender) && existsSync(propsPath) && readJson<ReelProps>(propsPath).verse.ref === ref;
  if (!reusable) await io.run('npm', ['run', 'generate', '--', '--verse', ref, '--format', fmt, '--dry-run']);

  const props = readJson<ReelProps>(propsPath);
  const credits = creditsFor(props, readJson<Manifest>(at(io, 'public/assets/manifest.json')));
  const id = opts.existing?.id ?? itemSlug(ref, date, rand4());
  // SCHEDULE_SKIP_RELEASE is the local/test escape hatch: render the row without creating
  // a GitHub release. Such a row can never be published (publishAndRecord refuses it).
  const url = io.env.SCHEDULE_SKIP_RELEASE ? '' : await io.release(ref, reelPath);
  await io.thumb(reelPath, at(io, `public/thumbs/${id}.jpg`));

  return {
    id,
    ref,
    format: fmt,
    hook: hookFor(props),
    renderedAt: (opts.now ?? new Date()).toISOString(),
    asset: { releaseTag: releaseTag(ref), url },
    thumbnail: `thumbs/${id}.jpg`,
    credits,
    posts: opts.existing?.posts ?? prefillPosts(props, credits, date, cfg),
  };
}

export async function runAutoFill(args: PublisherArgs, io: Io): Promise<void> {
  const { config, cfg } = loadConfig(io);
  const sources = readJson<{ verses: Verse[] }>(at(io, 'sources/gita.json'));
  const state = await readState(at(io, 'state.json'));
  const schedulePath = at(io, 'schedule.json');
  const plan = planAutoFill(args.now, (await readSchedule(schedulePath)).items, verseOrder(sources.verses, config.startRef), state, cfg);

  for (const { ref, date } of args.days === undefined ? plan : plan.slice(0, args.days)) {
    // One bad render (missing background, TTS hiccup) must not cost the whole run:
    // the row is skipped, logged, and picked up again next hour.
    try {
      const item = await renderRow(ref, date, config.format ?? 'classic', io, { now: args.now });
      // Re-read after the render (minutes) so rows the dashboard added or edited survive.
      const file = await readSchedule(schedulePath);
      file.items.push(item);
      await writeSchedule(schedulePath, file);
      io.log(`✔ scheduled ${item.id} (${ref}) for ${date}`);
    } catch (e) {
      io.log(`✖ auto-fill ${ref}: ${(e as Error).message}`);
    }
  }
}

// secretsFor gated the call already; this is belt-and-braces and never prints the value.
function secret(io: Io, key: string): string {
  const value = io.env[key];
  if (!value) throw new Error(`missing env var ${key} (see SETUP.md)`);
  return value;
}

async function callPlatform(item: ScheduleItem, platform: Platform, post: PostRecord, io: Io): Promise<string> {
  if (platform === 'facebook') {
    return io.post.facebook(item.asset.url, { pageId: secret(io, 'FB_PAGE_ID'), accessToken: secret(io, 'FB_PAGE_ACCESS_TOKEN') }, post.caption);
  }
  const verse = verseFor(io, item.ref);
  if (platform === 'instagram') {
    return io.post.instagram(verse, item.asset.url, { userId: secret(io, 'IG_USER_ID'), accessToken: secret(io, 'IG_ACCESS_TOKEN') }, post.caption);
  }
  // YouTube is the only platform that uploads bytes, so the archived asset comes back down.
  // The caption already carries the credits, hence the empty credits argument.
  const file = join(tmpdir(), `${item.id}-${Date.now()}.mp4`);
  try {
    await io.download(item.asset.url, file);
    return await io.post.youtube(
      verse,
      file,
      { clientId: secret(io, 'YT_CLIENT_ID'), clientSecret: secret(io, 'YT_CLIENT_SECRET'), refreshToken: secret(io, 'YT_REFRESH_TOKEN') },
      [],
      { title: post.title ?? '', description: post.caption },
    );
  } finally {
    await rm(file, { force: true });
  }
}

async function publishAndRecord(itemId: string, platform: Platform, args: PublisherArgs, io: Io): Promise<void> {
  const schedulePath = at(io, 'schedule.json');
  const now = args.now.toISOString();

  // A dry run reports intent and touches nothing — not even the "skipped, no secrets"
  // bookkeeping, which is a real state change the calendar would keep.
  if (args.dryRun) {
    io.log(`↻ would publish ${itemId} ${platform}`);
    return;
  }

  const item = (await readSchedule(schedulePath)).items.find((i) => i.id === itemId);
  if (!item) {
    io.log(`✖ ${itemId} ${platform}: row no longer exists`);
    return;
  }

  const secrets = secretsFor(platform, io.env);
  let result: PublishResult;
  if (!secrets.ok) {
    result = { skipped: `missing secrets: ${secrets.missing.join(', ')}` };
  } else if (item.asset.url === '') {
    result = { ok: false, error: 'no asset url (rendered with SCHEDULE_SKIP_RELEASE)' };
  } else {
    try {
      result = { ok: true, id: await callPlatform(item, platform, item.posts[platform], io) };
    } catch (e) {
      result = { ok: false, error: (e as Error).message };
    }
  }

  // Re-read before writing. A platform call runs for minutes (both Instagram and Facebook
  // poll for readiness), and the dashboard may have edited another row meanwhile — only
  // this one post's outcome may be carried into whatever is on disk NOW. Writing after
  // every result also means a crash mid-run leaves a file that knows what went out.
  const file = await readSchedule(schedulePath);
  const fresh = file.items.find((i) => i.id === itemId);
  if (!fresh) {
    io.log(`✖ ${itemId} ${platform}: row no longer exists`);
    return;
  }
  fresh.posts[platform] = applyPublishResult(fresh.posts[platform], result, now);
  await writeSchedule(schedulePath, file);

  if ('skipped' in result) {
    io.log(`↷ skipped ${itemId} ${platform}: ${result.skipped}`);
  } else if (result.ok) {
    const statePath = at(io, 'state.json');
    await writeState(statePath, recordPost(await readState(statePath), fresh.ref, platform, result.id, now));
    io.log(`✔ ${itemId} ${platform} ${result.id}`);
  } else {
    io.log(`✖ ${itemId} ${platform}: ${result.error}`);
  }
}

export async function runPublishDue(args: PublisherArgs, io: Io): Promise<void> {
  // What is due is decided from one snapshot; each result is then applied to a fresh read.
  const file = await readSchedule(at(io, 'schedule.json'));
  for (const due of duePosts(args.now, file.items)) {
    await publishAndRecord(due.itemId, due.platform, args, io);
  }
}

/** "Publish now" for one platform of one row — the dashboard button and the CLI's
 *  --publish-item. Ignores the scheduled time, but never re-posts a published row. */
export async function runPublishOne(itemId: string, platform: Platform, args: PublisherArgs, io: Io): Promise<void> {
  const file = await readSchedule(at(io, 'schedule.json'));
  const item = file.items.find((i) => i.id === itemId);
  if (!item) throw new Error(`no calendar item ${itemId}`);
  if (item.posts[platform].status === 'published') throw new Error(`${itemId} ${platform} is already published`);
  await publishAndRecord(itemId, platform, args, io);
}

// A re-render keeps the row's id and posts, so the date is only needed for parity with a
// fresh render: the row's own local day.
function itemDate(item: ScheduleItem, cfg: ScheduleConfig, now: Date): string {
  const slot = PLATFORMS.map((p) => item.posts[p].at).find((a): a is string => a !== null);
  return slot ? isoToLocal(slot, cfg.timezone).date : localDateOf(now, cfg.timezone);
}

export async function main(argv: string[]): Promise<void> {
  loadDotenv('.env', process.env);
  const args = parsePublisherArgs(argv);
  const io = defaultIo(process.cwd());
  const schedulePath = at(io, 'schedule.json');
  let requestFailed = false;

  // Only what the operator asked for by name decides the exit code; the hourly work
  // records its own failures in the files so the workflow's commit step still runs.
  const requested = async (what: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      io.log(`✖ ${what}: ${(e as Error).message}`);
      requestFailed = true;
    }
  };

  if (args.add) {
    const add = args.add;
    await requested(`add ${add.ref}`, async () => {
      const { config } = loadConfig(io);
      const item = await renderRow(add.ref, add.date, add.format ?? config.format ?? 'classic', io, {
        fromLastRender: add.fromLastRender,
        now: args.now,
      });
      const file = await readSchedule(schedulePath); // read after the render, never across it
      file.items.push(item);
      await writeSchedule(schedulePath, file);
      io.log(`✔ added ${item.id} (${item.ref}) for ${add.date}`);
    });
  }

  if (args.rerender) {
    const id = args.rerender;
    await requested(`rerender ${id}`, async () => {
      const { cfg } = loadConfig(io);
      const existing = (await readSchedule(schedulePath)).items.find((i) => i.id === id);
      if (!existing) throw new Error(`no calendar item ${id}`);
      const item = await renderRow(existing.ref, itemDate(existing, cfg, args.now), existing.format, io, { existing, now: args.now });
      // Re-read after the render: the new asset/thumbnail replace the row, but the posts
      // come from disk, so a caption edited while the render ran is not clobbered.
      const file = await readSchedule(schedulePath);
      const current = file.items.find((i) => i.id === id);
      if (!current) throw new Error(`no calendar item ${id}`);
      file.items = file.items.map((i) => (i.id === id ? { ...item, posts: current.posts } : i));
      await writeSchedule(schedulePath, file);
      io.log(`✔ rerendered ${id} (${item.ref})`);
    });
  }

  if (args.publishItem) {
    const { id, platform } = args.publishItem;
    await requested(`publish ${id} ${platform}`, () => runPublishOne(id, platform, args, io));
  }

  // Auto-fill runs first but must never block publishing — a render outage cannot be
  // allowed to hold back reels that are already archived and due.
  if (args.autoFill) {
    try {
      await runAutoFill(args, io);
    } catch (e) {
      io.log(`✖ auto-fill: ${(e as Error).message}`);
    }
  }
  if (args.publishDue) await runPublishDue(args, io);

  if (requestFailed) process.exitCode = 1;
}

if (process.argv[1]?.endsWith('publisher.ts')) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
