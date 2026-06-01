import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Megaphone, Sparkles } from "lucide-react";
import { toast } from "sonner";

import ConfirmActionDialog from "@/components/common/ConfirmActionDialog";
import MetricCard from "@/components/common/MetricCard";
import PageHeader from "@/components/layout/PageHeader";
import AnnouncementSafetyPanel from "@/components/recruiter/AnnouncementSafetyPanel";
import ApplicationFilters from "@/components/recruiter/ApplicationFilters";
import ApplicationsTable from "@/components/recruiter/ApplicationsTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
    Promise.resolve().then(loadActivePeriod);
  }, [loadActivePeriod]);

  useEffect(() => {
    Promise.resolve().then(loadApplications);
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

  const disabledReason = !activePeriod
    ? "No active period."
    : divisionFilter === "all"
    ? "Select one division before publishing."
    : !phaseAllowsPublish
    ? "Announcements can only be published during announcement phase."
    : checkedCount === 0
    ? "Select at least one pass candidate."
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Recruiter / Announcements"
        title="Announcements"
        description="Prepare pass/fail results by division with safety checks before publishing."
      />

      <AnnouncementSafetyPanel
        activePeriod={activePeriod}
        divisionFilter={divisionFilter}
        checkedCount={checkedCount}
        evaluatedCount={evaluatedInView.length}
        phaseAllowsPublish={phaseAllowsPublish}
        isSuperAdmin={isSuperAdmin}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard
          icon={Sparkles}
          label="Evaluated in view"
          value={loading ? "..." : evaluatedInView.length}
          tone="success"
        />
        <MetricCard
          icon={Megaphone}
          label="Selected pass"
          value={checkedCount}
          tone="success"
        />
        <MetricCard
          icon={Bell}
          label="Already announced"
          value={loading ? "..." : summary.announcedCount}
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
            Publish Results ({checkedCount})
          </Button>
        </div>
      </ApplicationFilters>

      {divisionFilter !== "all" && (
        <Card className="brand-card">
          <CardContent className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Division
              </p>
              <p className="mt-1 font-medium">{formatDivision(divisionFilter)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Candidate-facing pass
              </p>
              <p className="mt-1 font-medium">{checkedCount} candidates</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Candidate-facing fail
              </p>
              <p className="mt-1 font-medium">{failCount} candidates</p>
            </div>
          </CardContent>
        </Card>
      )}

      <ApplicationsTable
        applications={applications}
        loading={loading}
        selectable
        checked={checked}
        onToggleChecked={handleToggleChecked}
        emptyTitle="No evaluated applications"
        emptyDescription="Run evaluation before publishing pass/fail announcements."
        detailFrom="/recruiter/announcements"
        detailFromLabel="Announcements"
        detailReturnLabel="Kembali ke Announcements"
      />

      <ConfirmActionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirm result publication"
        description={`Publish ${checkedCount} pass and ${failCount} fail result(s) for ${formatDivision(divisionFilter)}. This action cannot be undone.`}
        confirmLabel={publishing ? "Publishing..." : "Publish Results"}
        cancelLabel="Cancel"
        loading={publishing}
        destructive
        onConfirm={handleConfirmPublish}
      />
    </div>
  );
}
