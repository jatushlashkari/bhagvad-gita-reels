'use client';
import { useState } from 'react';
import { BEAT_MAX, BEAT_MAX_CHARS } from '../../../../shared/beats.ts';
import {
  ATTRIBUTION_MAX,
  DEFAULT_ATTRIBUTION,
  DEFAULT_KICKER,
  KICKER_MAX,
  PROMPT_MAX,
  customQuoteProblem,
  type CustomQuote,
} from '../../../../shared/custom-quotes.ts';
import {
  Field,
  buttonClass,
  ghostButtonClass,
  headingClass,
  iconButtonClass,
  panelClass,
  selectClass,
} from '../ui.tsx';

export type CustomQuoteDraft = { lines: string[]; attribution: string; kicker: string; prompt: string };

/**
 * Create/edit form for a user-authored quote. The initial values are read once, at mount — the
 * page remounts it (`key`) when the edit target changes or a save clears the form, so there is
 * no props-into-state effect to keep in sync.
 */
export function CustomQuoteForm({
  editing,
  saving,
  status,
  onSubmit,
  onCancel,
}: {
  /** The quote being edited, or null for create mode. */
  editing: CustomQuote | null;
  saving: boolean;
  status: { ok: boolean; text: string } | null;
  onSubmit: (draft: CustomQuoteDraft) => void;
  onCancel: () => void;
}) {
  const [lines, setLines] = useState<string[]>(() => editing?.lines ?? ['', '']);
  const [attribution, setAttribution] = useState(() => editing?.attribution ?? '');
  const [kicker, setKicker] = useState(() => editing?.kicker ?? '');
  const [prompt, setPrompt] = useState(() => editing?.prompt ?? '');

  const problem = customQuoteProblem({ lines, attribution, kicker, prompt });

  const replace = (i: number, text: string) => setLines(lines.map((l, j) => (j === i ? text : l)));
  const remove = (i: number) => setLines(lines.filter((_, j) => j !== i));
  const move = (i: number, delta: number) => {
    const next = [...lines];
    const [row] = next.splice(i, 1);
    next.splice(i + delta, 0, row);
    setLines(next);
  };

  return (
    <section className={panelClass}>
      <h2 className={headingClass}>{editing ? `Edit ${editing.id}` : 'New custom quote'}</h2>

      <ul className="mt-3 space-y-2">
        {lines.map((l, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-3 shrink-0 text-right text-[10px] tabular-nums text-muted">{i + 1}</span>
            <input
              aria-label={`line ${i + 1}`}
              value={l}
              maxLength={BEAT_MAX_CHARS}
              onChange={(e) => replace(i, e.target.value)}
              className={selectClass}
            />
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                aria-label={`move line ${i + 1} up`}
                className={iconButtonClass}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`move line ${i + 1} down`}
                className={iconButtonClass}
                disabled={i === lines.length - 1}
                onClick={() => move(i, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                aria-label={`remove line ${i + 1}`}
                className={iconButtonClass}
                disabled={lines.length <= 1}
                onClick={() => remove(i)}
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className={`${iconButtonClass} mt-2 px-2 py-1`}
        disabled={lines.length >= BEAT_MAX}
        onClick={() => setLines([...lines, ''])}
      >
        + line
      </button>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="attribution" hint="closing card">
          <input
            aria-label="attribution"
            className={selectClass}
            maxLength={ATTRIBUTION_MAX}
            placeholder={DEFAULT_ATTRIBUTION}
            value={attribution}
            onChange={(e) => setAttribution(e.target.value)}
          />
        </Field>
        <Field label="kicker" hint="top line">
          <input
            aria-label="kicker"
            className={selectClass}
            maxLength={KICKER_MAX}
            placeholder={DEFAULT_KICKER}
            value={kicker}
            onChange={(e) => setKicker(e.target.value)}
          />
        </Field>
      </div>

      <div className="mt-3">
        <Field label="image prompt" hint="optional">
          <textarea
            aria-label="image prompt"
            className={selectClass}
            maxLength={PROMPT_MAX}
            rows={3}
            placeholder="leave blank to use the generic theme fallback"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={buttonClass}
          disabled={saving || problem !== null}
          onClick={() =>
            onSubmit({
              lines: lines.map((l) => l.trim()),
              // Blank stays blank: the server substitutes DEFAULT_ATTRIBUTION/DEFAULT_KICKER,
              // so the placeholders above are exactly what an empty field will render.
              attribution: attribution.trim(),
              kicker: kicker.trim(),
              prompt: prompt.trim(),
            })
          }
        >
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Save quote'}
        </button>
        {editing && (
          <button type="button" className={ghostButtonClass} onClick={onCancel}>
            Cancel
          </button>
        )}
        {problem && <span className="text-xs text-danger">{problem}</span>}
        {/* Not gated on `problem` the way BeatsEditor gates its status: a save resets this form to
            a blank one, whose "every line needs text" would otherwise swallow the confirmation
            (and the same for a delete, which has no form of its own). */}
        {status && <span className={`text-xs ${status.ok ? 'text-muted' : 'text-danger'}`}>{status.text}</span>}
      </div>
    </section>
  );
}
