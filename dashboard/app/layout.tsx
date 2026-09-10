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
