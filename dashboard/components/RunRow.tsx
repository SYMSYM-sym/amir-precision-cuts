import type { WorkflowRunSummary } from '@/types/run';
import { formatLocalDate } from '@/lib/fmt';

export function RunRow({ run }: { run: WorkflowRunSummary }) {
  const ok = run.conclusion === 'success';
  const fail = run.conclusion === 'failure';
  const dot = ok ? 'bg-ok' : fail ? 'bg-danger' : 'bg-warn';

  let duration = '—';
  if (run.run_started_at && run.updated_at) {
    const ms = new Date(run.updated_at).getTime() - new Date(run.run_started_at).getTime();
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    duration = `${m}m ${s}s`;
  }

  return (
    <tr className="border-b border-line">
      <td className="py-3 pr-4">
        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} title={run.conclusion ?? run.status} />
      </td>
      <td className="py-3 pr-4 text-sm text-ink">{run.name ?? 'Publish Article'}</td>
      <td className="py-3 pr-4 text-sm text-ink-dim">{duration}</td>
      <td className="py-3 pr-4 text-sm text-ink-dim">{formatLocalDate(run.run_started_at)}</td>
      <td className="py-3 text-right">
        <a href={run.html_url} target="_blank" rel="noreferrer" className="text-sm text-accent hover:underline">
          View
        </a>
      </td>
    </tr>
  );
}
