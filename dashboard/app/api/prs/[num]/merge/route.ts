import { NextResponse } from 'next/server';
import { mergePR } from '@/lib/github';

type Ctx = { params: Promise<{ num: string }> };

export async function POST(_: Request, ctx: Ctx) {
  const { num } = await ctx.params;
  try {
    await mergePR(Number(num));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Merge failed';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
