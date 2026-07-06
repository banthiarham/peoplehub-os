'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, TableProperties, TrendingDown, UserMinus, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
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
import { Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

interface EmployeeStats {
  total: number;
  active: number;
  onNotice: number;
  exited: number;
  newThisMonth: number;
  byDepartment: Array<{ department: string; count: number }>;
}

interface TrendPoint {
  month: string;
  headcount: number;
  joins: number;
  exits: number;
}

interface AttritionData {
  monthly: Array<{ month: string; headcount: number; exits: number; attritionPct: number }>;
  byDepartment: Array<{ name: string; exits: number }>;
}

interface NameValue {
  name: string;
  value: number;
}

interface Demographics {
  gender: NameValue[];
  ageBuckets: NameValue[];
  tenureBuckets: NameValue[];
  byLocation: NameValue[];
}

const AGE_ORDER = ['<25', '25-34', '35-44', '45-54', '55+'];
const TENURE_ORDER = ['<1y', '1-3y', '3-5y', '5y+'];

function sortByOrder(items: NameValue[], order: string[]): NameValue[] {
  return [...items].sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
}

export default function ReportsPage() {
  const [report, setReport] = useState('employees');
  const { data: stats } = useQuery<EmployeeStats>({
    queryKey: ['employees', 'stats'],
    queryFn: () => api.get('/employees/stats').then((r) => r.data),
  });
  const { data: trend } = useQuery<TrendPoint[]>({
    queryKey: ['analytics', 'headcount-trend'],
    queryFn: () => api.get('/analytics/headcount-trend?months=12').then((r) => r.data),
  });
  const { data: attrition } = useQuery<AttritionData>({
    queryKey: ['analytics', 'attrition'],
    queryFn: () => api.get('/analytics/attrition').then((r) => r.data),
  });
  const { data: demographics } = useQuery<Demographics>({
    queryKey: ['analytics', 'demographics'],
    queryFn: () => api.get('/analytics/demographics').then((r) => r.data),
  });
  const { data: builderRows } = useQuery<Array<Record<string, unknown>>>({
    queryKey: ['analytics', 'report-builder', report],
    queryFn: () => api.get('/analytics/reports/builder', { params: { report } }).then((r) => r.data),
  });

  const loading = !stats || !trend || !attrition || !demographics;

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Analytics"
        description="Workforce trends, attrition, and demographics across the organization."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TableProperties className="h-4 w-4 text-primary-600" /> Report builder
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={report} onChange={(event) => setReport(event.target.value)} className="w-56">
              <option value="employees">Employees</option>
              <option value="attendance">Attendance</option>
              <option value="payroll">Payroll</option>
              <option value="expenses">Expenses</option>
              <option value="tickets">Helpdesk tickets</option>
            </Select>
            <Button
              variant="outline"
              onClick={() =>
                downloadFile(`/analytics/reports/builder/export?report=${report}`, `${report}-report.csv`)
              }
            >
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
        <StatCard label="Total employees" value={stats.total} icon={Users} />
        <StatCard label="Active" value={stats.active} icon={Users} />
        <StatCard
          label="New this month"
          value={stats.newThisMonth}
          icon={UserPlus}
          delta={{ value: `+${stats.newThisMonth}`, positive: true, caption: 'joined' }}
        />
        <StatCard label="Exited" value={stats.exited} icon={UserMinus} />
      </div>

      <Card>
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
              <Line
                dataKey="headcount"
                name="Headcount"
                type="monotone"
                stroke={CHART_COLORS[0]}
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Monthly attrition rate</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={attrition.monthly} barSize={20}>
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis
                  tickFormatter={(v: number) => `${v}%`}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  width={40}
                />
                <Tooltip
                  formatter={(v) => [`${v}%`, 'Attrition']}
                  cursor={{ fill: '#F0F7F4' }}
                />
                <Bar dataKey="attritionPct" fill={CHART_COLORS[1]} radius={[5, 5, 0, 0]} />
              </BarChart>
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
              <EmptyState title="No exits" description="No exits recorded in the last 12 months." />
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DonutCard title="Gender" data={demographics.gender} />
        <BucketBarCard title="Age distribution" data={sortByOrder(demographics.ageBuckets, AGE_ORDER)} colorIndex={2} />
        <BucketBarCard
          title="Tenure distribution"
          data={sortByOrder(demographics.tenureBuckets, TENURE_ORDER)}
          colorIndex={5}
        />
        <DonutCard title="By location" data={demographics.byLocation} />
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
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={45}
                outerRadius={70}
                paddingAngle={2}
              >
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

function BucketBarCard({
  title,
  data,
  colorIndex,
}: {
  title: string;
  data: NameValue[];
  colorIndex: number;
}) {
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
