'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { Bell, RefreshCcw, Send, ShieldCheck, Smartphone } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

interface NotificationRow {
  id: string;
  title: string;
  body: string;
  type: string;
  isRead: boolean;
  channels: string[];
  channel: string;
  createdAt: string;
}

interface NotificationTemplate {
  id: string;
  templateKey: string;
  name: string;
  channel: string;
  title: string;
  body: string;
  status: string;
  version: number;
  isMandatory: boolean;
  variables: unknown;
  versions: Array<{ id: string; version: number; title: string; body: string; createdAt: string }>;
}

const templateInitial = {
  templateKey: '',
  name: '',
  channel: 'IN_APP',
  title: '',
  body: '<p>{{vars.message}}</p>',
  status: 'DRAFT',
  isMandatory: false,
};

export default function NotificationsPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const tenantId = session?.user?.tenant?.id;

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateForm, setTemplateForm] = useState(templateInitial);
  const [recipientId, setRecipientId] = useState(session?.user?.employeeId ?? '');
  const [notifyType, setNotifyType] = useState('GENERAL');
  const [notifyTitle, setNotifyTitle] = useState('');
  const [notifyBody, setNotifyBody] = useState('');
  const [notifyChannels, setNotifyChannels] = useState('IN_APP');
  const [notifyMetadata, setNotifyMetadata] = useState('{\n  "source": "admin"\n}');
  const [notifyTemplateKey, setNotifyTemplateKey] = useState('');
  const [previewVars, setPreviewVars] = useState('{\n  "message": "Notification preview"\n}');
  const [previewResult, setPreviewResult] = useState<{ title: string; body: string; channel: string } | null>(null);

  const inboxQuery = useQuery({
    queryKey: ['notifications', 'inbox', tenantId],
    queryFn: () => api.get('/notifications').then((r) => r.data as { data: NotificationRow[]; meta: any }),
    enabled: Boolean(tenantId),
  });

  const templatesQuery = useQuery({
    queryKey: ['notifications', 'templates', tenantId],
    queryFn: () => api.get('/notifications/templates').then((r) => r.data as NotificationTemplate[]),
    enabled: Boolean(tenantId),
  });

  const unreadQuery = useQuery({
    queryKey: ['notifications', 'unread-count', tenantId],
    queryFn: () => api.get('/notifications/unread-count').then((r) => r.data as { count: number }),
    enabled: Boolean(tenantId),
  });

  const selectedTemplate = useMemo(
    () => templatesQuery.data?.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templatesQuery.data],
  );

  useEffect(() => {
    if (!selectedTemplate) return;
    setTemplateForm({
      templateKey: selectedTemplate.templateKey,
      name: selectedTemplate.name,
      channel: selectedTemplate.channel,
      title: selectedTemplate.title,
      body: selectedTemplate.body,
      status: selectedTemplate.status,
      isMandatory: selectedTemplate.isMandatory,
    });
    setNotifyTemplateKey(selectedTemplate.templateKey);
  }, [selectedTemplate]);

  const saveTemplate = useMutation({
    mutationFn: async () => {
      if (selectedTemplateId) {
        return api.patch(`/notifications/templates/${selectedTemplateId}`, templateForm);
      }
      return api.post('/notifications/templates', templateForm);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setSelectedTemplateId(null);
      setTemplateForm(templateInitial);
    },
  });

  const previewTemplate = useMutation({
    mutationFn: async () => {
      const vars = JSON.parse(previewVars || '{}');
      const template = templatesQuery.data?.find((item) => item.templateKey === notifyTemplateKey);
      if (!template) throw new Error('Select a template first');
      return api.post(`/notifications/templates/${template.id}/preview`, { vars });
    },
    onSuccess: async (response) => {
      setPreviewResult(response.data);
    },
  });

  const sendNotification = useMutation({
    mutationFn: async () => {
      const metadata = JSON.parse(notifyMetadata || '{}');
      const channels = notifyChannels
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      return api.post('/notifications', {
        userId: recipientId,
        title: notifyTitle,
        body: notifyBody,
        type: notifyType,
        channels,
        templateKey: notifyTemplateKey || undefined,
        metadata,
      });
    },
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => api.post('/notifications/read-all'),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  if (inboxQuery.isLoading || templatesQuery.isLoading || unreadQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-80" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const inbox = inboxQuery.data?.data ?? [];
  const templates = templatesQuery.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        description="In-app inbox plus template definitions for email, SMS, WhatsApp and chat channels"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ['notifications'] })}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button variant="outline" onClick={() => markAllRead.mutate()}>
              Mark all read
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Unread" value={unreadQuery.data?.count ?? 0} icon={Bell}>
          <p className="text-xs text-ink-muted">Visible in the in-app inbox</p>
        </StatCard>
        <StatCard label="Templates" value={templates.length} icon={ShieldCheck}>
          <p className="text-xs text-ink-muted">Template versions and channel metadata</p>
        </StatCard>
        <StatCard label="Active channels" value={new Set(templates.map((template) => template.channel)).size} icon={Smartphone}>
          <p className="text-xs text-ink-muted">In-app, email, SMS, WhatsApp, Slack and Teams ready</p>
        </StatCard>
        <StatCard label="Inbox items" value={inbox.length} icon={Send}>
          <p className="text-xs text-ink-muted">Recent system and admin notifications</p>
        </StatCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>{selectedTemplateId ? 'Edit notification template' : 'Create notification template'}</CardTitle>
            <CardDescription>Notification templates back in-app alerts and outbound channel integrations.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <Field label="Template key">
              <Input value={templateForm.templateKey} onChange={(e) => setTemplateForm((s) => ({ ...s, templateKey: e.target.value }))} />
            </Field>
            <Field label="Name">
              <Input value={templateForm.name} onChange={(e) => setTemplateForm((s) => ({ ...s, name: e.target.value }))} />
            </Field>
            <Field label="Channel">
              <Select value={templateForm.channel} onChange={(e) => setTemplateForm((s) => ({ ...s, channel: e.target.value }))}>
                <option value="IN_APP">IN_APP</option>
                <option value="EMAIL">EMAIL</option>
                <option value="SMS">SMS</option>
                <option value="WHATSAPP">WHATSAPP</option>
                <option value="SLACK">SLACK</option>
                <option value="TEAMS">TEAMS</option>
                <option value="PUSH">PUSH</option>
              </Select>
            </Field>
            <Field label="Title">
              <Input value={templateForm.title} onChange={(e) => setTemplateForm((s) => ({ ...s, title: e.target.value }))} />
            </Field>
            <Field label="Body" className="md:col-span-2">
              <textarea
                className="min-h-36 w-full rounded-lg border border-line bg-white p-3 text-sm"
                value={templateForm.body}
                onChange={(e) => setTemplateForm((s) => ({ ...s, body: e.target.value }))}
              />
            </Field>
            <div className="flex flex-wrap items-center gap-3 md:col-span-2">
              <label className="flex items-center gap-2 text-sm text-ink-muted">
                <input
                  type="checkbox"
                  checked={templateForm.isMandatory}
                  onChange={(e) => setTemplateForm((s) => ({ ...s, isMandatory: e.target.checked }))}
                />
                Mandatory
              </label>
              <Select value={templateForm.status} onChange={(e) => setTemplateForm((s) => ({ ...s, status: e.target.value }))}>
                <option value="DRAFT">DRAFT</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </Select>
              <div className="ml-auto flex gap-2">
                {selectedTemplateId && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setSelectedTemplateId(null);
                      setTemplateForm(templateInitial);
                    }}
                  >
                    Clear
                  </Button>
                )}
                <Button onClick={() => saveTemplate.mutate()} disabled={saveTemplate.isPending}>
                  {selectedTemplateId ? 'Update template' : 'Save template'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Send notification</CardTitle>
            <CardDescription>Direct in-app notifications or template-based preview and sends.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Recipient user ID">
              <Input value={recipientId} onChange={(e) => setRecipientId(e.target.value)} />
            </Field>
            <Field label="Type">
              <Input value={notifyType} onChange={(e) => setNotifyType(e.target.value)} />
            </Field>
            <Field label="Template key">
              <Select value={notifyTemplateKey} onChange={(e) => setNotifyTemplateKey(e.target.value)}>
                <option value="">None</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.templateKey}>
                    {template.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Title">
              <Input value={notifyTitle} onChange={(e) => setNotifyTitle(e.target.value)} />
            </Field>
            <Field label="Body">
              <textarea
                className="min-h-28 w-full rounded-lg border border-line bg-white p-3 text-sm"
                value={notifyBody}
                onChange={(e) => setNotifyBody(e.target.value)}
              />
            </Field>
            <Field label="Channels comma-separated">
              <Input value={notifyChannels} onChange={(e) => setNotifyChannels(e.target.value)} />
            </Field>
            <Field label="Metadata JSON">
              <textarea
                className="min-h-24 w-full rounded-lg border border-line bg-white p-3 text-sm"
                value={notifyMetadata}
                onChange={(e) => setNotifyMetadata(e.target.value)}
              />
            </Field>
            <div className="flex gap-2">
              <Button onClick={() => sendNotification.mutate()} disabled={sendNotification.isPending || !recipientId}>
                Send notification
              </Button>
              <Button
                variant="outline"
                onClick={() => previewTemplate.mutate()}
                disabled={previewTemplate.isPending || !notifyTemplateKey}
              >
                Preview template
              </Button>
            </div>
            {previewResult && (
              <div className="rounded-lg border border-line bg-slate-50 p-3 text-sm">
                <p className="font-medium">{previewResult.title}</p>
                <p className="mt-1 text-ink-muted">{previewResult.body}</p>
                <p className="mt-2 text-xs uppercase tracking-wide text-ink-muted">{previewResult.channel}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Inbox</CardTitle>
            <CardDescription>Mark items read or review the current unread queue.</CardDescription>
          </CardHeader>
          {inbox.length ? (
            <Table>
              <THead>
                <TR>
                  <TH>Notification</TH>
                  <TH>Type</TH>
                  <TH>Channels</TH>
                  <TH>Status</TH>
                  <TH>Created</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {inbox.map((item) => (
                  <TR key={item.id}>
                    <TD>
                      <p className="font-medium">{item.title}</p>
                      <p className="max-w-md truncate text-xs text-ink-muted">{item.body}</p>
                    </TD>
                    <TD>{item.type}</TD>
                    <TD className="text-xs text-ink-muted">{item.channels.join(', ') || item.channel}</TD>
                    <TD>
                      <Badge variant={item.isRead ? 'outline' : 'success'}>{item.isRead ? 'Read' : 'Unread'}</Badge>
                    </TD>
                    <TD>{formatDate(item.createdAt)}</TD>
                    <TD>
                      {!item.isRead && (
                        <Button size="sm" variant="outline" onClick={() => markRead.mutate(item.id)}>
                          Mark read
                        </Button>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <EmptyState icon={Bell} title="No notifications" description="Send a test notification to see the inbox working." />
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Template library</CardTitle>
            <CardDescription>Version history is captured whenever a template is updated.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {templates.length ? (
              <Table>
                <THead>
                  <TR>
                    <TH>Template</TH>
                    <TH>Channel</TH>
                    <TH>Version</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {templates.map((template) => (
                    <TR key={template.id}>
                      <TD>
                        <button className="text-left" onClick={() => setSelectedTemplateId(template.id)}>
                          <p className="font-medium">{template.name}</p>
                          <p className="text-xs text-ink-muted">{template.templateKey}</p>
                        </button>
                      </TD>
                      <TD>{template.channel}</TD>
                      <TD>v{template.version}</TD>
                      <TD>
                        <Badge variant={statusVariant(template.status)}>{template.status}</Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : (
              <EmptyState icon={Send} title="No templates yet" description="Define template keys for HR and payroll notifications." />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</span>
      {children}
    </label>
  );
}
