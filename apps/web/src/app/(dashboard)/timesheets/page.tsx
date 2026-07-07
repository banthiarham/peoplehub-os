'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, CheckCircle2, Download, Plus, Timer, TriangleAlert, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { downloadFile } from '@/lib/download';
import { formatDate } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
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

type ClientRow = {
  id: string;
  name: string;
  code: string | null;
  industry: string | null;
  status: string;
  _count: { projects: number };
};

type ProjectRow = {
  id: string;
  name: string;
  code: string | null;
  status: string;
  budgetHours: number | null;
  billingRate: number | null;
  clientName: string | null;
  client: { id: string; name: string; code: string | null } | null;
  _count: { timesheets: number; tasks: number };
};

type TaskRow = {
  id: string;
  name: string;
  code: string | null;
  status: string;
  isBillable: boolean;
  rateOverride: number | null;
  project: { id: string; name: string; code: string | null } | null;
};

type TimesheetRow = {
  id: string;
  weekStart: string;
  totalHours: number;
  billableHours: number;
  status: string;
  employee: { firstName: string; lastName: string; employeeCode: string };
  project: { name: string; code: string | null; clientName: string | null; client: { name: string } | null } | null;
};

type PayrollSyncRow = {
  employeeId: string;
  employee: string;
  employeeCode: string;
  employmentType: string;
  totalHours: number;
  billableHours: number;
  overtimeHours: number;
  hourlyValue: number;
};

type WeeklyEntry = {
  date: string;
  hours: number;
  taskId: string;
  billable: boolean;
};

function mondayOf(date: Date): Date {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function toInputDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildWeekEntries(start: string): WeeklyEntry[] {
  const monday = new Date(start);
  monday.setHours(0, 0, 0, 0);
  return [0, 1, 2, 3, 4].map((offset) => {
    const date = new Date(monday);
    date.setDate(date.getDate() + offset);
    return { date: toInputDate(date), hours: 8, taskId: '', billable: true };
  });
}

export default function TimesheetsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [weekStart, setWeekStart] = useState(toInputDate(mondayOf(new Date())));
  const [projectId, setProjectId] = useState('');
  const [clientForm, setClientForm] = useState({
    name: '',
    code: '',
    industry: '',
    website: '',
    billingContact: '',
  });
  const [projectForm, setProjectForm] = useState({
    name: '',
    clientId: '',
    code: '',
    budgetHours: '',
    billingRate: '',
  });
  const [taskProjectId, setTaskProjectId] = useState('');
  const [taskForm, setTaskForm] = useState({
    name: '',
    projectId: '',
    code: '',
    description: '',
    rateOverride: '',
  });
  const [entries, setEntries] = useState<WeeklyEntry[]>(buildWeekEntries(weekStart));
  const activeTaskProjectId = taskProjectId || projectId;

  useEffect(() => {
    setEntries(buildWeekEntries(weekStart));
  }, [weekStart]);

  const { data: summary } = useQuery({
    queryKey: ['timesheets', 'summary'],
    queryFn: () => api.get('/timesheets/summary').then((r) => r.data),
  });
  const { data: clients } = useQuery<ClientRow[]>({
    queryKey: ['timesheets', 'clients'],
    queryFn: () => api.get('/timesheets/clients').then((r) => r.data),
  });
  const { data: projects } = useQuery<ProjectRow[]>({
    queryKey: ['timesheets', 'projects'],
    queryFn: () => api.get('/timesheets/projects').then((r) => r.data),
  });
  const { data: tasks } = useQuery<TaskRow[]>({
    queryKey: ['timesheets', 'tasks', activeTaskProjectId],
    queryFn: () =>
      api.get('/timesheets/tasks', { params: activeTaskProjectId ? { projectId: activeTaskProjectId } : undefined }).then((r) => r.data),
  });
  const { data: utilization } = useQuery({
    queryKey: ['timesheets', 'utilization'],
    queryFn: () => api.get('/timesheets/utilization').then((r) => r.data),
  });
  const { data: payrollSync } = useQuery<{ month: string; employees: PayrollSyncRow[]; totalBillableHours: number; totalOvertimeHours: number; hourlyWorkerCount: number }>({
    queryKey: ['timesheets', 'payroll-sync'],
    queryFn: () => api.get('/timesheets/payroll-sync').then((r) => r.data),
  });
  const { data: sheetPage } = useQuery<{ data: TimesheetRow[] }>({
    queryKey: ['timesheets', 'list'],
    queryFn: () => api.get('/timesheets', { params: { pageSize: 50 } }).then((r) => r.data),
  });
  const { data: myTimesheets } = useQuery<TimesheetRow[]>({
    queryKey: ['timesheets', 'me'],
    queryFn: () => api.get('/timesheets/me').then((r) => r.data),
  });

  const selectedProjectTasks = useMemo(() => {
    if (!projectId || !tasks?.length) return tasks ?? [];
    return tasks.filter((task) => !task.project || task.project.id === activeTaskProjectId);
  }, [activeTaskProjectId, tasks]);

  const upsertTimesheet = useMutation({
    mutationFn: async () =>
      api.post('/timesheets', {
        projectId: projectId || undefined,
        weekStart,
        entries: entries.map((entry) => ({
          date: entry.date,
          hours: Number(entry.hours),
          taskId: entry.taskId || undefined,
          billable: entry.billable,
        })),
      }),
    onSuccess: async () => {
      toast('Timesheet saved', 'success');
      await queryClient.invalidateQueries({ queryKey: ['timesheets'] });
    },
  });

  const submitTimesheet = useMutation({
    mutationFn: async (id: string) => api.post(`/timesheets/${id}/submit`),
    onSuccess: async () => {
      toast('Timesheet submitted', 'success');
      await queryClient.invalidateQueries({ queryKey: ['timesheets'] });
    },
  });

  const approveTimesheet = useMutation({
    mutationFn: async (id: string) => api.patch(`/timesheets/${id}/approve`),
    onSuccess: async () => {
      toast('Timesheet approved', 'success');
      await queryClient.invalidateQueries({ queryKey: ['timesheets'] });
    },
  });

  const rejectTimesheet = useMutation({
    mutationFn: async (id: string) => api.patch(`/timesheets/${id}/reject`),
    onSuccess: async () => {
      toast('Timesheet rejected', 'success');
      await queryClient.invalidateQueries({ queryKey: ['timesheets'] });
    },
  });

  const createClient = useMutation({
    mutationFn: async () => api.post('/timesheets/clients', clientForm),
    onSuccess: async () => {
      toast('Client created', 'success');
      setClientForm({ name: '', code: '', industry: '', website: '', billingContact: '' });
      await queryClient.invalidateQueries({ queryKey: ['timesheets', 'clients'] });
    },
  });

  const createProject = useMutation({
    mutationFn: async () =>
      api.post('/timesheets/projects', {
        ...projectForm,
        clientId: projectForm.clientId || undefined,
        budgetHours: projectForm.budgetHours ? Number(projectForm.budgetHours) : undefined,
        billingRate: projectForm.billingRate ? Number(projectForm.billingRate) : undefined,
      }),
    onSuccess: async () => {
      toast('Project created', 'success');
      setProjectForm({ name: '', clientId: '', code: '', budgetHours: '', billingRate: '' });
      await queryClient.invalidateQueries({ queryKey: ['timesheets', 'projects'] });
      await queryClient.invalidateQueries({ queryKey: ['timesheets', 'utilization'] });
    },
  });

  const createTask = useMutation({
    mutationFn: async () =>
      api.post('/timesheets/tasks', {
        ...taskForm,
        projectId: taskForm.projectId || undefined,
        rateOverride: taskForm.rateOverride ? Number(taskForm.rateOverride) : undefined,
        isBillable: true,
      }),
    onSuccess: async () => {
      toast('Task created', 'success');
      setTaskForm({ name: '', projectId: '', code: '', description: '', rateOverride: '' });
      await queryClient.invalidateQueries({ queryKey: ['timesheets', 'tasks'] });
      await queryClient.invalidateQueries({ queryKey: ['timesheets', 'projects'] });
    },
  });

  async function downloadBillingCsv() {
    await downloadFile('/timesheets/billing/export', 'timesheet-billing.csv');
  }

  const totals = summary ?? { totalHours: 0, billableHours: 0, overtimeHours: 0, billableRate: 0, utilizationRate: 0, capacityHours: 0 };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Timesheets"
        description="Weekly submission, project billing, utilization, and payroll handoff"
        actions={
          <Button variant="outline" onClick={downloadBillingCsv}>
            <Download className="h-4 w-4" />
            Billing CSV
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Recent hours" value={totals.totalHours} icon={Timer} />
        <StatCard label="Billable hours" value={totals.billableHours} />
        <StatCard label="Overtime hours" value={totals.overtimeHours ?? 0} />
        <StatCard label="Billable rate" value={totals.billableRate != null ? `${totals.billableRate}%` : '—'} />
        <StatCard label="Utilization" value={totals.utilizationRate != null ? `${totals.utilizationRate}%` : '—'} icon={Building2} />
        <StatCard label="Capacity" value={totals.capacityHours} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Submit weekly timesheet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">Week start</label>
                <Input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">Project</label>
                <Select value={projectId} onChange={(e) => { const next = e.target.value; setProjectId(next); setTaskProjectId(next); }}>
                  <option value="">Select project</option>
                  {(projects ?? []).map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex items-end">
                <Button className="w-full" onClick={() => upsertTimesheet.mutate()} disabled={upsertTimesheet.isPending}>
                  <Plus className="h-4 w-4" />
                  Save draft
                </Button>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-line">
              <Table>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH>Hours</TH>
                    <TH>Task</TH>
                    <TH>Billable</TH>
                  </TR>
                </THead>
                <TBody>
                  {entries.map((entry, index) => (
                    <TR key={entry.date}>
                      <TD>{formatDate(entry.date)}</TD>
                      <TD className="w-24">
                        <Input
                          type="number"
                          min={0}
                          max={24}
                          step={0.5}
                          value={entry.hours}
                          onChange={(e) => {
                            const hours = Number(e.target.value);
                            setEntries((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, hours } : row)));
                          }}
                        />
                      </TD>
                      <TD>
                        <Select
                          value={entry.taskId}
                          onChange={(e) => {
                            const taskId = e.target.value;
                            const task = selectedProjectTasks.find((item) => item.id === taskId);
                            setEntries((rows) =>
                              rows.map((row, rowIndex) =>
                                rowIndex === index
                                  ? { ...row, taskId, billable: task ? task.isBillable : row.billable }
                                  : row,
                              ),
                            );
                          }}
                        >
                          <option value="">Select task</option>
                          {selectedProjectTasks.map((task) => (
                            <option key={task.id} value={task.id}>
                              {task.name}
                            </option>
                          ))}
                        </Select>
                      </TD>
                      <TD>
                        <label className="inline-flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={entry.billable}
                            onChange={(e) =>
                              setEntries((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, billable: e.target.checked } : row)))
                            }
                          />
                          Billable
                        </label>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payroll handoff</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-lg border border-line p-3">
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Current month</span>
                <Badge variant="outline">{payrollSync?.month ?? '—'}</Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-ink-muted">Billable hours</div>
                  <div className="text-lg font-semibold">{payrollSync?.totalBillableHours ?? 0}</div>
                </div>
                <div>
                  <div className="text-xs text-ink-muted">Overtime hours</div>
                  <div className="text-lg font-semibold">{payrollSync?.totalOvertimeHours ?? 0}</div>
                </div>
                <div>
                  <div className="text-xs text-ink-muted">Hourly workers</div>
                  <div className="text-lg font-semibold">{payrollSync?.hourlyWorkerCount ?? 0}</div>
                </div>
                <div>
                  <div className="text-xs text-ink-muted">Revenue proxy</div>
                  <div className="text-lg font-semibold">₹{Math.round((payrollSync?.employees ?? []).reduce((s, row) => s + row.hourlyValue, 0)).toLocaleString('en-IN')}</div>
                </div>
              </div>
            </div>
            <div className="text-xs text-ink-muted">
              Approved and submitted timesheets feed billable hours and overtime into payroll planning.
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Clients</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2">
              <Input placeholder="Client name" value={clientForm.name} onChange={(e) => setClientForm((f) => ({ ...f, name: e.target.value }))} />
              <Input placeholder="Code" value={clientForm.code} onChange={(e) => setClientForm((f) => ({ ...f, code: e.target.value }))} />
              <Input placeholder="Industry" value={clientForm.industry} onChange={(e) => setClientForm((f) => ({ ...f, industry: e.target.value }))} />
              <Input placeholder="Website" value={clientForm.website} onChange={(e) => setClientForm((f) => ({ ...f, website: e.target.value }))} />
              <Input placeholder="Billing contact" value={clientForm.billingContact} onChange={(e) => setClientForm((f) => ({ ...f, billingContact: e.target.value }))} />
              <Button onClick={() => createClient.mutate()} disabled={createClient.isPending || !clientForm.name}>
                <Plus className="h-4 w-4" />
                Create client
              </Button>
            </div>
            <div className="space-y-2">
              {(clients ?? []).map((client) => (
                <div key={client.id} className="rounded-lg border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{client.name}</div>
                      <div className="text-xs text-ink-muted">{client.code ?? 'No code'} · {client.industry ?? 'No industry'}</div>
                    </div>
                    <Badge variant={client.status === 'ACTIVE' ? 'success' : 'outline'}>{client._count.projects} projects</Badge>
                  </div>
                </div>
              ))}
              {(clients ?? []).length === 0 && <EmptyState title="No clients" description="Create a client to organize project billing." />}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Projects</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2">
              <Input placeholder="Project name" value={projectForm.name} onChange={(e) => setProjectForm((f) => ({ ...f, name: e.target.value }))} />
              <Select value={projectForm.clientId} onChange={(e) => setProjectForm((f) => ({ ...f, clientId: e.target.value }))}>
                <option value="">Select client</option>
                {(clients ?? []).map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </Select>
              <Input placeholder="Code" value={projectForm.code} onChange={(e) => setProjectForm((f) => ({ ...f, code: e.target.value }))} />
              <Input placeholder="Budget hours" type="number" value={projectForm.budgetHours} onChange={(e) => setProjectForm((f) => ({ ...f, budgetHours: e.target.value }))} />
              <Input placeholder="Billing rate" type="number" value={projectForm.billingRate} onChange={(e) => setProjectForm((f) => ({ ...f, billingRate: e.target.value }))} />
              <Button onClick={() => createProject.mutate()} disabled={createProject.isPending || !projectForm.name}>
                <Plus className="h-4 w-4" />
                Create project
              </Button>
            </div>
            <div className="space-y-2">
              {(projects ?? []).map((project) => (
                <div key={project.id} className="rounded-lg border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{project.name}</div>
                      <div className="text-xs text-ink-muted">
                        {project.client?.name ?? project.clientName ?? 'No client'} · {project.code ?? 'No code'}
                      </div>
                    </div>
                    <Badge variant={statusVariant(project.status)}>{project.status}</Badge>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-ink-muted">
                    <span>{project._count.timesheets} sheets</span>
                    <span>{project._count.tasks} tasks</span>
                    <span>{project.billingRate ? `₹${project.billingRate}` : 'No billing'}</span>
                  </div>
                </div>
              ))}
              {(projects ?? []).length === 0 && <EmptyState title="No projects" description="Add client projects before logging hours." />}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tasks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2">
              <Select value={taskForm.projectId} onChange={(e) => { setTaskForm((f) => ({ ...f, projectId: e.target.value })); setTaskProjectId(e.target.value); }}>
                <option value="">Select project</option>
                {(projects ?? []).map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </Select>
              <Input placeholder="Task name" value={taskForm.name} onChange={(e) => setTaskForm((f) => ({ ...f, name: e.target.value }))} />
              <Input placeholder="Code" value={taskForm.code} onChange={(e) => setTaskForm((f) => ({ ...f, code: e.target.value }))} />
              <Input placeholder="Description" value={taskForm.description} onChange={(e) => setTaskForm((f) => ({ ...f, description: e.target.value }))} />
              <Input placeholder="Rate override" type="number" value={taskForm.rateOverride} onChange={(e) => setTaskForm((f) => ({ ...f, rateOverride: e.target.value }))} />
              <Button onClick={() => createTask.mutate()} disabled={createTask.isPending || !taskForm.name}>
                <Plus className="h-4 w-4" />
                Create task
              </Button>
            </div>
            <div className="space-y-2">
              {(tasks ?? []).map((task) => (
                <div key={task.id} className="rounded-lg border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{task.name}</div>
                      <div className="text-xs text-ink-muted">
                        {(task.project?.name ?? 'All projects')} · {task.code ?? 'No code'}
                      </div>
                    </div>
                    <Badge variant={task.isBillable ? 'success' : 'outline'}>{task.isBillable ? 'Billable' : 'Internal'}</Badge>
                  </div>
                </div>
              ))}
              {(tasks ?? []).length === 0 && <EmptyState title="No tasks" description="Create tasks so timesheets can capture work at task level." />}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Manager approvals</CardTitle>
          </CardHeader>
          <CardContent className="overflow-hidden p-0">
            {(sheetPage?.data ?? []).length ? (
              <Table>
                <THead>
                  <TR>
                    <TH>Employee</TH>
                    <TH>Project</TH>
                    <TH>Week</TH>
                    <TH>Hours</TH>
                    <TH>Status</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {sheetPage!.data.map((t) => (
                    <TR key={t.id}>
                      <TD>
                        <div className="flex items-center gap-2">
                          <Avatar name={`${t.employee.firstName} ${t.employee.lastName}`} size="sm" />
                          <div>
                            <p className="font-medium">{t.employee.firstName} {t.employee.lastName}</p>
                            <p className="text-xs text-ink-muted">{t.employee.employeeCode}</p>
                          </div>
                        </div>
                      </TD>
                      <TD className="text-ink-muted">{t.project?.name ?? '—'}</TD>
                      <TD className="text-ink-muted">{formatDate(t.weekStart)}</TD>
                      <TD className="font-medium">{t.totalHours}h <span className="text-xs text-ink-muted">({t.billableHours}h billable)</span></TD>
                      <TD><Badge variant={statusVariant(t.status)}>{t.status}</Badge></TD>
                      <TD>
                        {t.status === 'SUBMITTED' ? (
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => approveTimesheet.mutate(t.id)} disabled={approveTimesheet.isPending}>
                              <CheckCircle2 className="h-4 w-4" />
                              Approve
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => rejectTimesheet.mutate(t.id)} disabled={rejectTimesheet.isPending}>
                              <XCircle className="h-4 w-4" />
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-ink-muted">No action</span>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : (
              <EmptyState icon={TriangleAlert} title="No timesheets" description="Saved and submitted entries will appear here." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Employee timesheets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(myTimesheets ?? []).map((t) => (
              <div key={t.id} className="rounded-lg border border-line p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{t.project?.name ?? 'Unassigned project'}</div>
                    <div className="text-xs text-ink-muted">{formatDate(t.weekStart)}</div>
                  </div>
                  <Badge variant={statusVariant(t.status)}>{t.status}</Badge>
                </div>
                <div className="mt-2 text-sm text-ink-muted">
                  {t.totalHours}h total · {t.billableHours}h billable
                </div>
                {t.status === 'DRAFT' && (
                  <div className="mt-3">
                    <Button size="sm" onClick={() => submitTimesheet.mutate(t.id)} disabled={submitTimesheet.isPending}>
                      Submit for approval
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {(myTimesheets ?? []).length === 0 && <EmptyState title="Nothing submitted yet" description="Draft or submit your weekly work log here." />}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Project utilization</CardTitle>
        </CardHeader>
        <CardContent className="overflow-hidden p-0">
          <Table>
            <THead>
              <TR>
                <TH>Employee</TH>
                <TH>Total</TH>
                <TH>Billable</TH>
                <TH>Utilization</TH>
                <TH>Billable rate</TH>
                <TH>Overtime</TH>
              </TR>
            </THead>
            <TBody>
              {(utilization?.employees ?? []).map((row: { employee: string; employeeCode: string; total: number; billable: number; utilizationRate: number; billableRate: number; overtime?: number }) => (
                <TR key={row.employeeCode}>
                  <TD>
                    <div className="flex items-center gap-2">
                      <Avatar name={row.employee} size="sm" />
                      <div>
                        <p className="font-medium">{row.employee}</p>
                        <p className="text-xs text-ink-muted">{row.employeeCode}</p>
                      </div>
                    </div>
                  </TD>
                  <TD>{row.total}h</TD>
                  <TD>{row.billable}h</TD>
                  <TD><Badge variant={row.utilizationRate >= 80 ? 'success' : 'warning'}>{row.utilizationRate}%</Badge></TD>
                  <TD><Badge variant={row.billableRate >= 70 ? 'success' : 'outline'}>{row.billableRate}%</Badge></TD>
                  <TD>{row.overtime ?? 0}h</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
