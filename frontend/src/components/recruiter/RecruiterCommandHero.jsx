import { Link } from "react-router-dom";
import { CalendarClock, FileSearch, Megaphone, Sparkles } from "lucide-react";

import PhaseBadge from "@/components/common/PhaseBadge";
import LoadingState from "@/components/common/LoadingState";
import { Button } from "@/components/ui/button";
import { formatDateTimeId, timeLeftText } from "@/lib/candidateUx";

function deadlineFor(period) {
  const phases = period?.phases || {};
  const phase = period?.current_phase;
  if (phase === "UPCOMING") return phases?.submission?.start || period?.start_date;
  if (phase === "SUBMISSION") return phases?.submission?.end || period?.submission_end_date;
  if (phase === "EVALUATION") return phases?.evaluation?.end || period?.evaluation_end_date;
  if (phase === "ANNOUNCEMENT") return phases?.announcement?.end || period?.end_date;
  return period?.end_date;
}

function PhaseActionIcon({ phase, className }) {
  if (phase === "SUBMISSION") return <FileSearch className={className} />;
  if (phase === "EVALUATION") return <Sparkles className={className} />;
  if (phase === "ANNOUNCEMENT") return <Megaphone className={className} />;
  return <CalendarClock className={className} />;
}

function actionForPhase(phase) {
  if (phase === "SUBMISSION") {
    return {
      label: "Open Applications",
      to: "/recruiter/applications",
      description: "Review submitted applications and document queues.",
    };
  }
  if (phase === "EVALUATION") {
    return {
      label: "Run Evaluation",
      to: "/recruiter/evaluation",
      description: "Process verified candidates by division.",
    };
  }
  if (phase === "ANNOUNCEMENT") {
    return {
      label: "Publish Results",
      to: "/recruiter/announcements",
      description: "Finalize pass/fail selections for candidates.",
    };
  }
  return {
    label: "Action Unavailable",
    to: null,
    description: "No recruiter action is available in this phase.",
  };
}

export default function RecruiterCommandHero({
  activePeriod,
  loading = false,
  applications = [],
  summary,
  primaryAction,
  className,
}) {
  if (loading) return <LoadingState variant="card" className={className} />;

  const phase = activePeriod?.current_phase || null;
  const phaseAction = primaryAction || actionForPhase(phase);
  const deadline = deadlineFor(activePeriod);
  const countdown = timeLeftText(deadline);
  const submittedCount = summary?.applicationCount ?? applications.length;

  return (
    <section className={`overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#1E3F75_0%,#0065B0_100%)] p-6 text-white shadow-[var(--shadow-navy)] sm:p-8 ${className || ""}`}>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {phase ? (
              <PhaseBadge phase={phase} className="border-white/35 bg-white/15 text-white" />
            ) : (
              <PhaseBadge label="No Active Period" tone="neutral" className="border-white/35 bg-white/15 text-white" />
            )}
            <span className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em] text-white">
              {submittedCount} applications
            </span>
          </div>
          <h2 className="mt-5 font-heading text-2xl font-bold tracking-normal sm:text-3xl">
            {activePeriod?.name || "No active recruitment period"}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/80 sm:text-base">
            {activePeriod
              ? "Operational command center for reviewing applications, verifying documents, running evaluation, and preparing announcements."
              : "Recruiter workspace is ready, but actions that depend on an active period are disabled until a period exists."}
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-white/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-white/65">
                Current Focus
              </p>
              <p className="mt-1 text-sm font-semibold">{phaseAction.description}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-white/65">
                Pending Evaluation
              </p>
              <p className="mt-1 text-sm font-semibold">
                {summary?.pendingEvaluationCount ?? 0} candidates
              </p>
            </div>
            <div className="rounded-xl bg-white/10 px-4 py-3">
              <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-white/65">
                <CalendarClock className="h-3.5 w-3.5" />
                Deadline
              </p>
              <p className="mt-1 text-sm font-semibold">
                {countdown || (deadline ? formatDateTimeId(deadline) : "No deadline")}
              </p>
            </div>
          </div>
        </div>

        {phaseAction.to ? (
          <Button asChild className="shrink-0 gap-2 bg-white text-primary hover:bg-white/90">
            <Link to={phaseAction.to}>
              <PhaseActionIcon phase={phase} className="h-4 w-4" />
              {phaseAction.label}
            </Link>
          </Button>
        ) : (
          <Button type="button" disabled className="shrink-0 gap-2 bg-white/20 text-white">
            <PhaseActionIcon phase={phase} className="h-4 w-4" />
            {phaseAction.label}
          </Button>
        )}
      </div>
    </section>
  );
}
