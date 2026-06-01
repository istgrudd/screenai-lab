import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, Trophy, UserRound } from "lucide-react";

import StatusBadge from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { candidateEvaluationId, formatDivision } from "@/lib/recruiterWorkspace";
import { makeDetailNavigationState } from "@/lib/navigationContext";

export default function CandidateReviewCard({ application, from, fromLabel, returnLabel }) {
  const candidateId = candidateEvaluationId(application);
  const score = application?.evaluation?.composite_score;

  return (
    <Card className="brand-card">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UserRound className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-foreground">
                {application?.candidate?.full_name || "Candidate"}
              </p>
              {application?.is_recommended && (
                <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-success">
                  <Sparkles className="h-3 w-3" />
                  Recommended
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {application?.candidate?.nim || "-"} - {formatDivision(application?.division)}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={application?.status} />
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-container-highest px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                <Trophy className="h-3 w-3" />
                {score != null ? Number(score).toFixed(1) : "-"}
              </span>
            </div>
          </div>
        </div>
        {candidateId && (
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link
              to={`/candidates/${candidateId}`}
              state={makeDetailNavigationState(from, fromLabel, returnLabel)}
            >
              Open Detail
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
