import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Bell,
  ClipboardList,
  FileText,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import ActionCard from "@/components/common/ActionCard";
import MetricCard from "@/components/common/MetricCard";
import LoadingState from "@/components/common/LoadingState";
import PageHeader from "@/components/layout/PageHeader";
import DivisionBreakdownCard from "@/components/recruiter/DivisionBreakdownCard";
import RecruiterCommandHero from "@/components/recruiter/RecruiterCommandHero";
import WorkQueueCard from "@/components/recruiter/WorkQueueCard";
import { getActivePeriod, listRecruiterApplications } from "@/lib/api";
import { summarizeApplications } from "@/lib/recruiterWorkspace";

const SHORTCUTS = [
  {
    title: "Applications",
    description: "Review submitted applications and open evaluated candidate detail.",
    to: "/recruiter/applications",
    icon: ClipboardList,
  },
  {
    title: "Document Verification",
    description: "Verify or reject required documents before evaluation.",
    to: "/recruiter/documents",
    icon: ShieldCheck,
    tone: "warning",
  },
  {
    title: "Evaluation",
    description: "Run AI evaluation per division with safety controls.",
    to: "/recruiter/evaluation",
    icon: Sparkles,
  },
  {
    title: "Candidates",
    description: "Inspect ranked scores, evidence, and recommendations.",
    to: "/recruiter/candidates",
    icon: Users,
    tone: "success",
  },
  {
    title: "Announcements",
    description: "Prepare pass/fail selections and publish results safely.",
    to: "/recruiter/announcements",
    icon: Bell,
    tone: "warning",
  },
  {
    title: "Rubrics",
    description: "Maintain scoring rubrics used by evaluation.",
    to: "/rubrics",
    icon: FileText,
    tone: "neutral",
  },
];

export default function RecruiterOverviewPage() {
  const [applications, setApplications] = useState([]);
  const [activePeriod, setActivePeriod] = useState(null);
  const [loading, setLoading] = useState(true);
  const [periodLoading, setPeriodLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setPeriodLoading(true);
      try {
        const apps = await listRecruiterApplications();
        if (!cancelled) setApplications(apps || []);
      } catch (error) {
        toast.error(error.message || "Failed to load applications");
      } finally {
        if (!cancelled) setLoading(false);
      }

      try {
        const period = await getActivePeriod();
        if (!cancelled) setActivePeriod(period);
      } catch {
        if (!cancelled) setActivePeriod(null);
      } finally {
        if (!cancelled) setPeriodLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(
    () => summarizeApplications(applications),
    [applications]
  );
  const correctionCount = applications.filter(
    (application) => application.status === "correction_requested"
  ).length;
  const pendingDocs = applications.filter((application) =>
    ["submitted", "document_review"].includes(application.status)
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Recruiter Workspace"
        title="Recruiter Dashboard"
        description="Operational work queue for application review, document verification, evaluation, ranking, and announcements."
      />

      <RecruiterCommandHero
        activePeriod={activePeriod}
        loading={periodLoading}
        applications={applications}
        summary={summary}
      />

      {loading ? (
        <LoadingState variant="metrics" rows={4} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={Users}
            label="Applications"
            value={summary.applicationCount}
            helper="Total applications in the recruiter workspace."
          />
          <MetricCard
            icon={ShieldCheck}
            label="Pending document review"
            value={pendingDocs}
            tone="warning"
            helper="Submitted or document-review applications."
          />
          <MetricCard
            icon={Sparkles}
            label="Pending evaluation"
            value={summary.pendingEvaluationCount}
            tone="info"
            helper="Verified candidates waiting for evaluation."
          />
          <MetricCard
            icon={Trophy}
            label="Top score"
            value={summary.topScore != null ? summary.topScore.toFixed(1) : "-"}
            tone="success"
            helper={`${correctionCount} candidates are in correction.`}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <WorkQueueCard applications={applications} />
        <DivisionBreakdownCard applications={applications} />
      </div>

      <section className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">
            Secondary Workspaces
          </p>
          <h2 className="mt-1 font-heading text-xl font-bold tracking-normal">
            Focused recruiter tools
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {SHORTCUTS.map((shortcut) => (
            <ActionCard key={shortcut.to} {...shortcut} actionLabel="Open" />
          ))}
          <ActionCard
            icon={BarChart3}
            title="Analytics"
            description="Monitor active-period recruitment metrics and score distribution."
            to="/recruiter/analytics"
            actionLabel="Open"
            tone="info"
          />
        </div>
      </section>
    </div>
  );
}
