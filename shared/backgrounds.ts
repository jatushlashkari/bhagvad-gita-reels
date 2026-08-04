import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export type PoolEntry = { file: string; rel: string; kind: 'clip' | 'image' };

export const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
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
