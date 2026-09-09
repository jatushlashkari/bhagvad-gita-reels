'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { customRef, type CustomQuote } from '../../../shared/custom-quotes.ts';
import type { QuoteRow } from '../../lib/backend.ts';
import { CustomQuoteForm, type CustomQuoteDraft } from '../components/quotes/CustomQuoteForm.tsx';
import { QuotesTable } from '../components/quotes/QuotesTable.tsx';
import { ghostButtonClass, headingClass, iconButtonClass, panelClass } from '../components/studio/ui.tsx';

/** Same reader as the Studio's and GeneratePanel's: the routes answer `{ error }` JSON, but an
 *  unhandled server fault can still arrive as plain text or HTML — read the body once and
 *  surface what is there. */
async function errorDetail(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    if (typeof parsed?.error === 'string') return parsed.error;
  } catch {
    /* not JSON — fall through to the raw body */
  }
  return text.trim() || res.statusText || 'request failed';
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function QuotesPage() {
  const [rows, setRows] = useState<QuoteRow[]>([]);
  const [customQuotes, setCustomQuotes] = useState<CustomQuote[]>([]);
  const [tableError, setTableError] = useState<string | null>(null);

  const [editing, setEditing] = useState<CustomQuote | null>(null);
  // Bumped on every reset so the form remounts and re-reads its initial values from `editing`.
  const [formKey, setFormKey] = useState(0);
  const [savingQuote, setSavingQuote] = useState(false);
  const [quoteStatus, setQuoteStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const loadQuotes = useCallback(
    () =>
      fetch('/api/quotes')
        .then((r) => r.json())
        .then(setRows)
        .catch((e: unknown) => setTableError(message(e))),
    [],
  );
  const loadCustomQuotes = useCallback(
    () =>
      fetch('/api/custom-quotes')
        .then((r) => r.json())
        .then(setCustomQuotes)
        .catch(() => {}),
    [],
  );

  useEffect(() => {
    void loadQuotes();
    void loadCustomQuotes();
  }, [loadQuotes, loadCustomQuotes]);

  // Optimistic: a star that only lights up after a round trip reads as a broken button. The
  // revert puts the row back exactly as it was if the write did not land.
  async function favorite(ref: string, next: boolean) {
    setTableError(null);
    setRows((rs) => rs.map((r) => (r.ref === ref ? { ...r, favorite: next } : r)));
    try {
      const res = await fetch('/api/quotes/meta', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ref, favorite: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await errorDetail(res)}`);
    } catch (e) {
      setRows((rs) => rs.map((r) => (r.ref === ref ? { ...r, favorite: !next } : r)));
      setTableError(`${ref}: ${message(e)}`);
    }
  }

  // Re-reads the whole list on success rather than patching the row: the server derives `hook`,
  // `curated` and the image `prompt` from the beats it just wrote, and guessing at those here is
  // how the table starts disagreeing with sources/beats.json.
  async function saveBeats(ref: string, beats: string[]): Promise<string | null> {
    try {
      const res = await fetch(`/api/beats/${encodeURIComponent(ref)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ beats }),
      });
      if (!res.ok) return `HTTP ${res.status}: ${await errorDetail(res)}`;
      await loadQuotes();
      return null;
    } catch (e) {
      return message(e);
    }
  }

  function resetForm() {
    setEditing(null);
    setFormKey((k) => k + 1);
  }

  function startEdit(q: CustomQuote) {
    setEditing(q);
    setFormKey((k) => k + 1);
    setQuoteStatus(null);
  }

  async function submitQuote(draft: CustomQuoteDraft) {
    setSavingQuote(true);
    setQuoteStatus(null);
    try {
      const res = editing
        ? await fetch(`/api/custom-quotes/${encodeURIComponent(editing.id)}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(draft),
          })
        : await fetch('/api/custom-quotes', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(draft),
          });
      if (!res.ok) {
        setQuoteStatus({ ok: false, text: `HTTP ${res.status}: ${await errorDetail(res)}` });
        return;
      }
      const saved = (await res.json()) as CustomQuote;
      setCustomQuotes((qs) => (qs.some((q) => q.id === saved.id) ? qs.map((q) => (q.id === saved.id ? saved : q)) : [...qs, saved]));
      resetForm();
      setQuoteStatus({ ok: true, text: `saved ${saved.id} to sources/custom-quotes.json` });
    } catch (e) {
      setQuoteStatus({ ok: false, text: message(e) });
    } finally {
      setSavingQuote(false);
    }
  }

  async function remove(q: CustomQuote) {
    if (!window.confirm(`Delete "${q.lines[0]}"?`)) return;
    setQuoteStatus(null);
    try {
      const res = await fetch(`/api/custom-quotes/${encodeURIComponent(q.id)}`, { method: 'DELETE' });
      if (!res.ok) {
        setQuoteStatus({ ok: false, text: `HTTP ${res.status}: ${await errorDetail(res)}` });
        return;
      }
      setCustomQuotes((qs) => qs.filter((x) => x.id !== q.id));
      if (editing?.id === q.id) resetForm();
      setQuoteStatus({ ok: true, text: `deleted ${q.id}` });
    } catch (e) {
      setQuoteStatus({ ok: false, text: message(e) });
    }
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-[#e8c874]">Quotes</h1>
          <p className="text-sm text-[#a89f8d]">every verse&rsquo;s beats and image prompt — plus your own quotes</p>
        </div>
        <div className="flex gap-4">
          <Link href="/" className="text-sm text-[#a89f8d] transition-colors hover:text-[#e8c874]">
            ← Control room
          </Link>
          <Link href="/studio" className="text-sm text-[#a89f8d] transition-colors hover:text-[#e8c874]">
            Studio →
          </Link>
        </div>
      </header>

      <section className={panelClass}>
        <h2 className={headingClass}>Bhagavad Gita</h2>
        {tableError && <p className="mt-3 text-sm text-red-400">{tableError}</p>}
        <QuotesTable rows={rows} onFavorite={favorite} onSaveBeats={saveBeats} />
      </section>

      <section className={panelClass}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className={headingClass}>Custom quotes</h2>
          <span className="text-xs tabular-nums text-[#a89f8d]">{customQuotes.length} in sources/custom-quotes.json</span>
        </div>

        {customQuotes.length === 0 ? (
          <p className="mt-3 text-sm text-[#a89f8d]">
            None yet — write one below and it joins the Studio&rsquo;s source list.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {customQuotes.map((q) => (
              <li key={q.id} className="rounded-lg bg-[#0d0817] p-3 ring-1 ring-white/5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-[#f5efe0]">{q.lines.join(' · ')}</p>
                    <p className="mt-1 text-xs text-[#a89f8d]">
                      <span className="text-[#e8c874]">{q.kicker}</span> · {q.attribution}
                    </p>
                    <p className="mt-1 text-xs text-[#a89f8d]/70">
                      {q.prompt
                        ? `${q.prompt.slice(0, 90)}${q.prompt.length > 90 ? '…' : ''}`
                        : 'no image prompt — generic theme fallback'}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Link href={`/studio?ref=${encodeURIComponent(customRef(q.id))}`} className={ghostButtonClass}>
                      Open in Studio
                    </Link>
                    <button
                      type="button"
                      aria-label={`edit ${q.id}`}
                      className={`${iconButtonClass} px-2 py-1`}
                      onClick={() => startEdit(q)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      aria-label={`delete ${q.id}`}
                      className={`${iconButtonClass} px-2 py-1`}
                      onClick={() => void remove(q)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4">
          <CustomQuoteForm
            key={formKey}
            editing={editing}
            saving={savingQuote}
            status={quoteStatus}
            onSubmit={submitQuote}
            onCancel={resetForm}
          />
        </div>
      </section>
    </main>
  );
}
