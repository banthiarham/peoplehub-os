'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { NAV_SECTIONS } from '@/config/nav';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { ChevronRight, CircleDot, PanelLeftClose, PanelLeftOpen, Sparkles } from 'lucide-react';

export function Sidebar({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const pathname = usePathname();
  const [hovered, setHovered] = useState(false);
  const compact = collapsed && !hovered;
  const tenantName = 'Demo Corp India';
  const userName = 'Super Admin';
  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setHovered(false);
        }
      }}
      className={cn(
        'fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-slate-950 text-white shadow-[8px_0_40px_-24px_rgba(15,23,42,0.85)] transition-[width] duration-200 ease-out lg:flex',
        compact ? 'w-20' : 'w-60',
      )}
    >
      <div className={cn('flex items-center border-b border-white/10 py-4', compact ? 'justify-center px-3' : 'gap-3 px-4')}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 via-primary-600 to-slate-900 text-sm font-bold text-white shadow-lg shadow-primary-950/25">
          PH
        </div>
        <span className={cn('min-w-0', compact && 'sr-only')}>
          <span className="block text-[15px] font-semibold tracking-tight">PeopleHub OS</span>
          <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
            AI-first people stack
          </span>
        </span>
      </div>
      <div className="border-b border-white/10 px-3 py-4">
        <div className={cn('rounded-2xl border border-white/10 bg-white/5 p-3', compact && 'flex justify-center p-2.5')}>
          <div className={cn('flex items-center gap-3', compact && 'justify-center')}>
            <Avatar name={userName} size="md" className="ring-2 ring-white/10" />
            <div className={cn('min-w-0', compact && 'sr-only')}>
              <p className="truncate text-sm font-semibold">{userName}</p>
              <p className="truncate text-xs text-slate-400">{tenantName}</p>
            </div>
            <ChevronRight className={cn('ml-auto h-4 w-4 text-slate-500', compact && 'hidden')} />
          </div>
          <div className={cn('mt-3 flex items-center gap-2 text-xs text-slate-300', compact && 'sr-only')}>
            <CircleDot className="h-3.5 w-3.5 text-primary-300" />
            <span>Command center ready</span>
          </div>
        </div>
      </div>
      <nav className={cn('scrollbar-thin flex-1 overflow-y-auto py-4', compact ? 'space-y-4 px-2' : 'space-y-5 px-3')}>
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className={cn('mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500', compact && 'sr-only')}>
              {section.title}
            </p>
            <div className={cn('space-y-1', compact && 'space-y-2')}>
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={compact ? item.label : undefined}
                    aria-label={compact ? item.label : undefined}
                    className={cn(
                      'group flex items-center rounded-2xl text-[13px] font-medium transition-all',
                      compact ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-[10px]',
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
                    <span className={cn('min-w-0 flex-1', compact && 'sr-only')}>{item.label}</span>
                    <span className={cn('flex h-4 w-4 items-center justify-center', compact && 'hidden')}>
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
      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className={cn(
            'flex w-full items-center rounded-2xl border border-white/10 bg-white/5 text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white',
            compact ? 'justify-center p-3' : 'justify-between px-3 py-2.5',
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          <span className={cn(compact && 'sr-only')}>{collapsed ? 'Expand' : 'Collapse'}</span>
        </button>
      </div>
    </aside>
  );
}
