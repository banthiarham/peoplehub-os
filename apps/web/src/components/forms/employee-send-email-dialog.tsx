'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
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
import { OpsTextarea } from './ops-textarea';
import { apiErrorMessage } from './ops-utils';

interface EmployeeSendEmailDialogProps {
  employeeId: string;
  employeeName: string;
  workEmail: string | null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Compose a one-off email to an employee's work address via the real send
 *  pipeline. Body is plain text, wrapped to simple HTML on submit. */
export function EmployeeSendEmailDialog({
  employeeId,
  employeeName,
  workEmail,
}: EmployeeSendEmailDialogProps) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const toast = useToast();
  const queryClient = useQueryClient();

  const send = useMutation({
    mutationFn: () => {
      const bodyHtml = `<div style="font-family:sans-serif;font-size:14px;line-height:1.6">${body
        .split('\n')
        .map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : '<br/>'))
        .join('')}</div>`;
      return api
        .post(`/email/employee/${employeeId}`, { subject: subject.trim(), bodyHtml })
        .then((r) => r.data);
    },
    onSuccess: (res: { to: string }) => {
      toast(`Email sent to ${res.to}`);
      queryClient.invalidateQueries({ queryKey: ['employees', employeeId, 'email-history'] });
      setSubject('');
      setBody('');
      setOpen(false);
    },
    onError: (err) => toast(apiErrorMessage(err), 'error'),
  });

  const disabled = !workEmail;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? 'No work email on file' : undefined}
      >
        <Mail className="h-3.5 w-3.5" /> Send email
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Email {employeeName}</DialogTitle>
            <DialogDescription>
              Sends to {workEmail ?? '—'} from your workspace&apos;s configured mail provider.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send.mutate();
            }}
            className="space-y-4"
          >
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-ink-muted">Subject</span>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} required />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-ink-muted">Message</span>
              <OpsTextarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={7}
                className="min-h-[160px]"
                placeholder={`Hi ${employeeName.split(' ')[0]},`}
                required
              />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!subject.trim() || !body.trim() || send.isPending}>
                {send.isPending ? 'Sending…' : 'Send email'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
