'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, Clock, Home, ReceiptText, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/me', label: 'Home', icon: Home },
  { href: '/me/attendance', label: 'Attendance', icon: Clock },
  { href: '/me/leave', label: 'Leave', icon: CalendarDays },
  { href: '/me/payslips', label: 'Payslips', icon: ReceiptText },
  { href: '/me/profile', label: 'Profile', icon: User },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-5">
        {TABS.map(({ href, label, icon: Icon }) => {
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
