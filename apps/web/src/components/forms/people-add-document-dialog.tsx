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
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toaster';
import { apiErrorMessage } from './people-form-utils';

const initialForm = { type: '', name: '', fileKey: '' };

export function PeopleAddDocumentDialog({ employeeId }: { employeeId: string }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const toast = useToast();
  const queryClient = useQueryClient();

  const set = (key: keyof typeof initialForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const create = useMutation({
    mutationFn: () => api.post(`/employees/${employeeId}/documents`, form).then((r) => r.data),
    onSuccess: () => {
      toast('Document added');
      queryClient.invalidateQueries({ queryKey: ['employees', employeeId, 'documents'] });
      setForm(initialForm);
      setOpen(false);
    },
    onError: (err) => toast(apiErrorMessage(err), 'error'),
  });

  const isValid = form.type.trim() && form.name.trim() && form.fileKey.trim();

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> Add document
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add document</DialogTitle>
            <DialogDescription>Attach a document reference to this employee.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
            className="space-y-4"
          >
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-ink-muted">Type</span>
              <Input value={form.type} onChange={set('type')} placeholder="e.g. PAN, OFFER_LETTER" required />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-ink-muted">Name</span>
              <Input value={form.name} onChange={set('name')} placeholder="Document name" required />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-ink-muted">File reference</span>
              <Input value={form.fileKey} onChange={set('fileKey')} placeholder="Storage key or link" required />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!isValid || create.isPending}>
                {create.isPending ? 'Adding…' : 'Add document'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
