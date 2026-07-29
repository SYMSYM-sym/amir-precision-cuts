import { WorkflowsClient } from './WorkflowsClient';
import { listWorkflowRuns } from '@/lib/github';
import { fetchQueueBundle } from '@/lib/data';

export default async function WorkflowsPage() {
  const runs = await listWorkflowRuns('publish-article.yml');
  const { queue } = await fetchQueueBundle();
  const queueSlugs = queue.map((t) => t.slug);

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl text-ink">Workflows</h1>
      <WorkflowsClient initialRuns={runs} queueSlugs={queueSlugs} />
    </div>
  );
}
