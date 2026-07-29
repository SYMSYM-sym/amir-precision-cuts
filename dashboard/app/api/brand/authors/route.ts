import { NextResponse } from 'next/server';
import { getFile, putFile } from '@/lib/github';
import { AUTHORS_PATH } from '@/lib/constants';

export async function GET() {
  try {
    const { content, sha } = await getFile(AUTHORS_PATH);
    return NextResponse.json({ content, sha });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const content = typeof body.content === 'string' ? body.content : '';
    const sha = typeof body.sha === 'string' ? body.sha : '';
    if (!sha) return NextResponse.json({ error: 'sha required' }, { status: 400 });
    const latest = await getFile(AUTHORS_PATH);
    if (latest.sha !== sha) {
      return NextResponse.json({ error: 'Conflict', sha: latest.sha }, { status: 409 });
    }
    await putFile(AUTHORS_PATH, content, 'dashboard: update author profile', sha);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Save failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
