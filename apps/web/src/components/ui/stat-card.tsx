import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react';
import { Card } from './card';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  delta?: { value: string; positive: boolean; caption?: string };
  icon?: LucideIcon;
  children?: React.ReactNode;
  className?: string;
}

export function StatCard({ label, value, delta, icon: Icon, children, className }: StatCardProps) {
  return (
    <Card className={cn('overflow-hidden p-5', className)}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 text-[13px] font-medium text-ink-muted">
          {Icon && (
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-50 text-primary-700">
              <Icon className="h-4 w-4" />
            </span>
          )}
          {label}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight text-ink">{value}</span>
        {delta && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium',
              delta.positive ? 'text-success' : 'text-danger',
            )}
          >
            {delta.positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {delta.value}
            {delta.caption && <span className="ml-1 font-normal text-ink-faint">{delta.caption}</span>}
          </span>
        )}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </Card>
  );
}
