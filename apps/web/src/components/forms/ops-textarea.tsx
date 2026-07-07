import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const OpsTextarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-[88px] w-full rounded-lg border border-line bg-white px-3 py-2 text-sm placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
OpsTextarea.displayName = 'OpsTextarea';
