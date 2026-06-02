import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Search,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import MetricCard from "@/components/common/MetricCard";
import PageHeader from "@/components/layout/PageHeader";
import ApplicationFilters from "@/components/recruiter/ApplicationFilters";
import ApplicationAdminTable from "@/components/recruiter/ApplicationAdminTable";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { listRecruiterApplications } from "@/lib/api";

const QUICK_FILTERS = [
  { id: "all", label: "All" },
  { id: "submitted", label: "Submitted" },
  { id: "document_review", label: "Document Review" },
  { id: "correction_requested", label: "Correction Requested" },
  { id: "verified", label: "Verified" },
  { id: "screening", label: "Evaluated" },
];

function matchesSearch(application, query) {
  if (!query.trim()) return true;
  const needle = query.trim().toLowerCase();
  const candidate = application.candidate || {};
  return [candidate.full_name, candidate.email, candidate.nim]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle));
}

export default function RecruiterApplicationsPage() {
  const [applications, setApplications] = useState([]);
  const [divisionFilter, setDivisionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [quickFilter, setQuickFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const effectiveStatus =
          quickFilter !== "all"
            ? quickFilter
            : statusFilter !== "all"
            ? statusFilter
            : undefined;
        const apps = await listRecruiterApplications({
          division: divisionFilter !== "all" ? divisionFilter : undefined,
          status: effectiveStatus,
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
  }, [divisionFilter, statusFilter, quickFilter]);

  const filteredApplications = useMemo(
    () => applications.filter((application) => matchesSearch(application, search)),
    [applications, search]
  );
  const adminSummary = useMemo(() => {
    let inReview = 0;
    let correction = 0;
    let verified = 0;
    for (const application of filteredApplications) {
      if (
        application.status === "submitted" ||
        application.status === "document_review"
      ) {
        inReview += 1;
      } else if (application.status === "correction_requested") {
        correction += 1;
      } else if (application.status === "verified") {
        verified += 1;
      }
    }
    return {
      total: filteredApplications.length,
      inReview,
      correction,
      verified,
    };
  }, [filteredApplications]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Recruiter / Applications"
        title="Applications"
        description="Track submitted applications, document readiness, and administrative status."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Users}
          label="Applications in view"
          value={loading ? "..." : adminSummary.total}
        />
        <MetricCard
          icon={FileText}
          label="In document review"
          value={loading ? "..." : adminSummary.inReview}
          tone="info"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Needs correction"
          value={loading ? "..." : adminSummary.correction}
          tone="warning"
        />
        <MetricCard
          icon={CheckCircle2}
          label="Verified"
          value={loading ? "..." : adminSummary.verified}
          tone="success"
        />
      </div>

      <div className="brand-card rounded-xl p-4">
        <div className="flex flex-col gap-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, email, or NIM"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_FILTERS.map((filter) => (
              <Button
                key={filter.id}
                type="button"
                size="sm"
                variant={quickFilter === filter.id ? "default" : "outline"}
                onClick={() => setQuickFilter(filter.id)}
              >
                {filter.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <ApplicationFilters
        divisionFilter={divisionFilter}
        statusFilter={statusFilter}
        onDivisionChange={setDivisionFilter}
        onStatusChange={setStatusFilter}
      />

      <ApplicationAdminTable
        applications={filteredApplications}
        loading={loading}
        emptyTitle="No applications match this view"
        emptyDescription="Adjust search, quick filters, division, or status to broaden the list."
        detailFrom="/recruiter/applications"
        detailFromLabel="Applications"
        detailReturnLabel="Kembali ke Applications"
      />
    </div>
  );
}
