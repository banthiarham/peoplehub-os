'use client';

import { Bell, LogOut, Search } from 'lucide-react';
import { signOut, useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Avatar } from '@/components/ui/avatar';

export function Topbar() {
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: unread } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api.get('/notifications/unread-count').then((r) => r.data),
    refetchInterval: 60_000,
  });

  const name = session?.user?.name ?? 'User';

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line bg-white/80 px-6 backdrop-blur">
      <div className="relative hidden w-80 md:block">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input
          placeholder="Search people, payslips, tickets…"
          className="h-9 w-full rounded-lg border border-line bg-canvas pl-9 pr-12 text-sm placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-primary-400"
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-line bg-white px-1.5 text-[10px] text-ink-faint">
          ⌘K
        </kbd>
      </div>
      <div className="flex items-center gap-3">
        <button className="relative rounded-lg p-2 text-ink-muted hover:bg-canvas" aria-label="Notifications">
          <Bell className="h-4.5 w-4.5 h-5 w-5" />
          {(unread?.count ?? 0) > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
              {unread.count}
            </span>
          )}
        </button>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2.5 rounded-lg p-1.5 hover:bg-canvas"
          >
            <Avatar name={name} size="sm" />
            <span className="hidden text-left sm:block">
              <span className="block text-[13px] font-medium leading-tight">{name}</span>
              <span className="block text-[11px] leading-tight text-ink-muted">
                {session?.user?.roles?.[0] ?? 'Member'}
              </span>
            </span>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-line bg-white p-1 shadow-lg">
              <p className="px-3 py-2 text-xs text-ink-muted">{session?.user?.email}</p>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
