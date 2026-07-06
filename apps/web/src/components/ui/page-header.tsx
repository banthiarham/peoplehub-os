interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  eyebrow?: string;
  meta?: React.ReactNode;
}

export function PageHeader({ title, description, actions, eyebrow, meta }: PageHeaderProps) {
  return (
    <div className="mb-6 rounded-2xl border border-line/70 bg-white/80 px-5 py-4 shadow-card backdrop-blur-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
              {eyebrow}
            </p>
          )}
          <h1 className="text-[24px] font-semibold tracking-tight text-ink">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-muted">{description}</p>}
          {meta && <div className="mt-3 flex flex-wrap gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
