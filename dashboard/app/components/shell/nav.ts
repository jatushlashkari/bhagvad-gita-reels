export type IconName = 'overview' | 'studio' | 'quotes' | 'calendar' | 'library' | 'settings';
export type NavItem = { href: string; label: string; icon: IconName };

export const NAV: NavItem[] = [
  { href: '/', label: 'Overview', icon: 'overview' },
  { href: '/studio', label: 'Studio', icon: 'studio' },
  { href: '/quotes', label: 'Quotes', icon: 'quotes' },
  { href: '/calendar', label: 'Calendar', icon: 'calendar' },
  { href: '/library', label: 'Library', icon: 'library' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

/** '/' is active only on itself; every other tab also owns its sub-paths, and the
 *  trailing-slash form counts (Next serves both). */
export function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
