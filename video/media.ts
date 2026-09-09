import { staticFile } from 'remotion';

// Player (browser) passes absolute /api/media/... URLs; the render pipeline passes
// staticFile-relative paths. One resolver keeps both worlds working.
export const resolveMedia = (src: string): string => (/^(https?:)?\//.test(src) ? src : staticFile(src));
