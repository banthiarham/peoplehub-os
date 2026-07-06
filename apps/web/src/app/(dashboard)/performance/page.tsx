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
  keyResults?: Array<{ title: string; current?: number; target?: number; unit?: string; status?: string }>;
  employee: { firstName: string; lastName: string };
}

interface ReviewCycleRow {
  id: string;
  name: string;
  status: string;
  completionPct: number;
  questions?: Array<{ id: string; label: string; type?: string; competency?: string; required?: boolean }>;
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
  const { data: cycles } = useQuery({
    queryKey: ['performance', 'cycles'],
    queryFn: () => api.get('/performance/cycles').then((r) => r.data as ReviewCycleRow[]),
  });

  const activeCycle = (cycles ?? []).find((cycle) => cycle.status === 'ACTIVE') ?? cycles?.[0];

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
                {!!g.keyResults?.length && (
                  <div className="mt-2 space-y-1 rounded border border-line bg-canvas p-2">
                    {g.keyResults.slice(0, 3).map((kr) => (
                      <div key={kr.title} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="truncate text-ink-muted">{kr.title}</span>
                        <span className="shrink-0 tabular-nums text-ink">
                          {kr.current ?? 0}
                          {kr.target ? ` / ${kr.target}` : ''}
                          {kr.unit ? ` ${kr.unit}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Review questionnaire</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeCycle ? (
              <>
                <div>
                  <p className="text-sm font-medium">{activeCycle.name}</p>
                  <p className="text-xs text-ink-muted">{activeCycle.completionPct}% complete</p>
                </div>
                {(activeCycle.questions ?? []).slice(0, 6).map((question) => (
                  <div key={question.id} className="rounded border border-line p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{question.label}</p>
                      <Badge variant="outline">{question.type ?? 'TEXT'}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">
                      {question.competency ?? 'General'} {question.required ? '· Required' : ''}
                    </p>
                  </div>
                ))}
              </>
            ) : (
              <p className="text-sm text-ink-muted">No review cycle configured.</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent feedback</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
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
