'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Plus } from 'lucide-react';
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

interface LoanRow {
  id: string;
  type: string;
  amount: number;
  outstanding: number;
  emiAmount: number;
  totalInstallments: number;
  paidInstallments: number;
  status: string;
  employee: EmployeeOption;
}

interface InstallmentRow {
  id: string;
  month: number;
  year: number;
  amount: number;
  openingBalance: number;
  closingBalance: number;
  status: string;
}

export function PayrollLoansTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState<LoanRow | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['payroll', 'loans'],
    queryFn: () => api.get('/payroll/loans').then((r) => r.data as LoanRow[]),
  });

  const action = useMutation({
    mutationFn: ({ id, type }: { id: string; type: 'close' | 'waive' }) => {
      if (type === 'waive') {
        const reason = window.prompt('Reason for loan waiver');
        if (!reason?.trim()) throw new Error('Waiver reason is required');
        return api.patch(`/payroll/loans/${id}/waive`, { reason: reason.trim() });
      }
      return api.patch(`/payroll/loans/${id}/close`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      toast('Loan updated', 'success');
    },
    onError: (err: unknown) => toast(payrollApiError(err), 'error'),
  });

  const rows = data ?? [];

  return (
    <Card>
      <div className="flex items-center justify-end border-b border-line p-4">
        <PayrollNewLoanDialog />
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
              <TH>Type</TH>
              <TH>Status</TH>
              <TH className="text-right">EMI</TH>
              <TH className="text-right">Outstanding</TH>
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
                <TD><Badge variant="outline">{row.type}</Badge></TD>
                <TD><Badge variant={statusVariant(row.status)}>{row.status}</Badge></TD>
                <TD className="text-right tabular-nums">{formatINR(row.emiAmount)}</TD>
                <TD className="text-right font-medium tabular-nums">{formatINR(row.outstanding)}</TD>
                <TD>
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => setSelected(row)}>Schedule</Button>
                    {row.status === 'ACTIVE' && (
                      <>
                        <Button size="sm" variant="secondary" disabled={action.isPending} onClick={() => action.mutate({ id: row.id, type: 'close' })}>Close</Button>
                        <Button size="sm" variant="outline" className="text-danger" disabled={action.isPending} onClick={() => action.mutate({ id: row.id, type: 'waive' })}>Waive</Button>
                      </>
                    )}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : (
        <EmptyState icon={Banknote} title="No loans or advances" description="Create salary advances or loans and let payroll deduct EMIs automatically." />
      )}
      <LoanScheduleDialog loan={selected} onClose={() => setSelected(null)} />
    </Card>
  );
}

function PayrollNewLoanDialog() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [type, setType] = useState('LOAN');
  const [amount, setAmount] = useState('');
  const [emiAmount, setEmiAmount] = useState('');
  const [installments, setInstallments] = useState('12');

  const { data: employees } = useQuery({
    queryKey: ['employees', 'options', 'loan'],
    queryFn: () => api.get('/employees', { params: { pageSize: 100 } }).then((r) => r.data.data as EmployeeOption[]),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () => api.post('/payroll/loans', {
      employeeId,
      type,
      amount: Number(amount),
      emiAmount: Number(emiAmount),
      totalInstallments: Number(installments),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      toast('Loan or advance created', 'success');
      setOpen(false);
      setAmount('');
      setEmiAmount('');
    },
    onError: (err: unknown) => toast(payrollApiError(err), 'error'),
  });

  const valid = employeeId && Number(amount) > 0 && Number(emiAmount) > 0 && Number(installments) > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4" /> New loan</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Loan or advance</DialogTitle>
          <DialogDescription>Create a repayment schedule. Active EMIs deduct during payroll lock.</DialogDescription>
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
          <label className="block space-y-1.5 text-xs font-medium text-ink-muted">
            Type
            <Select className="w-full" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="LOAN">Loan</option>
              <option value="ADVANCE">Advance</option>
            </Select>
          </label>
          <label className="block space-y-1.5 text-xs font-medium text-ink-muted">
            Amount
            <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="block space-y-1.5 text-xs font-medium text-ink-muted">
            EMI
            <Input type="number" min={1} value={emiAmount} onChange={(e) => setEmiAmount(e.target.value)} />
          </label>
          <label className="block space-y-1.5 text-xs font-medium text-ink-muted">
            Installments
            <Input type="number" min={1} value={installments} onChange={(e) => setInstallments(e.target.value)} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!valid || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LoanScheduleDialog({ loan, onClose }: { loan: LoanRow | null; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ['payroll', 'loans', loan?.id, 'installments'],
    queryFn: () => api.get(`/payroll/loans/${loan?.id}/installments`).then((r) => r.data as InstallmentRow[]),
    enabled: !!loan,
  });

  return (
    <Dialog open={!!loan} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Repayment schedule</DialogTitle>
          <DialogDescription>
            {loan ? `${loan.employee.firstName} ${loan.employee.lastName} · ${formatINR(loan.outstanding)} outstanding` : ''}
          </DialogDescription>
        </DialogHeader>
        <Table>
          <THead>
            <TR>
              <TH>Period</TH>
              <TH>Status</TH>
              <TH className="text-right">Opening</TH>
              <TH className="text-right">EMI</TH>
              <TH className="text-right">Closing</TH>
            </TR>
          </THead>
          <TBody>
            {(data ?? []).map((row) => (
              <TR key={row.id}>
                <TD>{row.month}/{row.year}</TD>
                <TD><Badge variant={statusVariant(row.status)}>{row.status}</Badge></TD>
                <TD className="text-right tabular-nums">{formatINR(row.openingBalance)}</TD>
                <TD className="text-right tabular-nums">{formatINR(row.amount)}</TD>
                <TD className="text-right tabular-nums">{formatINR(row.closingBalance)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
