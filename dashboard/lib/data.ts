import { getFile } from '@/lib/github';
import { QUEUE_PATH, PUBLISHED_PATH } from '@/lib/constants';
import { parseQueueYaml, parsePublishedSlugs } from '@/lib/yaml';

export async function fetchQueueBundle() {
  const q = await getFile(QUEUE_PATH);
  let publishedRaw = '';
  try {
    publishedRaw = (await getFile(PUBLISHED_PATH)).content;
  } catch {
    publishedRaw = 'entries: []\n';
  }
  const queue = parseQueueYaml(q.content);
  const publishedSlugs = parsePublishedSlugs(publishedRaw);
  return { queue, publishedSlugs, sha: q.sha };
}
