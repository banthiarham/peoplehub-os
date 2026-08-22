'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { useToast } from '@/components/ui/toaster';
import { payrollApiError } from './payroll-run-action-button';

const CATEGORIES = ['TRAVEL', 'MEALS', 'INTERNET', 'SUPPLIES', 'OTHER'] as const;

interface PayrollNewExpenseDialogProps {
  /** Query key invalidated once a claim is submitted. Defaults to the payroll admin tab. */
  invalidateKey?: readonly unknown[];
  /**
   * How the receipt is supplied. `'key'` keeps the administrative object-key field;
   * `'upload'` posts the file through `/files/upload` and attaches the key it returns, so
   * an employee never has to know that object keys exist.
   */
  receiptInput?: 'key' | 'upload';
}

/** "New claim" button + dialog to submit an expense claim for yourself. */
export function PayrollNewExpenseDialog({
  invalidateKey = ['payroll'],
  receiptInput = 'key',
}: PayrollNewExpenseDialogProps = {}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>('TRAVEL');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [receiptKey, setReceiptKey] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [reimbursementMethod, setReimbursementMethod] = useState('PAYROLL');

  const create = useMutation({
    mutationFn: async () => {
      // Upload the receipt to object storage first, then attach the key it returns - the
      // same two-step the document upload uses.
      let key = receiptKey.trim() || undefined;
      if (receiptInput === 'upload') {
        key = undefined;
        if (receiptFile) {
          const data = new FormData();
          data.append('file', receiptFile);
          const uploaded = await api
            .post('/files/upload', data, { headers: { 'Content-Type': 'multipart/form-data' } })
            .then((r) => r.data as { key: string });
          key = uploaded.key;
        }
      }
      return api.post('/payroll/expenses', {
        category,
        amount: Number(amount),
        description,
        receiptKey: key,
        reimbursementMethod,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...invalidateKey] });
      toast('Expense claim submitted', 'success');
      setOpen(false);
      setAmount('');
      setDescription('');
      setReceiptKey('');
      setReceiptFile(null);
    },
    onError: (err: unknown) => toast(payrollApiError(err), 'error'),
  });

  const valid = Number(amount) > 0 && description.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> New claim
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New expense claim</DialogTitle>
          <DialogDescription>Submit an expense for reimbursement.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1.5 text-xs font-medium text-ink-muted">
            Category
            <Select
              className="w-full"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0) + c.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </label>
          <label className="block space-y-1.5 text-xs font-medium text-ink-muted">
            Amount (₹)
            <Input
              type="number"
              min={1}
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="block space-y-1.5 text-xs font-medium text-ink-muted">
            Description
            <Input
              placeholder="What was this expense for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          {receiptInput === 'upload' ? (
            <label className="block space-y-1.5 text-xs font-medium text-ink-muted">
              Receipt (optional)
              <Input
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
              />
            </label>
          ) : (
            <label className="block space-y-1.5 text-xs font-medium text-ink-muted">
              Receipt file key
              <Input
                placeholder="file_objects key or S3 key"
                value={receiptKey}
                onChange={(e) => setReceiptKey(e.target.value)}
              />
            </label>
          )}
          <label className="block space-y-1.5 text-xs font-medium text-ink-muted">
            Reimbursement
            <Select
              className="w-full"
              value={reimbursementMethod}
              onChange={(e) => setReimbursementMethod(e.target.value)}
            >
              <option value="PAYROLL">Through payroll</option>
              <option value="DIRECT">Direct reimbursement</option>
            </Select>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !valid}>
            {create.isPending ? 'Submitting…' : 'Submit claim'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
