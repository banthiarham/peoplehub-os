'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { apiErrorMessage } from './people-form-utils';

interface LeaveType {
  id: string;
  name: string;
  code: string;
}

const initialForm = { leaveTypeId: '', fromDate: '', toDate: '', halfDay: false, reason: '' };

export function PeopleApplyLeaveDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: types } = useQuery<LeaveType[]>({
    queryKey: ['leave', 'types'],
    queryFn: () => api.get('/leave/types').then((r) => r.data),
    enabled: open,
  });

  const apply = useMutation({
    mutationFn: () =>
      api
        .post('/leave/requests', {
          leaveTypeId: form.leaveTypeId,
          fromDate: form.fromDate,
          toDate: form.toDate,
          halfDay: form.halfDay || undefined,
          reason: form.reason.trim() || undefined,
        })
        .then((r) => r.data),
    onSuccess: (data: { days?: number }) => {
      toast(
        data?.days != null
          ? `Leave request submitted for ${data.days} day${data.days === 1 ? '' : 's'}`
          : 'Leave request submitted',
      );
      queryClient.invalidateQueries({ queryKey: ['leave'] });
      setForm(initialForm);
      setOpen(false);
    },
    onError: (err) => toast(apiErrorMessage(err), 'error'),
  });

  const isValid = form.leaveTypeId && form.fromDate && form.toDate;

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Apply leave
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Apply for leave</DialogTitle>
            <DialogDescription>Submit a leave request for approval.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              apply.mutate();
            }}
            className="space-y-4"
          >
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-ink-muted">Leave type</span>
              <Select
                className="w-full"
                value={form.leaveTypeId}
                onChange={(e) => setForm((f) => ({ ...f, leaveTypeId: e.target.value }))}
                required
              >
                <option value="">Select…</option>
                {types?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code})
                  </option>
                ))}
              </Select>
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-ink-muted">From</span>
                <Input
                  type="date"
                  value={form.fromDate}
                  onChange={(e) => setForm((f) => ({ ...f, fromDate: e.target.value }))}
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-ink-muted">To</span>
                <Input
                  type="date"
                  value={form.toDate}
                  onChange={(e) => setForm((f) => ({ ...f, toDate: e.target.value }))}
                  required
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.halfDay}
                onChange={(e) => setForm((f) => ({ ...f, halfDay: e.target.checked }))}
                className="h-4 w-4 rounded border-line accent-primary-700"
              />
              Half day
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-ink-muted">Reason</span>
              <Input
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Optional"
              />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!isValid || apply.isPending}>
                {apply.isPending ? 'Submitting…' : 'Submit request'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
