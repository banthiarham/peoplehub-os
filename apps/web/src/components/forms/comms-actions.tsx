'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, SquarePen } from 'lucide-react';
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

/** Fires a test email through the active SMTP provider. */
export function SendTestEmailButton({ providerId }: { providerId: string | undefined }) {
  const toast = useToast();
  const test = useMutation({
    mutationFn: () => api.post(`/email/smtp-config/${providerId}/test`).then((r) => r.data),
    onSuccess: () => toast('Test email sent — check the configured test recipient inbox'),
    onError: (err) => toast(apiErrorMessage(err), 'error'),
  });
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={!providerId || test.isPending}
      title={providerId ? undefined : 'Configure an SMTP provider first'}
      onClick={() => test.mutate()}
    >
      <Send className="h-4 w-4" /> {test.isPending ? 'Sending…' : 'Send test'}
    </Button>
  );
}

const MODULES = [
  'communications',
  'auth',
  'payroll',
  'leave',
  'attendance',
  'recruitment',
  'onboarding',
  'performance',
  'helpdesk',
];

const initialForm = {
  templateKey: '',
  name: '',
  module: 'communications',
  subject: '',
  bodyHtml: '',
};

/** Creates a new transactional email template. Variables use {{snake_case}}. */
export function NewTemplateDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const toast = useToast();
  const queryClient = useQueryClient();

  const set =
    (key: keyof typeof initialForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const create = useMutation({
    mutationFn: () => {
      const variables = [
        ...form.subject.matchAll(/{{\s*(\w+)\s*}}/g),
        ...form.bodyHtml.matchAll(/{{\s*(\w+)\s*}}/g),
      ].map((m) => m[1]);
      return api
        .post('/email/templates', {
          templateKey: form.templateKey.trim(),
          name: form.name.trim(),
          module: form.module,
          subject: form.subject,
          bodyHtml: form.bodyHtml,
          variables: [...new Set(variables)],
        })
        .then((r) => r.data);
    },
    onSuccess: () => {
      toast('Template created');
      queryClient.invalidateQueries({ queryKey: ['email', 'templates'] });
      setForm(initialForm);
      setOpen(false);
    },
    onError: (err) => toast(apiErrorMessage(err), 'error'),
  });

  const isValid =
    form.templateKey.trim() && form.name.trim() && form.subject.trim() && form.bodyHtml.trim();

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <SquarePen className="h-4 w-4" /> New template
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New email template</DialogTitle>
            <DialogDescription>
              Use {'{{variable_name}}'} placeholders — they are resolved at send time.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-ink-muted">Key</span>
                <Input
                  value={form.templateKey}
                  onChange={set('templateKey')}
                  placeholder="offer_letter"
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-ink-muted">Module</span>
                <Select className="w-full" value={form.module} onChange={set('module')}>
                  {MODULES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-ink-muted">Name</span>
              <Input value={form.name} onChange={set('name')} placeholder="Offer Letter" required />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-ink-muted">Subject</span>
              <Input
                value={form.subject}
                onChange={set('subject')}
                placeholder="Your offer from {{company_name}}"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-ink-muted">Body (HTML)</span>
              <OpsTextarea
                value={form.bodyHtml}
                onChange={set('bodyHtml')}
                rows={8}
                className="min-h-[180px] font-mono text-xs"
                placeholder="<p>Hi {{employee_name}},</p>"
                required
              />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!isValid || create.isPending}>
                {create.isPending ? 'Creating…' : 'Create template'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
