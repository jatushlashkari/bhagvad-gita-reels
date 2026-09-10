'use client';
import { useEffect, useState } from 'react';

const KEY = 'gita.theme';
export type Theme = 'light' | 'dark';

/** The pre-paint script in layout.tsx has already applied this; reading it again on
 *  mount only syncs the button's label. A private window that refuses storage reads
 *  as light for the session rather than throwing. */
export function readTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  // Starts 'light' on the server and on the first client render so the markup matches;
  // the effect corrects it immediately after mount.
  const [theme, setTheme] = useState<Theme>('light');
  useEffect(() => setTheme(readTheme()), []);

  function toggle() {
    // The document, not this component's state: two copies of this button are mounted at once
    // (the rail and the phone drawer), each having read the theme only on its own mount. Compute
    // the next value from `document.documentElement`, which both copies share, or the stale copy
    // re-applies the theme that is already on and its first click appears to do nothing.
    const current: Theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    const next: Theme = current === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (next === 'dark') document.documentElement.dataset.theme = 'dark';
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* not persisted — this session only */
    }
  }

  const label = theme === 'dark' ? 'Light theme' : 'Dark theme';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="flex w-full items-center gap-2 rounded-lg border border-line px-2 py-1.5 text-sm text-muted transition-colors hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
    >
      <span aria-hidden>{theme === 'dark' ? '☀' : '☾'}</span>
      {!compact && <span>{label}</span>}
    </button>
  );
}
