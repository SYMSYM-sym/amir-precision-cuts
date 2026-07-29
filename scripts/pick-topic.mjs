import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import yaml from 'js-yaml';

import { ROOT, cfg } from './paths.mjs';
import { QUEUE_HEADER, YAML_OPTS } from './constants.mjs';

const QUEUE_PATH = join(ROOT, 'content/topics/queue.yaml');
const PUBLISHED_PATH = join(ROOT, 'content/topics/published.yaml');
const NEEDS_REVIEW_PATH = join(ROOT, 'content/topics/needs-review.yaml');


function atomicWriteFile(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, path);
}

/** Write two files atomically (each via temp + rename). */
function atomicWritePair(pathA, contentA, pathB, contentB) {
  atomicWriteFile(pathA, contentA);
  atomicWriteFile(pathB, contentB);
}

export function loadNeedsReview() {
  if (!existsSync(NEEDS_REVIEW_PATH)) return { entries: [] };
  const doc = yaml.load(readFileSync(NEEDS_REVIEW_PATH, 'utf8'));
  return doc && typeof doc === 'object' ? doc : { entries: [] };
}

function stringifyQueueYaml(queue) {
  return QUEUE_HEADER + yaml.dump(queue, YAML_OPTS);
}

/**
 * Today's date as YYYY-MM-DD in the BUSINESS's timezone.
 *
 * Was named `laDateString()` with 'America/Los_Angeles' welded in — which quietly
 * meant the once-per-day guard (R7) fired on California's calendar for a shop
 * in Providence or Boise. Renamed per CONTRACTS.md and read from config.
 */
export function localDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: cfg.location.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function loadPublished() {
  if (!existsSync(PUBLISHED_PATH)) return { entries: [] };
  const doc = yaml.load(readFileSync(PUBLISHED_PATH, 'utf8'));
  return doc && typeof doc === 'object' ? doc : { entries: [] };
}

export function loadQueue() {
  const raw = readFileSync(QUEUE_PATH, 'utf8');
  const doc = yaml.load(raw);
  if (Array.isArray(doc)) return doc;
  if (doc && Array.isArray(doc.topics)) return doc.topics;
  throw new Error('queue.yaml must be a YAML array of topics');
}

export function alreadyPublishedToday(published = loadPublished()) {
  const today = localDateString();
  const entries = published.entries || [];
  return entries.some((e) => e.published_at === today);
}

/**
 * @returns {{ topic: object, index: number } | null}
 */
export function pickTopic({ forceSlug } = {}) {
  const queue = loadQueue();
  if (!queue.length) return null;

  if (forceSlug) {
    const idx = queue.findIndex((t) => t.slug === forceSlug);
    if (idx === -1) throw new Error(`Topic slug not in queue: ${forceSlug}`);
    return { topic: queue[idx], index: idx };
  }

  return { topic: queue[0], index: 0 };
}

/** Remove topic at index and persist queue (comments at top of file are dropped on rewrite). */
export function dequeueTopic(index) {
  const queue = loadQueue();
  if (index < 0 || index >= queue.length) throw new Error('Invalid dequeue index');
  const removed = queue.splice(index, 1)[0];
  atomicWriteFile(QUEUE_PATH, stringifyQueueYaml(queue));
  return removed;
}

/**
 * Remove topic from queue and append to needs-review.yaml (both written atomically).
 * @param {object} topic
 * @param {string} reason
 */
export function quarantineTopic(topic, reason) {
  const queue = loadQueue();
  const index = queue.findIndex((t) => t.slug === topic.slug);
  if (index === -1) throw new Error(`Topic not in queue: ${topic.slug}`);
  queue.splice(index, 1);

  const needsReview = loadNeedsReview();
  needsReview.entries = needsReview.entries || [];
  needsReview.entries.push({
    slug: topic.slug,
    title: topic.title,
    target_keyword: topic.target_keyword,
    reason,
    quarantined_at: localDateString(),
  });

  const reviewYaml = yaml.dump(needsReview, YAML_OPTS);
  atomicWritePair(QUEUE_PATH, stringifyQueueYaml(queue), NEEDS_REVIEW_PATH, reviewYaml);
  return topic;
}

/** Test helper: quarantine using explicit file paths. */
export function quarantineTopicInFiles({ queuePath, needsReviewPath, topic, reason, queueHeader = '' }) {
  const queue = yaml.load(readFileSync(queuePath, 'utf8'));
  const list = Array.isArray(queue) ? queue : queue.topics || [];
  const index = list.findIndex((t) => t.slug === topic.slug);
  if (index === -1) throw new Error(`Topic not in queue: ${topic.slug}`);
  list.splice(index, 1);

  let needsReview = { entries: [] };
  if (existsSync(needsReviewPath)) {
    needsReview = yaml.load(readFileSync(needsReviewPath, 'utf8')) || { entries: [] };
  }
  needsReview.entries = needsReview.entries || [];
  needsReview.entries.push({
    slug: topic.slug,
    reason,
    quarantined_at: localDateString(),
  });

  atomicWritePair(
    queuePath,
    queueHeader + yaml.dump(list, YAML_OPTS),
    needsReviewPath,
    yaml.dump(needsReview, YAML_OPTS),
  );
}

/**
 * BUG A9 (fixed): this was a plain writeFileSync while dequeueTopic() and
 * quarantineTopic() were both atomic. A crash mid-write left published.yaml
 * truncated — and published.yaml is the ledger the once-per-day guard reads,
 * so a torn write means the guard stops working (R7).
 */
export function appendPublished(entry) {
  const published = loadPublished();
  published.entries = published.entries || [];
  published.entries.push(entry);
  atomicWriteFile(PUBLISHED_PATH, yaml.dump(published, YAML_OPTS));
}

export function archiveCompletedFrontmatter(slug, data) {
  const dir = join(ROOT, 'content/topics/completed');
  mkdirSync(dir, { recursive: true });
  atomicWriteFile(join(dir, `${slug}.yaml`), yaml.dump(data, YAML_OPTS));
}
