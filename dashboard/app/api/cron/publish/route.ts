import { NextResponse } from 'next/server';

/**
 * Vercel cron handler — triggers the publish-article workflow on the configured repo.
 * Schedule lives in /vercel.json. Runs Mon + Thu 9:00 AM Pacific.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` automatically.
 * We compare against the CRON_SECRET env var.
 */
import { GH_OWNER, GH_REPO } from '@/lib/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // 1. Auth check — only Vercel Cron should reach this route
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const got = req.headers.get('authorization');
  if (got !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 2. Fire workflow_dispatch on the publish-article workflow
  const owner = GH_OWNER;
  const repo = GH_REPO;
  const token = process.env.GH_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'GH_TOKEN not configured' }, { status: 500 });
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/publish-article.yml/dispatches`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: 'main' }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('GitHub workflow_dispatch failed:', res.status, text);
    return NextResponse.json(
      { error: 'workflow_dispatch failed', status: res.status, detail: text },
      { status: 502 },
    );
  }

  const triggeredAt = new Date().toISOString();
  console.log(`[cron] publish workflow dispatched at ${triggeredAt}`);
  return NextResponse.json({ ok: true, dispatchedAt: triggeredAt });
}
