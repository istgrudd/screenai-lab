import { useEffect, useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import { toast } from "sonner";

import ApplicationFilters from "@/components/recruiter/ApplicationFilters";
import ApplicationsTable from "@/components/recruiter/ApplicationsTable";
import { MetricCard } from "@/components/recruiter/WorkspaceCards";
import { listRecruiterApplications } from "@/lib/api";
import { summarizeApplications } from "@/lib/recruiterWorkspace";
import { Users, BarChart3, Sparkles } from "lucide-react";

export default function RecruiterApplicationsPage() {
  const [applications, setApplications] = useState([]);
  const [divisionFilter, setDivisionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const apps = await listRecruiterApplications({
          division: divisionFilter !== "all" ? divisionFilter : undefined,
          status: statusFilter !== "all" ? statusFilter : undefined,
        });
        if (!cancelled) setApplications(apps || []);
      } catch (error) {
        toast.error(error.message || "Failed to load applications");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [divisionFilter, statusFilter]);

  const summary = useMemo(
    () => summarizeApplications(applications),
    [applications]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-primary" />
          Applications
        </h1>
        <p className="text-muted-foreground mt-1">
          Filter submitted applications and open candidate detail after evaluation.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          icon={Users}
          label="Applications in view"
          value={loading ? "..." : summary.applicationCount}
        />
        <MetricCard
          icon={BarChart3}
          label="Evaluated in view"
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

      <ApplicationFilters
        divisionFilter={divisionFilter}
        statusFilter={statusFilter}
        onDivisionChange={setDivisionFilter}
        onStatusChange={setStatusFilter}
      />

      <ApplicationsTable
        applications={applications}
        loading={loading}
      />
    </div>
  );
}
