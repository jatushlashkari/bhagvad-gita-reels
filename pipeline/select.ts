import { readFile, rename, writeFile } from 'node:fs/promises';
import type { Verse } from '../shared/types.ts';

export type PlatformKey = 'youtube' | 'instagram';

export type PostedEntry = {
  ref: string;
  youtube?: { id: string; at: string };
  instagram?: { id: string; at: string };
};

export type StateFile = { posted: PostedEntry[] };

export function verseOrder(verses: Verse[], startRef: string): string[] {
  const refs = verses.map((v) => v.ref);
  const i = refs.indexOf(startRef);
  if (i === -1) throw new Error(`startRef ${startRef} not found in sources`);
  return refs.slice(i);
}

export function pickNext(
  order: string[],
  state: StateFile,
  platforms: PlatformKey[],
): { ref: string; missing: PlatformKey[] } | null {
  const byRef = new Map(state.posted.map((e) => [e.ref, e]));
  for (const ref of order) {
    const entry = byRef.get(ref);
    const missing = platforms.filter((p) => !entry?.[p]);
    if (missing.length > 0) return { ref, missing };
  }
  return null;
}

export function recordPost(
  state: StateFile,
  ref: string,
  platform: PlatformKey,
  id: string,
  at: string,
): StateFile {
  const existing = state.posted.find((e) => e.ref === ref);
  if (existing) {
    return {
      posted: state.posted.map((e) => (e.ref === ref ? { ...e, [platform]: { id, at } } : e)),
    };
  }
  return { posted: [...state.posted, { ref, [platform]: { id, at } }] };
}

export async function readState(path: string): Promise<StateFile> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { posted: [] };
    throw e;
  }
}

export async function writeState(path: string, state: StateFile): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2) + '\n');
  await rename(tmp, path);
}
