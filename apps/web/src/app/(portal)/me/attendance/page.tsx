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
    </div>
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
