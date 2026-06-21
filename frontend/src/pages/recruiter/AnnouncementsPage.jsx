import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, HelpCircle, Megaphone, Sparkles, XCircle } from "lucide-react";
import { toast } from "sonner";

import ConfirmActionDialog from "@/components/common/ConfirmActionDialog";
import MetricCard from "@/components/common/MetricCard";
import PageHeader from "@/components/layout/PageHeader";
import AnnouncementSafetyPanel from "@/components/recruiter/AnnouncementSafetyPanel";
import ApplicationFilters from "@/components/recruiter/ApplicationFilters";
import CandidateCompactTable from "@/components/recruiter/CandidateCompactTable";
import { Button } from "@/components/ui/button";
import {
  bulkAnnounce,
  getActivePeriod,
  listRecruiterApplications,
} from "@/lib/api";
import { getCurrentUser, ROLES } from "@/lib/auth";
import {
  ANNOUNCE_DECISIONS,
  defaultAnnouncementDecision,
  formatDivision,
  isAnnouncedApplication,
  isReadyToAnnounce,
  sortRankedApplications,
} from "@/lib/recruiterWorkspace";

function SectionHeader({ title, hint, count }) {
  return (
    <div className="flex items-baseline gap-2">
      <h2 className="font-heading text-lg font-bold tracking-normal">{title}</h2>
      {count != null && (
        <span className="rounded-full bg-surface-container-highest px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
          {count}
        </span>
      )}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export default function RecruiterAnnouncementsPage() {
  const [applications, setApplications] = useState([]);
  const [divisionFilter, setDivisionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [decisionOverrides, setDecisionOverrides] = useState({});
  const [activePeriod, setActivePeriod] = useState(null);
  const [loading, setLoading] = useState(true);
  const [periodLoading, setPeriodLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const currentUser = getCurrentUser();
  const isSuperAdmin = currentUser?.role === ROLES.SUPER_ADMIN;
  const phase = activePeriod?.current_phase || null;
  const phaseAllowsPublish = phase === "ANNOUNCEMENT" || isSuperAdmin;
  const recommendationAvailable = Boolean(
    activePeriod && activePeriod.threshold_n != null
  );

  const loadApplications = useCallback(async () => {
    setLoading(true);
    try {
      const apps = await listRecruiterApplications({
        division: divisionFilter !== "all" ? divisionFilter : undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
      });
      setApplications(apps || []);
      // A fresh cohort invalidates any in-progress manual decisions.
      setDecisionOverrides({});
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
    Promise.resolve().then(loadActivePeriod);
  }, [loadActivePeriod]);

  useEffect(() => {
    Promise.resolve().then(loadApplications);
  }, [loadApplications]);

  // Bulk publish only touches ready-to-announce (screening) candidates.
  // Order best-first (rank asc, then composite score desc) so #1 is on top.
  const readyApplications = useMemo(
    () => sortRankedApplications(applications.filter(isReadyToAnnounce)),
    [applications]
  );
  // Already-announced candidates are monitoring-only; never in the payload.
  const publishedApplications = useMemo(
    () => sortRankedApplications(applications.filter(isAnnouncedApplication)),
    [applications]
  );

  // Baseline decisions are derived from AI recommendation; manual edits live in
  // decisionOverrides and win. This keeps decisions a pure derivation (no
  // setState-in-effect) while still allowing user changes.
  const baselineDecisions = useMemo(() => {
    const baseline = {};
    for (const application of readyApplications) {
      baseline[application.id] = defaultAnnouncementDecision(application, {
        recommendationAvailable,
      });
    }
    return baseline;
  }, [readyApplications, recommendationAvailable]);

  const decisions = useMemo(
    () => ({ ...baselineDecisions, ...decisionOverrides }),
    [baselineDecisions, decisionOverrides]
  );
  const decisionCounts = useMemo(() => {
    let pass = 0;
    let fail = 0;
    let undecided = 0;
    for (const application of readyApplications) {
      const decision = decisions[application.id] || ANNOUNCE_DECISIONS.UNDECIDED;
      if (decision === ANNOUNCE_DECISIONS.PASS) pass += 1;
      else if (decision === ANNOUNCE_DECISIONS.FAIL) fail += 1;
      else undecided += 1;
    }
    return { pass, fail, undecided };
  }, [readyApplications, decisions]);

  const passIds = useMemo(
    () =>
      readyApplications
        .filter(
          (application) => decisions[application.id] === ANNOUNCE_DECISIONS.PASS
        )
        .map((application) => application.id),
    [readyApplications, decisions]
  );

  const handleDecisionChange = useCallback((id, decision) => {
    setDecisionOverrides((previous) => ({ ...previous, [id]: decision }));
  }, []);

  const handleApplyRecommendation = useCallback(() => {
    setDecisionOverrides((previous) => {
      const next = { ...previous };
      for (const application of readyApplications) {
        next[application.id] = application.is_recommended
          ? ANNOUNCE_DECISIONS.PASS
          : ANNOUNCE_DECISIONS.FAIL;
      }
      return next;
    });
  }, [readyApplications]);

  const handleMarkUndecidedAsFail = useCallback(() => {
    setDecisionOverrides((previous) => {
      const next = { ...previous };
      for (const application of readyApplications) {
        const effective =
          next[application.id] ||
          baselineDecisions[application.id] ||
          ANNOUNCE_DECISIONS.UNDECIDED;
        if (effective === ANNOUNCE_DECISIONS.UNDECIDED) {
          next[application.id] = ANNOUNCE_DECISIONS.FAIL;
        }
      }
      return next;
    });
  }, [readyApplications, baselineDecisions]);

  const canPublish =
    divisionFilter !== "all" &&
    activePeriod != null &&
    phaseAllowsPublish &&
    readyApplications.length > 0 &&
    decisionCounts.undecided === 0;

  const handleConfirmPublish = async () => {
    if (!canPublish) return;
    setPublishing(true);
    try {
      const result = await bulkAnnounce({
        division: divisionFilter,
        periodId: activePeriod.id,
        passedApplicationIds: passIds,
      });
      toast.success(
        `Published results: ${result.announced_pass} passed, ${result.announced_fail} failed.`
      );
      setConfirmOpen(false);
      await loadApplications();
    } catch (error) {
      toast.error(error.message || "Failed to publish announcements");
    } finally {
      setPublishing(false);
    }
  };

  const disabledReason = !activePeriod
    ? "No active period."
    : divisionFilter === "all"
    ? "Select one division before publishing."
    : !phaseAllowsPublish
    ? "Announcements can only be published during announcement phase."
    : readyApplications.length === 0
    ? "No ready-to-announce candidates to publish."
    : decisionCounts.undecided > 0
    ? `${decisionCounts.undecided} candidate(s) still Undecided.`
    : null;

  const confirmDescription =
    decisionCounts.pass === 0
      ? `No candidates selected to pass. All ${decisionCounts.fail} candidate(s) in the ${formatDivision(divisionFilter)} scope will be announced as Fail. Continue?`
      : `Publish ${decisionCounts.pass} Pass and ${decisionCounts.fail} Fail for ${formatDivision(divisionFilter)}. This action cannot be undone.`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Recruiter / Announcements"
        title="Announcements"
        description="Select final pass/fail decisions before publishing. Only ready-to-announce candidates are part of the publish decision; already-announced candidates are shown read-only. AI recommendations are decision support and can be adjusted."
      />

      <AnnouncementSafetyPanel
        activePeriod={activePeriod}
        divisionFilter={divisionFilter}
        passCount={decisionCounts.pass}
        failCount={decisionCounts.fail}
        undecidedCount={decisionCounts.undecided}
        evaluatedCount={readyApplications.length}
        phaseAllowsPublish={phaseAllowsPublish}
        isSuperAdmin={isSuperAdmin}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard
          icon={CheckCircle2}
          label="Pass"
          value={loading ? "..." : decisionCounts.pass}
          tone="success"
        />
        <MetricCard
          icon={XCircle}
          label="Fail"
          value={loading ? "..." : decisionCounts.fail}
          tone="destructive"
        />
        <MetricCard
          icon={HelpCircle}
          label="Undecided"
          value={loading ? "..." : decisionCounts.undecided}
          tone="warning"
        />
      </div>

      <ApplicationFilters
        divisionFilter={divisionFilter}
        statusFilter={statusFilter}
        onDivisionChange={setDivisionFilter}
        onStatusChange={setStatusFilter}
      >
        <div className="ml-auto flex flex-col gap-2 sm:flex-row sm:items-center">
          {disabledReason && (
            <span className="text-xs text-muted-foreground">{disabledReason}</span>
          )}
          <Button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={!canPublish || publishing || periodLoading}
            className="gap-2"
          >
            <Megaphone className="h-4 w-4" />
            Publish Results
          </Button>
        </div>
      </ApplicationFilters>

      {divisionFilter !== "all" && readyApplications.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {recommendationAvailable && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={handleApplyRecommendation}
            >
              <Sparkles className="h-4 w-4" />
              Apply AI Recommendation
            </Button>
          )}
          {decisionCounts.undecided > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleMarkUndecidedAsFail}
            >
              Mark all Undecided → Fail
            </Button>
          )}
        </div>
      )}

      <section className="space-y-3">
        <SectionHeader
          title="Ready to Announce"
          hint="Shows candidates who have completed AI Evaluation and are not yet announced."
          count={loading ? null : readyApplications.length}
        />
        <CandidateCompactTable
          applications={readyApplications}
          loading={loading}
          decisions={decisions}
          onDecisionChange={handleDecisionChange}
          emptyTitle="No ready-to-announce candidates"
          emptyDescription="Candidates appear here once their AI evaluation is complete and before they are announced."
          detailFrom="/recruiter/announcements"
          detailFromLabel="Announcements"
          detailReturnLabel="Back to Announcements"
        />
      </section>

      {!loading && publishedApplications.length > 0 && (
        <section className="space-y-3">
          <SectionHeader
            title="Published"
            hint="Already announced; read-only and excluded from bulk publish."
            count={publishedApplications.length}
          />
          <CandidateCompactTable
            applications={publishedApplications}
            loading={false}
            readOnly
            detailFrom="/recruiter/announcements"
            detailFromLabel="Announcements"
            detailReturnLabel="Back to Announcements"
          />
        </section>
      )}

      <ConfirmActionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={
          decisionCounts.pass === 0
            ? "Announce all as Fail?"
            : "Confirm result publication"
        }
        description={confirmDescription}
        confirmLabel={publishing ? "Publishing..." : "Publish Results"}
        cancelLabel="Cancel"
        loading={publishing}
        destructive
        onConfirm={handleConfirmPublish}
      />
    </div>
  );
}
