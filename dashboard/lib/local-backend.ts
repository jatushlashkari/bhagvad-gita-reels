import { createReadStream, existsSync, statSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join, normalize, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { execa } from 'execa';
import sharp from 'sharp';
import { listBackgroundPool } from '../../shared/backgrounds.ts';
import { appendImageEntry, slugifyImageName } from '../../shared/assets-store.ts';
import { isAllowedMediaPath } from '../../shared/media-path.ts';
import { pickNext, readState, verseOrder, type PlatformKey } from '../../pipeline/select.ts';
import type { Manifest } from '../../scripts/fetch-assets.ts';
import type { Verse } from '../../shared/types.ts';
import type { AssetInfo, Backend, MediaHandle, StateSummary } from './backend.ts';

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
};

/** Thrown by saveImage when the uploaded bytes don't decode as an image (e.g. a text file
 *  renamed with a .jpg extension). Routes catch this specifically to answer a clean 400
 *  instead of letting an opaque 500 leak out of the sharp pipeline. */
export class InvalidImageError extends Error {}

async function readManifest(): Promise<Manifest> {
  return JSON.parse(await readFile(join(REPO_ROOT, 'public/assets/manifest.json'), 'utf8'));
}

async function writeManifestFile(manifest: Manifest): Promise<void> {
  await writeFile(join(REPO_ROOT, 'public/assets/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

function repoRoot(): string {
  return REPO_ROOT;
}

async function listAssets(): Promise<AssetInfo[]> {
  const pool = listBackgroundPool(REPO_ROOT);
  const manifest = await readManifest();
  return pool.map((p) => {
    const entry =
      p.kind === 'clip'
        ? manifest.backgrounds.find((e) => e.file === p.file)
        : manifest.images.find((e) => e.file === p.file);
    return { file: p.file, rel: p.rel, kind: p.kind, license: entry?.license ?? '—' };
  });
}

// Concurrent uploads must not interleave: two requests racing through slugifyImageName could
// compute the same slug, or two manifest read-modify-write cycles could race and one write
// could silently clobber the other's appended entry. The dashboard runs as a single Node
// process, so a module-level promise chain is enough to serialize saveImage calls end-to-end
// (slug pick -> resize -> write -> manifest read-modify-write) without needing a real file lock.
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

async function getState(): Promise<StateSummary> {
  const [state, config, sources] = await Promise.all([
    readState(join(REPO_ROOT, 'state.json')),
    readFile(join(REPO_ROOT, 'config.json'), 'utf8').then(
      (s) => JSON.parse(s) as { startRef: string; platforms: PlatformKey[] },
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

  return { lastPosted, nextRef, totalPosted: state.posted.length, chapters };
}

async function getVerse(ref: string): Promise<{ sanskrit: string[]; hindi: string; english: string } | null> {
  const sources = JSON.parse(await readFile(join(REPO_ROOT, 'sources/gita.json'), 'utf8')) as { verses: Verse[] };
  const verse = sources.verses.find((v) => v.ref === ref);
  return verse ? { sanskrit: verse.sanskrit, hindi: verse.hindi, english: verse.english } : null;
}

function errorText(e: unknown): string {
  const err = e as { stdout?: string; stderr?: string; message?: string };
  return [err.stdout, err.stderr, err.message ?? String(e)].filter(Boolean).join('\n');
}

async function sync(): Promise<{ ok: boolean; output: string }> {
  const log: string[] = [];
  try {
    const add = await execa('git', ['add', 'public/assets/images', 'public/assets/manifest.json'], {
      cwd: REPO_ROOT,
    });
    log.push(add.stdout, add.stderr);
    try {
      const commit = await execa('git', ['commit', '-m', 'feat: add custom background images via dashboard'], {
        cwd: REPO_ROOT,
      });
      log.push(commit.stdout, commit.stderr);
    } catch (e) {
      const text = errorText(e);
      if (!/nothing to commit/i.test(text)) throw e;
      log.push(text, '(nothing to commit — skipping)');
    }
    const push = await execa('git', ['push'], { cwd: REPO_ROOT });
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
    stream(start, end) {
      return Readable.toWeb(
        createReadStream(abs, start === undefined ? undefined : { start, end }),
      ) as ReadableStream<Uint8Array>;
    },
  };
}

export const localBackend: Backend = {
  repoRoot,
  listAssets,
  saveImage,
  getState,
  getVerse,
  sync,
  openMedia,
};
