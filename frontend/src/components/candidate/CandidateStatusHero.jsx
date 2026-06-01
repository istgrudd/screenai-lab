import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FileWarning,
  Hourglass,
  Sparkles,
  Trophy,
} from "lucide-react";

import PhaseBadge from "@/components/common/PhaseBadge";
import StatusBadge from "@/components/common/StatusBadge";
import LoadingState from "@/components/common/LoadingState";
import { Button } from "@/components/ui/button";
import { documentCompleteness, formatDivision } from "@/lib/candidateApplication";
import {
  candidateNextAction,
  candidateStatusCopy,
  cx,
  periodDeadlineContext,
} from "@/lib/candidateUx";

function ToneIcon({ tone, className }) {
  if (tone === "success") return <Trophy className={className} />;
  if (tone === "warning") return <FileWarning className={className} />;
  if (tone === "destructive") return <FileWarning className={className} />;
  if (tone === "info") return <Hourglass className={className} />;
  return <Sparkles className={className} />;
}

function SecondaryAction({ action }) {
  if (!action) return null;
  if (action.node) return action.node;

  return (
    <Button
      type="button"
      variant="outline"
      className="border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"
      onClick={action.onClick}
      disabled={action.disabled}
    >
      {action.label}
    </Button>
  );
}

export default function CandidateStatusHero({
  user,
  application,
  documents = [],
  activePeriod,
  announcement,
  loading = false,
  onPrimaryAction,
  primaryActionLabel,
  secondaryAction,
  className,
}) {
  if (loading) return <LoadingState variant="card" className={className} />;

  const action = candidateNextAction(application, documents);
  const copy = candidateStatusCopy(application, documents, announcement);
  const period = periodDeadlineContext(activePeriod);
  const completeness = documentCompleteness(documents);
  const firstName = user?.full_name?.split(" ")?.[0] || user?.email || "Kandidat";
  const buttonLabel = primaryActionLabel || action.label;

  return (
    <section
      className={cx(
        "overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#1E3F75_0%,#0065B0_100%)] p-6 text-white shadow-[var(--shadow-navy)] sm:p-8",
        className
      )}
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              status={application?.status}
              label={copy.statusLabel}
              tone={copy.tone}
              className="border-white/35 bg-white/15 text-white"
            />
            {activePeriod?.current_phase && (
              <PhaseBadge
                phase={activePeriod.current_phase}
                className="border-white/35 bg-white/15 text-white"
              />
            )}
          </div>

          <div className="mt-6 flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15">
              <ToneIcon tone={copy.tone} className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white/75">
                Halo, {firstName}
              </p>
              <h2 className="mt-1 font-heading text-2xl font-bold tracking-normal sm:text-3xl">
                {copy.title}
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/80 sm:text-base">
                {copy.description}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-white/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-white/65">
                Next Action
              </p>
              <p className="mt-1 text-sm font-semibold">{buttonLabel}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-white/65">
                Dokumen
              </p>
              <p className="mt-1 text-sm font-semibold">
                {completeness.completed}/{completeness.total} lengkap
              </p>
            </div>
            <div className="rounded-xl bg-white/10 px-4 py-3">
              <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-white/65">
                <CalendarClock className="h-3.5 w-3.5" />
                {period.deadlineLabel}
              </p>
              <p className="mt-1 text-sm font-semibold">
                {period.countdown || period.phaseLabel}
              </p>
            </div>
          </div>

          <p className="mt-3 text-xs text-white/70">{period.deadlineText}</p>
        </div>

        <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col">
          <Button
            type="button"
            className="gap-2 bg-white text-primary shadow-sm hover:bg-white/90"
            onClick={onPrimaryAction}
          >
            {buttonLabel}
            <ArrowRight className="h-4 w-4" />
          </Button>
          <SecondaryAction action={secondaryAction} />
        </div>
      </div>

      {application?.division && (
        <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-white/75">
          <CheckCircle2 className="h-4 w-4" />
          <span>Divisi pilihan: {formatDivision(application.division)}</span>
        </div>
      )}
    </section>
  );
}
