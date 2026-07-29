import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { sessionOptions } from '@/lib/session';
import type { SessionData } from '@/lib/session';
import { constantTimeEqualPassword, delay } from '@/lib/password';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const password = typeof body.password === 'string' ? body.password : '';
  const expected = process.env.DASHBOARD_PASSWORD ?? '';

  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

  if (!expected) {
    await delay(700);
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const ok = constantTimeEqualPassword(password, expected);
  if (!ok) {
    await delay(700);
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  session.ok = true;
  session.ts = Date.now();
  await session.save();

  return NextResponse.json({ ok: true });
}
