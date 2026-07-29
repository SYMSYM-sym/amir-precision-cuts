'use client';

import { useState } from 'react';
import { RunRow } from '@/components/RunRow';
import { useToast } from '@/components/Providers';
import type { WorkflowRunSummary } from '@/types/run';

export function WorkflowsClient({
  initialRuns,
  queueSlugs,
}: {
  initialRuns: WorkflowRunSummary[];
  queueSlugs: string[];
}) {
  const toast = useToast();
  const [slug, setSlug] = useState('');
  const [runs] = useState(initialRuns);

  async function dispatch() {
    const trimmed = slug.trim();
    if (trimmed && !queueSlugs.includes(trimmed)) {
      toast.push('Slug is not in the current queue');
      return;
    }
    const res = await fetch('/api/workflows/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: trimmed }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.push(j.error || 'Dispatch failed');
      return;
    }
    toast.push('Workflow dispatched');
  }

  return (
    <div className="space-y-10">
      <section className="rounded-brand border border-line bg-bg-2 p-6">
        <h2 className="font-serif text-xl text-accent">Publish now</h2>
        <p className="mt-2 text-sm text-ink-dim">
          Optional slug must exist in queue.yaml. Leave blank to let pick-topic choose the next row.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Slug</span>
            <input
              className="mt-1 w-full rounded-brand border border-line-strong bg-bg-3 px-3 py-2 text-sm text-ink"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="e.g. first-male-brazilian-west-hollywood"
              list="queue-slugs"
            />
            <datalist id="queue-slugs">
              {queueSlugs.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
          <button
            type="button"
            className="rounded-full bg-accent px-6 py-2 text-sm font-semibold uppercase tracking-wide text-bg"
            onClick={() => void dispatch()}
          >
            Dispatch workflow
          </button>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-serif text-xl text-accent">Recent runs</h2>
        <div className="rounded-brand border border-line bg-bg-2 overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-mute">
                <th className="py-2 pr-4"> </th>
                <th className="py-2 pr-4">Workflow</th>
                <th className="py-2 pr-4">Duration</th>
                <th className="py-2 pr-4">Started</th>
                <th className="py-2"> </th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <RunRow key={r.id} run={r} />
              ))}
            </tbody>
          </table>
          {runs.length === 0 ? (
            <p className="p-4 font-serif italic text-ink-dim">No workflow runs returned.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
