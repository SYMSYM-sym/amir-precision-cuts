import { NextResponse } from 'next/server';
import yaml from 'js-yaml';
import { getFile, putFile } from '@/lib/github';
import { FORBIDDEN_PATH } from '@/lib/constants';

type ForbiddenDoc = { phrases: string[]; words: string[] };

export async function GET() {
  try {
    const { content, sha } = await getFile(FORBIDDEN_PATH);
    const doc = yaml.load(content) as ForbiddenDoc;
    return NextResponse.json({
      phrases: doc?.phrases ?? [],
      words: doc?.words ?? [],
      sha,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const sha = typeof body.sha === 'string' ? body.sha : '';
    const phrases = Array.isArray(body.phrases) ? body.phrases.map(String) : [];
    const words = Array.isArray(body.words) ? body.words.map(String) : [];
    if (!sha) return NextResponse.json({ error: 'sha required' }, { status: 400 });
    const latest = await getFile(FORBIDDEN_PATH);
    if (latest.sha !== sha) {
      return NextResponse.json({ error: 'Conflict', sha: latest.sha }, { status: 409 });
    }
    const out = yaml.dump({ phrases, words }, { lineWidth: 100, noRefs: true });
    await putFile(FORBIDDEN_PATH, out, 'dashboard: update forbidden phrases', sha);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Save failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
