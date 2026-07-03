'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Check, X } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

interface LeaveRow {
  id: string;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string | null;
  status: string;
  employee: { firstName: string; lastName: string; employeeCode: string; department: { name: string } | null };
  leaveType: { name: string; code: string };
}

export default function LeavePage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('PENDING');

  const { data: stats } = useQuery({
    queryKey: ['leave', 'stats'],
    queryFn: () => api.get('/leave/stats').then((r) => r.data),
  });
  const { data, isLoading } = useQuery({
    queryKey: ['leave', 'requests', status],
    queryFn: () =>
      api.get('/leave/requests', { params: { status: status || undefined, pageSize: 25 } }).then((r) => r.data),
  });

  const decide = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      api.patch(`/leave/requests/${id}/${action}`, {}),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['leave'] }),
  });

  return (
    <div>
      <PageHeader title="Leave" description="Requests, balances and team calendar" />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Pending requests" value={stats?.pendingCount ?? '—'} icon={CalendarDays} />
        <StatCard label="On leave today" value={stats?.onLeaveToday ?? '—'} />
        <StatCard label="Upcoming this week" value={stats?.upcomingThisWeek ?? '—'} />
      </div>

      <Card>
        <div className="flex items-center gap-3 border-b border-line p-4">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="">All</option>
          </Select>
        </div>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : data?.data?.length ? (
          <Table>
            <THead>
              <TR>
                <TH>Employee</TH>
                <TH>Type</TH>
                <TH>Dates</TH>
                <TH>Days</TH>
                <TH>Reason</TH>
                <TH>Status</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {data.data.map((r: LeaveRow) => (
                <TR key={r.id}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <Avatar name={`${r.employee.firstName} ${r.employee.lastName}`} size="sm" />
                      <span>
                        <span className="block font-medium">
                          {r.employee.firstName} {r.employee.lastName}
                        </span>
                        <span className="block text-xs text-ink-muted">
                          {r.employee.department?.name ?? '—'}
                        </span>
                      </span>
                    </div>
                  </TD>
                  <TD>
                    <Badge variant="violet">{r.leaveType.code}</Badge>
                  </TD>
                  <TD className="text-ink-muted">
                    {formatDate(r.fromDate)} → {formatDate(r.toDate)}
                  </TD>
                  <TD className="font-medium">{r.days}</TD>
                  <TD className="max-w-48 truncate text-ink-muted">{r.reason ?? '—'}</TD>
                  <TD>
                    <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                  </TD>
                  <TD>
                    {r.status === 'PENDING' && (
                      <div className="flex gap-1.5">
                        <Button
                          size="icon"
                          variant="secondary"
                          className="h-7 w-7"
                          onClick={() => decide.mutate({ id: r.id, action: 'approve' })}
                          aria-label="Approve"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7 text-danger"
                          onClick={() => decide.mutate({ id: r.id, action: 'reject' })}
                          aria-label="Reject"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState icon={CalendarDays} title="No leave requests" description="Nothing here for this filter." />
        )}
      </Card>
    </div>
  );
}
