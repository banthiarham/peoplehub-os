'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { Check, ClipboardCheck, Hourglass, ShieldCheck, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { allows, viewerFromSession } from '@/lib/authz';
import { formatDate } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useToast } from '@/components/ui/toaster';

const JSON_FIELDS = new Set(['bankDetails', 'address', 'emergencyContact']);

const FIELD_LABELS: Record<string, string> = {
  bankDetails: 'Bank details',
  pan: 'PAN',
  aadhaar: 'Aadhaar',
  uan: 'UAN',
  esicNumber: 'ESIC number',
  taxRegime: 'Tax regime',
  legalEntityId: 'Legal entity',
  costCenterId: 'Cost center',
  businessUnitId: 'Business unit',
};

interface ProfileChangeRow {
  id: string;
  employeeId: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  employee: { id: string; firstName: string; lastName: string; employeeCode: string };
}

/** Profile changes store JSON fields (bank details, address...) as a stringified object. */
function formatChangeValue(fieldName: string, raw: string | null): string {
  if (raw === null || raw === undefined || raw === '') return '—';
  if (!JSON_FIELDS.has(fieldName)) return raw;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const entries = Object.entries(parsed).filter(
      ([, v]) => v !== null && v !== undefined && v !== '',
    );
    return entries.length ? entries.map(([k, v]) => `${k}: ${String(v)}`).join(' · ') : '—';
  } catch {
    return raw;
  }
}

interface ApprovalRow {
  id: string;
  module: string;
  objectType: string;
  status: string;
  currentStep: number;
  requestData: Record<string, unknown> | null;
  createdAt: string;
  requester: { firstName: string; lastName: string; employeeCode: string };
  approver: { firstName: string; lastName: string } | null;
}

function apiError(err: unknown): string {
  const e = err as { response?: { data?: { message?: string | string[] } } };
  const m = e?.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : (m ?? 'Something went wrong');
}

function summarize(row: ApprovalRow): string {
  const d = row.requestData ?? {};
  const text = (d.title ?? d.reason ?? d.description ?? '') as string;
  return text || row.objectType.replace(/_/g, ' ').toLowerCase();
}

export default function ApprovalsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: session } = useSession();
  const [status, setStatus] = useState('PENDING');
  const canApproveProfileChanges = allows(viewerFromSession(session), 'approveProfileChanges');

  const { data: stats } = useQuery({
    queryKey: ['workflows', 'stats'],
    queryFn: () => api.get('/workflows/stats').then((r) => r.data),
  });
  const { data: approvals, isLoading } = useQuery<ApprovalRow[]>({
    queryKey: ['workflows', 'approvals', status],
    queryFn: () =>
      api.get('/workflows/approvals', { params: status ? { status } : {} }).then((r) => r.data),
  });
  const { data: profileChanges, isLoading: profileChangesLoading } = useQuery<ProfileChangeRow[]>({
    queryKey: ['employees', 'profile-changes', 'pending'],
    queryFn: () => api.get('/employees/profile-changes/pending').then((r) => r.data),
    enabled: canApproveProfileChanges,
  });

  const decideProfileChange = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      api.patch(`/employees/profile-changes/${id}/${action}`, {}),
    onSuccess: (_res, { action }) => {
      queryClient.invalidateQueries({ queryKey: ['employees', 'profile-changes', 'pending'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast(action === 'approve' ? 'Profile change approved' : 'Profile change rejected');
    },
    onError: (err) => toast(apiError(err), 'error'),
  });

  const decide = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      api.patch(`/workflows/approvals/${id}/${action}`, {}),
    onSuccess: (_res, { action }) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      toast(action === 'approve' ? 'Request approved' : 'Request rejected');
    },
    onError: (err) => toast(apiError(err), 'error'),
  });

  return (
    <div>
      <PageHeader
        title="Approvals"
        description="Pending requests routed to you across every module"
      />
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pending" value={stats?.pending ?? '—'} icon={Hourglass} />
        <StatCard label="Approved" value={stats?.approved ?? '—'} icon={ThumbsUp} />
        <StatCard label="Rejected" value={stats?.rejected ?? '—'} icon={ThumbsDown} />
        <StatCard
          label="Avg approval time"
          value={stats?.avgApprovalHours != null ? `${stats.avgApprovalHours}h` : '—'}
          icon={ClipboardCheck}
        />
      </div>

      <Card>
        <div className="flex items-center gap-3 border-b border-line p-4">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </Select>
        </div>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : approvals?.length ? (
          <Table>
            <THead>
              <TR>
                <TH>Requester</TH>
                <TH>Module</TH>
                <TH>Request</TH>
                <TH>Raised</TH>
                <TH>Status</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {approvals.map((a) => (
                <TR key={a.id}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <Avatar name={`${a.requester.firstName} ${a.requester.lastName}`} size="sm" />
                      <span>
                        <span className="block font-medium">
                          {a.requester.firstName} {a.requester.lastName}
                        </span>
                        <span className="block text-xs text-ink-muted">
                          {a.requester.employeeCode}
                        </span>
                      </span>
                    </div>
                  </TD>
                  <TD>
                    <Badge variant="outline">{a.module}</Badge>
                  </TD>
                  <TD className="max-w-64 truncate">{summarize(a)}</TD>
                  <TD className="text-ink-muted">{formatDate(a.createdAt)}</TD>
                  <TD>
                    <Badge variant={statusVariant(a.status)}>{a.status}</Badge>
                  </TD>
                  <TD>
                    {a.status === 'PENDING' && (
                      <div className="flex gap-1.5">
                        <Button
                          size="icon"
                          variant="secondary"
                          className="h-7 w-7"
                          disabled={decide.isPending}
                          onClick={() => decide.mutate({ id: a.id, action: 'approve' })}
                          aria-label="Approve"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7 text-danger"
                          disabled={decide.isPending}
                          onClick={() => decide.mutate({ id: a.id, action: 'reject' })}
                          aria-label="Reject"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState
            icon={ClipboardCheck}
            title="No requests"
            description="Nothing waiting for this filter."
          />
        )}
      </Card>

      {canApproveProfileChanges && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary-600" /> Sensitive profile changes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {profileChangesLoading ? (
              <div className="space-y-2 p-4">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : profileChanges?.length ? (
              <Table>
                <THead>
                  <TR>
                    <TH>Employee</TH>
                    <TH>Field</TH>
                    <TH>Current</TH>
                    <TH>Requested</TH>
                    <TH>Submitted</TH>
                    <TH></TH>
                  </TR>
                </THead>
                <TBody>
                  {profileChanges.map((c) => (
                    <TR key={c.id}>
                      <TD>
                        <div className="flex items-center gap-3">
                          <Avatar name={`${c.employee.firstName} ${c.employee.lastName}`} size="sm" />
                          <span>
                            <span className="block font-medium">
                              {c.employee.firstName} {c.employee.lastName}
                            </span>
                            <span className="block text-xs text-ink-muted">{c.employee.employeeCode}</span>
                          </span>
                        </div>
                      </TD>
                      <TD>
                        <Badge variant="outline">{FIELD_LABELS[c.fieldName] ?? c.fieldName}</Badge>
                      </TD>
                      <TD className="max-w-56 truncate text-ink-muted">
                        {formatChangeValue(c.fieldName, c.oldValue)}
                      </TD>
                      <TD className="max-w-56 truncate font-medium">
                        {formatChangeValue(c.fieldName, c.newValue)}
                      </TD>
                      <TD className="text-ink-muted">{formatDate(c.createdAt)}</TD>
                      <TD>
                        <div className="flex gap-1.5">
                          <Button
                            size="icon"
                            variant="secondary"
                            className="h-7 w-7"
                            disabled={decideProfileChange.isPending}
                            onClick={() => decideProfileChange.mutate({ id: c.id, action: 'approve' })}
                            aria-label="Approve"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-7 text-danger"
                            disabled={decideProfileChange.isPending}
                            onClick={() => decideProfileChange.mutate({ id: c.id, action: 'reject' })}
                            aria-label="Reject"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : (
              <EmptyState
                icon={ShieldCheck}
                title="No pending profile changes"
                description="Sensitive edits — bank details, PAN, Aadhaar and similar fields — land here for a second admin to confirm."
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
