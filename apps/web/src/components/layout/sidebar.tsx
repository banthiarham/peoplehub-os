'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_SECTIONS } from '@/config/nav';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { ChevronRight, CircleDot, Sparkles } from 'lucide-react';

export function Sidebar() {
  const pathname = usePathname();
  const tenantName = 'Demo Corp India';
  const userName = 'Super Admin';
  const userRole = 'Super Admin';
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-line bg-slate-950 text-white shadow-[8px_0_40px_-24px_rgba(15,23,42,0.85)] lg:flex">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 via-primary-600 to-slate-900 text-sm font-bold text-white shadow-lg shadow-primary-950/25">
          PH
        </div>
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold tracking-tight">PeopleHub OS</span>
          <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
            AI-first people stack
          </span>
        </span>
      </div>
      <div className="border-b border-white/10 px-4 py-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-3">
            <Avatar name={userName} size="md" className="ring-2 ring-white/10" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{userName}</p>
              <p className="truncate text-xs text-slate-400">{tenantName}</p>
            </div>
            <ChevronRight className="ml-auto h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-300">
            <CircleDot className="h-3.5 w-3.5 text-primary-300" />
            <span>Command center ready</span>
          </div>
        </div>
      </div>
      <nav className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              {section.title}
            </p>
            <div className="space-y-1">
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'group flex items-center gap-3 rounded-2xl px-3 py-[11px] text-[13px] font-medium transition-all',
                      active
                        ? 'bg-white text-slate-950 shadow-lg shadow-black/10'
                        : 'text-slate-300 hover:bg-white/5 hover:text-white',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors',
                        active ? 'bg-primary-50 text-primary-700' : 'bg-white/5 text-slate-400 group-hover:text-white',
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">{item.label}</span>
                    <span className="flex h-4 w-4 items-center justify-center">
                      <Sparkles
                        className={cn(
                          'h-3.5 w-3.5 transition-opacity',
                          active ? 'opacity-100 text-primary-600' : 'opacity-0',
                        )}
                      />
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-4">
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">Enterprise v1</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            HR, payroll, hiring, and workflow ops in one system.
            <span className="sr-only">{userRole}</span>
          </p>
        </div>
      </div>
    </aside>
  );
}
