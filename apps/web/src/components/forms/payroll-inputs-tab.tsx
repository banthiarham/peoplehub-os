'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, SlidersHorizontal } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/utils';
import { Badge, statusVariant } from '@/components/ui/badge';
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

interface EmployeeOption {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
}

interface PayrollInputRow {
  id: string;
  type: string;
  label: string;
  amount: number;
  taxable: boolean;
  month: number;
  year: number;
  status: string;
  employee: EmployeeOption;
}

const TYPES = ['BONUS', 'ARREAR', 'INCENTIVE', 'OVERTIME', 'REIMBURSEMENT', 'DEDUCTION', 'LEAVE_ENCASHMENT', 'FULL_AND_FINAL'];

export function PayrollInputsTab() {
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['payroll', 'inputs', month, year],
    queryFn: () =>
      api.get('/payroll/inputs', { params: { month: month || undefined, year: year || undefined } }).then((r) => r.data),
  });
  const rows: PayrollInputRow[] = data?.data ?? [];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
        <div className="flex gap-2">
          <Input className="w-24" type="number" min={1} max={12} placeholder="Month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <Input className="w-28" type="number" min={2020} placeholder="Year" value={year} onChange={(e) => setYear(e.target.value)} />
        </div>
        <PayrollNewInputDialog />
      </div>
      {isLoading ? (
        <div className="space-y-2 p-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : rows.length ? (
        <Table>
          <THead>
            <TR>
              <TH>Employee</TH>
              <TH>Input</TH>
              <TH>Period</TH>
              <TH>Status</TH>
              <TH className="text-right">Amount</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.id}>
                <TD>
                  <span className="block font-medium">{row.employee.firstName} {row.employee.lastName}</span>
                  <span className="block text-xs text-ink-muted">{row.employee.employeeCode}</span>
                </TD>
                <TD>
                  <Badge variant="outline">{row.type}</Badge>
                  <span className="ml-2 text-ink-muted">{row.label}</span>
                </TD>
                <TD>{row.month}/{row.year}</TD>
                <TD><Badge variant={statusVariant(row.status)}>{row.status}</Badge></TD>
                <TD className="text-right font-medium tabular-nums">{formatINR(row.amount)}</TD>
                <TD><PayrollInputRowActions row={row} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : (
        <EmptyState icon={SlidersHorizontal} title="No payroll inputs" description="Add bonuses, arrears, overtime, deductions, encashment or settlement values." />
      )}
    </Card>
  );
}

function PayrollNewInputDialog() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [type, setType] = useState('BONUS');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [taxable, setTaxable] = useState(true);

  const { data: employees } = useQuery({
    queryKey: ['employees', 'options', 'payroll-input'],
    queryFn: () => api.get('/employees', { params: { pageSize: 100 } }).then((r) => r.data.data as EmployeeOption[]),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () => api.post('/payroll/inputs', {
      employeeId,
      type,
      label: label.trim() || type.replace(/_/g, ' '),
      amount: Number(amount),
      month: Number(month),
      year: Number(year),
      taxable,
      status: 'APPROVED',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      toast('Payroll input added', 'success');
      setOpen(false);
      setAmount('');
      setLabel('');
    },
    onError: (err: unknown) => toast(payrollApiError(err), 'error'),
  });

  const valid = employeeId && Number(amount) > 0 && Number(month) >= 1 && Number(year) >= 2020;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4" /> Add input</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Payroll input</DialogTitle>
          <DialogDescription>Add a one-time earning, reimbursement, deduction, encashment or settlement value.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Employee">
            <Select className="w-full" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Select...</option>
              {employees?.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName} ({employee.employeeCode})</option>
              ))}
            </Select>
          </Labeled>
          <Labeled label="Type">
            <Select className="w-full" value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((item) => <option key={item} value={item}>{item.replace(/_/g, ' ')}</option>)}
            </Select>
          </Labeled>
          <Labeled label="Label">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Performance bonus" />
          </Labeled>
          <Labeled label="Amount">
            <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Labeled>
          <Labeled label="Month">
            <Input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(e.target.value)} />
          </Labeled>
          <Labeled label="Year">
            <Input type="number" min={2020} value={year} onChange={(e) => setYear(e.target.value)} />
          </Labeled>
          <label className="col-span-2 flex items-center gap-2 text-sm text-ink-muted">
            <input type="checkbox" checked={taxable} onChange={(e) => setTaxable(e.target.checked)} />
            Taxable for TDS projection
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!valid || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Adding...' : 'Add input'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Mirrors PayrollService.updatePayrollInput / decidePayrollInput: DRAFT/SUBMITTED/APPROVED
// inputs can still be edited (until the backend rejects it once payroll is locked), but only
// DRAFT/SUBMITTED inputs can be approved or rejected - an APPROVED input is already decided.
const EDITABLE_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED'];
const DECIDABLE_STATUSES = ['DRAFT', 'SUBMITTED'];

function PayrollInputRowActions({ row }: { row: PayrollInputRow }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editOpen, setEditOpen] = useState(false);

  const decide = useMutation({
    mutationFn: (decision: 'approve' | 'reject') => api.patch(`/payroll/inputs/${row.id}/${decision}`),
    onSuccess: (_data, decision) => {
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      toast(decision === 'approve' ? 'Payroll input approved' : 'Payroll input rejected', 'success');
    },
    onError: (err: unknown) => toast(payrollApiError(err), 'error'),
  });

  const editable = EDITABLE_STATUSES.includes(row.status);
  const decidable = DECIDABLE_STATUSES.includes(row.status);
  if (!editable && !decidable) return null;

  return (
    <div className="flex justify-end gap-2">
      {editable && (
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>Edit</Button>
      )}
      {decidable && (
        <>
          <Button
            variant="outline"
            size="sm"
            disabled={decide.isPending}
            onClick={() => decide.mutate('approve')}
          >
            Approve
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={decide.isPending}
            onClick={() => decide.mutate('reject')}
          >
            Reject
          </Button>
        </>
      )}
      {editable && <PayrollEditInputDialog row={row} open={editOpen} onOpenChange={setEditOpen} />}
    </div>
  );
}

function PayrollEditInputDialog({
  row,
  open,
  onOpenChange,
}: {
  row: PayrollInputRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [label, setLabel] = useState(row.label);
  const [amount, setAmount] = useState(String(row.amount));

  const update = useMutation({
    mutationFn: () => api.patch(`/payroll/inputs/${row.id}`, { label, amount: Number(amount) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      toast('Payroll input updated', 'success');
      onOpenChange(false);
    },
    onError: (err: unknown) => toast(payrollApiError(err), 'error'),
  });

  const valid = label.trim().length > 0 && Number(amount) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit payroll input</DialogTitle>
          <DialogDescription>Review and correct this input. Locked once its payroll period is locked.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Label">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </Labeled>
          <Labeled label="Amount">
            <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Labeled>
        </div>
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
