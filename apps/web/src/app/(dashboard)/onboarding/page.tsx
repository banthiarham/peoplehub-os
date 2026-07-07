'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ClipboardCheck, FileCheck2, FileText, Handshake, Plus, ShieldCheck, UserPlus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { OpsTextarea } from '@/components/forms/ops-textarea';

const tabs = ['Onboarding', 'Templates', 'Preboarding', 'Exits'] as const;
type Tab = typeof tabs[number];
type Option = { id: string; name: string; firstName?: string; lastName?: string };
type Task = {
  id: string;
  title: string;
  description?: string | null;
  assignedTo?: string | null;
  category: string;
  isMandatory: boolean;
  requiresUpload: boolean;
  documentKey?: string | null;
  acknowledgedAt?: string | null;
  dueDate?: string | null;
  completedAt?: string | null;
  isWaived: boolean;
};

interface OnboardingRow {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  joiningDate: string | null;
  status: string;
  department: { name: string } | null;
  designation: { name: string } | null;
  onboardingTasks: Task[];
  progress: { done: number; total: number };
}

interface TemplateRow {
  id: string;
  name: string;
  description?: string | null;
  employmentType?: string | null;
  departmentId?: string | null;
  locationId?: string | null;
  isActive: boolean;
  tasks: Array<Record<string, unknown>>;
  documentChecklist: Array<Record<string, unknown>>;
  joiningForms: Array<Record<string, unknown>>;
  policyChecklist: Array<Record<string, unknown>>;
}

interface ExitRow {
  id: string;
  employeeId: string;
  resignationDate: string;
  lastWorkingDate: string;
  reason: string | null;
  status: string;
  managerApprovalStatus: string;
  hrApprovalStatus: string;
  assetRecoveryStatus: string;
  knowledgeTransferStatus: string;
  exitInterviewStatus: string;
  finalSettlementStatus: string;
  experienceLetterKey?: string | null;
  relievingLetterKey?: string | null;
  employee: { firstName: string; lastName: string; employeeCode?: string; department: { name: string } | null };
  tasks: Task[];
}

interface EmployeeRow {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  status: string;
  department?: { name: string } | null;
}

const employeeLabel = (e: Option | EmployeeRow) =>
  `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim() || ('name' in e ? e.name : '');
const lines = (value: string) => value.split('\n').map((line) => line.trim()).filter(Boolean);
const taskItems = (value: string, assignedTo: string, category: string) =>
  lines(value).map((title) => ({ title, assignedTo, category, isMandatory: true }));
const errorMessage = (error: unknown) => {
  const response = (error as { response?: { data?: { message?: string | string[] } } })?.response;
  const message = response?.data?.message;
  return Array.isArray(message) ? message.join(', ') : message ?? 'Action failed';
};

const initialTemplate = {
  name: '',
  description: '',
  departmentId: '',
  locationId: '',
  employmentType: 'FULL_TIME',
  tasks: 'Manager checklist\nIT access setup\nFinance payroll verification\nProbation confirmation',
  documents: 'PAN card upload\nAadhaar upload\nEducation certificates',
  forms: 'Personal details form\nBank declaration',
  policies: 'Code of conduct acknowledgement\nInformation security policy acknowledgement',
  welcomeSubject: 'Welcome to Demo Corp India',
};

function OnboardingMetric({
  label,
  value,
  detail,
  icon: Icon,
  accent,
  dark = false,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof UserPlus;
  accent: string;
  dark?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        dark
          ? 'border-slate-900 bg-slate-950 text-white'
          : 'border-slate-200 bg-slate-50/70 text-slate-950',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn('text-[11px] font-semibold uppercase tracking-[0.16em]', dark ? 'text-slate-400' : 'text-slate-500')}>
            {label}
          </p>
          <p className="mt-2 truncate text-2xl font-semibold tracking-tight">{value}</p>
          <p className={cn('mt-1 truncate text-xs', dark ? 'text-slate-400' : 'text-slate-600')}>{detail}</p>
        </div>
        <span
          className={cn('inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm', dark && 'bg-white/10')}
          style={{ color: accent }}
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('Onboarding');
  const [error, setError] = useState<string | null>(null);
  const [templateForm, setTemplateForm] = useState(initialTemplate);
  const [startForm, setStartForm] = useState({ employeeId: '', templateId: '', buddyEmployeeId: '' });
  const [portalEmployeeId, setPortalEmployeeId] = useState('');
  const [exitForm, setExitForm] = useState({ employeeId: '', resignationDate: '', lastWorkingDate: '', reason: '' });

  const { data: active } = useQuery({
    queryKey: ['onboarding', 'active'],
    queryFn: () => api.get('/onboarding').then((r) => r.data as OnboardingRow[]),
  });
  const { data: templates } = useQuery({
    queryKey: ['onboarding', 'templates'],
    queryFn: () => api.get('/onboarding/templates').then((r) => r.data as TemplateRow[]),
  });
  const { data: exits } = useQuery({
    queryKey: ['onboarding', 'exits'],
    queryFn: () => api.get('/onboarding/exits').then((r) => r.data as ExitRow[]),
  });
  const { data: employeeResult } = useQuery({
    queryKey: ['employees', 'directory', 'onboarding'],
    queryFn: () => api.get('/employees?pageSize=100').then((r) => r.data as { data: EmployeeRow[] }),
  });
  const { data: options } = useQuery({
    queryKey: ['employees', 'meta-options'],
    queryFn: () => api.get('/employees/meta/options').then((r) => r.data as {
      departments: Option[];
      locations: Option[];
      managers: Option[];
    }),
  });
  const { data: preboarding } = useQuery({
    queryKey: ['onboarding', 'preboarding', portalEmployeeId],
    enabled: Boolean(portalEmployeeId),
    queryFn: () => api.get(`/onboarding/preboarding/${portalEmployeeId}`).then((r) => r.data as {
      employee: EmployeeRow;
      documents: Task[];
      forms: Task[];
      policies: Task[];
      checklists: Task[];
    }),
  });

  const employees = employeeResult?.data ?? [];
  const activeRows = active ?? [];
  const exitRows = exits ?? [];
  const pendingMandatoryOnboarding = useMemo(
    () => activeRows.reduce((sum, row) => sum + row.onboardingTasks.filter((task) => task.isMandatory && !task.completedAt && !task.isWaived).length, 0),
    [activeRows],
  );
  const pendingExitTasks = useMemo(
    () => exitRows.reduce((sum, row) => sum + row.tasks.filter((task) => task.isMandatory && !task.completedAt && !task.isWaived).length, 0),
    [exitRows],
  );

  const refresh = () => {
    setError(null);
    void qc.invalidateQueries({ queryKey: ['onboarding'] });
    void qc.invalidateQueries({ queryKey: ['employees'] });
  };

  const createTemplate = useMutation({
    mutationFn: () => api.post('/onboarding/templates', {
      name: templateForm.name,
      description: templateForm.description || undefined,
      departmentId: templateForm.departmentId || undefined,
      locationId: templateForm.locationId || undefined,
      employmentType: templateForm.employmentType || undefined,
      roleScope: ['Employee', 'Manager', 'HR Admin', 'Finance Admin'],
      tasks: [
        ...taskItems(templateForm.tasks, 'HR', 'GENERAL'),
        { title: 'Probation confirmation', assignedTo: 'HR', category: 'PROBATION', isMandatory: true, dueInDays: 30 },
      ],
      documentChecklist: taskItems(templateForm.documents, 'EMPLOYEE', 'DOCUMENT'),
      joiningForms: taskItems(templateForm.forms, 'EMPLOYEE', 'FORM'),
      policyChecklist: taskItems(templateForm.policies, 'EMPLOYEE', 'POLICY'),
      welcomeEmail: { subject: templateForm.welcomeSubject, enabled: true },
    }),
    onSuccess: () => {
      setTemplateForm(initialTemplate);
      refresh();
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const startOnboarding = useMutation({
    mutationFn: () => api.post('/onboarding/start', {
      employeeId: startForm.employeeId,
      templateId: startForm.templateId || undefined,
      buddyEmployeeId: startForm.buddyEmployeeId || undefined,
    }),
    onSuccess: () => {
      setStartForm({ employeeId: '', templateId: '', buddyEmployeeId: '' });
      refresh();
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const updateTask = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.patch(`/onboarding/tasks/${id}`, payload),
    onSuccess: refresh,
    onError: (err) => setError(errorMessage(err)),
  });
  const createExit = useMutation({
    mutationFn: () => api.post('/onboarding/exits', exitForm),
    onSuccess: () => {
      setExitForm({ employeeId: '', resignationDate: '', lastWorkingDate: '', reason: '' });
      refresh();
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const updateExit = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.patch(`/onboarding/exits/${id}`, payload),
    onSuccess: refresh,
    onError: (err) => setError(errorMessage(err)),
  });
  const updateExitTask = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.patch(`/onboarding/exit-tasks/${id}`, payload),
    onSuccess: refresh,
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_14px_48px_-44px_rgba(15,23,42,0.5)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-2xl">
                Onboarding & exits command center
              </h1>
              <p className="text-xs leading-5 text-slate-600">
                Templates, preboarding, joining checklists, probation tasks, offboarding approvals, and clearance.
              </p>
            </div>
          </div>
          <Badge variant="outline">{(templates ?? []).length} templates</Badge>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OnboardingMetric
            label="Active onboardings"
            value={activeRows.length}
            detail="Employees in joining workflows"
            icon={UserPlus}
            accent="#0F766E"
          />
          <OnboardingMetric
            label="Joining tasks"
            value={pendingMandatoryOnboarding}
            detail="Mandatory tasks still open"
            icon={ClipboardCheck}
            accent="#2563EB"
          />
          <OnboardingMetric
            label="Open exits"
            value={exitRows.filter((row) => row.status !== 'COMPLETED').length}
            detail="Resignations under clearance"
            icon={Handshake}
            accent="#F59E0B"
          />
          <OnboardingMetric
            label="Exit tasks"
            value={pendingExitTasks}
            detail="Pending asset, KT, letters, F&F"
            icon={ShieldCheck}
            accent="#0F766E"
            dark
          />
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {tabs.map((tab) => (
          <Button
            key={tab}
            type="button"
            variant="outline"
            className={cn(
              'h-auto justify-start gap-2 rounded-lg border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 shadow-none transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800',
              activeTab === tab && 'border-teal-200 bg-teal-50 text-teal-800 ring-1 ring-teal-100',
            )}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </Button>
        ))}
      </div>

      {activeTab === 'Onboarding' && (
        <div className="grid gap-4 xl:grid-cols-[0.8fr_1.5fr]">
          <Card className="overflow-hidden border-slate-200 bg-white">
            <CardHeader className="border-b border-slate-200 px-4 py-3">
              <CardTitle>Start onboarding</CardTitle>
              <p className="mt-1 text-xs text-slate-500">Assign a template, buddy, and joining workflow.</p>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Select value={startForm.employeeId} onChange={(e) => setStartForm((f) => ({ ...f, employeeId: e.target.value }))}>
                <option value="">Employee</option>
                {employees.map((employee) => <option key={employee.id} value={employee.id}>{employeeLabel(employee)} · {employee.status}</option>)}
              </Select>
              <Select value={startForm.templateId} onChange={(e) => setStartForm((f) => ({ ...f, templateId: e.target.value }))}>
                <option value="">Best matching active template</option>
                {(templates ?? []).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </Select>
              <Select value={startForm.buddyEmployeeId} onChange={(e) => setStartForm((f) => ({ ...f, buddyEmployeeId: e.target.value }))}>
                <option value="">Buddy employee</option>
                {(options?.managers ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employeeLabel(employee)}</option>)}
              </Select>
              <Button type="button" disabled={!startForm.employeeId || startOnboarding.isPending} onClick={() => startOnboarding.mutate()}>
                <Plus className="h-4 w-4" /> Start workflow
              </Button>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-slate-200 bg-white">
            <CardHeader className="border-b border-slate-200 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Recent joiners and tasks</CardTitle>
                  <p className="mt-1 text-xs text-slate-500">Track joining progress and clear open mandatory tasks.</p>
                </div>
                <Badge variant="outline">{activeRows.length} active</Badge>
              </div>
            </CardHeader>
            {activeRows.length ? (
              <Table>
                <THead><TR><TH className="w-[32%]">Employee</TH><TH className="w-[16%]">Joined</TH><TH className="w-[20%]">Progress</TH><TH>Open tasks</TH></TR></THead>
                <TBody>
                  {activeRows.map((e) => (
                    <TR key={e.id}>
                      <TD>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={`${e.firstName} ${e.lastName}`} size="sm" />
                          <span>
                            <span className="block font-medium">{e.firstName} {e.lastName}</span>
                            <span className="block text-xs text-ink-muted">{e.designation?.name ?? '-'} · {e.department?.name ?? '-'}</span>
                          </span>
                        </div>
                      </TD>
                      <TD className="text-ink-muted">{formatDate(e.joiningDate)}</TD>
                      <TD className="w-40">
                        {e.progress.total > 0 ? (
                          <div className="flex items-center gap-2">
                            <Progress value={(e.progress.done / e.progress.total) * 100} className="flex-1" />
                            <span className="text-xs text-ink-muted">{e.progress.done}/{e.progress.total}</span>
                          </div>
                        ) : <span className="text-xs text-ink-faint">No tasks</span>}
                      </TD>
                      <TD>
                        <div className="flex flex-wrap gap-2">
                          {e.onboardingTasks.filter((task) => !task.completedAt && !task.isWaived).slice(0, 3).map((task) => (
                            <Button key={task.id} type="button" size="sm" variant="outline" className="max-w-48 justify-start truncate" onClick={() => updateTask.mutate({ id: task.id, payload: { completed: true, acknowledged: task.category === 'POLICY' ? true : undefined } })}>
                              <Check className="h-3.5 w-3.5" /> {task.title}
                            </Button>
                          ))}
                          {e.onboardingTasks.filter((task) => !task.completedAt && !task.isWaived).length === 0 && (
                            <Badge variant="success">Complete</Badge>
                          )}
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : <EmptyState icon={UserPlus} title="No active onboardings" />}
          </Card>
        </div>
      )}

      {activeTab === 'Templates' && (
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.3fr]">
          <Card>
            <CardHeader><CardTitle>Create onboarding template</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              <Input placeholder="Template name" value={templateForm.name} onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))} />
              <Input placeholder="Description" value={templateForm.description} onChange={(e) => setTemplateForm((f) => ({ ...f, description: e.target.value }))} />
              <div className="grid gap-3 sm:grid-cols-3">
                <Select value={templateForm.departmentId} onChange={(e) => setTemplateForm((f) => ({ ...f, departmentId: e.target.value }))}>
                  <option value="">Department scope</option>
                  {(options?.departments ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </Select>
                <Select value={templateForm.locationId} onChange={(e) => setTemplateForm((f) => ({ ...f, locationId: e.target.value }))}>
                  <option value="">Location scope</option>
                  {(options?.locations ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </Select>
                <Select value={templateForm.employmentType} onChange={(e) => setTemplateForm((f) => ({ ...f, employmentType: e.target.value }))}>
                  {['FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'INTERN', 'CONSULTANT'].map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </div>
              <OpsTextarea value={templateForm.tasks} onChange={(e) => setTemplateForm((f) => ({ ...f, tasks: e.target.value }))} />
              <OpsTextarea value={templateForm.documents} onChange={(e) => setTemplateForm((f) => ({ ...f, documents: e.target.value }))} />
              <OpsTextarea value={templateForm.forms} onChange={(e) => setTemplateForm((f) => ({ ...f, forms: e.target.value }))} />
              <OpsTextarea value={templateForm.policies} onChange={(e) => setTemplateForm((f) => ({ ...f, policies: e.target.value }))} />
              <Input value={templateForm.welcomeSubject} onChange={(e) => setTemplateForm((f) => ({ ...f, welcomeSubject: e.target.value }))} />
              <Button type="button" disabled={!templateForm.name || createTemplate.isPending} onClick={() => createTemplate.mutate()}>
                <FileText className="h-4 w-4" /> Save template
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Template library</CardTitle></CardHeader>
            <Table>
              <THead><TR><TH>Template</TH><TH>Scope</TH><TH>Checklist</TH></TR></THead>
              <TBody>
                {(templates ?? []).map((template) => (
                  <TR key={template.id}>
                    <TD>
                      <p className="font-medium">{template.name}</p>
                      <p className="text-xs text-ink-muted">{template.description ?? '-'}</p>
                    </TD>
                    <TD><Badge variant="outline">{template.employmentType ?? 'Any'}</Badge></TD>
                    <TD className="text-xs text-ink-muted">
                      {template.tasks.length} tasks · {template.documentChecklist.length} docs · {template.joiningForms.length} forms · {template.policyChecklist.length} policies
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>
      )}

      {activeTab === 'Preboarding' && (
        <div className="grid gap-4 xl:grid-cols-[0.7fr_1.5fr]">
          <Card>
            <CardHeader><CardTitle>Preboarding portal</CardTitle></CardHeader>
            <CardContent>
              <Select className="w-full" value={portalEmployeeId} onChange={(e) => setPortalEmployeeId(e.target.value)}>
                <option value="">Select employee</option>
                {activeRows.map((employee) => <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName}</option>)}
              </Select>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Employee-facing tasks</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              {!preboarding ? (
                <EmptyState icon={FileCheck2} title="Select an employee" description="Documents, forms, policies and checklists appear here." />
              ) : (
                <>
                  <div>
                    <p className="font-medium">{preboarding.employee.firstName} {preboarding.employee.lastName}</p>
                    <p className="text-sm text-ink-muted">{preboarding.employee.employeeCode} · {preboarding.employee.status}</p>
                  </div>
                  {[
                    ['Documents', preboarding.documents],
                    ['Joining forms', preboarding.forms],
                    ['Policy acknowledgements', preboarding.policies],
                    ['Checklists', preboarding.checklists],
                  ].map(([label, rows]) => (
                    <div key={label as string}>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{label as string}</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {(rows as Task[]).map((task) => (
                          <div key={task.id} className="rounded-lg border border-line p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium">{task.title}</p>
                                <p className="text-xs text-ink-muted">{task.assignedTo ?? '-'} · due {formatDate(task.dueDate)}</p>
                              </div>
                              <Badge variant={task.completedAt || task.acknowledgedAt ? 'success' : task.isWaived ? 'warning' : 'outline'}>
                                {task.isWaived ? 'Waived' : task.completedAt || task.acknowledgedAt ? 'Done' : 'Open'}
                              </Badge>
                            </div>
                            <div className="mt-2 flex gap-2">
                              <Button type="button" size="sm" variant="outline" onClick={() => updateTask.mutate({ id: task.id, payload: { completed: true, acknowledged: task.category === 'POLICY' ? true : undefined, documentKey: task.requiresUpload ? 'demo/uploaded-proof.pdf' : undefined } })}>
                                Complete
                              </Button>
                              <Button type="button" size="sm" variant="outline" onClick={() => updateTask.mutate({ id: task.id, payload: { isWaived: true } })}>
                                Waive
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'Exits' && (
        <div className="grid gap-4 xl:grid-cols-[0.8fr_1.5fr]">
          <Card>
            <CardHeader><CardTitle>Create exit request</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              <Select value={exitForm.employeeId} onChange={(e) => setExitForm((f) => ({ ...f, employeeId: e.target.value }))}>
                <option value="">Employee</option>
                {employees.filter((employee) => employee.status !== 'EXITED').map((employee) => <option key={employee.id} value={employee.id}>{employeeLabel(employee)}</option>)}
              </Select>
              <Input type="date" value={exitForm.resignationDate} onChange={(e) => setExitForm((f) => ({ ...f, resignationDate: e.target.value }))} />
              <Input type="date" value={exitForm.lastWorkingDate} onChange={(e) => setExitForm((f) => ({ ...f, lastWorkingDate: e.target.value }))} />
              <OpsTextarea placeholder="Reason" value={exitForm.reason} onChange={(e) => setExitForm((f) => ({ ...f, reason: e.target.value }))} />
              <Button type="button" disabled={!exitForm.employeeId || !exitForm.resignationDate || !exitForm.lastWorkingDate || createExit.isPending} onClick={() => createExit.mutate()}>
                <Plus className="h-4 w-4" /> Start exit
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Exit approvals and clearance</CardTitle></CardHeader>
            {exitRows.length ? (
              <div className="space-y-4 p-4">
                {exitRows.map((exit) => {
                  const pending = exit.tasks.filter((task) => task.isMandatory && !task.completedAt && !task.isWaived).length;
                  return (
                    <div key={exit.id} className="rounded-lg border border-line p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{exit.employee.firstName} {exit.employee.lastName}</p>
                          <p className="text-sm text-ink-muted">Last working day {formatDate(exit.lastWorkingDate)} · {pending} mandatory tasks pending</p>
                        </div>
                        <Badge variant={statusVariant(exit.status)}>{exit.status}</Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => updateExit.mutate({ id: exit.id, payload: { managerApprovalStatus: 'APPROVED' } })}>Manager approve</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => updateExit.mutate({ id: exit.id, payload: { hrApprovalStatus: 'APPROVED' } })}>HR approve</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => updateExit.mutate({ id: exit.id, payload: { experienceLetterKey: `exits/${exit.id}/experience.pdf`, relievingLetterKey: `exits/${exit.id}/relieving.pdf` } })}>Letters</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => updateExit.mutate({ id: exit.id, payload: { status: 'COMPLETED', assetRecoveryStatus: 'COMPLETED', knowledgeTransferStatus: 'COMPLETED', exitInterviewStatus: 'COMPLETED', finalSettlementStatus: 'COMPLETED' } })}>
                          Complete exit
                        </Button>
                      </div>
                      <div className="mt-4 grid gap-2 md:grid-cols-2">
                        {exit.tasks.map((task) => (
                          <div key={task.id} className="rounded-lg border border-line/70 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium">{task.title}</p>
                                <p className="text-xs text-ink-muted">{task.category} · {task.assignedTo ?? '-'}</p>
                              </div>
                              <Badge variant={task.completedAt ? 'success' : task.isWaived ? 'warning' : 'outline'}>{task.completedAt ? 'Done' : task.isWaived ? 'Waived' : 'Open'}</Badge>
                            </div>
                            <div className="mt-2 flex gap-2">
                              <Button type="button" size="sm" variant="outline" onClick={() => updateExitTask.mutate({ id: task.id, payload: { completed: true, documentKey: task.category === 'DOCUMENT' ? `exits/${exit.id}/letter.pdf` : undefined } })}>
                                <Check className="h-3.5 w-3.5" /> Done
                              </Button>
                              <Button type="button" size="sm" variant="outline" onClick={() => updateExitTask.mutate({ id: task.id, payload: { isWaived: true } })}>
                                <X className="h-3.5 w-3.5" /> Waive
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={Handshake} title="No exit requests" description="Create an exit request to start approvals and clearance tasks." />
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
