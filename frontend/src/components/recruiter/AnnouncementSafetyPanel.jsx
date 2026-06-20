import { AlertTriangle, CheckCircle2, Megaphone } from "lucide-react";

import PhaseBadge from "@/components/common/PhaseBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function CheckItem({ ready, label, description }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-surface-container-low px-4 py-3">
      <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
        ready ? "bg-success text-success-foreground" : "bg-warning/15 text-warning"
      }`}>
        {ready ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      </div>
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export default function AnnouncementSafetyPanel({
  activePeriod,
  divisionFilter,
  passCount = 0,
  failCount = 0,
  undecidedCount = 0,
  evaluatedCount,
  phaseAllowsPublish,
  isSuperAdmin,
}) {
  const hasDivision = divisionFilter && divisionFilter !== "all";
  const hasPeriod = Boolean(activePeriod);
  const allDecided = evaluatedCount > 0 && undecidedCount === 0;

  return (
    <Card className="brand-card">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">
              Publish Safety
            </p>
            <CardTitle className="mt-1 flex items-center gap-2 font-heading text-xl tracking-normal">
              <Megaphone className="h-5 w-5 text-primary" />
              Pre-publish Checklist
            </CardTitle>
          </div>
          {activePeriod?.current_phase && <PhaseBadge phase={activePeriod.current_phase} size="md" />}
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <CheckItem
          ready={hasPeriod}
          label="Active period available"
          description={hasPeriod ? activePeriod.name : "Publishing requires an active period."}
        />
        <CheckItem
          ready={hasDivision}
          label="One division selected"
          description={hasDivision ? "Bulk publish will process this division only." : "Select one division before publishing."}
        />
        <CheckItem
          ready={evaluatedCount > 0}
          label="Candidates evaluated"
          description={`${evaluatedCount} evaluated candidates in current view.`}
        />
        <CheckItem
          ready={allDecided}
          label="All candidates decided"
          description={
            undecidedCount > 0
              ? `${undecidedCount} candidate(s) still Undecided.`
              : `${passCount} Pass · ${failCount} Fail ready to publish.`
          }
        />
        <CheckItem
          ready={phaseAllowsPublish}
          label="Phase allows publish"
          description={
            phaseAllowsPublish
              ? isSuperAdmin
                ? "Super admin bypass is active if needed."
                : "Announcement phase is active."
              : "Publish is only enabled during announcement phase."
          }
        />
        <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive">
          Publishing results is irreversible. Review pass/fail counts before confirming.
        </div>
      </CardContent>
    </Card>
  );
}
