import { createWriteStream, existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execa } from 'execa';
import ffmpegPath from 'ffmpeg-static';

export type AssetEntry = { file: string; url: string; license: string; source: string; credit?: string };
export type Manifest = { backgrounds: AssetEntry[]; music: AssetEntry[]; fonts: AssetEntry[] };

const DIRS = { backgrounds: 'public/assets/backgrounds', music: 'public/assets/music' } as const;
const UA = 'GitaReelsAssetFetcher/1.0 (https://github.com/; contact via repo)';

// Source clips arrive as arbitrary-size VP9/4K; serving those to concurrent render tabs
// starves the render server (fonts time out). Normalize once: 12s, 1080x1920 cover-crop,
// 30fps H.264 — small files, cheap decode, deterministic look.
export async function normalizeBackground(src: string, dest: string): Promise<void> {
  await execa(ffmpegPath as unknown as string, [
    '-y', '-stream_loop', '-1', '-i', src, // loop short sources so output is always exactly 12s
    '-t', '12',
    '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
    '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart',
    dest,
  ]);
}

export function readManifest(): Manifest {
  return JSON.parse(readFileSync('public/assets/manifest.json', 'utf8'));
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
  try {
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest));
  } catch (e) {
    if (existsSync(dest)) unlinkSync(dest); // never leave truncated files for the render to trip on
    throw e;
  }
}

async function main(): Promise<void> {
  const manifest = readManifest();
  let downloaded = 0;
  let cached = 0;
  let failed = 0;
  for (const kind of ['backgrounds', 'music'] as const) {
    mkdirSync(DIRS[kind], { recursive: true });
    for (const e of manifest[kind]) {
      const dest = `${DIRS[kind]}/${e.file}`;
      if (existsSync(dest)) {
        cached++;
        continue;
      }
      process.stdout.write(`downloading ${e.file} ... `);
      try {
        if (kind === 'backgrounds') {
          const raw = `${dest}.orig`;
          await download(e.url, raw);
          process.stdout.write('normalizing ... ');
          await normalizeBackground(raw, dest);
          unlinkSync(raw);
        } else {
          await download(e.url, dest);
        }
        console.log('ok');
        downloaded++;
      } catch (err) {
        console.log(`FAILED: ${(err as Error).message}`);
        failed++;
      }
    }
  }
  console.log(`${downloaded} downloaded, ${cached} cached, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

if (process.argv[1]?.endsWith('fetch-assets.ts')) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
