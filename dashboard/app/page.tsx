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
