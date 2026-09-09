import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parsePublisherArgs, renderRow, runAutoFill, runPublishDue, runPublishOne, type Io, type PublisherArgs } from './publisher.ts';
import type { ScheduleFile, ScheduleItem } from '../shared/schedule.ts';
import type { StateFile } from './select.ts';

/** Real files in a real tmp tree; only the four side effects the publisher cannot do in a
 *  test (spawn a render, upload a release, run ffmpeg, call a platform API) are faked. */

const CONFIG = {
  handle: '@h',
  startRef: 'gita:1:1',
  platforms: ['youtube', 'instagram'],
  format: 'cinema',
  mode: 'calendar',
  schedule: { daysAhead: 3, defaultTimes: { instagram: '07:00', facebook: '07:05', youtube: '07:10' }, timezone: 'Asia/Kolkata' },
};
const VERSES = [1, 2, 3].map((n) => ({
  book: 'gita', ref: `gita:1:${n}`, chapter: 1, verse: n, sanskrit: [`श्लोक ${n}`],
  hindi: `पहला वाक्य ${n}। दूसरा वाक्य।`, english: `Verse ${n} in English.`,
  attribution: { hindi: 'ह', english: 'e' },
}));
const QUOTE = {
  id: 'abc', lines: ['Do the work.', 'Release the outcome.'], attribution: 'Meera Bai',
  kicker: 'श्रीकृष्ण कहते हैं', prompt: '', createdAt: '2026-09-09T00:00:00.000Z',
};
const MANIFEST = {
  backgrounds: [{ file: 'bg.mp4', url: 'u', license: 'CC0', source: 's', credit: 'BG by Someone (CC0)' }],
  music: [{ file: 'm.mp3', url: 'u', license: 'CC BY', source: 's', credit: 'Music by Someone (CC BY)' }],
  fonts: [], images: [],
};

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'publisher-'));
  for (const d of ['sources', 'out', 'public/assets']) mkdirSync(join(root, d), { recursive: true });
  writeFileSync(join(root, 'config.json'), JSON.stringify(CONFIG, null, 2) + '\n');
  writeFileSync(join(root, 'sources/gita.json'), JSON.stringify({ verses: VERSES }, null, 2) + '\n');
  writeFileSync(join(root, 'sources/custom-quotes.json'), JSON.stringify([QUOTE], null, 2) + '\n');
  writeFileSync(join(root, 'schedule.json'), JSON.stringify({ items: [] }, null, 2) + '\n');
  writeFileSync(join(root, 'state.json'), JSON.stringify({ posted: [] }, null, 2) + '\n');
  writeFileSync(join(root, 'public/assets/manifest.json'), JSON.stringify(MANIFEST, null, 2) + '\n');
  return root;
}

// Stands in for what `npm run generate` leaves behind: out/props.json + out/reel.mp4.
function writeRenderOutput(root: string, ref: string, format: string): void {
  const custom = ref.startsWith('custom:');
  const [, chapter, verse] = ref.split(':');
  const v = custom
    ? { book: 'custom', ref, chapter: 0, verse: 0, sanskrit: [QUOTE.attribution], hindi: '', english: QUOTE.lines.join(' '), attribution: { hindi: '', english: 'custom quote' } }
    : VERSES.find((x) => x.ref === ref) ?? { book: 'gita', ref, chapter: Number(chapter), verse: Number(verse), sanskrit: ['श्लोक'], hindi: 'क। ख।', english: 'e', attribution: { hindi: 'ह', english: 'e' } };
  const props = {
    verse: v,
    timings: { introEndSec: 3, meaningEndSec: 10, totalSec: 20 },
    ...(format === 'cinema'
      ? { format: 'cinema', cinema: { kicker: 'k', beats: ['Do the work.', 'Release the outcome.'], timings: { totalSec: 20 }, ...(custom ? { closing: { line: QUOTE.attribution, reference: '' } } : {}) } }
      : {}),
    audio: { introFile: null, meaningFile: null },
    media: { background: 'assets/backgrounds/bg.mp4', music: 'assets/music/m.mp3' },
    brand: { handle: '@h' },
  };
  writeFileSync(join(root, 'out/props.json'), JSON.stringify(props, null, 2));
  writeFileSync(join(root, 'out/reel.mp4'), 'fake mp4 bytes');
}

type PostCall = { platform: string; args: unknown[] };

type Fake = {
  io: Io;
  root: string;
  logs: string[];
  runs: string[][];
  itemsOnDiskAtRender: number[];
  thumbs: string[];
  downloads: [string, string][];
  posts: PostCall[];
};

function fakeIo(
  root: string,
  opts: { env?: NodeJS.ProcessEnv; failRender?: string; postIds?: Partial<Record<string, string | Error>>; onPost?: (platform: string) => void } = {},
): Fake {
  const fake: Fake = {
    root, logs: [], runs: [], itemsOnDiskAtRender: [], thumbs: [], downloads: [], posts: [],
    io: null as unknown as Io,
  };
  const readItems = (): ScheduleItem[] => (JSON.parse(readFileSync(join(root, 'schedule.json'), 'utf8')) as ScheduleFile).items;
  const platformPost = (platform: string) => async (...args: unknown[]) => {
    fake.posts.push({ platform, args });
    opts.onPost?.(platform);
    const outcome = opts.postIds?.[platform] ?? `${platform}-id`;
    if (outcome instanceof Error) throw outcome;
    return outcome;
  };
  fake.io = {
    root,
    env: opts.env ?? {},
    log: (line) => fake.logs.push(line),
    run: async (cmd, args) => {
      fake.runs.push([cmd, ...args]);
      fake.itemsOnDiskAtRender.push(readItems().length);
      const ref = args[args.indexOf('--verse') + 1];
      const format = args[args.indexOf('--format') + 1];
      if (opts.failRender === ref) throw new Error(`render exploded for ${ref}`);
      writeRenderOutput(root, ref, format);
    },
    release: async (ref) => `https://example.com/${ref}.mp4`,
    thumb: async (_video, out) => {
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, 'jpg bytes');
      fake.thumbs.push(out);
    },
    download: async (url, dest) => {
      fake.downloads.push([url, dest]);
      writeFileSync(dest, 'downloaded mp4');
    },
    post: {
      youtube: platformPost('youtube') as unknown as Io['post']['youtube'],
      instagram: platformPost('instagram') as unknown as Io['post']['instagram'],
      facebook: platformPost('facebook') as unknown as Io['post']['facebook'],
    },
  };
  return fake;
}

const args = (over: Partial<PublisherArgs> = {}): PublisherArgs => ({
  autoFill: false, publishDue: false, dryRun: false, now: new Date('2026-09-12T02:00:00Z'), ...over,
});

const item = (id: string, ref: string, date: string, over: Partial<ScheduleItem> = {}): ScheduleItem => ({
  id, ref, format: 'cinema', hook: 'Do the work.', renderedAt: '2026-09-11T00:00:00.000Z',
  asset: { releaseTag: `reel-${ref.replace(/:/g, '-')}`, url: `https://example.com/${ref}.mp4` },
  thumbnail: `thumbs/${id}.jpg`, credits: [],
  posts: {
    instagram: { at: `${date}T01:30:00.000Z`, status: 'scheduled', caption: 'ig caption' },
    facebook: { at: `${date}T01:35:00.000Z`, status: 'scheduled', caption: 'fb caption' },
    youtube: { at: `${date}T01:40:00.000Z`, status: 'scheduled', caption: 'yt description', title: 'yt title' },
  },
  ...over,
});

const readSchedule = (root: string): ScheduleFile => JSON.parse(readFileSync(join(root, 'schedule.json'), 'utf8'));
const readState = (root: string): StateFile => JSON.parse(readFileSync(join(root, 'state.json'), 'utf8'));
const seed = (root: string, items: ScheduleItem[]) => writeFileSync(join(root, 'schedule.json'), JSON.stringify({ items }, null, 2) + '\n');

describe('parsePublisherArgs', () => {
  it('defaults to auto-fill + publish-due; parses subcommands; rejects bad refs/dates', () => {
    const now = new Date('2026-09-12T02:00:00Z');

    expect(parsePublisherArgs([], now)).toEqual({ autoFill: true, publishDue: true, dryRun: false, now });
    expect(parsePublisherArgs(['--dry-run'], now)).toMatchObject({ autoFill: true, publishDue: true, dryRun: true });

    // any explicit subcommand turns the defaults off
    expect(parsePublisherArgs(['--auto-fill', '--days', '1'], now)).toEqual({ autoFill: true, publishDue: false, dryRun: false, now, days: 1 });
    expect(parsePublisherArgs(['--publish-due'], now)).toMatchObject({ autoFill: false, publishDue: true });
    expect(parsePublisherArgs(['--add', 'gita:2:47', '--date', '2026-09-20', '--format', 'cinema', '--from-last-render'], now)).toMatchObject({
      autoFill: false, publishDue: false, add: { ref: 'gita:2:47', date: '2026-09-20', format: 'cinema', fromLastRender: true },
    });
    expect(parsePublisherArgs(['--add', 'custom:abc', '--date', '2026-09-20'], now).add).toEqual({ ref: 'custom:abc', date: '2026-09-20', format: undefined, fromLastRender: false });
    expect(parsePublisherArgs(['--rerender', 'gita-1-1-20260912-a1b2'], now)).toMatchObject({ rerender: 'gita-1-1-20260912-a1b2' });
    expect(parsePublisherArgs(['--publish-item', 'gita-1-1-20260912-a1b2', '--platform', 'facebook'], now)).toMatchObject({
      publishItem: { id: 'gita-1-1-20260912-a1b2', platform: 'facebook' },
    });
    expect(parsePublisherArgs(['--now', '2026-09-13T00:00:00Z'], now).now.toISOString()).toBe('2026-09-13T00:00:00.000Z');

    expect(() => parsePublisherArgs(['--add', 'nope', '--date', '2026-09-20'], now)).toThrow(/--add/);
    expect(() => parsePublisherArgs(['--add', 'gita:2:47'], now)).toThrow(/--date/);
    expect(() => parsePublisherArgs(['--add', 'gita:2:47', '--date', '20-09-2026'], now)).toThrow(/--date/);
    expect(() => parsePublisherArgs(['--add', 'gita:2:47', '--date', '2026-09-20', '--format', 'reel'], now)).toThrow(/--format/);
    expect(() => parsePublisherArgs(['--rerender', 'NOT A SLUG'], now)).toThrow(/--rerender/);
    expect(() => parsePublisherArgs(['--publish-item', 'gita-1-1-20260912-a1b2'], now)).toThrow(/--platform/);
    expect(() => parsePublisherArgs(['--publish-item', 'gita-1-1-20260912-a1b2', '--platform', 'tiktok'], now)).toThrow(/--platform/);
    expect(() => parsePublisherArgs(['--now', 'yesterday'], now)).toThrow(/--now/);
    expect(() => parsePublisherArgs(['--days', '0'], now)).toThrow(/--days/);
  });
});

describe('runAutoFill', () => {
  // 2026-09-09T23:30Z = 05:00 IST on the 10th, so the 07:00 IST slots still lie ahead.
  const now = new Date('2026-09-09T23:30:00Z');

  it('renders one row per planned day, writes schedule.json after each row, keeps going after a failed render', async () => {
    const root = makeRoot();
    const fake = fakeIo(root, { failRender: 'gita:1:2' });

    await runAutoFill(args({ autoFill: true, now }), fake.io);

    expect(fake.runs.map((r) => r[r.indexOf('--verse') + 1])).toEqual(['gita:1:1', 'gita:1:2', 'gita:1:3']);
    expect(fake.runs[0]).toEqual(['npm', 'run', 'generate', '--', '--verse', 'gita:1:1', '--format', 'cinema', '--dry-run']);

    const { items } = readSchedule(root);
    expect(items.map((i) => i.ref)).toEqual(['gita:1:1', 'gita:1:3']);
    expect(items.map((i) => i.posts.instagram.at)).toEqual(['2026-09-10T01:30:00.000Z', '2026-09-12T01:30:00.000Z']);
    // the file on disk grew before the next render started: 0 items, then 1 (row 2 failed), then still 1
    expect(fake.itemsOnDiskAtRender).toEqual([0, 1, 1]);
    expect(fake.logs.some((l) => l.startsWith('✖ auto-fill gita:1:2: render exploded'))).toBe(true);

    const row = items[0];
    expect(row.id).toMatch(/^gita-1-1-20260910-[a-z0-9]{4}$/);
    expect(row.format).toBe('cinema');
    expect(row.hook).toBe('Do the work.');
    expect(row.renderedAt).toBe(now.toISOString());
    expect(row.asset).toEqual({ releaseTag: 'reel-gita-1-1', url: 'https://example.com/gita:1:1.mp4' });
    expect(row.thumbnail).toBe(`thumbs/${row.id}.jpg`);
    expect(existsSync(join(root, 'public/thumbs', `${row.id}.jpg`))).toBe(true);
    expect(row.credits).toEqual(['BG by Someone (CC0)', 'Music by Someone (CC BY)']);
    expect(row.posts.youtube.title).toBe('Do the work. | Bhagavad Gita 1.1 #Shorts');
    expect(row.posts.youtube.caption).toContain('Music by Someone (CC BY)');
    expect(row.posts.facebook.caption).toBe(row.posts.instagram.caption);
    expect(Object.values(row.posts).every((p) => p.status === 'scheduled')).toBe(true);
  });

  it('--days limits how many rows one run renders', async () => {
    const root = makeRoot();
    const fake = fakeIo(root);
    await runAutoFill(args({ autoFill: true, now, days: 1 }), fake.io);
    expect(readSchedule(root).items.map((i) => i.ref)).toEqual(['gita:1:1']);
    expect(fake.runs).toHaveLength(1);
  });

  it('--dry-run still renders and schedules (spec: renders + schedules, no publishing)', async () => {
    const root = makeRoot();
    const fake = fakeIo(root);

    await runAutoFill(args({ autoFill: true, dryRun: true, now, days: 1 }), fake.io);

    const { items } = readSchedule(root);
    expect(items).toHaveLength(1);
    expect(items[0].asset.url).toBe('https://example.com/gita:1:1.mp4');
    expect(items[0].posts.instagram.status).toBe('scheduled');
    expect(fake.thumbs).toHaveLength(1);
    expect(fake.posts).toEqual([]); // auto-fill never publishes, dry-run or not
  });

  it('SCHEDULE_SKIP_RELEASE leaves the asset url empty instead of uploading', async () => {
    const root = makeRoot();
    const fake = fakeIo(root, { env: { SCHEDULE_SKIP_RELEASE: '1' } });
    await runAutoFill(args({ autoFill: true, now, days: 1 }), fake.io);
    expect(readSchedule(root).items[0].asset).toEqual({ releaseTag: 'reel-gita-1-1', url: '' });
  });
});

describe('runPublishDue', () => {
  const now = new Date('2026-09-12T02:00:00Z'); // past all three 2026-09-12 slots
  const igEnv = { IG_USER_ID: 'ig-user', IG_ACCESS_TOKEN: 'ig-token' };
  const fbEnv = { FB_PAGE_ID: 'fb-page', FB_PAGE_ACCESS_TOKEN: 'fb-token' };
  const ytEnv = { YT_CLIENT_ID: 'c', YT_CLIENT_SECRET: 's', YT_REFRESH_TOKEN: 'r' };

  it('publishes due posts in order, writes state.json for each success, marks failures with attempts, skips with reason when secrets are missing, and never touches future posts', async () => {
    const root = makeRoot();
    seed(root, [item('gita-1-1-20260912-a1b2', 'gita:1:1', '2026-09-12'), item('gita-1-2-20260913-c3d4', 'gita:1:2', '2026-09-13')]);
    const statusesSeenByFacebook: string[] = [];
    const fake = fakeIo(root, {
      env: { ...igEnv, ...fbEnv }, // no YT_* → youtube is skipped
      postIds: { instagram: 'ig-1', facebook: new Error('fb boom') },
      onPost: (platform) => {
        // proves schedule.json is rewritten after EVERY result, before the next attempt
        if (platform === 'facebook') statusesSeenByFacebook.push(readSchedule(root).items[0].posts.instagram.status);
      },
    });

    await runPublishDue(args({ publishDue: true, now }), fake.io);

    expect(fake.posts.map((p) => p.platform)).toEqual(['instagram', 'facebook']); // in slot order; youtube never called
    expect(statusesSeenByFacebook).toEqual(['published']);

    const { items } = readSchedule(root);
    expect(items[0].posts.instagram).toMatchObject({ status: 'published', id: 'ig-1', publishedAt: now.toISOString() });
    expect(items[0].posts.facebook).toMatchObject({ status: 'failed', attempts: 1, error: 'fb boom' });
    expect(items[0].posts.youtube).toMatchObject({ status: 'skipped', error: 'missing secrets: YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN' });
    expect(items[1].posts).toEqual(item('x', 'gita:1:2', '2026-09-13').posts); // tomorrow's row untouched

    expect(readState(root)).toEqual({ posted: [{ ref: 'gita:1:1', instagram: { id: 'ig-1', at: now.toISOString() } }] });

    expect(fake.logs).toEqual([
      '✔ gita-1-1-20260912-a1b2 instagram ig-1',
      '✖ gita-1-1-20260912-a1b2 facebook: fb boom',
      '↷ skipped gita-1-1-20260912-a1b2 youtube: missing secrets: YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN',
    ]);

    // the instagram call carried the row's caption and the release URL
    expect(fake.posts[0].args[1]).toBe('https://example.com/gita:1:1.mp4');
    expect(fake.posts[0].args[2]).toEqual({ userId: 'ig-user', accessToken: 'ig-token' });
    expect(fake.posts[0].args[3]).toBe('ig caption');
  });

  it('a due youtube post downloads the release asset and uploads it with the row title and caption', async () => {
    const root = makeRoot();
    seed(root, [item('gita-1-1-20260912-a1b2', 'gita:1:1', '2026-09-12', {
      posts: {
        instagram: { at: null, status: 'draft', caption: 'ig' },
        facebook: { at: null, status: 'draft', caption: 'fb' },
        youtube: { at: '2026-09-12T01:40:00.000Z', status: 'scheduled', caption: 'yt description', title: 'yt title' },
      },
    })]);
    const fake = fakeIo(root, { env: ytEnv, postIds: { youtube: 'yt-1' } });

    await runPublishDue(args({ publishDue: true, now }), fake.io);

    expect(fake.downloads).toHaveLength(1);
    const [url, dest] = fake.downloads[0];
    expect(url).toBe('https://example.com/gita:1:1.mp4');
    const [verse, filePath, env, credits, overrides] = fake.posts[0].args as [{ ref: string }, string, unknown, unknown, unknown];
    expect(verse.ref).toBe('gita:1:1');
    expect(filePath).toBe(dest);
    expect(env).toEqual({ clientId: 'c', clientSecret: 's', refreshToken: 'r' });
    expect(credits).toEqual([]); // already inside the caption at prefill time
    expect(overrides).toEqual({ title: 'yt title', description: 'yt description' });
    expect(readSchedule(root).items[0].posts.youtube.id).toBe('yt-1');
    expect(existsSync(dest)).toBe(false); // the temp download is cleaned up
  });

  it('a row rendered with SCHEDULE_SKIP_RELEASE fails instead of posting an empty url', async () => {
    const root = makeRoot();
    seed(root, [item('gita-1-1-20260912-a1b2', 'gita:1:1', '2026-09-12', { asset: { releaseTag: 'reel-gita-1-1', url: '' } })]);
    const fake = fakeIo(root, { env: { ...igEnv, ...fbEnv, ...ytEnv } });

    await runPublishDue(args({ publishDue: true, now }), fake.io);

    expect(fake.posts).toEqual([]);
    expect(fake.downloads).toEqual([]);
    const posts = readSchedule(root).items[0].posts;
    expect(posts.instagram).toMatchObject({ status: 'failed', attempts: 1, error: 'no asset url (rendered with SCHEDULE_SKIP_RELEASE)' });
    expect(posts.youtube.status).toBe('failed');
    expect(readState(root)).toEqual({ posted: [] });
  });

  it('retries a failed post until MAX_ATTEMPTS and then leaves it alone', async () => {
    const root = makeRoot();
    seed(root, [item('gita-1-1-20260912-a1b2', 'gita:1:1', '2026-09-12', {
      posts: {
        instagram: { at: '2026-09-12T01:30:00.000Z', status: 'failed', caption: 'ig caption', attempts: 2, error: 'earlier' },
        facebook: { at: '2026-09-12T01:35:00.000Z', status: 'failed', caption: 'fb caption', attempts: 3, error: 'gave up' },
        youtube: { at: '2026-09-12T01:40:00.000Z', status: 'published', caption: 'yt', id: 'yt-old' },
      },
    })]);
    const fake = fakeIo(root, { env: { ...igEnv, ...fbEnv, ...ytEnv }, postIds: { instagram: new Error('again') } });

    await runPublishDue(args({ publishDue: true, now }), fake.io);

    expect(fake.posts.map((p) => p.platform)).toEqual(['instagram']);
    const posts = readSchedule(root).items[0].posts;
    expect(posts.instagram).toMatchObject({ status: 'failed', attempts: 3, error: 'again' });
    expect(posts.facebook.attempts).toBe(3);
    expect(posts.youtube.id).toBe('yt-old');
  });

  it('--dry-run logs "would publish" and changes nothing', async () => {
    const root = makeRoot();
    seed(root, [item('gita-1-1-20260912-a1b2', 'gita:1:1', '2026-09-12')]);
    const before = { schedule: readFileSync(join(root, 'schedule.json'), 'utf8'), state: readFileSync(join(root, 'state.json'), 'utf8') };
    const fake = fakeIo(root, { env: { ...igEnv, ...fbEnv, ...ytEnv } });

    await runPublishDue(args({ publishDue: true, dryRun: true, now }), fake.io);

    expect(fake.posts).toEqual([]);
    expect(fake.logs).toEqual([
      '↻ would publish gita-1-1-20260912-a1b2 instagram',
      '↻ would publish gita-1-1-20260912-a1b2 facebook',
      '↻ would publish gita-1-1-20260912-a1b2 youtube',
    ]);
    expect(readFileSync(join(root, 'schedule.json'), 'utf8')).toBe(before.schedule);
    expect(readFileSync(join(root, 'state.json'), 'utf8')).toBe(before.state);
  });
});

describe('runPublishOne', () => {
  const now = new Date('2026-09-12T02:00:00Z');

  it('publishes one platform of one row on demand, even before its slot, and refuses an already published post', async () => {
    const root = makeRoot();
    seed(root, [item('gita-1-1-20260920-a1b2', 'gita:1:1', '2026-09-20')]); // all three slots still in the future
    const fake = fakeIo(root, { env: { FB_PAGE_ID: 'fb-page', FB_PAGE_ACCESS_TOKEN: 'fb-token' }, postIds: { facebook: 'fb-1' } });

    await runPublishOne('gita-1-1-20260920-a1b2', 'facebook', args({ now }), fake.io);

    expect(fake.posts.map((p) => p.platform)).toEqual(['facebook']);
    expect(fake.posts[0].args).toEqual(['https://example.com/gita:1:1.mp4', { pageId: 'fb-page', accessToken: 'fb-token' }, 'fb caption']);
    expect(readSchedule(root).items[0].posts.facebook).toMatchObject({ status: 'published', id: 'fb-1' });
    expect(readState(root).posted[0].facebook).toEqual({ id: 'fb-1', at: now.toISOString() });

    await expect(runPublishOne('gita-1-1-20260920-a1b2', 'facebook', args({ now }), fake.io)).rejects.toThrow(/already published/);
    await expect(runPublishOne('nope-nope-nope', 'facebook', args({ now }), fake.io)).rejects.toThrow(/nope-nope-nope/);
  });
});

describe('renderRow', () => {
  const now = new Date('2026-09-12T02:00:00Z');

  it('--add --from-last-render reuses out/props.json when its verse.ref matches, otherwise renders', async () => {
    const root = makeRoot();
    const fake = fakeIo(root);
    const parsed = parsePublisherArgs(['--add', 'gita:1:2', '--date', '2026-09-20', '--from-last-render'], now);
    writeRenderOutput(root, 'gita:1:2', 'cinema'); // Studio's last render is still sitting in out/

    const reused = await renderRow(parsed.add!.ref, parsed.add!.date, 'cinema', fake.io, { fromLastRender: true, now });
    expect(fake.runs).toEqual([]);
    expect(reused.ref).toBe('gita:1:2');
    expect(reused.id).toMatch(/^gita-1-2-20260920-[a-z0-9]{4}$/);
    expect(reused.posts.instagram.at).toBe('2026-09-20T01:30:00.000Z');

    // a different verse cannot reuse that render
    const rendered = await renderRow('gita:1:3', '2026-09-21', 'cinema', fake.io, { fromLastRender: true, now });
    expect(fake.runs.map((r) => r[r.indexOf('--verse') + 1])).toEqual(['gita:1:3']);
    expect(rendered.ref).toBe('gita:1:3');
  });

  it('--rerender keeps posts, updates renderedAt/asset/thumbnail', async () => {
    const root = makeRoot();
    const fake = fakeIo(root);
    const existing = item('gita-1-1-20260912-a1b2', 'gita:1:1', '2026-09-12', {
      renderedAt: '2026-09-01T00:00:00.000Z',
      asset: { releaseTag: 'reel-gita-1-1', url: 'https://example.com/stale.mp4' },
      posts: {
        instagram: { at: '2026-09-12T01:30:00.000Z', status: 'published', caption: 'edited by hand', id: 'ig-old', publishedAt: '2026-09-12T01:31:00.000Z' },
        facebook: { at: '2026-09-12T09:00:00.000Z', status: 'scheduled', caption: 'edited by hand too' },
        youtube: { at: null, status: 'draft', caption: 'yt', title: 'yt title' },
      },
    });

    const row = await renderRow(existing.ref, '2026-09-12', existing.format, fake.io, { existing, now });

    expect(row.id).toBe(existing.id);
    expect(row.posts).toEqual(existing.posts); // hand-edited captions, times and results survive
    expect(row.renderedAt).toBe(now.toISOString());
    expect(row.asset.url).toBe('https://example.com/gita:1:1.mp4');
    expect(fake.thumbs).toEqual([join(root, 'public/thumbs', `${existing.id}.jpg`)]);
    expect(fake.runs).toHaveLength(1);
  });

  it('a custom ref renders in cinema format and is never auto-filled', async () => {
    const root = makeRoot();
    const fake = fakeIo(root);

    // classic is impossible for a custom quote — the row is rendered as cinema regardless
    const row = await renderRow('custom:abc', '2026-09-10', 'classic', fake.io, { now });
    expect(fake.runs[0]).toEqual(['npm', 'run', 'generate', '--', '--verse', 'custom:abc', '--format', 'cinema', '--dry-run']);
    expect(row.format).toBe('cinema');
    expect(row.posts.youtube.title).toBe('Do the work. | Meera Bai #Shorts');

    seed(root, [row]);
    await runAutoFill(args({ autoFill: true, now: new Date('2026-09-09T23:30:00Z') }), fake.io);

    const refs = readSchedule(root).items.map((i) => i.ref);
    expect(refs).toEqual(['custom:abc', 'gita:1:1', 'gita:1:2']); // the custom row covers 09-10; auto-fill only ever picks source verses
    expect(fake.runs.slice(1).map((r) => r[r.indexOf('--verse') + 1])).toEqual(['gita:1:1', 'gita:1:2']);
  });
});
