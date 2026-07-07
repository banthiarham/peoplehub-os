'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Code2, KeyRound, RefreshCcw, Webhook } from 'lucide-react';
import { api } from '@/lib/api';
import { downloadFile } from '@/lib/download';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useToast } from '@/components/ui/toaster';

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

interface OAuthRow {
  id: string;
  name: string;
  clientId: string;
  redirectUris: string[];
  scopes: string[];
  isActive: boolean;
  createdAt: string;
}

export default function DeveloperPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<'keys' | 'oauth' | 'webhooks' | 'logs' | 'marketplace' | 'sandbox' | 'docs'>('keys');
  const [keyName, setKeyName] = useState('Internal product key');
  const [keyScopes, setKeyScopes] = useState('employees:read,organization:read,attendance:read,leave:read,payroll:read,workflow:read,helpdesk:read,notifications:read');
  const [oauthName, setOauthName] = useState('Founder Product App');
  const [oauthScopes, setOauthScopes] = useState('employees.read,organization.read,attendance.read');
  const [redirectUris, setRedirectUris] = useState('https://app.example.com/oauth/callback');
  const [webhookUrl, setWebhookUrl] = useState('https://httpbin.org/post');
  const [webhookEvents, setWebhookEvents] = useState('employee.created,leave.approved,payroll.payslips_published');
  const [selectedWebhookId, setSelectedWebhookId] = useState('');
  const [sampleEventType, setSampleEventType] = useState('employee.created');

  const { data: stats } = useQuery({
    queryKey: ['developer', 'stats'],
    queryFn: () => api.get('/developer/stats').then((r) => r.data),
  });
  const { data: keys } = useQuery<ApiKeyRow[]>({
    queryKey: ['developer', 'api-keys'],
    queryFn: () => api.get('/developer/api-keys').then((r) => r.data),
  });
  const { data: oauthApps } = useQuery<OAuthRow[]>({
    queryKey: ['developer', 'oauth-apps'],
    queryFn: () => api.get('/developer/oauth-apps').then((r) => r.data),
  });
  const { data: webhooks } = useQuery<WebhookRow[]>({
    queryKey: ['developer', 'webhooks'],
    queryFn: () => api.get('/developer/webhooks').then((r) => r.data),
  });
  const { data: logs } = useQuery({
    queryKey: ['developer', 'request-logs'],
    queryFn: () => api.get('/developer/request-logs').then((r) => r.data),
  });
  const { data: events } = useQuery<Record<string, string[]>>({
    queryKey: ['developer', 'events'],
    queryFn: () => api.get('/developer/events').then((r) => r.data),
  });
  const { data: sandbox } = useQuery({
    queryKey: ['developer', 'sandbox'],
    queryFn: () => api.get('/developer/sandbox').then((r) => r.data),
  });
  const { data: deliveries } = useQuery({
    queryKey: ['developer', 'deliveries', selectedWebhookId],
    queryFn: () => (selectedWebhookId ? api.get(`/developer/webhooks/${selectedWebhookId}/deliveries`).then((r) => r.data) : Promise.resolve(null)),
    enabled: Boolean(selectedWebhookId),
  });

  const eventList = useMemo(() => Object.values(events ?? {}).flat(), [events]);

  const createKey = useMutation({
    mutationFn: async () =>
      api.post('/developer/api-keys', {
        name: keyName,
        scopes: keyScopes.split(',').map((s) => s.trim()).filter(Boolean),
      }),
    onSuccess: async (response) => {
      toast(`API key created: ${response.data.key}`, 'success');
      await queryClient.invalidateQueries({ queryKey: ['developer', 'api-keys'] });
    },
  });

  const createOauth = useMutation({
    mutationFn: async () =>
      api.post('/developer/oauth-apps', {
        name: oauthName,
        scopes: oauthScopes.split(',').map((s) => s.trim()).filter(Boolean),
        redirectUris: redirectUris.split(',').map((s) => s.trim()).filter(Boolean),
      }),
    onSuccess: async (response) => {
      toast(`OAuth client created. Secret: ${response.data.clientSecret}`, 'success');
      await queryClient.invalidateQueries({ queryKey: ['developer', 'oauth-apps'] });
    },
  });

  const createWebhook = useMutation({
    mutationFn: async () =>
      api.post('/developer/webhooks', {
        url: webhookUrl,
        events: webhookEvents.split(',').map((s) => s.trim()).filter(Boolean),
      }),
    onSuccess: async () => {
      toast('Webhook subscription created', 'success');
      await queryClient.invalidateQueries({ queryKey: ['developer', 'webhooks'] });
    },
  });

  const testWebhook = useMutation({
    mutationFn: async () => {
      if (!selectedWebhookId) return null;
      return api.post(`/developer/webhooks/${selectedWebhookId}/test`, {
        payload: {
          eventType: sampleEventType,
          source: 'developer-portal',
          emittedAt: new Date().toISOString(),
        },
      });
    },
    onSuccess: async () => {
      toast('Webhook test dispatched', 'success');
      await queryClient.invalidateQueries({ queryKey: ['developer', 'deliveries', selectedWebhookId] });
    },
  });

  const activeTab = (title: string) =>
    `rounded-full px-3 py-1.5 text-sm font-medium transition ${
      tab === title ? 'bg-primary-50 text-primary-700' : 'text-ink-muted hover:bg-surface-2'
    }`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Developer"
        description="API keys, OAuth apps, webhooks, sandbox and ecosystem integrations."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active API keys" value={stats?.activeKeys ?? '—'} icon={KeyRound} />
        <StatCard label="OAuth apps" value={stats?.oauthClients ?? '—'} icon={Code2} />
        <StatCard label="Webhook success rate" value={stats?.webhookSuccessRate != null ? `${stats.webhookSuccessRate}%` : '—'} icon={Webhook} />
        <StatCard label="Rate limit" value={stats?.rateLimitPerMinute ? `${stats.rateLimitPerMinute}/min` : '—'} icon={RefreshCcw} />
      </div>

      <div className="flex flex-wrap gap-2">
        {['keys', 'oauth', 'webhooks', 'logs', 'marketplace', 'sandbox', 'docs'].map((item) => (
          <button key={item} className={activeTab(item)} onClick={() => setTab(item as typeof tab)}>
            {item === 'keys' ? 'API keys' : item === 'oauth' ? 'OAuth apps' : item === 'webhooks' ? 'Webhooks' : item === 'logs' ? 'Logs' : item === 'marketplace' ? 'Marketplace' : item === 'sandbox' ? 'Sandbox' : 'Docs'}
          </button>
        ))}
      </div>

      {tab === 'keys' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Create API key</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="Key name" />
              <Input value={keyScopes} onChange={(e) => setKeyScopes(e.target.value)} placeholder="Scopes, comma separated" />
              <Button onClick={() => createKey.mutate()} disabled={createKey.isPending || !keyName}>
                Create key
              </Button>
              <p className="text-xs text-ink-muted">The secret is shown once at creation. Scopes restrict what external products can do.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>API keys</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(keys ?? []).map((k) => (
                <div key={k.id} className="rounded-lg border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{k.name}</div>
                      <div className="font-mono text-xs text-ink-muted">{k.keyPrefix}••••••••••••</div>
                    </div>
                    <Badge variant={k.isActive ? 'success' : 'destructive'}>{k.isActive ? 'Active' : 'Revoked'}</Badge>
                  </div>
                  <div className="mt-2 text-xs text-ink-muted">
                    {k.scopes.join(', ')} · created {formatDate(k.createdAt)}
                  </div>
                </div>
              ))}
              {(keys ?? []).length === 0 && <EmptyState title="No keys yet" description="Create an API key for your internal products." />}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'oauth' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Create OAuth app</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={oauthName} onChange={(e) => setOauthName(e.target.value)} placeholder="App name" />
              <Input value={oauthScopes} onChange={(e) => setOauthScopes(e.target.value)} placeholder="Scopes" />
              <Input value={redirectUris} onChange={(e) => setRedirectUris(e.target.value)} placeholder="Redirect URIs" />
              <Button onClick={() => createOauth.mutate()} disabled={createOauth.isPending || !oauthName}>
                Create OAuth app
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>OAuth clients</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(oauthApps ?? []).map((app) => (
                <div key={app.id} className="rounded-lg border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{app.name}</div>
                      <div className="text-xs text-ink-muted">{app.clientId}</div>
                    </div>
                    <Badge variant={app.isActive ? 'success' : 'outline'}>{app.isActive ? 'Active' : 'Disabled'}</Badge>
                  </div>
                  <div className="mt-2 text-xs text-ink-muted">
                    {app.scopes.join(', ')} · {app.redirectUris.join(', ')}
                  </div>
                </div>
              ))}
              {(oauthApps ?? []).length === 0 && <EmptyState title="No OAuth apps" />}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'webhooks' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Create webhook</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="Webhook URL" />
              <Input value={webhookEvents} onChange={(e) => setWebhookEvents(e.target.value)} placeholder="Events" />
              <Button onClick={() => createWebhook.mutate()} disabled={createWebhook.isPending || !webhookUrl}>
                Create webhook
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Webhook subscriptions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={selectedWebhookId} onChange={(e) => setSelectedWebhookId(e.target.value)}>
                <option value="">Select webhook to inspect</option>
                {(webhooks ?? []).map((hook) => (
                  <option key={hook.id} value={hook.id}>{hook.url}</option>
                ))}
              </Select>
              <div className="space-y-2">
                {(webhooks ?? []).map((hook) => (
                  <div key={hook.id} className="rounded-lg border border-line p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-mono text-xs">{hook.url}</p>
                      <Badge variant={hook.isActive ? 'success' : 'outline'}>{hook._count.deliveries} deliveries</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {hook.events.map((event) => (
                        <Badge key={event} variant="outline" className="text-[10px]">{event}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <Input value={sampleEventType} onChange={(e) => setSampleEventType(e.target.value)} placeholder="Test event type" />
              <Button variant="outline" onClick={() => testWebhook.mutate()} disabled={!selectedWebhookId || testWebhook.isPending}>
                <RefreshCcw className="h-4 w-4" />
                Send test event
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'logs' && (
        <Card>
          <CardHeader>
            <CardTitle>API usage logs</CardTitle>
          </CardHeader>
          <CardContent>
            {logs?.data?.length ? (
              <Table>
                <THead>
                  <TR>
                    <TH>Endpoint</TH>
                    <TH>Method</TH>
                    <TH>Auth</TH>
                    <TH>Status</TH>
                    <TH>Response</TH>
                    <TH>Created</TH>
                  </TR>
                </THead>
                <TBody>
                  {logs.data.map((row: any) => (
                    <TR key={row.id}>
                      <TD className="font-mono text-xs">{row.endpoint}</TD>
                      <TD>{row.method}</TD>
                      <TD>{row.authType}</TD>
                      <TD>{row.statusCode}</TD>
                      <TD>{row.responseMs ?? '—'}ms</TD>
                      <TD>{formatDate(row.createdAt)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : (
              <EmptyState title="No usage logs" description="API key requests will show up here." />
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'marketplace' && (
        <Card>
          <CardHeader>
            <CardTitle>Integration marketplace</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(stats?.eventCatalog ? Object.keys(stats.eventCatalog) : ['accounting software', 'biometric devices', 'Slack', 'Microsoft Teams', 'Google Workspace', 'Microsoft 365', 'Calendar', 'Email', 'WhatsApp provider', 'Background verification', 'E-signature', 'LMS', 'ERP', 'CRM', 'Internal founder-owned products']).map((provider) => (
              <div key={provider} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                <span>{provider}</span>
                <Badge variant="outline">Available</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === 'sandbox' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Sandbox tenant</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-lg border border-line p-3">
                <div className="text-xs uppercase tracking-wide text-ink-muted">Tenant</div>
                <div className="font-medium">{sandbox?.tenantSlug ?? 'demo-corp'}</div>
              </div>
              <div className="rounded-lg border border-line p-3">
                <div className="text-xs uppercase tracking-wide text-ink-muted">Base URL</div>
                <div className="font-mono text-xs">{sandbox?.baseUrl ?? '/api/v1'}</div>
              </div>
              <div className="rounded-lg border border-line p-3">
                <div className="text-xs uppercase tracking-wide text-ink-muted">Sample auth</div>
                <pre className="overflow-x-auto text-xs">{JSON.stringify(sandbox?.sampleHeaders ?? {}, null, 2)}</pre>
              </div>
              <div className="rounded-lg border border-line p-3">
                <div className="text-xs uppercase tracking-wide text-ink-muted">Sample code</div>
                <pre className="overflow-x-auto text-xs">{JSON.stringify(sandbox?.sampleCode ?? {}, null, 2)}</pre>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Sample payloads</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {Object.entries(sandbox?.samplePayloads ?? {}).map(([key, value]) => (
                <div key={key} className="rounded-lg border border-line p-3">
                  <div className="mb-2 font-medium">{key}</div>
                  <pre className="overflow-x-auto text-xs">{JSON.stringify(value, null, 2)}</pre>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'docs' && (
        <Card>
          <CardHeader>
            <CardTitle>API documentation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-ink-muted">
              The OpenAPI docs are available at <span className="font-mono">/api/docs</span>. The developer portal now covers keys, OAuth, webhooks, usage logs, sandbox payloads, and marketplace connections.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-line p-3">
                <div className="mb-2 text-xs uppercase tracking-wide text-ink-muted">API key sample</div>
                <pre className="overflow-x-auto text-xs">{`curl -H "X-API-Key: phk_demo_key" http://localhost:3001/api/v1/employees`}</pre>
              </div>
              <div className="rounded-lg border border-line p-3">
                <div className="mb-2 text-xs uppercase tracking-wide text-ink-muted">OAuth client credentials sample</div>
                <pre className="overflow-x-auto text-xs">{`curl -X POST http://localhost:3001/api/v1/auth/oauth/token \\
  -H "Content-Type: application/json" \\
  -d '{"grant_type":"client_credentials","client_id":"phc_xxx","client_secret":"phs_xxx"}'`}</pre>
              </div>
            </div>
            <Button variant="outline" onClick={() => downloadFile('/api/docs-json', 'peoplehub-openapi.json').catch(() => undefined)}>
              Export spec
            </Button>
          </CardContent>
        </Card>
      )}

      {tab === 'webhooks' && selectedWebhookId && (
        <Card>
          <CardHeader>
            <CardTitle>Webhook deliveries</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(deliveries?.data ?? deliveries ?? []).length ? (
              (deliveries.data ?? deliveries).map((delivery: any) => (
                <div key={delivery.id} className="rounded-lg border border-line p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{delivery.eventType}</div>
                    <Badge variant={delivery.status === 'SUCCESS' ? 'success' : delivery.status === 'FAILED' ? 'destructive' : 'outline'}>
                      {delivery.status}
                    </Badge>
                  </div>
                  <div className="mt-2 text-xs text-ink-muted">
                    Attempts {delivery.attempts ?? 0} · {formatDate(delivery.createdAt)}
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="No deliveries" description="Test the webhook to generate delivery records." />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
