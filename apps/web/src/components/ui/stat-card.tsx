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
    <Card className={cn('overflow-hidden border border-line/80 bg-white/95 p-5 shadow-card', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
          {Icon && (
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
              <Icon className="h-4 w-4" />
            </span>
          )}
          {label}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-2">
        <span className="text-[28px] font-semibold tracking-tight text-ink">{value}</span>
        {delta && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-[11px] font-semibold',
              delta.positive ? 'text-success' : 'text-danger',
            )}
          >
            {delta.positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {delta.value}
            {delta.caption && <span className="ml-1 font-normal text-ink-faint">{delta.caption}</span>}
          </span>
        )}
      </div>
      {children && <div className="mt-3 text-sm">{children}</div>}
    </Card>
  );
}
