'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_SECTIONS } from '@/config/nav';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-white lg:flex">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-700 text-sm font-bold text-white">
          P
        </span>
        <span className="text-[15px] font-semibold tracking-tight">
          PeopleHub <span className="font-normal text-ink-muted">OS</span>
        </span>
      </div>
      <nav className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-3 pb-6 pt-2">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-ink-faint">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors',
                      active
                        ? 'bg-primary-50 font-medium text-primary-700'
                        : 'text-ink-muted hover:bg-canvas hover:text-ink',
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-line p-4">
        <p className="text-[11px] text-ink-faint">Demo Corp · demo-corp</p>
      </div>
    </aside>
  );
}
