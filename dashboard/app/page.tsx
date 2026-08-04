import { StatusBar } from './components/StatusBar.tsx';
import { UploadZone } from './components/UploadZone.tsx';
import { Library } from './components/Library.tsx';
import { GeneratePanel } from './components/GeneratePanel.tsx';

export default function Page() {
  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <header>
        <h1 className="text-3xl font-semibold text-[#e8c874]">गीता Reels</h1>
        <p className="text-sm text-[#a89f8d]">daily shloka automation — control room</p>
      </header>
      <StatusBar />
      <GeneratePanel />
      <UploadZone />
      <Library />
    </main>
  );
}
