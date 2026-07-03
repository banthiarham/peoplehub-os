import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-primary-50 text-primary-700',
        success: 'bg-green-50 text-green-700',
        warning: 'bg-amber-50 text-amber-700',
        destructive: 'bg-red-50 text-red-700',
        info: 'bg-blue-50 text-blue-700',
        violet: 'bg-violet-50 text-violet-700',
        outline: 'border border-line text-ink-muted',
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
  if (['ACTIVE', 'APPROVED', 'PRESENT', 'PUBLISHED', 'CONFIRMED', 'RESOLVED', 'PAID', 'ACCEPTED', 'OPEN', 'AVAILABLE', 'SUCCESS', 'COMPLETED'].includes(s)) return 'success';
  if (['PENDING', 'LATE', 'ON_PROBATION', 'DRAFT', 'REVIEW', 'IN_PROGRESS', 'WAITING', 'SUBMITTED', 'SENT', 'ON_NOTICE', 'ON_HOLD'].includes(s)) return 'warning';
  if (['REJECTED', 'ABSENT', 'EXITED', 'URGENT', 'DECLINED', 'FAILED', 'AT_RISK', 'CANCELLED'].includes(s)) return 'destructive';
  if (['ON_LEAVE', 'ASSIGNED', 'PROCESSING', 'SCREENING'].includes(s)) return 'info';
  return 'default';
}
