import { useEffect, useMemo, useState } from "react";
import { FileText, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";

import ApplicationFilters from "@/components/recruiter/ApplicationFilters";
import ApplicationsTable from "@/components/recruiter/ApplicationsTable";
import { MetricCard } from "@/components/recruiter/WorkspaceCards";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listRecruiterApplications } from "@/lib/api";
import { summarizeApplications } from "@/lib/recruiterWorkspace";

export default function RecruiterDocumentVerificationPage() {
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
        toast.error(error.message || "Failed to load document queue");
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
  const completeCount = applications.filter(
    (application) => Number(application.doc_completeness_pct || 0) >= 100
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-primary" />
          Document Verification
        </h1>
        <p className="text-muted-foreground mt-1">
          Review the current document completeness view without introducing new backend calls.
        </p>
      </div>

      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Current backend capability
          </CardTitle>
          <CardDescription>
            Full document review, rejection reasons, and correction workflow are scheduled for later backend phases.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            The current frontend can show submitted applications and document completeness from the existing recruiter applications endpoint.
          </p>
          <p>
            Simple supporting-document verification is available from candidate detail after an application has been evaluated. The full pending/verified/rejected document queue should be connected after the document-review backend phase.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          icon={Users}
          label="Applications in view"
          value={loading ? "..." : summary.applicationCount}
        />
        <MetricCard
          icon={FileText}
          label="Complete documents"
          value={loading ? "..." : completeCount}
          tone="green"
        />
        <MetricCard
          icon={ShieldCheck}
          label="Needs document API"
          value="Phase 6"
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
        emptyTitle="No applications to inspect"
        emptyDescription="Submitted applications will appear here with their current document completeness."
      />
    </div>
  );
}
