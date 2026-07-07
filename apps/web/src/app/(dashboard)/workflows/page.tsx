'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Archive, CheckCircle2, Clock3, Plus, RefreshCcw, Settings2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useToast } from '@/components/ui/toaster';

type WorkflowStep = {
  approverType: string;
  approverValue: string;
  slaHours: number;
  autoApprove: boolean;
};

type WorkflowRow = {
  id: string;
  name: string;
  module: string;
  trigger: string;
  isActive: boolean;
  pendingRequests?: number;
  steps2: Array<{ id: string; stepNumber: number; approverType: string; approverValue: string | null; slaHours: number; autoApprove: boolean }>;
  createdAt: string;
  updatedAt: string;
};

type ApprovalHistoryRow = {
  id: string;
  stepNumber: number;
  action: string;
  comment: string | null;
  actorName: string | null;
  status: string | null;
  createdAt: string;
};

type ApprovalRow = {
  id: string;
  module: string;
  objectType: string;
  objectId: string;
  status: string;
  currentStep: number;
  dueAt: string | null;
  requestData: Record<string, unknown> | null;
  createdAt: string;
  requester: { firstName: string; lastName: string; employeeCode: string };
  approver: { firstName: string; lastName: string; employeeCode: string } | null;
  workflow: { id: string; name: string; module: string; trigger: string } | null;
  history: ApprovalHistoryRow[];
};

type DetailRow = ApprovalRow & {
  comments: Array<{ by: string; decision: string; comment: string | null; at: string }>;
  workflow?: { id: string; name: string; module: string; trigger: string; steps2: WorkflowRow['steps2'] };
};

const EMPTY_STEP: WorkflowStep = {
  approverType: 'REPORTING_MANAGER',
  approverValue: '',
  slaHours: 24,
  autoApprove: false,
};

const DEFAULT_JSON = JSON.stringify({ field: 'departmentId', operator: 'equals', value: 'finance' }, null, 2);

function stringifyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function apiError(err: unknown): string {
  const e = err as { response?: { data?: { message?: string | string[] } } };
  const m = e?.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : (m ?? 'Something went wrong');
}

export default function WorkflowsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<'builder' | 'requests' | 'catalog'>('builder');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [selectedApprovalId, setSelectedApprovalId] = useState('');
  const [name, setName] = useState('Expense Approval');
  const [moduleName, setModuleName] = useState('expenses');
  const [trigger, setTrigger] = useState('expense.submitted');
  const [description, setDescription] = useState('Two-step approval for expense claims');
  const [conditions, setConditions] = useState(DEFAULT_JSON);
  const [finalAction, setFinalAction] = useState('notify_requester');
  const [rejectionBehavior, setRejectionBehavior] = useState('return_to_draft');
  const [notifications, setNotifications] = useState('requester,manager');
  const [autoApproveRules, setAutoApproveRules] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [steps, setSteps] = useState<WorkflowStep[]>([
    { approverType: 'REPORTING_MANAGER', approverValue: '', slaHours: 24, autoApprove: false },
    { approverType: 'HR_ADMIN', approverValue: '', slaHours: 48, autoApprove: false },
  ]);

  const { data: stats } = useQuery({
    queryKey: ['workflows', 'stats'],
    queryFn: () => api.get('/workflows/stats').then((r) => r.data),
  });
  const { data: catalog } = useQuery({
    queryKey: ['workflows', 'catalog'],
    queryFn: () => api.get('/workflows/catalog').then((r) => r.data),
  });
  const { data: workflows, isLoading: workflowsLoading } = useQuery<WorkflowRow[]>({
    queryKey: ['workflows', 'list'],
    queryFn: () => api.get('/workflows').then((r) => r.data),
  });
  const { data: approvals, isLoading: approvalsLoading } = useQuery<ApprovalRow[]>({
    queryKey: ['workflows', 'approvals'],
    queryFn: () => api.get('/workflows/approvals').then((r) => r.data),
  });
  const { data: workflowDetail } = useQuery<WorkflowRow>({
    queryKey: ['workflows', 'detail', selectedWorkflowId],
    queryFn: () => api.get(`/workflows/detail/${selectedWorkflowId}`).then((r) => r.data),
    enabled: Boolean(selectedWorkflowId),
  });
  const { data: approvalDetail } = useQuery<DetailRow>({
    queryKey: ['workflows', 'approval', selectedApprovalId],
    queryFn: () => api.get(`/workflows/approvals/${selectedApprovalId}`).then((r) => r.data),
    enabled: Boolean(selectedApprovalId),
  });

  useEffect(() => {
    if (!workflowDetail) return;
    setName(workflowDetail.name);
    setModuleName(workflowDetail.module);
    setTrigger(workflowDetail.trigger);
    setDescription((workflowDetail as any).description ?? '');
    setConditions(stringifyJson((workflowDetail as any).conditions ?? {}));
    setFinalAction(((workflowDetail as any).steps ?? {}).finalAction ?? 'notify_requester');
    setRejectionBehavior(((workflowDetail as any).steps ?? {}).rejectionBehavior ?? 'return_to_draft');
    setNotifications((((workflowDetail as any).steps ?? {}).notifications ?? []).join(','));
    setAutoApproveRules((((workflowDetail as any).steps ?? {}).autoApproveRules ?? []).join(','));
    setIsActive(workflowDetail.isActive);
    setSteps(
      workflowDetail.steps2.length
        ? workflowDetail.steps2.map((step) => ({
            approverType: step.approverType,
            approverValue: step.approverValue ?? '',
            slaHours: step.slaHours,
            autoApprove: step.autoApprove,
          }))
        : [EMPTY_STEP],
    );
  }, [workflowDetail]);

  const saveWorkflow = useMutation({
    mutationFn: async () => {
      const body = {
        name,
        module: moduleName,
        trigger,
        description,
        conditions: JSON.parse(conditions || '{}'),
        finalAction,
        rejectionBehavior,
        notifications: notifications.split(',').map((item) => item.trim()).filter(Boolean),
        autoApproveRules: autoApproveRules.split(',').map((item) => item.trim()).filter(Boolean),
        isActive,
        steps: steps.map((step) => ({
          approverType: step.approverType,
          approverValue: step.approverValue || undefined,
          slaHours: Number(step.slaHours) || 24,
          autoApprove: Boolean(step.autoApprove),
        })),
      };
      return selectedWorkflowId
        ? api.patch(`/workflows/detail/${selectedWorkflowId}`, body)
        : api.post('/workflows', body);
    },
    onSuccess: async () => {
      toast(selectedWorkflowId ? 'Workflow updated' : 'Workflow created', 'success');
      await queryClient.invalidateQueries({ queryKey: ['workflows'] });
      setSelectedWorkflowId('');
    },
    onError: (err) => toast(apiError(err), 'error'),
  });

  const archiveWorkflow = useMutation({
    mutationFn: (id: string) => api.delete(`/workflows/detail/${id}`),
    onSuccess: async () => {
      toast('Workflow archived', 'success');
      await queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
    onError: (err) => toast(apiError(err), 'error'),
  });

  const approve = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      api.patch(`/workflows/approvals/${id}/${action}`, { comment: action === 'approve' ? 'Approved in workflow console' : 'Rejected in workflow console' }),
    onSuccess: async (_res, { action }) => {
      toast(action === 'approve' ? 'Approval advanced' : 'Approval rejected', 'success');
      await queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
    onError: (err) => toast(apiError(err), 'error'),
  });

  const runEscalations = useMutation({
    mutationFn: () => api.post('/workflows/escalations/run'),
    onSuccess: async () => {
      toast('Escalation sweep complete', 'success');
      await queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
    onError: (err) => toast(apiError(err), 'error'),
  });

  const activeWorkflow = useMemo(
    () => workflows?.find((workflow) => workflow.id === selectedWorkflowId) ?? null,
    [workflows, selectedWorkflowId],
  );

  const updateStep = (index: number, patch: Partial<WorkflowStep>) => {
    setSteps((current) => current.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workflows"
        description="Universal approval builder, request queue, history and SLA escalation control."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => runEscalations.mutate()} disabled={runEscalations.isPending}>
              <RefreshCcw className="h-4 w-4" />
              Run escalation sweep
            </Button>
            <Button onClick={() => saveWorkflow.mutate()} disabled={saveWorkflow.isPending}>
              <Plus className="h-4 w-4" />
              Save workflow
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pending" value={stats?.pending ?? '—'} icon={Clock3} />
        <StatCard label="Approved" value={stats?.approved ?? '—'} icon={CheckCircle2} />
        <StatCard label="Escalated" value={stats?.escalated ?? '—'} icon={AlertTriangle} />
        <StatCard label="Avg approval time" value={stats?.avgApprovalHours != null ? `${stats.avgApprovalHours}h` : '—'} icon={Settings2} />
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: 'builder', label: 'Builder' },
          { key: 'requests', label: 'Requests' },
          { key: 'catalog', label: 'Catalog' },
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key as typeof tab)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              tab === item.key ? 'bg-primary-50 text-primary-700' : 'text-ink-muted hover:bg-surface-2'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'builder' && (
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle>Workflow builder</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Workflow name" />
                <Input value={moduleName} onChange={(e) => setModuleName(e.target.value)} placeholder="Module key" />
                <Input value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder="Trigger" />
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
                <Input value={finalAction} onChange={(e) => setFinalAction(e.target.value)} placeholder="Final action" />
                <Input value={rejectionBehavior} onChange={(e) => setRejectionBehavior(e.target.value)} placeholder="Rejection behavior" />
                <Input value={notifications} onChange={(e) => setNotifications(e.target.value)} placeholder="Notifications (comma separated)" />
                <Input value={autoApproveRules} onChange={(e) => setAutoApproveRules(e.target.value)} placeholder="Auto-approve rules (comma separated)" />
                <label className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                  <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                  Active
                </label>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Conditions JSON</h4>
                  <Button variant="outline" size="sm" onClick={() => setConditions(DEFAULT_JSON)}>
                    Reset sample
                  </Button>
                </div>
                <textarea
                  value={conditions}
                  onChange={(e) => setConditions(e.target.value)}
                  className="min-h-32 w-full rounded-lg border border-line bg-white p-3 font-mono text-xs"
                />
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Approval steps</h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSteps((current) => [...current, EMPTY_STEP])}
                  >
                    <Plus className="h-4 w-4" />
                    Add step
                  </Button>
                </div>
                {steps.map((step, index) => (
                  <div key={`${index}-${step.approverType}`} className="rounded-lg border border-line p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Step {index + 1}</div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setSteps((current) => current.filter((_, i) => i !== index))}
                        disabled={steps.length === 1}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-4">
                      <Select value={step.approverType} onChange={(e) => updateStep(index, { approverType: e.target.value })}>
                        {(catalog?.approverTypes ?? ['REPORTING_MANAGER', 'HR_ADMIN']).map((type: string) => (
                          <option key={type} value={type}>
                            {type.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </Select>
                      <Input
                        value={step.approverValue}
                        onChange={(e) => updateStep(index, { approverValue: e.target.value })}
                        placeholder="Approver value"
                      />
                      <Input
                        type="number"
                        min={1}
                        value={step.slaHours}
                        onChange={(e) => updateStep(index, { slaHours: Number(e.target.value) || 24 })}
                        placeholder="SLA hours"
                      />
                      <label className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={step.autoApprove}
                          onChange={(e) => updateStep(index, { autoApprove: e.target.checked })}
                        />
                        Auto-approve
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Workflows</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {workflowsLoading ? (
                  <div className="space-y-2">
                    {[...Array(4)].map((_, i) => (
                      <Skeleton key={i} className="h-16" />
                    ))}
                  </div>
                ) : workflows?.length ? (
                  workflows.map((workflow) => (
                    <button
                      key={workflow.id}
                      className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                        selectedWorkflowId === workflow.id ? 'border-primary-400 bg-primary-25' : 'border-line hover:bg-surface-2'
                      }`}
                      onClick={() => setSelectedWorkflowId(workflow.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="font-medium">{workflow.name}</div>
                          <div className="text-xs text-ink-muted">{workflow.module} · {workflow.trigger}</div>
                        </div>
                        <Badge variant={workflow.isActive ? 'success' : 'outline'}>{workflow.pendingRequests ?? 0} open</Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {workflow.steps2.map((step) => (
                          <Badge key={step.id} variant="outline" className="text-[10px]">
                            {step.stepNumber}. {step.approverType.replace(/_/g, ' ')}
                          </Badge>
                        ))}
                      </div>
                    </button>
                  ))
                ) : (
                  <EmptyState title="No workflows" description="Create a workflow to route approvals without engineering." />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Selected workflow</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {activeWorkflow ? (
                  <>
                    <div className="rounded-lg border border-line p-3">
                      <div className="text-xs uppercase tracking-wide text-ink-muted">Name</div>
                      <div className="font-medium">{activeWorkflow.name}</div>
                    </div>
                    <div className="rounded-lg border border-line p-3">
                      <div className="text-xs uppercase tracking-wide text-ink-muted">Steps</div>
                      <div className="mt-2 space-y-2">
                        {activeWorkflow.steps2.map((step) => (
                          <div key={step.id} className="flex items-center justify-between gap-2 rounded-md bg-surface-2 px-3 py-2">
                            <div>
                              <div className="font-medium">
                                {step.stepNumber}. {step.approverType.replace(/_/g, ' ')}
                              </div>
                              <div className="text-xs text-ink-muted">
                                SLA {step.slaHours}h {step.autoApprove ? '· auto' : ''}
                              </div>
                            </div>
                            <Badge variant="outline">{step.approverValue ?? 'dynamic'}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => archiveWorkflow.mutate(activeWorkflow.id)} disabled={archiveWorkflow.isPending || !activeWorkflow.isActive}>
                        <Archive className="h-4 w-4" />
                        Archive
                      </Button>
                      <Button variant="secondary" onClick={() => setSelectedWorkflowId('')}>
                        Clear
                      </Button>
                    </div>
                  </>
                ) : (
                  <EmptyState title="No workflow selected" description="Pick a workflow to inspect and edit." />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {tab === 'requests' && (
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle>Approval queue</CardTitle>
            </CardHeader>
            <CardContent>
              {approvalsLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12" />
                  ))}
                </div>
              ) : approvals?.length ? (
                <Table>
                  <THead>
                    <TR>
                      <TH>Requester</TH>
                      <TH>Workflow</TH>
                      <TH>Step</TH>
                      <TH>Status</TH>
                      <TH>Due</TH>
                      <TH />
                    </TR>
                  </THead>
                  <TBody>
                    {approvals.map((request) => (
                      <TR key={request.id} className={selectedApprovalId === request.id ? 'bg-primary-25' : ''}>
                        <TD>
                          <button className="text-left" onClick={() => setSelectedApprovalId(request.id)}>
                            <div className="font-medium">
                              {request.requester.firstName} {request.requester.lastName}
                            </div>
                            <div className="text-xs text-ink-muted">{request.requester.employeeCode}</div>
                          </button>
                        </TD>
                        <TD>
                          <div className="font-medium">{request.workflow?.name ?? request.module}</div>
                          <div className="text-xs text-ink-muted">{request.objectType}</div>
                        </TD>
                        <TD>{request.currentStep}</TD>
                        <TD>
                          <Badge variant={statusVariant(request.status)}>{request.status}</Badge>
                        </TD>
                        <TD className="text-ink-muted">{request.dueAt ? formatDate(request.dueAt) : '—'}</TD>
                        <TD>
                          {request.status === 'PENDING' || request.status === 'ESCALATED' ? (
                            <div className="flex gap-1.5">
                              <Button size="icon" variant="secondary" className="h-7 w-7" onClick={() => approve.mutate({ id: request.id, action: 'approve' })}>
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="outline" className="h-7 w-7 text-danger" onClick={() => approve.mutate({ id: request.id, action: 'reject' })}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : null}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : (
                <EmptyState title="No approval requests" description="Requests raised through workflows will appear here." />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Request history</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {approvalDetail ? (
                <>
                  <div className="rounded-lg border border-line p-3 text-sm">
                    <div className="text-xs uppercase tracking-wide text-ink-muted">Request</div>
                    <div className="font-medium">{approvalDetail.workflow?.name ?? approvalDetail.module}</div>
                    <div className="mt-2 text-xs text-ink-muted">{approvalDetail.objectType} · step {approvalDetail.currentStep}</div>
                  </div>
                  <div className="rounded-lg border border-line p-3">
                    <div className="text-xs uppercase tracking-wide text-ink-muted">Comments</div>
                    <div className="mt-2 space-y-2">
                      {(approvalDetail.comments ?? []).map((comment, index) => (
                        <div key={`${comment.at}-${index}`} className="rounded-md bg-surface-2 px-3 py-2 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{comment.by}</span>
                            <span className="text-xs text-ink-muted">{formatDate(comment.at)}</span>
                          </div>
                          <div className="text-xs text-ink-muted">{comment.decision}</div>
                          {comment.comment ? <p className="mt-1">{comment.comment}</p> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-line p-3">
                    <div className="text-xs uppercase tracking-wide text-ink-muted">History</div>
                    <div className="mt-2 space-y-2">
                      {approvalDetail.history.map((entry) => (
                        <div key={entry.id} className="rounded-md bg-surface-2 px-3 py-2 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">
                              Step {entry.stepNumber} · {entry.action}
                            </span>
                            <span className="text-xs text-ink-muted">{formatDate(entry.createdAt)}</span>
                          </div>
                          {entry.comment ? <p className="mt-1 text-xs text-ink-muted">{entry.comment}</p> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <EmptyState title="Select a request" description="Open an approval request to see comments and history." />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'catalog' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Trigger examples</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(catalog?.triggerExamples ?? []).map((item: string) => (
                <div key={item} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                  <span>{item}</span>
                  <Badge variant="outline">Supported</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Approver types</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(catalog?.approverTypes ?? []).map((item: string) => (
                <div key={item} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                  <span>{item.replace(/_/g, ' ')}</span>
                  <Badge variant="outline">Selectable</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
