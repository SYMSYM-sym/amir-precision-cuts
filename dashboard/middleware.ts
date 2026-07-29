import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions } from '@/lib/session';
import type { SessionData } from '@/lib/session';

export async function middleware(request: NextRequest) {
  const url = request.nextUrl.pathname;
  if (url.startsWith('/login') || url.startsWith('/api/auth/') || url.startsWith('/api/cron/')) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(request, response, sessionOptions);
  if (!session.ok) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', url);
    return NextResponse.redirect(loginUrl);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/|favicon.ico|fonts/|.*\\.(?:svg|png|jpg|jpeg|webp|css|js)$).*)'],
};
