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
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      {Icon && <Icon className="h-8 w-8 text-ink-faint" />}
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-xs text-ink-muted">{description}</p>}
    </div>
  );
}
