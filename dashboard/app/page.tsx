import Link from 'next/link';
import { StatusBar } from './components/StatusBar.tsx';
import { UploadZone } from './components/UploadZone.tsx';
import { Library } from './components/Library.tsx';
import { GeneratePanel } from './components/GeneratePanel.tsx';

export default function Page() {
  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-[#e8c874]">गीता Reels</h1>
          <p className="text-sm text-[#a89f8d]">daily shloka automation — control room</p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/quotes"
            className="rounded-lg border border-[#e8c874]/40 px-3 py-1.5 text-sm text-[#e8c874] transition-colors hover:bg-[#e8c874]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e8c874]/60"
          >
            Quotes →
          </Link>
          <Link
            href="/calendar"
            className="rounded-lg border border-[#e8c874]/40 px-3 py-1.5 text-sm text-[#e8c874] transition-colors hover:bg-[#e8c874]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e8c874]/60"
          >
            Calendar →
          </Link>
          <Link
            href="/studio"
            className="rounded-lg border border-[#e8c874]/40 px-3 py-1.5 text-sm text-[#e8c874] transition-colors hover:bg-[#e8c874]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e8c874]/60"
          >
            Studio →
          </Link>
        </div>
      </header>
      <StatusBar />
      <GeneratePanel />
      <UploadZone />
      <Library />
    </main>
  );
}
