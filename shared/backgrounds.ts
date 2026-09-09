import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { IMAGE_EXT } from './background-kind.ts';

export type PoolEntry = { file: string; rel: string; kind: 'clip' | 'image' };

// Re-exported so Node-side callers keep one import site for "everything about backgrounds";
// browser code must import these from ./background-kind.ts directly — see the note there.
export { IMAGE_EXT, kenBurnsVariant } from './background-kind.ts';

const CLIP_EXT = /\.(mp4|webm)$/i;

function list(dir: string, ext: RegExp): string[] {
  return existsSync(dir) ? readdirSync(dir).filter((f) => ext.test(f)) : [];
}

export function listBackgroundPool(root = '.'): PoolEntry[] {
  const clips = list(join(root, 'public/assets/backgrounds'), CLIP_EXT).map((file) => ({
    file, rel: `assets/backgrounds/${file}`, kind: 'clip' as const,
  }));
  const images = list(join(root, 'public/assets/images'), IMAGE_EXT).map((file) => ({
    file, rel: `assets/images/${file}`, kind: 'image' as const,
  }));
  return [...clips, ...images].sort((a, b) => (a.rel < b.rel ? -1 : 1));
}

export function resolveBackground(name: string, pool: PoolEntry[]): PoolEntry {
  const hit = pool.find((p) => p.file === name);
  if (!hit) throw new Error(`background "${name}" not found; available: ${pool.map((p) => p.file).join(', ') || '(none)'}`);
  return hit;
}
