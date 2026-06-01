import {
  Bell,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  FileWarning,
  Mail,
  Users,
} from "lucide-react";

import MetricCard from "@/components/common/MetricCard";

function countStatus(applications, status) {
  return applications.filter((application) => application.status === status).length;
}

export default function AdminMetricGrid({
  activePeriod,
  activeStats,
  applications = [],
  totalUsers,
  emailSummary,
  loading = false,
  periodLoading = false,
}) {
  const evaluated = applications.filter(
    (application) => application?.evaluation?.composite_score != null
  ).length;
  const pendingReview =
    countStatus(applications, "submitted") +
    countStatus(applications, "document_review");
  const correctionRequested = countStatus(applications, "correction_requested");
  const announced =
    countStatus(applications, "announced_pass") +
    countStatus(applications, "announced_fail");
  const emailTotal = emailSummary?.total;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        icon={Users}
        label="Total users"
        value={loading ? "..." : totalUsers ?? "-"}
        helper="All registered portal accounts."
        loading={loading && totalUsers === null}
      />
      <MetricCard
        icon={ClipboardList}
        label="Applications"
        value={loading ? "..." : applications.length}
        helper={`Submitted this scope: ${activeStats?.total_submitted ?? activePeriod?.application_count ?? "-"}`}
      />
      <MetricCard
        icon={ClipboardCheck}
        label="Evaluated"
        value={loading ? "..." : evaluated}
        helper="Applications with an AI composite score."
        tone="success"
      />
      <MetricCard
        icon={CalendarClock}
        label="Active period"
        value={periodLoading ? "..." : activePeriod ? "Active" : "None"}
        helper={activePeriod?.name || "Create a period before opening recruitment."}
        tone={activePeriod ? "success" : "warning"}
      />
      <MetricCard
        icon={FileWarning}
        label="Pending document review"
        value={loading ? "..." : pendingReview}
        helper="Submitted or document-review applications."
        tone={pendingReview > 0 ? "warning" : "neutral"}
      />
      <MetricCard
        icon={FileWarning}
        label="Correction requested"
        value={loading ? "..." : correctionRequested}
        helper="Candidates waiting on document correction."
        tone={correctionRequested > 0 ? "warning" : "neutral"}
      />
      <MetricCard
        icon={Bell}
        label="Announced results"
        value={loading ? "..." : announced}
        helper="Published pass/fail outcomes."
        tone={announced > 0 ? "info" : "neutral"}
      />
      <MetricCard
        icon={Mail}
        label="Email logs"
        value={emailTotal ?? "-"}
        helper="Shown when email operations data is loaded."
        tone="info"
      />
    </div>
  );
}
