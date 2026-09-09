// The browser-safe half of the background helpers: pure functions with no filesystem access, so
// the Remotion composition can import them without dragging `node:fs` into a client bundle.
//
// This split is not cosmetic. `video/components/Background.tsx` runs in a browser twice over —
// once in the dashboard's Studio Player, once in the render's headless Chrome — and importing it
// from the fs-backed `shared/backgrounds.ts` put `node:fs` in both browser graphs. Webpack could
// be talked out of that with a fallback (see remotion.config.ts); Turbopack cannot ("the chunking
// context does not support external modules (request: node:fs)"), and it is right not to be.

export const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

/** Deterministic per-seed Ken Burns move (FNV-1a), so the same verse+background always pans the
 *  same way — the Studio preview and the render agree without sharing any state. */
export function kenBurnsVariant(seed: string): 0 | 1 | 2 | 3 {
  let h = 0x811c9dc5;
  for (const c of seed) {
    h ^= c.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h % 4) as 0 | 1 | 2 | 3;
}
