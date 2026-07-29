import { NextResponse } from 'next/server';
import { getFile, putFile } from '@/lib/github';
import { QUEUE_PATH, PUBLISHED_PATH } from '@/lib/constants';
import { stringifyQueue, parsePublishedSlugs } from '@/lib/yaml';
import type { Topic } from '@/types/topic';
import {
  validateAgainstPublished,
  validateQueueDedupe,
  validateQueueUnique,
  validateTopic,
} from '@/lib/validate';
import { fetchQueueBundle } from '@/lib/data';

export async function GET() {
  try {
    const { queue, publishedSlugs, sha } = await fetchQueueBundle();
    return NextResponse.json({ queue, publishedSlugs, sha });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load queue';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const queue = body.queue as Topic[];
    const sha = body.sha as string;
    const message =
      (typeof body.message === 'string' && body.message) || 'dashboard: replace queue.yaml';

    if (!Array.isArray(queue) || typeof sha !== 'string') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }

    const errs: string[] = [];
    for (const t of queue) errs.push(...validateTopic(t));
    errs.push(...validateQueueUnique(queue));
    const { content: pubRaw } = await getFile(PUBLISHED_PATH).catch(() => ({
      content: 'entries: []\n',
    }));
    const publishedSlugs = parsePublishedSlugs(pubRaw);
    errs.push(...validateAgainstPublished(queue, publishedSlugs));
    errs.push(...validateQueueDedupe(queue));

    if (errs.length) {
      return NextResponse.json({ error: 'Validation failed', details: errs }, { status: 400 });
    }

    const latest = await getFile(QUEUE_PATH);
    if (latest.sha !== sha) {
      return NextResponse.json({ error: 'Conflict: refresh and retry', sha: latest.sha }, { status: 409 });
    }

    const yamlOut = stringifyQueue(queue);
    await putFile(QUEUE_PATH, yamlOut, message, sha);

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Save failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
