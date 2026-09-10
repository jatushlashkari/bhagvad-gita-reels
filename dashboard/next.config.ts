import type { NextConfig } from 'next';
import path from 'node:path';

// The Studio's Player mounts `video/CinemaReel.tsx`, which lives at the repo root and therefore
// resolves its `import ... from 'remotion'` against the ROOT node_modules — while @remotion/player
// (installed here) resolves the dashboard's copy. Same version, two module instances, and so two
// copies of Remotion's React context: the Player publishes the current frame on one and the
// composition reads the other, which surfaces as "useCurrentFrame can only be called inside a
// component that was passed to <Player>" (verified live before this alias existed).
//
// Pinning the bare `remotion` specifier to this directory's install collapses them into one.
// Subpaths are deliberately left alone: `remotion/no-react` is a standalone bundle imported only
// by @remotion/player, which already resolves it here.
// The two bundlers want the same target spelled differently: Turbopack takes a *module request*
// (an absolute path there is read as a relative one — "Can't resolve './Users/…'"), webpack takes
// a filesystem path with `$` for exact-match. Both were verified serving /studio.
const REMOTION_REQUEST = './node_modules/remotion';
const REMOTION_PATH = path.join(__dirname, 'node_modules', 'remotion');

const config: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, '..'),
  // The dev-tools badge defaults to bottom-left, which is exactly where the sidebar pins its
  // theme toggle — the badge sat on top of the toggle's icon and the first characters of its
  // label. This panel only ever runs under `next dev`, so moving the badge is the fix.
  devIndicators: { position: 'bottom-right' },
  turbopack: { resolveAlias: { remotion: REMOTION_REQUEST } },
  webpack(cfg) {
    cfg.resolve.alias = { ...cfg.resolve.alias, remotion$: REMOTION_PATH };
    return cfg;
  },
};
export default config;
