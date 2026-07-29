import type { SessionOptions } from 'iron-session';

export type SessionData = {
  ok?: boolean;
  ts?: number;
};

/**
 * BUG A3 (fixed): SESSION_SECRET fell back to a hardcoded literal
 * ('01234567890123456789012345678901-development-not-for-production'), which is
 * in the repo and therefore public. A production deploy that simply forgot the
 * env var had a GUESSABLE session secret — anyone who read the source could
 * forge an admin cookie. Nothing failed, nothing logged, the dashboard just
 * quietly had no authentication.
 *
 * It throws on boot in production now. A dashboard that will not start is a
 * problem you find in thirty seconds; one that starts insecure is a problem you
 * find when someone else does.
 */
function sessionPassword(): string {
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'SESSION_SECRET is not set. Refusing to start with a default — a known ' +
          'secret means anyone who has read this repo can forge an admin session. ' +
          'Generate one with:  openssl rand -base64 32',
      );
    }
    // Development only, and it announces itself.
    console.warn(
      '[session] SESSION_SECRET is unset — using an ephemeral development secret. ' +
        'This throws in production.',
    );
    return `dev-only-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`.padEnd(32, 'x');
  }

  if (secret.length < 32) {
    throw new Error(
      `SESSION_SECRET is ${secret.length} characters; iron-session requires at least 32. ` +
        'Generate one with:  openssl rand -base64 32',
    );
  }
  return secret;
}

export const sessionOptions: SessionOptions = {
  // Cookie name is derived from the repo, not the reference business.
  cookieName: `${(process.env.GH_REPO || 'site').replace(/[^a-z0-9]/gi, '_')}_admin`,
  password: sessionPassword(),
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  },
};
