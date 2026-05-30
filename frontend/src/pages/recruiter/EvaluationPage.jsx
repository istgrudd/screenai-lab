import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Loader2,
  Play,
  RotateCw,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import RecruitmentPhaseCard from "@/components/RecruitmentPhaseCard";
import ApplicationsTable from "@/components/recruiter/ApplicationsTable";
import { MetricCard } from "@/components/recruiter/WorkspaceCards";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  evaluateBatch,
  getActivePeriod,
  listRecruiterApplications,
} from "@/lib/api";
import {
  WORKFLOW_DIVISIONS,
  summarizeApplications,
} from "@/lib/recruiterWorkspace";

export default function RecruiterEvaluationPage() {
  const [applications, setApplications] = useState([]);
  const [selectedDivision, setSelectedDivision] = useState("big_data");
  const [activePeriod, setActivePeriod] = useState(null);
  const [loading, setLoading] = useState(true);
  const [periodLoading, setPeriodLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [reEvaluating, setReEvaluating] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [evaluateWarning, setEvaluateWarning] = useState(null);
  const [lastSkippedCount, setLastSkippedCount] = useState(0);
  const [reEvaluateOpen, setReEvaluateOpen] = useState(false);
  const evaluateButtonRef = useRef(null);

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
    loadActivePeriod();
  }, []);

  useEffect(() => {
    loadApplications();
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
  const canReEvaluate = lastSkippedCount > 0 || evaluatedInSelectedDivision > 0;

  const runEvaluate = async ({ force = false } = {}) => {
    if (!selectedDivision) {
      toast.error("Please select a division first.");
      return;
    }
    if (force) setReEvaluating(true);
    else setEvaluating(true);

    try {
      const result = await evaluateBatch(selectedDivision, { force });
      const evaluated = result.evaluated_count ?? 0;
      const skipped = result.skipped_count ?? 0;
      setLastSkippedCount(skipped);

      if (evaluated === 0 && skipped > 0) {
        toast.info("All candidates in this division were already evaluated.");
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

      setBannerDismissed(true);
      await loadApplications();
      await loadActivePeriod();
    } catch (error) {
      toast.error(error.message || "Evaluation failed");
    } finally {
      setEvaluating(false);
      setReEvaluating(false);
    }
  };

  const handleConfirmReEvaluate = async () => {
    setReEvaluateOpen(false);
    await runEvaluate({ force: true });
  };

  const phaseWarn = activePeriod && phase && phase !== "EVALUATION";
  const showWarn = phaseWarn || Boolean(evaluateWarning);
  const tooltipMsg = showWarn
    ? "Evaluation is being run outside the official evaluation window."
    : !selectedDivision
    ? "Select a division first"
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            Evaluation
          </h1>
          <p className="text-muted-foreground mt-1">
            Run AI evaluation per division using the existing backend evaluation flow.
          </p>
        </div>
      </div>

      <RecruitmentPhaseCard
        role="recruiter"
        period={activePeriod}
        loading={periodLoading}
        submittedCount={applications.length}
      />

      {activePeriod?.evaluation_prompt && !bannerDismissed && (
        <div className="rounded-lg border-2 border-yellow-500/40 bg-yellow-500/10 p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-md bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 flex items-center justify-center shrink-0">
            <Bell className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              Registration has ended.
            </p>
            <p className="text-xs text-yellow-700/80 dark:text-yellow-200/80 mt-0.5">
              Run evaluation to start processing candidates.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              onClick={() => {
                evaluateButtonRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "center",
                });
                evaluateButtonRef.current?.focus();
              }}
              className="bg-yellow-600 hover:bg-yellow-700 text-white"
            >
              <Play className="w-3.5 h-3.5 mr-1.5" />
              Run Evaluation
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setBannerDismissed(true)}
              aria-label="Dismiss banner"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Evaluation Controls</CardTitle>
          <CardDescription>
            Evaluation only targets applications whose required documents are verified.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Select value={selectedDivision} onValueChange={setSelectedDivision}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Pick a division" />
            </SelectTrigger>
            <SelectContent>
              {WORKFLOW_DIVISIONS.map((division) => (
                <SelectItem key={division.id} value={division.id}>
                  {division.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={tooltipMsg ? 0 : -1}>
                <Button
                  ref={evaluateButtonRef}
                  onClick={() => runEvaluate({ force: false })}
                  disabled={evaluating || reEvaluating || !selectedDivision}
                  variant={showWarn ? "outline" : "default"}
                  className={
                    showWarn
                      ? "border-yellow-500/50 text-yellow-700 hover:bg-yellow-500/10 dark:text-yellow-400"
                      : ""
                  }
                >
                  {evaluating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Evaluating...
                    </>
                  ) : (
                    <>
                      {showWarn ? (
                        <AlertTriangle className="w-4 h-4 mr-2" />
                      ) : (
                        <Play className="w-4 h-4 mr-2" />
                      )}
                      Run Evaluation
                    </>
                  )}
                </Button>
              </span>
            </TooltipTrigger>
            {tooltipMsg && <TooltipContent>{tooltipMsg}</TooltipContent>}
          </Tooltip>

          {canReEvaluate && (
            <Button
              variant="outline"
              onClick={() => setReEvaluateOpen(true)}
              disabled={evaluating || reEvaluating || !selectedDivision}
            >
              {reEvaluating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Re-evaluating...
                </>
              ) : (
                <>
                  <RotateCw className="w-4 h-4 mr-2" />
                  Re-evaluate All
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          icon={Users}
          label="Applications in division"
          value={loading ? "..." : summary.applicationCount}
        />
        <MetricCard
          icon={BarChart3}
          label="Already evaluated"
          value={loading ? "..." : summary.scoredCount}
          tone="green"
        />
        <MetricCard
          icon={Sparkles}
          label="Pending evaluation"
          value={loading ? "..." : summary.pendingEvaluationCount}
          tone="yellow"
        />
      </div>

      <ApplicationsTable
        applications={applications}
        loading={loading}
        emptyTitle="No applications in this division"
        emptyDescription="Submitted applications for the selected division will appear here."
      />

      <AlertDialog open={reEvaluateOpen} onOpenChange={setReEvaluateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-evaluate all candidates?</AlertDialogTitle>
            <AlertDialogDescription>
              This will re-run evaluation for every candidate in the selected division, including candidates that already have scores.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reEvaluating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                handleConfirmReEvaluate();
              }}
              disabled={reEvaluating}
            >
              {reEvaluating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Re-evaluating...
                </>
              ) : (
                "Re-evaluate"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
