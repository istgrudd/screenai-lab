import { useNavigate } from "react-router-dom";
import { AlertCircle, ExternalLink, Inbox, Loader2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import StatusBadge from "@/components/common/StatusBadge";
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
import { candidateEvaluationId, formatDivision } from "@/lib/recruiterWorkspace";
import { makeDetailNavigationState } from "@/lib/navigationContext";

const REQUIRED_DOC_COUNT = 6;

function DocumentsCell({ application }) {
  const pct = application.doc_completeness_pct ?? 0;
  const count = application.documents_count ?? Math.round((pct / 100) * REQUIRED_DOC_COUNT);
  const complete = pct >= 100;

  if (application.status === "correction_requested") {
    return (
      <span className="text-xs font-medium text-warning">Needs correction</span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Progress value={pct} className="h-1.5 w-16" />
      <span
        className={`text-xs tabular-nums ${
          complete ? "font-medium text-success" : "text-muted-foreground"
        }`}
      >
        {complete ? "Complete" : `${count}/${REQUIRED_DOC_COUNT}`}
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
 * Administrative applications table. Focuses on registration tracking and
 * document readiness — no composite score, AI validation, AI recommendation,
 * rank, or IPK columns (those live on the evaluation/candidates/announcements
 * views and the candidate detail page).
 */
export default function ApplicationAdminTable({
  applications,
  loading,
  emptyTitle = "No applications match this view",
  emptyDescription = "Adjust search, filters, division, or status to broaden the list.",
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
                <TableHead>Status</TableHead>
                <TableHead>Documents</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.map((application) => {
                const candidateId = candidateEvaluationId(application);
                const canOpen = Boolean(candidateId);
                const candidate = application.candidate || {};

                return (
                  <TableRow
                    key={application.id}
                    className={`transition-colors ${
                      canOpen ? "cursor-pointer hover:bg-muted/50" : "hover:bg-muted/50"
                    }`}
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
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">
                          {candidate.full_name || "-"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {candidate.email || ""}
                          {candidate.nim ? (
                            <span className="ml-2 font-mono">{candidate.nim}</span>
                          ) : null}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDivision(application.division)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={application.status} />
                    </TableCell>
                    <TableCell>
                      <DocumentsCell application={application} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {application.submitted_at
                        ? new Date(application.submitted_at).toLocaleDateString()
                        : "-"}
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
                            Detail unlocks after evaluation
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
