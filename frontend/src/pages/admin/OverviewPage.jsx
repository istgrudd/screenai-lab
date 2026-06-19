import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarClock,
  ClipboardList,
  FileCheck2,
  Mail,
  Megaphone,
  ShieldCheck,
  Sparkles,
  UserCog,
} from "lucide-react";
import { toast } from "sonner";

import ActionCard from "@/components/common/ActionCard";
import AdminControlHero from "@/components/admin/AdminControlHero";
import AdminMetricGrid from "@/components/admin/AdminMetricGrid";
import PeriodSafetyPanel from "@/components/admin/PeriodSafetyPanel";
import RiskAlertCard from "@/components/admin/RiskAlertCard";
import PageHeader from "@/components/layout/PageHeader";
import {
  getActivePeriod,
  getActivePeriodStats,
  listRecruiterApplications,
  listUsers,
} from "@/lib/api";
import { summarizeApplications } from "@/lib/recruiterWorkspace";

const ADMIN_ACTIONS = [
  {
    title: "Users",
    description: "Manage roles, account status, and assisted password reset.",
    to: "/admin/users",
    actionLabel: "Open Users",
    icon: UserCog,
    tone: "brand",
  },
  {
    title: "Periods",
    description: "Create, update, and close recruitment periods with safety checks.",
    to: "/admin/periods",
    actionLabel: "Manage Periods",
    icon: CalendarClock,
    tone: "warning",
  },
  {
    title: "Audit Logs",
    description: "Review sensitive recruiter and admin actions.",
    to: "/admin/audit-logs",
    actionLabel: "Review Logs",
    icon: ShieldCheck,
    tone: "info",
  },
  {
    title: "Email Operations",
    description: "Monitor provider state and workflow notification logs.",
    to: "/admin/email-templates",
    actionLabel: "Open Emails",
    icon: Mail,
    tone: "info",
  },
];

const SHARED_RECRUITER_ACTIONS = [
  {
    title: "Applications",
    description: "Open shared recruiter application review workspace.",
    to: "/recruiter/applications",
    actionLabel: "Open Applications",
    icon: ClipboardList,
  },
  {
    title: "Document Verification",
    description: "Inspect the shared document verification queue.",
    to: "/recruiter/documents",
    actionLabel: "Open Documents",
    icon: FileCheck2,
  },
  {
    title: "Evaluation",
    description: "Access shared evaluation controls and scored candidates.",
    to: "/recruiter/evaluation",
    actionLabel: "Open Evaluation",
    icon: Sparkles,
  },
  {
    title: "Announcements",
    description: "Review pass/fail publishing controls.",
    to: "/recruiter/announcements",
    actionLabel: "Open Announcements",
    icon: Megaphone,
  },
  {
    title: "Analytics",
    description: "Shared active-period recruitment analytics.",
    to: "/recruiter/analytics",
    actionLabel: "Open Analytics",
    icon: BarChart3,
  },
];

function buildRisks({ activePeriod, activeStats, applications, summary }) {
  const risks = [];
  const pendingDocuments = applications.filter((application) =>
    ["submitted", "document_review", "correction_requested"].includes(
      application.status
    )
  ).length;

  if (!activePeriod) {
    risks.push({
      id: "no-active-period",
      title: "No active period",
      description:
        "The recruitment workflow is not open yet. Create a new period before asking candidates to submit documents.",
      severity: "warning",
      actionLabel: "Create a period",
      to: "/admin/periods",
    });
    return risks;
  }

  if (activePeriod.current_phase === "EVALUATION" && pendingDocuments > 0) {
    risks.push({
      id: "pending-documents-evaluation",
      title: "Evaluation phase active with documents not finalized",
      description: `${pendingDocuments} applications are still in document review/correction. Evaluation may skip candidates that are not ready.`,
      severity: "warning",
      actionLabel: "Review documents",
      to: "/recruiter/documents",
    });
  }

  if (
    activePeriod.current_phase === "ANNOUNCEMENT" &&
    summary.pendingEvaluationCount > 0
  ) {
    risks.push({
      id: "announcement-before-complete-evaluation",
      title: "Announcement opened before all evaluations are complete",
      description: `${summary.pendingEvaluationCount} verified applications have no evaluation score yet. Make sure the publish decision does not skip any candidate.`,
      severity: "destructive",
      actionLabel: "Check evaluation",
      to: "/recruiter/evaluation",
    });
  }

  if (activePeriod.threshold_n == null) {
    risks.push({
      id: "threshold-missing",
      title: "Threshold N is not set",
      description:
        "Ranking is still readable, but the per-division pass cutoff is not expressed as an explicit configuration.",
      severity: "info",
      actionLabel: "Manage period",
      to: "/admin/periods",
    });
  }

  if (activePeriod.current_phase !== "CLOSED") {
    risks.push({
      id: "period-running",
      title: "Active period is running",
      description:
        "Changing the schedule, threshold, or closing the period affects candidate and recruiter workflows. Use the audit trail after major actions.",
      severity: "info",
    });
  }

  if (activeStats === null) {
    risks.push({
      id: "stats-unavailable",
      title: "Active period stats unavailable",
      description:
        "The dashboard still works, but some period figures fall back to the application data available in the frontend.",
      severity: "info",
    });
  }

  return risks;
}

export default function AdminOverviewPage() {
  const [activePeriod, setActivePeriod] = useState(null);
  const [activeStats, setActiveStats] = useState(null);
  const [applications, setApplications] = useState([]);
  const [totalUsers, setTotalUsers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [periodLoading, setPeriodLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setPeriodLoading(true);

      try {
        const period = await getActivePeriod();
        if (!cancelled) setActivePeriod(period);
      } catch {
        if (!cancelled) setActivePeriod(null);
      }

      try {
        const stats = await getActivePeriodStats();
        if (!cancelled) setActiveStats(stats);
      } catch {
        if (!cancelled) setActiveStats(null);
      } finally {
        if (!cancelled) setPeriodLoading(false);
      }

      try {
        const apps = await listRecruiterApplications();
        if (!cancelled) setApplications(apps || []);
      } catch (error) {
        toast.error(error.message || "Failed to load applications");
      }

      try {
        const users = await listUsers({ page: 1, limit: 1 });
        if (!cancelled) setTotalUsers(users.total ?? null);
      } catch {
        if (!cancelled) setTotalUsers(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    Promise.resolve().then(load);
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(
    () => summarizeApplications(applications),
    [applications]
  );
  const risks = useMemo(
    () => buildRisks({ activePeriod, activeStats, applications, summary }),
    [activePeriod, activeStats, applications, summary]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Super Admin"
        title="System Overview"
        description="Monitor active period, operational risk, and high-impact admin workspaces from one control center."
      />

      <AdminControlHero
        activePeriod={activePeriod}
        activeStats={activeStats}
        applications={applications}
        totalUsers={totalUsers}
        loading={loading}
        periodLoading={periodLoading}
      />

      <AdminMetricGrid
        activePeriod={activePeriod}
        activeStats={activeStats}
        applications={applications}
        totalUsers={totalUsers}
        loading={loading}
        periodLoading={periodLoading}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <PeriodSafetyPanel
          activePeriod={activePeriod}
          activeStats={activeStats}
          applications={applications}
          loading={periodLoading}
        />
        <RiskAlertCard risks={risks} />
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-xl font-bold tracking-normal">
            Admin Workspaces
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            High-impact admin areas stay separate from shared recruiter workspaces.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ADMIN_ACTIONS.map((action) => (
            <ActionCard key={action.to} {...action} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-xl font-bold tracking-normal">
            Shared Recruiter Access
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Super admin access to recruiter routes remains available for oversight.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {SHARED_RECRUITER_ACTIONS.map((action) => (
            <ActionCard key={action.to} {...action} tone="info" />
          ))}
        </div>
      </section>
    </div>
  );
}
