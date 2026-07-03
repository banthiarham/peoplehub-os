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
    <Card className={cn('p-5', className)}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          {Icon && <Icon className="h-4 w-4" />}
          {label}
        </div>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-semibold tracking-tight">{value}</span>
        {delta && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-xs font-medium',
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
