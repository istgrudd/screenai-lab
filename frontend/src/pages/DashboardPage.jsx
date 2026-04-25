import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertCircle,
  BarChart3,
  ExternalLink,
  Filter,
  Inbox,
  Loader2,
  Play,
  Trophy,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Progress } from "@/components/ui/progress";
import {
  listRecruiterApplications,
  evaluateBatch,
} from "@/lib/api";

const DIVISIONS = [
  { id: "all", label: "All divisions" },
  { id: "big_data", label: "Big Data" },
  { id: "cyber_security", label: "Cyber Security" },
  { id: "game_tech", label: "Game Technology" },
  { id: "gis", label: "GIS" },
];

const STATUSES = [
  { id: "all", label: "All statuses (non-draft)" },
  { id: "submitted", label: "Submitted" },
  { id: "screening", label: "Screening" },
  { id: "announced_pass", label: "Passed" },
  { id: "announced_fail", label: "Not passed" },
];

function ScoreBadge({ score }) {
  if (score == null) return <span className="text-muted-foreground text-xs">—</span>;
  const val = Number(score);
  let color = "bg-red-500/15 text-red-700 dark:text-red-400";
  if (val >= 75) color = "bg-green-500/15 text-green-700 dark:text-green-400";
  else if (val >= 50) color = "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400";
  else if (val >= 25) color = "bg-orange-500/15 text-orange-700 dark:text-orange-400";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums ${color}`}
    >
      {val.toFixed(1)}
    </span>
  );
}

function StatusBadge({ status }) {
  const variant =
    status === "announced_pass"
      ? "default"
      : status === "announced_fail"
      ? "destructive"
      : status === "screening"
      ? "secondary"
      : "outline";
  return (
    <Badge variant={variant} className="uppercase text-[10px]">
      {status.replace("_", " ")}
    </Badge>
  );
}

function DivisionBadge({ division }) {
  return (
    <Badge variant="secondary" className="capitalize text-xs">
      {division?.replace("_", " ") || "—"}
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

export default function DashboardPage() {
  const navigate = useNavigate();
  const [applications, setApplications] = useState([]);
  const [selectedDivision, setSelectedDivision] = useState("big_data");
  const [divisionFilter, setDivisionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const apps = await listRecruiterApplications({
        division: divisionFilter !== "all" ? divisionFilter : undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
      });
      setApplications(apps);
    } catch (err) {
      toast.error(`Failed to load data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisionFilter, statusFilter]);

  const handleEvaluate = async () => {
    if (!selectedDivision) {
      toast.error("Please select a division first.");
      return;
    }
    setEvaluating(true);
    try {
      const result = await evaluateBatch(selectedDivision);
      toast.success(
        `Evaluation complete: ${result.results.length} candidate(s) scored.`
      );
      if (result.errors.length > 0) {
        toast.warning(`${result.errors.length} application(s) had errors.`);
      }
      fetchData();
    } catch (err) {
      toast.error(`Evaluation failed: ${err.message}`);
    } finally {
      setEvaluating(false);
    }
  };

  const submittedCount = applications.length;
  const scoredCount = applications.filter(
    (a) => a.evaluation?.composite_score != null
  ).length;
  const topScore = applications
    .map((a) => a.evaluation?.composite_score)
    .filter((s) => s != null)
    .sort((a, b) => b - a)[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Recruiter Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Submitted applications, document completeness, and evaluation results.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedDivision} onValueChange={setSelectedDivision}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Pick a division to evaluate" />
            </SelectTrigger>
            <SelectContent>
              {DIVISIONS.filter((d) => d.id !== "all").map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={!selectedDivision ? 0 : -1}>
                <Button
                  onClick={handleEvaluate}
                  disabled={evaluating || !selectedDivision}
                >
                  {evaluating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Evaluating…
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Run Evaluation
                    </>
                  )}
                </Button>
              </span>
            </TooltipTrigger>
            {!selectedDivision && (
              <TooltipContent>Select a division first</TooltipContent>
            )}
          </Tooltip>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{submittedCount}</p>
              <p className="text-xs text-muted-foreground">Applications (filtered)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{scoredCount}</p>
              <p className="text-xs text-muted-foreground">Evaluated</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">
                {topScore != null ? topScore.toFixed(1) : "—"}
              </p>
              <p className="text-xs text-muted-foreground">Top Score</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5" />
            Filter:
          </span>
          <Select value={divisionFilter} onValueChange={setDivisionFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIVISIONS.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(divisionFilter !== "all" || statusFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDivisionFilter("all");
                setStatusFilter("all");
              }}
            >
              Reset
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      {loading ? (
        <Card>
          <CardContent className="py-16 flex items-center justify-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Loading applications…</span>
          </CardContent>
        </Card>
      ) : applications.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <Inbox className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-sm font-medium mb-1">No submitted applications</p>
            <p className="text-sm text-muted-foreground">
              Once candidates finish uploading and submit, they'll show up here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
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
                {applications.map((a) => {
                  const cevalId = a.evaluation?.candidate_id;
                  const canOpen = Boolean(cevalId);
                  return (
                    <TableRow
                      key={a.id}
                      className={`transition-colors ${
                        canOpen
                          ? "cursor-pointer hover:bg-muted/50"
                          : "opacity-90"
                      }`}
                      onClick={() =>
                        canOpen && navigate(`/candidates/${cevalId}`)
                      }
                    >
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">
                            {a.candidate?.full_name || "—"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {a.candidate?.email || ""}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {a.candidate?.nim || "—"}
                      </TableCell>
                      <TableCell>
                        <DivisionBadge division={a.division} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={a.status} />
                      </TableCell>
                      <TableCell>
                        <CompletenessCell pct={a.doc_completeness_pct} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <ScoreBadge score={a.evaluation?.composite_score} />
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {a.submitted_at
                          ? new Date(a.submitted_at).toLocaleDateString()
                          : "—"}
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
      )}
    </div>
  );
}
