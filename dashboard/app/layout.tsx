import './globals.css';
import { Sidebar } from './components/shell/Sidebar.tsx';

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
      <body className="min-h-screen bg-bg text-fg antialiased">
        <div className="min-h-screen md:flex">
          <Sidebar />
          <main className="mx-auto min-w-0 w-full max-w-7xl px-4 py-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
