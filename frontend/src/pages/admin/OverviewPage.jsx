import { useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarClock, ClipboardList, Settings, ShieldCheck, UserCog, Users } from "lucide-react";
import { toast } from "sonner";

import RecruitmentPhaseCard from "@/components/RecruitmentPhaseCard";
import { MetricCard, ShortcutCard } from "@/components/recruiter/WorkspaceCards";
import {
  getActivePeriod,
  getActivePeriodStats,
  listRecruiterApplications,
  listUsers,
} from "@/lib/api";
import { summarizeApplications } from "@/lib/recruiterWorkspace";

const ADMIN_SHORTCUTS = [
  {
    title: "Users",
    description: "Manage roles, account status, and assisted password reset.",
    to: "/admin/users",
    icon: UserCog,
  },
  {
    title: "Periods",
    description: "Create, update, and close recruitment periods.",
    to: "/admin/periods",
    icon: CalendarClock,
  },
  {
    title: "Recruiter Applications",
    description: "Open the shared recruiter application workspace.",
    to: "/recruiter/applications",
    icon: ClipboardList,
  },
  {
    title: "Audit Logs",
    description: "Review recruiter and admin audit entries.",
    to: "/admin/audit-logs",
    icon: ShieldCheck,
  },
  {
    title: "Analytics",
    description: "Shared active-period recruitment analytics.",
    to: "/recruiter/analytics",
    icon: BarChart3,
  },
  {
    title: "Settings",
    description: "System settings placeholder for later backend support.",
    to: "/admin/settings",
    icon: Settings,
  },
];

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
          Admin Dashboard
        </h1>
        <p className="text-muted-foreground mt-1">
          System overview, recruitment period context, and admin shortcuts.
        </p>
      </div>

      <RecruitmentPhaseCard
        role="super_admin"
        period={activePeriod}
        stats={activeStats}
        loading={periodLoading}
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          icon={Users}
          label="Total users"
          value={loading ? "..." : totalUsers ?? "-"}
        />
        <MetricCard
          icon={ClipboardList}
          label="Applications"
          value={loading ? "..." : summary.applicationCount}
        />
        <MetricCard
          icon={BarChart3}
          label="Evaluated"
          value={loading ? "..." : summary.scoredCount}
          tone="green"
        />
        <MetricCard
          icon={CalendarClock}
          label="Active period"
          value={activePeriod ? "Active" : "None"}
          tone={activePeriod ? "green" : "yellow"}
        />
      </div>

      <div>
        <h2 className="text-lg font-semibold tracking-tight mb-3">
          Admin Workspaces
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {ADMIN_SHORTCUTS.map((shortcut) => (
            <ShortcutCard key={shortcut.to} {...shortcut} />
          ))}
        </div>
      </div>
    </div>
  );
}
