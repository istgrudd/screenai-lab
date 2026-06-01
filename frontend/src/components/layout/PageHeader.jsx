function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

export default function PageHeader({
  eyebrow,
  title,
  description,
  action,
  children,
  status,
  className,
}) {
  return (
    <header className={cx("mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0 space-y-2">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">
            {eyebrow}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {title && (
            <h1 className="font-heading text-2xl font-bold tracking-normal text-foreground sm:text-3xl">
              {title}
            </h1>
          )}
          {status}
        </div>
        {description && (
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
            {description}
          </p>
        )}
        {children}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
