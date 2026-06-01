import { AlertTriangle, CheckCircle2, Inbox, Mail, Send, Server } from "lucide-react";

import MetricCard from "@/components/common/MetricCard";
import StatusBadge from "@/components/common/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const TEMPLATE_PREVIEWS = [
  "Email Verification",
  "Forgot Password",
  "Admin Password Reset Link",
  "Application Submitted",
  "Document Rejected",
  "Announcement Published",
];

function providerDescription(config) {
  if (!config) return "Provider configuration is not available yet.";
  if (!config.email_enabled) {
    return "Email provider is disabled. Notifications may be logged without delivery.";
  }
  if (config.provider === "mock" || config.environment === "test") {
    return "Provider appears to be in captured/mock mode. Delivery may be intentionally intercepted.";
  }
  return "Provider is enabled. Use the log below to verify sent, captured, failed, or disabled states.";
}

export default function EmailOperationsPanel({
  summary,
  config,
  total = 0,
  loading = false,
}) {
  const values = summary || {};
  const delivered = (values.sent || 0) + (values.captured || 0);
  const failed = values.failed || 0;
  const mock = (values.disabled || 0) + (values.captured || 0);
  const providerTone = !config?.email_enabled
    ? "warning"
    : failed > 0
    ? "destructive"
    : "success";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Inbox}
          label="Total emails"
          value={loading ? "..." : values.total ?? total}
          helper="All notification records in the current filter scope."
        />
        <MetricCard
          icon={CheckCircle2}
          label="Sent or captured"
          value={loading ? "..." : delivered}
          helper="Delivered or intentionally captured notifications."
          tone="success"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Failed"
          value={loading ? "..." : failed}
          helper="Provider or delivery failures."
          tone={failed > 0 ? "destructive" : "neutral"}
        />
        <MetricCard
          icon={Send}
          label="Disabled or mock"
          value={loading ? "..." : mock}
          helper="Useful for staging and local delivery capture."
          tone={mock > 0 ? "warning" : "neutral"}
        />
      </div>

      <Card className="brand-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-heading text-xl tracking-normal">
            <Server className="h-5 w-5 text-primary" />
            Provider Status
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="grid gap-3 text-sm md:grid-cols-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Provider
              </p>
              <p className="mt-1 font-medium">{config?.provider || "-"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Email enabled
              </p>
              <div className="mt-1">
                <StatusBadge
                  label={config?.email_enabled ? "Enabled" : "Disabled"}
                  tone={config?.email_enabled ? "success" : "warning"}
                />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Environment
              </p>
              <p className="mt-1 font-medium">{config?.environment || "-"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                From email
              </p>
              <p className="mt-1 truncate font-medium">{config?.from_email || "-"}</p>
            </div>
          </div>
          <div className="rounded-xl bg-surface-container-low px-4 py-3">
            <StatusBadge label="Provider note" tone={providerTone} />
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {providerDescription(config)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="brand-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-heading text-lg tracking-normal">
            <Mail className="h-5 w-5 text-primary" />
            Read-only Notification Types
          </CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            Template copy is controlled by backend services in this phase. This
            page monitors operations and does not imply an edit feature.
          </p>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATE_PREVIEWS.map((templateName) => (
            <div
              key={templateName}
              className="rounded-xl bg-surface-container-low px-3 py-2 text-sm"
            >
              {templateName}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
