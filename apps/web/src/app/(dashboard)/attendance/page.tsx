'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, LogIn, LogOut } from 'lucide-react';
import { api } from '@/lib/api';
import { formatTime } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

interface TodayRow {
  employee: { id: string; firstName: string; lastName: string; employeeCode: string; department: { name: string } | null };
  status: string;
  punchIn: string | null;
  punchOut: string | null;
  workingMinutes: number | null;
}

export default function AttendancePage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['attendance', 'today'],
    queryFn: () => api.get('/attendance/today').then((r) => r.data),
  });

  const checkIn = useMutation({
    mutationFn: () => api.post('/attendance/check-in'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['attendance'] }),
  });
  const checkOut = useMutation({
    mutationFn: () => api.post('/attendance/check-out'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['attendance'] }),
  });

  return (
    <div>
      <PageHeader
        title="Attendance"
        description="Live team attendance for today"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => checkOut.mutate()} disabled={checkOut.isPending}>
              <LogOut className="h-3.5 w-3.5" /> Check out
            </Button>
            <Button size="sm" onClick={() => checkIn.mutate()} disabled={checkIn.isPending}>
              <LogIn className="h-3.5 w-3.5" /> Check in
            </Button>
          </>
        }
      />
      {(checkIn.isError || checkOut.isError) && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-danger">
          {((checkIn.error ?? checkOut.error) as { response?: { data?: { message?: string } } })?.response?.data
            ?.message ?? 'Action failed'}
        </p>
      )}

      {isLoading || !data ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Present" value={data.summary.present} icon={Clock} />
            <StatCard label="Late" value={data.summary.late} />
            <StatCard label="On leave" value={data.summary.onLeave} />
            <StatCard label="Absent" value={data.summary.absent} />
          </div>
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>Employee</TH>
                  <TH>Department</TH>
                  <TH>Check in</TH>
                  <TH>Check out</TH>
                  <TH>Hours</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {data.rows.map((r: TodayRow) => (
                  <TR key={r.employee.id}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <Avatar name={`${r.employee.firstName} ${r.employee.lastName}`} size="sm" />
                        <span>
                          <span className="block font-medium">
                            {r.employee.firstName} {r.employee.lastName}
                          </span>
                          <span className="block text-xs text-ink-muted">{r.employee.employeeCode}</span>
                        </span>
                      </div>
                    </TD>
                    <TD className="text-ink-muted">{r.employee.department?.name ?? '—'}</TD>
                    <TD>{formatTime(r.punchIn)}</TD>
                    <TD>{formatTime(r.punchOut)}</TD>
                    <TD className="text-ink-muted">
                      {r.workingMinutes ? `${Math.floor(r.workingMinutes / 60)}h ${r.workingMinutes % 60}m` : '—'}
                    </TD>
                    <TD>
                      <Badge variant={statusVariant(r.status)}>{r.status.replace(/_/g, ' ')}</Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  );
}
