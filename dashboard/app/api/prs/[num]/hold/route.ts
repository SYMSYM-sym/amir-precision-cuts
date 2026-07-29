import { NextResponse } from 'next/server';
import { setLabel } from '@/lib/github';

type Ctx = { params: Promise<{ num: string }> };

export async function POST(_: Request, ctx: Ctx) {
  const { num } = await ctx.params;
  await setLabel(Number(num), 'hold', true);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, ctx: Ctx) {
  const { num } = await ctx.params;
  await setLabel(Number(num), 'hold', false);
  return NextResponse.json({ ok: true });
}
