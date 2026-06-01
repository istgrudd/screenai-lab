import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
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

function actionVariant(tone) {
  if (tone === "destructive") return "destructive";
  if (tone === "brand") return "default";
  return "outline";
}

export default function ActionCard({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  to,
  tone = "brand",
  disabled = false,
  className,
  children,
}) {
  const Icon = icon;
  const canAct = Boolean(actionLabel && (to || onAction));

  return (
    <Card className={cx("brand-card h-full", className)}>
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          {Icon && (
            <div className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", toneClasses(tone))}>
              <Icon className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0">
            {title && (
              <h3 className="font-heading text-base font-bold tracking-normal text-foreground">
                {title}
              </h3>
            )}
            {description && (
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>

        {children && <div className="text-sm text-muted-foreground">{children}</div>}

        {canAct && (
          <div className="mt-auto">
            {to && !disabled ? (
              <Button asChild size="sm" variant={actionVariant(tone)} className="gap-2">
                <Link to={to}>
                  {actionLabel}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant={actionVariant(tone)}
                className="gap-2"
                disabled={disabled}
                onClick={onAction}
              >
                {actionLabel}
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
