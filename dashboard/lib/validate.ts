import { BUCKETS, PAGE_KEYS, SERVICE_KEYS } from '@/lib/constants';
import type { Topic, TopicBucket } from '@/types/topic';

function isBucket(x: string): x is TopicBucket {
  return (BUCKETS as string[]).includes(x);
}

export function validateTopic(t: Topic): string[] {
  const errs: string[] = [];
  if (!t.slug?.trim()) errs.push('slug required');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t.slug)) errs.push('slug must be kebab-case');
  if (!t.title?.trim()) errs.push('title required');
  if (!t.target_keyword?.trim()) errs.push('target_keyword required');
  if (!t.intent?.trim()) errs.push('intent required');
  if (!t.bucket || !isBucket(t.bucket)) errs.push('invalid bucket');
  for (const link of t.internal_links ?? []) {
    const keys = Object.keys(link).filter((k) => link[k as keyof typeof link] != null);
    if (keys.length !== 1) {
      errs.push('each internal_link must have exactly one of service or page');
      continue;
    }
    if (link.service != null && !(SERVICE_KEYS as readonly string[]).includes(link.service)) {
      errs.push(`unknown service: ${link.service}`);
    }
    if (link.page != null && !(PAGE_KEYS as readonly string[]).includes(link.page)) {
      errs.push(`unknown page: ${link.page}`);
    }
  }
  return errs;
}

export function validateQueueUnique(topics: Topic[]): string[] {
  const seen = new Set<string>();
  const errs: string[] = [];
  for (const t of topics) {
    if (seen.has(t.slug)) errs.push(`duplicate slug: ${t.slug}`);
    seen.add(t.slug);
  }
  return errs;
}

export function validateAgainstPublished(topics: Topic[], publishedSlugs: string[]): string[] {
  const pub = new Set(publishedSlugs);
  const errs: string[] = [];
  for (const t of topics) {
    if (pub.has(t.slug)) errs.push(`slug already published: ${t.slug}`);
  }
  return errs;
}

/** Word-set Jaccard on title + target_keyword (mirrors embed dedupe at queue-build time). */
function topicSignatureWords(title: string, targetKeyword: string): Set<string> {
  const text = `${title} ${targetKeyword}`.toLowerCase().replace(/[^\w\s]/g, ' ');
  return new Set(text.split(/\s+/).filter(Boolean));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Reject topics too similar to others in the queue (threshold aligned with pipeline embed check). */
export function validateTopicNearDuplicate(
  topic: Topic,
  queue: Topic[],
  excludeSlug?: string,
): string[] {
  const sig = topicSignatureWords(topic.title, topic.target_keyword);
  const errs: string[] = [];
  for (const other of queue) {
    if (other.slug === excludeSlug || other.slug === topic.slug) continue;
    const sim = jaccardSimilarity(sig, topicSignatureWords(other.title, other.target_keyword));
    if (sim > 0.8) {
      errs.push(`near-duplicate of "${other.slug}" (word overlap ${(sim * 100).toFixed(0)}%)`);
    }
  }
  return errs;
}

export function validateQueueDedupe(queue: Topic[]): string[] {
  const errs: string[] = [];
  for (const t of queue) {
    errs.push(...validateTopicNearDuplicate(t, queue, t.slug));
  }
  return errs;
}
