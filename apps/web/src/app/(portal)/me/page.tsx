'use client';

import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { CalendarDays, ChevronRight, ReceiptText } from 'lucide-react';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/utils';
import { CheckInPanel } from '@/components/portal/check-in-panel';
import { Card } from '@/components/ui/card';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface LeaveBalanceRow {
  balance: number;
  leaveType: { code: string };
}

interface PayslipRow {
  id: string;
  month: number;
  year: number;
  netPay: number;
}

export default function PortalHomePage() {
  const { data: session } = useSession();
  const firstName = session?.user?.name?.split(' ')[0] ?? 'there';

  const { data: attendance } = useQuery({
    queryKey: ['attendance', 'my-month'],
    queryFn: () => api.get('/attendance/me').then((r) => r.data),
  });
  const { data: balances } = useQuery<LeaveBalanceRow[]>({
    queryKey: ['leave', 'my-balances'],
    queryFn: () => api.get('/leave/balances/me').then((r) => r.data),
  });
  const { data: payslips } = useQuery<PayslipRow[]>({
    queryKey: ['payroll', 'my-payslips'],
    queryFn: () => api.get('/payroll/payslips/me').then((r) => r.data),
  });

  const totalLeave = balances?.reduce((s, b) => s + b.balance, 0);
  const lastSlip = payslips?.[0];
  const summary = attendance?.summary;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-ink-muted">
          {new Date().toLocaleDateString('en-IN', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </p>
        <h1 className="text-xl font-semibold tracking-tight">Hi, {firstName}</h1>
      </div>

      <CheckInPanel />

      {summary && (
        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Present" value={summary.present + summary.late} />
          <MiniStat label="Late" value={summary.late} />
          <MiniStat label="Avg hours" value={summary.avgWorkHours} />
        </div>
      )}

      <Link href="/me/leave" className="block">
        <Card className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50">
              <CalendarDays className="h-5 w-5 text-primary-700" />
            </span>
            <div>
              <p className="text-sm font-medium">Leave balance</p>
              <p className="text-xs text-ink-muted">
                {totalLeave != null ? `${totalLeave} days available` : '—'}
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-ink-faint" />
        </Card>
      </Link>

      <Link href="/me/payslips" className="block">
        <Card className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50">
              <ReceiptText className="h-5 w-5 text-primary-700" />
            </span>
            <div>
              <p className="text-sm font-medium">Latest payslip</p>
              <p className="text-xs text-ink-muted">
                {lastSlip
                  ? `${MONTHS[lastSlip.month - 1]} ${lastSlip.year} · ${formatINR(lastSlip.netPay)} net`
                  : 'No payslips yet'}
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-ink-faint" />
        </Card>
      </Link>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-3 text-center">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-ink-muted">{label}</p>
    </Card>
  );
}
