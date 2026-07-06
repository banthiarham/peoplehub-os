import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-primary-50 text-primary-700',
        success: 'bg-emerald-50 text-emerald-700',
        warning: 'bg-amber-50 text-amber-700',
        destructive: 'bg-rose-50 text-rose-700',
        info: 'bg-sky-50 text-sky-700',
        violet: 'bg-violet-50 text-violet-700',
        outline: 'border border-line bg-white text-ink-muted',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/** Maps common backend status strings to badge variants. */
export function statusVariant(status: string): BadgeProps['variant'] {
  const s = status.toUpperCase();
  if (['ACTIVE', 'APPROVED', 'PRESENT', 'PUBLISHED', 'CONFIRMED', 'RESOLVED', 'PAID', 'ACCEPTED', 'OPEN', 'AVAILABLE', 'SUCCESS', 'COMPLETED', 'COMPLETED_STEP'].includes(s)) return 'success';
  if (['PENDING', 'LATE', 'ON_PROBATION', 'DRAFT', 'REVIEW', 'IN_PROGRESS', 'WAITING', 'SUBMITTED', 'SENT', 'ON_NOTICE', 'ON_HOLD'].includes(s)) return 'warning';
  if (['REJECTED', 'ABSENT', 'EXITED', 'URGENT', 'DECLINED', 'FAILED', 'AT_RISK', 'CANCELLED'].includes(s)) return 'destructive';
  if (['ON_LEAVE', 'ASSIGNED', 'PROCESSING', 'SCREENING', 'ESCALATED'].includes(s)) return 'info';
  return 'default';
}
