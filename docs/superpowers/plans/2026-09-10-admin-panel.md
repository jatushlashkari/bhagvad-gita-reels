# Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the dashboard into a light-themed admin panel with a left navigation bar and six pages, add a dark toggle on the same design tokens, and give every reel-related setting a home on a Settings page that edits `config.json` and `styles/cinema.json` with validation.

**Architecture:** One palette of CSS custom properties (light on `:root`, dark under `html[data-theme="dark"]`) mapped to Tailwind 4 utilities with `@theme inline`; a guard test forbids raw colours in `dashboard/app` so the palette stays the only source. A sidebar shell in the root layout owns navigation and page headers, so pages render content only. Settings edits `config.json` through a new `shared/config.ts` validator used identically in the form and on the server, and edits `styles/cinema.json` through the existing style route; Studio keeps the same controls as per-render overrides.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS 4 (`@theme inline`), the existing Remotion Player preview, vitest for the root suite. No new dependencies.

**Spec:** docs/superpowers/specs/2026-09-10-admin-panel-design.md

## Global Constraints

- **No new dependencies** in `dashboard/package.json` or the root. Icons are hand-written inline SVG.
- **Tokens only.** After Task 4, no file under `dashboard/app` may contain a raw hex colour or a Tailwind palette/white/black colour class — `scripts/dashboard-theme.test.ts` fails the build if one appears. `video/` (the reel itself) is exempt and untouched by this plan.
- Token names and values are exactly as in the spec §2: `--bg, --surface, --surface-2, --line, --fg, --muted, --accent, --accent-text, --ink, --success, --warning, --danger, --video`; light on `:root` (bg `#f6f4ef`, surface `#ffffff`, surface-2 `#f1ede4`, line `#e6e1d6`, fg `#1d1a16`, muted `#6b655c`, accent `#e8c874`, accent-text `#b8912e`, ink `#1d1a16`, success `#2f7d4f`, warning `#b26a00`, danger `#b3261e`, video `#0d0817`), dark under `html[data-theme='dark']` (bg `#0d0817`, surface `#161028`, surface-2 `#1c1533`, line `rgba(255,255,255,0.08)`, fg `#f5efe0`, muted `#a89f8d`, accent `#e8c874`, accent-text `#e8c874`, ink `#0d0817`, success `#4ade80`, warning `#fbbf24`, danger `#f87171`, video `#0d0817`).
- **Light is the default**; the stored choice (`localStorage['gita.theme']`) is applied before paint by an inline script; a failed `localStorage` read or write means "light, this session" and never throws.
- **Video surfaces stay dark in both themes**: the Remotion Player wrapper, `ReelPlayer`, thumbnails and render/stream logs use `bg-video`.
- Six pages, in this sidebar order: **Overview `/` · Studio `/studio` · Quotes `/quotes` · Calendar `/calendar` · Library `/library` · Settings `/settings`**. Pages render content only — the shell owns the header (`PageHeader`) and all cross-page links.
- `assertLocalOrigin` FIRST on every mutating route; validation errors → 400 `{ errors }` (field-keyed) or `{ error }`; a held render lock → 409 `{ error: 'publisher running' }`; a malformed `config.json` on disk → 500 with the parse message.
- Every writer of a shared file goes through the serialized `queue` in `local-backend.ts`; JSON written 2-space + trailing newline; `sync()` pathspec gains `config.json`.
- Browser-graph purity: `shared/config.ts` imports only `shared/schedule.ts` — never `node:*` or remotion.
- Root `npm test` + `npm run typecheck` + `npm run typecheck --prefix dashboard` green per task; the render pipeline (`video/`, `pipeline/`, `post/`) is not touched; conventional commits with trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; never `git add -A` (stray `.DS_Store` and `.playwright-mcp/` exist).

## File Structure

```
dashboard/app/globals.css                      # T1 the palette + @theme inline
dashboard/app/layout.tsx                       # T1 pre-paint theme script; T2 the shell
dashboard/app/components/shell/ThemeToggle.tsx # T1 light/dark button + readTheme()
dashboard/app/components/shell/nav.ts          # T2 NAV table + isActive() (pure)
dashboard/app/components/shell/icons.tsx       # T2 six inline SVGs, ICONS record
dashboard/app/components/shell/Sidebar.tsx     # T2 desktop rail + mobile drawer + health dot + handle
dashboard/app/components/shell/PageHeader.tsx  # T2 title/description/actions
dashboard/app/page.tsx                         # T2 Overview (status + sync + quick generate)
dashboard/app/library/page.tsx                 # T2 uploads + background/music library
dashboard/app/{studio,quotes,calendar}/page.tsx# T2 headers stripped; T4 colours
dashboard/app/components/ui.tsx                # T4 moved from components/studio/ui.tsx, tokenised
shared/config.ts (+.test.ts)                   # T3 ConfigView/Patch, validateConfigPatch, mergeConfig
dashboard/lib/{backend,local-backend}.ts       # T3 getConfig/updateConfig/getConnections, sync path
dashboard/app/api/config/route.ts              # T3 GET/PATCH
dashboard/app/api/connections/route.ts         # T3 GET
scripts/dashboard-theme.test.ts                # T1 tokens defined; T4 raw-colour guard
scripts/dashboard-nav.test.ts                  # T2 isActive/NAV
dashboard/app/settings/page.tsx                # T5 four cards
dashboard/app/components/settings/SettingsCard.tsx, fields.tsx   # T5 card chrome + inputs
dashboard/app/components/settings/{ChannelCard,ScheduleCard}.tsx # T5
dashboard/app/components/settings/{StyleFields,StyleCard}.tsx    # T6
dashboard/app/components/studio/preview-props.ts (+ scripts test) # T6 shared preview props builder
dashboard/app/components/settings/ConnectionsCard.tsx            # T7
README.md                                                        # T7
```

---

### Task 1: Design tokens, theme toggle, pre-paint script

**Files:**
- Modify: `dashboard/app/globals.css`, `dashboard/app/layout.tsx`
- Create: `dashboard/app/components/shell/ThemeToggle.tsx`, `scripts/dashboard-theme.test.ts`

**Interfaces:**
- Produces: the Tailwind colour utilities `bg-bg`, `bg-surface`, `bg-surface-2`, `bg-video`, `bg-accent`, `border-line`, `ring-line`, `text-fg`, `text-muted`, `text-accent-text`, `text-ink`, `text-success`, `text-warning`, `text-danger` (and their `/opacity` variants); `ThemeToggle` (default export not used — named), `readTheme(): 'light' | 'dark'`.

- [ ] **Step 1: Write the failing test** — `scripts/dashboard-theme.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const TOKENS = [
  'bg', 'surface', 'surface-2', 'line', 'fg', 'muted',
  'accent', 'accent-text', 'ink', 'success', 'warning', 'danger', 'video',
] as const;

describe('dashboard theme tokens', () => {
  const css = readFileSync('dashboard/app/globals.css', 'utf8');
  const darkAt = css.indexOf("html[data-theme='dark']");
  const themeAt = css.indexOf('@theme');

  it('defines every token in the light and the dark theme', () => {
    expect(darkAt).toBeGreaterThan(0);
    expect(themeAt).toBeGreaterThan(darkAt);
    const light = css.slice(css.indexOf(':root'), darkAt);
    const dark = css.slice(darkAt, themeAt);
    for (const t of TOKENS) {
      expect(light, `light --${t}`).toMatch(new RegExp(`--${t}:\\s*\\S`));
      expect(dark, `dark --${t}`).toMatch(new RegExp(`--${t}:\\s*\\S`));
    }
  });

  it('maps every token to a colour utility with @theme inline', () => {
    // `inline` matters: without it the utilities bake in the :root value and the
    // data-theme swap never reaches them.
    expect(css).toMatch(/@theme inline\s*\{/);
    for (const t of TOKENS) expect(css).toMatch(new RegExp(`--color-${t}:\\s*var\\(--${t}\\)`));
  });

  it('applies the stored theme before paint', () => {
    const layout = readFileSync('dashboard/app/layout.tsx', 'utf8');
    expect(layout).toMatch(/gita\.theme/);
    expect(layout).toMatch(/dangerouslySetInnerHTML/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail** — `npx vitest run scripts/dashboard-theme.test.ts`
Expected: FAIL (`globals.css` has no tokens, layout has no script).

- [ ] **Step 3: Write `dashboard/app/globals.css`** (whole file):

```css
@import 'tailwindcss';

/* One palette, two themes. Components never hard-code a colour — every surface,
   text and accent below is a token, and scripts/dashboard-theme.test.ts fails the
   build if a raw colour comes back into dashboard/app. Light is the default; the
   dark values are the panel's original look. */
:root {
  color-scheme: light;
  --bg: #f6f4ef;
  --surface: #ffffff;
  --surface-2: #f1ede4;
  --line: #e6e1d6;
  --fg: #1d1a16;
  --muted: #6b655c;
  --accent: #e8c874;
  --accent-text: #b8912e;
  --ink: #1d1a16;
  --success: #2f7d4f;
  --warning: #b26a00;
  --danger: #b3261e;
  --video: #0d0817;
}

html[data-theme='dark'] {
  color-scheme: dark;
  --bg: #0d0817;
  --surface: #161028;
  --surface-2: #1c1533;
  --line: rgba(255, 255, 255, 0.08);
  --fg: #f5efe0;
  --muted: #a89f8d;
  --accent: #e8c874;
  --accent-text: #e8c874;
  --ink: #0d0817;
  --success: #4ade80;
  --warning: #fbbf24;
  --danger: #f87171;
  --video: #0d0817;
}

/* `inline` so a utility compiles to var(--bg) rather than the value :root had at
   build time — that indirection is what makes the data-theme swap work. */
@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-surface-2: var(--surface-2);
  --color-line: var(--line);
  --color-fg: var(--fg);
  --color-muted: var(--muted);
  --color-accent: var(--accent);
  --color-accent-text: var(--accent-text);
  --color-ink: var(--ink);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-danger: var(--danger);
  --color-video: var(--video);
}

body {
  background: var(--bg);
  color: var(--fg);
}
```

- [ ] **Step 4: Write `dashboard/app/layout.tsx`** (whole file; the shell arrives in Task 2):

```tsx
import './globals.css';

export const metadata = { title: 'Gita Reels' };

// Runs before the first paint, so a dark-theme user never sees a light flash.
// Any localStorage failure (private window) just leaves the light default.
const THEME_SCRIPT =
  "try{if(localStorage.getItem('gita.theme')==='dark')document.documentElement.dataset.theme='dark'}catch(e){}";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-bg text-fg antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 5: Write `dashboard/app/components/shell/ThemeToggle.tsx`**:

```tsx
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
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
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
```

- [ ] **Step 6: Run the test and the typechecks** — `npx vitest run scripts/dashboard-theme.test.ts` → PASS; then `npm test`, `npm run typecheck`, `npm run typecheck --prefix dashboard` → all green.

- [ ] **Step 7: Verify the swap in a real browser.** Start the server detached (`nohup npm run dashboard > /private/tmp/claude-501/-Users-jatush-bhagvad-gita-reels-v1/9d8f06ab-1d8f-49cf-835c-647ff128063a/scratchpad/dashboard.log 2>&1 &`, wait for "Ready"), open `http://localhost:4000/`, and with the Playwright MCP tools run `browser_evaluate` twice: `getComputedStyle(document.body).backgroundColor` → the light value (`rgb(246, 244, 239)`), then `document.documentElement.dataset.theme='dark'; getComputedStyle(document.body).backgroundColor` → the dark value (`rgb(13, 8, 23)`). Kill the server (`pkill -f "next dev"`).

- [ ] **Step 8: Commit**

```bash
git add dashboard/app/globals.css dashboard/app/layout.tsx dashboard/app/components/shell/ThemeToggle.tsx scripts/dashboard-theme.test.ts
git commit -m "feat: light/dark design tokens and a pre-paint theme script"
```

---

### Task 2: Shell — sidebar, page header, Overview and Library pages

**Files:**
- Create: `dashboard/app/components/shell/nav.ts`, `icons.tsx`, `Sidebar.tsx`, `PageHeader.tsx`, `dashboard/app/library/page.tsx`, `scripts/dashboard-nav.test.ts`
- Modify: `dashboard/app/layout.tsx`, `dashboard/app/page.tsx`, `dashboard/app/studio/page.tsx`, `dashboard/app/quotes/page.tsx`, `dashboard/app/calendar/page.tsx`

**Interfaces:**
- Consumes: `ThemeToggle` (Task 1).
- Produces: `NAV: NavItem[]`, `isActive(pathname, href): boolean`, `<PageHeader title description? actions? />`, `<Sidebar />`. Settings is **not** in `NAV` yet — Task 5 adds it with the page.

- [ ] **Step 1: Write the failing test** — `scripts/dashboard-nav.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { NAV, isActive } from '../dashboard/app/components/shell/nav.ts';

describe('sidebar navigation', () => {
  it('lists the pages in order, each href unique', () => {
    expect(NAV.map((i) => i.href)).toEqual(['/', '/studio', '/quotes', '/calendar', '/library']);
    expect(new Set(NAV.map((i) => i.href)).size).toBe(NAV.length);
    expect(NAV.every((i) => i.label.length > 0)).toBe(true);
  });

  it('marks the current tab, and only it', () => {
    expect(isActive('/', '/')).toBe(true);
    expect(isActive('/studio', '/')).toBe(false);
    expect(isActive('/studio', '/studio')).toBe(true);
    expect(isActive('/studio/', '/studio')).toBe(true);
    expect(isActive('/studio/deep', '/studio')).toBe(true);
    expect(isActive('/studiox', '/studio')).toBe(false);
    expect(isActive('/quotes', '/studio')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail** — `npx vitest run scripts/dashboard-nav.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write `dashboard/app/components/shell/nav.ts`**:

```ts
export type IconName = 'overview' | 'studio' | 'quotes' | 'calendar' | 'library' | 'settings';
export type NavItem = { href: string; label: string; icon: IconName };

export const NAV: NavItem[] = [
  { href: '/', label: 'Overview', icon: 'overview' },
  { href: '/studio', label: 'Studio', icon: 'studio' },
  { href: '/quotes', label: 'Quotes', icon: 'quotes' },
  { href: '/calendar', label: 'Calendar', icon: 'calendar' },
  { href: '/library', label: 'Library', icon: 'library' },
];

/** '/' is active only on itself; every other tab also owns its sub-paths, and the
 *  trailing-slash form counts (Next serves both). */
export function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
```

- [ ] **Step 4: Write `dashboard/app/components/shell/icons.tsx`** — stroke-only SVGs so they take `currentColor`:

```tsx
import type { IconName } from './nav.ts';

const paths: Record<IconName, string> = {
  overview: 'M3 12h4l3-8 4 16 3-8h4',
  studio: 'M8 5v14l11-7z',
  quotes: 'M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  calendar: 'M8 3v4M16 3v4M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  library: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  settings: 'M4 7h16M4 12h16M4 17h16M9 5v4M16 10v4M11 15v4',
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d={paths[name]} />
    </svg>
  );
}
```

- [ ] **Step 5: Write `dashboard/app/components/shell/PageHeader.tsx`**:

```tsx
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-fg">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
```

- [ ] **Step 6: Write `dashboard/app/components/shell/Sidebar.tsx`**:

```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons.tsx';
import { NAV, isActive } from './nav.ts';
import { ThemeToggle } from './ThemeToggle.tsx';

function useHandleAndHealth() {
  const [handle, setHandle] = useState('');
  const [healthy, setHealthy] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    const ping = () =>
      fetch('/api/state')
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((s: { handle?: string }) => {
          if (!alive) return;
          setHandle(s.handle ?? '');
          setHealthy(true);
        })
        .catch(() => alive && setHealthy(false));
    void ping();
    const t = setInterval(ping, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return { handle, healthy };
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() ?? '/';
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            title={item.label}
            className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
              active ? 'bg-accent/15 text-accent-text' : 'text-muted hover:bg-surface-2 hover:text-fg'
            }`}
          >
            <Icon name={item.icon} />
            <span className="truncate md:hidden lg:inline">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  const { handle, healthy } = useHandleAndHealth();
  const [open, setOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Escape closes the phone drawer and hands focus back to the button that opened it;
  // opening moves focus into the drawer so the keyboard lands where the eyes do.
  useEffect(() => {
    if (!open) return;
    drawerRef.current?.querySelector('a')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        openerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const health = (
    <span
      aria-label={healthy === false ? 'server unreachable' : 'server ok'}
      title={healthy === false ? 'server unreachable' : 'server ok'}
      className={`inline-block size-2 rounded-full ${
        healthy === false ? 'bg-danger' : healthy ? 'bg-success' : 'bg-muted'
      }`}
    />
  );

  return (
    <>
      {/* phone: a bar with the brand and a drawer toggle */}
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-surface px-4 py-3 md:hidden">
        <button
          ref={openerRef}
          type="button"
          aria-label="open navigation"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="rounded-lg border border-line px-2 py-1 text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          ☰
        </button>
        <span className="font-semibold text-fg">गीता Reels</span>
        <span className="ml-auto">{health}</span>
      </div>

      {open && (
        <div className="fixed inset-0 z-30 md:hidden">
          <div className="absolute inset-0 bg-fg/20" onClick={() => setOpen(false)} />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="navigation"
            className="absolute inset-y-0 left-0 w-60 border-r border-line bg-surface p-3"
          >
            <NavLinks onNavigate={() => setOpen(false)} />
            <div className="mt-4 border-t border-line pt-3">
              <ThemeToggle />
            </div>
          </div>
        </div>
      )}

      {/* tablet and up: an icon rail that grows into a labelled sidebar */}
      <aside className="sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-surface p-3 md:flex md:w-16 lg:w-60">
        <div className="mb-4 flex items-center gap-2 px-1">
          <span className="text-lg" aria-hidden>
            ॐ
          </span>
          <span className="truncate font-semibold text-fg md:hidden lg:inline">गीता Reels</span>
        </div>
        <NavLinks />
        <div className="mt-auto space-y-2 border-t border-line pt-3">
          <ThemeToggle compact />
          <p className="flex items-center gap-2 px-1 text-xs text-muted">
            {health}
            <span className="truncate md:hidden lg:inline">{handle || 'no handle set'}</span>
          </p>
        </div>
      </aside>
    </>
  );
}
```

- [ ] **Step 7: Wire the shell into `dashboard/app/layout.tsx`** — keep the head script from Task 1 and change the body to:

```tsx
      <body className="min-h-screen bg-bg text-fg antialiased">
        <div className="min-h-screen md:flex">
          <Sidebar />
          <main className="mx-auto min-w-0 w-full max-w-7xl px-4 py-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </body>
```
with `import { Sidebar } from './components/shell/Sidebar.tsx';` at the top.

- [ ] **Step 8: Rewrite `dashboard/app/page.tsx` as Overview** (whole file):

```tsx
import { PageHeader } from './components/shell/PageHeader.tsx';
import { StatusBar } from './components/StatusBar.tsx';
import { GeneratePanel } from './components/GeneratePanel.tsx';

export default function OverviewPage() {
  return (
    <>
      <PageHeader title="Overview" description="Where the channel stands, and a quick render." />
      <div className="space-y-6">
        <StatusBar />
        <GeneratePanel />
      </div>
    </>
  );
}
```

- [ ] **Step 9: Create `dashboard/app/library/page.tsx`**:

```tsx
import { PageHeader } from '../components/shell/PageHeader.tsx';
import { UploadZone } from '../components/UploadZone.tsx';
import { Library } from '../components/Library.tsx';

export default function LibraryPage() {
  return (
    <>
      <PageHeader title="Library" description="Backgrounds and music the reels draw from." />
      <div className="space-y-6">
        <UploadZone />
        <Library />
      </div>
    </>
  );
}
```

- [ ] **Step 10: Strip the old headers from the three existing pages.** In `dashboard/app/studio/page.tsx`, `quotes/page.tsx` and `calendar/page.tsx`: delete the `<header>…</header>` block (title + the `← Control room` / `Studio →` links) and the `<Link>` import when it becomes unused; replace the outer `<main className="mx-auto max-w-… px-4 py-8">…</main>` wrapper with a fragment `<>…</>` (the layout owns the container); insert `<PageHeader …/>` as the first child, importing it from `../components/shell/PageHeader.tsx`:
  - Studio: `title="Studio"`, `description="Live preview of the exact render — tune this cut before you render it."`
  - Quotes: `title="Quotes"`, `description="Every verse, your favourites, and your own custom quotes."`
  - Calendar: `title="Calendar"`, `description="What goes out, where, and when."`
  Keep the pages' inner sections and the calendar's mode badge exactly as they are. Where the Calendar's empty state links to `/studio`, leave the link (it is contextual, not navigation chrome).

- [ ] **Step 11: Run the checks** — `npx vitest run scripts/dashboard-nav.test.ts` → PASS; `npm test`, `npm run typecheck`, `npm run typecheck --prefix dashboard` → green.

- [ ] **Step 12: Verify in a browser** (server detached as in Task 1, Playwright MCP): `/` shows the Overview header, status chips and the generate panel; `/library` shows the upload zone and the background grid; `/studio`, `/quotes`, `/calendar` each show their new header and no in-page nav links; the sidebar marks the current tab (`aria-current="page"` on exactly one link — assert with `browser_evaluate`); resize to 800×800 (`browser_resize`) → the rail shows icons only; resize to 390×800 → the top bar appears, the ☰ opens the drawer, Escape closes it. **Expected mid-migration:** the page cards are still the old dark colours on a light chrome — Task 4 finishes that; judge structure here, not beauty. Kill the server.

- [ ] **Step 13: Commit**

```bash
git add dashboard/app/layout.tsx dashboard/app/page.tsx dashboard/app/library dashboard/app/components/shell dashboard/app/studio/page.tsx dashboard/app/quotes/page.tsx dashboard/app/calendar/page.tsx scripts/dashboard-nav.test.ts
git commit -m "feat: sidebar shell with overview and library pages"
```

---

### Task 3: Config and connections behind the seam

**Files:**
- Create: `shared/config.ts`, `shared/config.test.ts`, `dashboard/lib/connections-parse.ts`, `scripts/dashboard-connections.test.ts`, `dashboard/app/api/config/route.ts`, `dashboard/app/api/connections/route.ts`
- Modify: `dashboard/lib/backend.ts`, `dashboard/lib/local-backend.ts`

**Interfaces:**
- Produces in `shared/config.ts`:
  ```ts
  export const FORMATS: readonly ['classic', 'cinema'];      export type ReelFormat = 'classic' | 'cinema';
  export const MODES: readonly ['calendar', 'daily'];        export type ConfigMode = 'calendar' | 'daily';
  export const DAILY_PLATFORMS: readonly ['youtube', 'instagram']; export type DailyPlatform = 'youtube' | 'instagram';
  export const HANDLE_RE: RegExp; export const VERSE_REF_RE: RegExp; export const HHMM_RE: RegExp;
  export type ConfigView = { handle: string; startRef: string; platforms: DailyPlatform[]; format: ReelFormat; mode: ConfigMode; schedule: ScheduleConfig };
  export type ConfigPatch = Partial<ConfigView>;
  export type PatchResult = { ok: true; value: ConfigPatch } | { ok: false; errors: Record<string, string> };
  export function validateConfigPatch(input: unknown, opts?: { verseRefs?: Set<string> }): PatchResult;
  ```
- Produces on `Backend`: `getConfig(): Promise<ConfigView>`; `updateConfig(patch: unknown): Promise<ConfigView>` (queue-serialized; throws `ConfigValidationError` with `.errors`, or `publisher running`); `getConnections(): Promise<ConnectionsView>` where
  ```ts
  export type WorkflowState = 'active' | 'disabled' | 'unknown';
  export type ConnectionsView = {
    ghAvailable: boolean;
    platforms: Record<Platform, { local: boolean; actions: boolean | null; secrets: string[] }>;
    workflows: Record<'daily-reel' | 'publisher', WorkflowState>;
  };
  ```
- Routes: `GET /api/config` → `ConfigView` (500 `{ error }` when `config.json` is unparseable); `PATCH /api/config` → `ConfigView`, 400 `{ errors }`, 409 `{ error: 'publisher running' }`; `GET /api/connections` → `ConnectionsView`.

- [ ] **Step 1: Write the failing test** — `shared/config.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_SCHEDULE_CONFIG } from './schedule.ts';
import { validateConfigPatch } from './config.ts';

const ok = (r: ReturnType<typeof validateConfigPatch>) => {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r.errors)}`);
  return r.value;
};
const errs = (r: ReturnType<typeof validateConfigPatch>) => (r.ok ? {} : r.errors);

describe('validateConfigPatch', () => {
  it('rejects non-objects, empty patches and unknown keys', () => {
    expect(errs(validateConfigPatch(null))._).toMatch(/object/);
    expect(errs(validateConfigPatch([]))._).toMatch(/object/);
    expect(errs(validateConfigPatch({}))._).toMatch(/nothing/);
    expect(errs(validateConfigPatch({ colour: 'red' })).colour).toMatch(/unknown/);
  });

  it('handle: shape checked, trimmed', () => {
    expect(ok(validateConfigPatch({ handle: '  @gita.daily_1 ' })).handle).toBe('@gita.daily_1');
    expect(errs(validateConfigPatch({ handle: 'gita' })).handle).toMatch(/@/);
    expect(errs(validateConfigPatch({ handle: '@' })).handle).toBeTruthy();
    expect(errs(validateConfigPatch({ handle: `@${'x'.repeat(31)}` })).handle).toBeTruthy();
    expect(errs(validateConfigPatch({ handle: '@has space' })).handle).toBeTruthy();
  });

  it('startRef: shape and, when the verse list is given, existence', () => {
    expect(ok(validateConfigPatch({ startRef: 'gita:1:1' })).startRef).toBe('gita:1:1');
    expect(errs(validateConfigPatch({ startRef: '1:1' })).startRef).toMatch(/book:chapter:verse/);
    const verseRefs = new Set(['gita:1:1']);
    expect(errs(validateConfigPatch({ startRef: 'gita:99:1' }, { verseRefs })).startRef).toMatch(/not a verse/);
    expect(ok(validateConfigPatch({ startRef: 'gita:1:1' }, { verseRefs })).startRef).toBe('gita:1:1');
  });

  it('platforms: canonical order, deduped, facebook named as calendar-only', () => {
    expect(ok(validateConfigPatch({ platforms: ['instagram', 'youtube', 'instagram'] })).platforms).toEqual(['youtube', 'instagram']);
    expect(errs(validateConfigPatch({ platforms: [] })).platforms).toMatch(/at least one/);
    expect(errs(validateConfigPatch({ platforms: ['facebook'] })).platforms).toMatch(/calendar/);
    expect(errs(validateConfigPatch({ platforms: ['tiktok'] })).platforms).toMatch(/unknown/);
    expect(errs(validateConfigPatch({ platforms: 'youtube' })).platforms).toMatch(/list/);
  });

  it('format and mode come from the shared lists', () => {
    expect(ok(validateConfigPatch({ format: 'cinema' })).format).toBe('cinema');
    expect(errs(validateConfigPatch({ format: 'narrated' })).format).toMatch(/classic/);
    expect(ok(validateConfigPatch({ mode: 'daily' })).mode).toBe('daily');
    expect(errs(validateConfigPatch({ mode: 'hourly' })).mode).toMatch(/calendar/);
  });

  it('schedule: every field checked, errors keyed by field path', () => {
    expect(ok(validateConfigPatch({ schedule: DEFAULT_SCHEDULE_CONFIG })).schedule).toEqual(DEFAULT_SCHEDULE_CONFIG);
    const bad = validateConfigPatch({
      schedule: { ...DEFAULT_SCHEDULE_CONFIG, daysAhead: 99, defaultTimes: { ...DEFAULT_SCHEDULE_CONFIG.defaultTimes, youtube: '25:00' }, timezone: 'Mars/Olympus' },
    });
    expect(errs(bad)['schedule.daysAhead']).toMatch(/1 to 14/);
    expect(errs(bad)['schedule.defaultTimes.youtube']).toMatch(/HH:mm/);
    expect(errs(bad)['schedule.timezone']).toMatch(/time zone/);
    expect(errs(validateConfigPatch({ schedule: 'now' })).schedule).toMatch(/object/);
  });

  it('collects errors from every field in one pass', () => {
    const e = errs(validateConfigPatch({ handle: 'x', format: 'nope' }));
    expect(Object.keys(e).sort()).toEqual(['format', 'handle']);
  });
});
```

- [ ] **Step 2: Run it and watch it fail** — `npx vitest run shared/config.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write `shared/config.ts`**:

```ts
import { PLATFORMS, validateScheduleConfig, type ScheduleConfig } from './schedule.ts';

export const FORMATS = ['classic', 'cinema'] as const;
export type ReelFormat = (typeof FORMATS)[number];
export const MODES = ['calendar', 'daily'] as const;
export type ConfigMode = (typeof MODES)[number];
/** The daily pipeline posts to these two. Facebook publishes from the calendar only
 *  (pipeline/run.ts refuses it in the daily loop), so it is deliberately not offered. */
export const DAILY_PLATFORMS = ['youtube', 'instagram'] as const;
export type DailyPlatform = (typeof DAILY_PLATFORMS)[number];

export const HANDLE_RE = /^@[A-Za-z0-9._]{1,30}$/;
export const VERSE_REF_RE = /^[a-z]+:\d+:\d+$/;
export const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export type ConfigView = {
  handle: string;
  startRef: string;
  platforms: DailyPlatform[];
  format: ReelFormat;
  mode: ConfigMode;
  schedule: ScheduleConfig;
};
export type ConfigPatch = Partial<ConfigView>;
export type PatchResult = { ok: true; value: ConfigPatch } | { ok: false; errors: Record<string, string> };

const KEYS: readonly string[] = ['handle', 'startRef', 'platforms', 'format', 'mode', 'schedule'];

function isTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Validates a partial settings change. Never throws: the form renders `errors` under
 *  the offending fields and the route answers them as a 400, so both sides say the
 *  same thing. Only the keys present are checked — a card saves its own fields. */
export function validateConfigPatch(input: unknown, opts: { verseRefs?: Set<string> } = {}): PatchResult {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return { ok: false, errors: { _: 'expected an object of settings' } };
  const patch = input as Record<string, unknown>;
  if (Object.keys(patch).length === 0) return { ok: false, errors: { _: 'nothing to save' } };

  const errors: Record<string, string> = {};
  const value: ConfigPatch = {};
  for (const key of Object.keys(patch)) if (!KEYS.includes(key)) errors[key] = 'unknown setting';

  if ('handle' in patch) {
    const handle = typeof patch.handle === 'string' ? patch.handle.trim() : '';
    if (!HANDLE_RE.test(handle)) errors.handle = 'use @ then 1-30 letters, digits, dots or underscores';
    else value.handle = handle;
  }

  if ('startRef' in patch) {
    const ref = typeof patch.startRef === 'string' ? patch.startRef.trim() : '';
    if (!VERSE_REF_RE.test(ref)) errors.startRef = 'use book:chapter:verse, e.g. gita:1:1';
    else if (opts.verseRefs && !opts.verseRefs.has(ref)) errors.startRef = `${ref} is not a verse in sources/gita.json`;
    else value.startRef = ref;
  }

  if ('platforms' in patch) {
    const list = patch.platforms;
    if (!Array.isArray(list)) errors.platforms = 'expected a list of platforms';
    else if (list.includes('facebook')) errors.platforms = 'Facebook publishes from the calendar, not the daily run';
    else if (!list.every((p) => (DAILY_PLATFORMS as readonly unknown[]).includes(p))) errors.platforms = 'unknown platform';
    else if (list.length === 0) errors.platforms = 'pick at least one platform';
    else value.platforms = DAILY_PLATFORMS.filter((p) => list.includes(p));
  }

  if ('format' in patch) {
    if (!(FORMATS as readonly unknown[]).includes(patch.format)) errors.format = `expected ${FORMATS.join(' or ')}`;
    else value.format = patch.format as ReelFormat;
  }

  if ('mode' in patch) {
    if (!(MODES as readonly unknown[]).includes(patch.mode)) errors.mode = `expected ${MODES.join(' or ')}`;
    else value.mode = patch.mode as ConfigMode;
  }

  if ('schedule' in patch) {
    const s = patch.schedule;
    if (!s || typeof s !== 'object' || Array.isArray(s)) errors.schedule = 'expected an object';
    else {
      const o = s as Record<string, unknown>;
      if (typeof o.daysAhead !== 'number' || !Number.isInteger(o.daysAhead) || o.daysAhead < 1 || o.daysAhead > 14)
        errors['schedule.daysAhead'] = 'a whole number of days, 1 to 14';
      const times = (o.defaultTimes && typeof o.defaultTimes === 'object' ? o.defaultTimes : {}) as Record<string, unknown>;
      for (const p of PLATFORMS)
        if (typeof times[p] !== 'string' || !HHMM_RE.test(times[p] as string))
          errors[`schedule.defaultTimes.${p}`] = 'use HH:mm, e.g. 07:00';
      if (!isTimezone(o.timezone)) errors['schedule.timezone'] = 'unknown time zone';
      // The pipeline's reader clamps; a form must not silently change what you typed,
      // so the value is only accepted once every field above passed.
      if (!Object.keys(errors).some((k) => k.startsWith('schedule'))) value.schedule = validateScheduleConfig(s);
    }
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value };
}
```

- [ ] **Step 4: Run the test** — `npx vitest run shared/config.test.ts` → PASS.

- [ ] **Step 5: Write the `gh` parsers and their test.** The two things worth pinning about `gh` output are pure string work, so they live outside the backend where a test can reach them without importing sharp/execa. `dashboard/lib/connections-parse.ts`:

```ts
export type WorkflowState = 'active' | 'disabled' | 'unknown';

/** `gh secret list --json name -q '.[].name'` prints one name per line. */
export function parseSecretNames(stdout: string): Set<string> {
  return new Set(stdout.split('\n').map((s) => s.trim()).filter(Boolean));
}

/** `gh workflow list --all` prints tab-separated `name<TAB>state<TAB>id`. Anything we
 *  do not recognise stays 'unknown' rather than guessing "disabled" — the card says
 *  so, and nobody enables a workflow on a bad guess. */
export function parseWorkflowStates(stdout: string, names: readonly string[]): Record<string, WorkflowState> {
  const out: Record<string, WorkflowState> = {};
  for (const name of names) out[name] = 'unknown';
  for (const line of stdout.split('\n')) {
    const [name, state] = line.split('\t').map((s) => s.trim());
    if (!name || !names.includes(name)) continue;
    out[name] = state === 'active' ? 'active' : state ? 'disabled' : 'unknown';
  }
  return out;
}
```

`scripts/dashboard-connections.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseSecretNames, parseWorkflowStates } from '../dashboard/lib/connections-parse.ts';

describe('gh output parsing', () => {
  it('reads secret names, ignoring blank lines and padding', () => {
    const names = parseSecretNames('YT_CLIENT_ID\n  IG_USER_ID  \n\n');
    expect([...names].sort()).toEqual(['IG_USER_ID', 'YT_CLIENT_ID']);
    expect(parseSecretNames('').size).toBe(0);
  });

  it('reads workflow states and leaves anything unseen unknown', () => {
    const stdout = 'ci\tactive\t1\ndaily-reel\tdisabled_manually\t2\npublisher\tactive\t3';
    expect(parseWorkflowStates(stdout, ['daily-reel', 'publisher'])).toEqual({ 'daily-reel': 'disabled', publisher: 'active' });
    expect(parseWorkflowStates('', ['daily-reel', 'publisher'])).toEqual({ 'daily-reel': 'unknown', publisher: 'unknown' });
    expect(parseWorkflowStates('publisher\t\t3', ['publisher'])).toEqual({ publisher: 'unknown' });
  });
});
```
Run `npx vitest run scripts/dashboard-connections.test.ts` → FAIL, write the module, → PASS.

- [ ] **Step 6: Implement the seam** in `dashboard/lib/local-backend.ts` (imports: `validateConfigPatch, DAILY_PLATFORMS, FORMATS, MODES, type ConfigView` from `../../shared/config.ts`; `PLATFORMS, validateScheduleConfig` from `../../shared/schedule.ts`; `secretsFor, loadDotenv` from `../../pipeline/schedule-io.ts` — already imported for the calendar; `parseSecretNames, parseWorkflowStates` from `./connections-parse.ts`; `type ConnectionsView` from `./backend.ts`):

```ts
const CONFIG_PATH = () => join(REPO_ROOT, 'config.json');

/** Thrown by updateConfig when the patch breaks a rule; carries the same field-keyed
 *  map the form renders, so the route can answer it verbatim as a 400. */
export class ConfigValidationError extends Error {
  constructor(public errors: Record<string, string>) {
    super(Object.entries(errors).map(([k, v]) => `${k}: ${v}`).join('; '));
  }
}

async function getConfig(): Promise<ConfigView> {
  const raw = JSON.parse(await readFile(CONFIG_PATH(), 'utf8')) as Record<string, unknown>;
  const platforms = Array.isArray(raw.platforms) ? raw.platforms : [];
  return {
    handle: typeof raw.handle === 'string' ? raw.handle : '',
    startRef: typeof raw.startRef === 'string' ? raw.startRef : 'gita:1:1',
    platforms: DAILY_PLATFORMS.filter((p) => platforms.includes(p)),
    format: (FORMATS as readonly unknown[]).includes(raw.format) ? (raw.format as ConfigView['format']) : 'classic',
    // A missing mode means the legacy daily pipeline — the same default the publisher uses.
    mode: (MODES as readonly unknown[]).includes(raw.mode) ? (raw.mode as ConfigView['mode']) : 'daily',
    schedule: validateScheduleConfig(raw.schedule),
  };
}

function updateConfig(patch: unknown): Promise<ConfigView> {
  const result = queue.then(() => updateConfigExclusive(patch));
  queue = result.then(() => undefined, () => undefined);
  return result;
}

async function updateConfigExclusive(patch: unknown): Promise<ConfigView> {
  // config.json is read by every run; refuse while one holds the lock, exactly as
  // calendar edits do.
  assertPublisherIdle();
  const sources = JSON.parse(await readFile(join(REPO_ROOT, 'sources/gita.json'), 'utf8')) as { verses: Verse[] };
  const checked = validateConfigPatch(patch, { verseRefs: new Set(sources.verses.map((v) => v.ref)) });
  if (!checked.ok) throw new ConfigValidationError(checked.errors);
  const raw = JSON.parse(await readFile(CONFIG_PATH(), 'utf8')) as Record<string, unknown>;
  // Spread over the parsed file, so keys this panel does not know about survive.
  await writeFile(CONFIG_PATH(), JSON.stringify({ ...raw, ...checked.value }, null, 2) + '\n');
  return getConfig();
}

async function getConnections(): Promise<ConnectionsView> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  loadDotenv(join(REPO_ROOT, '.env'), env);
  const platforms = Object.fromEntries(
    PLATFORMS.map((p) => {
      const local = secretsFor(p, env);
      // secretsFor over an empty env names every key the platform needs.
      const missingFromEmpty = secretsFor(p, {});
      const secrets = missingFromEmpty.ok ? [] : missingFromEmpty.missing;
      return [p, { local: local.ok, actions: null as boolean | null, secrets }];
    }),
  ) as ConnectionsView['platforms'];
  let workflows: ConnectionsView['workflows'] = { 'daily-reel': 'unknown', publisher: 'unknown' };
  let ghAvailable = false;
  try {
    const secretList = await execa('gh', ['secret', 'list', '--json', 'name', '-q', '.[].name'], { cwd: REPO_ROOT, timeout: 8000 });
    const names = parseSecretNames(secretList.stdout);
    ghAvailable = true;
    for (const p of PLATFORMS) platforms[p].actions = platforms[p].secrets.every((k) => names.has(k));
    const list = await execa('gh', ['workflow', 'list', '--all'], { cwd: REPO_ROOT, timeout: 8000 });
    workflows = parseWorkflowStates(list.stdout, ['daily-reel', 'publisher']) as ConnectionsView['workflows'];
  } catch {
    // gh missing, unauthenticated, or no remote — the local .env status above still stands.
  }
  return { ghAvailable, platforms, workflows };
}
```
Register `getConfig`, `updateConfig`, `getConnections` on `localBackend`; declare them on `Backend` with doc comments in the existing style; export `ConfigValidationError` from `dashboard/lib/backend.ts` beside `InvalidImageError`; define and export `ConnectionsView` in `backend.ts` (re-exporting `WorkflowState` from `./connections-parse.ts`). `sync()`: add `'config.json'` to `SYNC_PATHS` and change the commit message to `chore: sync dashboard edits (backgrounds, style, beats, quotes, calendar, config)`.

- [ ] **Step 7: Write the routes.**

`dashboard/app/api/config/route.ts`:
```ts
import { ConfigValidationError, getBackend } from '../../../lib/backend.ts';
import { assertLocalOrigin } from '../../../lib/assert-local-origin.ts';

export async function GET() {
  try {
    return Response.json(await getBackend().getConfig());
  } catch (e) {
    // A malformed config.json is the source of truth being broken — say so loudly.
    return Response.json({ error: e instanceof Error ? e.message : 'could not read config.json' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const rejected = assertLocalOrigin(req);
  if (rejected) return rejected;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  try {
    return Response.json(await getBackend().updateConfig(body));
  } catch (e) {
    if (e instanceof ConfigValidationError) return Response.json({ errors: e.errors }, { status: 400 });
    const message = e instanceof Error ? e.message : 'could not save';
    if (/publisher running/.test(message)) return Response.json({ error: 'publisher running' }, { status: 409 });
    return Response.json({ error: message }, { status: 400 });
  }
}
```

`dashboard/app/api/connections/route.ts`:
```ts
import { getBackend } from '../../../lib/backend.ts';

export async function GET() {
  return Response.json(await getBackend().getConnections());
}
```

- [ ] **Step 8: Verify with curl** (server detached; kill it after). `GET /api/config` → the current values with `mode: 'calendar'` and the IST schedule. `PATCH /api/config` with `{"handle":"@gita.test"}` → 200 and `config.json` shows it; `{"handle":"bad"}` → 400 `{"errors":{"handle":"…"}}`; `{"platforms":["facebook"]}` → 400 naming the calendar; `{"nope":1}` → 400 `unknown setting`; `-H 'Origin: https://evil.example'` → 403. `GET /api/connections` → `ghAvailable: true`, all three platforms `local:false`, `daily-reel`/`publisher` `disabled`. Restore the handle: `PATCH` it back to `@yourhandle` and confirm `git diff config.json` is empty.

- [ ] **Step 9: Checks and commit** — `npm test`, both typechecks green.

```bash
git add shared/config.ts shared/config.test.ts dashboard/lib/backend.ts dashboard/lib/local-backend.ts dashboard/lib/connections-parse.ts scripts/dashboard-connections.test.ts dashboard/app/api/config dashboard/app/api/connections
git commit -m "feat: config and connections behind the dashboard seam"
```

---

### Task 4: Token sweep — every component on the palette

**Files:**
- Move: `dashboard/app/components/studio/ui.tsx` → `dashboard/app/components/ui.tsx` (update the ~10 importers)
- Modify (colours only): `dashboard/app/components/{StatusBar,GeneratePanel,UploadZone,Library}.tsx`, `components/studio/{BeatsEditor,MediaControls,PreviewPane,StyleControls}.tsx`, `components/quotes/{QuotesTable,CustomQuoteForm}.tsx`, `components/calendar/{CalendarTable,PostDrawer,AddToCalendar}.tsx`, `app/{page,studio/page,quotes/page,calendar/page}.tsx`
- Modify: `scripts/dashboard-theme.test.ts` (add the guard)

**Interfaces:**
- Produces: `dashboard/app/components/ui.tsx` exporting the same names as before (`panelClass`, `headingClass`, `selectClass`, `buttonClass`, `ghostButtonClass`, `iconButtonClass`, `rangeClass`, `labelClass`, `Field`, `Slider`, `Toggle`) — tokenised. Every later task imports primitives from this path.

- [ ] **Step 1: Write the failing guard** — append to `scripts/dashboard-theme.test.ts`:

```ts
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe('dashboard uses the palette, not raw colours', () => {
  const files = walk('dashboard/app').filter((f) => /\.tsx?$/.test(f));

  it('has files to check', () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it('contains no raw hex colour', () => {
    const offenders = files.filter((f) => /#[0-9a-fA-F]{6}\b/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('contains no palette, white or black colour class', () => {
    // e.g. text-red-400, ring-white/5, border-white/10, bg-black/40 — all of which
    // have a token equivalent (danger / line / fg-with-opacity).
    const banned = /\b(?:bg|text|border|ring|from|to|via|accent|fill|stroke|divide|outline|decoration|shadow)-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{2,3})?(?:\/\d{1,3})?\b/;
    const offenders = files.filter((f) => banned.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail** — `npx vitest run scripts/dashboard-theme.test.ts` → FAIL listing ~18 files.

- [ ] **Step 3: Move the primitives.** `git mv dashboard/app/components/studio/ui.tsx dashboard/app/components/ui.tsx`, then update every importer (`grep -rl "studio/ui.tsx" dashboard/app`) — from `./ui.tsx` / `../studio/ui.tsx` / `../components/studio/ui.tsx` to the new relative path. Do not change any exported name.

- [ ] **Step 4: Rewrite the primitives on tokens** — in `dashboard/app/components/ui.tsx`:

```tsx
export const panelClass = 'rounded-xl border border-line bg-surface p-4';
export const headingClass = 'text-[11px] font-medium uppercase tracking-[0.18em] text-muted';
export const selectClass =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40';
export const buttonClass =
  'rounded-lg bg-accent px-4 py-2 text-sm font-medium text-ink transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50';
export const ghostButtonClass =
  'rounded-lg border border-accent/50 px-3 py-1.5 text-sm text-accent-text transition-colors hover:bg-accent/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-40';
export const iconButtonClass =
  'rounded border border-line px-1.5 py-0.5 text-[11px] leading-none text-muted transition-colors hover:border-accent/50 hover:text-accent-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-30';
export const rangeClass = 'mt-1 w-full accent-accent';
export const labelClass = 'text-[10px] uppercase tracking-[0.18em] text-muted';
```
Keep `Field`, `Slider`, `Toggle` unchanged except their inner colour classes: `text-[#e8c874]` → `text-accent-text`, `accent-[#e8c874]` → `accent-accent`, `text-[#f5efe0]` → `text-fg`.

- [ ] **Step 5: Sweep the remaining files** with this mapping (apply per file; nothing else changes):

| was | becomes |
|---|---|
| `bg-[#161028]` (card) | `bg-surface` + add `border border-line` where a `ring-1 ring-white/5` is being removed |
| `bg-[#0d0817]` on a **log, player or thumbnail** | `bg-video` |
| `bg-[#0d0817]` on an **input or inset block** | `bg-surface` (inputs) / `bg-surface-2` (inset blocks) |
| `text-[#f5efe0]` | `text-fg` |
| `text-[#a89f8d]` (and `/70`, `/40` variants) | `text-muted` (keep the opacity suffix) |
| `text-[#e8c874]` (and `/80`, `/70`, `/50`) | `text-accent-text` (keep the suffix) |
| `bg-[#e8c874]` + `text-[#0d0817]` | `bg-accent` + `text-ink` |
| `hover:bg-[#f2d894]` | `hover:opacity-90` |
| `bg-[#e8c874]/15`, `/10`, `/5` | `bg-accent/15`, `/10`, `/5` |
| `border-[#e8c874]/40`, `/30`, `/60` | `border-accent/50` (one weight) |
| `ring-[#e8c874]/60`, `/40` | `ring-accent/60`, `/40` |
| `ring-white/5`, `ring-white/10`, `ring-white/25` | `ring-line` |
| `border-white/10`, `border-white/5` | `border-line` |
| `text-red-400` | `text-danger` |
| `border-red-500/60`, `ring-red-500/20` | `border-danger/60`, `ring-danger/20` |
| `accent-[#e8c874]` | `accent-accent` |
| `bg-black/*` (drawer scrim, badge backdrop) | `bg-fg/20` |

Per-file notes: **PreviewPane** — the Player wrapper and its loading skeleton use `bg-video` and `ring-line`; **GeneratePanel / studio page** — the `<pre>` render log stays `bg-video text-muted`; **CalendarTable** — status badges map `published → text-success`, `failed → text-danger`, `skipped → text-muted`, `scheduled → text-accent-text`, `draft → text-warning`, each on `bg-surface-2`; **QuotesTable** — the ⭐ pressed state uses `text-accent-text`, unpressed `text-muted`; **StatusBar** — chips become `bg-surface-2` inside the card; **UploadZone** — the dashed drop zone uses `border-accent/50` and `hover:bg-accent/5`; **Library** — the `▶` clip badge uses `bg-fg/20 text-accent-text`.

- [ ] **Step 6: Run the guard and the suites** — `npx vitest run scripts/dashboard-theme.test.ts` → PASS (all three assertions); `npm test`, `npm run typecheck`, `npm run typecheck --prefix dashboard` → green.

- [ ] **Step 7: Verify both themes in a browser.** With the server up, visit `/`, `/studio`, `/quotes`, `/calendar`, `/library` in light; take a `browser_take_screenshot` of each and Read them: white cards on the warm background, gold used only for accents, text legible. Then `browser_evaluate` `document.documentElement.dataset.theme='dark'` and screenshot `/` and `/calendar` again: the original dark look. Confirm the Studio Player and the render log stay dark in both. Kill the server.

- [ ] **Step 8: Commit**

```bash
git add dashboard/app scripts/dashboard-theme.test.ts
git commit -m "refactor: move every dashboard surface onto the theme tokens"
```

---

### Task 5: Settings page — Channel and Publishing schedule

**Files:**
- Create: `dashboard/app/settings/page.tsx`, `dashboard/app/components/settings/{SettingsCard,fields,ChannelCard,ScheduleCard}.tsx`
- Modify: `dashboard/app/components/shell/nav.ts`, `scripts/dashboard-nav.test.ts`, `dashboard/app/calendar/page.tsx` (link the config strip to Settings)

**Interfaces:**
- Consumes: `GET/PATCH /api/config`, `validateConfigPatch`, `GET /api/state` (`chapters` for the start-verse selects), the primitives in `components/ui.tsx`.
- Produces: `<SettingsCard title description? dirty saving error savedAt onSave children />`; field wrappers `TextField`, `NumberField`, `TimeField`, `SelectField`, `CheckboxRow`, `FieldError`; `<ChannelCard config onSaved />`, `<ScheduleCard config onSaved />` (both take the loaded `ConfigView` and call `onSaved(next)` after a successful PATCH).

- [ ] **Step 1: Update the nav test first** — in `scripts/dashboard-nav.test.ts` change the href expectation to `['/', '/studio', '/quotes', '/calendar', '/library', '/settings']`; run `npx vitest run scripts/dashboard-nav.test.ts` → FAIL.

- [ ] **Step 2: Add Settings to `NAV`** (`dashboard/app/components/shell/nav.ts`), after Library:
```ts
  { href: '/settings', label: 'Settings', icon: 'settings' },
```
Run the test → PASS.

- [ ] **Step 3: Write `dashboard/app/components/settings/SettingsCard.tsx`**:

```tsx
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
  onSave,
  children,
}: {
  title: string;
  description?: string;
  dirty: boolean;
  saving: boolean;
  error: string | null;
  saved: boolean;
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
        <button type="button" className={buttonClass} disabled={!dirty || saving} onClick={onSave}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Write `dashboard/app/components/settings/fields.tsx`**:

```tsx
'use client';
import { labelClass, selectClass } from '../ui.tsx';

export function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-xs text-danger">{message}</p> : null;
}

export function TextField({
  label, hint, value, onChange, error, placeholder, maxLength,
}: {
  label: string; hint?: string; value: string; onChange: (v: string) => void;
  error?: string; placeholder?: string; maxLength?: number;
}) {
  return (
    <label className="block">
      <span className={labelClass}>
        {label}
        {hint && <span className="ml-1 tracking-normal text-muted">{hint}</span>}
      </span>
      <input
        aria-label={label}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 ${selectClass} ${error ? 'border-danger' : ''}`}
      />
      <FieldError message={error} />
    </label>
  );
}

export function NumberField({
  label, hint, value, min, max, onChange, error,
}: {
  label: string; hint?: string; value: number; min: number; max: number;
  onChange: (v: number) => void; error?: string;
}) {
  return (
    <label className="block">
      <span className={labelClass}>
        {label}
        {hint && <span className="ml-1 tracking-normal text-muted">{hint}</span>}
      </span>
      <input
        type="number"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`mt-1 ${selectClass} ${error ? 'border-danger' : ''}`}
      />
      <FieldError message={error} />
    </label>
  );
}

export function TimeField({
  label, value, onChange, error,
}: { label: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input
        type="time"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 ${selectClass} ${error ? 'border-danger' : ''}`}
      />
      <FieldError message={error} />
    </label>
  );
}

export function SelectField({
  label, hint, value, options, onChange, error,
}: {
  label: string; hint?: string; value: string; options: { value: string; label: string }[];
  onChange: (v: string) => void; error?: string;
}) {
  return (
    <label className="block">
      <span className={labelClass}>
        {label}
        {hint && <span className="ml-1 tracking-normal text-muted">{hint}</span>}
      </span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={`mt-1 ${selectClass}`}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <FieldError message={error} />
    </label>
  );
}

export function CheckboxRow({
  label, hint, checked, onChange,
}: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-sm text-fg">
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 accent-accent"
      />
      <span>
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}
```

- [ ] **Step 5: Write `dashboard/app/components/settings/ChannelCard.tsx`** — draft state, client-side validation through the shared validator, PATCH only the changed keys:

```tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import { FORMATS, MODES, DAILY_PLATFORMS, validateConfigPatch, type ConfigView, type DailyPlatform } from '../../../../shared/config.ts';
import { SettingsCard } from './SettingsCard.tsx';
import { CheckboxRow, SelectField, TextField } from './fields.tsx';

const MODE_HINT: Record<string, string> = {
  calendar: 'the hourly publisher fills and posts the calendar',
  daily: 'the old 7:00 AM workflow posts the next verse',
};

export function ChannelCard({
  config,
  chapters,
  onSaved,
}: {
  config: ConfigView;
  chapters: number[];
  onSaved: (next: ConfigView) => void;
}) {
  const [draft, setDraft] = useState(config);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  useEffect(() => setDraft(config), [config]);

  const [chapter, verse] = useMemo(() => {
    const [, c, v] = draft.startRef.split(':');
    return [Number(c) || 1, Number(v) || 1];
  }, [draft.startRef]);

  const patch = useMemo(() => {
    const p: Record<string, unknown> = {};
    if (draft.handle !== config.handle) p.handle = draft.handle;
    if (draft.startRef !== config.startRef) p.startRef = draft.startRef;
    if (draft.format !== config.format) p.format = draft.format;
    if (draft.mode !== config.mode) p.mode = draft.mode;
    if (draft.platforms.join() !== config.platforms.join()) p.platforms = draft.platforms;
    return p;
  }, [draft, config]);
  const dirty = Object.keys(patch).length > 0;
  // The same validator the route runs, so a field that would be refused says so here first.
  const localErrors = useMemo(() => {
    if (!dirty) return {};
    const r = validateConfigPatch(patch);
    return r.ok ? {} : r.errors;
  }, [patch, dirty]);
  const errors = { ...localErrors, ...serverErrors };

  async function save() {
    setSaving(true);
    setError(null);
    setServerErrors({});
    try {
      const res = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const body = (await res.json().catch(() => ({}))) as { errors?: Record<string, string>; error?: string } & Partial<ConfigView>;
      if (!res.ok) {
        if (body.errors) setServerErrors(body.errors);
        else setError(body.error ?? `save failed (${res.status})`);
        return;
      }
      onSaved(body as ConfigView);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }

  const togglePlatform = (p: DailyPlatform, on: boolean) =>
    setDraft((d) => ({ ...d, platforms: DAILY_PLATFORMS.filter((x) => (x === p ? on : d.platforms.includes(x))) }));

  return (
    <SettingsCard
      title="Channel"
      description="Who the reels are for and what the automation renders by default."
      dirty={dirty}
      saving={saving}
      error={error}
      saved={saved}
      onSave={save}
    >
      <TextField
        label="handle"
        hint="stamped on every reel"
        value={draft.handle}
        placeholder="@yourhandle"
        maxLength={31}
        error={errors.handle}
        onChange={(handle) => setDraft((d) => ({ ...d, handle }))}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="default format"
          value={draft.format}
          options={FORMATS.map((f) => ({ value: f, label: f }))}
          error={errors.format}
          onChange={(format) => setDraft((d) => ({ ...d, format: format as ConfigView['format'] }))}
        />
        <SelectField
          label="mode"
          hint={MODE_HINT[draft.mode]}
          value={draft.mode}
          options={MODES.map((m) => ({ value: m, label: m }))}
          error={errors.mode}
          onChange={(mode) => setDraft((d) => ({ ...d, mode: mode as ConfigView['mode'] }))}
        />
        <SelectField
          label="start chapter"
          value={String(chapter)}
          options={Array.from({ length: chapters.length || 18 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
          onChange={(c) => setDraft((d) => ({ ...d, startRef: `gita:${c}:1` }))}
        />
        <SelectField
          label="start verse"
          hint="auto-fill walks forward from here"
          value={String(verse)}
          options={Array.from({ length: chapters[chapter - 1] ?? 1 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
          error={errors.startRef}
          onChange={(v) => setDraft((d) => ({ ...d, startRef: `gita:${chapter}:${v}` }))}
        />
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted">daily-mode platforms</p>
        <div className="mt-2 space-y-2">
          {DAILY_PLATFORMS.map((p) => (
            <CheckboxRow
              key={p}
              label={p}
              checked={draft.platforms.includes(p)}
              onChange={(on) => togglePlatform(p, on)}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">Facebook publishes from the calendar, so it is not listed here.</p>
        {errors.platforms && <p className="mt-1 text-xs text-danger">{errors.platforms}</p>}
      </div>
    </SettingsCard>
  );
}
```

- [ ] **Step 6: Write `dashboard/app/components/settings/ScheduleCard.tsx`** — same shape, editing `schedule` as one object (the validator requires every field, so the card always sends the whole block):

```tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import { PLATFORMS } from '../../../../shared/schedule.ts';
import { validateConfigPatch, type ConfigView } from '../../../../shared/config.ts';
import { SettingsCard } from './SettingsCard.tsx';
import { NumberField, SelectField, TimeField } from './fields.tsx';

/** Intl.supportedValuesOf is in every browser this panel runs in; the fallback keeps
 *  the select usable rather than empty if it ever is not. */
function timezones(current: string): string[] {
  try {
    const all = (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone');
    return all.includes(current) ? all : [current, ...all];
  } catch {
    return [current, 'Asia/Kolkata', 'UTC'];
  }
}

export function ScheduleCard({ config, onSaved }: { config: ConfigView; onSaved: (next: ConfigView) => void }) {
  const [draft, setDraft] = useState(config.schedule);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  useEffect(() => setDraft(config.schedule), [config.schedule]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(config.schedule);
  const localErrors = useMemo(() => {
    if (!dirty) return {};
    const r = validateConfigPatch({ schedule: draft });
    return r.ok ? {} : r.errors;
  }, [draft, dirty]);
  const errors = { ...localErrors, ...serverErrors };

  async function save() {
    setSaving(true);
    setError(null);
    setServerErrors({});
    try {
      const res = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ schedule: draft }),
      });
      const body = (await res.json().catch(() => ({}))) as { errors?: Record<string, string>; error?: string } & Partial<ConfigView>;
      if (!res.ok) {
        if (body.errors) setServerErrors(body.errors);
        else setError(body.error ?? `save failed (${res.status})`);
        return;
      }
      onSaved(body as ConfigView);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsCard
      title="Publishing schedule"
      description="How far ahead the publisher fills the calendar, and the slot each platform gets."
      dirty={dirty}
      saving={saving}
      error={error}
      saved={saved}
      onSave={save}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label="days ahead"
          hint="1-14"
          value={draft.daysAhead}
          min={1}
          max={14}
          error={errors['schedule.daysAhead']}
          onChange={(daysAhead) => setDraft((d) => ({ ...d, daysAhead }))}
        />
        <SelectField
          label="time zone"
          value={draft.timezone}
          options={timezones(draft.timezone).map((t) => ({ value: t, label: t }))}
          error={errors['schedule.timezone']}
          onChange={(timezone) => setDraft((d) => ({ ...d, timezone }))}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {PLATFORMS.map((p) => (
          <TimeField
            key={p}
            label={`${p} time`}
            value={draft.defaultTimes[p]}
            error={errors[`schedule.defaultTimes.${p}`]}
            onChange={(v) => setDraft((d) => ({ ...d, defaultTimes: { ...d.defaultTimes, [p]: v } }))}
          />
        ))}
      </div>
      <p className="text-xs text-muted">Times are wall-clock in the zone above; the calendar stores them as UTC.</p>
    </SettingsCard>
  );
}
```

- [ ] **Step 7: Write `dashboard/app/settings/page.tsx`** — loads config + chapters once and hands them to the cards (Tasks 6 and 7 add two more cards below):

```tsx
'use client';
import { useCallback, useEffect, useState } from 'react';
import type { ConfigView } from '../../../shared/config.ts';
import { PageHeader } from '../components/shell/PageHeader.tsx';
import { ChannelCard } from '../components/settings/ChannelCard.tsx';
import { ScheduleCard } from '../components/settings/ScheduleCard.tsx';

export default function SettingsPage() {
  const [config, setConfig] = useState<ConfigView | null>(null);
  const [chapters, setChapters] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/config')
      .then(async (r) => {
        const body = (await r.json()) as ConfigView & { error?: string };
        if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
        return body;
      })
      .then(setConfig)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    fetch('/api/state')
      .then((r) => r.json())
      .then((s: { chapters: number[] }) => setChapters(s.chapters))
      .catch(() => {});
  }, []);
  useEffect(load, [load]);

  return (
    <>
      <PageHeader title="Settings" description="Everything the reels and the automation read." />
      {error && <p className="mb-4 text-sm text-danger">{error}</p>}
      {!config && !error && <p className="text-sm text-muted">loading…</p>}
      {config && (
        <div className="space-y-6">
          <ChannelCard config={config} chapters={chapters} onSaved={setConfig} />
          <ScheduleCard config={config} onSaved={setConfig} />
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 8: Point the calendar at Settings** — in `dashboard/app/calendar/page.tsx`, next to the mode badge add `<Link href="/settings" className="text-accent-text hover:underline">edit schedule</Link>` (keep the existing `Link` import).

- [ ] **Step 9: Verify in a browser.** Server up. `/settings` shows both cards with the live values. Change the handle to `@gita.test`, Save → "saved", reload → persisted, and `curl -s localhost:4000/api/config` agrees. Type `bad` → the inline error appears and Save is disabled (`browser_evaluate` the button's `disabled`). Set days-ahead to 99 → inline error; back to 3 → clears. Change the YouTube time to 18:30 → Save → `/calendar` shows the new default in its strip. Restore the handle to `@yourhandle` and the time to `07:10`, then confirm `git diff config.json` is empty. Kill the server.

- [ ] **Step 10: Checks and commit** — `npm test`, both typechecks green.

```bash
git add dashboard/app/settings dashboard/app/components/settings dashboard/app/components/shell/nav.ts dashboard/app/calendar/page.tsx scripts/dashboard-nav.test.ts
git commit -m "feat: settings page with channel and publishing schedule"
```

---

### Task 6: Channel style card, and Studio as overrides

**Files:**
- Create: `dashboard/app/components/settings/StyleFields.tsx`, `dashboard/app/components/settings/StyleCard.tsx`, `dashboard/app/components/studio/preview-props.ts`, `scripts/dashboard-preview-props.test.ts`
- Modify: `dashboard/app/components/studio/StyleControls.tsx`, `dashboard/app/components/studio/MediaControls.tsx`, `dashboard/app/studio/page.tsx`, `dashboard/app/settings/page.tsx`

**Interfaces:**
- Produces: `buildCinemaPreviewProps({ verse, beats, style, handle, backgroundRel, musicRel, kicker, closing }): { props: ReelProps | null; totalSec: number; error: string | null }`; `<StyleFields style tracks onChange />` (the saved-style fields, no card chrome, no Save); `<StyleCard style tracks onSaved />` (card + fields + live preview + Save); `StyleControls` keeps its name and place in Studio but its props become `{ style, savedStyle, tracks, onChange, onReset }`.

- [ ] **Step 1: Write the failing test** — `scripts/dashboard-preview-props.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_STYLE } from '../shared/reel-style.ts';
import { buildCinemaPreviewProps } from '../dashboard/app/components/studio/preview-props.ts';
import type { Verse } from '../shared/types.ts';

const verse: Verse = {
  book: 'gita', ref: 'gita:2:47', chapter: 2, verse: 47,
  sanskrit: ['कर्मण्येवाधिकारस्ते'], hindi: 'तुम्हारा अधिकार कर्म पर है।',
  english: 'You have a right to work.', attribution: { hindi: 'h', english: 'e' },
};

describe('buildCinemaPreviewProps', () => {
  it('builds cinema props with the kicker, media and style it was given', () => {
    const r = buildCinemaPreviewProps({
      verse, beats: ['Do the work.', 'Release the outcome.'], style: DEFAULT_STYLE,
      handle: '@h', backgroundRel: 'assets/images/x.jpg', musicRel: null,
    });
    expect(r.error).toBeNull();
    expect(r.props?.format).toBe('cinema');
    expect(r.props?.cinema?.kicker).toBe('GITA 2.47');
    expect(r.props?.cinema?.beats).toEqual(['Do the work.', 'Release the outcome.']);
    expect(r.props?.media.background).toBe('/api/media/public/assets/images/x.jpg');
    expect(r.totalSec).toBeGreaterThanOrEqual(12);
  });

  it('takes a kicker and closing override (custom quotes) and a null background', () => {
    const r = buildCinemaPreviewProps({
      verse, beats: ['One.', 'Two.'], style: DEFAULT_STYLE, handle: '@h',
      backgroundRel: null, musicRel: null, kicker: 'श्रीकृष्ण कहते हैं',
      closing: { line: 'श्रीकृष्ण', reference: '' },
    });
    expect(r.props?.cinema?.kicker).toBe('श्रीकृष्ण कहते हैं');
    expect(r.props?.cinema?.closing).toEqual({ line: 'श्रीकृष्ण', reference: '' });
    expect(r.props?.media.background).toBeNull();
  });

  it('reports a timeline failure instead of throwing', () => {
    const r = buildCinemaPreviewProps({ verse, beats: [], style: DEFAULT_STYLE, handle: '@h', backgroundRel: null, musicRel: null });
    expect(r.props).toBeNull();
    expect(r.error).toMatch(/beat/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail** — `npx vitest run scripts/dashboard-preview-props.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write `dashboard/app/components/studio/preview-props.ts`** by lifting the body of Studio's `preview` memo verbatim (same `computeCinemaTimeline`/`computeTimeline` calls, same media URL shape) into:

```ts
import { computeCinemaTimeline, computeTimeline } from '../../../../pipeline/timeline.ts';
import type { ReelStyle } from '../../../../shared/reel-style.ts';
import type { ReelProps, Verse } from '../../../../shared/types.ts';

/** The single place the panel turns editor state into the exact props the renderer
 *  gets — Studio's live preview and the Settings style preview must never drift. */
export function buildCinemaPreviewProps(input: {
  verse: Verse;
  beats: string[];
  style: ReelStyle;
  handle: string;
  backgroundRel: string | null;
  musicRel: string | null;
  kicker?: string;
  closing?: { line: string; reference: string };
}): { props: ReelProps | null; totalSec: number; error: string | null } {
  try {
    const timings = computeCinemaTimeline(input.beats, input.style);
    const props: ReelProps = {
      verse: input.verse,
      // Unused by CinemaReel, required by the shared ReelProps — built exactly as
      // pipeline/run.ts builds it, so a translation that breaks the render breaks here.
      timings: computeTimeline({ introDurSec: 3, meaningDurSec: 10, englishText: input.verse.english }),
      format: 'cinema',
      cinema: {
        kicker: input.kicker ?? `GITA ${input.verse.chapter}.${input.verse.verse}`,
        beats: input.beats,
        timings,
        ...(input.closing ? { closing: input.closing } : {}),
      },
      style: input.style,
      audio: { introFile: null, meaningFile: null },
      media: {
        background: input.backgroundRel ? `/api/media/public/${input.backgroundRel}` : null,
        music: input.musicRel ? `/api/media/public/${input.musicRel}` : null,
      },
      brand: { handle: input.handle },
    };
    return { props, totalSec: timings.totalSec, error: null };
  } catch (e) {
    return { props: null, totalSec: 0, error: e instanceof Error ? e.message : String(e) };
  }
}
```
Run the test → PASS. Then rewrite Studio's `preview` memo to call it (behaviour unchanged).

- [ ] **Step 4: Extract `StyleFields`** — create `dashboard/app/components/settings/StyleFields.tsx` holding every *saved-style* control: the current `StyleControls` body (beat font, kicker font, ken burns, colours, sizes, scrim, duration scale, fade, transition + gap, show-kicker/show-handle toggles, prompt prefix) **plus** the music mode radios and track select currently in `MediaControls`. Signature:
```tsx
export function StyleFields({ style, tracks, onChange }: { style: ReelStyle; tracks: { file: string }[]; onChange: (patch: Partial<ReelStyle>) => void })
```
No card, no Save, no preview. Move `ROTATION_NOTE` (the "preview plays silent; the daily render picks a track per verse" string) from `MediaControls.tsx` into `StyleFields.tsx` and export it from there. Then strip `MediaControls` down to the background strip, the image-prompt block and the mp3 upload field: delete the music radios, the track select and the rotation note, and remove its now-unused `style` and `onChange` props (the image-prompt block already receives the composed `prompt` string as its own prop). Update `dashboard/app/studio/page.tsx`'s `ROTATION_NOTE` import to the new path and drop the `style`/`onChange` props it passed to `MediaControls`.

- [ ] **Step 5: Rewrite `StyleControls` as the Studio wrapper**:

```tsx
'use client';
import type { ReelStyle } from '../../../../shared/reel-style.ts';
import { StyleFields } from '../settings/StyleFields.tsx';
import { ghostButtonClass, headingClass, panelClass } from '../ui.tsx';
import Link from 'next/link';

/** Studio edits a *copy* of the channel style for this render only. Saving the look
 *  for every future reel lives on Settings, so there is exactly one place that writes
 *  styles/cinema.json. */
export function StyleControls({
  style,
  savedStyle,
  tracks,
  onChange,
  onReset,
}: {
  style: ReelStyle;
  savedStyle: ReelStyle | null;
  tracks: { file: string }[];
  onChange: (patch: Partial<ReelStyle>) => void;
  onReset: () => void;
}) {
  const modified = savedStyle !== null && JSON.stringify(style) !== JSON.stringify(savedStyle);
  return (
    <section className={panelClass}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={headingClass}>Look — this render only</h2>
        {modified && <span className="text-xs text-warning">modified</span>}
      </div>
      <div className="mt-3">
        <StyleFields style={style} tracks={tracks} onChange={onChange} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className={ghostButtonClass} disabled={!modified} onClick={onReset}>
          Reset to channel style
        </button>
        <Link href="/settings" className="text-xs text-accent-text hover:underline">
          Edit the channel style in Settings
        </Link>
      </div>
    </section>
  );
}
```
In `dashboard/app/studio/page.tsx`: keep a `savedStyle` state loaded from `/api/style` on mount (it already fetches it — store it in a second state as the baseline), pass `savedStyle`, `tracks` (from `assets.filter(a => a.kind === 'music')`) and `onReset={() => savedStyle && setStyle(savedStyle)}`; delete `saveStyle()`, its state (`savingStyle`, `savedStyle` echo, `styleError`) and the old props.

- [ ] **Step 6: Write `dashboard/app/components/settings/StyleCard.tsx`** — the same fields plus Save and a live preview on a fixed sample verse:

```tsx
'use client';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_STYLE, type ReelStyle } from '../../../../shared/reel-style.ts';
import type { Verse } from '../../../../shared/types.ts';
import { buildCinemaPreviewProps } from '../studio/preview-props.ts';
import { SettingsCard } from './SettingsCard.tsx';
import { StyleFields } from './StyleFields.tsx';

// video/fonts.ts calls loadFont() at module scope — browser only, same as Studio.
const PreviewPane = dynamic(() => import('../studio/PreviewPane.tsx').then((m) => m.PreviewPane), {
  ssr: false,
  loading: () => <div className="aspect-[9/16] w-full animate-pulse rounded-lg bg-video" />,
});

const SAMPLE_REF = 'gita:2:47';

export function StyleCard({ handle, tracks }: { handle: string; tracks: { file: string }[] }) {
  const [style, setStyle] = useState<ReelStyle>(DEFAULT_STYLE);
  const [savedStyle, setSavedStyle] = useState<ReelStyle | null>(null);
  const [verse, setVerse] = useState<Verse | null>(null);
  const [beats, setBeats] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/style').then((r) => r.json()).then((s: ReelStyle) => { setStyle(s); setSavedStyle(s); }).catch(() => {});
    fetch(`/api/verse/${encodeURIComponent(SAMPLE_REF)}`).then((r) => (r.ok ? r.json() : null)).then(setVerse).catch(() => {});
    fetch(`/api/beats/${encodeURIComponent(SAMPLE_REF)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { beats: string[] } | null) => setBeats(b?.beats.slice(0, 2) ?? []))
      .catch(() => {});
  }, []);

  const preview = useMemo(
    () => (verse ? buildCinemaPreviewProps({ verse, beats, style, handle, backgroundRel: null, musicRel: null }) : { props: null, totalSec: 0, error: null }),
    [verse, beats, style, handle],
  );
  const dirty = savedStyle !== null && JSON.stringify(style) !== JSON.stringify(savedStyle);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/style', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(style) });
      if (!res.ok) {
        setError(`save failed (${res.status})`);
        return;
      }
      const written = (await res.json()) as ReelStyle;
      // Adopt what the server actually wrote: it clamps, and the form must not drift.
      setStyle(written);
      setSavedStyle(written);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsCard
      title="Channel style"
      description="The look every render starts from. Studio can override it for one reel."
      dirty={dirty}
      saving={saving}
      error={error}
      saved={saved}
      onSave={save}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(220px,300px)] lg:items-start">
        <StyleFields style={style} tracks={tracks} onChange={(patch) => setStyle((s) => ({ ...s, ...patch }))} />
        <PreviewPane inputProps={preview.props} totalSec={preview.totalSec} error={preview.error} note={`sample: ${SAMPLE_REF}`} />
      </div>
    </SettingsCard>
  );
}
```
Mount it in `dashboard/app/settings/page.tsx` under the schedule card as `<StyleCard handle={config.handle} tracks={tracks} />`, where the page adds one more mount fetch beside the two it already has:

```tsx
  const [tracks, setTracks] = useState<{ file: string }[]>([]);
  // …inside load():
  fetch('/api/assets')
    .then((r) => r.json())
    .then((all: { file: string; kind: string }[]) => setTracks(all.filter((a) => a.kind === 'music')))
    .catch(() => {});
```

- [ ] **Step 7: Run the checks** — `npm test` (the new preview-props test included), both typechecks green.

- [ ] **Step 8: Verify in a browser.** Server up. On `/settings`: the style card shows the current look with a playing-capable preview; change the beat font to Cinzel → the preview's text font changes (`browser_evaluate` the Player DOM's `font-family`) and "unsaved changes" appears → Save → "saved" → reload → persisted → `styles/cinema.json` shows `cinzel`. On `/studio`: the Look panel now reads "this render only", changing a value shows "modified", **Reset to channel style** restores it and clears the badge; no "Save as channel style" button remains anywhere in Studio. Restore the font (set it back in Settings and Save) and confirm `git diff styles/cinema.json` is empty. Kill the server.

- [ ] **Step 9: Commit**

```bash
git add dashboard/app/components/settings dashboard/app/components/studio dashboard/app/studio/page.tsx dashboard/app/settings/page.tsx scripts/dashboard-preview-props.test.ts
git commit -m "feat: channel style lives in settings; studio edits one render"
```

---

### Task 7: Connections card, docs, and the whole-panel browser pass

**Files:**
- Create: `dashboard/app/components/settings/ConnectionsCard.tsx`
- Modify: `dashboard/app/settings/page.tsx`, `README.md`

- [ ] **Step 1: Write `ConnectionsCard`** — read-only, tolerant of a missing `gh`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { PLATFORMS } from '../../../../shared/schedule.ts';
import type { ConnectionsView } from '../../../lib/backend.ts';
import { headingClass, panelClass } from '../ui.tsx';

const SETUP: Record<string, string> = {
  youtube: 'SETUP.md §4 — Google Cloud → YouTube refresh token',
  instagram: 'SETUP.md §3 — Meta app → Instagram token',
  facebook: 'SETUP.md §3b — Facebook Page → Reels token',
};

function Dot({ on }: { on: boolean | null }) {
  return (
    <span
      className={`inline-block size-2 rounded-full ${on === null ? 'bg-muted' : on ? 'bg-success' : 'bg-danger'}`}
      aria-hidden
    />
  );
}

export function ConnectionsCard() {
  const [view, setView] = useState<ConnectionsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/connections')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setView)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <section className={panelClass}>
      <h2 className="text-base font-semibold text-fg">Connections</h2>
      <p className="mt-1 text-sm text-muted">
        Where each platform&rsquo;s secrets are. Set them with <code>gh secret set</code> and{' '}
        <code>.env</code> — the panel never writes them.
      </p>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {view && (
        <>
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className={headingClass}>
                <th scope="col" className="py-1 text-left">platform</th>
                <th scope="col" className="py-1 text-left">this machine (.env)</th>
                <th scope="col" className="py-1 text-left">GitHub Actions</th>
                <th scope="col" className="py-1 text-left">how to set</th>
              </tr>
            </thead>
            <tbody>
              {PLATFORMS.map((p) => (
                <tr key={p} className="border-t border-line">
                  <td className="py-2 text-fg">{p}</td>
                  <td className="py-2 text-muted">
                    <Dot on={view.platforms[p].local} /> {view.platforms[p].local ? 'present' : 'missing'}
                  </td>
                  <td className="py-2 text-muted">
                    <Dot on={view.platforms[p].actions} />{' '}
                    {view.platforms[p].actions === null ? 'unknown' : view.platforms[p].actions ? 'present' : 'missing'}
                  </td>
                  <td className="py-2 text-muted">{SETUP[p]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-sm text-muted">
            Workflows: daily-reel <strong className="text-fg">{view.workflows['daily-reel']}</strong> · publisher{' '}
            <strong className="text-fg">{view.workflows.publisher}</strong>
            {!view.ghAvailable && ' — GitHub CLI not available here, so only the local column is known.'}
          </p>
        </>
      )}
    </section>
  );
}
```
Mount it last on `/settings`.

- [ ] **Step 2: Update `README.md`** — in the Dashboard section: the six pages and what each is for; light/dark toggle; that Settings edits `config.json` (handle, default format, start verse, daily platforms, mode) and the schedule (days ahead, per-platform times, timezone) and the channel style (`styles/cinema.json`), while Studio overrides the look for one render; that Connections is read-only and secrets are set with `gh secret set` / `.env`; that Sync now also commits `config.json`. Keep the existing Studio/Quotes/Calendar/Image-prompt subsections, updating any sentence that says a control lives somewhere it no longer does.

- [ ] **Step 3: Whole-panel browser pass.** Server up. In **light**: walk `/`, `/studio`, `/quotes`, `/calendar`, `/library`, `/settings`; on each, screenshot and Read it — no dark card left, no unreadable text, the sidebar marks the right tab. Check `/settings` end to end once more: all four cards render; Connections shows three platforms with local `missing`, Actions `present`/`missing` per `gh`, and the two workflow states. In **dark** (toggle in the sidebar, then reload to prove it persists): spot-check `/` and `/settings`. On a phone width (390×800): the drawer opens, a link navigates and closes it. Kill the server; confirm `git status` shows only your intended files and `git diff config.json styles/cinema.json` is empty.

- [ ] **Step 4: Final checks** — `npm test`, `npm run typecheck`, `npm run typecheck --prefix dashboard` → green.

- [ ] **Step 5: Commit**

```bash
git add dashboard/app/components/settings/ConnectionsCard.tsx dashboard/app/settings/page.tsx README.md
git commit -m "feat: connections card and admin-panel docs"
```
