'use client';

import { useQuery } from '@tanstack/react-query';
import { Star, Target } from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar } from '@/components/ui/avatar';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Progress } from '@/components/ui/progress';
import { StatCard } from '@/components/ui/stat-card';

interface GoalRow {
  id: string;
  title: string;
  type: string;
  progress: number;
  status: string;
  employee: { firstName: string; lastName: string };
}

interface FeedbackRow {
  id: string;
  type: string;
  message: string;
  createdAt: string;
  giver: { firstName: string; lastName: string };
  recipient: { firstName: string; lastName: string };
}

export default function PerformancePage() {
  const { data: stats } = useQuery({
    queryKey: ['performance', 'stats'],
    queryFn: () => api.get('/performance/stats').then((r) => r.data),
  });
  const { data: goals } = useQuery({
    queryKey: ['performance', 'goals'],
    queryFn: () => api.get('/performance/goals').then((r) => r.data),
  });
  const { data: feedback } = useQuery({
    queryKey: ['performance', 'feedback'],
    queryFn: () => api.get('/performance/feedback').then((r) => r.data),
  });

  return (
    <div>
      <PageHeader title="Performance" description="Goals, review cycles and feedback" />
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active goals" value={stats?.goals?.active ?? '—'} icon={Target} />
        <StatCard label="Completed" value={stats?.goals?.completed ?? '—'} />
        <StatCard label="At risk" value={stats?.goals?.atRisk ?? '—'} />
        <StatCard label="Avg rating" value={stats?.avgRating ?? '—'} icon={Star}>
          {stats?.activeCycle && (
            <p className="text-[11px] text-ink-muted">
              {stats.activeCycle.name} · {stats.activeCycle.completionPct}% complete
            </p>
          )}
        </StatCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Goals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(goals ?? []).slice(0, 8).map((g: GoalRow) => (
              <div key={g.id}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">{g.title}</p>
                  <Badge variant={statusVariant(g.status)}>{g.status.replace(/_/g, ' ')}</Badge>
                </div>
                <div className="flex items-center gap-3">
                  <Progress value={g.progress} className="flex-1" />
                  <span className="w-9 text-right text-xs text-ink-muted">{g.progress}%</span>
                </div>
                <p className="mt-1 text-[11px] text-ink-muted">
                  {g.employee.firstName} {g.employee.lastName} · {g.type}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent feedback</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(feedback ?? []).slice(0, 6).map((f: FeedbackRow) => (
              <div key={f.id} className="flex gap-3">
                <Avatar name={`${f.giver.firstName} ${f.giver.lastName}`} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">
                      {f.giver.firstName} {f.giver.lastName}
                    </span>{' '}
                    <span className="text-ink-muted">to</span>{' '}
                    <span className="font-medium">
                      {f.recipient.firstName} {f.recipient.lastName}
                    </span>{' '}
                    {f.type === 'PRAISE' && <Badge variant="warning">Praise</Badge>}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-muted">{f.message}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
