'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Paperclip, ReceiptText } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { formatDate, formatINR } from '@/lib/utils';
import { ExpenseClaimDetailDialog } from '@/components/forms/expense-claim-detail-dialog';
import { PayrollNewExpenseDialog } from '@/components/forms/payroll-new-expense-dialog';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

interface ExpenseRow {
  id: string;
  category: string;
  amount: number;
  description: string | null;
  status: string;
  clarificationNote: string | null;
  reimbursementMethod: string;
  receiptKey: string | null;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  CLARIFICATION_REQUESTED: 'NEEDS INFO',
};

export default function MyExpensesPage() {
  const [openClaimId, setOpenClaimId] = useState<string | null>(null);
  const { data: claims, isLoading } = useQuery<ExpenseRow[]>({
    queryKey: ['payroll', 'my-expenses'],
    queryFn: () => api.get('/payroll/expenses/me').then((r) => r.data),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">My expenses</h1>
        <PayrollNewExpenseDialog invalidateKey={['payroll', 'my-expenses']} receiptInput="upload" />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : claims?.length ? (
        <div className="space-y-2">
          {claims.map((claim) => (
            <Card key={claim.id} className="p-0">
              <button
                type="button"
                className="w-full p-3.5 text-left"
                onClick={() => setOpenClaimId(claim.id)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {claim.category.replace(/_/g, ' ')} · {formatINR(claim.amount)}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-muted">
                      {claim.receiptKey && <Paperclip className="h-3 w-3 shrink-0" />}
                      {formatDate(claim.createdAt)}
                      {claim.description ? ` · ${claim.description}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge variant={statusVariant(claim.status)}>
                      {STATUS_LABEL[claim.status] ?? claim.status}
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-ink-faint" />
                  </div>
                </div>
                {claim.status === 'CLARIFICATION_REQUESTED' && claim.clarificationNote && (
                  <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-ink-muted">
                    {claim.clarificationNote} · Tap to answer
                  </p>
                )}
              </button>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={ReceiptText}
          title="No claims yet"
          description="Submit an expense to have it reviewed for reimbursement."
        />
      )}

      <ExpenseClaimDetailDialog
        id={openClaimId}
        open={Boolean(openClaimId)}
        onOpenChange={(next) => !next && setOpenClaimId(null)}
        canRespond
        invalidateKey={['payroll', 'my-expenses']}
      />
    </div>
  );
}
