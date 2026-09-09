import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { execa } from 'execa';
import { computeTimeline, computeCinemaTimeline, TimelineTooLongError } from './timeline.ts';
import { pickAsset } from './pick.ts';
import { pickNext, recordPost, readState, writeState, verseOrder, type PlatformKey } from './select.ts';
import { publishReleaseAsset } from './release.ts';
import { synthHindi } from '../voice/tts.ts';
import {
  introText,
  cinemaYoutubeTitle,
  cinemaYoutubeDescription,
  cinemaInstagramCaption,
} from '../post/captions.ts';
import { postYoutube } from '../post/youtube.ts';
import { postInstagram } from '../post/instagram.ts';
import { readManifest } from '../scripts/fetch-assets.ts';
import { listBackgroundPool, resolveBackground, type PoolEntry } from '../shared/backgrounds.ts';
import { beatsFromTranslation, NO_EMOJI } from '../shared/beats.ts';
import { DEFAULT_STYLE, validateStyle, type ReelStyle } from '../shared/reel-style.ts';
import type { ReelProps, Timings, Verse } from '../shared/types.ts';

const STATE_PATH = 'state.json';

export type RunArgs = {
  verse?: string;
  dryRun: boolean;
  background?: string;
  format?: 'classic' | 'cinema';
  overrides?: string;
};

export type Overrides = { beats?: string[]; style?: unknown; music?: string | null };

export function parseArgs(argv: string[]): RunArgs {
  const dryRun = argv.includes('--dry-run');
  const bi = argv.indexOf('--background');
  const background = bi === -1 ? undefined : argv[bi + 1];
  if (bi !== -1 && !background) throw new Error('--background needs a file name');
  const fi = argv.indexOf('--format');
  const format = fi === -1 ? undefined : (argv[fi + 1] as 'classic' | 'cinema');
  if (fi !== -1 && format !== 'classic' && format !== 'cinema')
    throw new Error(`--format must be classic or cinema, got: ${argv[fi + 1] ?? '(none)'}`);
  const oi = argv.indexOf('--overrides');
  const overrides = oi === -1 ? undefined : argv[oi + 1];
  if (oi !== -1 && !overrides) throw new Error('--overrides needs a file path');
  const vi = argv.indexOf('--verse');
  if (vi === -1) return { dryRun, background, format, overrides };
  const verse = argv[vi + 1];
  if (!verse || !/^[a-z]+:\d+:\d+$/.test(verse))
    throw new Error(`--verse must have format book:chapter:verse (e.g. gita:2:47), got: ${verse ?? '(none)'}`);
  return { verse, dryRun, background, format, overrides };
}

const MAX_OVERRIDE_BEATS = 6;
const MAX_BEAT_LEN = 90;

// --overrides is a CLI surface in its own right (not only the dashboard's
// generated-form input), so a hand-edited or scripted overrides file gets the
// same loud validation as sources/beats.json: a bad entry throws rather than
// silently rendering broken/oversized/emoji text on screen.
function assertValidOverrideBeat(beat: unknown): asserts beat is string {
  if (typeof beat !== 'string') {
    throw new Error(`override beat is not a string: ${JSON.stringify(beat)}`);
  }
  if (beat.length > MAX_BEAT_LEN) {
    throw new Error(`override beat exceeds ${MAX_BEAT_LEN} chars: "${beat.slice(0, 40)}…"`);
  }
  if (NO_EMOJI.test(beat)) {
    throw new Error(`override beat contains emoji: "${beat}"`);
  }
}

/**
 * Pure merge core for the cinema pipeline's inputs: beats precedence
 * (overrides > curated > sentence-split fallback), style merge (preset
 * spread with a raw override layered on top, validated once), and music
 * selection per the resolved style's musicMode (with a render-time
 * override that always wins, including an explicit null).
 */
export function resolveCinemaInputs(
  args: RunArgs,
  curated: string[] | undefined,
  english: string,
  preset: ReelStyle,
  ov: Overrides | null,
  musicPool: string[],
  ref: string,
): { beats: string[]; style: ReelStyle; music: string | null; usedFallbackBeats: boolean } {
  void args; // reserved for future per-run beat/style overrides driven by CLI flags

  // An empty overrides.beats array signals "no opinion" (e.g. a cleared
  // dashboard form field) rather than "render with zero beats" — treat it
  // the same as an absent key and fall through to curated/fallback beats.
  const overrideBeats = ov?.beats && ov.beats.length > 0 ? ov.beats : undefined;
  if (overrideBeats) {
    if (overrideBeats.length > MAX_OVERRIDE_BEATS) {
      throw new Error(`override beats has ${overrideBeats.length} entries (max ${MAX_OVERRIDE_BEATS})`);
    }
    for (const beat of overrideBeats) assertValidOverrideBeat(beat);
  }
  const chosenBeats = overrideBeats ?? curated ?? null;
  const usedFallbackBeats = chosenBeats === null;
  const beats = chosenBeats ?? beatsFromTranslation(english);

  const rawStyleOverride = (ov?.style ?? {}) as Record<string, unknown>;
  const style = validateStyle({ ...preset, ...rawStyleOverride });

  let music: string | null;
  if (ov && Object.prototype.hasOwnProperty.call(ov, 'music')) {
    const overrideMusic = ov.music;
    if (overrideMusic == null) {
      music = null;
    } else if (musicPool.includes(overrideMusic)) {
      music = overrideMusic;
    } else {
      console.warn(`override music not found: ${overrideMusic} — rendering silent`);
      music = null;
    }
  } else if (style.musicMode === 'silent') {
    music = null;
  } else if (style.musicMode === 'track') {
    music = style.musicFile && musicPool.includes(style.musicFile) ? style.musicFile : null;
    if (style.musicFile && music === null) {
      console.warn(`music track not found: ${style.musicFile} — rendering silent`);
    }
  } else {
    music = musicPool.length ? pickAsset(ref, musicPool) : null;
  }

  return { beats, style, music, usedFallbackBeats };
}

/**
 * Loads the cinema style preset from disk, defensively: an absent file is a
 * normal "no preset yet" state (→ DEFAULT_STYLE), and unreadable/malformed
 * JSON must never crash the daily pipeline run — it's logged and treated the
 * same as absent. Only a file that parses to valid JSON is passed through
 * validateStyle's field-level clamping/defaulting.
 */
export function loadStylePreset(path: string): ReelStyle {
  if (!existsSync(path)) return DEFAULT_STYLE;
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (e) {
    console.warn(`could not read style preset ${path} (${(e as Error).message}); using defaults`);
    return DEFAULT_STYLE;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.warn(`malformed style preset ${path} (${(e as Error).message}); using defaults`);
    return DEFAULT_STYLE;
  }
  return validateStyle(parsed);
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

async function renderComposition(id: string): Promise<void> {
  const renderArgs = ['remotion', 'render', 'video/index.ts', id, 'out/reel.mp4', '--props=out/props.json'];
  if (process.env.REMOTION_VERBOSE) renderArgs.push('--log=verbose');
  await execa('npx', renderArgs, { stdio: 'inherit' });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = JSON.parse(readFileSync('config.json', 'utf8')) as {
    handle: string;
    startRef: string;
    platforms: PlatformKey[];
    format?: 'classic' | 'cinema';
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

  const format: 'classic' | 'cinema' = args.format ?? config.format ?? 'classic';

  // 2. Deterministic background/music pick (gradient/silence fallback keeps renders unblocked).
  const pool = listBackgroundPool();
  const tracks = listAssets('public/assets/music', /\.mp3$/i);
  if (pool.length === 0) console.warn('no backgrounds — using gradient (run: npm run assets)');
  if (tracks.length === 0) console.warn('no music — rendering silent (run: npm run assets)');

  let bgEntry: PoolEntry | null = null;
  let musicFile: string | null = null;
  let youtubeOverrides: { title: string; description: string } | undefined;
  let instaCaption: string | undefined;

  if (format === 'cinema') {
    const beatsFile = JSON.parse(readFileSync('sources/beats.json', 'utf8')) as Record<string, string[]>;
    const curated = beatsFile[verse.ref];

    const preset = loadStylePreset('styles/cinema.json');

    let ov: Overrides | null = null;
    if (args.overrides) {
      if (!existsSync(args.overrides)) throw new Error(`overrides file not found: ${args.overrides}`);
      ov = JSON.parse(readFileSync(args.overrides, 'utf8')) as Overrides;
    }

    const r = resolveCinemaInputs(args, curated, verse.english, preset, ov, tracks, verse.ref);
    const { beats, style } = r;
    musicFile = r.music;
    const timings = computeCinemaTimeline(beats, { durationScale: style.durationScale, crossfadeSec: style.crossfadeSec });
    const images = pool.filter((p) => p.kind === 'image');
    const cinemaPool = images.length ? images : pool;
    bgEntry = args.background
      ? resolveBackground(args.background, pool)
      : cinemaPool.length
        ? resolveBackground(pickAsset(verse.ref, cinemaPool.map((p) => p.file)), cinemaPool)
        : null;
    const props: ReelProps = {
      verse,
      timings: computeTimeline({ introDurSec: 3, meaningDurSec: 10, englishText: verse.english }), // unused by CinemaReel; satisfies the shared ReelProps.timings field
      format: 'cinema',
      cinema: { kicker: `GITA ${verse.chapter}.${verse.verse}`, beats, timings },
      style,
      audio: { introFile: null, meaningFile: null },
      media: { background: bgEntry?.rel ?? null, music: musicFile ? `assets/music/${musicFile}` : null },
      brand: { handle: config.handle },
    };
    mkdirSync('out', { recursive: true });
    writeFileSync('out/props.json', JSON.stringify(props, null, 2));
    await renderComposition('CinemaReel');
    console.log(
      `✔ rendered out/reel.mp4 (${timings.totalSec.toFixed(1)}s, format=cinema, bg=${bgEntry?.file ?? 'gradient'}, music=${musicFile ?? 'none'}, beats=${beats.length}${r.usedFallbackBeats ? ' [fallback]' : ''}, style=${ov?.style !== undefined ? 'overridden' : 'preset'})`,
    );

    youtubeOverrides = {
      title: cinemaYoutubeTitle(verse, beats[0]),
      description: cinemaYoutubeDescription(verse, beats),
    };
    instaCaption = cinemaInstagramCaption(verse, beats);
  } else {
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

    bgEntry = args.background
      ? resolveBackground(args.background, pool)
      : pool.length
        ? resolveBackground(pickAsset(verse.ref, pool.map((p) => p.file)), pool)
        : null;
    musicFile = tracks.length ? pickAsset(verse.ref, tracks) : null;

    const props: ReelProps = {
      verse,
      timings,
      audio: { introFile: 'generated/intro.mp3', meaningFile: 'generated/meaning.mp3' },
      media: {
        background: bgEntry?.rel ?? null,
        music: musicFile ? `assets/music/${musicFile}` : null,
      },
      brand: { handle: config.handle },
    };
    mkdirSync('out', { recursive: true });
    writeFileSync('out/props.json', JSON.stringify(props, null, 2));

    // 3. Render.
    await renderComposition('GitaReel');
    console.log(`✔ rendered out/reel.mp4 (${timings.totalSec.toFixed(1)}s, bg=${bgEntry?.file ?? 'gradient'}, music=${musicFile ?? 'none'})`);
  }

  if (args.dryRun) {
    console.log('dry-run complete — nothing posted, state untouched.');
    return;
  }

  // 4. Attribution for CC BY assets rides along in the YouTube description.
  const manifest = readManifest();
  const credits = [
    manifest.backgrounds.find((e) => e.file === bgEntry?.file)?.credit,
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
          ? await postYoutube(
              verse,
              'out/reel.mp4',
              {
                clientId: requireEnv('YT_CLIENT_ID'),
                clientSecret: requireEnv('YT_CLIENT_SECRET'),
                refreshToken: requireEnv('YT_REFRESH_TOKEN'),
              },
              credits,
              youtubeOverrides,
            )
          : await postInstagram(
              verse,
              videoUrl,
              {
                userId: requireEnv('IG_USER_ID'),
                accessToken: requireEnv('IG_ACCESS_TOKEN'),
              },
              instaCaption,
            );
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
