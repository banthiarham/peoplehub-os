'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeIndianRupee, History, Pencil, Plus, Trash2 } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { formatDate, formatINR } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useToast } from '@/components/ui/toaster';
import { payrollApiError } from './payroll-run-action-button';

interface SalaryRow {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  department?: { name: string } | null;
  currentSalary?: { id: string; ctc: number; effectiveFrom: string; components: unknown[] } | null;
}

interface StructureOption {
  id: string;
  name: string;
}

interface SalaryPreview {
  monthlyCtc: number;
  monthlyGross: number;
  monthlyDeductions: number;
  monthlyNet: number;
  components: Array<{ code: string; name: string; type: string; monthly: number; annual: number }>;
}

interface SalaryHistoryEntry {
  id: string;
  salaryStructureId: string;
  ctc: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  salaryStructure: { name: string };
}

export function PayrollSalariesTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['payroll', 'salaries'],
    queryFn: () => api.get('/payroll/salaries', { params: { pageSize: 100 } }).then((r) => r.data),
  });
  const rows: SalaryRow[] = data?.data ?? [];
  return (
    <Card>
      <div className="flex items-center justify-end border-b border-line p-4">
        <PayrollAssignSalaryDialog />
      </div>
      {isLoading ? (
        <div className="space-y-2 p-4">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : rows.length ? (
        <Table>
          <THead>
            <TR>
              <TH>Employee</TH>
              <TH>Department</TH>
              <TH>Components</TH>
              <TH className="text-right">Current CTC</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.id}>
                <TD>
                  <div className="flex items-center gap-3">
                    <Avatar name={`${row.firstName} ${row.lastName}`} size="sm" />
                    <span>
                      <span className="block font-medium">{row.firstName} {row.lastName}</span>
                      <span className="block text-xs text-ink-muted">{row.employeeCode}</span>
                    </span>
                  </div>
                </TD>
                <TD>{row.department?.name ?? '—'}</TD>
                <TD><Badge variant="outline">{row.currentSalary?.components?.length ?? 0} lines</Badge></TD>
                <TD className="text-right font-medium tabular-nums">{row.currentSalary ? formatINR(row.currentSalary.ctc, true) : '—'}</TD>
                <TD className="text-right">
                  <PayrollSalaryHistoryDialog
                    employeeId={row.id}
                    employeeName={`${row.firstName} ${row.lastName}`}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : (
        <EmptyState icon={BadgeIndianRupee} title="No employee salaries" description="Assign CTC templates before payroll processing." />
      )}
    </Card>
  );
}

function PayrollAssignSalaryDialog() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [salaryStructureId, setSalaryStructureId] = useState('');
  const [ctc, setCtc] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [effectiveTo, setEffectiveTo] = useState('');

  const { data: employees } = useQuery({
    queryKey: ['payroll', 'salaries', 'employees'],
    queryFn: () => api.get('/employees', { params: { pageSize: 100 } }).then((r) => r.data.data as SalaryRow[]),
    enabled: open,
  });
  const { data: structures } = useQuery({
    queryKey: ['payroll', 'structures', 'salary-assign'],
    queryFn: () => api.get('/payroll/structures').then((r) => r.data as StructureOption[]),
    enabled: open,
  });
  const { data: preview } = useQuery({
    queryKey: ['payroll', 'structures', salaryStructureId, 'preview', ctc],
    queryFn: () =>
      api
        .post(`/payroll/structures/${salaryStructureId}/preview`, { ctc: Number(ctc) })
        .then((r) => r.data as SalaryPreview),
    enabled: open && !!salaryStructureId && Number(ctc) > 0,
  });

  const assign = useMutation({
    mutationFn: () => api.post('/payroll/salaries', {
      employeeId,
      salaryStructureId,
      ctc: Number(ctc),
      effectiveFrom,
      effectiveTo: effectiveTo || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      toast('Salary assigned', 'success');
      setOpen(false);
      setCtc('');
      setEffectiveTo('');
    },
    onError: (err: unknown) => toast(payrollApiError(err), 'error'),
  });

  const valid = employeeId && salaryStructureId && Number(ctc) > 0 && effectiveFrom;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4" /> Assign salary</Button>
      </DialogTrigger>
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign salary</DialogTitle>
          <DialogDescription>Assign a CTC template and effective date. Previous active salary closes automatically. Leave "Effective to" blank for an open-ended revision.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 block space-y-1.5 text-xs font-medium text-ink-muted">
            Employee
            <Select className="w-full" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Select...</option>
              {employees?.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName} ({employee.employeeCode})</option>
              ))}
            </Select>
          </label>
          <label className="col-span-2 block space-y-1.5 text-xs font-medium text-ink-muted">
            Structure
            <Select className="w-full" value={salaryStructureId} onChange={(e) => setSalaryStructureId(e.target.value)}>
              <option value="">Select...</option>
              {structures?.map((structure) => (
                <option key={structure.id} value={structure.id}>{structure.name}</option>
              ))}
            </Select>
          </label>
          <label className="block space-y-1.5 text-xs font-medium text-ink-muted">
            Annual CTC
            <Input type="number" min={1} value={ctc} onChange={(e) => setCtc(e.target.value)} />
          </label>
          <label className="block space-y-1.5 text-xs font-medium text-ink-muted">
            Effective from
            <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </label>
          <label className="block space-y-1.5 text-xs font-medium text-ink-muted">
            Effective to (optional)
            <Input type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
          </label>
        </div>
        {preview && (
          <div className="rounded-lg border border-line p-3">
            <div className="mb-3 grid gap-2 text-sm sm:grid-cols-4">
              <PreviewStat label="Monthly CTC" value={preview.monthlyCtc} />
              <PreviewStat label="Gross" value={preview.monthlyGross} />
              <PreviewStat label="Deductions" value={preview.monthlyDeductions} />
              <PreviewStat label="Net" value={preview.monthlyNet} />
            </div>
            <Table>
              <THead>
                <TR>
                  <TH>Code</TH>
                  <TH>Name</TH>
                  <TH>Type</TH>
                  <TH className="text-right">Monthly</TH>
                </TR>
              </THead>
              <TBody>
                {preview.components.map((line) => (
                  <TR key={`${line.code}-${line.type}`}>
                    <TD>{line.code}</TD>
                    <TD>{line.name}</TD>
                    <TD><Badge variant="outline">{line.type}</Badge></TD>
                    <TD className="text-right tabular-nums">{formatINR(line.monthly)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!valid || assign.isPending} onClick={() => assign.mutate()}>
            {assign.isPending ? 'Assigning...' : 'Assign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayrollSalaryHistoryDialog({ employeeId, employeeName }: { employeeId: string; employeeName: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editingRevision, setEditingRevision] = useState<SalaryHistoryEntry | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['payroll', 'salaries', employeeId, 'history'],
    queryFn: () => api.get(`/payroll/salaries/${employeeId}`).then((r) => r.data as { history: SalaryHistoryEntry[] }),
    enabled: open,
  });
  const history = data?.history ?? [];

  const deleteRevision = useMutation({
    mutationFn: (revisionId: string) => api.delete(`/payroll/salaries/${revisionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      toast('Salary revision deleted', 'success');
    },
    onError: (err: unknown) => toast(payrollApiError(err), 'error'),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setEditingRevision(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><History className="h-4 w-4" /> History</Button>
      </DialogTrigger>
      <DialogContent className="max-w-full sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Salary history</DialogTitle>
          <DialogDescription>{employeeName} — every salary revision, most recent first.</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : history.length ? (
          <Table>
            <THead>
              <TR>
                <TH className="whitespace-nowrap">Effective from</TH>
                <TH className="whitespace-nowrap">Effective to</TH>
                <TH>Structure</TH>
                <TH className="whitespace-nowrap text-right">CTC</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {history.map((revision) => (
                <TR key={revision.id}>
                  <TD className="whitespace-nowrap">{formatDate(revision.effectiveFrom)}</TD>
                  <TD className="whitespace-nowrap">
                    {revision.effectiveTo ? (
                      formatDate(revision.effectiveTo)
                    ) : (
                      <Badge variant="success">Current / open-ended</Badge>
                    )}
                  </TD>
                  <TD>
                    <span className="block max-w-[10rem] truncate sm:max-w-[14rem]" title={revision.salaryStructure.name}>
                      {revision.salaryStructure.name}
                    </span>
                  </TD>
                  <TD className="whitespace-nowrap text-right font-medium tabular-nums">{formatINR(revision.ctc, true)}</TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Edit salary revision"
                        title="Edit"
                        onClick={() => setEditingRevision(revision)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Delete salary revision"
                        title="Delete"
                        disabled={deleteRevision.isPending}
                        onClick={() => {
                          if (window.confirm('Delete this salary revision? This cannot be undone.')) {
                            deleteRevision.mutate(revision.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState icon={BadgeIndianRupee} title="No salary history" description="This employee has no salary revisions yet." />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
      {editingRevision && (
        <PayrollEditSalaryDialog
          key={editingRevision.id}
          employeeId={employeeId}
          employeeName={employeeName}
          revision={editingRevision}
          open={Boolean(editingRevision)}
          onOpenChange={(next) => {
            if (!next) setEditingRevision(null);
          }}
        />
      )}
    </Dialog>
  );
}

/**
 * Edits an existing salary revision in place. `effectiveFrom` is read-only here: the backend
 * matches a revision to update by employeeId + effectiveFrom exactly, so changing it would
 * create a new revision instead of updating this one.
 */
function PayrollEditSalaryDialog({
  employeeId,
  employeeName,
  revision,
  open,
  onOpenChange,
}: {
  employeeId: string;
  employeeName: string;
  revision: SalaryHistoryEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [salaryStructureId, setSalaryStructureId] = useState(revision.salaryStructureId);
  const [ctc, setCtc] = useState(String(revision.ctc));
  const [effectiveTo, setEffectiveTo] = useState(revision.effectiveTo ? revision.effectiveTo.slice(0, 10) : '');

  const { data: structures } = useQuery({
    queryKey: ['payroll', 'structures', 'salary-assign'],
    queryFn: () => api.get('/payroll/structures').then((r) => r.data as StructureOption[]),
    enabled: open,
  });
  const { data: preview } = useQuery({
    queryKey: ['payroll', 'structures', salaryStructureId, 'preview', ctc],
    queryFn: () =>
      api
        .post(`/payroll/structures/${salaryStructureId}/preview`, { ctc: Number(ctc) })
        .then((r) => r.data as SalaryPreview),
    enabled: open && !!salaryStructureId && Number(ctc) > 0,
  });

  const update = useMutation({
    mutationFn: () => api.post('/payroll/salaries', {
      employeeId,
      salaryStructureId,
      ctc: Number(ctc),
      effectiveFrom: revision.effectiveFrom.slice(0, 10),
      effectiveTo: effectiveTo || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      toast('Salary revision updated', 'success');
      onOpenChange(false);
    },
    onError: (err: unknown) => toast(payrollApiError(err), 'error'),
  });

  const valid = salaryStructureId && Number(ctc) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit salary revision</DialogTitle>
          <DialogDescription>{employeeName} — revision effective {revision.effectiveFrom.slice(0, 10)}. Editable until payroll for this period is locked.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Structure">
            <Select className="w-full" value={salaryStructureId} onChange={(e) => setSalaryStructureId(e.target.value)}>
              {structures?.map((structure) => (
                <option key={structure.id} value={structure.id}>{structure.name}</option>
              ))}
            </Select>
          </Labeled>
          <Labeled label="Annual CTC">
            <Input type="number" min={1} value={ctc} onChange={(e) => setCtc(e.target.value)} />
          </Labeled>
          <Labeled label="Effective from">
            <Input type="date" value={revision.effectiveFrom.slice(0, 10)} disabled />
          </Labeled>
          <Labeled label="Effective to (optional)">
            <Input type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
          </Labeled>
        </div>
        {preview && (
          <div className="rounded-lg border border-line p-3">
            <div className="mb-3 grid gap-2 text-sm sm:grid-cols-4">
              <PreviewStat label="Monthly CTC" value={preview.monthlyCtc} />
              <PreviewStat label="Gross" value={preview.monthlyGross} />
              <PreviewStat label="Deductions" value={preview.monthlyDeductions} />
              <PreviewStat label="Net" value={preview.monthlyNet} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!valid || update.isPending} onClick={() => update.mutate()}>
            {update.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5 text-xs font-medium text-ink-muted">
      {label}
      {children}
    </label>
  );
}

function PreviewStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-canvas p-2">
      <span className="block text-xs text-ink-muted">{label}</span>
      <span className="font-medium tabular-nums">{formatINR(value)}</span>
    </div>
  );
}
