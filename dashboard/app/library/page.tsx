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
