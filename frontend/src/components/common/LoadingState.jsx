import { Loader2 } from "lucide-react";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function SkeletonBlock({ className }) {
  return <div className={cx("animate-pulse rounded bg-muted", className)} />;
}

function TableRows({ rows }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="grid grid-cols-5 gap-3 rounded-xl bg-card p-3">
          <SkeletonBlock className="col-span-2 h-4" />
          <SkeletonBlock className="h-4" />
          <SkeletonBlock className="h-4" />
          <SkeletonBlock className="h-4" />
        </div>
      ))}
    </div>
  );
}

export default function LoadingState({
  variant = "page",
  rows = 5,
  label,
  className,
}) {
  const safeRows = Math.max(1, Number(rows) || 1);

  if (variant === "card") {
    return (
      <div className={cx("brand-card rounded-xl p-5", className)}>
        <div className="flex items-start gap-4">
          <SkeletonBlock className="h-11 w-11 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-3">
            <SkeletonBlock className="h-4 w-1/3" />
            <SkeletonBlock className="h-3 w-2/3" />
            <SkeletonBlock className="h-3 w-1/2" />
          </div>
        </div>
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div className={cx("brand-card rounded-xl p-4", className)}>
        <TableRows rows={safeRows} />
      </div>
    );
  }

  if (variant === "metrics") {
    return (
      <div className={cx("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>
        {Array.from({ length: safeRows }).map((_, index) => (
          <div key={index} className="brand-card rounded-xl p-5">
            <SkeletonBlock className="h-10 w-10 rounded-xl" />
            <SkeletonBlock className="mt-4 h-7 w-16" />
            <SkeletonBlock className="mt-2 h-3 w-28" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cx("flex min-h-48 items-center justify-center rounded-xl", className)}>
      <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        {label || "Memuat data..."}
      </div>
    </div>
  );
}
