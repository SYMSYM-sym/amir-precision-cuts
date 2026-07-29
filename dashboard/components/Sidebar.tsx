'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/queue', label: 'Topic queue' },
  { href: '/articles', label: 'Published' },
  { href: '/prs', label: 'Pull requests' },
  { href: '/workflows', label: 'Workflows' },
  { href: '/brand', label: 'Brand' },
];

export function Sidebar({ mobileOpen, onNavigate }: { mobileOpen: boolean; onNavigate?: () => void }) {
  const path = usePathname();

  const nav = (
    <nav className="flex flex-col gap-1 p-4">
      <div className="mb-6 px-2 font-serif text-lg tracking-wide text-accent">IFM Dashboard</div>
      {links.map((l) => {
        const active = path === l.href || (l.href !== '/' && path.startsWith(l.href));
        return (
          <Link
            key={l.href}
            href={l.href}
            onClick={onNavigate}
            className={`rounded-brand px-3 py-2 text-sm font-medium transition-colors ${
              active ? 'bg-bg-3 text-accent' : 'text-ink-dim hover:bg-bg-3 hover:text-ink'
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      <aside className="hidden w-60 shrink-0 border-r border-line bg-bg-2 lg:block">{nav}</aside>
      <aside
        className={`fixed inset-y-0 left-0 z-[80] w-64 border-r border-line bg-bg-2 shadow-xl transition-transform lg:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {nav}
      </aside>
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-[70] bg-black/50 lg:hidden"
          aria-label="Close menu"
          onClick={onNavigate}
        />
      ) : null}
    </>
  );
}
