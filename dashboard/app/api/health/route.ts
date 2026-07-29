import { NextResponse } from 'next/server';
import { getHealthSnapshot } from '@/lib/health-data';

export async function GET() {
  try {
    const snapshot = await getHealthSnapshot();
    return NextResponse.json(snapshot);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'health failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
