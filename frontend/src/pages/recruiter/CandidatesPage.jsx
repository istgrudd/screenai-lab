import { useEffect, useMemo, useState } from "react";
import { BarChart3, CheckCircle2, Inbox, Loader2, Trophy, Users } from "lucide-react";
import { toast } from "sonner";

import MetricCard from "@/components/common/MetricCard";
import PageHeader from "@/components/layout/PageHeader";
import ApplicationFilters from "@/components/recruiter/ApplicationFilters";
import CandidateResultCard from "@/components/recruiter/CandidateResultCard";
import { Card, CardContent } from "@/components/ui/card";
import { listRecruiterApplications } from "@/lib/api";
import {
  candidateEvaluationId,
  getAiValidationStatus,
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
  const validatedCount = useMemo(
    () =>
      rankedApplications.filter(
        (application) => getAiValidationStatus(application) === "validated"
      ).length,
    [rankedApplications]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Recruiter / Candidates"
        title="Candidates"
        description="Ranked candidate review list with score, validation status, and detail access. AI scoring uses anonymized document content; recruiter-facing candidate data remains visible for operational review."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard
          icon={Users}
          label="Scored candidates"
          value={loading ? "..." : rankedApplications.length}
        />
        <MetricCard
          icon={CheckCircle2}
          label="Validated"
          value={loading ? "..." : validatedCount}
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

      <ApplicationFilters
        divisionFilter={divisionFilter}
        statusFilter={statusFilter}
        onDivisionChange={setDivisionFilter}
        onStatusChange={setStatusFilter}
      />

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-3 py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Loading candidates...
            </span>
          </CardContent>
        </Card>
      ) : rankedApplications.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <Inbox className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
            <p className="mb-1 text-sm font-medium">No scored candidates</p>
            <p className="text-sm text-muted-foreground">
              Run evaluation before opening the ranked candidate review list.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rankedApplications.map((application) => (
            <CandidateResultCard
              key={application.id}
              application={application}
              variant="ranking"
              from="/recruiter/candidates"
              fromLabel="Candidates"
              returnLabel="Back to Candidates"
              showAcademicMeta
            />
          ))}
        </div>
      )}
    </div>
  );
}
