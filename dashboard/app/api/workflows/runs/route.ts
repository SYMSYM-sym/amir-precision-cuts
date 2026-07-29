import { NextResponse } from 'next/server';
import { listWorkflowRuns } from '@/lib/github';

export async function GET() {
  try {
    const runs = await listWorkflowRuns('publish-article.yml');
    return NextResponse.json({ runs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load runs';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
