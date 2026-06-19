import { ArrowRight, CheckCircle2, FileText, ShieldCheck } from "lucide-react";

import StatusBadge from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  REQUIRED_DOCUMENTS,
  documentCompleteness,
  submissionPhaseMessage,
} from "@/lib/candidateApplication";
import { cx } from "@/lib/candidateUx";

function readiness(application, complete) {
  if (!application) {
    return {
      label: "Not started",
      tone: "neutral",
      description: "Create your application before uploading documents.",
    };
  }
  if (application.status === "correction_requested") {
    return {
      label: "Needs revision",
      tone: "warning",
      description: "Replace the rejected documents according to the reviewer notes.",
    };
  }
  if (application.status !== "draft") {
    return {
      label: "Submitted",
      tone: "info",
      description: "Your application is submitted and documents can no longer be changed.",
    };
  }
  if (complete) {
    return {
      label: "Ready to review",
      tone: "success",
      description: "All required documents are in. Continue to the final review.",
    };
  }
  return {
    label: "Not ready to submit",
    tone: "warning",
    description: "Complete all required documents before moving to the final review.",
  };
}

export default function ApplicationProgressCard({
  application,
  documents = [],
  requiredDocuments = REQUIRED_DOCUMENTS,
  activePeriod,
  canManageDocuments = false,
  onAction,
  actionLabel,
  className,
}) {
  const docsByType = new Map(documents.map((document) => [document.doc_type, document]));
  const missing = requiredDocuments.filter((item) => !docsByType.has(item.doc_type));
  const completed = requiredDocuments.length - missing.length;
  const total = requiredDocuments.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const standardCompleteness = documentCompleteness(documents);
  const state = readiness(application, missing.length === 0);
  const phaseBlocked =
    application?.status === "draft" && activePeriod?.current_phase !== "SUBMISSION";

  return (
    <Card className={cx("brand-card", className)}>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">
              Document Progress
            </p>
            <CardTitle className="mt-1 flex items-center gap-2 font-heading text-xl tracking-normal">
              <FileText className="h-5 w-5 text-primary" />
              Application Readiness
            </CardTitle>
          </div>
          <StatusBadge
            status={application?.status}
            label={state.label}
            tone={state.tone}
            size="md"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">
              {completed}/{total} required documents uploaded
            </p>
            <span className="font-heading text-lg font-bold tabular-nums text-primary">
              {percent}%
            </span>
          </div>
          <Progress value={percent} />
          <p className="text-sm leading-6 text-muted-foreground">
            {state.description}
          </p>
        </div>

        {phaseBlocked && (
          <div className="rounded-xl bg-warning/10 px-4 py-3 text-sm text-warning">
            {submissionPhaseMessage(activePeriod)}
          </div>
        )}

        {missing.length > 0 ? (
          <div className="rounded-xl bg-surface-container-low px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Still needed
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {missing.map((item) => (
                <span
                  key={item.doc_type}
                  className="rounded-full bg-card px-3 py-1 text-xs font-medium text-foreground shadow-sm"
                >
                  {item.label}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-xl bg-success/10 px-4 py-3 text-sm text-success">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>All required documents are recorded in your application.</span>
          </div>
        )}

        {standardCompleteness.total !== total && (
          <p className="text-xs text-muted-foreground">
            Note: progress follows the required-document list on this page.
          </p>
        )}

        {actionLabel && (
          <div className="flex justify-end border-t border-border/60 pt-4">
            <Button
              type="button"
              onClick={onAction}
              disabled={!canManageDocuments && application?.status === "draft"}
              className="gap-2"
            >
              {application?.status === "draft" && missing.length === 0 ? (
                <ShieldCheck className="h-4 w-4" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              {actionLabel}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
