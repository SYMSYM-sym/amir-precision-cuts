import { DashboardHome } from '@/components/DashboardHome';
import { getHealthSnapshot } from '@/lib/health-data';
import { listWorkflowRuns, listOpenAutoArticlePRs } from '@/lib/github';
import { fetchQueueBundle } from '@/lib/data';

export default async function Page() {
  const health = await getHealthSnapshot();
  const runs = await listWorkflowRuns('publish-article.yml');
  const prs = await listOpenAutoArticlePRs();
  const { queue } = await fetchQueueBundle();
  const nextTopicTitle = queue[0]?.title ?? null;

  return <DashboardHome health={health} runs={runs} prs={prs} nextTopicTitle={nextTopicTitle} />;
}
