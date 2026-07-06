'use client';

import { useQuery } from '@tanstack/react-query';
import { Award, BarChart3, HeartHandshake, Megaphone, Trophy } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';

interface RecognitionRow {
  id: string;
  badge: string | null;
  message: string;
  points: number;
  createdAt: string;
  giver: { firstName: string; lastName: string };
  recipient: { firstName: string; lastName: string; designation: { name: string } | null };
}

interface SurveyRow {
  id: string;
  title: string;
  type: string;
  status: string;
  _count: { responses: number };
}

interface SurveyAnalyticsRow {
  id: string;
  title: string;
  status: string;
  responses: number;
  participationRate: number;
  avgScaleScore: number | null;
  enps: number | null;
}

interface FeedItem {
  id: string;
  type: 'ANNOUNCEMENT' | 'RECOGNITION' | 'POLL';
  title: string;
  body: string;
  badge?: string | null;
  points?: number;
  from?: string;
  responses?: number;
  audience?: string;
  createdAt: string;
}

interface LeaderboardRow {
  employeeId: string;
  employee: string;
  employeeCode: string;
  designation: string | null;
  department: string | null;
  recognitions: number;
  points: number;
}

export default function EngagementPage() {
  const { data: stats } = useQuery({
    queryKey: ['engagement', 'stats'],
    queryFn: () => api.get('/engagement/stats').then((r) => r.data),
  });
  const { data: recognitions } = useQuery({
    queryKey: ['engagement', 'recognitions'],
    queryFn: () => api.get('/engagement/recognitions').then((r) => r.data),
  });
  const { data: surveys } = useQuery({
    queryKey: ['engagement', 'surveys'],
    queryFn: () => api.get('/engagement/surveys').then((r) => r.data),
  });
  const { data: surveyAnalytics } = useQuery({
    queryKey: ['engagement', 'survey-analytics'],
    queryFn: () => api.get('/engagement/surveys/analytics').then((r) => r.data as SurveyAnalyticsRow[]),
  });
  const { data: feed } = useQuery({
    queryKey: ['engagement', 'feed'],
    queryFn: () => api.get('/engagement/feed').then((r) => r.data as FeedItem[]),
  });
  const { data: rewards } = useQuery({
    queryKey: ['engagement', 'rewards'],
    queryFn: () => api.get('/engagement/rewards/leaderboard').then((r) => r.data),
  });

  return (
    <div>
      <PageHeader title="Engagement" description="Announcements, pulse surveys, polls and peer rewards" />
      <div className="mb-4 grid gap-4 sm:grid-cols-5">
        <StatCard label="Engagement score" value={stats?.engagementScore ?? '—'} icon={HeartHandshake} />
        <StatCard
          label="Survey participation"
          value={stats?.participationRate != null ? `${stats.participationRate}%` : '—'}
          icon={Megaphone}
        />
        <StatCard label="Recognitions this month" value={stats?.recognitionsThisMonth ?? '—'} icon={Award} />
        <StatCard label="Reward points" value={stats?.pointsThisMonth ?? '—'} icon={Trophy} />
        <StatCard label="Active polls" value={stats?.activePolls ?? '—'} icon={BarChart3} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Company feed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(feed ?? []).slice(0, 10).map((item) => (
              <div key={`${item.type}-${item.id}`} className="flex gap-3 rounded-lg border border-line p-3">
                <Avatar name={item.title} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{item.title}</p>
                    <Badge variant={item.type === 'ANNOUNCEMENT' ? 'info' : item.type === 'POLL' ? 'violet' : 'warning'}>
                      {item.type.replace('_', ' ')}
                    </Badge>
                    {item.badge && <Badge variant="outline">{item.badge.replace(/_/g, ' ')}</Badge>}
                    {item.points != null && <Badge variant="success">+{item.points} pts</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">{item.body}</p>
                  <p className="mt-0.5 text-[11px] text-ink-faint">
                    {item.from ? `from ${item.from} · ` : ''}
                    {item.responses != null ? `${item.responses} responses · ` : ''}
                    {item.audience ? `${item.audience} · ` : ''}
                    {formatDate(item.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Survey analytics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(surveyAnalytics ?? []).map((s) => (
              <div key={s.id} className="rounded-xl border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{s.title}</p>
                  <Badge variant={s.status === 'ACTIVE' ? 'success' : 'outline'}>{s.status}</Badge>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                  <span className="rounded bg-canvas p-2">
                    <b className="block text-ink">{s.participationRate}%</b>
                    <span className="text-ink-muted">Part.</span>
                  </span>
                  <span className="rounded bg-canvas p-2">
                    <b className="block text-ink">{s.avgScaleScore ?? '—'}</b>
                    <span className="text-ink-muted">Avg</span>
                  </span>
                  <span className="rounded bg-canvas p-2">
                    <b className="block text-ink">{s.enps ?? '—'}</b>
                    <span className="text-ink-muted">eNPS</span>
                  </span>
                </div>
              </div>
            ))}
            {!(surveyAnalytics ?? []).length &&
              (surveys ?? []).map((s: SurveyRow) => (
                <div key={s.id} className="rounded-xl border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{s.title}</p>
                    <Badge variant={s.status === 'ACTIVE' ? 'success' : 'outline'}>{s.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    {s.type} · {s._count.responses} responses
                  </p>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Reward leaderboard</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(rewards?.monthly ?? []).map((row: LeaderboardRow, index: number) => (
              <div key={row.employeeId} className="flex items-center justify-between rounded-lg border border-line p-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{row.employee}</p>
                    <p className="text-xs text-ink-muted">
                      {row.department ?? 'Team'} · {row.recognitions} recognitions
                    </p>
                  </div>
                </div>
                <Badge variant="success">{row.points} pts</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recognition wall</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(recognitions?.data ?? []).slice(0, 6).map((r: RecognitionRow) => (
              <div key={r.id} className="flex gap-3">
                <Avatar name={`${r.recipient.firstName} ${r.recipient.lastName}`} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium">
                      {r.recipient.firstName} {r.recipient.lastName}
                    </span>{' '}
                    {r.badge && <Badge variant="warning">{r.badge.replace(/_/g, ' ')}</Badge>}{' '}
                    <Badge variant="success">+{r.points} pts</Badge>
                  </p>
                  <p className="mt-0.5 text-sm text-ink-muted">“{r.message}”</p>
                  <p className="mt-0.5 text-[11px] text-ink-faint">
                    from {r.giver.firstName} {r.giver.lastName} · {formatDate(r.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
