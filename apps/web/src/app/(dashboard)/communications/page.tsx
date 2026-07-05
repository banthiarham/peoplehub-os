'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { MailCheck, MailWarning, RefreshCcw, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { NewTemplateDialog, SendTestEmailButton } from '@/components/forms/comms-actions';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

interface SmtpConfig {
  id: string;
  providerType: string;
  name: string;
  isActive: boolean;
  isDefault: boolean;
  dailySendingLimit?: number | null;
  createdAt: string;
  smtpConfig?: {
    host: string;
    port: number;
    encryption: string;
    username: string;
    fromEmail: string;
    fromName: string;
    replyTo?: string | null;
  } | null;
}

interface EmailTemplate {
  id: string;
  templateKey: string;
  name: string;
  module: string;
  status: string;
  version: number;
  isMandatory: boolean;
  tenantId?: string | null;
}

interface DeliveryLog {
  id: string;
  to: string[];
  subject: string;
  templateKey?: string | null;
  module?: string | null;
  providerType: string;
  status: string;
  errorMessage?: string | null;
  sentAt?: string | null;
  createdAt: string;
}

interface LogsResponse {
  items: DeliveryLog[];
  total: number;
  page: number;
  limit: number;
}

export default function CommunicationsPage() {
  const { data: session } = useSession();
  const tenantId = session?.user?.tenant?.id;

  const { data: providers, isLoading: providersLoading } = useQuery({
    queryKey: ['email', 'smtp-config', tenantId],
    queryFn: () =>
      api.get('/email/smtp-config', { params: { tenantId } }).then((r) => r.data as SmtpConfig[]),
    enabled: Boolean(tenantId),
  });

  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ['email', 'templates', tenantId],
    queryFn: () =>
      api.get('/email/templates', { params: { tenantId } }).then((r) => r.data as EmailTemplate[]),
    enabled: Boolean(tenantId),
  });

  const { data: logs } = useQuery({
    queryKey: ['email', 'logs', tenantId],
    queryFn: () =>
      api
        .get('/email/logs', { params: { tenantId, limit: 8 } })
        .then((r) => r.data as LogsResponse),
    enabled: Boolean(tenantId),
  });

  const activeProvider = providers?.find((provider) => provider.isActive) ?? providers?.[0];
  const moduleCount = useMemo(
    () => new Set((templates ?? []).map((template) => template.module)).size,
    [templates],
  );
  const mandatoryCount = templates?.filter((template) => template.isMandatory).length ?? 0;
  const failedCount =
    logs?.items.filter((log) => ['FAILED', 'BOUNCED'].includes(log.status)).length ?? 0;

  if (providersLoading || templatesLoading) {
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

  return (
    <div className="space-y-5">
      <PageHeader
        title="Communications"
        description="SMTP configuration, transactional templates, delivery logs and retry operations"
        actions={
          <div className="flex flex-wrap gap-2">
            <SendTestEmailButton providerId={activeProvider?.id} />
            <NewTemplateDialog />
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active provider"
          value={activeProvider?.providerType ?? 'None'}
          icon={ShieldCheck}
        >
          <p className="text-xs text-ink-muted">
            {activeProvider?.name ?? 'Configure tenant SMTP to send production mail'}
          </p>
        </StatCard>
        <StatCard label="Templates" value={templates?.length ?? 0} icon={MailCheck}>
          <p className="text-xs text-ink-muted">{moduleCount} modules covered</p>
        </StatCard>
        <StatCard label="Mandatory flows" value={mandatoryCount} icon={MailWarning}>
          <p className="text-xs text-ink-muted">Account, payroll, tax, security and compliance</p>
        </StatCard>
        <StatCard label="Recent failures" value={failedCount} icon={RefreshCcw}>
          <p className="text-xs text-ink-muted">Manual retry and cancel operations supported</p>
        </StatCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.5fr]">
        <Card>
          <CardHeader>
            <CardTitle>SMTP Providers</CardTitle>
            <CardDescription>
              Tenant-level delivery configuration with secure credentials.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(providers ?? []).map((provider) => (
              <div key={provider.id} className="rounded-lg border border-line p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{provider.name}</p>
                    <p className="mt-1 text-sm text-ink-muted">
                      {provider.smtpConfig
                        ? `${provider.smtpConfig.host}:${provider.smtpConfig.port} - ${provider.smtpConfig.encryption}`
                        : `${provider.providerType} provider`}
                    </p>
                  </div>
                  <Badge variant={provider.isActive ? 'success' : 'outline'}>
                    {provider.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div className="mt-4 grid gap-2 text-sm">
                  <Row
                    label="From"
                    value={provider.smtpConfig?.fromEmail ?? 'noreply@peoplehub.local'}
                  />
                  <Row
                    label="Daily limit"
                    value={provider.dailySendingLimit?.toLocaleString('en-IN') ?? 'Not capped'}
                  />
                  <Row label="Created" value={formatDate(provider.createdAt)} />
                </div>
              </div>
            ))}
            {(providers ?? []).length === 0 && (
              <p className="rounded-lg border border-dashed border-line p-4 text-sm text-ink-muted">
                No provider configured yet. Add tenant SMTP before production email delivery.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Template Library</CardTitle>
            <CardDescription>
              System defaults plus tenant customizations for HRMS workflows.
            </CardDescription>
          </CardHeader>
          <Table>
            <THead>
              <TR>
                <TH>Template</TH>
                <TH>Module</TH>
                <TH>Version</TH>
                <TH>Scope</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {(templates ?? []).slice(0, 12).map((template) => (
                <TR key={template.id}>
                  <TD>
                    <p className="font-medium">{template.name}</p>
                    <p className="text-xs text-ink-muted">{template.templateKey}</p>
                  </TD>
                  <TD className="capitalize">{template.module}</TD>
                  <TD>v{template.version}</TD>
                  <TD>
                    <Badge variant={template.tenantId ? 'info' : 'outline'}>
                      {template.tenantId ? 'Tenant' : 'System'}
                    </Badge>
                  </TD>
                  <TD>
                    <Badge variant={statusVariant(template.status)}>{template.status}</Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Delivery Logs</CardTitle>
          <CardDescription>
            Recent queue outcomes, provider status and retry visibility.
          </CardDescription>
        </CardHeader>
        <Table>
          <THead>
            <TR>
              <TH>Recipient</TH>
              <TH>Subject</TH>
              <TH>Module</TH>
              <TH>Provider</TH>
              <TH>Status</TH>
              <TH>Sent</TH>
            </TR>
          </THead>
          <TBody>
            {(logs?.items ?? []).map((log) => (
              <TR key={log.id}>
                <TD className="font-medium">{log.to.join(', ')}</TD>
                <TD>
                  <p className="max-w-md truncate">
                    {log.subject || log.templateKey || 'Queued email'}
                  </p>
                  {log.errorMessage && <p className="text-xs text-danger">{log.errorMessage}</p>}
                </TD>
                <TD className="capitalize text-ink-muted">{log.module ?? '-'}</TD>
                <TD>{log.providerType}</TD>
                <TD>
                  <Badge variant={statusVariant(log.status)}>{log.status}</Badge>
                </TD>
                <TD>{formatDate(log.sentAt ?? log.createdAt)}</TD>
              </TR>
            ))}
            {(logs?.items ?? []).length === 0 && (
              <TR>
                <TD colSpan={6} className="text-ink-muted">
                  No email deliveries yet. Sending a test email will populate this log.
                </TD>
              </TR>
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-ink-muted">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
