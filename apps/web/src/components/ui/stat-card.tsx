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
    <Card className={cn('overflow-hidden border border-line/90 bg-slate-50/65 p-4 shadow-card', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 text-[11px] font-semibold uppercase text-ink-muted">
          {label}
        </div>
        {Icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-primary-700 shadow-sm ring-1 ring-line/70">
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="mt-2 flex min-w-0 flex-wrap items-baseline gap-2">
        <span className="min-w-0 text-[26px] font-semibold leading-none text-ink">{value}</span>
        {delta && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-md bg-white px-2 py-1 text-[11px] font-semibold shadow-sm ring-1 ring-line/70',
              delta.positive ? 'text-success' : 'text-danger',
            )}
          >
            {delta.positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {delta.value}
            {delta.caption && <span className="ml-1 font-normal text-ink-faint">{delta.caption}</span>}
          </span>
        )}
      </div>
      {children && <div className="mt-2 text-[13px] leading-5 text-ink-muted">{children}</div>}
    </Card>
  );
}
