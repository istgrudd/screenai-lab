import { Link } from "react-router-dom";
import { ArrowRight, UserRound } from "lucide-react";

import StatusBadge from "@/components/common/StatusBadge";
import AiValidationBadge from "@/components/common/AiValidationBadge";
import CandidateRecommendationBadge from "@/components/recruiter/CandidateRecommendationBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  candidateEvaluationId,
  formatDivision,
  getAiValidationStatus,
  isScoredApplication,
} from "@/lib/recruiterWorkspace";
import { formatIpk } from "@/lib/candidateApplication";
import { makeDetailNavigationState } from "@/lib/navigationContext";
import { cn } from "@/lib/utils";

function scoreColor(score) {
  if (score >= 75) return "text-green-600 dark:text-green-400";
  if (score >= 50) return "text-yellow-600 dark:text-yellow-400";
  if (score >= 25) return "text-orange-600 dark:text-orange-400";
  return "text-red-600 dark:text-red-400";
}

/**
 * Compact candidate row used by the recruiter Evaluation (work queue) and
 * Candidates (ranked review) pages. Lays out as a single dense row on desktop
 * (identity | badges | score+action) and stacks on mobile — the badge column
 * fills the middle so there is no large empty gap before the score.
 *
 * Props:
 *  - application      the recruiter application row
 *  - variant          "evaluation" | "ranking" (ranking shows the rank chip)
 *  - from/fromLabel/returnLabel  navigation context for Open Detail
 *  - showScore        render the composite score (default true)
 *  - showValidation   render the AI validation marker (default true)
 *  - showRecommendation  render the "AI Recommended" hint (default false)
 *  - showAcademicMeta  render NIM/IPK as small secondary metadata (default false)
 */
export default function CandidateResultCard({
  application,
  variant = "ranking",
  from,
  fromLabel,
  returnLabel,
  showScore = true,
  showValidation = true,
  showRecommendation = false,
  showAcademicMeta = false,
}) {
  const candidateId = candidateEvaluationId(application);
  const candidate = application?.candidate || {};
  const name =
    candidate.full_name || application?.evaluation?.anonymous_id || "Candidate";
  const score = application?.evaluation?.composite_score;
  const scored = isScoredApplication(application);
  const validationStatus = getAiValidationStatus(application);
  const rank = application?.rank;
  const isRanking = variant === "ranking";

  const secondary = candidate.email || candidate.nim || null;
  const academicMeta = showAcademicMeta
    ? [
        candidate.nim ? `NIM ${candidate.nim}` : null,
        candidate.ipk != null ? `IPK ${formatIpk(candidate.ipk)}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <Card className="brand-card">
      <CardContent
        className={cn(
          "flex flex-col gap-3 p-3 sm:p-4",
          "lg:grid lg:items-center lg:gap-4",
          "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto]"
        )}
      >
        {/* Identity */}
        <div className="flex min-w-0 items-center gap-3">
          {isRanking && (
            <div className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg bg-surface-container-highest px-2 text-sm font-bold tabular-nums text-muted-foreground">
              {rank != null ? `#${rank}` : "—"}
            </div>
          )}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UserRound className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-semibold text-foreground">{name}</p>
              {showRecommendation && application?.is_recommended && (
                <CandidateRecommendationBadge />
              )}
            </div>
            {secondary && (
              <p className="truncate text-sm text-muted-foreground">{secondary}</p>
            )}
            {academicMeta && (
              <p className="truncate text-xs text-muted-foreground">{academicMeta}</p>
            )}
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={application?.status} />
          {showValidation && validationStatus && (
            <AiValidationBadge status={validationStatus} compact />
          )}
          <span className="text-xs text-muted-foreground">
            {formatDivision(application?.division)}
          </span>
        </div>

        {/* Score + action */}
        <div className="flex items-center justify-between gap-4 lg:justify-end">
          {showScore &&
            (scored ? (
              <p
                className={cn(
                  "font-heading text-xl font-bold tabular-nums",
                  scoreColor(Number(score))
                )}
              >
                {Number(score).toFixed(1)}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  / 100
                </span>
              </p>
            ) : (
              <span className="text-xs text-muted-foreground">Belum dinilai</span>
            ))}
          {candidateId ? (
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link
                to={`/candidates/${candidateId}`}
                state={makeDetailNavigationState(from, fromLabel, returnLabel)}
              >
                Open Detail
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <span
              className="text-xs text-muted-foreground"
              title="Run evaluation to unlock the detail view"
            >
              Belum tersedia
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
