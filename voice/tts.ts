import { execa } from 'execa';
import { parseBuffer } from 'music-metadata';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const VOICE = 'hi-IN-MadhurNeural';

export function ttsArgs(text: string, outPath: string, opts?: { rate?: string }): string[] {
  return ['--voice', VOICE, '--rate', opts?.rate ?? '+0%', '--text', text, '--write-media', outPath];
}

async function runEdgeTts(args: string[]): Promise<void> {
  try {
    await execa('edge-tts', args);
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      await execa('python3', ['-m', 'edge_tts', ...args]); // pip-installed module fallback
    } else {
      throw e;
    }
  }
}

export async function synthHindi(
  text: string,
  outPath: string,
  opts?: { rate?: string },
): Promise<{ path: string; durationSec: number }> {
  await mkdir(dirname(outPath), { recursive: true });
  await runEdgeTts(ttsArgs(text, outPath, opts));
  const buf = await readFile(outPath);
  const durationSec = (await parseBuffer(buf, undefined, { duration: true })).format.duration ?? 0;
  if (durationSec < 0.5)
    throw new Error(`TTS produced suspicious duration ${durationSec}s for: ${text.slice(0, 40)}`);
  return { path: outPath, durationSec };
}
