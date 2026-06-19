import { createElement } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";

import StatusBadge from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

const SEVERITY_META = {
  info: { label: "Info", tone: "info", icon: Info, className: "bg-info/10" },
  warning: {
    label: "Warning",
    tone: "warning",
    icon: AlertTriangle,
    className: "bg-warning/10",
  },
  destructive: {
    label: "Critical",
    tone: "destructive",
    icon: ShieldAlert,
    className: "bg-destructive/10",
  },
  success: {
    label: "Clear",
    tone: "success",
    icon: CheckCircle2,
    className: "bg-success/10",
  },
};

export default function RiskAlertCard({
  risks = [],
  title = "Risk Alerts",
  description = "Operational risks that need attention before admin actions.",
  className,
}) {
  const visibleRisks =
    risks.length > 0
      ? risks
      : [
          {
            id: "clear",
            title: "No critical risk alerts",
            description:
              "Nothing right now needs the UI to block an action. Still review the audit log and period before any major change.",
            severity: "success",
          },
        ];

  return (
    <Card className={cx("brand-card", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="font-heading text-xl tracking-normal">
          {title}
        </CardTitle>
        {description && (
          <p className="text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {visibleRisks.map((risk) => {
          const meta = SEVERITY_META[risk.severity] || SEVERITY_META.info;
          return (
            <div
              key={risk.id || risk.title}
              className={cx(
                "rounded-xl px-4 py-3",
                meta.className,
                risk.severity === "destructive" && "ring-1 ring-destructive/20"
              )}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/70 text-current">
                  {createElement(meta.icon, { className: "h-4 w-4" })}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-foreground">{risk.title}</h3>
                    <StatusBadge
                      label={risk.label || meta.label}
                      tone={risk.tone || meta.tone}
                      size="sm"
                    />
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {risk.description}
                  </p>
                  {(risk.to || risk.onAction) && risk.actionLabel && (
                    <div className="mt-3">
                      {risk.to ? (
                        <Button asChild size="sm" variant="outline">
                          <Link to={risk.to}>{risk.actionLabel}</Link>
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={risk.onAction}
                        >
                          {risk.actionLabel}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
