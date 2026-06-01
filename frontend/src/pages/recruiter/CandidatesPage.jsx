import { useEffect, useMemo, useState } from "react";
import { BarChart3, Sparkles, Trophy, Users } from "lucide-react";
import { toast } from "sonner";

import MetricCard from "@/components/common/MetricCard";
import PageHeader from "@/components/layout/PageHeader";
import ApplicationFilters from "@/components/recruiter/ApplicationFilters";
import ApplicationsTable from "@/components/recruiter/ApplicationsTable";
import CandidateReviewCard from "@/components/recruiter/CandidateReviewCard";
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
  const topThree = rankedApplications.slice(0, 3);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Recruiter / Candidates"
        title="Candidates"
        description="Ranked candidate review list with recommendation, score, and evidence detail."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard
          icon={Users}
          label="Scored candidates"
          value={loading ? "..." : rankedApplications.length}
        />
        <MetricCard
          icon={Sparkles}
          label="Recommended"
          value={loading ? "..." : recommendedCount}
          tone="success"
        />
        <MetricCard
          icon={BarChart3}
          label="Evaluated in view"
          value={loading ? "..." : summary.scoredCount}
          tone="success"
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
          tone="warning"
        />
      </div>

      {topThree.length > 0 && (
        <section className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">
              Ranking Preview
            </p>
            <h2 className="mt-1 font-heading text-xl font-bold tracking-normal">
              Top candidates in current view
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {topThree.map((application) => (
              <CandidateReviewCard
                key={application.id}
                application={application}
                from="/recruiter/candidates"
                fromLabel="Candidates"
                returnLabel="Kembali ke Candidates"
              />
            ))}
          </div>
        </section>
      )}

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
        detailFrom="/recruiter/candidates"
        detailFromLabel="Candidates"
        detailReturnLabel="Kembali ke Candidates"
      />
    </div>
  );
}
