'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { PeopleApplyLeaveDialog } from '@/components/forms/people-apply-leave-dialog';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

interface BalanceRow {
  id: string;
  balance: number;
  used: number;
  leaveType: { id: string; name: string; code: string };
}

interface RequestRow {
  id: string;
  fromDate: string;
  toDate: string;
  days: number;
  status: string;
  reason: string | null;
  leaveType: { name: string; code: string };
}

export default function MyLeavePage() {
  const { data: balances, isLoading: loadingBalances } = useQuery<BalanceRow[]>({
    queryKey: ['leave', 'my-balances'],
    queryFn: () => api.get('/leave/balances/me').then((r) => r.data),
  });
  const { data: requests, isLoading: loadingRequests } = useQuery<RequestRow[]>({
    queryKey: ['leave', 'my-requests'],
    queryFn: () => api.get('/leave/requests/me').then((r) => r.data),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">My leave</h1>
        <PeopleApplyLeaveDialog />
      </div>

      {loadingBalances ? (
        <Skeleton className="h-20" />
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {balances?.map((b) => (
            <Card key={b.id} className="p-3 text-center">
              <p className="text-lg font-semibold tabular-nums">{b.balance}</p>
              <p className="text-[10px] text-ink-muted">{b.leaveType.code} left</p>
            </Card>
          ))}
        </div>
      )}

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
          Requests
        </p>
        {loadingRequests ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : requests?.length ? (
          <div className="space-y-2">
            {requests.map((r) => (
              <Card key={r.id} className="flex items-center justify-between p-3.5">
                <div>
                  <p className="text-sm font-medium">
                    {r.leaveType.name} · {r.days} day{r.days === 1 ? '' : 's'}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {formatDate(r.fromDate)} → {formatDate(r.toDate)}
                    {r.reason ? ` · ${r.reason}` : ''}
                  </p>
                </div>
                <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={CalendarDays}
            title="No requests yet"
            description="Apply for leave and it will show up here."
          />
        )}
      </div>
    </div>
  );
}
