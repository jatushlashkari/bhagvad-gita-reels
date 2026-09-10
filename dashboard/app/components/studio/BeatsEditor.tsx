'use client';
import { BEAT_MAX, BEAT_MIN, BEAT_MAX_CHARS, NO_EMOJI } from '../../../../shared/beats.ts';
import { buttonClass, headingClass, iconButtonClass, panelClass } from '../ui.tsx';

// Single-sourced from shared/beats.ts so UI, API, and CLI can never drift.
export const MAX_BEATS = BEAT_MAX;
export const MIN_BEATS = BEAT_MIN;
export const MAX_BEAT_CHARS = BEAT_MAX_CHARS;

/**
 * The client-side mirror of `validateBeatsFile`'s per-entry rules (shared/beats.ts), so an edit
 * that the POST would reject is caught before the button is even clickable. The server still
 * re-validates — this only decides what the UI lets you attempt.
 */
export function beatsProblem(beats: string[]): string | null {
  const trimmed = beats.map((b) => b.trim());
  if (trimmed.some((b) => !b)) return 'every beat needs text';
  if (trimmed.length < MIN_BEATS) return `at least ${MIN_BEATS} beats`;
  if (trimmed.length > MAX_BEATS) return `at most ${MAX_BEATS} beats`;
  if (trimmed.some((b) => b.length > MAX_BEAT_CHARS)) return `beats are capped at ${MAX_BEAT_CHARS} characters`;
  if (trimmed.some((b) => NO_EMOJI.test(b))) return 'emoji are not allowed on screen';
  return null;
}

export function BeatsEditor({
  beats,
  curated,
  onChange,
  onSave,
  saving,
  status,
}: {
  beats: string[];
  curated: boolean;
  onChange: (beats: string[]) => void;
  onSave: () => void;
  saving: boolean;
  status: { ok: boolean; text: string } | null;
}) {
  const problem = beatsProblem(beats);

  const replace = (i: number, text: string) => onChange(beats.map((b, j) => (j === i ? text : b)));
  const remove = (i: number) => onChange(beats.filter((_, j) => j !== i));
  const move = (i: number, delta: number) => {
    const next = [...beats];
    const [row] = next.splice(i, 1);
    next.splice(i + delta, 0, row);
    onChange(next);
  };

  return (
    <section className={panelClass}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className={headingClass}>Beats</h2>
        <span
          data-testid="beats-badge"
          className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] ${
            curated ? 'bg-accent/15 text-accent-text' : 'bg-surface-2 text-muted'
          }`}
        >
          {curated ? 'curated' : 'auto'}
        </span>
      </div>

      <ul className="mt-3 space-y-3">
        {beats.map((b, i) => {
          const atLimit = b.length >= MAX_BEAT_CHARS;
          return (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-2.5 w-3 shrink-0 text-right text-[10px] tabular-nums text-muted">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <input
                  aria-label={`beat ${i + 1}`}
                  value={b}
                  maxLength={MAX_BEAT_CHARS}
                  onChange={(e) => replace(i, e.target.value)}
                  className={`w-full rounded-lg border bg-surface px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent/40 ${
                    atLimit ? 'border-danger/60' : 'border-line focus:border-accent'
                  }`}
                />
                <span
                  className={`mt-1 block text-right text-[10px] tabular-nums ${
                    atLimit ? 'text-danger' : 'text-muted/70'
                  }`}
                >
                  {b.length}/{MAX_BEAT_CHARS}
                </span>
              </div>
              <div className="mt-1.5 flex shrink-0 gap-1">
                <button
                  type="button"
                  aria-label={`move beat ${i + 1} up`}
                  className={iconButtonClass}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`move beat ${i + 1} down`}
                  className={iconButtonClass}
                  disabled={i === beats.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`remove beat ${i + 1}`}
                  className={iconButtonClass}
                  disabled={beats.length <= 1}
                  onClick={() => remove(i)}
                >
                  ✕
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={iconButtonClass + ' px-2 py-1'}
          disabled={beats.length >= MAX_BEATS}
          onClick={() => onChange([...beats, ''])}
        >
          + beat
        </button>
        <button type="button" className={buttonClass} disabled={saving || problem !== null} onClick={onSave}>
          {saving ? 'Saving…' : 'Save beats'}
        </button>
        {problem && <span className="text-xs text-danger">{problem}</span>}
        {!problem && status && (
          <span className={`text-xs ${status.ok ? 'text-muted' : 'text-danger'}`}>{status.text}</span>
        )}
      </div>
    </section>
  );
}
