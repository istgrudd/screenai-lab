import { useNavigate } from "react-router-dom";
import { AlertCircle, ExternalLink, Inbox, Loader2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import StatusBadge from "@/components/common/StatusBadge";
import AiValidationBadge from "@/components/common/AiValidationBadge";
import CandidateRecommendationBadge from "@/components/recruiter/CandidateRecommendationBadge";
import CandidateDecisionControl from "@/components/recruiter/CandidateDecisionControl";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ANNOUNCE_DECISIONS,
  candidateEvaluationId,
  formatDivision,
  getAiValidationStatus,
  isReadyToAnnounce,
} from "@/lib/recruiterWorkspace";
import { makeDetailNavigationState } from "@/lib/navigationContext";

function ScoreCell({ score, rank }) {
  if (score == null) {
    return <span className="text-xs text-muted-foreground">-</span>;
  }
  const value = Number(score);
  let color = "text-red-600 dark:text-red-400";
  if (value >= 75) color = "text-green-600 dark:text-green-400";
  else if (value >= 50) color = "text-yellow-600 dark:text-yellow-400";
  else if (value >= 25) color = "text-orange-600 dark:text-orange-400";

  return (
    <div className="flex items-baseline justify-end gap-1.5">
      {rank != null && (
        <span className="text-[10px] tabular-nums text-muted-foreground">
          #{rank}
        </span>
      )}
      <span className={`text-sm font-bold tabular-nums ${color}`}>
        {value.toFixed(1)}
      </span>
    </div>
  );
}

function EmptyState({ title, description }) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-16 text-center">
        <Inbox className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
        <p className="mb-1 text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

/**
 * Compact, decision-focused table for the Announcements page.
 *
 * Two modes:
 *  - Decision mode (default): rows are ready-to-announce (`screening`) and the
 *    Decision column shows an explicit Lolos / Tidak Lolos / Belum Diputuskan
 *    control. AI-recommended rows get a soft green highlight + small badge
 *    (decision support only — no separate recommendation column).
 *  - Published mode (`readOnly`): already-announced rows render their result
 *    status (`announced_fail` shows "Tidak Lolos") and are not editable; they
 *    never enter the publish payload.
 */
export default function CandidateCompactTable({
  applications,
  loading,
  decisions = {},
  onDecisionChange,
  readOnly = false,
  emptyTitle = "No evaluated applications",
  emptyDescription = "Run evaluation before publishing pass/fail announcements.",
  detailFrom,
  detailFromLabel,
  detailReturnLabel,
}) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-3 py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Loading applications...
          </span>
        </CardContent>
      </Card>
    );
  }

  if (!applications.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Division</TableHead>
                <TableHead className="text-right">Score / Rank</TableHead>
                <TableHead>Validasi AI</TableHead>
                <TableHead>{readOnly ? "Result" : "Decision"}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.map((application) => {
                const candidateId = candidateEvaluationId(application);
                const canOpen = Boolean(candidateId);
                const ready = isReadyToAnnounce(application);
                const validationStatus = getAiValidationStatus(application);
                // Recommendation visuals are decision support — only shown in
                // the editable (ready-to-announce) view, never on published rows.
                const recommended = !readOnly && application.is_recommended === true;
                const decision =
                  decisions[application.id] || ANNOUNCE_DECISIONS.UNDECIDED;

                return (
                  <TableRow
                    key={application.id}
                    className={`transition-colors ${
                      recommended
                        ? "bg-green-50/60 hover:bg-green-50 dark:bg-green-900/10 dark:hover:bg-green-900/20"
                        : "hover:bg-muted/50"
                    } ${canOpen ? "cursor-pointer" : "opacity-90"}`}
                    onClick={() =>
                      canOpen &&
                      navigate(`/candidates/${candidateId}`, {
                        state: makeDetailNavigationState(
                          detailFrom,
                          detailFromLabel,
                          detailReturnLabel
                        ),
                      })
                    }
                  >
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">
                            {application.candidate?.full_name || "-"}
                          </span>
                          {recommended && <CandidateRecommendationBadge />}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {application.candidate?.email ||
                            application.candidate?.nim ||
                            ""}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDivision(application.division)}
                    </TableCell>
                    <TableCell className="text-right">
                      <ScoreCell
                        score={application.evaluation?.composite_score}
                        rank={application.rank}
                      />
                    </TableCell>
                    <TableCell>
                      <AiValidationBadge status={validationStatus} compact />
                    </TableCell>
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      {readOnly ? (
                        <StatusBadge status={application.status} />
                      ) : ready ? (
                        <CandidateDecisionControl
                          value={decision}
                          onChange={(next) =>
                            onDecisionChange?.(application.id, next)
                          }
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Belum dievaluasi
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {canOpen ? (
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex">
                              <AlertCircle className="h-4 w-4 text-muted-foreground/60" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Run evaluation to unlock detail view
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
