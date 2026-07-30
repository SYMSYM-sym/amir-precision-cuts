#!/usr/bin/env node
/**
 * requeue.mjs — the missing return path out of quarantine.
 *
 * WHY THIS EXISTS
 *
 * `quarantineTopic()` is a one-way door. When a generation fails its gates the
 * topic moves queue → needs-review, and 02-DERIVE-BRAIN.md says a human reviews
 * needs-review.yaml. It does not say what the human does next, because there was
 * nothing to do it with: no script, no npm target, no documented procedure. The
 * only route back was hand-editing two generated YAML files, which R9 forbids —
 * and which silently breaks the ledger invariant when it goes wrong (a topic in
 * both queue and needs-review, or in neither).
 *
 * The practical consequence is worse than an inconvenience. A topic quarantined
 * for something trivial and fixable — 848 words against an 850 floor, one
 * forbidden phrase in an FAQ heading — was permanently dead. The queue bled a
 * topic every time the model came up two words short, and the only way to get
 * the runway back was to reseed, which cannot be done once there is publish
 * history (bug A8). Quarantine has to be reversible or it is just deletion with
 * a nicer name.
 *
 * WHAT IT DOES NOT DO
 *
 * It does not clear the reason and it does not touch the article. The topic goes
 * back to the END of the queue, carrying `requeued_at` and the reason it failed,
 * so the next attempt is visible as a retry rather than disguised as a first
 * run. It also refuses to requeue a slug that is already published — that would
 * put the same topic in two ledgers, which is precisely the invariant
 * assert-invariants.mjs exists to protect.
 *
 * USAGE
 *   npm run requeue -- <slug> [<slug>...]   move named topics back to the queue
 *   npm run requeue -- --all                move every quarantined topic back
 *   npm run requeue -- --list               show what is quarantined and why
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import yaml from 'js-yaml';

import { ROOT, cfg, ConfigError } from './paths.mjs';
import { QUEUE_HEADER, YAML_OPTS } from './constants.mjs';
import { loadQueue, loadPublished, loadNeedsReview, localDateString } from './pick-topic.mjs';
import { checkInvariants } from './assert-invariants.mjs';

const QUEUE_PATH = join(ROOT, 'content/topics/queue.yaml');
const NEEDS_REVIEW_PATH = join(ROOT, 'content/topics/needs-review.yaml');

function atomicWriteFile(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, path);
}

/**
 * The quarantine entry carries the whole topic plus `reason` / `quarantined_at`.
 * A topic going back into the queue must NOT carry those two keys, or the queue
 * schema drifts and the next `validateTopics` run has fields it does not know.
 */
function toQueueTopic(entry) {
  const { reason, quarantined_at: at, ...topic } = entry;
  return { ...topic, requeued_at: localDateString(), previous_failure: reason || '(no reason recorded)' };
}

export function requeue(slugs, { all = false } = {}) {
  const nr = loadNeedsReview();
  const entries = nr.entries || [];
  if (!entries.length) throw new ConfigError('needs-review.yaml is empty — nothing to requeue.');

  const queue = existsSync(QUEUE_PATH) ? loadQueue() : [];
  const published = new Set((loadPublished().entries || []).map((e) => e.slug));
  const inQueue = new Set(queue.map((t) => t.slug));

  const wanted = all ? entries.map((e) => e.slug) : slugs;
  const unknown = wanted.filter((s) => !entries.some((e) => e.slug === s));
  if (unknown.length) {
    throw new ConfigError(
      `Not in needs-review.yaml: ${unknown.join(', ')}\n`
      + `Quarantined slugs are: ${entries.map((e) => e.slug).join(', ') || '(none)'}`,
    );
  }

  const moved = [];
  const refused = [];
  const keep = [];
  for (const e of entries) {
    if (!wanted.includes(e.slug)) { keep.push(e); continue; }
    if (published.has(e.slug)) {
      refused.push(`${e.slug} — already in published.yaml; requeueing would put it in two ledgers`);
      keep.push(e);
      continue;
    }
    if (inQueue.has(e.slug)) {
      refused.push(`${e.slug} — already in queue.yaml; the ledgers are already inconsistent, run npm run invariants`);
      keep.push(e);
      continue;
    }
    queue.push(toQueueTopic(e));
    moved.push(e.slug);
  }

  if (moved.length) {
    // Verify BEFORE writing. A requeue that breaks the invariant must not reach
    // disk — the whole point of the ledger check is that it runs on a state
    // someone can still walk back from.
    const problems = checkInvariants({
      queue,
      published: loadPublished().entries || [],
      needsReview: keep,
    });
    if (problems.length) {
      throw new ConfigError(`Refusing to write — the result would violate the ledger invariant:\n  • ${problems.join('\n  • ')}`);
    }
    atomicWriteFile(QUEUE_PATH, QUEUE_HEADER + yaml.dump(queue, YAML_OPTS));
    atomicWriteFile(NEEDS_REVIEW_PATH, yaml.dump({ entries: keep }, YAML_OPTS));
  }

  return { moved, refused, queueLength: queue.length, remaining: keep.length };
}

function list() {
  const entries = loadNeedsReview().entries || [];
  if (!entries.length) { console.log('needs-review.yaml is empty.'); return; }
  console.log(`${entries.length} quarantined topic(s) for ${cfg.business.name}:\n`);
  for (const e of entries) {
    console.log(`  ${e.slug}  (${e.quarantined_at || 'date unknown'})`);
    console.log(`    ${String(e.reason || '(no reason recorded)').replace(/\s+/g, ' ')}\n`);
  }
  console.log('npm run requeue -- <slug>     to put one back at the end of the queue');
  console.log('npm run requeue -- --all      to put all of them back');
}

function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  if (!args.length || args.includes('--list')) { list(); return; }
  const all = args.includes('--all');
  const slugs = args.filter((a) => !a.startsWith('--'));
  if (!all && !slugs.length) { list(); return; }

  const r = requeue(slugs, { all });
  for (const s of r.moved) console.log(`REQUEUED ${s}`);
  for (const x of r.refused) console.error(`REFUSED  ${x}`);
  console.log(`\nqueue: ${r.queueLength} · needs-review: ${r.remaining}`);
  if (!r.moved.length) process.exit(1);
}

if (process.argv[1] && process.argv[1].endsWith('requeue.mjs')) main();
