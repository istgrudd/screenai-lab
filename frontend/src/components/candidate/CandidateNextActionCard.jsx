import { Link } from "react-router-dom";
import { ArrowRight, ClipboardList } from "lucide-react";

import PhaseBadge from "@/components/common/PhaseBadge";
import StatusBadge from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  candidateNextAction,
  cx,
  periodDeadlineContext,
} from "@/lib/candidateUx";

export default function CandidateNextActionCard({
  application,
  documents = [],
  activePeriod,
  announcement,
  actionLabel,
  to,
  onAction,
  disabled = false,
  className,
}) {
  const action = candidateNextAction(application, documents, announcement);
  const phase = periodDeadlineContext(activePeriod);
  const label = actionLabel || action.label;
  const target = to || action.to;

  return (
    <Card className={cx("brand-card", className)}>
      <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ClipboardList className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                status={application?.status}
                label={!application ? "Belum Mulai" : undefined}
                tone={!application ? "brand" : undefined}
              />
              {activePeriod?.current_phase && (
                <PhaseBadge phase={activePeriod.current_phase} />
              )}
            </div>
            <h2 className="mt-3 font-heading text-lg font-bold tracking-normal">
              {action.title}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {action.description}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {phase.deadlineText}
            </p>
          </div>
        </div>

        {target && !onAction ? (
          <Button asChild className="shrink-0 gap-2" disabled={disabled}>
            <Link to={target}>
              {label}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <Button
            type="button"
            className="shrink-0 gap-2"
            disabled={disabled}
            onClick={onAction}
          >
            {label}
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
