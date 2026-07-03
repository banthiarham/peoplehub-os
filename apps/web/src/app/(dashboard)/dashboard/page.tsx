'use client';

import { useQuery } from '@tanstack/react-query';
import { Briefcase, CalendarCheck, Cake, IndianRupee, PartyPopper, Users, Wallet } from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useSession } from 'next-auth/react';
import { api } from '@/lib/api';
import { CHART_COLORS } from '@/lib/colors';
import { formatDate, formatINR } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';

export default function DashboardPage() {
  const { data: session } = useSession();
  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'dashboard'],
    queryFn: () => api.get('/analytics/dashboard').then((r) => r.data),
  });

  const firstName = session?.user?.name?.split(' ')[0] ?? 'there';

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 lg:col-span-2" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  const att = data.attendanceToday;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Good morning, {firstName} 👋</h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          Here&apos;s what&apos;s happening across Demo Corp today.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total employees"
          value={data.headcount.active}
          icon={Users}
          delta={{
            value: `+${data.headcount.newThisMonth}`,
            positive: true,
            caption: 'joined this month',
          }}
        />
        <StatCard
          label="Attendance today"
          value={`${att.rate}%`}
          icon={CalendarCheck}
        >
          <div className="flex gap-2 text-[11px]">
            <Badge variant="success">{att.present} present</Badge>
            <Badge variant="warning">{att.late} late</Badge>
            <Badge variant="info">{att.onLeave} on leave</Badge>
          </div>
        </StatCard>
        <StatCard
          label="Pending approvals"
          value={data.pendingApprovals.total}
          icon={Wallet}
        >
          <p className="text-[11px] text-ink-muted">
            {data.pendingApprovals.leave} leave · {data.pendingApprovals.expenses} expenses ·{' '}
            {data.pendingApprovals.tickets} tickets
          </p>
        </StatCard>
        <StatCard
          label="Last payroll"
          value={formatINR(data.payroll.lastRunNet, true)}
          icon={IndianRupee}
        >
          <p className="text-[11px] text-ink-muted">{data.payroll.lastRunMonth ?? 'No runs yet'}</p>
        </StatCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Payroll cost trend</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.payroll.trend} barSize={28}>
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis
                  tickFormatter={(v: number) => formatINR(v, true)}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  width={70}
                />
                <Tooltip formatter={(v) => formatINR(Number(v))} cursor={{ fill: '#F0F7F4' }} />
                <Bar dataKey="amount" fill={CHART_COLORS[0]} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Headcount by department</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.headcountByDepartment}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                >
                  {data.headcountByDepartment.map((_: unknown, i: number) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary-600" /> Hiring snapshot
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Open positions" value={data.hiring.openPositions} />
            <Row label="Active candidates" value={data.hiring.activeCandidates} />
            <Row label="Offers pending" value={data.hiring.offersPending} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cake className="h-4 w-4 text-primary-600" /> Coming up
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            {data.upcoming.holidays.map((h: { name: string; date: string }) => (
              <div key={h.name} className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <PartyPopper className="h-3.5 w-3.5 text-accent" /> {h.name}
                </span>
                <span className="text-xs text-ink-muted">{formatDate(h.date)}</span>
              </div>
            ))}
            {data.upcoming.birthdays.slice(0, 3).map((b: { id: string; name: string; date: string }) => (
              <div key={b.id} className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Cake className="h-3.5 w-3.5 text-rose-400" /> {b.name}
                </span>
                <span className="text-xs text-ink-muted">{formatDate(b.date)}</span>
              </div>
            ))}
            {data.upcoming.holidays.length + data.upcoming.birthdays.length === 0 && (
              <p className="text-xs text-ink-muted">Nothing in the next two weeks.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Attendance trend</CardTitle>
          </CardHeader>
          <CardContent className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.attendanceTrend} barSize={20}>
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={10} />
                <Tooltip formatter={(v) => `${v}%`} cursor={{ fill: '#F0F7F4' }} />
                <Bar dataKey="rate" fill={CHART_COLORS[1]} radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-muted">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
