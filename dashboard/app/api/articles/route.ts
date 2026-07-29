import { NextResponse } from 'next/server';
import { listPublishedArticleSummaries } from '@/lib/articles';

export async function GET() {
  try {
    const articles = await listPublishedArticleSummaries();
    return NextResponse.json({ articles });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to list articles';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
