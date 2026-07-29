'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState } from 'react';

export function LoginInner() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get('next') || '/';

  const [password, setPassword] = useState('');
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (!res.ok) {
      setShake(true);
      setPassword('');
      setTimeout(() => setShake(false), 500);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4">
      <div
        className={`w-full max-w-sm rounded-brand border border-line bg-bg-2 p-8 shadow-xl ${shake ? 'animate-shake' : ''}`}
      >
        <h1 className="text-center font-serif text-2xl text-accent">IFM Dashboard</h1>
        <p className="mt-2 text-center text-xs text-ink-mute">Internal use only</p>
        <form onSubmit={(e) => void submit(e)} className="mt-8 space-y-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              className="mt-2 w-full rounded-brand border border-line-strong bg-bg-3 px-3 py-3 text-ink"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-accent py-3 text-sm font-semibold uppercase tracking-wide text-bg disabled:opacity-50"
          >
            {loading ? 'Checking…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
