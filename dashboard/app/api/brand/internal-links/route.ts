import { NextResponse } from 'next/server';
import yaml from 'js-yaml';
import { getFile, putFile } from '@/lib/github';
import { INTERNAL_LINKS_PATH } from '@/lib/constants';

export async function GET() {
  try {
    const { content, sha } = await getFile(INTERNAL_LINKS_PATH);
    const doc = yaml.load(content) as Record<string, unknown>;
    return NextResponse.json({ doc, sha });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const sha = typeof body.sha === 'string' ? body.sha : '';
    const doc = body.doc as Record<string, unknown>;
    if (!sha || !doc || typeof doc !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    const latest = await getFile(INTERNAL_LINKS_PATH);
    if (latest.sha !== sha) {
      return NextResponse.json({ error: 'Conflict', sha: latest.sha }, { status: 409 });
    }
    const out = yaml.dump(doc, { lineWidth: 120, noRefs: true });
    await putFile(INTERNAL_LINKS_PATH, out, 'dashboard: update internal links map', sha);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Save failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
