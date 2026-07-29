import { PrCard } from '@/components/PrCard';
import { listOpenAutoArticlePRs } from '@/lib/github';

export default async function PrsPage() {
  let prs: Awaited<ReturnType<typeof listOpenAutoArticlePRs>> = [];
  let error: string | null = null;
  try {
    prs = await listOpenAutoArticlePRs();
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load PRs';
  }

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl text-ink">Auto-article pull requests</h1>
      {error ? <p className="text-danger">{error}</p> : null}
      {!error && prs.length === 0 ? (
        <p className="font-serif italic text-ink-dim">No open PRs with the auto-article label.</p>
      ) : null}
      <div className="space-y-4">
        {prs.map((p) => (
          <PrCard key={p.number} pr={p} />
        ))}
      </div>
    </div>
  );
}
