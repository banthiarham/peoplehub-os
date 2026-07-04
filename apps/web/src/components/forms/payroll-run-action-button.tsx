'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { api } from '@/lib/api';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useToast } from '@/components/ui/toaster';

/** Extracts a human-readable message from an API error. */
export function payrollApiError(err: unknown): string {
  if (isAxiosError(err)) {
    const message: unknown = err.response?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

interface RunAction {
  label: string;
  success: string;
  run: (id: string) => Promise<unknown>;
}

const RUN_ACTIONS: Record<string, RunAction> = {
  DRAFT: {
    label: 'Process',
    success: 'Payroll run processed — ready for review',
    run: (id) => api.post(`/payroll/runs/${id}/process`),
  },
  REVIEW: {
    label: 'Approve',
    success: 'Payroll run approved',
    run: (id) => api.patch(`/payroll/runs/${id}/approve`),
  },
  APPROVED: {
    label: 'Publish payslips',
    success: 'Payslips published',
    run: (id) => api.post(`/payroll/runs/${id}/publish`),
  },
};

interface PayrollRunActionButtonProps {
  runId: string;
  status: string;
  size?: ButtonProps['size'];
}

/** Renders the next lifecycle action for a payroll run (Process / Approve / Publish). */
export function PayrollRunActionButton({ runId, status, size = 'sm' }: PayrollRunActionButtonProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const action = RUN_ACTIONS[status];

  const mutation = useMutation({
    mutationFn: () => {
      if (!action) throw new Error(`No action for status ${status}`);
      return action.run(runId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      toast(action?.success ?? 'Done', 'success');
    },
    onError: (err: unknown) => toast(payrollApiError(err), 'error'),
  });

  if (!action) return null;

  return (
    <Button
      size={size}
      variant="secondary"
      disabled={mutation.isPending}
      onClick={(e) => {
        e.stopPropagation();
        mutation.mutate();
      }}
    >
      {mutation.isPending ? 'Working…' : action.label}
    </Button>
  );
}
