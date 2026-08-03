import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { execa } from 'execa';
import { computeTimeline, TimelineTooLongError } from './timeline.ts';
import { pickAsset } from './pick.ts';
import { pickNext, recordPost, readState, writeState, verseOrder, type PlatformKey } from './select.ts';
import { publishReleaseAsset } from './release.ts';
import { synthHindi } from '../voice/tts.ts';
import { introText } from '../post/captions.ts';
import { postYoutube } from '../post/youtube.ts';
import { postInstagram } from '../post/instagram.ts';
import { readManifest } from '../scripts/fetch-assets.ts';
import type { ReelProps, Timings, Verse } from '../shared/types.ts';

const STATE_PATH = 'state.json';

export function parseArgs(argv: string[]): { verse?: string; dryRun: boolean } {
  const dryRun = argv.includes('--dry-run');
  const vi = argv.indexOf('--verse');
  if (vi === -1) return { dryRun };
  const verse = argv[vi + 1];
  if (!verse || !/^[a-z]+:\d+:\d+$/.test(verse))
    throw new Error(`--verse must have format book:chapter:verse (e.g. gita:2:47), got: ${verse ?? '(none)'}`);
  return { verse, dryRun };
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env var ${name} (see SETUP.md)`);
  return v;
}

async function retryOnce<T>(what: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.warn(`${what} failed once (${(e as Error).message}); retrying...`);
    return await fn();
  }
}

function listAssets(dir: string, exts: RegExp): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => exts.test(f));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = JSON.parse(readFileSync('config.json', 'utf8')) as {
    handle: string;
    startRef: string;
    platforms: PlatformKey[];
  };
  const sources = JSON.parse(readFileSync('sources/gita.json', 'utf8')) as { verses: Verse[] };
  const state = await readState(STATE_PATH);
  const order = verseOrder(sources.verses, config.startRef);

  let target: { ref: string; missing: PlatformKey[] } | null;
  if (args.verse) {
    const entry = state.posted.find((e) => e.ref === args.verse);
    target = { ref: args.verse, missing: config.platforms.filter((p) => !entry?.[p]) };
  } else {
    target = pickNext(order, state, config.platforms);
  }
  if (!target) {
    console.log('All verses posted 🎉 — add the next book to sources/ to continue.');
    return;
  }
  if (!args.dryRun && target.missing.length === 0) {
    console.log(`${target.ref} already posted everywhere; nothing to do.`);
    return;
  }

  const verse = sources.verses.find((v) => v.ref === target.ref);
  if (!verse) throw new Error(`verse ${target.ref} not in sources`);
  console.log(`▶ ${verse.ref}${args.dryRun ? ' (dry-run)' : ` → ${target.missing.join(', ')}`}`);

  // 1. Narration first — the video timeline stretches to fit it.
  mkdirSync('public/generated', { recursive: true });
  const intro = await retryOnce('intro TTS', () =>
    synthHindi(introText(verse), 'public/generated/intro.mp3'),
  );
  let meaning = await retryOnce('meaning TTS', () =>
    synthHindi(verse.hindi, 'public/generated/meaning.mp3'),
  );
  let timings: Timings;
  try {
    timings = computeTimeline({
      introDurSec: intro.durationSec,
      meaningDurSec: meaning.durationSec,
      englishText: verse.english,
    });
  } catch (e) {
    if (!(e instanceof TimelineTooLongError)) throw e;
    console.warn(`reel too long (${e.totalSec.toFixed(1)}s); retrying narration 15% faster`);
    meaning = await retryOnce('faster meaning TTS', () =>
      synthHindi(verse.hindi, 'public/generated/meaning.mp3', { rate: '+15%' }),
    );
    timings = computeTimeline({
      introDurSec: intro.durationSec,
      meaningDurSec: meaning.durationSec,
      englishText: verse.english,
    });
  }

  // 2. Deterministic background/music pick (gradient/silence fallback keeps renders unblocked).
  const bgs = listAssets('public/assets/backgrounds', /\.(webm|mp4)$/i);
  const tracks = listAssets('public/assets/music', /\.mp3$/i);
  if (bgs.length === 0) console.warn('no backgrounds downloaded — using gradient (run: npm run assets)');
  if (tracks.length === 0) console.warn('no music downloaded — rendering without music (run: npm run assets)');
  const bgFile = bgs.length ? pickAsset(verse.ref, bgs) : null;
  const musicFile = tracks.length ? pickAsset(verse.ref, tracks) : null;

  const props: ReelProps = {
    verse,
    timings,
    audio: { introFile: 'generated/intro.mp3', meaningFile: 'generated/meaning.mp3' },
    media: {
      background: bgFile ? `assets/backgrounds/${bgFile}` : null,
      music: musicFile ? `assets/music/${musicFile}` : null,
    },
    brand: { handle: config.handle },
  };
  mkdirSync('out', { recursive: true });
  writeFileSync('out/props.json', JSON.stringify(props, null, 2));

  // 3. Render.
  await execa('npx', ['remotion', 'render', 'video/index.ts', 'GitaReel', 'out/reel.mp4', '--props=out/props.json'], {
    stdio: 'inherit',
  });
  console.log(`✔ rendered out/reel.mp4 (${timings.totalSec.toFixed(1)}s, bg=${bgFile ?? 'gradient'}, music=${musicFile ?? 'none'})`);

  if (args.dryRun) {
    console.log('dry-run complete — nothing posted, state untouched.');
    return;
  }

  // 4. Attribution for CC BY assets rides along in the YouTube description.
  const manifest = readManifest();
  const credits = [
    manifest.backgrounds.find((e) => e.file === bgFile)?.credit,
    manifest.music.find((e) => e.file === musicFile)?.credit,
  ].filter((c): c is string => Boolean(c));

  // 5. Public URL for Instagram (also our permanent archive).
  const videoUrl = await publishReleaseAsset(verse.ref, 'out/reel.mp4');
  console.log(`✔ archived at ${videoUrl}`);

  // 6. Post per platform; write state IMMEDIATELY after each success so a later
  //    failure (or crash) can never cause a double-post on re-run.
  let current = await readState(STATE_PATH);
  const failures: string[] = [];
  for (const platform of target.missing) {
    try {
      const id =
        platform === 'youtube'
          ? await postYoutube(verse, 'out/reel.mp4', {
              clientId: requireEnv('YT_CLIENT_ID'),
              clientSecret: requireEnv('YT_CLIENT_SECRET'),
              refreshToken: requireEnv('YT_REFRESH_TOKEN'),
            }, credits)
          : await postInstagram(verse, videoUrl, {
              userId: requireEnv('IG_USER_ID'),
              accessToken: requireEnv('IG_ACCESS_TOKEN'),
            });
      current = recordPost(current, verse.ref, platform, id, new Date().toISOString());
      await writeState(STATE_PATH, current);
      console.log(`✔ ${platform}: ${id}`);
    } catch (e) {
      failures.push(`${platform}: ${(e as Error).message}`);
    }
  }

  if (failures.length > 0) {
    console.error(`✖ some platforms failed for ${verse.ref}:`);
    for (const f of failures) console.error(`  - ${f}`);
    console.error('state.json already records the successes; a re-run posts only what is missing.');
    process.exit(1);
  }
  console.log(`✔ ${verse.ref} posted everywhere.`);
}

if (process.argv[1]?.endsWith('run.ts')) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
