'use client';

import { useQuery } from '@tanstack/react-query';
import { BarChart3, Download, Timer } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

interface TimesheetRow {
  id: string;
  weekStart: string;
  totalHours: number;
  billableHours: number;
  status: string;
  employee: { firstName: string; lastName: string };
  project: { name: string } | null;
}

interface UtilizationProject {
  project: string;
  code: string | null;
  total: number;
  billable: number;
  nonBillable: number;
  revenue: number;
  budgetHours: number | null;
  budgetBurn: number | null;
}

interface UtilizationEmployee {
  employee: string;
  employeeCode: string;
  total: number;
  billable: number;
  utilizationRate: number;
  billableRate: number;
}

export default function TimesheetsPage() {
  const { data: summary } = useQuery({
    queryKey: ['timesheets', 'summary'],
    queryFn: () => api.get('/timesheets/summary').then((r) => r.data),
  });
  const { data } = useQuery({
    queryKey: ['timesheets', 'list'],
    queryFn: () => api.get('/timesheets', { params: { pageSize: 25 } }).then((r) => r.data),
  });
  const { data: utilization } = useQuery({
    queryKey: ['timesheets', 'utilization'],
    queryFn: () => api.get('/timesheets/utilization').then((r) => r.data),
  });

  async function downloadBillingCsv() {
    const res = await api.get('/timesheets/billing/export', { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'timesheet-billing.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        title="Timesheets"
        description="Project hours, utilization, billability and budget burn"
        actions={
          <Button variant="outline" onClick={downloadBillingCsv}>
            <Download className="h-4 w-4" />
            Billing CSV
          </Button>
        }
      />
      <div className="mb-4 grid gap-4 sm:grid-cols-5">
        <StatCard label="Recent hours" value={summary?.totalHours ?? '—'} icon={Timer} />
        <StatCard label="Billable hours" value={summary?.billableHours ?? '—'} />
        <StatCard label="Billable rate" value={summary?.billableRate != null ? `${summary.billableRate}%` : '—'} />
        <StatCard label="Utilization" value={summary?.utilizationRate != null ? `${summary.utilizationRate}%` : '—'} icon={BarChart3} />
        <StatCard label="Capacity" value={summary?.capacityHours ?? '—'} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent timesheets</CardTitle>
          </CardHeader>
          {data?.data?.length ? (
            <Table>
              <THead>
                <TR>
                  <TH>Employee</TH>
                  <TH>Project</TH>
                  <TH>Week</TH>
                  <TH>Hours</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {data.data.map((t: TimesheetRow) => (
                  <TR key={t.id}>
                    <TD>
                      <div className="flex items-center gap-2">
                        <Avatar name={`${t.employee.firstName} ${t.employee.lastName}`} size="sm" />
                        {t.employee.firstName} {t.employee.lastName}
                      </div>
                    </TD>
                    <TD className="text-ink-muted">{t.project?.name ?? '—'}</TD>
                    <TD className="text-ink-muted">{formatDate(t.weekStart)}</TD>
                    <TD className="font-medium">
                      {t.totalHours}h
                      <span className="ml-1 text-xs text-ink-muted">({t.billableHours}h billable)</span>
                    </TD>
                    <TD>
                      <Badge variant={statusVariant(t.status)}>{t.status}</Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <EmptyState icon={Timer} title="No timesheets" />
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Project budget burn</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {(utilization?.projects ?? []).map((p: UtilizationProject) => (
              <div key={p.project} className="rounded-lg border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{p.project}</span>
                  <Badge variant={p.budgetBurn != null && p.budgetBurn > 90 ? 'warning' : 'outline'}>
                    {p.budgetBurn ?? '—'}%
                  </Badge>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-ink-muted">
                  <span>{p.total}h total</span>
                  <span>{p.billable}h billable</span>
                  <span>₹{Math.round(p.revenue).toLocaleString('en-IN')}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Employee utilization</CardTitle>
        </CardHeader>
        <Table>
          <THead>
            <TR>
              <TH>Employee</TH>
              <TH>Total</TH>
              <TH>Billable</TH>
              <TH>Utilization</TH>
              <TH>Billable rate</TH>
            </TR>
          </THead>
          <TBody>
            {(utilization?.employees ?? []).map((row: UtilizationEmployee) => (
              <TR key={row.employeeCode}>
                <TD>
                  <div className="flex items-center gap-2">
                    <Avatar name={row.employee} size="sm" />
                    <div>
                      <p className="font-medium">{row.employee}</p>
                      <p className="text-xs text-ink-muted">{row.employeeCode}</p>
                    </div>
                  </div>
                </TD>
                <TD>{row.total}h</TD>
                <TD>{row.billable}h</TD>
                <TD>
                  <Badge variant={row.utilizationRate >= 80 ? 'success' : 'warning'}>{row.utilizationRate}%</Badge>
                </TD>
                <TD>
                  <Badge variant={row.billableRate >= 70 ? 'success' : 'outline'}>{row.billableRate}%</Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
