'use client';

import { useQuery } from '@tanstack/react-query';
import { Code2, KeyRound, Webhook } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';

interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

interface WebhookRow {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  _count: { deliveries: number };
}

export default function DeveloperPage() {
  const { data: stats } = useQuery({
    queryKey: ['developer', 'stats'],
    queryFn: () => api.get('/developer/stats').then((r) => r.data),
  });
  const { data: keys } = useQuery({
    queryKey: ['developer', 'api-keys'],
    queryFn: () => api.get('/developer/api-keys').then((r) => r.data),
  });
  const { data: webhooks } = useQuery({
    queryKey: ['developer', 'webhooks'],
    queryFn: () => api.get('/developer/webhooks').then((r) => r.data),
  });

  return (
    <div>
      <PageHeader
        title="Developer"
        description="API keys, webhooks and the PeopleHub API ecosystem — full docs at /api/docs"
      />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Active API keys" value={stats?.activeKeys ?? '—'} icon={KeyRound} />
        <StatCard label="API requests (30d)" value={stats?.requests30d ?? '—'} icon={Code2} />
        <StatCard
          label="Webhook success rate"
          value={stats?.webhookSuccessRate != null ? `${stats.webhookSuccessRate}%` : '—'}
          icon={Webhook}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>API keys</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(keys ?? []).map((k: ApiKeyRow) => (
              <div key={k.id} className="rounded-xl border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{k.name}</p>
                  <Badge variant={k.isActive ? 'success' : 'destructive'}>
                    {k.isActive ? 'Active' : 'Revoked'}
                  </Badge>
                </div>
                <p className="mt-1 font-mono text-xs text-ink-muted">{k.keyPrefix}••••••••••••</p>
                <p className="mt-1 text-[11px] text-ink-faint">
                  {k.scopes.join(', ')} · created {formatDate(k.createdAt)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Webhooks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(webhooks ?? []).map((w: WebhookRow) => (
              <div key={w.id} className="rounded-xl border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-mono text-xs">{w.url}</p>
                  <Badge variant={w.isActive ? 'success' : 'outline'}>
                    {w.isActive ? 'Active' : 'Paused'}
                  </Badge>
                </div>
                <p className="mt-1.5 flex flex-wrap gap-1">
                  {w.events.map((e) => (
                    <Badge key={e} variant="outline" className="text-[10px]">
                      {e}
                    </Badge>
                  ))}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
