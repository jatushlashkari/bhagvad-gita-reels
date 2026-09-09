import { createWriteStream, existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execa } from 'execa';
import ffmpegPath from 'ffmpeg-static';
import { validateScheduleFile, type Platform, type ScheduleFile } from '../shared/schedule.ts';
import { CUSTOM_REF_PREFIX, placeholderVerse, type CustomQuote } from '../shared/custom-quotes.ts';
import type { Verse } from '../shared/types.ts';

/** Side-effecting helpers behind the publisher: file IO, ffmpeg, network, env.
 *  The decisions live in schedule-plan.ts; the orchestration in publisher.ts. */

// An absent calendar is the normal first-run state; a malformed one is not — it is the
// source of truth for what has already been published, so a bad file fails loudly rather
// than silently reverting to "nothing scheduled" (which would re-render and re-post).
export async function readSchedule(path: string): Promise<ScheduleFile> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { items: [] };
    throw e;
  }
  return validateScheduleFile(JSON.parse(raw));
}

// tmp + rename: the workflow commits this file, and a crash mid-write must never
// leave a half-written calendar behind (same contract as writeState).
export async function writeSchedule(path: string, file: ScheduleFile): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(file, null, 2) + '\n');
  await rename(tmp, path);
}

// A still from 1.5s in (past the fade-in) at ~200px wide: small enough to commit for
// every calendar row, big enough to recognise the reel in the dashboard table.
export async function thumbnail(videoPath: string, outPath: string): Promise<void> {
  await mkdir(dirname(outPath), { recursive: true });
  await execa(ffmpegPath as unknown as string, [
    '-y', '-ss', '1.5', '-i', videoPath, '-frames:v', '1', '-vf', 'scale=200:-2', outPath,
  ]);
}

// YouTube uploads a local file, so a due YouTube post pulls its own release asset back
// down (GitHub answers with a 302 to the storage host — fetch follows it by default).
export async function downloadAsset(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
  await mkdir(dirname(dest), { recursive: true });
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest));
}

export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim(); // only the FIRST '=' splits, so tokens may contain '='
    const quote = value[0];
    if (value.length > 1 && (quote === '"' || quote === "'") && value.endsWith(quote)) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

// Local convenience only: the workflow injects real secrets as env vars, and those must
// always win over a stale .env sitting in the checkout.
export function loadDotenv(path: string, env: NodeJS.ProcessEnv): void {
  if (!existsSync(path)) return;
  for (const [k, v] of Object.entries(parseDotenv(readFileSync(path, 'utf8')))) {
    if (env[k] === undefined) env[k] = v;
  }
}

export function resolveVerse(ref: string, sources: { verses: Verse[] }, quotes: CustomQuote[]): Verse {
  if (ref.startsWith(CUSTOM_REF_PREFIX)) {
    const id = ref.slice(CUSTOM_REF_PREFIX.length);
    const quote = quotes.find((q) => q.id === id);
    if (!quote) throw new Error(`custom quote "${id}" not found`);
    return placeholderVerse(quote);
  }
  const verse = sources.verses.find((v) => v.ref === ref);
  if (!verse) throw new Error(`verse ${ref} not in sources`);
  return verse;
}

const SECRET_KEYS: Record<Platform, string[]> = {
  youtube: ['YT_CLIENT_ID', 'YT_CLIENT_SECRET', 'YT_REFRESH_TOKEN'],
  instagram: ['IG_USER_ID', 'IG_ACCESS_TOKEN'],
  facebook: ['FB_PAGE_ID', 'FB_PAGE_ACCESS_TOKEN'],
};

// Names only — a caller may log `missing`, so values never leave this module.
export function secretsFor(platform: Platform, env: NodeJS.ProcessEnv): { ok: true } | { ok: false; missing: string[] } {
  const missing = SECRET_KEYS[platform].filter((k) => !env[k]);
  return missing.length ? { ok: false, missing } : { ok: true };
}
