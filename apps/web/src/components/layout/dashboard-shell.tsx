'use client';

import { useEffect, useState } from 'react';
import { CommandPaletteProvider } from '@/components/command-palette';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { cn } from '@/lib/utils';

const SIDEBAR_STORAGE_KEY = 'peoplehub.sidebar.collapsed.v2';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    setCollapsed(stored === null ? true : stored === 'true');
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  };

  return (
    <CommandPaletteProvider>
      <div className="min-h-screen bg-canvas">
        <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
        <div className={cn('transition-[padding] duration-200 ease-out', collapsed ? 'lg:pl-20' : 'lg:pl-60')}>
          <Topbar />
          <main className="mx-auto max-w-[1640px] px-4 py-5 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </CommandPaletteProvider>
  );
}
