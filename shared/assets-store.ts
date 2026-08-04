import type { Manifest } from '../scripts/fetch-assets.ts';

export function slugifyImageName(original: string, existing: string[]): string {
  const stem = original.replace(/\.[^.]+$/, '').toLowerCase()
    .normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
  let name = `${stem}.jpg`;
  for (let i = 2; existing.includes(name); i++) name = `${stem}-${i}.jpg`;
  return name;
}

export function appendImageEntry(manifest: Manifest, file: string): Manifest {
  if (manifest.images.some((e) => e.file === file)) return manifest;
  return {
    ...manifest,
    images: [...manifest.images, { file, url: '', license: 'User-provided', source: 'dashboard upload' }],
  };
}
