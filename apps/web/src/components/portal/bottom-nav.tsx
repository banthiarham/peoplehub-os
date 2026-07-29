'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { CalendarDays, Clock, Home, ReceiptText, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hasScope, viewerFromSession } from '@/lib/authz';

/**
 * `needsEmployee` tabs render nothing useful for a user account with no linked employee
 * record (an owner-only or integration login), so they are hidden rather than left to 404.
 * `scope` is an additional filter applied only when the session actually carries scopes,
 * so sessions issued before scopes were propagated keep their current tabs.
 */
const TABS = [
  { href: '/me', label: 'Home', icon: Home, needsEmployee: false },
  { href: '/me/attendance', label: 'Attendance', icon: Clock, needsEmployee: true, scope: 'attendance:read' },
  { href: '/me/leave', label: 'Leave', icon: CalendarDays, needsEmployee: true, scope: 'leave:read' },
  { href: '/me/payslips', label: 'Payslips', icon: ReceiptText, needsEmployee: true, scope: 'payroll:read' },
  { href: '/me/profile', label: 'Profile', icon: User, needsEmployee: true },
];

export function BottomNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const viewer = viewerFromSession(session);
  const hasEmployee = Boolean(session?.user?.employeeId);

  const tabs = TABS.filter((tab) => {
    if (tab.needsEmployee && !hasEmployee) return false;
    if (tab.scope && viewer.scopes.length > 0 && !hasScope(viewer, tab.scope)) return false;
    return true;
  });

  if (!tabs.length) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur">
      <div
        className="mx-auto grid max-w-md"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = href === '/me' ? pathname === '/me' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium',
                active ? 'text-primary-700' : 'text-ink-faint hover:text-ink-muted',
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
