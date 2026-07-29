import { NextResponse } from 'next/server';
import { dispatchWorkflow, getFile } from '@/lib/github';
import { QUEUE_PATH } from '@/lib/constants';
import { parseQueueYaml } from '@/lib/yaml';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const slug = typeof body.slug === 'string' ? body.slug.trim() : '';

    if (slug) {
      const q = await getFile(QUEUE_PATH);
      const queue = parseQueueYaml(q.content);
      const ok = queue.some((t) => t.slug === slug);
      if (!ok) {
        return NextResponse.json({ error: 'Slug not in queue' }, { status: 400 });
      }
    }

    const inputs: Record<string, string> = {};
    if (slug) inputs.slug = slug;

    await dispatchWorkflow('publish-article.yml', inputs);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Dispatch failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
