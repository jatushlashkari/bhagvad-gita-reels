import { normalize } from 'node:path';

// Repo-relative prefixes the media route is allowed to serve. Directory entries end in
// '/' (any file under them is fair game); the mp4 entry is an exact single-file match.
export const ALLOWED_MEDIA = [
  'public/assets/backgrounds/',
  'public/assets/images/',
  'public/assets/music/',
  // Calendar row thumbnails (public/thumbs/<item id>.jpg, written by the publisher): the
  // /calendar table renders one per row through the same media route as every other asset.
  'public/thumbs/',
  'out/reel.mp4',
];

export function isAllowedMediaPath(joined: string): boolean {
  const rel = normalize(joined);
  return ALLOWED_MEDIA.some((p) => rel === p || (p.endsWith('/') && rel.startsWith(p)));
}
