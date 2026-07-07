'use client';

import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  Clock3,
  IndianRupee,
  Landmark,
  ReceiptText,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/lib/api';
import { cn, formatINR } from '@/lib/utils';
import { PayrollExpensesTab } from '@/components/forms/payroll-expenses-tab';
import { PayrollInputsTab } from '@/components/forms/payroll-inputs-tab';
import { PayrollLoansTab } from '@/components/forms/payroll-loans-tab';
import { PayrollNewRunDialog } from '@/components/forms/payroll-new-run-dialog';
import { PayrollRunActionButton } from '@/components/forms/payroll-run-action-button';
import { PayrollRunDetailDialog } from '@/components/forms/payroll-run-detail-dialog';
import { PayrollSalariesTab } from '@/components/forms/payroll-salaries-tab';
import { PayrollStructuresTab } from '@/components/forms/payroll-structures-tab';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

interface RunRow {
  id: string;
  month: number;
  year: number;
  status: string;
  runType?: string;
  payGroup?: string | null;
  employees: number;
  totalNet: number;
  totalGross: number;
}

interface PayrollStats {
  lastRun: {
    id: string;
    month: number;
    year: number;
    status: string;
    totalNet: number;
    employees: number;
  } | null;
  monthlyCostTrend: Array<{ month: string; amount: number }>;
  statutory: {
    pf: number;
    esi: number;
    pt: number;
    tds: number;
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PAYROLL_TABS = [
  { id: 'runs', label: 'Runs', description: 'Process and lock payroll' },
  { id: 'structures', label: 'Structures', description: 'CTC templates and components' },
  { id: 'salaries', label: 'Salaries', description: 'Assign employee salary' },
  { id: 'inputs', label: 'Inputs', description: 'Bonus, arrears and overtime' },
  { id: 'expenses', label: 'Expenses', description: 'Claims and reimbursements' },
  { id: 'loans', label: 'Loans', description: 'Advances and EMI recovery' },
] as const;

export default function PayrollPage() {
  const [tab, setTab] = useState<(typeof PAYROLL_TABS)[number]['id']>('runs');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const { data: stats, isLoading } = useQuery({
    queryKey: ['payroll', 'stats'],
    queryFn: () => api.get('/payroll/stats').then((r) => r.data as PayrollStats),
  });
  const { data: runs } = useQuery({
    queryKey: ['payroll', 'runs'],
    queryFn: () => api.get('/payroll/runs').then((r) => r.data as RunRow[]),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 rounded-lg" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  const runRows = runs ?? [];
  const latestRun = stats?.lastRun;
  const latestRunRow = latestRun ? runRows.find((run) => run.id === latestRun.id) : runRows[0];
  const trend = stats?.monthlyCostTrend ?? [];
  const payrollDelta = trend.length >= 2 ? trend[trend.length - 1].amount - trend[trend.length - 2].amount : 0;
  const statutoryTotal = (stats?.statutory?.pf ?? 0) + (stats?.statutory?.esi ?? 0) + (stats?.statutory?.pt ?? 0) + (stats?.statutory?.tds ?? 0);
  const statutoryRows = [
    { label: 'PF', amount: stats?.statutory?.pf ?? 0, color: '#0F766E' },
    { label: 'TDS', amount: stats?.statutory?.tds ?? 0, color: '#2563EB' },
    { label: 'ESI', amount: stats?.statutory?.esi ?? 0, color: '#F59E0B' },
    { label: 'PT', amount: stats?.statutory?.pt ?? 0, color: '#7C3AED' },
  ];
  const lifecycleSteps = ['DRAFT', 'REVIEW', 'APPROVED', 'LOCKED', 'PUBLISHED', 'CLOSED'];
  const currentStepIndex = Math.max(0, lifecycleSteps.indexOf(latestRun?.status ?? 'DRAFT'));

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_14px_48px_-44px_rgba(15,23,42,0.5)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-2xl">
                Payroll command center
              </h1>
              <p className="text-xs leading-5 text-slate-600">
                Process salary, taxes, claims, loans, approvals, payslips, and statutory outputs from one control surface.
              </p>
            </div>
          </div>
          <PayrollNewRunDialog />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <PayrollMetric
            label="Latest net pay"
            value={latestRun ? formatINR(latestRun.totalNet, true) : '—'}
            detail={latestRun ? `${MONTHS[latestRun.month - 1]} ${latestRun.year} · ${latestRun.employees} employees` : 'No run processed'}
            icon={IndianRupee}
            accent="#0F766E"
          />
          <PayrollMetric
            label="Gross payroll"
            value={latestRunRow ? formatINR(latestRunRow.totalGross, true) : '—'}
            detail={latestRunRow ? `${latestRunRow.runType?.replace(/_/g, ' ') ?? 'Monthly'} cycle` : 'Awaiting run data'}
            icon={TrendingUp}
            accent="#2563EB"
          />
          <PayrollMetric
            label="TDS"
            value={formatINR(stats?.statutory?.tds ?? 0, true)}
            detail="Income tax withheld"
            icon={ReceiptText}
            accent="#F59E0B"
          />
          <PayrollMetric
            label="PF, ESI and PT"
            value={formatINR(statutoryTotal - (stats?.statutory?.tds ?? 0), true)}
            detail="Employee statutory deductions"
            icon={Landmark}
            accent="#7C3AED"
          />
          <PayrollMetric
            label="Run status"
            value={latestRun?.status ?? 'No run'}
            detail={`${runRows.length} payroll runs`}
            icon={ShieldCheck}
            accent="#0F766E"
            dark
          />
        </div>
      </section>

      <div className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm sm:grid-cols-2 xl:grid-cols-6">
        {PAYROLL_TABS.map((item) => (
          <Button
            key={item.id}
            type="button"
            variant={tab === item.id ? 'secondary' : 'ghost'}
            onClick={() => setTab(item.id)}
            className={cn(
              'h-auto justify-start rounded-lg px-3 py-2 text-left',
              tab === item.id ? 'bg-teal-50 text-teal-800 hover:bg-teal-50' : 'text-slate-600',
            )}
          >
            <span>
              <span className="block text-sm font-semibold">{item.label}</span>
              <span className="mt-0.5 block text-xs font-normal text-ink-muted">{item.description}</span>
            </span>
          </Button>
        ))}
      </div>

      {tab === 'expenses' ? (
        <PayrollExpensesTab />
      ) : tab === 'structures' ? (
        <PayrollStructuresTab />
      ) : tab === 'salaries' ? (
        <PayrollSalariesTab />
      ) : tab === 'inputs' ? (
        <PayrollInputsTab />
      ) : tab === 'loans' ? (
        <PayrollLoansTab />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[0.85fr_1.35fr]">
          <Card className="flex h-full flex-col overflow-hidden border-slate-200 bg-white">
            <CardHeader className="border-slate-200 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>Cost Trajectory</CardTitle>
                  <p className="mt-1 text-xs text-slate-500">Net salary movement across recent runs</p>
                </div>
                <Badge variant={payrollDelta >= 0 ? 'success' : 'destructive'}>
                  {payrollDelta >= 0 ? 'Up' : 'Down'} {formatINR(Math.abs(payrollDelta), true)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="h-72 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trend} barSize={26} margin={{ top: 14, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#E2E8F0" strokeDasharray="3 6" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: '#64748B', fontSize: 11 }} />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    width={70}
                    tick={{ fill: '#64748B', fontSize: 11 }}
                    tickFormatter={(v: number) => formatINR(v, true)}
                  />
                  <Tooltip formatter={(v) => formatINR(Number(v))} cursor={{ fill: '#F8FAFC' }} />
                  <Bar dataKey="amount" fill="#0F766E" radius={[6, 6, 0, 0]} />
                  <Line type="monotone" dataKey="amount" stroke="#2563EB" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
            <div className="grid grid-cols-3 border-t border-slate-200">
              <PayrollGate label="Bank file" value={latestRun?.status === 'PUBLISHED' || latestRun?.status === 'CLOSED' ? 'Ready' : 'Pending'} />
              <PayrollGate label="Payslips" value={latestRun?.status === 'PUBLISHED' || latestRun?.status === 'CLOSED' ? 'Published' : 'Locked first'} />
              <PayrollGate label="Statutory" value={statutoryTotal > 0 ? 'Calculated' : 'Pending'} />
            </div>
            <div className="grid flex-1 gap-4 border-t border-slate-200 p-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Statutory Stack</p>
                    <p className="mt-1 text-xs text-slate-500">Deductions included in the latest processed run</p>
                  </div>
                  <span className="text-sm font-semibold text-slate-950">{formatINR(statutoryTotal, true)}</span>
                </div>
                <div className="mt-4 space-y-3">
                  {statutoryRows.map((row) => (
                    <StatutoryRow key={row.label} row={row} total={statutoryTotal} />
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Run Lifecycle</p>
                    <p className="mt-1 text-xs text-slate-500">Latest cycle control path</p>
                  </div>
                  <Badge variant={statusVariant(latestRun?.status ?? 'DRAFT')}>{latestRun?.status ?? 'DRAFT'}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {lifecycleSteps.map((step, index) => (
                    <LifecycleStep key={step} label={step} complete={index <= currentStepIndex} current={index === currentStepIndex} />
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden border-slate-200 bg-white">
            <CardHeader className="border-slate-200 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Payroll Runs</CardTitle>
                  <p className="mt-1 text-xs text-slate-500">Review, process, approve, lock, publish, and close payroll cycles</p>
                </div>
                <Badge variant="outline">{runRows.length} runs</Badge>
              </div>
            </CardHeader>
            <Table>
              <THead>
                <TR>
                  <TH>Period</TH>
                  <TH className="w-28">Employees</TH>
                  <TH className="w-32">Gross</TH>
                  <TH className="w-32">Net</TH>
                  <TH className="w-36">Status</TH>
                  <TH className="w-28"></TH>
                </TR>
              </THead>
              <TBody>
                {runRows.map((r: RunRow) => (
                  <TR key={r.id} className="cursor-pointer" onClick={() => setSelectedRunId(r.id)}>
                    <TD className="font-medium">
                      {MONTHS[r.month - 1]} {r.year}
                      {r.runType && <span className="ml-2 text-xs text-ink-muted">{r.runType.replace(/_/g, ' ')}</span>}
                      {r.payGroup && <span className="block text-xs text-ink-muted">{r.payGroup}</span>}
                    </TD>
                    <TD>{r.employees}</TD>
                    <TD className="whitespace-nowrap text-ink-muted">{formatINR(r.totalGross, true)}</TD>
                    <TD className="whitespace-nowrap font-medium">{formatINR(r.totalNet, true)}</TD>
                    <TD>
                      <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                    </TD>
                    <TD>
                      <PayrollRunActionButton runId={r.id} status={r.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>
      )}

      <PayrollRunDetailDialog runId={selectedRunId} onClose={() => setSelectedRunId(null)} />
    </div>
  );
}

function PayrollMetric({
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
  icon: typeof IndianRupee;
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
      <p className={cn('mt-2 truncate text-xl font-semibold tracking-tight', dark ? 'text-white' : 'text-slate-950')}>{value}</p>
      <p className={cn('mt-1 truncate text-xs', dark ? 'text-slate-400' : 'text-slate-500')}>{detail}</p>
    </div>
  );
}

function PayrollGate({ label, value }: { label: string; value: string }) {
  const ready = ['Ready', 'Published', 'Calculated'].includes(value);
  return (
    <div className="border-r border-slate-200 px-4 py-3 last:border-r-0">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {ready ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Clock3 className="h-3.5 w-3.5 text-amber-500" />}
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function StatutoryRow({ row, total }: { row: { label: string; amount: number; color: string }; total: number }) {
  const pct = total > 0 ? Math.max(4, Math.round((row.amount / total) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-700">{row.label}</span>
        <span className="font-semibold text-slate-950">{formatINR(row.amount, true)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: row.color }} />
      </div>
    </div>
  );
}

function LifecycleStep({ label, complete, current }: { label: string; complete: boolean; current: boolean }) {
  return (
    <div
      className={cn(
        'rounded-lg border px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.08em]',
        current
          ? 'border-teal-200 bg-teal-50 text-teal-800'
          : complete
            ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
            : 'border-slate-200 bg-slate-50 text-slate-400',
      )}
    >
      {label.replace(/_/g, ' ')}
    </div>
  );
}
