'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { formatDate, formatTime } from '@/lib/utils';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import {
  compOffDisplayState,
  compOffDurationLabel,
  compOffStateLabel,
} from '@/lib/comp-off';

/** One of the caller's own Comp-Off grants, as `GET /attendance/comp-offs` returns it. */
interface MyCompOffRow {
  id: string;
  earnedDate: string;
  days: number;
  expiresAt: string | null;
  usedOnDate: string | null;
  status: string;
  paidInPayrollRunId: string | null;
  /** Whether this grant's expiry date binds, per the policy at its own employee's location. */
  expiryEnforced: boolean;
}

interface RecordRow {
  id: string;
  date: string;
  status: string;
  punchIn: string | null;
  punchOut: string | null;
  workingMinutes: number | null;
  geoAccuracy: number | null;
  punchSource: string | null;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function MyAttendancePage() {
  const [month, setMonth] = useState(() => monthKey(new Date()));

  const { data, isLoading } = useQuery({
    queryKey: ['attendance', 'my-month', month],
    queryFn: () => api.get(`/attendance/me?month=${month}`).then((r) => r.data),
  });

  const shift = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    setMonth(monthKey(new Date(y, m - 1 + delta, 1)));
  };
  const label = new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
  const isCurrent = month === monthKey(new Date());

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">My attendance</h1>

      <div className="flex items-center justify-between">
        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8"
          onClick={() => shift(-1)}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <p className="text-sm font-medium">{label}</p>
        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8"
          onClick={() => shift(1)}
          disabled={isCurrent}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {data?.summary && (
        <div className="grid grid-cols-4 gap-2">
          <Mini label="Present" value={data.summary.present} />
          <Mini label="Late" value={data.summary.late} />
          <Mini label="Absent" value={data.summary.absent} />
          <Mini label="Avg hrs" value={data.summary.avgWorkHours} />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : data?.records?.length ? (
        <div className="space-y-2">
          {data.records.map((r: RecordRow) => (
            <Card key={r.id} className="flex items-center justify-between p-3.5">
              <div>
                <p className="text-sm font-medium">{formatDate(r.date)}</p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {r.punchIn
                    ? `${formatTime(r.punchIn)} → ${r.punchOut ? formatTime(r.punchOut) : '…'}`
                    : '—'}
                  {r.workingMinutes != null && ` · ${(r.workingMinutes / 60).toFixed(1)}h`}
                  {r.punchSource === 'GPS' &&
                    r.geoAccuracy != null &&
                    ` · GPS ±${Math.round(r.geoAccuracy)}m`}
                </p>
              </div>
              <Badge variant={statusVariant(r.status)}>{r.status.replace(/_/g, ' ')}</Badge>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Clock}
          title="No records"
          description="Nothing recorded for this month."
        />
      )}

      <MyCompOffs />
    </div>
  );
}

/**
 * The employee's own Comp-Off credits, read-only.
 *
 * `GET /attendance/comp-offs` already scopes to the caller's own grants for anyone without a
 * ledger role, so this needs no new endpoint and no new authorization: the same request an
 * administrator makes returns only this employee's rows here. Added to the existing attendance
 * page rather than a route of its own - it is attendance information, the page already carries
 * the `attendance:read` scope the endpoint wants, and a new tab would need a nav entry nobody
 * asked for.
 *
 * Deliberately read-only. Crediting, using and cancelling all run through checks (eligible
 * shift, finalized absence of matching duration, payroll period open) that belong to the
 * administrative ledger; an employee-facing request workflow is a larger change than showing a
 * balance, and is not part of this work.
 *
 * Not shown month by month: a grant earned in one month is often spent or paid in another, so
 * filtering to the selected month would hide exactly the rows an employee is looking for.
 */
function MyCompOffs() {
  const { data, isLoading } = useQuery({
    queryKey: ['attendance', 'my-comp-offs'],
    queryFn: () => api.get('/attendance/comp-offs').then((r) => r.data as MyCompOffRow[]),
  });
  if (isLoading) return <Skeleton className="h-24" />;
  if (!data?.length) return null;

  // `expiryEnforced` arrives per grant, resolved by the API from the policy at that grant's own
  // location. That also means this view no longer asks for payroll policy at all - which an
  // employee has no business reading, and which could only ever have given the tenant default.
  const states = data.map((grant) => ({
    grant,
    state: compOffDisplayState(grant, { expiryEnforced: grant.expiryEnforced }),
  }));
  const available = states.filter((row) => row.state === 'AVAILABLE');
  const remaining = available.reduce((sum, row) => sum + row.grant.days, 0);

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold tracking-tight">My Comp-Off</h2>
        <p className="text-xs text-ink-muted">
          {/* Rounded because fractional days accumulate: three halves is 1.5, not 1.4999…. */}
          {Math.round(remaining * 100) / 100} day(s) available
        </p>
      </div>
      <div className="space-y-2">
        {states.map(({ grant, state }) => (
          <Card key={grant.id} className="flex items-center justify-between p-3.5">
            <div>
              <p className="text-sm font-medium">{compOffDurationLabel(grant.days)}</p>
              <p className="mt-0.5 text-xs text-ink-muted">
                Earned {formatDate(grant.earnedDate)}
                {grant.usedOnDate && ` · used on ${formatDate(grant.usedOnDate)}`}
                {state === 'AVAILABLE' &&
                  grant.expiresAt &&
                  ` · expires ${formatDate(grant.expiresAt)}`}
              </p>
            </div>
            <Badge variant={statusVariant(state === 'PAID' ? 'APPROVED' : state)}>
              {compOffStateLabel(state)}
            </Badge>
          </Card>
        ))}
      </div>
    </section>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-2.5 text-center">
      <p className="text-base font-semibold tabular-nums">{value}</p>
      <p className="text-[10px] text-ink-muted">{label}</p>
    </Card>
  );
}
