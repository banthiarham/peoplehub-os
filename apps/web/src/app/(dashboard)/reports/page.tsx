'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, TableProperties, TrendingDown, UserMinus, UserPlus, Users } from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/toaster';
import { CHART_COLORS } from '@/lib/colors';
import { downloadFile } from '@/lib/download';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

type Option = { id: string; name: string; code?: string | null };
type EmployeeOptions = {
  departments: Option[];
  locations: Option[];
  legalEntities: Option[];
  managers: Array<{ id: string; firstName: string; lastName: string }>;
};

type Dashboard = {
  headcount: { total: number; active: number; newThisMonth: number; exitsThisMonth: number };
  attendanceToday: { present: number; late: number; absent: number; onLeave: number; rate: number };
  attendanceTrend: Array<{ month: string; rate: number }>;
  pendingApprovals: { leave: number; expenses: number; tickets: number; total: number };
  payroll: { lastRunMonth: string | null; lastRunNet: number; trend: Array<{ month: string; amount: number; gross: number }> };
  hiring: { openPositions: number; activeCandidates: number; offersPending: number };
  headcountByDepartment: Array<{ name: string; value: number }>;
  upcoming: { birthdays: Array<{ id: string; name: string; date: string | null }>; anniversaries: Array<{ id: string; name: string; date: string | null }>; holidays: Array<{ name: string; date: string }> };
};

/** The report kinds the builder serves, and how they are labelled. */
const REPORTS = [
  { value: 'employees', label: 'Employees' },
  { value: 'attendance', label: 'Attendance (monthly register)' },
  { value: 'attendanceSummary', label: 'Attendance summary' },
  { value: 'payroll', label: 'Payroll' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'tickets', label: 'Helpdesk tickets' },
] as const;

type ReportKind = (typeof REPORTS)[number]['value'];

/** Reports built from the attendance ledger, which take the extra day options. */
const ATTENDANCE_REPORTS: ReportKind[] = ['attendance', 'attendanceSummary'];

type ColumnSpec = { key: string; label: string; numeric?: boolean };
/** `rows` is a capped preview; `rowCount` is how many the export contains. */
type ReportTable = {
  columns: ColumnSpec[];
  rows: Array<Record<string, unknown>>;
  rowCount: number;
};

type TrendPoint = { month: string; headcount: number; joins: number; exits: number };
type AttritionData = { monthly: Array<{ month: string; headcount: number; exits: number; attritionPct: number }>; byDepartment: Array<{ name: string; exits: number }> };
type NameValue = { name: string; value: number };
type Demographics = { gender: NameValue[]; ageBuckets: NameValue[]; tenureBuckets: NameValue[]; byLocation: NameValue[] };

const AGE_ORDER = ['<25', '25-34', '35-44', '45-54', '55+'];
const TENURE_ORDER = ['<1y', '1-3y', '3-5y', '5y+'];

function sortByOrder(items: NameValue[], order: string[]): NameValue[] {
  return [...items].sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
}

function buildParams(filters: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

export default function ReportsPage() {
  const [report, setReport] = useState<ReportKind>('employees');
  const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [includeNonWorkingDays, setIncludeNonWorkingDays] = useState(true);
  const [exporting, setExporting] = useState(false);
  const toast = useToast();
  const [departmentId, setDepartmentId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [legalEntityId, setLegalEntityId] = useState('');
  const [managerId, setManagerId] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const filterParams = useMemo(
    () => buildParams({ departmentId, locationId, legalEntityId, managerId, employmentType }),
    [departmentId, locationId, legalEntityId, managerId, employmentType],
  );
  const isAttendanceReport = ATTENDANCE_REPORTS.includes(report);
  const reportParams = useMemo(
    () =>
      buildParams({
        report,
        from,
        to,
        departmentId,
        locationId,
        legalEntityId,
        managerId,
        employmentType,
        // Only sent for the register, and only when switched off: the default is
        // to include them so the file reconciles to whole calendar months.
        ...(report === 'attendance' && !includeNonWorkingDays
          ? { includeNonWorkingDays: 'false' }
          : {}),
      }),
    [
      report,
      from,
      to,
      departmentId,
      locationId,
      legalEntityId,
      managerId,
      employmentType,
      includeNonWorkingDays,
    ],
  );

  const { data: options } = useQuery<EmployeeOptions>({
    queryKey: ['employees', 'meta', 'options'],
    queryFn: () => api.get('/employees/meta/options').then((r) => r.data),
  });
  const { data: dashboard } = useQuery<Dashboard>({
    queryKey: ['analytics', 'dashboard', filterParams],
    queryFn: () => api.get(`/analytics/dashboard?${filterParams}`).then((r) => r.data),
  });
  const { data: trend } = useQuery<TrendPoint[]>({
    queryKey: ['analytics', 'headcount-trend', filterParams],
    queryFn: () => api.get(`/analytics/headcount-trend?months=12&${filterParams}`).then((r) => r.data),
  });
  const { data: attrition } = useQuery<AttritionData>({
    queryKey: ['analytics', 'attrition', filterParams],
    queryFn: () => api.get(`/analytics/attrition?months=12&${filterParams}`).then((r) => r.data),
  });
  const { data: demographics } = useQuery<Demographics>({
    queryKey: ['analytics', 'demographics', filterParams],
    queryFn: () => api.get(`/analytics/demographics?${filterParams}`).then((r) => r.data),
  });
  const { data: builderTable, error: builderError } = useQuery<ReportTable>({
    queryKey: ['analytics', 'report-builder', reportParams],
    queryFn: () => api.get(`/analytics/reports/builder?${reportParams}`).then((r) => r.data),
    // A range too wide to export is answered with a 400 explaining how to narrow
    // it; retrying cannot change that.
    retry: false,
  });
  const builderColumns = builderTable?.columns ?? [];
  const builderRows = builderTable?.rows ?? [];
  const builderRowCount = builderTable?.rowCount ?? 0;

  const loading = !options || !dashboard || !trend || !attrition || !demographics;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-80" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 lg:col-span-2" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  async function downloadReport() {
    setExporting(true);
    try {
      await downloadFile(
        `/analytics/reports/builder/export?${reportParams}&format=${format}`,
        `${report}-report.${format}`,
      );
    } catch {
      toast('Export failed. Narrow the date range or filters and try again.', 'error');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Analytics"
        description="Scoped workforce reporting for HR, payroll, attendance, and leadership"
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TableProperties className="h-4 w-4 text-primary-600" /> Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 lg:grid-cols-6">
            <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">Department</option>
              {(options?.departments ?? []).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
            <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">Location</option>
              {(options?.locations ?? []).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </Select>
            <Select value={legalEntityId} onChange={(e) => setLegalEntityId(e.target.value)}>
              <option value="">Legal entity</option>
              {(options?.legalEntities ?? []).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </Select>
            <Select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
              <option value="">Manager</option>
              {(options?.managers ?? []).map((item) => (
                <option key={item.id} value={item.id}>{item.firstName} {item.lastName}</option>
              ))}
            </Select>
            <Select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
              <option value="">Employment type</option>
              <option value="FULL_TIME">Full time</option>
              <option value="PART_TIME">Part time</option>
              <option value="CONTRACTOR">Contractor</option>
              <option value="INTERN">Intern</option>
            </Select>
            <div className="flex gap-2">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Select value={report} onChange={(e) => setReport(e.target.value as ReportKind)} className="w-64">
              {REPORTS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </Select>
            <Select
              value={format}
              onChange={(e) => setFormat(e.target.value as 'xlsx' | 'csv')}
              className="w-40"
              aria-label="Export format"
            >
              <option value="xlsx">Excel (.xlsx)</option>
              <option value="csv">CSV</option>
            </Select>
            {report === 'attendance' && (
              <label className="flex items-center gap-2 text-sm text-ink-muted">
                <input
                  type="checkbox"
                  checked={includeNonWorkingDays}
                  onChange={(e) => setIncludeNonWorkingDays(e.target.checked)}
                />
                Include weekly offs &amp; holidays
              </label>
            )}
            <Button variant="outline" onClick={downloadReport} disabled={exporting}>
              <Download className="h-4 w-4" /> {exporting ? 'Preparing…' : 'Export'}
            </Button>
            <span className="text-sm text-ink-muted">
              {builderRowCount.toLocaleString('en-IN')} rows ready
            </span>
          </div>
          {isAttendanceReport && (
            <p className="mt-2 text-xs text-ink-muted">
              {report === 'attendance'
                ? 'One row per employee per day, including absent, on-leave, weekly-off and holiday days. Defaults to the current month when no dates are set.'
                : 'One row per employee per month. Attendance figures only — no payroll LOP or payable days.'}
            </p>
          )}
          {!!builderError && (
            <p className="mt-3 rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-danger">
              {errorMessage(builderError)}
            </p>
          )}
          {!!builderRows.length && (
            <div className="mt-4 overflow-x-auto rounded border border-line">
              <Table>
                <THead>
                  <TR>
                    {builderColumns.map((column) => (
                      <TH key={column.key} className={column.numeric ? 'text-right' : undefined}>
                        {column.label}
                      </TH>
                    ))}
                  </TR>
                </THead>
                <TBody>
                  {builderRows.slice(0, 10).map((row, index) => (
                    <TR key={index}>
                      {builderColumns.map((column) => (
                        <TD
                          key={column.key}
                          className={column.numeric ? 'whitespace-nowrap text-right' : 'whitespace-nowrap'}
                        >
                          {String(row[column.key] ?? '')}
                        </TD>
                      ))}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
          {builderRowCount > 10 && (
            <p className="mt-2 text-xs text-ink-muted">
              Showing the first 10 of {builderRowCount.toLocaleString('en-IN')} rows — the export
              contains all of them.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total employees" value={dashboard.headcount.total} icon={Users} />
        <StatCard label="Active" value={dashboard.headcount.active} icon={Users} />
        <StatCard label="New this month" value={dashboard.headcount.newThisMonth} icon={UserPlus} />
        <StatCard label="Exited" value={dashboard.headcount.exitsThisMonth} icon={UserMinus} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Present today" value={dashboard.attendanceToday.present} />
        <StatCard label="On leave today" value={dashboard.attendanceToday.onLeave} />
        <StatCard label="Pending approvals" value={dashboard.pendingApprovals.total} />
        <StatCard label="Last payroll net" value={`₹${dashboard.payroll.lastRunNet.toLocaleString('en-IN')}`} icon={Users} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Headcount trend (12 months)</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend}>
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} width={40} />
                <Tooltip cursor={{ fill: '#F0F7F4' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="joins" name="Joins" barSize={12} fill={CHART_COLORS[3]} radius={[4, 4, 0, 0]} />
                <Bar dataKey="exits" name="Exits" barSize={12} fill={CHART_COLORS[4]} radius={[4, 4, 0, 0]} />
                <Line dataKey="headcount" name="Headcount" type="monotone" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-primary-600" /> Exits by department
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {attrition.byDepartment.length === 0 ? (
              <EmptyState title="No exits" description="No exits recorded in the selected scope." />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Department</TH>
                    <TH className="text-right">Exits</TH>
                  </TR>
                </THead>
                <TBody>
                  {attrition.byDepartment.map((d) => (
                    <TR key={d.name}>
                      <TD>{d.name}</TD>
                      <TD className="text-right font-semibold">{d.exits}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Payroll trend</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dashboard.payroll.trend} barSize={18}>
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} width={50} />
                <Tooltip cursor={{ fill: '#F0F7F4' }} formatter={(value) => [`₹${Number(value).toLocaleString('en-IN')}`, 'Net pay']} />
                <Bar dataKey="amount" fill={CHART_COLORS[2]} radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Attendance rate</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dashboard.attendanceTrend} barSize={20}>
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickFormatter={(v: number) => `${v}%`} tickLine={false} axisLine={false} fontSize={11} width={40} />
                <Tooltip formatter={(v) => [`${v}%`, 'Attendance']} cursor={{ fill: '#F0F7F4' }} />
                <Bar dataKey="rate" fill={CHART_COLORS[1]} radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DonutCard title="Gender" data={demographics.gender} />
        <BucketBarCard title="Age distribution" data={sortByOrder(demographics.ageBuckets, AGE_ORDER)} colorIndex={2} />
        <BucketBarCard title="Tenure distribution" data={sortByOrder(demographics.tenureBuckets, TENURE_ORDER)} colorIndex={5} />
        <DonutCard title="By location" data={demographics.byLocation} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Headcount by department</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {dashboard.headcountByDepartment.map((row) => (
              <div key={row.name} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm">
                <span>{row.name}</span>
                <span className="font-semibold">{row.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <SectionList label="Birthdays" items={dashboard.upcoming.birthdays.map((item) => item.name)} />
            <SectionList label="Anniversaries" items={dashboard.upcoming.anniversaries.map((item) => item.name)} />
            <SectionList label="Holidays" items={dashboard.upcoming.holidays.map((item) => item.name)} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Surfaces the API's own explanation — the row-limit refusal names what to narrow. */
function errorMessage(error: unknown): string {
  const detail = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return detail ?? 'Could not build this report. Adjust the filters and try again.';
}

function DonutCard({ title, data }: { title: string; data: NameValue[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-64">
        {data.length === 0 ? (
          <EmptyState title="No data" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                {data.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function BucketBarCard({ title, data, colorIndex }: { title: string; data: NameValue[]; colorIndex: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-64">
        {data.length === 0 ? (
          <EmptyState title="No data" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barSize={24}>
              <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} width={30} />
              <Tooltip cursor={{ fill: '#F0F7F4' }} />
              <Bar dataKey="value" name="Employees" fill={CHART_COLORS[colorIndex % CHART_COLORS.length]} radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function SectionList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</div>
      {items.length ? (
        <div className="space-y-1">
          {items.map((item) => (
            <div key={item} className="rounded-md border border-line px-3 py-2">
              {item}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No items" />
      )}
    </div>
  );
}
