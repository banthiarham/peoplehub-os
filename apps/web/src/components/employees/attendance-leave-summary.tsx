'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { EmployeeAttendanceSummary } from '@peoplehub/types';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function AttendanceLeaveSummary({ employeeId }: { employeeId: string }) {
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const { data, isLoading } = useQuery<EmployeeAttendanceSummary>({
    queryKey: ['employees', employeeId, 'attendance-summary', month],
    queryFn: () =>
      api
        .get(`/employees/${employeeId}/attendance-summary`, { params: { month } })
        .then((r) => r.data),
    enabled: !!employeeId,
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
  const attendance = data?.attendance;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary-600" /> Attendance &amp; leave summary
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="outline"
            className="h-7 w-7"
            onClick={() => shift(-1)}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="min-w-[7.5rem] text-center text-xs font-medium text-ink">{label}</span>
          <Button
            size="icon"
            variant="outline"
            className="h-7 w-7"
            onClick={() => shift(1)}
            disabled={isCurrent}
            aria-label="Next month"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !data || !attendance ? (
          <div className="space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-32" />
          </div>
        ) : attendance.expectedWorkingDays === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No working days in this month"
            description="This month falls outside the employee's joining and relieving dates, or is made up entirely of holidays and weekly offs."
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard
                label="Attendance"
                value={
                  attendance.attendancePercentage === null
                    ? '—'
                    : `${attendance.attendancePercentage}%`
                }
              >
                {attendance.expectedWorkingDays} working day
                {attendance.expectedWorkingDays === 1 ? '' : 's'}
                {data.window.clampedToToday ? ' so far' : ''}
              </StatCard>
              <StatCard label="Present" value={attendance.present + attendance.late}>
                {attendance.late} late arrival{attendance.late === 1 ? '' : 's'} included
              </StatCard>
              <StatCard label="Absent" value={attendance.absent}>
                {attendance.missingPunch} missing punch
                {attendance.missingPunch === 1 ? '' : 'es'}
              </StatCard>
              <StatCard label="Half days" value={attendance.halfDay} />
              <StatCard label="Late arrivals" value={attendance.lateArrivals} />
              <StatCard label="Early departures" value={attendance.earlyDepartures} />
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
              <Metric
                label="Days on leave"
                value={`${data.leave.calendarDaysOnLeave} day(s)`}
              />
              <Metric label="Avg work hours" value={`${attendance.avgWorkHours} h`} />
              <Metric
                label="Overtime"
                value={`${Math.round((attendance.overtimeMinutes / 60) * 10) / 10} h`}
              />
              <Metric label="Weekly offs / holidays" value={`${attendance.weeklyOff} / ${attendance.holiday}`} />
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-ink">Leave balance</p>
              {data.leave.balances.length ? (
                <div className="space-y-1.5">
                  {data.leave.balances.map((balance) => (
                    <div
                      key={balance.leaveTypeId}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="min-w-0 truncate">
                        {balance.name}
                        <span className="text-ink-muted"> ({balance.code})</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-ink-muted">
                        {balance.used} used ·{' '}
                        <span className="font-medium text-ink">{balance.balance} left</span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-muted">No leave balances configured.</p>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-ink">Recent leave</p>
              {data.recentLeaveHistory.length ? (
                <div className="space-y-2">
                  {data.recentLeaveHistory.map((request) => (
                    <div key={request.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {request.name} · {request.days} day(s)
                        </p>
                        <p className="text-xs text-ink-muted">
                          {formatDate(request.fromDate)} → {formatDate(request.toDate)}
                        </p>
                      </div>
                      <Badge variant={statusVariant(request.status)}>{request.status}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-muted">No leave requests yet.</p>
              )}
            </div>

            <ul className="space-y-1 border-t border-line/70 pt-3 text-[11px] leading-4 text-ink-faint">
              <li>{data.dataQuality.halfDaySource}</li>
              <li>{data.dataQuality.earlyDepartureSource}</li>
              <li>{data.dataQuality.leaveDaysSource}</li>
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  );
}
