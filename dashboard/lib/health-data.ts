import yaml from 'js-yaml';
import {
  listWorkflowRuns,
  listOpenAutoArticlePRs,
  getEmbeddingsFileMeta,
  getFile,
} from '@/lib/github';
import { QUEUE_PATH, PUBLISHED_PATH, NEEDS_REVIEW_PATH } from '@/lib/constants';
import { CADENCE_DAYS } from '@/lib/generated-constants';
import { parseQueueYaml } from '@/lib/yaml';
import { formatRelativeAge, nextScheduledPublish } from '@/lib/fmt';

export async function getHealthSnapshot() {
  const runs = await listWorkflowRuns('publish-article.yml');
  const lastSuccessfulRun = runs.find((r) => r.conclusion === 'success') ?? null;

  const nextRun = nextScheduledPublish();

  const prs = await listOpenAutoArticlePRs();
  const openHoldPrs = prs.filter((p) => p.labels.includes('hold')).length;

  const qRaw = await getFile(QUEUE_PATH);
  const queue = parseQueueYaml(qRaw.content);
  let pubEntries = 0;
  try {
    const pRaw = await getFile(PUBLISHED_PATH);
    const doc = yaml.load(pRaw.content) as { entries?: unknown[] };
    pubEntries = doc?.entries?.length ?? 0;
  } catch {
    pubEntries = 0;
  }

  const emb = await getEmbeddingsFileMeta();
  const embeddingsCacheAge = emb?.committed_at ? formatRelativeAge(emb.committed_at) : null;

  /**
   * NEVER BUILT IN THE REFERENCE (14 §B). getHealthSnapshot() returned six
   * fields and nothing computed staleness — so the dashboard could show a
   * cheerful green panel while the publisher had not run in two weeks.
   *
   * That is the exact shape of the 8-day outage: nothing was FAILING, so
   * nothing alerted. The only signal was absence, and absence has to be
   * computed — it never arrives as an event.
   *
   * Stale = more than one full publish interval has passed with no successful
   * run, plus a day of slack for a late cron.
   */
  const intervalDays = Math.max(1, Math.round(7 / Math.max(1, CADENCE_DAYS.length)));
  const staleAfterMs = (intervalDays + 1) * 24 * 60 * 60 * 1000;
  const lastRunAt = lastSuccessfulRun?.run_started_at
    ? new Date(lastSuccessfulRun.run_started_at).getTime()
    : null;
  const msSinceLastRun = lastRunAt ? Date.now() - lastRunAt : null;
  const isStale = msSinceLastRun === null || msSinceLastRun > staleAfterMs;

  /**
   * ALSO NEVER BUILT: nothing in the reference read needs-review.yaml at all.
   * Topics were quarantined into it correctly — R1 works — and then sat there
   * forever with no surface anywhere in the product. A self-healing loop that
   * nobody can see the output of heals the same topic into the bin every time.
   */
  let needsReviewCount = 0;
  let needsReviewNewest: string | null = null;
  try {
    const nrRaw = await getFile(NEEDS_REVIEW_PATH);
    const doc = yaml.load(nrRaw.content) as { entries?: { quarantined_at?: string }[] };
    const entries = doc?.entries ?? [];
    needsReviewCount = entries.length;
    needsReviewNewest = entries.length
      ? entries.map((e) => e.quarantined_at ?? '').sort().at(-1) ?? null
      : null;
  } catch {
    needsReviewCount = 0;
  }

  // Runway: how long the queue lasts at the configured cadence.
  const runwayDays = queue.length * intervalDays;

  return {
    isStale,
    staleReason: isStale
      ? (lastRunAt === null
        ? 'No successful publish run has ever been recorded.'
        : `No successful publish in ${formatRelativeAge(lastSuccessfulRun!.run_started_at!)} — expected roughly every ${intervalDays} day(s).`)
      : null,
    needsReviewCount,
    needsReviewNewest,
    runwayDays,
    lowRunway: queue.length > 0 && runwayDays < 21,
    queueEmpty: queue.length === 0,
    lastSuccessfulRun: lastSuccessfulRun
      ? {
          id: lastSuccessfulRun.id,
          conclusion: lastSuccessfulRun.conclusion,
          html_url: lastSuccessfulRun.html_url,
          run_started_at: lastSuccessfulRun.run_started_at,
          head_sha: lastSuccessfulRun.head_sha,
        }
      : null,
    nextRun,
    openHoldPrs,
    totalQueue: queue.length,
    totalPublished: pubEntries,
    embeddingsCacheAge,
  };
}
