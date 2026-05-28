import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Bell, Loader2, Megaphone, Sparkles } from "lucide-react";
import { toast } from "sonner";

import RecruitmentPhaseCard from "@/components/RecruitmentPhaseCard";
import ApplicationFilters from "@/components/recruiter/ApplicationFilters";
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
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  bulkAnnounce,
  getActivePeriod,
  listRecruiterApplications,
} from "@/lib/api";
import { getCurrentUser, ROLES } from "@/lib/auth";
import {
  EVALUATED_STATUSES,
  formatDivision,
  summarizeApplications,
} from "@/lib/recruiterWorkspace";

export default function RecruiterAnnouncementsPage() {
  const [applications, setApplications] = useState([]);
  const [divisionFilter, setDivisionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [checked, setChecked] = useState({});
  const [activePeriod, setActivePeriod] = useState(null);
  const [loading, setLoading] = useState(true);
  const [periodLoading, setPeriodLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const currentUser = getCurrentUser();
  const isSuperAdmin = currentUser?.role === ROLES.SUPER_ADMIN;
  const phase = activePeriod?.current_phase || null;
  const phaseAllowsPublish = phase === "ANNOUNCEMENT" || isSuperAdmin;

  const loadApplications = useCallback(async () => {
    setLoading(true);
    try {
      const apps = await listRecruiterApplications({
        division: divisionFilter !== "all" ? divisionFilter : undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
      });
      setApplications(apps || []);
      const initial = {};
      for (const application of apps || []) {
        if (application.status === "announced_pass") {
          initial[application.id] = true;
        }
      }
      setChecked(initial);
    } catch (error) {
      toast.error(error.message || "Failed to load applications");
    } finally {
      setLoading(false);
    }
  }, [divisionFilter, statusFilter]);

  const loadActivePeriod = useCallback(async () => {
    setPeriodLoading(true);
    try {
      const period = await getActivePeriod();
      setActivePeriod(period);
    } catch {
      setActivePeriod(null);
    } finally {
      setPeriodLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActivePeriod();
  }, [loadActivePeriod]);

  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  const checkedIds = useMemo(
    () =>
      applications
        .filter(
          (application) =>
            checked[application.id] && EVALUATED_STATUSES.has(application.status)
        )
        .map((application) => application.id),
    [applications, checked]
  );
  const checkedCount = checkedIds.length;
  const evaluatedInView = useMemo(
    () =>
      applications.filter((application) =>
        EVALUATED_STATUSES.has(application.status)
      ),
    [applications]
  );
  const failCount = Math.max(evaluatedInView.length - checkedCount, 0);
  const canPublish =
    checkedCount > 0 &&
    divisionFilter !== "all" &&
    activePeriod != null &&
    phaseAllowsPublish;
  const summary = useMemo(
    () => summarizeApplications(applications),
    [applications]
  );

  const handleToggleChecked = useCallback((id, value) => {
    setChecked((previous) => ({ ...previous, [id]: Boolean(value) }));
  }, []);

  const handleConfirmPublish = async () => {
    if (!canPublish) return;
    setPublishing(true);
    try {
      const result = await bulkAnnounce({
        division: divisionFilter,
        periodId: activePeriod.id,
        passedApplicationIds: checkedIds,
      });
      toast.success(
        `Published results: ${result.announced_pass} passed, ${result.announced_fail} did not pass.`
      );
      setConfirmOpen(false);
      await loadApplications();
    } catch (error) {
      toast.error(error.message || "Failed to publish announcements");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Bell className="w-6 h-6 text-primary" />
          Announcements
        </h1>
        <p className="text-muted-foreground mt-1">
          Select evaluated candidates who pass, then publish pass/fail results by division.
        </p>
      </div>

      <RecruitmentPhaseCard
        role="recruiter"
        period={activePeriod}
        loading={periodLoading}
        submittedCount={applications.length}
      />

      {isSuperAdmin && activePeriod && phase !== "ANNOUNCEMENT" && (
        <Card className="border-yellow-500/40 bg-yellow-500/10">
          <CardContent className="py-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-700 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                Super admin bypass is available.
              </p>
              <p className="text-xs text-yellow-700/80 dark:text-yellow-200/80 mt-0.5">
                Backend permits super admins to publish outside the announcement phase.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          icon={Sparkles}
          label="Evaluated in view"
          value={loading ? "..." : evaluatedInView.length}
          tone="green"
        />
        <MetricCard
          icon={Megaphone}
          label="Selected pass"
          value={checkedCount}
          tone="green"
        />
        <MetricCard
          icon={Bell}
          label="Already announced"
          value={loading ? "..." : summary.announcedCount}
          tone="yellow"
        />
      </div>

      <ApplicationFilters
        divisionFilter={divisionFilter}
        statusFilter={statusFilter}
        onDivisionChange={setDivisionFilter}
        onStatusChange={setStatusFilter}
      >
        <div className="ml-auto flex items-center gap-2">
          {divisionFilter === "all" && checkedCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Filter to one division
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Select one division before publishing results.
              </TooltipContent>
            </Tooltip>
          )}
          {divisionFilter !== "all" && activePeriod == null && checkedCount > 0 && (
            <span className="text-xs text-destructive inline-flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              No active period
            </span>
          )}
          {checkedCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={!phaseAllowsPublish && activePeriod ? 0 : -1}>
                  <Button
                    onClick={() => setConfirmOpen(true)}
                    disabled={!canPublish}
                  >
                    <Megaphone className="w-4 h-4 mr-2" />
                    Publish Results ({checkedCount})
                  </Button>
                </span>
              </TooltipTrigger>
              {!phaseAllowsPublish && activePeriod && (
                <TooltipContent>
                  Announcements can only be published during the announcement phase.
                </TooltipContent>
              )}
            </Tooltip>
          )}
        </div>
      </ApplicationFilters>

      <ApplicationsTable
        applications={applications}
        loading={loading}
        selectable
        checked={checked}
        onToggleChecked={handleToggleChecked}
        emptyTitle="No evaluated applications"
        emptyDescription="Run evaluation before publishing pass/fail announcements."
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm result publication</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-1">
                <p>
                  This will publish results for{" "}
                  <span className="font-medium text-foreground">
                    {divisionFilter !== "all"
                      ? formatDivision(divisionFilter)
                      : "-"}
                  </span>
                  .
                </p>
                <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
                  <p>
                    <span className="text-green-600 font-medium">Pass:</span>{" "}
                    {checkedCount} candidates
                  </p>
                  <p>
                    <span className="text-destructive font-medium">Fail:</span>{" "}
                    {failCount} candidates
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Candidates not selected as pass will be announced as fail.
                </p>
                <p className="text-xs font-medium text-destructive">
                  This action cannot be undone.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                handleConfirmPublish();
              }}
              disabled={publishing || !canPublish}
            >
              {publishing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Publishing...
                </>
              ) : (
                "Publish"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
