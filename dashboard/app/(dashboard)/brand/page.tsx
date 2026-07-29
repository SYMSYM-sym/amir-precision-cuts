import { REPO_SLUG } from '@/lib/identity';
import { BrandTabs } from './BrandTabs';

export default function BrandPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl text-ink">Brand files</h1>
      <p className="text-sm text-ink-dim">Commits go directly to main on {REPO_SLUG}.</p>
      <BrandTabs />
    </div>
  );
}
