import { createWriteStream, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execa } from 'execa';
import ffmpegPath from 'ffmpeg-static';
import type { AssetEntry, Manifest } from './fetch-assets.ts';

const UA = 'GitaReelsAssetCuration/1.0 (https://github.com/; contact via repo)';
const DIR = 'public/assets/images';
const MANIFEST_PATH = 'public/assets/manifest.json';

// Hard license gate: only unambiguous public-domain marks. Everything else — any CC-BY,
// CC-BY-SA, CC0, "no license", etc. — aborts the whole run before anything is downloaded.
const PD_LICENSE = /^(public domain|pd(-.*)?)$/i;

// Candidates curated by hand from Commons search (`Raja Ravi Varma Krishna filetype:bitmap`,
// `Raja Ravi Varma painting Vishnu`, `Raja Ravi Varma Saraswati`, `Raja Ravi Varma Lakshmi`) —
// portrait-leaning paintings with a single deity as the central subject, so a 1080x1920 center
// crop keeps the figure intact. `crop` overrides the default centered crop when the subject
// isn't centered enough to survive `crop=1080:1920` as-is (see Step 2 visual verification).
type Candidate = { title: string; slug: string; crop?: string };

const CANDIDATES: Candidate[] = [
  // Vasudev carrying the infant Krishna across the Yamuna (Ravi Varma Press oleograph) —
  // single centered figure, subject already mid-frame, default crop is safe.
  { title: 'File:Vintage Print Vasudev with Child Krishna oleograph.jpg', slug: 'vasudev-krishna' },
  { title: 'File:Radha in the Moonlight.jpg', slug: 'radha-moonlight' },
  { title: 'File:Saraswati by Raja Ravi Varma.jpg', slug: 'saraswati' },
  { title: 'File:Raja Ravi Varma, Goddess Lakshmi, 1896.jpg', slug: 'lakshmi' },
  // Source is 972x1200 with Krishna embracing Yashoda from the LEFT third of the frame —
  // the default centered crop pushes him out of frame entirely, so pin the crop to the
  // left edge (verified visually against the raw painting; see task-7 report).
  { title: 'File:Yashoda with Krishna, Raja Ravi Varma.jpg', slug: 'yashoda-krishna', crop: 'crop=1080:1920:0:0' },
];

type ImageInfo = { url: string; width: number; height: number; license: string; source: string };

async function fetchImageInfo(title: string): Promise<ImageInfo> {
  const api = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url|size|extmetadata`;
  const res = await fetch(api, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Commons API HTTP ${res.status} for ${title}`);
  const data = (await res.json()) as {
    query: { pages: Record<string, { title: string; missing?: string; imageinfo?: Array<{
      url: string; width: number; height: number; descriptionurl: string;
      extmetadata: { LicenseShortName?: { value: string } };
    }> }> };
  };
  const page = Object.values(data.query.pages)[0];
  if (!page || page.missing !== undefined || !page.imageinfo?.[0]) {
    throw new Error(`Commons file not found: ${title}`);
  }
  const ii = page.imageinfo[0];
  const license = ii.extmetadata.LicenseShortName?.value ?? '(none)';
  return {
    url: ii.url.split('?')[0],
    width: ii.width,
    height: ii.height,
    license,
    source: ii.descriptionurl,
  };
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
  try {
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest));
  } catch (e) {
    if (existsSync(dest)) unlinkSync(dest); // never leave a truncated original behind
    throw e;
  }
}

// Cover-crop to the reel's 1080x1920 canvas. `crop` lets a caller override the default
// centered crop (e.g. `crop=1080:1920:x:y`) when the subject isn't centered in the source.
export async function normalizeSeedImage(src: string, dest: string, crop = 'crop=1080:1920'): Promise<void> {
  await execa(ffmpegPath as unknown as string, [
    '-y', '-i', src,
    '-vf', `scale=1080:1920:force_original_aspect_ratio=increase,${crop}`,
    '-frames:v', '1', '-q:v', '3',
    dest,
  ]);
}

function readManifest(): Manifest {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

function writeManifest(manifest: Manifest): void {
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function main(): Promise<void> {
  mkdirSync(DIR, { recursive: true });

  // Phase 1: resolve + license-gate every candidate before touching disk. One bad license
  // aborts the whole run — no partial download/manifest state to clean up afterward.
  console.log(`resolving ${CANDIDATES.length} candidates from Commons...`);
  const resolved: Array<Candidate & ImageInfo> = [];
  for (const c of CANDIDATES) {
    const info = await fetchImageInfo(c.title);
    if (!PD_LICENSE.test(info.license)) {
      throw new Error(
        `ABORT: "${c.title}" has license "${info.license}" — only Public domain/PD-Art/PD-old-* accepted. No files downloaded.`,
      );
    }
    console.log(`  ok  ${c.title} — ${info.width}x${info.height}, license=${info.license}`);
    if (info.width < 1000) console.warn(`  warn  ${c.title} is narrower than 1000px (${info.width}px)`);
    resolved.push({ ...c, ...info });
  }

  // Phase 2: download originals, normalize, collect manifest entries.
  const newEntries: AssetEntry[] = [];
  for (const r of resolved) {
    const file = `seed-rrv-${r.slug}.jpg`;
    const dest = `${DIR}/${file}`;
    const raw = `${dest}.orig`;
    process.stdout.write(`downloading ${file} ... `);
    await download(r.url, raw);
    process.stdout.write('normalizing ... ');
    await normalizeSeedImage(raw, dest, r.crop);
    unlinkSync(raw);
    console.log('ok');
    newEntries.push({ file, url: r.url, license: r.license, source: r.source });
  }

  // Replace any previous seed-rrv-* entries (idempotent re-runs); keep everything else
  // (e.g. sample-gradient.jpg) untouched.
  const manifest = readManifest();
  manifest.images = [...manifest.images.filter((e) => !e.file.startsWith('seed-rrv-')), ...newEntries];
  writeManifest(manifest);

  console.log(`${newEntries.length} seed image(s) written to ${DIR}/, manifest updated.`);
}

if (process.argv[1]?.endsWith('seed-images.ts')) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
