'use client';

import { useQuery } from '@tanstack/react-query';
import { IndianRupee, Landmark, ReceiptText, Wallet } from 'lucide-react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/lib/api';
import { CHART_COLORS } from '@/lib/colors';
import { formatINR } from '@/lib/utils';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

interface RunRow {
  id: string;
  month: number;
  year: number;
  status: string;
  employees: number;
  totalNet: number;
  totalGross: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function PayrollPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['payroll', 'stats'],
    queryFn: () => api.get('/payroll/stats').then((r) => r.data),
  });
  const { data: runs } = useQuery({
    queryKey: ['payroll', 'runs'],
    queryFn: () => api.get('/payroll/runs').then((r) => r.data),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Payroll" description="Runs, statutory deductions and cost trends" />
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Last run (net)"
          value={stats?.lastRun ? formatINR(stats.lastRun.totalNet, true) : '—'}
          icon={IndianRupee}
        >
          {stats?.lastRun && (
            <p className="flex items-center gap-1.5 text-[11px] text-ink-muted">
              {MONTHS[stats.lastRun.month - 1]} {stats.lastRun.year} · {stats.lastRun.employees} employees{' '}
              <Badge variant={statusVariant(stats.lastRun.status)}>{stats.lastRun.status}</Badge>
            </p>
          )}
        </StatCard>
        <StatCard label="PF (employee)" value={formatINR(stats?.statutory?.pf ?? 0, true)} icon={Landmark} />
        <StatCard label="TDS" value={formatINR(stats?.statutory?.tds ?? 0, true)} icon={ReceiptText} />
        <StatCard
          label="ESI + PT"
          value={formatINR((stats?.statutory?.esi ?? 0) + (stats?.statutory?.pt ?? 0), true)}
          icon={Wallet}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Monthly cost</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats?.monthlyCostTrend ?? []} barSize={22}>
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={10} />
                <YAxis hide />
                <Tooltip formatter={(v) => formatINR(Number(v))} cursor={{ fill: '#F0F7F4' }} />
                <Bar dataKey="amount" fill={CHART_COLORS[0]} radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Payroll runs</CardTitle>
          </CardHeader>
          <Table>
            <THead>
              <TR>
                <TH>Period</TH>
                <TH>Employees</TH>
                <TH>Gross</TH>
                <TH>Net</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {(runs ?? []).map((r: RunRow) => (
                <TR key={r.id}>
                  <TD className="font-medium">
                    {MONTHS[r.month - 1]} {r.year}
                  </TD>
                  <TD>{r.employees}</TD>
                  <TD className="text-ink-muted">{formatINR(r.totalGross, true)}</TD>
                  <TD className="font-medium">{formatINR(r.totalNet, true)}</TD>
                  <TD>
                    <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
