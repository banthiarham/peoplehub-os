'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, ReceiptText } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { downloadFile } from '@/lib/download';
import { formatINR } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useToast } from '@/components/ui/toaster';
import { PayrollNewExpenseDialog } from './payroll-new-expense-dialog';
import { payrollApiError } from './payroll-run-action-button';

interface ExpenseRow {
  id: string;
  category: string;
  amount: number;
  description: string;
  status: string;
  receiptKey?: string | null;
  reimbursementMethod: string;
  clarificationNote?: string | null;
  createdAt: string;
  employee: { firstName: string; lastName: string; employeeCode: string };
}

type ExpenseAction = 'approve' | 'reject' | 'reimburse' | 'clarify';

const ACTION_SUCCESS: Record<ExpenseAction, string> = {
  approve: 'Expense approved',
  reject: 'Expense rejected',
  reimburse: 'Expense marked reimbursed',
  clarify: 'Clarification requested',
};

export function PayrollExpensesTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState('SUBMITTED');

  const { data, isLoading } = useQuery({
    queryKey: ['payroll', 'expenses', status],
    queryFn: () =>
      api.get('/payroll/expenses', { params: { status: status || undefined } }).then((r) => r.data),
  });

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: ExpenseAction }) =>
      api.patch(`/payroll/expenses/${id}/${action}`, action === 'clarify' ? { note: window.prompt('Clarification note') ?? '' } : {}),
    onSuccess: (_res, { action }) => {
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      toast(ACTION_SUCCESS[action], 'success');
    },
    onError: (err: unknown) => toast(payrollApiError(err), 'error'),
  });

  const rows: ExpenseRow[] = data?.data ?? [];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="APPROVED">Approved</option>
          <option value="CLARIFICATION_REQUESTED">Needs clarification</option>
          <option value="REJECTED">Rejected</option>
          <option value="PAID">Paid</option>
        </Select>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              downloadFile(`/payroll/expenses/export${status ? `?status=${status}` : ''}`, 'expense-report.csv')
            }
          >
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
          <PayrollNewExpenseDialog />
        </div>
      </div>
      {isLoading ? (
        <div className="space-y-2 p-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : rows.length ? (
        <Table>
          <THead>
            <TR>
              <TH>Claimant</TH>
              <TH>Category</TH>
              <TH>Amount</TH>
              <TH>Description</TH>
              <TH>Receipt</TH>
              <TH>Status</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD>
                  <div className="flex items-center gap-3">
                    <Avatar name={`${r.employee.firstName} ${r.employee.lastName}`} size="sm" />
                    <span>
                      <span className="block font-medium">
                        {r.employee.firstName} {r.employee.lastName}
                      </span>
                      <span className="block text-xs text-ink-muted">{r.employee.employeeCode}</span>
                    </span>
                  </div>
                </TD>
                <TD>
                  <Badge variant="outline">{r.category}</Badge>
                </TD>
                <TD className="font-medium tabular-nums">{formatINR(r.amount)}</TD>
                <TD className="max-w-56 truncate text-ink-muted">
                  <span className="block">{r.description}</span>
                  <span className="block text-xs">{r.reimbursementMethod === 'DIRECT' ? 'Direct' : 'Through payroll'}</span>
                  {r.clarificationNote && <span className="block text-xs text-warning">{r.clarificationNote}</span>}
                </TD>
                <TD className="max-w-36 truncate text-xs text-ink-muted">{r.receiptKey ?? '—'}</TD>
                <TD>
                  <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                </TD>
                <TD>
                  {r.status === 'SUBMITTED' && (
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={act.isPending}
                        onClick={() => act.mutate({ id: r.id, action: 'approve' })}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-danger"
                        disabled={act.isPending}
                        onClick={() => act.mutate({ id: r.id, action: 'reject' })}
                      >
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={act.isPending}
                        onClick={() => act.mutate({ id: r.id, action: 'clarify' })}
                      >
                        Clarify
                      </Button>
                    </div>
                  )}
                  {r.status === 'APPROVED' && r.reimbursementMethod === 'DIRECT' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={act.isPending}
                      onClick={() => act.mutate({ id: r.id, action: 'reimburse' })}
                    >
                      Mark reimbursed
                    </Button>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : (
        <EmptyState icon={ReceiptText} title="No expense claims" description="Nothing here for this filter." />
      )}
    </Card>
  );
}
