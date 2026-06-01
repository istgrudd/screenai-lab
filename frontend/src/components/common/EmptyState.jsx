import { Link } from "react-router-dom";
import { Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

export default function EmptyState({
  icon,
  title = "Belum ada informasi",
  description,
  actionLabel,
  onAction,
  to,
  className,
  children,
}) {
  const Icon = icon || Inbox;
  const hasAction = Boolean(actionLabel && (to || onAction));

  return (
    <Card className={cx("brand-card border-dashed", className)}>
      <CardContent className="flex flex-col items-center px-6 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="h-7 w-7" />
        </div>
        <h3 className="mt-5 font-heading text-lg font-bold tracking-normal text-foreground">
          {title}
        </h3>
        {description && (
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        )}
        {children && <div className="mt-4 text-sm text-muted-foreground">{children}</div>}
        {hasAction && (
          <div className="mt-6">
            {to ? (
              <Button asChild>
                <Link to={to}>{actionLabel}</Link>
              </Button>
            ) : (
              <Button type="button" onClick={onAction}>
                {actionLabel}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
