'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatDate, formatINR } from '@/lib/utils';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toaster';
import { OpsTextarea } from './ops-textarea';
import { payrollApiError } from './payroll-run-action-button';

interface ExpenseClaimDetail {
  id: string;
  category: string;
  amount: number;
  currency: string;
  description: string | null;
  status: string;
  receiptKey: string | null;
  reimbursementMethod: string;
  clarificationNote: string | null;
  clarificationResponse: string | null;
  createdAt: string;
  employee?: { firstName: string; lastName: string; employeeCode: string };
}

interface ExpenseClaimDetailDialogProps {
  /** Claim to show; the dialog fetches nothing until it is set and `open` is true. */
  id: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shows the claimant's reply box while the claim is awaiting clarification. */
  canRespond?: boolean;
  /** Query key invalidated after a resubmit. Defaults to the payroll admin tab. */
  invalidateKey?: readonly unknown[];
}

/**
 * Read-only view of one claim - amount, receipt and the clarification thread - shared by
 * the employee portal and the payroll approver tab. The claimant additionally gets the
 * reply box that puts the claim back in front of the approver.
 */
export function ExpenseClaimDetailDialog({
  id,
  open,
  onOpenChange,
  canRespond = false,
  invalidateKey = ['payroll'],
}: ExpenseClaimDetailDialogProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [response, setResponse] = useState('');
  const [amount, setAmount] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const { data: claim, isLoading } = useQuery<ExpenseClaimDetail>({
    queryKey: ['payroll', 'expense', id],
    queryFn: () => api.get(`/payroll/expenses/${id}`).then((r) => r.data),
    enabled: open && Boolean(id),
  });

  // A fresh claim starts from an empty reply box rather than the previous one's draft.
  useEffect(() => {
    setResponse('');
    setAmount('');
    setReceiptFile(null);
  }, [id, open]);

  const openReceipt = async () => {
    if (!claim?.receiptKey) return;
    try {
      const { url } = await api
        .get('/files/download-url', { params: { key: claim.receiptKey, disposition: 'inline' } })
        .then((r) => r.data);
      window.open(url, '_blank');
    } catch {
      toast('Receipt not found in storage', 'error');
    }
  };

  const resubmit = useMutation({
    mutationFn: async () => {
      let receiptKey: string | undefined;
      if (receiptFile) {
        const data = new FormData();
        data.append('file', receiptFile);
        receiptKey = await api
          .post('/files/upload', data, { headers: { 'Content-Type': 'multipart/form-data' } })
          .then((r) => (r.data as { key: string }).key);
      }
      return api.patch(`/payroll/expenses/${id}/respond`, {
        response,
        amount: amount.trim() ? Number(amount) : undefined,
        receiptKey,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...invalidateKey] });
      queryClient.invalidateQueries({ queryKey: ['payroll', 'expense', id] });
      toast('Claim resubmitted for review', 'success');
      onOpenChange(false);
    },
    onError: (err: unknown) => toast(payrollApiError(err), 'error'),
  });

  const awaitingClarification = claim?.status === 'CLARIFICATION_REQUESTED';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="pr-8">
          <DialogTitle>Expense claim</DialogTitle>
          <DialogDescription className="truncate">
            {claim?.employee
              ? `${claim.employee.firstName} ${claim.employee.lastName} · ${claim.employee.employeeCode}`
              : 'Details and receipt'}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !claim ? (
          <div className="space-y-2">
            <Skeleton className="h-5" />
            <Skeleton className="h-20" />
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-canvas px-3.5 py-3">
              <span className="text-lg font-semibold tabular-nums">{formatINR(claim.amount)}</span>
              <Badge variant={statusVariant(claim.status)}>{claim.status}</Badge>
            </div>

            <div className="space-y-2">
              <Detail label="Category" value={claim.category.replace(/_/g, ' ')} />
              <Detail
                label="Reimbursement"
                value={claim.reimbursementMethod === 'DIRECT' ? 'Direct' : 'Through payroll'}
              />
              <Detail label="Submitted" value={formatDate(claim.createdAt)} />
              {claim.description && <Detail label="Description" value={claim.description} />}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
              <span className="text-xs text-ink-muted">Receipt</span>
              {claim.receiptKey ? (
                <Button size="sm" variant="outline" onClick={openReceipt}>
                  <Paperclip className="h-3.5 w-3.5" /> View
                </Button>
              ) : (
                <span className="text-sm text-ink-muted">Not attached</span>
              )}
            </div>

            {claim.clarificationNote && (
              <div className="rounded-xl bg-amber-50 px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-muted">
                  Clarification requested
                </p>
                <p className="mt-1 text-sm">{claim.clarificationNote}</p>
                {claim.clarificationResponse && (
                  <p className="mt-2 border-t border-line/60 pt-2 text-sm">
                    <span className="text-ink-muted">Reply: </span>
                    {claim.clarificationResponse}
                  </p>
                )}
              </div>
            )}

            {canRespond && awaitingClarification && (
              <div className="space-y-2 border-t border-line pt-3">
                <label className="block space-y-1.5 text-xs font-medium text-ink-muted">
                  Your answer
                  <OpsTextarea
                    placeholder="Answer the question and resubmit for review"
                    value={response}
                    onChange={(e) => setResponse(e.target.value)}
                  />
                </label>
                <label className="block space-y-1.5 text-xs font-medium text-ink-muted">
                  Corrected amount (optional)
                  <Input
                    type="number"
                    min={1}
                    placeholder={String(claim.amount)}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                <label className="block space-y-1.5 text-xs font-medium text-ink-muted">
                  Replace receipt (optional)
                  <Input
                    type="file"
                    accept="image/*,application/pdf"
                    capture="environment"
                    onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {canRespond && awaitingClarification && (
            <Button
              onClick={() => resubmit.mutate()}
              disabled={resubmit.isPending || !response.trim()}
            >
              {resubmit.isPending ? 'Resubmitting…' : 'Resubmit'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <span className="shrink-0 text-xs text-ink-muted">{label}</span>
      <span className="min-w-0 break-words text-right text-sm">{value}</span>
    </div>
  );
}
