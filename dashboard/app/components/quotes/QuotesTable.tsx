'use client';
import Link from 'next/link';
import { Fragment, useMemo, useState } from 'react';
import { BEAT_MAX, BEAT_MAX_CHARS } from '../../../../shared/beats.ts';
import type { QuoteRow } from '../../../lib/backend.ts';
import { beatsProblem } from '../studio/BeatsEditor.tsx';
import { Toggle, ghostButtonClass, iconButtonClass, labelClass, selectClass } from '../ui.tsx';

// All 701 verses match on an empty search, and 701 rows × six cells is enough DOM to make
// typing in the search box stutter. The cap keeps the page responsive; the note tells you the
// list is truncated so a missing verse is never mistaken for "no such verse".
const MAX_ROWS = 200;
const PROMPT_PREVIEW_CHARS = 70;

const cellClass = 'px-2 py-2 align-top';
const headClass = `${labelClass} px-2 pb-2 text-left font-normal`;

export function QuotesTable({
  rows,
  onFavorite,
  onSaveBeats,
}: {
  rows: QuoteRow[];
  /** Fire-and-forget: the page owns `rows`, so it does the optimistic flip and the revert. */
  onFavorite: (ref: string, favorite: boolean) => void;
  /** Resolves to an error message, or null when the write landed (the editor then closes). */
  onSaveBeats: (ref: string, beats: string[]) => Promise<string | null>;
}) {
  const [search, setSearch] = useState('');
  const [chapter, setChapter] = useState(0); // 0 = All
  const [curatedOnly, setCuratedOnly] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [copied, setCopied] = useState<{ ref: string; ok: boolean } | null>(null);

  // Read off the rows rather than hard-coding 18: the table then still lists every chapter if
  // sources/gita.json ever carries a different book.
  const chapters = useMemo(
    () => [...new Set(rows.map((r) => r.chapter))].sort((a, b) => a - b),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (chapter === 0 || r.chapter === chapter) &&
        (!curatedOnly || r.curated) &&
        (!favoritesOnly || r.favorite) &&
        (q === '' ||
          r.ref.toLowerCase().includes(q) ||
          r.hook.toLowerCase().includes(q) ||
          r.beats.some((b) => b.toLowerCase().includes(q))),
    );
  }, [rows, search, chapter, curatedOnly, favoritesOnly]);

  const shown = filtered.slice(0, MAX_ROWS);
  const draftProblem = beatsProblem(draft);

  function startEdit(row: QuoteRow) {
    setEditing(row.ref);
    setDraft(row.beats);
    setEditError(null);
  }

  async function saveDraft(ref: string) {
    setSaving(true);
    setEditError(null);
    const error = await onSaveBeats(ref, draft.map((b) => b.trim()));
    setSaving(false);
    if (error) setEditError(error);
    else setEditing(null);
  }

  async function copyPrompt(row: QuoteRow) {
    let ok = true;
    try {
      await navigator.clipboard.writeText(row.prompt);
    } catch {
      ok = false; // no permission, or an insecure origin — say so rather than claim a copy
    }
    setCopied({ ref: row.ref, ok });
    setTimeout(() => setCopied((c) => (c?.ref === row.ref ? null : c)), 1500);
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-56 flex-1">
          <span className={labelClass}>search</span>
          <input
            aria-label="search quotes"
            className={`${selectClass} mt-1`}
            placeholder="ref, hook or any beat"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="block">
          <span className={labelClass}>chapter</span>
          <select
            aria-label="chapter filter"
            className={`${selectClass} mt-1`}
            value={chapter}
            onChange={(e) => setChapter(Number(e.target.value))}
          >
            <option value={0}>All</option>
            {chapters.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-4 pb-2">
          <Toggle label="curated only" checked={curatedOnly} onChange={setCuratedOnly} />
          <Toggle label="favorites only" checked={favoritesOnly} onChange={setFavoritesOnly} />
          <span data-testid="quote-count" className="text-xs tabular-nums text-muted">
            {filtered.length} of {rows.length}
          </span>
        </div>
      </div>

      {filtered.length > MAX_ROWS && (
        <p className="mt-3 text-xs text-accent-text/70">showing first {MAX_ROWS} — narrow the search</p>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className={headClass}>ref</th>
              <th className={headClass}>hook</th>
              <th className={headClass}>beats</th>
              <th className={headClass}>fav</th>
              <th className={headClass}>image prompt</th>
              <th className={headClass}>open</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <Fragment key={r.ref}>
                <tr className="border-b border-line">
                  <td className={`${cellClass} whitespace-nowrap font-mono text-xs text-accent-text`}>
                    गीता {r.chapter}.{r.verse}
                  </td>
                  <td className={`${cellClass} text-fg`}>{r.hook}</td>
                  <td className={`${cellClass} whitespace-nowrap text-muted`}>
                    <span className="tabular-nums">{r.beats.length}</span>
                    <span className={r.curated ? ' text-accent-text' : ''}>{r.curated ? ' curated' : ' auto'}</span>
                    <button
                      type="button"
                      aria-label={`edit beats ${r.ref}`}
                      className={`${iconButtonClass} ml-2`}
                      onClick={() => (editing === r.ref ? setEditing(null) : startEdit(r))}
                    >
                      Edit
                    </button>
                  </td>
                  <td className={cellClass}>
                    <button
                      type="button"
                      aria-label={`favorite ${r.ref}`}
                      aria-pressed={r.favorite}
                      className={`rounded px-1 text-base leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                        r.favorite ? 'text-accent-text opacity-100' : 'text-muted opacity-25 hover:opacity-60'
                      }`}
                      onClick={() => onFavorite(r.ref, !r.favorite)}
                    >
                      ⭐
                    </button>
                  </td>
                  <td className={`${cellClass} text-xs text-muted`}>
                    <span className="block max-w-md">
                      {r.prompt.slice(0, PROMPT_PREVIEW_CHARS)}
                      {r.prompt.length > PROMPT_PREVIEW_CHARS && '…'}
                    </span>
                    <button
                      type="button"
                      aria-label={`copy prompt ${r.ref}`}
                      className={`${iconButtonClass} mt-1`}
                      onClick={() => void copyPrompt(r)}
                    >
                      {copied?.ref === r.ref ? (copied.ok ? 'Copied' : 'Copy failed') : 'Copy'}
                    </button>
                  </td>
                  <td className={cellClass}>
                    <Link
                      href={`/studio?ref=${encodeURIComponent(r.ref)}`}
                      className="text-xs text-accent-text transition-colors hover:underline"
                    >
                      Studio
                    </Link>
                  </td>
                </tr>

                {editing === r.ref && (
                  <tr className="border-b border-line bg-surface-2/60">
                    <td className={cellClass} colSpan={6}>
                      <ul className="space-y-2">
                        {draft.map((b, i) => (
                          <li key={i} className="flex items-center gap-2">
                            <span className="w-3 shrink-0 text-right text-[10px] tabular-nums text-muted">
                              {i + 1}
                            </span>
                            <input
                              aria-label={`beat ${i + 1}`}
                              value={b}
                              maxLength={BEAT_MAX_CHARS}
                              onChange={(e) => setDraft(draft.map((d, j) => (j === i ? e.target.value : d)))}
                              className={selectClass}
                            />
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          className={`${iconButtonClass} px-2 py-1`}
                          disabled={draft.length >= BEAT_MAX}
                          onClick={() => setDraft([...draft, ''])}
                        >
                          + beat
                        </button>
                        <button
                          type="button"
                          className={ghostButtonClass}
                          disabled={saving || draftProblem !== null}
                          onClick={() => void saveDraft(r.ref)}
                        >
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button type="button" className={ghostButtonClass} onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                        {draftProblem && <span className="text-xs text-danger">{draftProblem}</span>}
                        {!draftProblem && editError && <span className="text-xs text-danger">{editError}</span>}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && <p className="mt-3 text-sm text-muted">nothing matches those filters</p>}
    </div>
  );
}
