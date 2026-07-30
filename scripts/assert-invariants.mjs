#!/usr/bin/env node
/**
 * assert-invariants.mjs — 14 §B item 5: "specified, never written."
 *
 * INVARIANT 1: every topic is in EXACTLY ONE of queue / published / needs-review.
 *
 * R9's incident is what this catches: squash-merging a three-day-old PR reset
 * the ledgers to its snapshot and silently dropped two topics — orphaned, not
 * queued, not published, not live. Nothing noticed, because nothing checked.
 */
import { loadQueue, loadPublished, loadNeedsReview } from './pick-topic.mjs';
import { cfg } from './paths.mjs';

/**
 * Queue runway, in days.
 *
 * The dashboard computes this and shows a banner under 21 days — but the
 * dashboard is a page someone has to open. Nothing on the automated path ever
 * looked at the queue, so the failure mode was: the queue drains to zero, and
 * the first anyone hears about it is `publish-article` failing with "No topic
 * could be published this run" on a Tuesday morning. The health check runs
 * weekly and already opens an issue on failure; this is the cheapest place to
 * put the warning, and 15 days of runway is two weeks of notice.
 *
 * A low queue is a WARNING, not a failure: an empty queue is a content problem,
 * not a broken site, and turning the weekly health check red for it would train
 * whoever is on call to ignore a red health check.
 */
export function queueRunway(queueLength, c = cfg) {
  const perWeek = (c.content.cadence_days || []).length || 1;
  const perDay = perWeek / 7;
  return { days: Math.round(queueLength / perDay), perWeek };
}

export function checkInvariants({ queue, published, needsReview }) {
  const problems = [];
  const where = new Map();
  const add = (slug, ledger) => {
    if (!slug) return;
    if (!where.has(slug)) where.set(slug, []);
    where.get(slug).push(ledger);
  };
  for (const t of queue) add(t.slug, 'queue');
  for (const e of published) add(e.slug, 'published');
  for (const e of needsReview) add(e.slug, 'needs-review');

  for (const [slug, ledgers] of where) {
    if (ledgers.length > 1) {
      problems.push(`"${slug}" is in ${ledgers.length} ledgers at once: ${ledgers.join(', ')}`);
    }
  }
  const dupes = (list, name) => {
    const seen = new Set();
    for (const x of list) {
      if (!x.slug) continue;
      if (seen.has(x.slug)) problems.push(`"${x.slug}" appears twice in ${name}`);
      seen.add(x.slug);
    }
  };
  dupes(queue, 'queue'); dupes(published, 'published'); dupes(needsReview, 'needs-review');
  return problems;
}

function main() {
  let queue = [];
  try { queue = loadQueue(); } catch { /* no queue yet */ }
  const published = loadPublished().entries || [];
  const needsReview = loadNeedsReview().entries || [];
  const problems = checkInvariants({ queue, published, needsReview });

  console.log(`queue: ${queue.length} · published: ${published.length} · needs-review: ${needsReview.length}`);
  if (problems.length) {
    console.error(`\nLEDGER INVARIANT VIOLATED — ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  • ${p}`);
    console.error('\nDo NOT hand-fix generated files (R9). Close the offending PR and let the topic regenerate.');
    process.exit(1);
  }
  console.log('Ledger invariant holds: every topic is in exactly one ledger.');

  const { days, perWeek } = queueRunway(queue.length);
  console.log(`Queue runway: ~${days} day(s) at ${perWeek}/week.`);
  if (queue.length === 0) {
    console.warn(
      '\nWARNING: the queue is EMPTY. The next scheduled publish will fail.\n'
      + '  npm run derive -- --only=queue --append --count=25',
    );
  } else if (days < 15) {
    console.warn(
      `\nWARNING: queue runway is ~${days} day(s) — under the 15-day reseed threshold.\n`
      + '  npm run derive -- --only=queue --append --count=25\n'
      + '(--append never rewrites an existing entry; --force on a repo with publish '
      + 'history is refused outright.)',
    );
  }
  const nr = needsReview.length;
  if (nr) {
    console.warn(`\nWARNING: ${nr} topic(s) awaiting triage in needs-review.yaml — \`npm run requeue -- --list\`.`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('assert-invariants.mjs')) main();
