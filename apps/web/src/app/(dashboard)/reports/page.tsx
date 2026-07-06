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
  const [report, setReport] = useState<'employees' | 'attendance' | 'payroll' | 'expenses' | 'tickets'>('employees');
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
  const reportParams = useMemo(
    () => buildParams({ report, from, to, departmentId, locationId, legalEntityId, managerId, employmentType }),
    [report, from, to, departmentId, locationId, legalEntityId, managerId, employmentType],
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
  const { data: builderRows } = useQuery<Array<Record<string, unknown>>>({
    queryKey: ['analytics', 'report-builder', reportParams],
    queryFn: () => api.get(`/analytics/reports/builder?${reportParams}`).then((r) => r.data),
  });

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

  async function downloadReportCsv() {
    await downloadFile(`/analytics/reports/builder/export?${reportParams}`, `${report}-report.csv`);
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
            <Select value={report} onChange={(e) => setReport(e.target.value as typeof report)} className="w-56">
              <option value="employees">Employees</option>
              <option value="attendance">Attendance</option>
              <option value="payroll">Payroll</option>
              <option value="expenses">Expenses</option>
              <option value="tickets">Helpdesk tickets</option>
            </Select>
            <Button variant="outline" onClick={downloadReportCsv}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <span className="text-sm text-ink-muted">{builderRows?.length ?? 0} rows ready</span>
          </div>
          {!!builderRows?.length && (
            <div className="mt-4 overflow-x-auto rounded border border-line">
              <Table>
                <THead>
                  <TR>
                    {Object.keys(builderRows[0]).slice(0, 6).map((key) => (
                      <TH key={key}>{key}</TH>
                    ))}
                  </TR>
                </THead>
                <TBody>
                  {builderRows.slice(0, 5).map((row, index) => (
                    <TR key={index}>
                      {Object.keys(builderRows[0]).slice(0, 6).map((key) => (
                        <TD key={key}>{String(row[key] ?? '')}</TD>
                      ))}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
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
