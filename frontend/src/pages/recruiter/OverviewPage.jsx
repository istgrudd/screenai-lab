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

import RecruitmentPhaseCard from "@/components/RecruitmentPhaseCard";
import { MetricCard, ShortcutCard } from "@/components/recruiter/WorkspaceCards";
import { Card, CardContent } from "@/components/ui/card";
import { getActivePeriod, listRecruiterApplications } from "@/lib/api";
import { summarizeApplications } from "@/lib/recruiterWorkspace";

const SHORTCUTS = [
  {
    title: "Applications",
    description: "Review submitted applications and document completeness.",
    to: "/recruiter/applications",
    icon: ClipboardList,
  },
  {
    title: "Evaluation",
    description: "Run or re-run AI evaluation per division.",
    to: "/recruiter/evaluation",
    icon: Sparkles,
  },
  {
    title: "Candidates",
    description: "Open ranked and scored candidate review.",
    to: "/recruiter/candidates",
    icon: Users,
  },
  {
    title: "Announcements",
    description: "Select pass candidates and publish results.",
    to: "/recruiter/announcements",
    icon: Bell,
  },
  {
    title: "Analytics",
    description: "Prepare for recruitment metrics once the API is available.",
    to: "/recruiter/analytics",
    icon: BarChart3,
  },
  {
    title: "Documents",
    description: "Inspect current document verification support.",
    to: "/recruiter/documents",
    icon: ShieldCheck,
  },
  {
    title: "Rubrics",
    description: "Maintain scoring rubrics used by evaluation.",
    to: "/rubrics",
    icon: FileText,
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Recruiter Dashboard
        </h1>
        <p className="text-muted-foreground mt-1">
          High-level recruitment overview and shortcuts to focused workspaces.
        </p>
      </div>

      <RecruitmentPhaseCard
        role="recruiter"
        period={activePeriod}
        loading={periodLoading}
        submittedCount={applications.length}
      />

      {activePeriod?.evaluation_prompt && (
        <Card className="border-yellow-500/40 bg-yellow-500/10">
          <CardContent className="py-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-md bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 flex items-center justify-center shrink-0">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                Registration has ended.
              </p>
              <p className="text-xs text-yellow-700/80 dark:text-yellow-200/80 mt-0.5">
                Open the Evaluation workspace to process candidates per division.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          icon={Users}
          label={loading ? "Applications" : "Applications"}
          value={loading ? "..." : summary.applicationCount}
        />
        <MetricCard
          icon={BarChart3}
          label="Evaluated"
          value={loading ? "..." : summary.scoredCount}
          tone="green"
        />
        <MetricCard
          icon={Sparkles}
          label="Pending Evaluation"
          value={loading ? "..." : summary.pendingEvaluationCount}
          tone="yellow"
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

      <div>
        <h2 className="text-lg font-semibold tracking-tight mb-3">
          Workspaces
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {SHORTCUTS.map((shortcut) => (
            <ShortcutCard key={shortcut.to} {...shortcut} />
          ))}
        </div>
      </div>
    </div>
  );
}
