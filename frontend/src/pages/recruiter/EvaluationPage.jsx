import { useEffect, useMemo, useState } from "react";
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
import EvaluationRunningOverlay from "@/components/recruiter/EvaluationRunningOverlay";
import { Card, CardContent } from "@/components/ui/card";
import {
  evaluateBatch,
  getActivePeriod,
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

export default function RecruiterEvaluationPage() {
  const [applications, setApplications] = useState([]);
  const [selectedDivision, setSelectedDivision] = useState("big_data");
  const [activePeriod, setActivePeriod] = useState(null);
  const [loading, setLoading] = useState(true);
  const [periodLoading, setPeriodLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluateWarning, setEvaluateWarning] = useState(null);
  const [lastSkippedCount, setLastSkippedCount] = useState(0);
  const [lastResult, setLastResult] = useState(null);
  const [reEvaluateOpen, setReEvaluateOpen] = useState(false);

  const phase = activePeriod?.current_phase || null;

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

  useEffect(() => {
    Promise.resolve().then(loadActivePeriod);
  }, []);

  useEffect(() => {
    Promise.resolve().then(loadApplications);
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
    if (evaluating) return;
    if (!selectedDivision) {
      toast.error("Please select a division first.");
      return;
    }

    setEvaluating(true);
    setLastResult(null);
    try {
      const result = await evaluateBatch(selectedDivision, { force });
      const evaluated = result.evaluated_count ?? 0;
      const skipped = result.skipped_count ?? 0;
      const skippedUnverified = result.skipped_unverified_count ?? 0;
      const skippedCorrection = result.skipped_correction_count ?? 0;
      setLastSkippedCount(skipped);
      setLastResult({
        evaluated,
        skipped,
        skippedUnverified,
        skippedCorrection,
        force,
      });

      if (evaluated === 0 && skipped > 0) {
        toast.info("All candidates in this division were already evaluated.");
      } else if (evaluated === 0 && (skippedUnverified > 0 || skippedCorrection > 0)) {
        toast.warning("No verified candidates were ready for evaluation. Pending or correction candidates were skipped.");
      } else if (evaluated === 0) {
        toast.info("No verified candidates are ready for evaluation in this division.");
      } else if (skipped > 0) {
        toast.success(
          `Evaluation complete. ${evaluated} candidates evaluated, ${skipped} skipped.`
        );
      } else {
        toast.success(`Evaluation complete. ${evaluated} candidates evaluated.`);
      }

      if (result.errors?.length > 0) {
        toast.warning(`${result.errors.length} application(s) had errors.`);
      }
      if (result._warning) {
        toast.warning(result._warning);
        setEvaluateWarning(result._warning);
      } else {
        setEvaluateWarning(null);
      }

      await loadApplications();
      await loadActivePeriod();
    } catch (error) {
      setLastResult({
        error: error.message || "Evaluation failed",
        force,
      });
      toast.error(error.message || "Evaluation failed");
    } finally {
      setEvaluating(false);
    }
  };

  const phaseWarn = activePeriod && phase && phase !== "EVALUATION";
  const showWarn = phaseWarn || Boolean(evaluateWarning);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Recruiter / Evaluation"
        title="Evaluation"
        description="Run AI-anonymized evaluation and validate AI results per division. Personal identifiers are excluded from AI evaluation input, while recruiter-facing candidate data stays visible. Controls are locked while evaluation is running to prevent duplicate or inconsistent processing."
      />

      <EvaluationRunningOverlay running={evaluating} />

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
        evaluating={evaluating || loading || periodLoading}
        onRun={() => runEvaluate({ force: false })}
        onReRun={() => setReEvaluateOpen(true)}
      />

      {lastResult && (
        <Card className={`brand-card ${lastResult.error ? "bg-destructive/10" : "bg-success/10"}`}>
          <CardContent className="p-5 text-sm leading-6 text-muted-foreground">
            {lastResult.error ? (
              <span>{lastResult.error}. Controls are available again; retry after checking the queue.</span>
            ) : (
              <span>
                Evaluation finished: {lastResult.evaluated} evaluated,{" "}
                {lastResult.skipped} skipped, {lastResult.skippedUnverified} unverified,{" "}
                {lastResult.skippedCorrection} correction-blocked.
              </span>
            )}
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
        loading={evaluating}
        onConfirm={() => runEvaluate({ force: true })}
      />
    </div>
  );
}
