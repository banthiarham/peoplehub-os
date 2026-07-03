'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_SECTIONS } from '@/config/nav';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-white/95 shadow-sm backdrop-blur lg:flex">
      <div className="flex h-16 items-center gap-3 border-b border-line px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-sm font-bold text-white">
          P
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold tracking-tight">PeopleHub OS</span>
          <span className="block text-[11px] font-medium uppercase tracking-[0.12em] text-ink-faint">
            Demo Corp India
          </span>
        </span>
      </div>
      <nav className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-3 pb-6 pt-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
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
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors',
                      active
                        ? 'bg-ink text-white shadow-sm'
                        : 'text-ink-muted hover:bg-canvas hover:text-ink',
                    )}
                  >
                    <item.icon className={cn('h-4 w-4 shrink-0', active ? 'text-primary-200' : 'text-ink-faint')} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-line p-4">
        <div className="rounded-lg border border-primary-100 bg-primary-50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-800">Enterprise v1</p>
          <p className="mt-1 text-xs text-primary-900">HRMS, payroll, tax, email and developer APIs</p>
        </div>
      </div>
    </aside>
  );
}
