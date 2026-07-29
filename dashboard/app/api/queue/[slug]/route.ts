import { NextResponse } from 'next/server';
import { putFile } from '@/lib/github';
import { QUEUE_PATH } from '@/lib/constants';
import { stringifyQueue } from '@/lib/yaml';
import type { Topic } from '@/types/topic';
import {
  validateAgainstPublished,
  validateQueueUnique,
  validateTopic,
  validateTopicNearDuplicate,
} from '@/lib/validate';
import { fetchQueueBundle } from '@/lib/data';

type Ctx = { params: Promise<{ slug: string }> };

async function loadQueuePair() {
  return fetchQueueBundle();
}

export async function GET(_: Request, ctx: Ctx) {
  const { slug } = await ctx.params;
  try {
    const { queue, sha } = await loadQueuePair();
    const topic = queue.find((t) => t.slug === slug);
    if (!topic) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ topic, queueSha: sha });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  const { slug } = await ctx.params;
  try {
    const body = await req.json();
    const topic = body.topic as Topic;
    const sha = body.sha as string;
    if (!topic || typeof sha !== 'string' || topic.slug !== slug) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    const errs = validateTopic(topic);
    if (errs.length) return NextResponse.json({ error: errs }, { status: 400 });

    const { queue, publishedSlugs, sha: latestSha } = await loadQueuePair();
    if (latestSha !== sha) {
      return NextResponse.json({ error: 'Conflict', sha: latestSha }, { status: 409 });
    }

    const idx = queue.findIndex((t) => t.slug === slug);
    if (idx === -1) return NextResponse.json({ error: 'Topic not in queue' }, { status: 404 });

    const next = [...queue];
    next[idx] = topic;
    const uErrs = [
      ...validateQueueUnique(next),
      ...validateAgainstPublished(next, publishedSlugs),
      ...validateTopicNearDuplicate(topic, next, slug),
    ];
    if (uErrs.length) return NextResponse.json({ error: uErrs }, { status: 400 });

    await putFile(QUEUE_PATH, stringifyQueue(next), `dashboard: update topic "${slug}"`, sha);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { slug } = await ctx.params;
  try {
    const { searchParams } = new URL(req.url);
    const sha = searchParams.get('sha');
    if (!sha) return NextResponse.json({ error: 'sha required' }, { status: 400 });

    const { queue, publishedSlugs, sha: latestSha } = await loadQueuePair();
    if (latestSha !== sha) {
      return NextResponse.json({ error: 'Conflict', sha: latestSha }, { status: 409 });
    }
    const next = queue.filter((t) => t.slug !== slug);
    if (next.length === queue.length) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const uErrs = [
      ...validateQueueUnique(next),
      ...validateAgainstPublished(next, publishedSlugs),
    ];
    if (uErrs.length) return NextResponse.json({ error: uErrs }, { status: 400 });

    await putFile(QUEUE_PATH, stringifyQueue(next), `dashboard: remove "${slug}"`, sha);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const { slug } = await ctx.params;
  try {
    const body = await req.json().catch(() => ({}));
    if (!body.promote) {
      return NextResponse.json({ error: 'promote: true required' }, { status: 400 });
    }
    const sha = body.sha as string;
    if (typeof sha !== 'string') return NextResponse.json({ error: 'sha required' }, { status: 400 });

    const { queue, publishedSlugs, sha: latestSha } = await loadQueuePair();
    if (latestSha !== sha) {
      return NextResponse.json({ error: 'Conflict', sha: latestSha }, { status: 409 });
    }
    const idx = queue.findIndex((t) => t.slug === slug);
    if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const topic = queue[idx];
    const rest = queue.filter((_, i) => i !== idx);
    const next = [topic, ...rest];
    const uErrs = [
      ...validateQueueUnique(next),
      ...validateAgainstPublished(next, publishedSlugs),
      ...validateTopicNearDuplicate(topic, next, slug),
    ];
    if (uErrs.length) return NextResponse.json({ error: uErrs }, { status: 400 });

    await putFile(
      QUEUE_PATH,
      stringifyQueue(next),
      `dashboard: promote "${slug}" to publish-next`,
      sha,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
