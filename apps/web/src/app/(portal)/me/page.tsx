'use client';

import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { CalendarDays, ChevronRight, Clock, LifeBuoy, ReceiptText, User } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, formatINR } from '@/lib/utils';
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

interface LeaveRequestRow {
  id: string;
  status: string;
}

interface HolidayRow {
  id: string;
  name: string;
  date: string;
}

interface TicketRow {
  id: string;
  status: string;
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
  const { data: leaveRequests } = useQuery<LeaveRequestRow[]>({
    queryKey: ['leave', 'my-requests'],
    queryFn: () => api.get('/leave/requests/me').then((r) => r.data),
  });
  const { data: holidays } = useQuery<HolidayRow[]>({
    queryKey: ['attendance', 'holidays'],
    queryFn: () => api.get('/attendance/holidays').then((r) => r.data),
  });
  const { data: tickets } = useQuery<TicketRow[]>({
    queryKey: ['helpdesk', 'my-tickets'],
    queryFn: () => api.get('/helpdesk/tickets/me').then((r) => r.data),
  });

  const totalLeave = balances?.reduce((s, b) => s + b.balance, 0);
  const lastSlip = payslips?.[0];
  const summary = attendance?.summary;
  const pendingLeave = leaveRequests?.filter((request) => request.status === 'PENDING').length ?? 0;
  const openTickets = tickets?.filter((ticket) => !['RESOLVED', 'CLOSED'].includes(ticket.status)).length ?? 0;
  const nextHoliday = holidays?.find((holiday) => new Date(holiday.date) >= new Date());

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

      <div className="grid grid-cols-2 gap-2">
        <QuickAction href="/me/attendance" icon={Clock} label="Attendance" detail="History and punches" />
        <QuickAction href="/me/profile" icon={User} label="Profile" detail="Details and device" />
      </div>

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
                {pendingLeave ? ` · ${pendingLeave} pending` : ''}
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-ink-faint" />
        </Card>
      </Link>

      <Link href="/me/tickets" className="block">
        <Card className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50">
              <LifeBuoy className="h-5 w-5 text-primary-700" />
            </span>
            <div>
              <p className="text-sm font-medium">HR tickets</p>
              <p className="text-xs text-ink-muted">
                {openTickets ? `${openTickets} open request${openTickets === 1 ? '' : 's'}` : 'Raise or track a request'}
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

      {nextHoliday && (
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-ink-muted">
            Upcoming holiday
          </p>
          <p className="mt-1 text-sm font-medium">{nextHoliday.name}</p>
          <p className="text-xs text-ink-muted">{formatDate(nextHoliday.date)}</p>
        </Card>
      )}
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
  detail,
}: {
  href: string;
  icon: typeof Clock;
  label: string;
  detail: string;
}) {
  return (
    <Link href={href}>
      <Card className="p-3">
        <Icon className="h-4 w-4 text-primary-700" />
        <p className="mt-2 text-sm font-medium">{label}</p>
        <p className="text-[11px] text-ink-muted">{detail}</p>
      </Card>
    </Link>
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
