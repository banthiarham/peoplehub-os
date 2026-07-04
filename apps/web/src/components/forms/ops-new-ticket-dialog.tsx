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
} from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { useToast } from '@/components/ui/toaster';
import { OpsTextarea } from './ops-textarea';
import { apiErrorMessage } from './ops-utils';

const CATEGORIES = ['HR', 'PAYROLL', 'LEAVE', 'IT', 'FACILITIES', 'OTHER'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

const initialForm = { category: 'HR', subject: '', description: '', priority: 'MEDIUM' };

export function OpsNewTicketDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const toast = useToast();
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: () => api.post('/helpdesk/tickets', form).then((r) => r.data),
    onSuccess: () => {
      toast('Ticket created');
      queryClient.invalidateQueries({ queryKey: ['helpdesk'] });
      setForm(initialForm);
      setOpen(false);
    },
    onError: (err) => toast(apiErrorMessage(err), 'error'),
  });

  const isValid = form.subject.trim() && form.description.trim();

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New ticket
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New ticket</DialogTitle>
            <DialogDescription>Raise a query or request with the people team.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-ink-muted">Category</span>
                <Select
                  className="w-full"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c.charAt(0) + c.slice(1).toLowerCase()}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-ink-muted">Priority</span>
                <Select
                  className="w-full"
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p.charAt(0) + p.slice(1).toLowerCase()}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-ink-muted">Subject</span>
              <Input
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="Short summary"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-ink-muted">Description</span>
              <OpsTextarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Describe the issue or request…"
                required
              />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!isValid || create.isPending}>
                {create.isPending ? 'Creating…' : 'Create ticket'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
