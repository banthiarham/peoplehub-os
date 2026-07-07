interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  eyebrow?: string;
  meta?: React.ReactNode;
}

export function PageHeader({ title, description, actions, eyebrow }: PageHeaderProps) {
  return (
    <div className="mb-4 rounded-lg border border-line/90 bg-white px-4 py-3 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <p className="mb-0.5 text-[10px] font-semibold uppercase text-ink-faint">
              {eyebrow}
            </p>
          )}
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-[24px] font-semibold text-ink">{title}</h1>
            {description && <p className="max-w-4xl text-sm leading-5 text-ink-muted">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
