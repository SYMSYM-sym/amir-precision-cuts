import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { sessionOptions } from '@/lib/session';
import type { SessionData } from '@/lib/session';

export async function POST() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  session.destroy();
  await session.save();
  return NextResponse.json({ ok: true });
}

