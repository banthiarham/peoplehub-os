'use client';

import { useQuery } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Progress } from '@/components/ui/progress';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

interface OnboardingRow {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  joiningDate: string | null;
  status: string;
  department: { name: string } | null;
  designation: { name: string } | null;
  progress: { done: number; total: number };
}

interface ExitRow {
  id: string;
  resignationDate: string;
  lastWorkingDate: string;
  reason: string | null;
  status: string;
  employee: { firstName: string; lastName: string; department: { name: string } | null };
}

export default function OnboardingPage() {
  const { data: active } = useQuery({
    queryKey: ['onboarding', 'active'],
    queryFn: () => api.get('/onboarding').then((r) => r.data),
  });
  const { data: exits } = useQuery({
    queryKey: ['onboarding', 'exits'],
    queryFn: () => api.get('/onboarding/exits').then((r) => r.data),
  });

  return (
    <div>
      <PageHeader title="Onboarding & Exits" description="New joiners and offboarding" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent joiners (90 days)</CardTitle>
          </CardHeader>
          {active?.length ? (
            <Table>
              <THead>
                <TR>
                  <TH>Employee</TH>
                  <TH>Joined</TH>
                  <TH>Tasks</TH>
                </TR>
              </THead>
              <TBody>
                {active.map((e: OnboardingRow) => (
                  <TR key={e.id}>
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={`${e.firstName} ${e.lastName}`} size="sm" />
                        <span>
                          <span className="block font-medium">
                            {e.firstName} {e.lastName}
                          </span>
                          <span className="block text-xs text-ink-muted">
                            {e.designation?.name ?? '—'} · {e.department?.name ?? '—'}
                          </span>
                        </span>
                      </div>
                    </TD>
                    <TD className="text-ink-muted">{formatDate(e.joiningDate)}</TD>
                    <TD className="w-32">
                      {e.progress.total > 0 ? (
                        <div className="flex items-center gap-2">
                          <Progress value={(e.progress.done / e.progress.total) * 100} className="flex-1" />
                          <span className="text-xs text-ink-muted">
                            {e.progress.done}/{e.progress.total}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-ink-faint">No tasks</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <EmptyState icon={UserPlus} title="No active onboardings" />
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Exit requests</CardTitle>
          </CardHeader>
          {exits?.length ? (
            <Table>
              <THead>
                <TR>
                  <TH>Employee</TH>
                  <TH>Last working day</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {exits.map((x: ExitRow) => (
                  <TR key={x.id}>
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={`${x.employee.firstName} ${x.employee.lastName}`} size="sm" />
                        {x.employee.firstName} {x.employee.lastName}
                      </div>
                    </TD>
                    <TD className="text-ink-muted">{formatDate(x.lastWorkingDate)}</TD>
                    <TD>
                      <Badge variant={statusVariant(x.status)}>{x.status}</Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <EmptyState icon={UserPlus} title="No exit requests" description="Nobody is offboarding right now." />
          )}
        </Card>
      </div>
    </div>
  );
}
