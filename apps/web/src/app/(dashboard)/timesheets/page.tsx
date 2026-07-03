'use client';

import { useQuery } from '@tanstack/react-query';
import { Timer } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Badge, statusVariant } from '@/components/ui/badge';
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

export default function TimesheetsPage() {
  const { data: summary } = useQuery({
    queryKey: ['timesheets', 'summary'],
    queryFn: () => api.get('/timesheets/summary').then((r) => r.data),
  });
  const { data } = useQuery({
    queryKey: ['timesheets', 'list'],
    queryFn: () => api.get('/timesheets', { params: { pageSize: 25 } }).then((r) => r.data),
  });

  return (
    <div>
      <PageHeader title="Timesheets" description="Project hours and utilization" />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Hours this month" value={summary?.totalHours ?? '—'} icon={Timer} />
        <StatCard label="Billable hours" value={summary?.billableHours ?? '—'} />
        <StatCard label="Projects" value={summary?.byProject?.length ?? '—'} />
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
                    <TD className="font-medium">{t.totalHours}h</TD>
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
            <CardTitle>By project (this month)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {(summary?.byProject ?? []).map((p: { project: string; total: number; billable: number }) => (
              <div key={p.project} className="flex items-center justify-between">
                <span className="text-ink-muted">{p.project}</span>
                <span className="font-medium">{p.total}h</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
