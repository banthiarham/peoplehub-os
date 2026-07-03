'use client';

import { useQuery } from '@tanstack/react-query';
import { Award, HeartHandshake, Megaphone } from 'lucide-react';
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

  return (
    <div>
      <PageHeader title="Engagement" description="Pulse surveys and peer recognition" />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Engagement score" value={stats?.engagementScore ?? '—'} icon={HeartHandshake} />
        <StatCard
          label="Survey participation"
          value={stats?.participationRate != null ? `${stats.participationRate}%` : '—'}
          icon={Megaphone}
        />
        <StatCard label="Recognitions this month" value={stats?.recognitionsThisMonth ?? '—'} icon={Award} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recognition wall</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(recognitions?.data ?? []).slice(0, 8).map((r: RecognitionRow) => (
              <div key={r.id} className="flex gap-3">
                <Avatar name={`${r.recipient.firstName} ${r.recipient.lastName}`} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium">
                      {r.recipient.firstName} {r.recipient.lastName}
                    </span>{' '}
                    {r.badge && <Badge variant="warning">{r.badge.replace(/_/g, ' ')}</Badge>}
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

        <Card>
          <CardHeader>
            <CardTitle>Surveys</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(surveys ?? []).map((s: SurveyRow) => (
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
    </div>
  );
}
