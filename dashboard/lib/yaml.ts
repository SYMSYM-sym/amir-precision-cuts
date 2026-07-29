import yaml from 'js-yaml';
import type { Topic } from '@/types/topic';
import { QUEUE_YAML_HEADER } from '@/lib/constants';

export function parseQueueYaml(raw: string): Topic[] {
  const doc = yaml.load(raw);
  if (Array.isArray(doc)) return doc as Topic[];
  if (doc && typeof doc === 'object' && Array.isArray((doc as { topics?: Topic[] }).topics)) {
    return (doc as { topics: Topic[] }).topics;
  }
  throw new Error('queue.yaml must be a YAML array of topics');
}

export function stringifyQueue(topics: Topic[]): string {
  return QUEUE_YAML_HEADER + yaml.dump(topics, { lineWidth: 100, noRefs: true, quotingType: '"' });
}

export function parsePublishedSlugs(raw: string): string[] {
  const doc = yaml.load(raw) as { entries?: Array<{ slug?: string }> } | null;
  if (!doc?.entries) return [];
  return doc.entries.map((e) => e.slug).filter((s): s is string => Boolean(s));
}
