import type { LucideIcon } from 'lucide-react';

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line bg-canvas/50 px-6 py-14 text-center">
      {Icon && <Icon className="h-9 w-9 text-ink-faint" />}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description && <p className="max-w-md text-sm leading-6 text-ink-muted">{description}</p>}
    </div>
  );
}
