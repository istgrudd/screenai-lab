import { BarChart3 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { WORKFLOW_DIVISIONS } from "@/lib/recruiterWorkspace";

export default function DivisionBreakdownCard({ applications = [], className }) {
  const maxCount = Math.max(
    1,
    ...WORKFLOW_DIVISIONS.map(
      (division) => applications.filter((app) => app.division === division.id).length
    )
  );

  return (
    <Card className={`brand-card ${className || ""}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-heading text-xl tracking-normal">
          <BarChart3 className="h-5 w-5 text-primary" />
          Division Breakdown
        </CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">
          Application volume, evaluated count, and recommendations per division.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {WORKFLOW_DIVISIONS.map((division) => {
          const divisionApps = applications.filter((app) => app.division === division.id);
          const evaluated = divisionApps.filter((app) => app.evaluation?.composite_score != null).length;
          const recommended = divisionApps.filter((app) => app.is_recommended === true).length;
          const pct = Math.round((divisionApps.length / maxCount) * 100);

          return (
            <div key={division.id} className="rounded-xl bg-surface-container-low px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">{division.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {evaluated} evaluated - {recommended} recommended
                  </p>
                </div>
                <span className="font-heading text-xl font-bold tabular-nums">
                  {divisionApps.length}
                </span>
              </div>
              <Progress value={pct} className="mt-3 h-2" />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
