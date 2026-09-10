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
