'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, LogOut, Menu, Search, X } from 'lucide-react';
import { signOut, useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Avatar } from '@/components/ui/avatar';
import { NAV_SECTIONS } from '@/config/nav';
import { cn } from '@/lib/utils';

export function Topbar() {
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname();
  const { data: unread } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api.get('/notifications/unread-count').then((r) => r.data),
    refetchInterval: 60_000,
  });

  const name = session?.user?.name ?? 'User';
  const role = session?.user?.roles?.[0] ?? 'Member';

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            className="rounded-lg border border-line bg-white p-2 text-ink-muted lg:hidden"
            onClick={() => setMobileNavOpen((open) => !open)}
            aria-label="Toggle navigation"
          >
            {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>

          <div className="hidden min-w-0 lg:block">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              {session?.user?.tenant?.name ?? 'Demo Corp India'}
            </p>
            <p className="truncate text-sm font-medium text-ink">People operations command center</p>
          </div>

          <div className="relative hidden w-[min(38vw,420px)] md:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              placeholder="Search employees, tax rules, templates, workflows"
              className="h-10 w-full rounded-lg border border-line bg-canvas pl-9 pr-12 text-sm placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-primary-300"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-line bg-white px-1.5 text-[10px] text-ink-faint">
              ⌘K
            </kbd>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="relative rounded-lg border border-line bg-white p-2 text-ink-muted hover:bg-canvas" aria-label="Notifications">
            <Bell className="h-5 w-5" />
            {(unread?.count ?? 0) > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
                {unread.count}
              </span>
            )}
          </button>

          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2.5 rounded-lg border border-line bg-white p-1.5 pr-3 hover:bg-canvas"
            >
              <Avatar name={name} size="sm" />
              <span className="hidden text-left sm:block">
                <span className="block text-[13px] font-semibold leading-tight">{name}</span>
                <span className="block text-[11px] leading-tight text-ink-muted">{role}</span>
              </span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-line bg-white p-1 shadow-lg">
                <p className="px-3 py-2 text-xs text-ink-muted">{session?.user?.email}</p>
                <button
                  onClick={() => signOut({ callbackUrl: '/login' })}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-danger hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {mobileNavOpen && (
        <nav className="border-t border-line bg-white px-4 py-3 lg:hidden">
          <div className="grid gap-2 sm:grid-cols-2">
            {NAV_SECTIONS.flatMap((section) => section.items).map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileNavOpen(false)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium',
                    active ? 'bg-ink text-white' : 'bg-canvas text-ink-muted',
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </header>
  );
}
