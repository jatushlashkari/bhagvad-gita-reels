import { localBackend } from './local-backend.ts';
import type { CustomQuote } from '../../shared/custom-quotes.ts';
import type { ReelStyle } from '../../shared/reel-style.ts';
import type { Verse } from '../../shared/types.ts';

export type AssetInfo = { file: string; rel: string; kind: 'clip' | 'image' | 'music'; license: string };
export type StateSummary = {
  lastPosted: { ref: string; youtube?: string; instagram?: string } | null;
  nextRef: string | null;
  totalPosted: number;
  chapters: number[];
  /** config.json's `handle` — the Studio preview stamps it on the cards exactly as the render does. */
  handle: string;
};
export type MediaHandle = {
  size: number;
  type: string;
  stream(start?: number, end?: number): ReadableStream<Uint8Array>;
};
export type QuoteRow = { ref: string; chapter: number; verse: number; hook: string; beats: string[]; curated: boolean; favorite: boolean; prompt: string; promptCurated: boolean };

export interface Backend {
  repoRoot(): string;
  listAssets(): Promise<AssetInfo[]>;
  saveImage(name: string, data: Buffer): Promise<AssetInfo>;
  /** mp3 only, ≤20 MB (enforced here and again at the route); saved to public/assets/music/
   *  through the same serialized upload queue as saveImage, with a manifest `music` entry
   *  recorded the same way (license 'User-provided', source 'dashboard upload'). */
  saveAudio(name: string, data: Buffer): Promise<AssetInfo>;
  getState(): Promise<StateSummary>;
  /** Full verse record (ref, book, chapter, verse, sanskrit, hindi, english, attribution) —
   *  the Studio preview needs the whole thing for ReelProps.verse; existing callers that only
   *  read a subset (e.g. GeneratePanel's `.hindi`) keep working unchanged. */
  getVerse(ref: string): Promise<Verse | null>;
  /** styles/cinema.json if present (validated/clamped), else DEFAULT_STYLE — never throws. */
  getStyle(): Promise<ReelStyle>;
  /** validateStyle(s) → write styles/cinema.json (2-space + trailing newline) → return the
   *  validated (clamped/defaulted) style that was actually written. */
  saveStyle(s: unknown): Promise<ReelStyle>;
  /** The curated entry from sources/beats.json for `ref` when one exists, else beatsFromTranslation
   *  of the verse's english as a live-computed fallback (never persisted). Null when `ref` isn't a
   *  known verse. */
  getBeats(ref: string): Promise<{ beats: string[]; curated: boolean } | null>;
  /** Validates (ref known, 2-6 lines, ≤90 chars each, no emoji — a violation throws, which the
   *  route maps to 400) then rewrites sources/beats.json with this ref's entry set/replaced, keys
   *  kept sorted chapter-then-verse. */
  saveBeats(ref: string, beats: string[]): Promise<void>;
  /** All 701 verses of sources/gita.json in file order, each row joined with its curated-or-
   *  fallback beats (mirrors getBeats), favorite flag (sources/quotes-meta.json), and prompt
   *  (promptFor() over sources/prompts.json's curated body, else the chapter-theme fallback) —
   *  the one place that assembles what the /quotes page and Studio need without re-joining every
   *  source file themselves. */
  listQuotes(): Promise<QuoteRow[]>;
  /** Sets or clears `ref`'s entry in sources/quotes-meta.json — `favorite: false` deletes the key
   *  rather than writing `false`, so the file only ever lists actual favorites. Throws on a ref
   *  that isn't a known verse (custom quotes have no favorite of their own). */
  setFavorite(ref: string, favorite: boolean): Promise<void>;
  /** The curated prompt body for `ref`, never the theme/motif fallback: sources/prompts.json[ref]
   *  for a verse, the custom quote's own `prompt` field for a `custom:` ref, or null when neither
   *  is set — including for an unknown ref, since this is a display read, not a validator. */
  getCuratedPrompt(ref: string): Promise<string | null>;
  listCustomQuotes(): Promise<CustomQuote[]>;
  /** Validates `input` with shared/custom-quotes.ts's validateCustomQuote (2-6 lines, per-field
   *  length/emoji limits, defaults for blank attribution/kicker, a minted or caller-supplied id)
   *  and appends the result to sources/custom-quotes.json; throws the validator's own message on
   *  a rule violation. */
  createCustomQuote(input: unknown): Promise<CustomQuote>;
  /** Merges `input` onto the existing quote — id and createdAt are never overwritten by the patch
   *  — and re-validates the merged result. Throws 'not found' for an unknown id, else the
   *  validator's message on a rule violation. */
  updateCustomQuote(id: string, input: unknown): Promise<CustomQuote>;
  /** Throws 'not found' for an unknown id. */
  deleteCustomQuote(id: string): Promise<void>;
  sync(): Promise<{ ok: boolean; output: string }>;
  /** Repo-relative path (already whitelist-checked by the caller) -> size/type/stream, or
   *  null if the path doesn't resolve to a real file. Filesystem access lives here so
   *  routes stay thin HTTP wrappers (status codes, headers) over the backend seam. */
  openMedia(rel: string): MediaHandle | null;
  /** Spawns the canonical pipeline (`tsx pipeline/run.ts --verse … --dry-run [--background …]
   *  [--format …] [--overrides out/studio-overrides.json]`) and returns its combined
   *  stdout/stderr as a live stream ending in `EXIT <code>`, or the string 'locked' if a render
   *  is already in progress (see out/.render-lock, §5). `format` is `undefined | 'classic' |
   *  'cinema'` — undefined leaves the pipeline to fall back to config.json's format (Auto).
   *  `overrides`, when present, is written to out/studio-overrides.json before spawning and wins
   *  over the committed preset/curated beats for this render only — it is never persisted. */
  generate(
    ref: string,
    background?: string,
    format?: 'classic' | 'cinema',
    overrides?: { beats?: string[]; style?: unknown; music?: string | null },
  ): ReadableStream<Uint8Array> | 'locked';
}

// Thrown by saveImage/saveAudio when the uploaded bytes are invalid (image doesn't decode / audio
// too large); re-exported here so routes only ever need to import from this seam, never reach
// into local-backend.ts.
export { InvalidImageError, InvalidAudioError } from './local-backend.ts';

export function getBackend(): Backend {
  return localBackend;
}
