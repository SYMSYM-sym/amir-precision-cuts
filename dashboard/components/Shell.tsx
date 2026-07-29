'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';

export function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

      if (e.key === '?' && !e.shiftKey) {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }
      if (e.key === 'g') {
        (window as unknown as { __gk?: string }).__gk = 'g';
        return;
      }
      const pre = (window as unknown as { __gk?: string }).__gk;
      if (pre === 'g') {
        if (e.key === 'q') router.push('/queue');
        if (e.key === 'p') router.push('/prs');
        if (e.key === 'd') router.push('/');
        (window as unknown as { __gk?: string }).__gk = '';
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [router]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar mobileOpen={mobileOpen} onNavigate={() => setMobileOpen(false)} />
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center gap-4 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur lg:hidden">
          <button
            type="button"
            className="rounded-brand border border-line-strong px-3 py-2 text-sm text-ink"
            onClick={() => setMobileOpen(true)}
          >
            Menu
          </button>
          <span className="font-serif text-accent">IFM</span>
        </header>
        <main className="flex-1 px-4 py-6 lg:px-10">{children}</main>
        <footer className="border-t border-line px-4 py-4 text-center text-xs text-ink-mute">
          <button type="button" className="text-accent hover:underline" onClick={() => void logout()}>
            Logout
          </button>
          <span className="mx-2">·</span>
          IFM Dashboard · v1.0.0
        </footer>
      </div>

      {shortcutsOpen ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-4">
          <div className="max-w-md rounded-brand border border-line bg-bg-2 p-6 font-serif text-ink">
            <h2 className="text-lg text-accent">Shortcuts</h2>
            <ul className="mt-4 space-y-2 text-sm text-ink-dim">
              <li>
                <kbd className="rounded bg-bg-3 px-1">g</kbd> then <kbd className="rounded bg-bg-3 px-1">q</kbd>{' '}
                queue
              </li>
              <li>
                <kbd className="rounded bg-bg-3 px-1">g</kbd> then <kbd className="rounded bg-bg-3 px-1">p</kbd>{' '}
                PRs
              </li>
              <li>
                <kbd className="rounded bg-bg-3 px-1">g</kbd> then <kbd className="rounded bg-bg-3 px-1">d</kbd>{' '}
                dashboard
              </li>
              <li>
                <kbd className="rounded bg-bg-3 px-1">?</kbd> toggle this panel
              </li>
            </ul>
            <button
              type="button"
              className="mt-6 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg"
              onClick={() => setShortcutsOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
