import { spawn } from 'node:child_process';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, normalize, resolve } from 'node:path';
import { execa } from 'execa';
import sharp from 'sharp';
import { listBackgroundPool } from '../../shared/backgrounds.ts';
import { appendImageEntry, appendMusicEntry, slugifyAudioName, slugifyImageName } from '../../shared/assets-store.ts';
import { beatsFromTranslation, validateBeatsFile } from '../../shared/beats.ts';
import { CUSTOM_REF_PREFIX, REF_PATTERN, validateCustomQuote, type CustomQuote } from '../../shared/custom-quotes.ts';
import { isAllowedMediaPath } from '../../shared/media-path.ts';
import { promptFor } from '../../shared/prompts.ts';
import { validateStyle, type ReelStyle } from '../../shared/reel-style.ts';
import {
  CAPTION_MAX,
  PLATFORMS,
  TITLE_MAX,
  sortItems,
  validateScheduleConfig,
  type Platform,
  type PostRecord,
  type PostStatus,
  type ScheduleItem,
} from '../../shared/schedule.ts';
import { DAILY_PLATFORMS, FORMATS, MODES, validateConfigPatch, type ConfigView } from '../../shared/config.ts';
import { pickNext, readState, verseOrder, type PlatformKey } from '../../pipeline/select.ts';
import { loadStylePreset } from '../../pipeline/run.ts';
import { loadDotenv, readSchedule, secretsFor, writeSchedule } from '../../pipeline/schedule-io.ts';
import type { Manifest } from '../../scripts/fetch-assets.ts';
import type { Verse } from '../../shared/types.ts';
import { parseSecretNames, parseWorkflowStates } from './connections-parse.ts';
import type { AssetInfo, Backend, CalendarView, ConnectionsView, MediaHandle, PostPatch, QuoteRow, StateSummary } from './backend.ts';

export const REPO_ROOT = resolve(process.cwd(), '..');

if (!existsSync(join(REPO_ROOT, 'sources/gita.json'))) {
  throw new Error(
    `sources/gita.json not found under ${REPO_ROOT} — run the dashboard from the repo (npm run dashboard from the repo root, or npm run dev with the repo checked out one level above dashboard/).`,
  );
}

const MEDIA_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
};

/** Thrown by saveImage when the uploaded bytes don't decode as an image (e.g. a text file
 *  renamed with a .jpg extension). Routes catch this specifically to answer a clean 400
 *  instead of letting an opaque 500 leak out of the sharp pipeline. */
export class InvalidImageError extends Error {}

/** Thrown by saveAudio when the uploaded bytes exceed the 20 MB cap. The upload route already
 *  checks this before calling saveAudio (same defense-in-depth pattern as saveImage's route-level
 *  extension/size check) — this is the backend's own backstop for any other caller. */
export class InvalidAudioError extends Error {}
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

async function readManifest(): Promise<Manifest> {
  return JSON.parse(await readFile(join(REPO_ROOT, 'public/assets/manifest.json'), 'utf8'));
}

async function writeManifestFile(manifest: Manifest): Promise<void> {
  await writeFile(join(REPO_ROOT, 'public/assets/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

function repoRoot(): string {
  return REPO_ROOT;
}

// Backgrounds (clips + images) and music in one list: the Studio's music-mode control needs the
// mp3 pool the pipeline picks from, and there is no second place to get it from. Consumers that
// only want backgrounds filter on `kind` (Library, GeneratePanel) — music entries are appended
// last so the existing background ordering is byte-for-byte unchanged.
async function listAssets(): Promise<AssetInfo[]> {
  const pool = listBackgroundPool(REPO_ROOT);
  const manifest = await readManifest();
  const backgrounds: AssetInfo[] = pool.map((p) => {
    const entry =
      p.kind === 'clip'
        ? manifest.backgrounds.find((e) => e.file === p.file)
        : manifest.images.find((e) => e.file === p.file);
    return { file: p.file, rel: p.rel, kind: p.kind, license: entry?.license ?? '—' };
  });

  const musicDir = join(REPO_ROOT, 'public/assets/music');
  // Same source of truth the pipeline uses for the music pool (pipeline/run.ts lists this
  // directory with the same filter), so the Studio's track list can never offer a track the
  // render would then reject as "not found".
  const music: AssetInfo[] = (existsSync(musicDir) ? readdirSync(musicDir).filter((f) => /\.mp3$/i.test(f)) : [])
    .sort()
    .map((file) => ({
      file,
      rel: `assets/music/${file}`,
      kind: 'music' as const,
      license: manifest.music.find((e) => e.file === file)?.license ?? '—',
    }));

  return [...backgrounds, ...music];
}

// Concurrent uploads must not interleave: two requests racing through slugifyImageName/
// slugifyAudioName could compute the same slug, or two manifest read-modify-write cycles could
// race and one write could silently clobber the other's appended entry. The dashboard runs as a
// single Node process, so a module-level promise chain is enough to serialize saveImage AND
// saveAudio calls end-to-end (slug pick -> write -> manifest read-modify-write), across both
// upload kinds, without needing a real file lock.
let queue: Promise<void> = Promise.resolve();

function saveImage(name: string, data: Buffer): Promise<AssetInfo> {
  const result = queue.then(() => saveImageExclusive(name, data));
  // Keep the chain alive even if this upload failed, so one bad upload doesn't wedge every
  // upload after it; the caller of saveImage still sees the real outcome via `result`.
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function saveAudio(name: string, data: Buffer): Promise<AssetInfo> {
  const result = queue.then(() => saveAudioExclusive(name, data));
  // Same reasoning as saveImage above: keep the shared chain alive even on failure.
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function saveImageExclusive(name: string, data: Buffer): Promise<AssetInfo> {
  const existing = listBackgroundPool(REPO_ROOT)
    .filter((p) => p.kind === 'image')
    .map((p) => p.file);
  const file = slugifyImageName(name, existing);

  let jpeg: Buffer;
  try {
    jpeg = await sharp(data)
      .resize(1080, 1920, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch {
    throw new InvalidImageError(`"${name}" is not a valid image`);
  }

  const dest = join(REPO_ROOT, 'public/assets/images', file);
  await writeFile(dest, jpeg);

  try {
    const manifest = await readManifest();
    await writeManifestFile(appendImageEntry(manifest, file));
  } catch (e) {
    // Design spec §5: "a failed resize never leaves partial files" — the same bar applies to a
    // manifest write that fails after the image already landed on disk. Clean up the orphan
    // before surfacing the original error so a half-done upload can't linger untracked.
    await unlink(dest).catch(() => {});
    throw e;
  }

  return { file, rel: `assets/images/${file}`, kind: 'image', license: 'User-provided' };
}

// No decode/transcode step for audio (design spec §5: "mp3 passthrough" in v1) — the size cap is
// the only content check, so it's enforced first, before anything touches disk.
async function saveAudioExclusive(name: string, data: Buffer): Promise<AssetInfo> {
  if (data.length > MAX_AUDIO_BYTES) throw new InvalidAudioError(`"${name}" exceeds ${MAX_AUDIO_BYTES} bytes`);

  const dir = join(REPO_ROOT, 'public/assets/music');
  mkdirSync(dir, { recursive: true });
  const existing = readdirSync(dir).filter((f) => /\.mp3$/i.test(f));
  const file = slugifyAudioName(name, existing);

  const dest = join(dir, file);
  await writeFile(dest, data);

  try {
    const manifest = await readManifest();
    await writeManifestFile(appendMusicEntry(manifest, file));
  } catch (e) {
    // Same "never leave partial state" bar as saveImageExclusive: a manifest write failing after
    // the file already landed on disk must not leave an untracked orphan behind.
    await unlink(dest).catch(() => {});
    throw e;
  }

  return { file, rel: `assets/music/${file}`, kind: 'music', license: 'User-provided' };
}

async function getState(): Promise<StateSummary> {
  const [state, config, sources] = await Promise.all([
    readState(join(REPO_ROOT, 'state.json')),
    readFile(join(REPO_ROOT, 'config.json'), 'utf8').then(
      (s) => JSON.parse(s) as { handle: string; startRef: string; platforms: PlatformKey[] },
    ),
    readFile(join(REPO_ROOT, 'sources/gita.json'), 'utf8').then((s) => JSON.parse(s) as { verses: Verse[] }),
  ]);

  const order = verseOrder(sources.verses, config.startRef);
  const nextRef = pickNext(order, state, config.platforms)?.ref ?? null;

  const lastEntry = state.posted[state.posted.length - 1];
  const lastPosted = lastEntry
    ? { ref: lastEntry.ref, youtube: lastEntry.youtube?.id, instagram: lastEntry.instagram?.id }
    : null;

  const maxChapter = sources.verses.reduce((m, v) => Math.max(m, v.chapter), 0);
  const chapters = Array<number>(maxChapter).fill(0);
  for (const v of sources.verses) chapters[v.chapter - 1]++;

  // `handle` is what the render stamps on every card (ReelProps.brand.handle) — the Studio
  // preview would otherwise have to guess it, and a preview that shows a different handle than
  // the render is exactly the kind of drift the live preview exists to eliminate.
  return { lastPosted, nextRef, totalPosted: state.posted.length, chapters, handle: config.handle ?? '' };
}

async function getVerse(ref: string): Promise<Verse | null> {
  const sources = JSON.parse(await readFile(join(REPO_ROOT, 'sources/gita.json'), 'utf8')) as { verses: Verse[] };
  return sources.verses.find((v) => v.ref === ref) ?? null;
}

const CONFIG_PATH = () => join(REPO_ROOT, 'config.json');

/** Thrown by updateConfig when the patch breaks a rule; carries the same field-keyed
 *  map the form renders, so the route can answer it verbatim as a 400. */
export class ConfigValidationError extends Error {
  constructor(public errors: Record<string, string>) {
    super(Object.entries(errors).map(([k, v]) => `${k}: ${v}`).join('; '));
  }
}

async function getConfig(): Promise<ConfigView> {
  const raw = JSON.parse(await readFile(CONFIG_PATH(), 'utf8')) as Record<string, unknown>;
  const platforms = Array.isArray(raw.platforms) ? raw.platforms : [];
  return {
    handle: typeof raw.handle === 'string' ? raw.handle : '',
    startRef: typeof raw.startRef === 'string' ? raw.startRef : 'gita:1:1',
    platforms: DAILY_PLATFORMS.filter((p) => platforms.includes(p)),
    format: (FORMATS as readonly unknown[]).includes(raw.format) ? (raw.format as ConfigView['format']) : 'classic',
    // A missing mode means the legacy daily pipeline — the same default the publisher uses.
    mode: (MODES as readonly unknown[]).includes(raw.mode) ? (raw.mode as ConfigView['mode']) : 'daily',
    schedule: validateScheduleConfig(raw.schedule),
  };
}

// Routed through the same `queue` as every other shared-file writer: config.json is read by
// getState/getCalendar too, and a write racing one of those reads (or another config write) could
// tear a reader's JSON.parse or drop one writer's fields — the same read-modify-write hazard as
// saveStyle/saveBeats above.
function updateConfig(patch: unknown): Promise<ConfigView> {
  const result = queue.then(() => updateConfigExclusive(patch));
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function updateConfigExclusive(patch: unknown): Promise<ConfigView> {
  // config.json is read by every run; refuse while one holds the lock, exactly as
  // calendar edits do.
  assertPublisherIdle();
  const sources = JSON.parse(await readFile(join(REPO_ROOT, 'sources/gita.json'), 'utf8')) as { verses: Verse[] };
  const checked = validateConfigPatch(patch, { verseRefs: new Set(sources.verses.map((v) => v.ref)) });
  if (!checked.ok) throw new ConfigValidationError(checked.errors);
  const raw = JSON.parse(await readFile(CONFIG_PATH(), 'utf8')) as Record<string, unknown>;
  // Spread over the parsed file, so keys this panel does not know about survive.
  await writeFile(CONFIG_PATH(), JSON.stringify({ ...raw, ...checked.value }, null, 2) + '\n');
  return getConfig();
}

// Read-only: which platform secrets exist locally (.env) and, when `gh` is reachable, in GitHub
// Actions, plus the two scheduled workflows' enabled state. Never throws — a missing/unauthenticated
// `gh` just leaves ghAvailable false and the workflow states 'unknown', same as no local secrets.
async function getConnections(): Promise<ConnectionsView> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  loadDotenv(join(REPO_ROOT, '.env'), env);
  const platforms = Object.fromEntries(
    PLATFORMS.map((p) => {
      const local = secretsFor(p, env);
      // secretsFor over an empty env names every key the platform needs. The cast is only for
      // Next's global.d.ts, which augments NodeJS.ProcessEnv to require NODE_ENV — root tsc has
      // no such augmentation (pipeline/schedule-io.test.ts calls secretsFor(p, {}) uncast), so
      // this is a dashboard-typecheck-only wrinkle, not a real environment requirement.
      const missingFromEmpty = secretsFor(p, {} as NodeJS.ProcessEnv);
      const secrets = missingFromEmpty.ok ? [] : missingFromEmpty.missing;
      return [p, { local: local.ok, actions: null as boolean | null, secrets }];
    }),
  ) as ConnectionsView['platforms'];
  let workflows: ConnectionsView['workflows'] = { 'daily-reel': 'unknown', publisher: 'unknown' };
  let ghAvailable = false;
  try {
    const secretList = await execa('gh', ['secret', 'list', '--json', 'name', '-q', '.[].name'], { cwd: REPO_ROOT, timeout: 8000 });
    const names = parseSecretNames(secretList.stdout);
    ghAvailable = true;
    for (const p of PLATFORMS) platforms[p].actions = platforms[p].secrets.every((k) => names.has(k));
    const list = await execa('gh', ['workflow', 'list', '--all'], { cwd: REPO_ROOT, timeout: 8000 });
    workflows = parseWorkflowStates(list.stdout, ['daily-reel', 'publisher']) as ConnectionsView['workflows'];
  } catch {
    // gh missing, unauthenticated, or no remote — the local .env status above still stands.
  }
  return { ghAvailable, platforms, workflows };
}

const STYLE_PATH = () => join(REPO_ROOT, 'styles/cinema.json');

async function getStyle(): Promise<ReelStyle> {
  return loadStylePreset(STYLE_PATH());
}

// Routed through the same `queue` as saveImage/saveAudio: styles/cinema.json is a single shared
// file, and without serialization two overlapping POST /api/style calls (or a style save racing
// a beats save's own read-modify-write below) could interleave and silently drop one writer's
// update. This has no resize/slug step, but the queue+Exclusive split is kept identical to the
// upload functions' shape so every shared-file writer follows the same pattern.
function saveStyle(s: unknown): Promise<ReelStyle> {
  const result = queue.then(() => saveStyleExclusive(s));
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function saveStyleExclusive(s: unknown): Promise<ReelStyle> {
  const style = validateStyle(s);
  await writeFile(STYLE_PATH(), JSON.stringify(style, null, 2) + '\n');
  return style;
}

const BEATS_PATH = () => join(REPO_ROOT, 'sources/beats.json');

async function getBeats(ref: string): Promise<{ beats: string[]; curated: boolean } | null> {
  const [sources, beatsFile] = await Promise.all([
    readFile(join(REPO_ROOT, 'sources/gita.json'), 'utf8').then((s) => JSON.parse(s) as { verses: Verse[] }),
    readFile(BEATS_PATH(), 'utf8').then((s) => JSON.parse(s) as Record<string, string[]>),
  ]);
  const verse = sources.verses.find((v) => v.ref === ref);
  if (!verse) return null;
  const curated = beatsFile[ref];
  return curated ? { beats: curated, curated: true } : { beats: beatsFromTranslation(verse.english), curated: false };
}

// Sorted chapter-then-verse: refs are `book:chapter:verse` (e.g. "gita:2:47") for the one book
// this project has today, so a numeric compare on the two trailing segments is enough — matching
// sources/beats.json's existing key order exactly, so a diff only ever shows the entry that
// actually changed.
function sortBeatsKeys(beats: Record<string, string[]>): Record<string, string[]> {
  const sortedKeys = Object.keys(beats).sort((a, b) => {
    const [, ca, va] = a.split(':');
    const [, cb, vb] = b.split(':');
    return Number(ca) - Number(cb) || Number(va) - Number(vb);
  });
  const sorted: Record<string, string[]> = {};
  for (const k of sortedKeys) sorted[k] = beats[k];
  return sorted;
}

// Routed through the same `queue` as saveImage/saveAudio/saveStyle: sources/beats.json is one
// shared file across every ref, so two overlapping saveBeats calls — even for two *different*
// refs — race the same read-modify-write and can silently drop one edit. Serializing here closes
// that window exactly the way the upload functions already close it for the manifest.
function saveBeats(ref: string, beats: string[]): Promise<void> {
  const result = queue.then(() => saveBeatsExclusive(ref, beats));
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function saveBeatsExclusive(ref: string, beats: string[]): Promise<void> {
  const sources = JSON.parse(await readFile(join(REPO_ROOT, 'sources/gita.json'), 'utf8')) as { verses: Verse[] };
  const verseRefs = new Set(sources.verses.map((v) => v.ref));
  // Validates only the changed entry (ref known, 2-6 lines, ≤90 chars, no emoji) — not the whole
  // file — so an edit here can never be rejected by some other, already-committed entry, and can
  // never re-litigate rules an already-valid entry happens to predate.
  validateBeatsFile({ [ref]: beats }, verseRefs);

  const existing = JSON.parse(await readFile(BEATS_PATH(), 'utf8')) as Record<string, string[]>;
  const merged = sortBeatsKeys({ ...existing, [ref]: beats });
  await writeFile(BEATS_PATH(), JSON.stringify(merged, null, 2) + '\n');
}

const PROMPTS_PATH = () => join(REPO_ROOT, 'sources/prompts.json');
const META_PATH = () => join(REPO_ROOT, 'sources/quotes-meta.json');
const CUSTOM_PATH = () => join(REPO_ROOT, 'sources/custom-quotes.json');

async function readJson<T>(path: string, fallback: T): Promise<T> {
  if (!existsSync(path)) return fallback;
  return JSON.parse(await readFile(path, 'utf8')) as T;
}
type QuotesMeta = Record<string, { favorite: boolean }>;

// Joins sources/gita.json with beats/prompts/favorite/style in one pass so the /quotes page and
// Studio never have to re-read four files themselves; `prompt` here is byte-for-byte what
// generate() would use for that verse today (same promptFor() call, same style.promptPrefix).
async function listQuotes(): Promise<QuoteRow[]> {
  const [sources, beatsFile, prompts, meta, style] = await Promise.all([
    readJson<{ verses: Verse[] }>(join(REPO_ROOT, 'sources/gita.json'), { verses: [] }),
    readJson<Record<string, string[]>>(BEATS_PATH(), {}),
    readJson<Record<string, string>>(PROMPTS_PATH(), {}),
    readJson<QuotesMeta>(META_PATH(), {}),
    getStyle(),
  ]);
  return sources.verses.map((v) => {
    const curated = beatsFile[v.ref];
    const beats = curated ?? beatsFromTranslation(v.english);
    const hook = beats[0] ?? '';
    return {
      ref: v.ref, chapter: v.chapter, verse: v.verse, hook, beats, curated: Boolean(curated),
      favorite: meta[v.ref]?.favorite ?? false,
      prompt: promptFor(v.chapter, hook, prompts[v.ref], style.promptPrefix),
      promptCurated: v.ref in prompts,
    };
  });
}

// Routed through the same `queue` as saveBeats: sources/quotes-meta.json is one shared file
// across every ref, so two overlapping setFavorite calls race the same read-modify-write.
function setFavorite(ref: string, favorite: boolean): Promise<void> {
  const result = queue.then(() => setFavoriteExclusive(ref, favorite));
  queue = result.then(() => undefined, () => undefined);
  return result;
}
async function setFavoriteExclusive(ref: string, favorite: boolean): Promise<void> {
  if (!(await getVerse(ref))) throw new Error(`unknown ref ${ref}`);
  const meta = await readJson<QuotesMeta>(META_PATH(), {});
  // `false` deletes the key rather than writing `favorite: false`, so the file only ever lists
  // actual favorites (matching its committed baseline of `{}`).
  if (favorite) meta[ref] = { favorite: true };
  else delete meta[ref];
  await writeFile(META_PATH(), JSON.stringify(meta, null, 2) + '\n');
}

// A read, not a validator: an unknown ref (verse or custom) resolves to null exactly like "no
// curated prompt exists yet" rather than throwing — callers want a display value, not an error.
async function getCuratedPrompt(ref: string): Promise<string | null> {
  if (ref.startsWith(CUSTOM_REF_PREFIX)) {
    const q = (await listCustomQuotes()).find((c) => c.id === ref.slice(CUSTOM_REF_PREFIX.length));
    return q?.prompt || null;
  }
  const prompts = await readJson<Record<string, string>>(PROMPTS_PATH(), {});
  return prompts[ref] ?? null;
}

async function listCustomQuotes(): Promise<CustomQuote[]> {
  return readJson<CustomQuote[]>(CUSTOM_PATH(), []);
}
// All three writers share `queue` (same read-modify-write hazard as saveBeats).
function createCustomQuote(input: unknown): Promise<CustomQuote> {
  const result = queue.then(async () => {
    const all = await listCustomQuotes();
    const q = validateCustomQuote(input, all.map((c) => c.id));
    await writeFile(CUSTOM_PATH(), JSON.stringify([...all, q], null, 2) + '\n');
    return q;
  });
  queue = result.then(() => undefined, () => undefined);
  return result;
}
function updateCustomQuote(id: string, input: unknown): Promise<CustomQuote> {
  const result = queue.then(async () => {
    const all = await listCustomQuotes();
    const i = all.findIndex((c) => c.id === id);
    if (i === -1) throw new Error(`custom quote "${id}" not found`);
    const patch = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const q = validateCustomQuote({ ...all[i], ...patch, id, createdAt: all[i].createdAt }, all.filter((c) => c.id !== id).map((c) => c.id));
    all[i] = q;
    await writeFile(CUSTOM_PATH(), JSON.stringify(all, null, 2) + '\n');
    return q;
  });
  queue = result.then(() => undefined, () => undefined);
  return result;
}
function deleteCustomQuote(id: string): Promise<void> {
  const result = queue.then(async () => {
    const all = await listCustomQuotes();
    if (!all.some((c) => c.id === id)) throw new Error(`custom quote "${id}" not found`);
    await writeFile(CUSTOM_PATH(), JSON.stringify(all.filter((c) => c.id !== id), null, 2) + '\n');
  });
  queue = result.then(() => undefined, () => undefined);
  return result;
}

function errorText(e: unknown): string {
  const err = e as { stdout?: string; stderr?: string; message?: string };
  return [err.stdout, err.stderr, err.message ?? String(e)].filter(Boolean).join('\n');
}

/** git's own stdout/stderr from a failed command, without execa's "Command failed with exit code
 *  N: …" wrapper (which repeats the whole output a second time). Used only for the
 *  nothing-to-commit no-op, where the sync as a whole succeeds and a "Command failed" line would
 *  be actively misleading. Real failures still go through errorText() — nothing is hidden there. */
function gitOutput(e: unknown): string {
  const err = e as { stdout?: string; stderr?: string };
  return [err.stdout, err.stderr].filter(Boolean).join('\n');
}

// Every file the dashboard is allowed to author, and the only thing sync() ever stages or commits.
// One constant rather than two literal lists, so `git add` and the pathspec-scoped `git commit`
// below can never drift apart — a path staged but not in the commit's pathspec would silently stay
// in the index. `public/thumbs` and `schedule.json` join it with the calendar: a row is only usable
// from the cloud once its thumbnail and its entry are both pushed. (public/thumbs is tracked via a
// committed .gitkeep, so this pathspec matches even on a checkout that has never rendered a row —
// a pathspec matching nothing is a fatal `git add`, which would take the whole sync down.)
// `config.json` joins it with Settings: the daily pipeline and the hourly publisher both read it,
// so a handle/schedule edit made here is exactly as "not real yet" as an edited style or beat until
// it's pushed.
const SYNC_PATHS = [
  'public/assets/images',
  'public/assets/manifest.json',
  'styles',
  'sources/beats.json',
  'sources/quotes-meta.json',
  'sources/custom-quotes.json',
  'schedule.json',
  'public/thumbs',
  'config.json',
];

async function sync(): Promise<{ ok: boolean; output: string }> {
  const log: string[] = [];
  try {
    const add = await execa('git', ['add', ...SYNC_PATHS], { cwd: REPO_ROOT });
    log.push(add.stdout, add.stderr);
    try {
      // Pathspec-scoped commit, not a bare `git commit`: a bare commit picks up *anything* the
      // caller happened to have staged (their own in-flight work in another file, say), and
      // pushes it under this message with no way to tell after the fact. Restricting the commit
      // itself to this same explicit pathspec — SYNC_PATHS, the dashboard-owned files — on top of
      // the `git add` above already being scoped the same way — means whatever else is sitting in
      // the index is left exactly as it was, staged and uncommitted, no matter what triggered this
      // sync.
      const commit = await execa(
        'git',
        ['commit', '-m', 'chore: sync dashboard edits (backgrounds, style, beats, quotes, calendar, config)', '--', ...SYNC_PATHS],
        { cwd: REPO_ROOT },
      );
      log.push(commit.stdout, commit.stderr);
    } catch (e) {
      const text = errorText(e);
      // git phrases "nothing is staged" three different ways depending on what else is in the
      // tree: "nothing to commit, working tree clean" (pristine), "no changes added to commit"
      // (unstaged edits elsewhere), "nothing added to commit but untracked files present". This
      // dashboard only ever stages SYNC_PATHS, so all three mean the same no-op — matching
      // only the first made a routine Sync report a red failure to anyone who happened to have an
      // unrelated edit in flight, which is the normal state while working. Verified this still
      // holds now that commit (not just add) is pathspec-scoped: with unrelated changes staged,
      // unstaged, or untracked outside those six paths, `git commit -- <paths>` reuses these same
      // three phrasings (never a pathspec-specific message) — see the scratch-repo scenarios in
      // the fix-up report.
      if (!/nothing to commit|no changes added to commit|nothing added to commit/i.test(text)) throw e;
      // gitOutput, not text: this path ends in ok:true, so execa's "Command failed" wrapper would
      // contradict the result. git's own message is kept — the UI shows this output verbatim.
      log.push(gitOutput(e) || text, '(nothing to commit — skipping)');
    }
    // `-u origin HEAD` rather than a bare `git push`: a branch that has never been published has
    // no upstream, and a bare push aborts with "no upstream branch" instead of syncing. This
    // pushes the current branch to a like-named remote branch and records the upstream, so the
    // first sync from a fresh branch works and every later one is a plain fast-forward push.
    const push = await execa('git', ['push', '-u', 'origin', 'HEAD'], { cwd: REPO_ROOT });
    log.push(push.stdout, push.stderr);
    return { ok: true, output: log.filter(Boolean).join('\n') };
  } catch (e) {
    log.push(errorText(e));
    return { ok: false, output: log.filter(Boolean).join('\n') };
  }
}

// The route checks isAllowedMediaPath first (so it can answer 403 vs 404 correctly — this
// function collapses both "outside the whitelist" and "no such file" to null). Re-checked here
// too, so openMedia itself is never a trapdoor for some future caller that forgot to gate it.
function openMedia(rel: string): MediaHandle | null {
  const safeRel = normalize(rel);
  if (!isAllowedMediaPath(safeRel)) return null;
  const abs = join(REPO_ROOT, safeRel);
  let size: number;
  try {
    size = statSync(abs).size;
  } catch {
    return null;
  }
  const type = MEDIA_TYPES[safeRel.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream';
  return {
    size,
    type,
    // Built by hand instead of via Readable.toWeb(), for the same reason generateStream guards
    // every controller touch. A browser <video> routinely abandons a media request the moment it
    // has the bytes it wants (the metadata probe, and every seek), which closes the response's
    // stream controller while the file read is still in flight; toWeb()'s adapter then enqueues
    // onto that dead controller and the resulting "Invalid state: Controller is already closed"
    // TypeError escapes from a stream event handler as an uncaughtException. That is not
    // hypothetical: one dashboard session with a 7-tile library and an inline player produced 12
    // of them, every one immediately after a 206. Here each controller touch is try/catch'd, the
    // first failure (or close/error) settles the stream for good, and the file descriptor is
    // destroyed on cancel so an abandoned request stops reading instead of draining the file.
    stream(start, end) {
      const source = createReadStream(abs, start === undefined ? undefined : { start, end });
      return new ReadableStream<Uint8Array>({
        start(c) {
          let settled = false;
          const touch = (fn: () => void) => {
            if (settled) return;
            try {
              fn();
            } catch {
              // Consumer tore the controller down (aborted request): stop reading, never touch
              // the controller again.
              settled = true;
              source.destroy();
            }
          };
          // The `string` arm is unreachable — createReadStream is opened without an encoding, so
          // it only ever emits Buffers — but @types/node models the setEncoding() case in the
          // same signature, and converting is cheaper than lying with a cast. Copying into a
          // fresh Uint8Array (rather than enqueuing the Buffer itself) matches generateStream and
          // avoids handing the consumer a view over Node's pooled buffer memory.
          source.on('data', (chunk: string | Buffer) => {
            touch(() => {
              c.enqueue(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : new Uint8Array(chunk));
              // Backpressure, which Readable.toWeb() gave us for free: stop reading once the
              // consumer's queue is full and wait for pull() below, so serving a 23 MB reel
              // doesn't buffer the whole file in memory.
              if (c.desiredSize !== null && c.desiredSize <= 0) source.pause();
            });
          });
          source.on('end', () => touch(() => { c.close(); settled = true; }));
          source.on('error', (e) => touch(() => { c.error(e); settled = true; }));
        },
        pull() {
          source.resume();
        },
        cancel() {
          source.destroy();
        },
      });
    },
  };
}

const LOCK = () => join(REPO_ROOT, 'out/.render-lock');
const LOCK_STALE_MS = 15 * 60 * 1000;

/** True while a child spawned here (a render or a publisher run) is still working. A lock older
 *  than LOCK_STALE_MS is a crashed run's leftover and reads as idle, same as an absent or corrupt
 *  one — the single staleness rule every caller sees. */
function lockHeld(): boolean {
  try {
    const { startedAt } = JSON.parse(readFileSync(LOCK(), 'utf8'));
    return Date.now() - startedAt < LOCK_STALE_MS;
  } catch {
    return false; // absent or corrupt → claimable
  }
}

function acquireLock(): boolean {
  mkdirSync(join(REPO_ROOT, 'out'), { recursive: true });
  if (lockHeld()) return false; // fresh lock → busy
  writeFileSync(LOCK(), JSON.stringify({ pid: process.pid, startedAt: Date.now() }));
  return true;
}
const releaseLock = () => { try { unlinkSync(LOCK()); } catch { /* already gone */ } };

/** This lock is the ONLY mutual exclusion between the schedule.json writes below (serialized by
 *  `queue`, which only covers this process) and pipeline/publisher.ts's own read-modify-write of
 *  the same file in a spawned child: the CLI reads the calendar, renders or posts for minutes,
 *  then re-reads and writes. An edit that landed inside that window would be picked up by the
 *  CLI's re-read and written back under the row it rebuilt — or silently dropped — so calendar
 *  edits are refused while a run is in flight rather than merged and hoped for. */
function assertPublisherIdle(): void {
  if (lockHeld()) throw new Error('publisher running');
}

// Basename only, matching the `--background <file>` contract (pipeline/run.ts resolves it
// against the asset pool by exact file name): alnum/dot/underscore/hyphen, 1-200 chars, and never
// leading with '-' (so it can't be misread as a CLI flag rather than a value, e.g. "--verse").
// Empty/falsy background means "no override" (the Auto rotation) and is never passed here — see
// the `background && ...` guard below, which mirrors the existing `background ? [...] : []` used
// to build the child process args a few lines down.
function isValidBackgroundName(name: string): boolean {
  return /^[A-Za-z0-9._-]{1,200}$/.test(name) && !name.startsWith('-');
}

type GenerateOverrides = { beats?: string[]; style?: unknown; music?: string | null };
const MAX_OVERRIDE_BEATS = 6;
const OVERRIDES_PATH = () => join(REPO_ROOT, 'out/studio-overrides.json');

// Same shape the route enforces (see generate/route.ts's isValidOverrides) — checked here too so
// a caller that bypasses the route can't hand the pipeline a malformed overrides file. This is
// deliberately shallow: per-beat length/emoji rules and music-pool membership are pipeline/run.ts's
// job (resolveCinemaInputs) — see the studio-panel plan's Task 3 self-review ruling that CLI
// --overrides gets its own defense-in-depth there.
function isValidOverridesShape(o: unknown): o is GenerateOverrides {
  if (o === null || typeof o !== 'object' || Array.isArray(o)) return false;
  const r = o as Record<string, unknown>;
  if ('beats' in r && r.beats !== undefined) {
    if (!Array.isArray(r.beats) || r.beats.length > MAX_OVERRIDE_BEATS || !r.beats.every((b) => typeof b === 'string'))
      return false;
  }
  if ('music' in r && r.music !== undefined && r.music !== null && typeof r.music !== 'string') return false;
  if ('style' in r && r.style !== undefined) {
    if (typeof r.style !== 'object' || r.style === null || Array.isArray(r.style)) return false;
  }
  return true;
}

function generateStream(
  ref: string,
  background?: string,
  format?: 'classic' | 'cinema',
  overrides?: GenerateOverrides,
): ReadableStream<Uint8Array> | 'locked' {
  if (typeof ref !== 'string' || !REF_PATTERN.test(ref)) throw new Error('bad ref');
  if (background && !isValidBackgroundName(background)) throw new Error('invalid background');
  if (format !== undefined && format !== 'classic' && format !== 'cinema') throw new Error('invalid format');
  if (overrides !== undefined && !isValidOverridesShape(overrides)) throw new Error('invalid overrides');
  if (!acquireLock()) return 'locked';
  // Written only after the lock is ours: only one render is ever in flight, so there is never a
  // second writer racing this file out from under the render that is about to read it.
  if (overrides !== undefined) writeFileSync(OVERRIDES_PATH(), JSON.stringify(overrides, null, 2) + '\n');
  return spawnStream([
    'tsx',
    'pipeline/run.ts',
    '--verse',
    ref,
    '--dry-run',
    ...(background ? ['--background', background] : []),
    ...(format ? ['--format', format] : []),
    ...(overrides !== undefined ? ['--overrides', 'out/studio-overrides.json'] : []),
  ]);
}

/** Runs `npx <args>` in the repo root and streams its combined stdout/stderr live, ending in
 *  `EXIT <code>`. The CALLER must already hold the render lock (see acquireLock, and the
 *  overrides-file ordering in generateStream that is why acquisition can't move in here); this
 *  function owns *releasing* it, exactly once. Shared by generateStream and calendarCommand so the
 *  process-group, cancel and release rules below exist in exactly one place. */
function spawnStream(args: string[]): ReadableStream<Uint8Array> {
  const proc = spawn('npx', args, {
    cwd: REPO_ROOT,
    // ~/.local/bin is where pipx puts edge-tts, and it is not on the PATH a dev server started
    // from a GUI/launcher inherits — without this, a classic render dies at the narration step.
    env: { ...process.env, PATH: `${process.env.PATH}:${join(homedir(), '.local/bin')}` },
    // `detached` makes `proc` the leader of its own process group instead of joining ours, so
    // cancel() below can signal the *whole* group (npx -> tsx -> the pipeline -> the execa'd
    // `npx remotion render` -> the remotion CLI -> its native compositor helper) with one call.
    // Without this, killing only `proc` leaves that entire render tree running as orphans that
    // keep the stdout/stderr pipes open — which means 'close' never fires, the lock never
    // releases, and the render silently keeps consuming CPU/GPU forever (verified live: after
    // `proc.kill('SIGTERM')` alone, `ps` still showed the remotion + compositor processes running
    // minutes later, reparented to pid 1, with out/.render-lock still present).
    detached: true,
  });

  // The lock must be released exactly once, and only once the child process has actually,
  // confirmedly exited (a 'close' or 'error' event) — never from cancel() itself. cancel() fires
  // the instant a client disconnects, which races the OS's asynchronous delivery of SIGTERM and
  // the process's own exit; releasing the lock right there let a canceled render's lock get
  // reclaimed by a fresh generate, and then let the original (now-zombie) process's *later*
  // close event delete that fresh render's lock out from under it — silently breaking the design
  // spec's §5 "one render at a time" guarantee. `released` below guards the single real release;
  // `canceled` stops the close/error handlers from ever touching a controller the consumer has
  // already torn down (enqueue/close on it throws "Invalid state: Controller is already closed").
  let canceled = false;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    releaseLock();
  };

  return new ReadableStream<Uint8Array>({
    start(c) {
      // Belt-and-braces: every write path checks `canceled` AND is try/catch-guarded, so even an
      // unanticipated ordering (e.g. a straggling 'data' event racing the teardown) can't throw
      // an uncaught exception out of a child-process event handler and take the server down.
      const push = (d: Buffer) => {
        if (canceled) return;
        try {
          c.enqueue(new Uint8Array(d));
        } catch { /* controller already torn down */ }
      };
      proc.stdout.on('data', push);
      proc.stderr.on('data', push);
      proc.on('close', (code) => {
        release();
        if (canceled) return;
        try {
          c.enqueue(new TextEncoder().encode(`\nEXIT ${code ?? 1}\n`));
          c.close();
        } catch { /* controller already torn down */ }
      });
      proc.on('error', (e) => {
        release();
        if (canceled) return;
        try {
          c.enqueue(new TextEncoder().encode(`\n${e.message}\nEXIT 1\n`));
          c.close();
        } catch { /* controller already torn down */ }
      });
    },
    cancel() {
      // Do NOT release the lock here — see the comment above `canceled`/`released`. The
      // close/error handler (which still fires after kill) is the only place that releases it.
      canceled = true;
      // Signal the whole process group (negative pid), not just `proc` itself — see the
      // `detached` comment above for why a plain `proc.kill(...)` targeting only `proc` isn't
      // enough to make the render tree actually exit (and thus isn't enough to make 'close' fire
      // promptly). SIGINT, not SIGTERM: Remotion's CLI (node_modules/@remotion/cli/dist/
      // cleanup-before-quit.js) only registers a graceful-shutdown handler for SIGINT (the same
      // signal a Ctrl+C sends) — that handler is what closes its headless-Chrome render workers.
      // SIGTERM has no such handler, so the CLI process dies immediately without running it,
      // leaving those Chrome processes orphaned indefinitely (verified live: `proc.kill('SIGTERM')`
      // released our lock but left 4 chrome-headless-shell processes running, reparented to pid 1,
      // minutes later). npx/tsx have no SIGINT handler of their own, so they still terminate
      // (Node's default disposition for an unhandled SIGINT is to exit) — only the one process
      // that needs to run cleanup first actually gets the chance to.
      if (proc.pid) {
        try {
          process.kill(-proc.pid, 'SIGINT');
        } catch {
          proc.kill('SIGINT'); // group already gone (e.g. process never fully started) — fall back
        }
      } else {
        proc.kill('SIGINT');
      }
    },
  });
}

const SCHEDULE_PATH = () => join(REPO_ROOT, 'schedule.json');
const thumbPath = (id: string) => join(REPO_ROOT, 'public/thumbs', `${id}.jpg`);

// Only the two fields the calendar view needs; config.json carries the daily pipeline's settings
// too, and re-declaring those here would just be a second copy to keep in step.
type CalendarConfig = { mode?: string; schedule?: unknown };

async function getCalendar(): Promise<CalendarView> {
  const [file, config] = await Promise.all([
    // Deliberately NOT readJson-with-a-fallback: readSchedule throws on a malformed calendar
    // (the route answers 500 with that message) because this file is the record of what has
    // already been published — degrading to "nothing scheduled" would invite a re-post.
    readSchedule(SCHEDULE_PATH()),
    readJson<CalendarConfig>(join(REPO_ROOT, 'config.json'), {}),
  ]);
  // A COPY of process.env, never process.env itself: loadDotenv fills in whatever object it is
  // handed, and the dashboard must not end up holding publishing credentials in its own
  // environment for the life of the process (every child it later spawns would inherit them —
  // and the publisher child loads .env for itself anyway). Real env vars still win over .env,
  // which is loadDotenv's own rule.
  const env: NodeJS.ProcessEnv = { ...process.env };
  loadDotenv(join(REPO_ROOT, '.env'), env);
  const secrets = {} as Record<Platform, boolean>;
  // Booleans only — secretsFor's `missing` names are not exposed to the browser, and the flag is
  // all the UI needs to decide whether "Publish now" can do anything from this machine.
  for (const p of PLATFORMS) secrets[p] = secretsFor(p, env).ok;
  return {
    items: sortItems(file.items),
    config: validateScheduleConfig(config.schedule),
    secrets,
    // Same default as .github/workflows/daily.yml's guard (`config.mode || 'daily'`): anything
    // that isn't the literal 'calendar' means the daily pipeline still owns posting.
    mode: config.mode === 'calendar' ? 'calendar' : 'daily',
  };
}

// Which stored statuses each editable target may be reached FROM — the calendar's Retry and Skip
// buttons. 'published' is in neither list on purpose; applyPostPatch rejects it earlier with a
// message that says why, rather than letting it fail as a generic bad transition.
const RESCHEDULABLE_FROM: readonly PostStatus[] = ['failed', 'skipped', 'scheduled', 'draft'];
const SKIPPABLE_FROM: readonly PostStatus[] = ['scheduled', 'draft'];

/** Pure: the stored record + the patch -> the record to write, or a throw whose message the route
 *  turns into a 400. Split out from the file IO so the whole rule set reads as one list, and so
 *  the type-level `PostPatch` is re-checked at runtime — the PATCH route hands us parsed JSON,
 *  which is `unknown` no matter what the signature says. */
function applyPostPatch(post: PostRecord, patch: PostPatch): PostRecord {
  // A published post is the record of something that actually went out: its time, status,
  // attempts and platform id are history and stay put. Only the human-facing text may still be
  // corrected — fixing a typo in a caption that is already live is worth doing in the calendar
  // too, and it changes nothing about what happened.
  if (post.status === 'published' && (patch.at !== undefined || patch.status !== undefined)) {
    throw new Error('published posts cannot be edited');
  }
  const next: PostRecord = { ...post };
  if (patch.at !== undefined) {
    if (patch.at === null) next.at = null;
    else if (typeof patch.at !== 'string' || Number.isNaN(Date.parse(patch.at))) {
      throw new Error('at must be an ISO instant or null');
    } else {
      // Normalized rather than stored verbatim: `at` is read as an instant everywhere downstream
      // (duePosts compares it, isoToLocal formats it), so the file keeps one canonical spelling
      // whatever the client sent.
      next.at = new Date(patch.at).toISOString();
    }
  }
  if (patch.caption !== undefined) {
    if (typeof patch.caption !== 'string' || patch.caption.length > CAPTION_MAX) {
      throw new Error(`caption must be a string of at most ${CAPTION_MAX} characters`);
    }
    next.caption = patch.caption;
  }
  if (patch.title !== undefined) {
    if (typeof patch.title !== 'string' || patch.title.length > TITLE_MAX) {
      throw new Error(`title must be a string of at most ${TITLE_MAX} characters`);
    }
    next.title = patch.title;
  }
  if (patch.status !== undefined) {
    if (patch.status === 'scheduled') {
      if (!RESCHEDULABLE_FROM.includes(post.status)) throw new Error(`cannot reschedule a ${post.status} post`);
      next.status = 'scheduled';
      // Retry means "start over", so the attempt count goes back to 0 — duePosts only re-picks a
      // failed post while attempts < MAX_ATTEMPTS — and the old error goes away rather than
      // sitting next to a scheduled badge where it reads as a live failure.
      next.attempts = 0;
      delete next.error;
    } else if (patch.status === 'skipped') {
      if (!SKIPPABLE_FROM.includes(post.status)) throw new Error(`cannot skip a ${post.status} post`);
      next.status = 'skipped';
    } else {
      throw new Error("status must be 'scheduled' or 'skipped'");
    }
  }
  return next;
}

// Routed through the same `queue` as every other shared-file writer: schedule.json is one file for
// every row and platform, so two overlapping PATCHes (or a PATCH racing a DELETE) would race the
// same read-modify-write and one edit would vanish. The cross-*process* race — the publisher CLI
// doing its own read-modify-write — is what assertPublisherIdle covers instead.
function updatePost(id: string, platform: Platform, patch: PostPatch): Promise<ScheduleItem> {
  const result = queue.then(() => updatePostExclusive(id, platform, patch));
  queue = result.then(() => undefined, () => undefined);
  return result;
}

async function updatePostExclusive(id: string, platform: Platform, patch: PostPatch): Promise<ScheduleItem> {
  // Checked inside the queue, not at call time: the answer that matters is whether a run is in
  // flight at the moment this write is about to happen.
  assertPublisherIdle();
  const path = SCHEDULE_PATH();
  const file = await readSchedule(path);
  const item = file.items.find((i) => i.id === id);
  if (!item) throw new Error(`no calendar item ${id}`);
  item.posts[platform] = applyPostPatch(item.posts[platform], patch);
  await writeSchedule(path, file);
  return item;
}

function deleteItem(id: string): Promise<void> {
  const result = queue.then(() => deleteItemExclusive(id));
  queue = result.then(() => undefined, () => undefined);
  return result;
}

async function deleteItemExclusive(id: string): Promise<void> {
  assertPublisherIdle();
  const path = SCHEDULE_PATH();
  const file = await readSchedule(path);
  const item = file.items.find((i) => i.id === id);
  if (!item) throw new Error(`no calendar item ${id}`);
  // schedule.json is the only place that records a post actually going out (state.json tracks
  // refs, not rows), so a row with a published post is never deletable. The UI disables Delete;
  // this is the backstop that makes that a rule rather than a convention.
  if (PLATFORMS.some((p) => item.posts[p].status === 'published')) throw new Error(`${id} has published posts`);
  await writeSchedule(path, { items: file.items.filter((i) => i.id !== id) });
  // After the write, and best-effort: an orphaned thumbnail is harmless, whereas a thumbnail
  // deleted for a row that is still in the file leaves a broken image in the table. Built from
  // the id readSchedule already validated against ITEM_ID, never from the row's own `thumbnail`
  // string, so a hand-edited path can't aim this unlink somewhere else.
  await unlink(thumbPath(item.id)).catch(() => {});
}

const CALENDAR_SUBCOMMANDS = ['--add', '--rerender', '--publish-item'];
const CALENDAR_FLAGS = new Set([...CALENDAR_SUBCOMMANDS, '--date', '--format', '--from-last-render', '--platform']);

// calendarCommand spawns whatever it is handed, so the flag vocabulary is pinned here even though
// the routes build these arrays themselves: pipeline/publisher.ts also understands --auto-fill,
// --publish-due, --now and --days, and slipping one of those in would turn "re-render this row"
// into a full hourly run that posts everything currently due. Bare argv (no subcommand at all) IS
// that run, so it is rejected too. Values stay the caller's job — the routes check ref/date/id/
// platform and parsePublisherArgs checks them again inside the child — and since no valid value
// can start with '-' (REF_PATTERN, ITEM_ID, YYYY-MM-DD and PLATFORMS all begin alphanumeric),
// "an unknown token that starts with '-'" is a safe thing to refuse.
function assertCalendarArgs(args: string[]): void {
  if (!Array.isArray(args) || !args.every((a) => typeof a === 'string')) throw new Error('invalid calendar command');
  if (args.some((a) => a.startsWith('-') && !CALENDAR_FLAGS.has(a))) throw new Error('invalid calendar command');
  if (!args.some((a) => CALENDAR_SUBCOMMANDS.includes(a))) throw new Error('invalid calendar command');
}

function calendarCommand(args: string[]): ReadableStream<Uint8Array> | 'locked' {
  assertCalendarArgs(args);
  // The same lock as generateStream, for the same reason and one more: a publisher run both
  // renders (one render at a time) and rewrites schedule.json, which is exactly what makes this
  // lock the single point of mutual exclusion with updatePost/deleteItem above.
  if (!acquireLock()) return 'locked';
  return spawnStream(['tsx', 'pipeline/publisher.ts', ...args]);
}

export const localBackend: Backend = {
  repoRoot,
  listAssets,
  saveImage,
  saveAudio,
  getState,
  getVerse,
  getConfig,
  updateConfig,
  getConnections,
  getStyle,
  saveStyle,
  getBeats,
  saveBeats,
  listQuotes,
  setFavorite,
  getCuratedPrompt,
  listCustomQuotes,
  createCustomQuote,
  updateCustomQuote,
  deleteCustomQuote,
  sync,
  openMedia,
  generate: generateStream,
  getCalendar,
  updatePost,
  deleteItem,
  calendarCommand,
};
