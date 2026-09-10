import { localBackend } from './local-backend.ts';
import type { CustomQuote } from '../../shared/custom-quotes.ts';
import type { ConfigView } from '../../shared/config.ts';
import type { ReelStyle } from '../../shared/reel-style.ts';
import type { Platform, ScheduleConfig, ScheduleItem } from '../../shared/schedule.ts';
import type { Verse } from '../../shared/types.ts';
import type { WorkflowState } from './connections-parse.ts';

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
/** Everything the /calendar page needs in one read: the rows, the schedule settings the times are
 *  displayed in (config.json's `schedule`), which platforms have publishable credentials *on this
 *  machine* (so "Publish now" can be disabled with an honest reason rather than failing mid-stream)
 *  and whether this checkout runs in calendar mode at all. */
export type CalendarView = {
  items: ScheduleItem[];
  config: ScheduleConfig;
  secrets: Record<Platform, boolean>;
  mode: 'daily' | 'calendar';
};
/** The editable slice of a PostRecord. `at: null` means "unscheduled" and is a real value, not an
 *  omission — hence `string | null` rather than an optional-only field. */
export type PostPatch = { at?: string | null; caption?: string; title?: string; status?: 'scheduled' | 'skipped' };

export type { WorkflowState };
/** getConnections()'s answer: which platform secrets exist where, and the two scheduled
 *  workflows' enabled state. `actions` is `null` until a real `gh` call answers for it — a
 *  missing/unauthenticated `gh` (or no remote) must read as "we don't know", never a guessed
 *  false. Names only, never values: the dashboard never holds (or exposes) a credential.
 *
 *  The two key lists are NOT interchangeable:
 *  - `secrets` — every env key the platform needs, whatever this machine happens to have. This
 *    is the list the GitHub Actions check tests against `gh secret list`; narrowing it would
 *    make that check pass vacuously (`[].every(...)` is `true`).
 *  - `missingLocal` — only the keys missing from THIS machine's environment, so the card can
 *    name the one key you still owe it rather than the platform's whole list. Empty when
 *    `local` is true. */
export type ConnectionsView = {
  ghAvailable: boolean;
  platforms: Record<Platform, { local: boolean; actions: boolean | null; secrets: string[]; missingLocal: string[] }>;
  workflows: Record<'daily-reel' | 'publisher', WorkflowState>;
};

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
  /** config.json's daily-pipeline settings (handle, startRef, platforms, format, mode, schedule),
   *  each field defaulted the same way the pipeline/publisher already default a missing or
   *  unrecognised value. Throws only when config.json itself isn't valid JSON — a malformed
   *  *value* inside it never throws here, since this is a read, not a validator. */
  getConfig(): Promise<ConfigView>;
  /** Validates `patch` (shared/config.ts's validateConfigPatch — verse existence checked against
   *  sources/gita.json) then rewrites config.json with the validated fields merged onto the
   *  parsed file, so keys this panel doesn't know about survive. Throws ConfigValidationError
   *  (→ 400, carrying the same field-keyed `errors`) on a rule violation, and 'publisher running'
   *  (→ 409) while the render lock is held — a run in flight is mid-read of this same file. */
  updateConfig(patch: unknown): Promise<ConfigView>;
  /** Read-only: which platform secrets exist on this machine (.env) and, when `gh` is reachable,
   *  in the repo's GitHub Actions, plus the daily-reel/publisher workflows' enabled state. Never
   *  throws — a missing/unauthenticated `gh` (or no remote) just reports `ghAvailable: false` and
   *  leaves `actions`/`workflows` at their unknown defaults; the local `.env` status still stands. */
  getConnections(): Promise<ConnectionsView>;
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
  /** schedule.json (sorted by earliest post time) + config.json's schedule settings and mode +
   *  a per-platform "are the secrets present here" flag. A malformed schedule.json throws
   *  readSchedule's own message rather than degrading to an empty calendar — the file is the
   *  record of what has already been published, so the route answers 500 and says why. */
  getCalendar(): Promise<CalendarView>;
  /** Edits one platform's post on one row and returns the whole updated item. Validates the patch
   *  (at: ISO or null; caption ≤ CAPTION_MAX; title ≤ TITLE_MAX; status 'scheduled' only from
   *  failed|skipped|scheduled|draft — resetting attempts and clearing error — and 'skipped' only
   *  from scheduled|draft); a published post takes caption/title edits and nothing else, throwing
   *  'published posts cannot be edited'. Throws 'no calendar item <id>' for an unknown id, and
   *  'publisher running' (→ 409) while the render lock is held, since the CLI does its own
   *  read-modify-write of this same file. */
  updatePost(id: string, platform: Platform, patch: PostPatch): Promise<ScheduleItem>;
  /** Drops the row and its public/thumbs/<id>.jpg. Throws '<id> has published posts' (→ 409) when
   *  any platform already went out — the calendar is the record of that — 'no calendar item <id>'
   *  for an unknown id, and 'publisher running' while the render lock is held. */
  deleteItem(id: string): Promise<void>;
  /** Spawns `npx tsx pipeline/publisher.ts <args>` — the same CLI the hourly workflow runs — and
   *  streams its combined output ending in `EXIT <code>`, or 'locked' when a render/publish is
   *  already in flight. Only the row-scoped subcommands are accepted (`--add … --date …`,
   *  `--rerender <id>`, `--publish-item <id> --platform <p>`); values are the caller's to
   *  validate. An `EXIT 0` means the publisher ran, not that a post went out — the log's
   *  `✔ / ✖ / ↷ skipped` lines carry the per-post outcome, so callers re-read the calendar. */
  calendarCommand(args: string[]): ReadableStream<Uint8Array> | 'locked';
}

// Thrown by saveImage/saveAudio when the uploaded bytes are invalid (image doesn't decode / audio
// too large), and by updateConfig when a patch fails validation (ConfigValidationError, carrying
// the field-keyed `errors` map); re-exported here so routes only ever need to import from this
// seam, never reach into local-backend.ts.
export { InvalidImageError, InvalidAudioError, ConfigValidationError } from './local-backend.ts';

export function getBackend(): Backend {
  return localBackend;
}
