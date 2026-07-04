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

/** "New claim" button + dialog to submit an expense claim. */
export function PayrollNewExpenseDialog() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>('TRAVEL');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const create = useMutation({
    mutationFn: () =>
      api.post('/payroll/expenses', { category, amount: Number(amount), description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      toast('Expense claim submitted', 'success');
      setOpen(false);
      setAmount('');
      setDescription('');
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
