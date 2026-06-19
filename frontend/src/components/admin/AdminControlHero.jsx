import { Link } from "react-router-dom";
import { ArrowRight, CalendarClock, ClipboardList, ShieldCheck, Users } from "lucide-react";

import PhaseBadge from "@/components/common/PhaseBadge";
import { Button } from "@/components/ui/button";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "-";
  return Number(value || 0).toLocaleString();
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function AdminControlHero({
  activePeriod,
  activeStats,
  applications = [],
  totalUsers,
  loading = false,
  periodLoading = false,
  primaryAction,
  className,
}) {
  const hasActivePeriod = Boolean(activePeriod);
  const submittedTotal =
    activeStats?.total_submitted ??
    activePeriod?.application_count ??
    applications?.length ??
    0;
  const action = primaryAction || {
    label: hasActivePeriod ? "Manage Periods" : "Create Recruitment Period",
    to: "/admin/periods",
  };

  return (
    <section
      className={cx(
        "brand-card overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#1E3F75_0%,#0065B0_100%)] text-primary-foreground navy-shadow",
        className
      )}
    >
      <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:p-7">
        <div className="space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-white/90">
            <ShieldCheck className="h-3.5 w-3.5" />
            Admin Control Center
          </div>

          <div className="max-w-3xl">
            <h2 className="font-heading text-3xl font-bold tracking-normal text-white md:text-4xl">
              {periodLoading
                ? "Loading system status..."
                : hasActivePeriod
                ? activePeriod.name
                : "No active period"}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/78">
              {hasActivePeriod
                ? "Review the recruitment phase, pass threshold, and operational queue before taking administrative action."
                : "Create a new recruitment period to open the application, evaluation, and announcement workflow in a controlled way."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {hasActivePeriod ? (
              <PhaseBadge phase={activePeriod.current_phase} size="md" />
            ) : (
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-sm font-medium text-white">
                No active period
              </span>
            )}
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-sm text-white/90">
              Threshold N:{" "}
              <strong className="text-white">
                {activePeriod?.threshold_n ?? "Not set"}
              </strong>
            </span>
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-sm text-white/90">
              Total submitted:{" "}
              <strong className="text-white">
                {loading || periodLoading ? "..." : formatNumber(submittedTotal)}
              </strong>
            </span>
          </div>

          <div>
            {action?.to ? (
              <Button asChild className="gap-2 bg-white text-primary-deep hover:bg-white/90">
                <Link to={action.to}>
                  {action.label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <Button
                type="button"
                className="gap-2 bg-white text-primary-deep hover:bg-white/90"
                onClick={action?.onAction}
                disabled={action?.disabled}
              >
                {action?.label || "Manage Periods"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-3 rounded-2xl bg-white/12 p-4 text-sm text-white/88 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2">
              <Users className="h-4 w-4" />
              Total users
            </span>
            <strong className="font-heading text-xl text-white">
              {loading ? "..." : formatNumber(totalUsers)}
            </strong>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Applications
            </span>
            <strong className="font-heading text-xl text-white">
              {loading ? "..." : formatNumber(applications?.length)}
            </strong>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2">
              <CalendarClock className="h-4 w-4" />
              Started
            </span>
            <strong className="text-right text-white">
              {hasActivePeriod ? formatDate(activePeriod.start_date) : "-"}
            </strong>
          </div>
          <div className="rounded-xl bg-white/10 px-3 py-2 text-xs leading-5 text-white/76">
            Use this panel as a first check before changing users, periods,
            audit, or email operations.
          </div>
        </div>
      </div>
    </section>
  );
}
