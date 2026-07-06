'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BadgeIndianRupee,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  Download,
  Gauge,
  IndianRupee,
  RefreshCw,
  ShieldCheck,
  Target,
  Users,
  XCircle,
} from 'lucide-react';
import { signIn, useSession } from 'next-auth/react';
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '@/lib/api';
import { cn, formatDate, formatINR } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type DashboardData = {
  headcount: {
    total: number;
    active: number;
    newThisMonth: number;
    exitsThisMonth: number;
  };
  attendanceToday: {
    present: number;
    late: number;
    absent: number;
    notMarked?: number;
    onLeave: number;
    rate: number;
  };
  attendanceTrend: Array<{ month: string; rate: number }>;
  pendingApprovals: {
    leave: number;
    expenses: number;
    tickets: number;
    total: number;
  };
  payroll: {
    lastRunMonth: string | null;
    lastRunNet: number;
    trend: Array<{ month: string; amount: number; gross: number }>;
  };
  payrollReadiness: {
    period: string | null;
    status: string;
    totalEmployees: number;
    readyEmployees: number;
    criticalBlockers: number;
    warnings: number;
    readinessRate: number;
    topIssues: Array<{ label: string; count: number; severity: 'critical' | 'warning' }>;
  };
  hiring: {
    openPositions: number;
    activeCandidates: number;
    offersPending: number;
  };
  headcountByDepartment: Array<{ name: string; value: number }>;
  upcoming: {
    birthdays: Array<{ id: string; name: string; date: string }>;
    anniversaries: Array<{ id: string; name: string; date: string }>;
    holidays: Array<{ name: string; date: string }>;
  };
};

const premiumColors = ['#0F766E', '#2563EB', '#F59E0B', '#7C3AED', '#E11D48', '#0891B2', '#475569'];

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery<DashboardData>({
    queryKey: ['analytics', 'dashboard'],
    queryFn: () => api.get('/analytics/dashboard').then((r) => r.data),
    enabled: status === 'authenticated',
    retry: false,
  });

  const firstName = session?.user?.name?.split(' ')[0] ?? 'there';

  if (status === 'loading' || (status === 'authenticated' && isLoading)) {
    return <DashboardSkeleton />;
  }

  if (status === 'unauthenticated') {
    return (
      <Card className="border-slate-200 bg-white">
        <CardContent className="flex min-h-80 flex-col items-center justify-center text-center">
          <p className="text-lg font-semibold text-ink">Sign in required</p>
          <p className="mt-2 max-w-md text-sm text-ink-muted">
            Your local browser does not have an active PeopleHub session.
          </p>
          <Button className="mt-5" onClick={() => signIn(undefined, { callbackUrl: '/dashboard' })}>
            Go to sign in
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    const message = error instanceof Error ? error.message : 'Dashboard data could not be loaded.';
    return (
      <Card className="border-rose-200 bg-white">
        <CardContent className="flex min-h-80 flex-col items-center justify-center text-center">
          <p className="text-lg font-semibold text-ink">Dashboard data is unavailable</p>
          <p className="mt-2 max-w-xl text-sm text-ink-muted">
            The app shell loaded, but the analytics API request failed. Confirm the API server is running on
            port 3001 and refresh your session if this persists.
          </p>
          <code className="mt-4 max-w-xl rounded-lg bg-slate-50 px-3 py-2 text-xs text-ink-muted">{message}</code>
          <Button className="mt-5" onClick={() => refetch()} disabled={isRefetching}>
            {isRefetching ? 'Retrying...' : 'Retry'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <ExecutiveDashboard data={data} firstName={firstName} refreshing={isRefetching} onRefresh={() => refetch()} />;
}

function ExecutiveDashboard({
  data,
  firstName,
  refreshing,
  onRefresh,
}: {
  data: DashboardData;
  firstName: string;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const attendance = data.attendanceToday;
  const attendanceSegments = [
    { name: 'Present', value: attendance.present, color: '#0F766E' },
    { name: 'Late', value: attendance.late, color: '#F59E0B' },
    { name: 'On leave', value: attendance.onLeave, color: '#2563EB' },
    { name: 'Absent', value: attendance.absent, color: '#E11D48' },
    { name: 'Not marked', value: attendance.notMarked ?? 0, color: '#94A3B8' },
  ].filter((segment) => segment.value > 0);
  const markedToday = attendance.present + attendance.late + attendance.onLeave + attendance.absent;

  const departmentRows = useMemo(() => {
    const max = Math.max(...data.headcountByDepartment.map((d) => d.value), 1);
    return [...data.headcountByDepartment]
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
      .map((row, index) => ({
        ...row,
        pct: Math.round((row.value / max) * 100),
        color: premiumColors[index % premiumColors.length],
      }));
  }, [data.headcountByDepartment]);

  const riskItems = [
    {
      label: 'Approval exposure',
      value: data.pendingApprovals.total,
      description: `${data.pendingApprovals.leave} leave, ${data.pendingApprovals.expenses} expense, ${data.pendingApprovals.tickets} ticket approvals`,
      tone: data.pendingApprovals.total > 8 ? 'danger' : data.pendingApprovals.total > 3 ? 'warning' : 'success',
      icon: Clock3,
    },
    {
      label: 'Attendance exceptions',
      value: attendance.absent + attendance.late,
      description: `${attendance.absent} absent, ${attendance.late} late, ${attendance.notMarked ?? 0} not marked`,
      tone: attendance.absent + attendance.late > 5 ? 'danger' : attendance.late > 0 ? 'warning' : 'success',
      icon: AlertTriangle,
    },
    {
      label: 'Hiring velocity',
      value: data.hiring.activeCandidates,
      description: `${data.hiring.openPositions} open roles and ${data.hiring.offersPending} offers pending`,
      tone: data.hiring.offersPending > 0 ? 'info' : 'neutral',
      icon: BriefcaseBusiness,
    },
  ];

  const upcoming = [
    ...data.upcoming.holidays.map((item) => ({ ...item, kind: 'Holiday' })),
    ...data.upcoming.anniversaries.map((item) => ({ ...item, kind: 'Anniversary' })),
    ...data.upcoming.birthdays.map((item) => ({ ...item, kind: 'Birthday' })),
  ]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 7);

  const payrollDelta =
    data.payroll.trend.length >= 2
      ? data.payroll.trend[data.payroll.trend.length - 1].amount - data.payroll.trend[data.payroll.trend.length - 2].amount
      : 0;

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_14px_48px_-44px_rgba(15,23,42,0.5)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="bg-slate-50 text-[10px]">Executive cockpit</Badge>
              <Badge variant="success" className="text-[10px]">Live data</Badge>
              <Badge variant="info" className="text-[10px]">India payroll</Badge>
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-2xl">
                Good morning, {firstName}.
              </h1>
              <p className="text-xs leading-5 text-slate-600">
                Workforce, payroll, approvals, hiring, and operating risk are live.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <HeroAction href="/reports" icon={Download} label="Reports" />
            <HeroAction href="/approvals" icon={ShieldCheck} label="Approvals" />
            <HeroAction href="/payroll" icon={IndianRupee} label="Payroll" />
            <Button size="sm" onClick={onRefresh} disabled={refreshing}>
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <CommandMetric
            label="Active workforce"
            value={data.headcount.active}
            detail={`${data.headcount.total} total records`}
            icon={Users}
            accent="#0F766E"
          />
          <CommandMetric
            label="Net payroll"
            value={formatINR(data.payroll.lastRunNet, true)}
            detail={`${data.payroll.lastRunMonth ?? 'No payroll'} latest run`}
            icon={IndianRupee}
            accent="#2563EB"
          />
          <CommandMetric
            label="Open decisions"
            value={data.pendingApprovals.total}
            detail="Approvals awaiting action"
            icon={ShieldCheck}
            accent="#F59E0B"
          />
          <CommandMetric
            label="Talent pipeline"
            value={data.hiring.activeCandidates}
            detail={`${data.hiring.openPositions} open positions`}
            icon={Target}
            accent="#7C3AED"
          />
          <CommandMetric
            label="Operating grade"
            value={healthScore(data)}
            detail={`${formatSignedINR(payrollDelta)} payroll movement`}
            icon={Gauge}
            accent="#0F766E"
            dark
          />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="overflow-hidden border-slate-200 bg-white">
          <CardHeader className="border-slate-200 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Payroll Command Curve</CardTitle>
                <p className="mt-1 text-xs text-slate-500">Net and gross payroll trend across recent runs</p>
              </div>
              <Badge variant={payrollDelta >= 0 ? 'success' : 'destructive'}>
                {payrollDelta >= 0 ? 'Up' : 'Down'} {formatINR(Math.abs(payrollDelta), true)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="h-[340px] p-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.payroll.trend} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="netPayrollFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0F766E" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#0F766E" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#E2E8F0" strokeDasharray="3 6" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  width={70}
                  tick={{ fill: '#64748B', fontSize: 11 }}
                  tickFormatter={(v: number) => formatINR(v, true)}
                />
                <Tooltip content={<PayrollTooltip />} cursor={{ fill: '#F8FAFC' }} />
                <Area type="monotone" dataKey="gross" fill="url(#netPayrollFill)" stroke="transparent" />
                <Bar dataKey="amount" fill="#0F766E" radius={[6, 6, 0, 0]} barSize={30} />
                <Line type="monotone" dataKey="gross" stroke="#2563EB" strokeWidth={3} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-slate-200 bg-white">
          <CardHeader className="border-slate-200 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Workforce Availability</CardTitle>
                <p className="mt-1 text-xs text-slate-500">Today by attendance state</p>
              </div>
              <Badge variant="outline">{markedToday} of {data.headcount.active} marked</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 p-5 md:grid-cols-[0.9fr_1.1fr] xl:grid-cols-1 2xl:grid-cols-[0.9fr_1.1fr]">
            <div className="relative h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={attendanceSegments} innerRadius={66} outerRadius={88} paddingAngle={3} dataKey="value">
                    {attendanceSegments.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-semibold tracking-tight text-slate-950">{markedToday}</span>
                  <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">marked today</span>
              </div>
            </div>
            <div className="space-y-3">
              {attendanceSegments.map((segment) => (
                <div key={segment.name} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="flex items-center gap-2 text-sm text-slate-700">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
                    {segment.name}
                  </span>
                  <span className="text-sm font-semibold text-slate-950">{segment.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <Card className="overflow-hidden border-slate-200 bg-white">
          <CardHeader className="border-slate-200 px-5 py-4">
            <CardTitle>Department Load Map</CardTitle>
            <p className="text-xs text-slate-500">Active headcount concentration</p>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            {departmentRows.map((row) => (
              <div key={row.name} className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium text-slate-700">{row.name}</span>
                  <span className="font-semibold text-slate-950">{row.value}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: `${row.pct}%`, backgroundColor: row.color }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="flex h-full flex-col overflow-hidden border-slate-200 bg-white">
          <CardHeader className="border-slate-200 px-5 py-4">
            <CardTitle>Payroll Readiness</CardTitle>
            <p className="text-xs text-slate-500">Validation status for the latest payroll cycle</p>
          </CardHeader>
          <CardContent className="flex flex-1 p-5">
            <PayrollReadinessCard readiness={data.payrollReadiness} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_0.9fr_0.9fr]">
        <Card className="overflow-hidden border-slate-200 bg-white">
          <CardHeader className="border-slate-200 px-5 py-4">
            <CardTitle>Decision Queue</CardTitle>
            <p className="text-xs text-slate-500">Items that can slow payroll, hiring, or employee operations</p>
          </CardHeader>
          <CardContent className="space-y-3 p-5">
            {riskItems.map((item) => (
              <RiskRow key={item.label} item={item} />
            ))}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-slate-200 bg-white">
          <CardHeader className="border-slate-200 px-5 py-4">
            <CardTitle>Hiring Control</CardTitle>
            <p className="text-xs text-slate-500">Pipeline load and offer pressure</p>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <HiringStat label="Open roles" value={data.hiring.openPositions} icon={BriefcaseBusiness} />
            <HiringStat label="Active candidates" value={data.hiring.activeCandidates} icon={Users} />
            <HiringStat label="Pending offers" value={data.hiring.offersPending} icon={BadgeIndianRupee} />
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              Prioritize offer approvals and role closures when pending offers stay above zero for more than one review cycle.
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-slate-200 bg-white">
          <CardHeader className="border-slate-200 px-5 py-4">
            <CardTitle>People Calendar</CardTitle>
            <p className="text-xs text-slate-500">Holidays, birthdays, and anniversaries</p>
          </CardHeader>
          <CardContent className="space-y-3 p-5">
            {upcoming.length ? (
              upcoming.map((item) => (
                <div key={`${item.kind}-${item.name}-${item.date}`} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{item.name}</p>
                    <p className="text-xs text-slate-500">{item.kind}</p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {formatDate(item.date)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No events in the next two weeks.</p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function CommandMetric({
  label,
  value,
  detail,
  icon: Icon,
  accent,
  dark = false,
}: {
  label: string;
  value: React.ReactNode;
  detail: string;
  icon: typeof Users;
  accent: string;
  dark?: boolean;
}) {
  return (
    <div className={cn('rounded-lg border p-3', dark ? 'border-slate-900 bg-slate-950' : 'border-slate-200 bg-slate-50')}>
      <div className="flex items-center justify-between gap-3">
        <p className={cn('text-[10px] font-semibold uppercase tracking-[0.14em]', dark ? 'text-slate-400' : 'text-slate-500')}>{label}</p>
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg shadow-sm', dark ? 'bg-white/10' : 'bg-white')} style={{ color: dark ? '#99F6E4' : accent }}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className={cn('mt-2 text-xl font-semibold tracking-tight', dark ? 'text-white' : 'text-slate-950')}>{value}</p>
      <p className={cn('mt-1 text-xs', dark ? 'text-slate-400' : 'text-slate-500')}>{detail}</p>
    </div>
  );
}

function HeroAction({ href, icon: Icon, label }: { href: string; icon: typeof Users; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-line bg-white px-3 text-xs font-medium shadow-sm transition-colors hover:border-primary-200 hover:bg-canvas"
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

function RiskRow({
  item,
}: {
  item: {
    label: string;
    value: number;
    description: string;
    tone: string;
    icon: typeof Clock3;
  };
}) {
  const Icon = item.icon;
  const toneClass =
    item.tone === 'danger'
      ? 'bg-rose-50 text-rose-700 border-rose-100'
      : item.tone === 'warning'
        ? 'bg-amber-50 text-amber-700 border-amber-100'
        : item.tone === 'info'
          ? 'bg-sky-50 text-sky-700 border-sky-100'
          : item.tone === 'success'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
            : 'bg-slate-50 text-slate-700 border-slate-200';

  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border', toneClass)}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium text-slate-900">{item.label}</p>
          <span className="text-lg font-semibold text-slate-950">{item.value}</span>
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
      </div>
      <ArrowRight className="mt-2 h-4 w-4 text-slate-300" />
    </div>
  );
}

function HiringStat({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Users }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
      <span className="flex items-center gap-2 text-sm text-slate-600">
        <Icon className="h-4 w-4 text-slate-400" />
        {label}
      </span>
      <span className="text-base font-semibold text-slate-950">{value}</span>
    </div>
  );
}

function PayrollReadinessCard({
  readiness,
}: {
  readiness: DashboardData['payrollReadiness'];
}) {
  const hasCritical = readiness.criticalBlockers > 0;
  const hasWarnings = readiness.warnings > 0;
  const state = hasCritical ? 'Blocked' : hasWarnings ? 'Review needed' : 'Ready';
  const stateClass = hasCritical
    ? 'border-rose-200 bg-rose-50 text-rose-700'
    : hasWarnings
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700';
  const barClass = hasCritical ? 'bg-rose-500' : hasWarnings ? 'bg-amber-500' : 'bg-emerald-600';
  const issues = readiness.topIssues.length
    ? readiness.topIssues
    : [{ label: 'No payroll validation issues detected', count: readiness.readyEmployees, severity: 'warning' as const }];
  const hasIssue = (needle: string) => readiness.topIssues.some((issue) => issue.label.toLowerCase().includes(needle));
  const gates: Array<{ label: string; detail: string; tone: 'ready' | 'warning' | 'critical' }> = [
    {
      label: 'Bank file',
      detail: hasIssue('bank') ? 'Payout details need review' : 'Payout data verified',
      tone: hasIssue('bank') ? 'warning' : 'ready',
    },
    {
      label: 'Tax engine',
      detail: hasIssue('tax') || hasIssue('tds') ? 'Tax configuration needs review' : 'TDS rules available',
      tone: hasIssue('tax') || hasIssue('tds') ? 'warning' : 'ready',
    },
    {
      label: 'Leave inputs',
      detail: hasIssue('leave') ? 'Approvals pending before run' : 'Leave inputs clear',
      tone: hasIssue('leave') ? 'warning' : 'ready',
    },
    {
      label: 'Run status',
      detail: `${readiness.status.replaceAll('_', ' ').toLowerCase()} cycle`,
      tone: readiness.status === 'DRAFT' || readiness.status === 'PROCESSING' ? 'critical' : hasWarnings ? 'warning' : 'ready',
    },
  ];

  return (
    <div className="flex min-h-full flex-1 flex-col gap-5">
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                {readiness.period ?? 'No payroll run'}
              </p>
              <p className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">
                {readiness.readinessRate}%
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {readiness.readyEmployees} of {readiness.totalEmployees} employees ready
              </p>
            </div>
            <span className={cn('rounded-full border px-3 py-1 text-xs font-semibold', stateClass)}>{state}</span>
          </div>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white">
            <div className={cn('h-full rounded-full', barClass)} style={{ width: `${Math.min(readiness.readinessRate, 100)}%` }} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <ReadinessPill label="Critical" value={readiness.criticalBlockers} tone="critical" />
            <ReadinessPill label="Warn" value={readiness.warnings} tone="warning" />
            <ReadinessPill label="Ready" value={readiness.readyEmployees} tone="ready" />
          </div>
        </div>

        <div className="space-y-2">
          {issues.slice(0, 4).map((issue) => (
            <div key={issue.label} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
              <span className="flex min-w-0 items-center gap-2">
                {issue.severity === 'critical' ? (
                  <XCircle className="h-4 w-4 shrink-0 text-rose-500" />
                ) : readiness.topIssues.length ? (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                )}
                <span className="text-sm font-medium leading-5 text-slate-700">{issue.label}</span>
              </span>
              <span className="shrink-0 rounded-md bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">
                {issue.count}
              </span>
            </div>
          ))}
          <Link
            href="/payroll"
            className="flex items-center justify-between rounded-lg border border-teal-200 bg-teal-50 px-3 py-2.5 text-sm font-semibold text-teal-800 transition-colors hover:bg-teal-100"
          >
            Open payroll review
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="mt-auto rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Payroll gates</p>
            <p className="mt-1 text-xs text-slate-500">Controls that must be clean before lock and publish.</p>
          </div>
          <Badge variant={hasCritical ? 'destructive' : hasWarnings ? 'warning' : 'success'}>{state}</Badge>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {gates.map((gate) => (
            <ReadinessGate key={gate.label} gate={gate} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ReadinessGate({
  gate,
}: {
  gate: { label: string; detail: string; tone: 'ready' | 'warning' | 'critical' };
}) {
  const iconClass =
    gate.tone === 'critical' ? 'text-rose-500' : gate.tone === 'warning' ? 'text-amber-500' : 'text-emerald-600';
  const Icon = gate.tone === 'ready' ? CheckCircle2 : AlertTriangle;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3">
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', iconClass)} />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{gate.label}</p>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">{sentenceCase(gate.detail)}</p>
      </div>
    </div>
  );
}

function ReadinessPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'critical' | 'warning' | 'ready';
}) {
  const className =
    tone === 'critical'
      ? 'bg-rose-50 text-rose-700'
      : tone === 'warning'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-emerald-50 text-emerald-700';

  return (
    <div className={cn('rounded-lg px-3 py-2 text-center', className)}>
      <p className="text-lg font-semibold leading-none">{value}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em]">{label}</p>
    </div>
  );
}

function PayrollTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const amount = payload.find((item) => item.dataKey === 'amount')?.value ?? 0;
  const gross = payload.find((item) => item.dataKey === 'gross')?.value ?? 0;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-xl">
      <p className="font-semibold text-slate-900">{label}</p>
      <p className="mt-2 text-slate-600">Net: <span className="font-semibold text-slate-950">{formatINR(amount)}</span></p>
      <p className="mt-1 text-slate-600">Gross: <span className="font-semibold text-slate-950">{formatINR(gross)}</span></p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-64 rounded-lg" />
      <div className="grid gap-5 xl:grid-cols-2">
        <Skeleton className="h-[420px] rounded-lg" />
        <Skeleton className="h-[420px] rounded-lg" />
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <Skeleton className="h-80 rounded-lg" />
        <Skeleton className="h-80 rounded-lg" />
        <Skeleton className="h-80 rounded-lg" />
      </div>
    </div>
  );
}

function healthScore(data: DashboardData) {
  const approvalPenalty = Math.min(data.pendingApprovals.total, 12);
  const exceptionPenalty = Math.min((data.attendanceToday.absent + data.attendanceToday.late) * 2, 20);
  const unmarkedPenalty = (data.attendanceToday.notMarked ?? 0) > data.headcount.active / 2 ? 4 : 0;
  const hiringBonus = data.hiring.openPositions > 0 && data.hiring.activeCandidates > 0 ? 4 : 0;
  return `${Math.max(76, Math.round(94 - approvalPenalty - exceptionPenalty - unmarkedPenalty + hiringBonus))}`;
}

function formatSignedINR(value: number) {
  if (value === 0) return 'No change';
  return `${value > 0 ? '+' : '-'}${formatINR(Math.abs(value), true)}`;
}

function sentenceCase(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}
