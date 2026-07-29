import { NextResponse } from 'next/server';
import { listOpenAutoArticlePRs } from '@/lib/github';

export async function GET() {
  try {
    const prs = await listOpenAutoArticlePRs();
    return NextResponse.json({ prs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to list PRs';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
