import { AlertTriangle, CalendarClock, LockKeyhole, ShieldCheck } from "lucide-react";

import PhaseBadge from "@/components/common/PhaseBadge";
import StepTrack from "@/components/common/StepTrack";
import StatusBadge from "@/components/common/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PHASE_ORDER } from "@/lib/phaseMaps";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function completedFor(phase) {
  const index = PHASE_ORDER.indexOf(phase);
  if (index <= 0) return [];
  return PHASE_ORDER.slice(0, index);
}

export default function PeriodSafetyPanel({
  activePeriod,
  activeStats,
  applications = [],
  loading = false,
  className,
}) {
  const phase = activePeriod?.current_phase;
  const pendingDocuments = applications.filter((application) =>
    ["submitted", "document_review", "correction_requested"].includes(
      application.status
    )
  ).length;
  const evaluated = applications.filter(
    (application) => application?.evaluation?.composite_score != null
  ).length;
  const thresholdMissing =
    activePeriod && (activePeriod.threshold_n === null || activePeriod.threshold_n === undefined);
  const timelineSteps = [
    {
      key: "SUBMISSION",
      label: "Submission",
      description: `${formatDate(activePeriod?.start_date)} - ${formatDate(
        activePeriod?.submission_end_date
      )}`,
    },
    {
      key: "EVALUATION",
      label: "Evaluation",
      description: `${formatDate(activePeriod?.submission_end_date)} - ${formatDate(
        activePeriod?.evaluation_end_date
      )}`,
    },
    {
      key: "ANNOUNCEMENT",
      label: "Announcement",
      description: `${formatDate(activePeriod?.evaluation_end_date)} - ${formatDate(
        activePeriod?.end_date
      )}`,
    },
  ];

  return (
    <Card className={`brand-card ${className || ""}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-heading text-xl tracking-normal">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Period Safety
        </CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">
          A read-only summary of the risks behind create/update/close actions; it
          adds no rules beyond the backend.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-surface-container-low px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Active Period
            </p>
            <p className="mt-1 truncate font-medium" title={activePeriod?.name}>
              {loading ? "Loading..." : activePeriod?.name || "None"}
            </p>
            <div className="mt-2">
              {phase ? (
                <PhaseBadge phase={phase} />
              ) : (
                <StatusBadge label="Inactive" tone="warning" />
              )}
            </div>
          </div>
          <div className="rounded-xl bg-surface-container-low px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Threshold N
            </p>
            {activePeriod?.threshold_n != null ? (
              <p className="mt-1 font-heading text-xl font-bold tabular-nums">
                {activePeriod.threshold_n}
              </p>
            ) : (
              <p className="mt-1 text-sm font-medium text-muted-foreground">
                Not set
              </p>
            )}
            {thresholdMissing && (
              <p className="mt-1 text-xs leading-5 text-warning">
                Ranking still shows, but no threshold defines the automatic pass
                cutoff.
              </p>
            )}
          </div>
          <div className="rounded-xl bg-surface-container-low px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Submitted
            </p>
            <p className="mt-1 font-heading text-xl font-bold tabular-nums">
              {activeStats?.total_submitted ?? activePeriod?.application_count ?? applications.length}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {evaluated} evaluated, {pendingDocuments} still in review/correction.
            </p>
          </div>
        </div>

        {activePeriod ? (
          <StepTrack
            steps={timelineSteps}
            currentStep={phase}
            completedSteps={completedFor(phase)}
            orientation="vertical"
          />
        ) : (
          <div className="flex items-start gap-3 rounded-xl bg-warning/10 px-4 py-3">
            <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <p className="text-sm leading-6 text-muted-foreground">
              No active period. Creating a period opens a new workflow; confirm
              the phase schedule and threshold before saving.
            </p>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex items-start gap-3 rounded-xl bg-warning/10 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div className="min-w-0">
              <p className="font-medium">Active period conflict</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {activePeriod
                  ? `Period "${activePeriod.name}" is still active. The UI explains why creating is disabled, while the backend stays the source of truth.`
                  : "No active conflict right now."}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl bg-destructive/10 px-4 py-3">
            <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="font-medium">Close period</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Closing is destructive and must be confirmed. Candidates cannot
                submit until a new period is available.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
