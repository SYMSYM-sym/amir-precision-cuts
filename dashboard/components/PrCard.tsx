'use client';

import { useState } from 'react';
import type { DashboardPR } from '@/types/pr';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Providers';
import { formatLocalDate } from '@/lib/fmt';

export function PrCard({ pr }: { pr: DashboardPR }) {
  const toast = useToast();
  const [confirm, setConfirm] = useState<'merge' | 'close' | null>(null);
  const onHold = pr.labels.includes('hold');

  async function toggleHold() {
    const method = onHold ? 'DELETE' : 'POST';
    const res = await fetch(`/api/prs/${pr.number}/hold`, { method });
    if (!res.ok) toast.push('Label update failed');
    else toast.push(onHold ? 'Hold removed' : 'Hold applied');
    window.location.reload();
  }

  async function merge() {
    const res = await fetch(`/api/prs/${pr.number}/merge`, { method: 'POST' });
    setConfirm(null);
    if (!res.ok) toast.push('Merge failed');
    else toast.push('Merged');
    window.location.reload();
  }

  async function closePr() {
    const res = await fetch(`/api/prs/${pr.number}/close`, { method: 'POST' });
    setConfirm(null);
    if (!res.ok) toast.push('Close failed');
    else toast.push('Closed');
    window.location.reload();
  }

  const excerpt = (pr.body ?? '').slice(0, 200).replace(/\s+/g, ' ');

  return (
    <article className="rounded-brand border border-line bg-bg-2 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <a href={pr.html_url} target="_blank" rel="noreferrer" className="font-serif text-lg text-ink hover:text-accent">
            {pr.title}
          </a>
          <p className="mt-1 text-xs text-ink-mute">
            #{pr.number} · opened {formatLocalDate(pr.created_at)}
            {onHold ? <span className="ml-2 text-warn">· on hold</span> : null}
          </p>
        </div>
      </div>
      {excerpt ? <p className="mt-3 text-sm text-ink-dim">{excerpt}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-full border border-line-strong px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink"
          onClick={() => void toggleHold()}
        >
          {onHold ? 'Release hold' : 'Hold'}
        </button>
        <button
          type="button"
          className="rounded-full bg-accent px-4 py-2 text-xs font-semibold uppercase tracking-wide text-bg"
          onClick={() => setConfirm('merge')}
        >
          Merge now
        </button>
        <button
          type="button"
          className="rounded-full border border-danger/40 px-4 py-2 text-xs font-semibold text-danger"
          onClick={() => setConfirm('close')}
        >
          Close
        </button>
      </div>

      <ConfirmDialog
        open={confirm === 'merge'}
        title="Merge pull request"
        body="Squash-merge this PR into main?"
        confirmLabel="Merge"
        onCancel={() => setConfirm(null)}
        onConfirm={() => void merge()}
      />
      <ConfirmDialog
        open={confirm === 'close'}
        title="Close pull request"
        body="Close this PR and delete its branch?"
        danger
        confirmLabel="Close"
        onCancel={() => setConfirm(null)}
        onConfirm={() => void closePr()}
      />
    </article>
  );
}
