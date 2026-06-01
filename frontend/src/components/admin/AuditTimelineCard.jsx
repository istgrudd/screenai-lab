import { AlertTriangle, RotateCcw, ShieldCheck } from "lucide-react";

import EmptyState from "@/components/common/EmptyState";
import LoadingState from "@/components/common/LoadingState";
import StatusBadge from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SENSITIVE_ACTIONS = new Set([
  "score_override",
  "bulk_announcement",
  "announcement",
  "document_review_finalized",
  "user_role_update",
  "user_deactivated",
  "period_closed",
]);

function formatTimestamp(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("id-ID");
}

function displayText(value) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function UserSummary({ user, fallback = "Unknown user" }) {
  if (!user) return <span className="text-sm text-muted-foreground">{fallback}</span>;
  return (
    <div className="min-w-0">
      <p className="truncate font-medium">
        {user.full_name || `User #${user.user_id || user.id}`}
      </p>
      <p className="truncate text-xs text-muted-foreground">
        {user.email || "No email"}
      </p>
    </div>
  );
}

export default function AuditTimelineCard({
  logs = [],
  total = 0,
  page = 1,
  totalPages = 1,
  loading = false,
  errorMessage = "",
  onRetry,
}) {
  return (
    <Card className="brand-card">
      <CardHeader className="pb-3">
        <CardTitle className="font-heading text-xl tracking-normal">
          Audit Timeline
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {Number(total || 0).toLocaleString()} audit logs. Page {page} of{" "}
          {totalPages}.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <LoadingState variant="table" label="Loading audit logs..." />
        ) : errorMessage ? (
          <div className="rounded-xl bg-destructive/10 px-5 py-6 text-center">
            <p className="text-sm text-destructive">{errorMessage}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 gap-2"
              onClick={onRetry}
            >
              <RotateCcw className="h-4 w-4" />
              Retry
            </Button>
          </div>
        ) : logs.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No audit logs match those filters"
            description="Apply a wider date range or reset filters to inspect admin and recruiter activity."
          />
        ) : (
          <div className="space-y-3">
            {logs.map((log) => {
              const sensitive = SENSITIVE_ACTIONS.has(log.action_type);
              return (
                <div
                  key={log.id}
                  className={`rounded-xl px-4 py-3 ${
                    sensitive ? "bg-warning/10" : "bg-surface-container-low"
                  }`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={log.action_type} entityType="audit" />
                        {sensitive && (
                          <StatusBadge
                            label="Sensitive"
                            tone="warning"
                            icon={AlertTriangle}
                          />
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatTimestamp(log.timestamp)}
                        </span>
                      </div>
                      <div className="grid gap-3 text-sm md:grid-cols-2">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            Actor
                          </p>
                          <UserSummary user={log.actor} />
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            Affected user
                          </p>
                          <UserSummary user={log.affected_user} fallback="No affected user" />
                        </div>
                      </div>
                    </div>

                    <div className="grid min-w-0 gap-2 text-xs text-muted-foreground lg:w-[28rem]">
                      <div className="rounded-lg bg-white/60 px-3 py-2">
                        <span className="font-semibold text-foreground">Old:</span>{" "}
                        {displayText(log.old_value)}
                      </div>
                      <div className="rounded-lg bg-white/60 px-3 py-2">
                        <span className="font-semibold text-foreground">New:</span>{" "}
                        {displayText(log.new_value)}
                      </div>
                      <div className="rounded-lg bg-white/60 px-3 py-2">
                        <span className="font-semibold text-foreground">Reason:</span>{" "}
                        {displayText(log.reason)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
