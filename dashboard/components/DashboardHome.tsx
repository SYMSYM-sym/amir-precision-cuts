import { REPO_SLUG } from '@/lib/identity';
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { KpiTile } from '@/components/KpiTile';
import { RunRow } from '@/components/RunRow';
import { PrCard } from '@/components/PrCard';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Providers';
import type { WorkflowRunSummary } from '@/types/run';
import type { DashboardPR } from '@/types/pr';
import { formatLocalDate } from '@/lib/fmt';

type Health = {
  lastSuccessfulRun: {
    id: number;
    conclusion: string | null;
    html_url: string;
    run_started_at: string | null;
    head_sha: string;
  } | null;
  nextRun: { eta: string; isoDate: string };
  openHoldPrs: number;
  totalQueue: number;
  totalPublished: number;
  embeddingsCacheAge: string | null;
};

export function DashboardHome({
  health,
  runs,
  prs,
  nextTopicTitle,
}: {
  health: Health;
  runs: WorkflowRunSummary[];
  prs: DashboardPR[];
  nextTopicTitle: string | null;
}) {
  const toast = useToast();
  const [pubOpen, setPubOpen] = useState(false);

  async function dispatchPublish() {
    const res = await fetch('/api/workflows/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    setPubOpen(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.push(j.error || 'Dispatch failed');
      return;
    }
    toast.push('Workflow dispatched');
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-serif text-3xl text-ink">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-dim">
            Next cron window (approx.): {health.nextRun.eta} · {formatLocalDate(health.nextRun.isoDate)}
          </p>
          {health.embeddingsCacheAge ? (
            <p className="text-xs text-ink-mute">Embeddings cache updated {health.embeddingsCacheAge}</p>
          ) : null}
        </div>
        <button
          type="button"
          className="rounded-full bg-accent px-6 py-3 text-sm font-semibold uppercase tracking-wide text-bg"
          onClick={() => setPubOpen(true)}
        >
          Publish next now
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Queue depth" value={health.totalQueue} />
        <KpiTile label="Published (logged)" value={health.totalPublished} />
        <KpiTile label="Open auto PRs" value={prs.length} />
        <KpiTile label="PRs on hold" value={health.openHoldPrs} />
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-xl text-accent">Recent workflow runs</h2>
          <Link href="/workflows" className="text-sm text-accent hover:underline">
            View all
          </Link>
        </div>
        <div className="rounded-brand border border-line bg-bg-2 overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <tbody>
              {runs.slice(0, 5).map((r) => (
                <RunRow key={r.id} run={r} />
              ))}
            </tbody>
          </table>
          {runs.length === 0 ? (
            <p className="p-4 font-serif italic text-ink-dim">No runs loaded yet.</p>
          ) : null}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-xl text-accent">Open PRs</h2>
          <Link href="/prs" className="text-sm text-accent hover:underline">
            View all
          </Link>
        </div>
        <div className="space-y-4">
          {prs.slice(0, 3).map((p) => (
            <PrCard key={p.number} pr={p} />
          ))}
          {prs.length === 0 ? (
            <p className="font-serif italic text-ink-dim">No open auto-article PRs.</p>
          ) : null}
        </div>
      </section>

      <ConfirmDialog
        open={pubOpen}
        title="Publish next article"
        body={`Dispatch the publish workflow on ${REPO_SLUG}? Next queued topic: ${nextTopicTitle ?? '(see queue)'}.`}
        confirmLabel="Dispatch"
        onCancel={() => setPubOpen(false)}
        onConfirm={() => void dispatchPublish()}
      />
    </div>
  );
}
