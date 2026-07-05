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

const initialForm = { type: '', name: '' };

export function PeopleAddDocumentDialog({ employeeId }: { employeeId: string }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [file, setFile] = useState<File | null>(null);
  const toast = useToast();
  const queryClient = useQueryClient();

  const set = (key: keyof typeof initialForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const create = useMutation({
    mutationFn: async () => {
      // Upload the binary to object storage first, then attach its key.
      const data = new FormData();
      data.append('file', file!);
      const uploaded = await api
        .post('/files/upload', data, { headers: { 'Content-Type': 'multipart/form-data' } })
        .then((r) => r.data as { key: string; name: string });
      return api
        .post(`/employees/${employeeId}/documents`, {
          type: form.type,
          name: form.name.trim() || uploaded.name,
          fileKey: uploaded.key,
        })
        .then((r) => r.data);
    },
    onSuccess: () => {
      toast('Document uploaded');
      queryClient.invalidateQueries({ queryKey: ['employees', employeeId, 'documents'] });
      setForm(initialForm);
      setFile(null);
      setOpen(false);
    },
    onError: (err) => toast(apiErrorMessage(err), 'error'),
  });

  const isValid = form.type.trim() && file;

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
              <Input
                value={form.type}
                onChange={set('type')}
                placeholder="e.g. PAN, OFFER_LETTER"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-ink-muted">
                Name (defaults to file name)
              </span>
              <Input value={form.name} onChange={set('name')} placeholder="Document name" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-ink-muted">
                File (max 10 MB)
              </span>
              <input
                type="file"
                required
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-lg file:border file:border-line file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-canvas"
              />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!isValid || create.isPending}>
                {create.isPending ? 'Uploading…' : 'Upload document'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
