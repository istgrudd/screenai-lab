import { useEffect, useState } from "react";
import { CalendarDays, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { getActivePeriod } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { PHASE_LABEL } from "@/lib/phase";

const ROLE_LABEL = {
  super_admin: "Super Admin",
  recruiter: "Recruiter",
  candidate: "Candidate",
};

function formatPhase(phase) {
  return PHASE_LABEL[phase] || phase || "Unknown phase";
}

export default function GlassTopbar() {
  const user = getCurrentUser();
  const userId = user?.id;
  const [period, setPeriod] = useState({ status: "loading", data: null });

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    Promise.resolve().then(async () => {
      try {
        const activePeriod = await getActivePeriod();
        if (!cancelled) {
          setPeriod({ status: "ready", data: activePeriod });
        }
      } catch {
        if (!cancelled) {
          setPeriod({ status: "empty", data: null });
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const roleLabel = ROLE_LABEL[user?.role] || user?.role || "Unknown role";
  const periodLabel =
    period.status === "ready" && period.data
      ? period.data.name
      : period.status === "loading"
        ? "Memuat periode"
        : "Tidak ada periode aktif";
  const phaseLabel =
    period.status === "ready" && period.data
      ? formatPhase(period.data.current_phase)
      : null;

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/75 px-4 py-3 backdrop-blur-xl lg:px-8">
      <div className="glass-surface mx-auto flex max-w-7xl flex-col gap-3 rounded-2xl border border-white/70 px-4 py-3 shadow-[0px_8px_24px_rgba(30,63,117,0.08)] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CalendarDays className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {periodLabel}
            </p>
            {phaseLabel && (
              <p className="text-xs font-medium text-muted-foreground">
                Fase saat ini: {phaseLabel}
              </p>
            )}
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
            <UserRound className="h-4 w-4" />
          </div>
          <div className="min-w-0 text-right sm:max-w-[18rem]">
            <div className="flex justify-end">
              <Badge variant="outline" className="text-[10px] uppercase tracking-[0.08em]">
                {roleLabel}
              </Badge>
            </div>
            {user?.email && (
              <p className="mt-1 truncate text-xs font-medium text-muted-foreground" title={user.email}>
                {user.email}
              </p>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
