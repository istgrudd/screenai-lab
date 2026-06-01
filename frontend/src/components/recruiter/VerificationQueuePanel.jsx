import { Loader2 } from "lucide-react";

import StatusBadge from "@/components/common/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDivision } from "@/lib/recruiterWorkspace";

function progressText(progress) {
  if (!progress) return "0 verified, 0 rejected, 0 pending";
  return `${progress.verified_count} verified, ${progress.rejected_count} rejected, ${progress.pending_count} pending`;
}

export default function VerificationQueuePanel({
  applications = [],
  selectedApplication,
  loading = false,
  onSelect,
}) {
  return (
    <Card className="brand-card">
      <CardHeader className="pb-3">
        <CardTitle className="font-heading text-xl tracking-normal">
          Verification Queue
        </CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">
          Select one application, review every document, then finalize.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading queue...
          </div>
        ) : applications.length ? (
          applications.map((application) => (
            <button
              key={application.id}
              type="button"
              onClick={() => onSelect?.(application)}
              className={`w-full rounded-xl px-4 py-3 text-left transition-colors ${
                selectedApplication?.id === application.id
                  ? "bg-primary/10 ring-2 ring-primary/30"
                  : "bg-surface-container-low hover:bg-surface-container-high"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {application.candidate?.full_name || "Candidate"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {application.candidate?.nim || "-"} - {formatDivision(application.division)}
                  </p>
                </div>
                <StatusBadge status={application.status} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {progressText(application.document_review_progress)}
              </p>
            </button>
          ))
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No applications match the current filters.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
