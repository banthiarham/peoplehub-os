'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useSession } from 'next-auth/react';
import { api } from '@/lib/api';
import { allows, viewerFromSession } from '@/lib/authz';
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
  /**
   * Which capability the API requires. Process/approve/lock/close are restricted to
   * PAYROLL_LIFECYCLE_ROLES; publish stays on the wider payroll administration set.
   */
  capability: 'payrollLifecycle' | 'payroll';
}

const RUN_ACTIONS: Record<string, RunAction> = {
  DRAFT: {
    label: 'Process',
    success: 'Payroll run processed — ready for review',
    run: (id) => api.post(`/payroll/runs/${id}/process`),
    capability: 'payrollLifecycle',
  },
  REVIEW: {
    label: 'Approve',
    success: 'Payroll run approved',
    run: async (id) => {
      try {
        return await api.patch(`/payroll/runs/${id}/approve`);
      } catch (err) {
        const message = payrollApiError(err);
        if (!message.toLowerCase().includes('warning')) throw err;
        const reason = window.prompt('Enter the warning override reason before approval');
        if (!reason?.trim()) throw err;
        await api.post(`/payroll/runs/${id}/override-warnings`, { reason: reason.trim() });
        return api.patch(`/payroll/runs/${id}/approve`);
      }
    },
    capability: 'payrollLifecycle',
  },
  APPROVED: {
    label: 'Lock',
    success: 'Payroll run locked',
    run: (id) => api.patch(`/payroll/runs/${id}/lock`),
    capability: 'payrollLifecycle',
  },
  LOCKED: {
    label: 'Publish payslips',
    success: 'Payslips published',
    run: (id) => api.post(`/payroll/runs/${id}/publish`),
    capability: 'payroll',
  },
  PUBLISHED: {
    label: 'Close',
    success: 'Payroll run closed',
    run: (id) => api.patch(`/payroll/runs/${id}/close`),
    capability: 'payrollLifecycle',
  },
};

/** Recomputes a REVIEW or APPROVED run so it picks up whatever changed since it was processed. */
const REPROCESS_ACTION: RunAction = {
  label: 'Reprocess',
  success: 'Payroll run reprocessed — ready for review',
  run: (id) => api.post(`/payroll/runs/${id}/reprocess`),
  capability: 'payrollLifecycle',
};

export const POLICY_STALE_MESSAGE =
  'Payroll policy changed since this run was processed. Reprocess to apply.';

interface PayrollRunActionButtonProps {
  runId: string;
  status: string;
  /** The payroll policy changed since the run was processed; blocks approval until reprocessed. */
  policyStale?: boolean;
  size?: ButtonProps['size'];
}

/**
 * Renders the next lifecycle action for a payroll run (Process / Approve / Publish), plus
 * Reprocess while the run is still in REVIEW or APPROVED.
 */
export function PayrollRunActionButton({ runId, status, policyStale = false, size = 'sm' }: PayrollRunActionButtonProps) {
  const action = RUN_ACTIONS[status];
  const reprocessable = status === 'REVIEW' || status === 'APPROVED';
  // Approve is the one step a stale run may not take; the API refuses it as well.
  const approvalBlocked = status === 'REVIEW' && policyStale;

  if (!action && !reprocessable) return null;

  return (
    <div className="flex items-center gap-2">
      {action && (
        <RunActionControl
          action={action}
          runId={runId}
          size={size}
          variant="secondary"
          disabled={approvalBlocked}
          hint={approvalBlocked ? POLICY_STALE_MESSAGE : undefined}
        />
      )}
      {reprocessable && (
        <RunActionControl
          action={REPROCESS_ACTION}
          runId={runId}
          size={size}
          variant={policyStale ? 'default' : 'outline'}
          hint={policyStale ? POLICY_STALE_MESSAGE : undefined}
          confirm={
            status === 'APPROVED'
              ? 'Reprocessing moves this approved run back to review. It must be approved again. Continue?'
              : undefined
          }
        />
      )}
    </div>
  );
}

interface RunActionControlProps {
  action: RunAction;
  runId: string;
  size: ButtonProps['size'];
  variant: ButtonProps['variant'];
  disabled?: boolean;
  hint?: string;
  confirm?: string;
}

function RunActionControl({ action, runId, size, variant, disabled, hint, confirm }: RunActionControlProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: session } = useSession();
  // Finance Admin, HR Admin and Manager can read payroll but cannot move a run through
  // its lifecycle, so the control is not rendered for them. The API rejects it regardless.
  const permitted = allows(viewerFromSession(session), action.capability);

  const mutation = useMutation({
    mutationFn: () => action.run(runId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      toast(action.success, 'success');
    },
    onError: (err: unknown) => toast(payrollApiError(err), 'error'),
  });

  if (!permitted) return null;

  return (
    // A disabled button swallows pointer events, so the explanation lives on the wrapper.
    <span title={hint}>
      <Button
        size={size}
        variant={variant}
        disabled={disabled || mutation.isPending}
        onClick={(e) => {
          e.stopPropagation();
          if (confirm && !window.confirm(confirm)) return;
          mutation.mutate();
        }}
      >
        {mutation.isPending ? 'Working…' : action.label}
      </Button>
    </span>
  );
}
