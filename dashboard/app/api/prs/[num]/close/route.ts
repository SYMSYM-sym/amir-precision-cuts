import { NextResponse } from 'next/server';
import { closePRAndDeleteBranch } from '@/lib/github';

type Ctx = { params: Promise<{ num: string }> };

export async function POST(_: Request, ctx: Ctx) {
  const { num } = await ctx.params;
  try {
    await closePRAndDeleteBranch(Number(num));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Close failed';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
