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
}

if (process.argv[1] && process.argv[1].endsWith('assert-invariants.mjs')) main();
