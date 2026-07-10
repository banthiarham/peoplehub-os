'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, Menu, Search, X } from 'lucide-react';
import { signOut, useSession } from 'next-auth/react';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { NAV_SECTIONS } from '@/config/nav';
import { BRAND } from '@/config/brand';
import { useCommandPalette } from '@/components/command-palette';
import { NotificationsMenu } from '@/components/layout/notifications-menu';
import { cn } from '@/lib/utils';

export function Topbar() {
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname();
  const openPalette = useCommandPalette();
  const tenantName = session?.user?.tenant?.name ?? BRAND.name;
  const name = session?.user?.name || session?.user?.email || `${BRAND.name} user`;
  const role = session?.user?.roles?.[0] ?? 'Workspace user';
  const email = session?.user?.email ?? '';

  return (
    <header className="sticky top-0 z-20 border-b border-line/80 bg-white/85 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            className="rounded-xl border border-line bg-white p-2.5 text-ink-muted shadow-sm lg:hidden"
            onClick={() => setMobileNavOpen((open) => !open)}
            aria-label="Toggle navigation"
          >
            {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>

          <div className="hidden min-w-0 lg:block">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">{tenantName}</p>
            <p className="truncate text-sm font-semibold text-ink">People operations command center</p>
          </div>

          <button
            type="button"
            onClick={openPalette}
            className="relative hidden w-[min(42vw,520px)] md:block"
            aria-label="Open universal search"
          >
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <span className="flex h-11 w-full items-center rounded-2xl border border-line bg-white pl-9 pr-12 text-sm text-ink-faint shadow-sm transition-colors hover:border-primary-300">
              Search employees, candidates, tickets, jobs…
            </span>
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-line bg-canvas px-1.5 text-[10px] text-ink-faint">
              ⌘K
            </kbd>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <NotificationsMenu />

          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2.5 rounded-2xl border border-line bg-white p-1.5 pr-3 shadow-sm hover:border-primary-200 hover:bg-canvas"
            >
              <Avatar name={name} size="sm" />
              <span className="hidden text-left sm:block">
                <span className="block text-[13px] font-semibold leading-tight">{name}</span>
                <span className="block text-[11px] leading-tight text-ink-muted">{role}</span>
              </span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-line bg-white p-1 shadow-xl">
                <p className="truncate px-3 py-2 text-xs text-ink-muted">{email || tenantName}</p>
                <button
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-danger hover:bg-red-50"
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
                    'flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium',
                    active ? 'bg-slate-950 text-white' : 'bg-canvas text-ink-muted',
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
