import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  FileWarning,
  Inbox,
  Loader2,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import ConfirmActionDialog from "@/components/common/ConfirmActionDialog";
import MetricCard from "@/components/common/MetricCard";
import PageHeader from "@/components/layout/PageHeader";
import CandidateResultCard from "@/components/recruiter/CandidateResultCard";
import EvaluationActionPanel from "@/components/recruiter/EvaluationActionPanel";
import EvaluationProgressPanel from "@/components/recruiter/EvaluationProgressPanel";
import { Card, CardContent } from "@/components/ui/card";
import {
  evaluateBatch,
  getActiveEvaluationJob,
  getActivePeriod,
  getEvaluationJob,
  listRecruiterApplications,
} from "@/lib/api";
import {
  getAiValidationStatus,
  isScoredApplication,
  summarizeApplications,
} from "@/lib/recruiterWorkspace";

const EVALUATION_QUEUE_GROUPS = [
  {
    key: "pending_eval",
    title: "Pending Evaluation",
    hint: "Belum memiliki skor AI.",
  },
  {
    key: "pending_validation",
    title: "Pending AI Validation",
    hint: "Sudah dinilai AI, menunggu validasi recruiter.",
  },
  {
    key: "needs_discussion",
    title: "Needs Discussion",
    hint: "Ditandai perlu dibahas lebih lanjut.",
  },
  {
    key: "validated",
    title: "Validated",
    hint: "Sudah divalidasi recruiter.",
  },
];

// Phase 2: poll the evaluation job every ~3s while it is non-terminal.
const JOB_POLL_INTERVAL_MS = 3000;

function isNonTerminal(job) {
  return Boolean(job && (job.status === "queued" || job.status === "running"));
}

export default function RecruiterEvaluationPage() {
  const [applications, setApplications] = useState([]);
  const [selectedDivision, setSelectedDivision] = useState("big_data");
  const [activePeriod, setActivePeriod] = useState(null);
  const [loading, setLoading] = useState(true);
  const [periodLoading, setPeriodLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [evaluateWarning, setEvaluateWarning] = useState(null);
  const [lastSkippedCount, setLastSkippedCount] = useState(0);
  const [lastError, setLastError] = useState(null);
  const [job, setJob] = useState(null);
  const [reEvaluateOpen, setReEvaluateOpen] = useState(false);

  // Interval id for the active-job poller. A ref (not state) so starting /
  // stopping it never triggers a re-render.
  const pollRef = useRef(null);

  const phase = activePeriod?.current_phase || null;
  const hasActiveJob = isNonTerminal(job);
  // Buttons are locked while a POST is in flight, while a job is active, and
  // while the base data is still loading.
  const controlsBusy = triggering || hasActiveJob || loading || periodLoading;

  const loadApplications = async () => {
    setLoading(true);
    try {
      const apps = await listRecruiterApplications({
        division: selectedDivision,
      });
      setApplications(apps || []);
    } catch (error) {
      toast.error(error.message || "Failed to load applications");
    } finally {
      setLoading(false);
    }
  };

  const loadActivePeriod = async () => {
    setPeriodLoading(true);
    try {
      const period = await getActivePeriod();
      setActivePeriod(period);
    } catch {
      setActivePeriod(null);
    } finally {
      setPeriodLoading(false);
    }
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const handleTerminalJob = (finished) => {
    if (finished.status === "completed") {
      const ok = finished.succeeded ?? 0;
      const failed = finished.failed ?? 0;
      if (failed > 0) {
        toast.warning(
          `Evaluation finished: ${ok} succeeded, ${failed} failed.`
        );
      } else if (ok > 0) {
        toast.success(`Evaluation complete. ${ok} candidate(s) evaluated.`);
      } else {
        toast.info("Evaluation finished — no candidates were evaluated.");
      }
      loadApplications();
      loadActivePeriod();
    } else if (finished.status === "failed") {
      toast.error(
        finished.note || "Evaluation job failed. Controls are available again."
      );
    }
  };

  const pollJobOnce = async (jobId) => {
    try {
      const updated = await getEvaluationJob(jobId);
      setJob(updated);
      if (updated.status === "completed" || updated.status === "failed") {
        stopPolling();
        handleTerminalJob(updated);
      }
    } catch {
      // Job vanished or transient error — stop polling rather than spin.
      stopPolling();
    }
  };

  const startPolling = (jobId) => {
    stopPolling();
    pollRef.current = setInterval(() => pollJobOnce(jobId), JOB_POLL_INTERVAL_MS);
  };

  // Resume polling of any active job for the selected division — makes a page
  // refresh harmless and surfaces a job another recruiter started.
  const resumeActiveJob = async (division) => {
    try {
      const active = await getActiveEvaluationJob(division);
      if (active && isNonTerminal(active)) {
        setJob(active);
        startPolling(active.id);
      }
    } catch {
      // No active job / transient error — nothing to resume.
    }
  };

  useEffect(() => {
    Promise.resolve().then(loadActivePeriod);
  }, []);

  // On mount and whenever the division changes: reload the queue, reset the
  // panel, stop any stale poller, and re-discover an active job. The cleanup
  // clears the interval on unmount.
  useEffect(() => {
    stopPolling();
    // Defer state updates out of the effect body (cascading-render lint rule).
    Promise.resolve().then(() => {
      setJob(null);
      setLastError(null);
      loadApplications();
      resumeActiveJob(selectedDivision);
    });
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDivision]);

  const summary = useMemo(
    () => summarizeApplications(applications),
    [applications]
  );
  const evaluatedInSelectedDivision = useMemo(
    () =>
      applications.filter((application) => application.evaluation?.composite_score != null)
        .length,
    [applications]
  );
  const pendingReviewSummary = useMemo(
    () => ({
      documentReview: applications.filter(
        (application) => application.status === "document_review"
      ).length,
      correctionRequested: applications.filter(
        (application) => application.status === "correction_requested"
      ).length,
    }),
    [applications]
  );
  const canReEvaluate = lastSkippedCount > 0 || evaluatedInSelectedDivision > 0;

  const queueGroups = useMemo(() => {
    const groups = {
      pending_eval: [],
      pending_validation: [],
      needs_discussion: [],
      validated: [],
    };
    for (const application of applications) {
      if (!isScoredApplication(application)) {
        groups.pending_eval.push(application);
        continue;
      }
      const validation = getAiValidationStatus(application);
      if (validation === "needs_discussion") groups.needs_discussion.push(application);
      else if (validation === "validated") groups.validated.push(application);
      else groups.pending_validation.push(application);
    }
    return groups;
  }, [applications]);

  const runEvaluate = async ({ force = false } = {}) => {
    if (triggering || hasActiveJob) return;
    if (!selectedDivision) {
      toast.error("Please select a division first.");
      return;
    }

    setTriggering(true);
    setLastError(null);
    try {
      const res = await evaluateBatch(selectedDivision, { force });
      const queued = res.evaluated_count ?? res.total ?? 0;
      const skipped = res.skipped_count ?? 0;
      const skippedUnverified = res.skipped_unverified_count ?? 0;
      const skippedCorrection = res.skipped_correction_count ?? 0;
      setLastSkippedCount(skipped);

      if (res._warning) {
        toast.warning(res._warning);
        setEvaluateWarning(res._warning);
      } else {
        setEvaluateWarning(null);
      }

      if (queued === 0) {
        if (skipped > 0) {
          toast.info("All candidates in this division were already evaluated.");
        } else if (skippedUnverified > 0 || skippedCorrection > 0) {
          toast.warning(
            "No verified candidates were ready for evaluation. Pending or correction candidates were skipped."
          );
        } else {
          toast.info("No verified candidates are ready for evaluation in this division.");
        }
      } else {
        toast.success(
          `Evaluation started for ${queued} candidate(s). Tracking progress…`
        );
      }

      // Begin (or finish) tracking the created job.
      if (res.job_id) {
        const initial = await getEvaluationJob(res.job_id).catch(() => null);
        const jobState =
          initial || {
            id: res.job_id,
            status: res.status || "queued",
            total: queued,
            processed: 0,
            succeeded: 0,
            failed: 0,
            errors: [],
          };
        setJob(jobState);
        if (jobState.status === "completed" || jobState.status === "failed") {
          handleTerminalJob(jobState);
        } else {
          startPolling(res.job_id);
        }
      } else {
        // No job id (shouldn't happen) — refresh the table directly.
        await loadApplications();
        await loadActivePeriod();
      }
    } catch (error) {
      if (error?.status === 409) {
        // DB-level partial unique index — a job is already active for this
        // division. Not a failure of this division's data; resume tracking
        // the running job instead of corrupting state.
        toast.warning(
          "Evaluation for this division is already running. Please wait until it finishes."
        );
        resumeActiveJob(selectedDivision);
      } else {
        setLastError(error.message || "Evaluation failed");
        toast.error(error.message || "Evaluation failed");
      }
    } finally {
      setTriggering(false);
    }
  };

  const phaseWarn = activePeriod && phase && phase !== "EVALUATION";
  const showWarn = phaseWarn || Boolean(evaluateWarning);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Recruiter / Evaluation"
        title="Evaluation"
        description="Run AI-anonymized evaluation and validate AI results per division. Personal identifiers are excluded from AI evaluation input, while recruiter-facing candidate data stays visible. Evaluation runs as a background job — you can keep working and a page refresh resumes live progress."
      />

      <EvaluationProgressPanel job={job} />

      {phase === "EVALUATION" &&
        (pendingReviewSummary.documentReview > 0 ||
          pendingReviewSummary.correctionRequested > 0) && (
          <Card className="brand-card bg-warning/10">
            <CardContent className="flex items-start gap-3 p-5">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
              <div>
                <p className="font-medium text-foreground">
                  Some candidates are not evaluation-ready
                </p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {pendingReviewSummary.documentReview} in document review and{" "}
                  {pendingReviewSummary.correctionRequested} in correction will
                  be skipped by evaluation.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

      {showWarn && (
        <Card className="brand-card bg-warning/10">
          <CardContent className="flex items-start gap-3 p-5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <p className="text-sm leading-6 text-muted-foreground">
              {evaluateWarning ||
                "Evaluation is being run outside the official evaluation window."}
            </p>
          </CardContent>
        </Card>
      )}

      <EvaluationActionPanel
        selectedDivision={selectedDivision}
        onDivisionChange={setSelectedDivision}
        activePeriod={activePeriod}
        summary={summary}
        canReEvaluate={canReEvaluate}
        evaluating={controlsBusy}
        onRun={() => runEvaluate({ force: false })}
        onReRun={() => setReEvaluateOpen(true)}
      />

      {lastError && (
        <Card className="brand-card bg-destructive/10">
          <CardContent className="p-5 text-sm leading-6 text-muted-foreground">
            <span>
              {lastError}. Controls are available again; retry after checking the
              queue.
            </span>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard
          icon={Users}
          label="Applications in division"
          value={loading ? "..." : summary.applicationCount}
        />
        <MetricCard
          icon={BarChart3}
          label="Already evaluated"
          value={loading ? "..." : summary.scoredCount}
          tone="success"
        />
        <MetricCard
          icon={Sparkles}
          label="Pending evaluation"
          value={loading ? "..." : summary.pendingEvaluationCount}
          tone="warning"
        />
        <MetricCard
          icon={FileWarning}
          label="Review/correction blocked"
          value={
            loading
              ? "..."
              : pendingReviewSummary.documentReview +
                pendingReviewSummary.correctionRequested
          }
          tone="destructive"
        />
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-3 py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Loading work queue...
            </span>
          </CardContent>
        </Card>
      ) : applications.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <Inbox className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
            <p className="mb-1 text-sm font-medium">
              No applications in this division
            </p>
            <p className="text-sm text-muted-foreground">
              Submitted applications for the selected division will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {EVALUATION_QUEUE_GROUPS.map((group) => {
            const items = queueGroups[group.key];
            if (!items.length) return null;
            return (
              <section key={group.key} className="space-y-3">
                <div className="flex items-baseline gap-2">
                  <h2 className="font-heading text-lg font-bold tracking-normal">
                    {group.title}
                  </h2>
                  <span className="rounded-full bg-surface-container-highest px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
                    {items.length}
                  </span>
                  <span className="text-xs text-muted-foreground">{group.hint}</span>
                </div>
                <div className="space-y-3">
                  {items.map((application) => (
                    <CandidateResultCard
                      key={application.id}
                      application={application}
                      variant="evaluation"
                      from="/recruiter/evaluation"
                      fromLabel="Evaluation"
                      returnLabel="Kembali ke Evaluation"
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <ConfirmActionDialog
        open={reEvaluateOpen}
        onOpenChange={setReEvaluateOpen}
        title="Re-evaluate all candidates?"
        description="This will re-run evaluation for every candidate in the selected division, including candidates that already have scores."
        confirmLabel="Re-evaluate"
        cancelLabel="Cancel"
        loading={triggering}
        onConfirm={() => runEvaluate({ force: true })}
      />
    </div>
  );
}
