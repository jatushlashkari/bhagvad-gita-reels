'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
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

  // Both close paths — Escape and the backdrop click — land here so they behave
  // identically: drop the drawer and hand focus back to the button that opened it.
  const close = useCallback(() => {
    setOpen(false);
    openerRef.current?.focus();
  }, []);

  // Opening moves focus into the drawer so the keyboard lands where the eyes do. While
  // open, Tab is trapped inside it — a dialog that lets Tab escape into the page behind
  // it isn't actually modal — wrapping from the last focusable element back to the
  // first (and Shift+Tab the other way); Escape still closes via `close()` above.
  useEffect(() => {
    if (!open) return;
    drawerRef.current?.querySelector('a')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = drawerRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  // Three states, three labels — a dot that reads "server ok" before the first ping has
  // even answered would be announcing a health check that hasn't happened yet.
  const healthLabel = healthy === false ? 'server unreachable' : healthy ? 'server ok' : 'checking the server…';
  const health = (
    <span
      aria-label={healthLabel}
      title={healthLabel}
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
          <div className="absolute inset-0 bg-fg/20" onClick={close} />
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
