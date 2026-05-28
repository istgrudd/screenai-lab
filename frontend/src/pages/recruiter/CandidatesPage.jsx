import { useEffect, useMemo, useState } from "react";
import { BarChart3, Sparkles, Trophy, Users } from "lucide-react";
import { toast } from "sonner";

import ApplicationFilters from "@/components/recruiter/ApplicationFilters";
import ApplicationsTable from "@/components/recruiter/ApplicationsTable";
import { MetricCard } from "@/components/recruiter/WorkspaceCards";
import { listRecruiterApplications } from "@/lib/api";
import {
  candidateEvaluationId,
  sortRankedApplications,
  summarizeApplications,
} from "@/lib/recruiterWorkspace";

export default function RecruiterCandidatesPage() {
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
        toast.error(error.message || "Failed to load candidates");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [divisionFilter, statusFilter]);

  const rankedApplications = useMemo(
    () =>
      sortRankedApplications(
        applications.filter((application) => candidateEvaluationId(application))
      ),
    [applications]
  );
  const summary = useMemo(
    () => summarizeApplications(rankedApplications),
    [rankedApplications]
  );
  const recommendedCount = rankedApplications.filter(
    (application) => application.is_recommended
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" />
          Candidates
        </h1>
        <p className="text-muted-foreground mt-1">
          Ranked and scored candidate review list. Open rows to inspect detailed evidence and scores.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          icon={Users}
          label="Scored candidates"
          value={loading ? "..." : rankedApplications.length}
        />
        <MetricCard
          icon={Sparkles}
          label="Recommended"
          value={loading ? "..." : recommendedCount}
          tone="green"
        />
        <MetricCard
          icon={BarChart3}
          label="Evaluated in view"
          value={loading ? "..." : summary.scoredCount}
          tone="green"
        />
        <MetricCard
          icon={Trophy}
          label="Top Score"
          value={
            loading
              ? "..."
              : summary.topScore != null
              ? summary.topScore.toFixed(1)
              : "-"
          }
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
        applications={rankedApplications}
        loading={loading}
        emptyTitle="No scored candidates"
        emptyDescription="Run evaluation before opening the ranked candidate review list."
      />
    </div>
  );
}
