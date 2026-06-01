import { Card, CardContent } from "@/components/ui/card";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function toneClasses(tone) {
  if (tone === "success") return "bg-success/10 text-success";
  if (tone === "warning") return "bg-warning/10 text-warning";
  if (tone === "destructive") return "bg-destructive/10 text-destructive";
  if (tone === "info") return "bg-info/10 text-info";
  if (tone === "neutral") return "bg-muted text-muted-foreground";
  return "bg-primary/10 text-primary";
}

export default function MetricCard({
  icon,
  label,
  value,
  helper,
  tone = "brand",
  loading = false,
  action,
  className,
}) {
  const Icon = icon;

  if (loading) {
    return (
      <Card className={cx("brand-card", className)}>
        <CardContent className="flex items-center gap-4 p-5">
          <div className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-muted" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-5 w-20 animate-pulse rounded bg-muted" />
            <div className="h-3 w-32 animate-pulse rounded bg-muted" />
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cx("brand-card", className)}>
      <CardContent className="flex h-full items-start gap-4 p-5">
        {Icon && (
          <div className={cx("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", toneClasses(tone))}>
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-heading text-2xl font-bold tabular-nums text-foreground">
            {value ?? "-"}
          </p>
          {label && (
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              {label}
            </p>
          )}
          {helper && (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {helper}
            </p>
          )}
          {action && <div className="mt-4">{action}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
