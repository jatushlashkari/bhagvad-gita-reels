import { localBackend } from './local-backend.ts';

export type AssetInfo = { file: string; rel: string; kind: 'clip' | 'image'; license: string };
export type StateSummary = {
  lastPosted: { ref: string; youtube?: string; instagram?: string } | null;
  nextRef: string | null;
  totalPosted: number;
  chapters: number[];
};
export type MediaHandle = {
  size: number;
  type: string;
  stream(start?: number, end?: number): ReadableStream<Uint8Array>;
};

export interface Backend {
  repoRoot(): string;
  listAssets(): Promise<AssetInfo[]>;
  saveImage(name: string, data: Buffer): Promise<AssetInfo>;
  getState(): Promise<StateSummary>;
  getVerse(ref: string): Promise<{ sanskrit: string[]; hindi: string; english: string } | null>;
  sync(): Promise<{ ok: boolean; output: string }>;
  /** Repo-relative path (already whitelist-checked by the caller) -> size/type/stream, or
   *  null if the path doesn't resolve to a real file. Filesystem access lives here so
   *  routes stay thin HTTP wrappers (status codes, headers) over the backend seam. */
  openMedia(rel: string): MediaHandle | null;
  /** Spawns the canonical pipeline (`tsx pipeline/run.ts --verse … --dry-run [--background …]
   *  [--format …]`) and returns its combined stdout/stderr as a live stream ending in
   *  `EXIT <code>`, or the string 'locked' if a render is already in progress (see
   *  out/.render-lock, §5). `format` is `undefined | 'classic' | 'cinema'` — undefined leaves the
   *  pipeline to fall back to config.json's format (Auto). */
  generate(ref: string, background?: string, format?: 'classic' | 'cinema'): ReadableStream<Uint8Array> | 'locked';
}

// Thrown by saveImage when the uploaded bytes don't decode as an image; re-exported here
// so routes only ever need to import from this seam, never reach into local-backend.ts.
export { InvalidImageError } from './local-backend.ts';

export function getBackend(): Backend {
  return localBackend;
}
