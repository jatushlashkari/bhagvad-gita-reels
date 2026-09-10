'use client';
import { buttonClass, panelClass } from '../ui.tsx';

/** One card, one Save. Cards are independent on purpose: a bad time in the schedule
 *  must not stop you saving a handle. */
export function SettingsCard({
  title,
  description,
  dirty,
  saving,
  error,
  saved,
  invalid,
  onSave,
  children,
}: {
  title: string;
  description?: string;
  dirty: boolean;
  saving: boolean;
  error: string | null;
  saved: boolean;
  invalid: boolean;
  onSave: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className={panelClass}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-fg">{title}</h2>
        {dirty && <span className="text-xs text-warning">unsaved changes</span>}
        {!dirty && saved && <span className="text-xs text-success">saved</span>}
      </div>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
      <div className="mt-5 flex items-center gap-3">
        <button type="button" className={buttonClass} disabled={!dirty || saving || invalid} onClick={onSave}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>
    </section>
  );
}
