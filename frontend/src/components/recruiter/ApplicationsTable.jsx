import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ExternalLink,
  Inbox,
  Loader2,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
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
  candidateEvaluationId,
  formatDivision,
  formatStatus,
  isEvaluatedApplication,
} from "@/lib/recruiterWorkspace";

export function ScoreBadge({ score }) {
  if (score == null) {
    return <span className="text-muted-foreground text-xs">-</span>;
  }

  const value = Number(score);
  let color = "bg-red-500/15 text-red-700 dark:text-red-400";
  if (value >= 75) color = "bg-green-500/15 text-green-700 dark:text-green-400";
  else if (value >= 50) color = "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400";
  else if (value >= 25) color = "bg-orange-500/15 text-orange-700 dark:text-orange-400";

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums ${color}`}
    >
      {value.toFixed(1)}
    </span>
  );
}

export function StatusBadge({ status }) {
  const variant =
    status === "announced_pass"
      ? "default"
      : status === "announced_fail"
      ? "destructive"
      : status === "correction_requested"
      ? "destructive"
      : status === "verified"
      ? "secondary"
      : status === "screening"
      ? "secondary"
      : "outline";

  return (
    <Badge variant={variant} className="uppercase text-[10px]">
      {formatStatus(status)}
    </Badge>
  );
}

export function DivisionBadge({ division }) {
  return (
    <Badge variant="secondary" className="capitalize text-xs">
      {formatDivision(division)}
    </Badge>
  );
}

function CompletenessCell({ pct }) {
  const safe = pct == null ? 0 : pct;
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <Progress value={safe} className="flex-1 h-2" />
      <span className="text-xs font-medium tabular-nums w-10 text-right">
        {safe}%
      </span>
    </div>
  );
}

function EmptyState({ title, description }) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-16 text-center">
        <Inbox className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
        <p className="text-sm font-medium mb-1">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

export default function ApplicationsTable({
  applications,
  loading,
  selectable = false,
  checked = {},
  onToggleChecked,
  emptyTitle = "No submitted applications",
  emptyDescription = "Once candidates finish uploading and submit, they will show up here.",
  lockUnevaluatedSelection = true,
}) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <Card>
        <CardContent className="py-16 flex items-center justify-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading applications...</span>
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
        <Table>
          <TableHeader>
            <TableRow>
              {selectable && <TableHead className="w-10" />}
              <TableHead>Candidate</TableHead>
              <TableHead>NIM</TableHead>
              <TableHead>Division</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="min-w-[160px]">Docs</TableHead>
              <TableHead className="text-right">Composite Score</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {applications.map((application) => {
              const candidateId = candidateEvaluationId(application);
              const canOpen = Boolean(candidateId);
              const evaluated = isEvaluatedApplication(application);
              const recommended = application.is_recommended === true;
              const isChecked = Boolean(checked[application.id]);
              const rowHighlight = recommended
                ? "bg-green-50/60 dark:bg-green-900/10 border-l-4 border-l-green-500"
                : "";

              const checkboxNode =
                !selectable ? null : evaluated || !lockUnevaluatedSelection ? (
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={(value) =>
                      onToggleChecked?.(application.id, value)
                    }
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Select ${application.candidate?.full_name || "candidate"}`}
                  />
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="inline-flex"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Checkbox checked={false} disabled />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Run evaluation first</TooltipContent>
                  </Tooltip>
                );

              return (
                <TableRow
                  key={application.id}
                  className={`transition-colors ${rowHighlight} ${
                    canOpen ? "cursor-pointer hover:bg-muted/50" : "opacity-90"
                  }`}
                  onClick={() => canOpen && navigate(`/candidates/${candidateId}`)}
                >
                  {selectable && (
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      {checkboxNode}
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {application.candidate?.full_name || "-"}
                        </span>
                        {recommended && (
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400"
                          >
                            <Sparkles className="w-3 h-3 mr-1" />
                            Recommended
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {application.candidate?.email || ""}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {application.candidate?.nim || "-"}
                  </TableCell>
                  <TableCell>
                    <DivisionBadge division={application.division} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={application.status} />
                  </TableCell>
                  <TableCell>
                    <CompletenessCell pct={application.doc_completeness_pct} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1.5 justify-end">
                      {application.rank != null && (
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          #{application.rank}
                        </span>
                      )}
                      <ScoreBadge score={application.evaluation?.composite_score} />
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {application.submitted_at
                      ? new Date(application.submitted_at).toLocaleDateString()
                      : "-"}
                  </TableCell>
                  <TableCell>
                    {canOpen ? (
                      <ExternalLink className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex">
                            <AlertCircle className="w-4 h-4 text-muted-foreground/60" />
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
      </CardContent>
    </Card>
  );
}
