import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Bell,
  ExternalLink,
  Filter,
  Inbox,
  Loader2,
  Megaphone,
  Play,
  RotateCw,
  Sparkles,
  Trophy,
  Users,
  X,
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
import { Checkbox } from "@/components/ui/checkbox";
import RecruitmentPhaseCard from "@/components/RecruitmentPhaseCard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  listRecruiterApplications,
  evaluateBatch,
  getActivePeriod,
  bulkAnnounce,
} from "@/lib/api";
import { getCurrentUser, ROLES } from "@/lib/auth";
import { PHASE_BADGE_CLASS, PHASE_LABEL } from "@/lib/phase";

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

// Statuses that count as "evaluated" — only these can be checked / counted in
// the bulk-announce confirmation. Mirrors backend _EVALUATED_STATUSES.
const EVALUATED_STATUSES = new Set([
  "screening",
  "announced_pass",
  "announced_fail",
]);

export default function DashboardPage() {
  const navigate = useNavigate();
  const [applications, setApplications] = useState([]);
  const [selectedDivision, setSelectedDivision] = useState("big_data");
  const [divisionFilter, setDivisionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);

  // Task 12.1 — active recruitment period (for threshold_n + period_id).
  const [activePeriod, setActivePeriod] = useState(null);
  const [periodLoading, setPeriodLoading] = useState(true);

  // Task 12.2 — local checkbox state: { [application_id]: bool }.
  const [checked, setChecked] = useState({});

  // Task 12.3 — publish confirmation + in-flight state.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Task 13.3.3 — evaluation prompt banner (session-only dismiss).
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const evaluateButtonRef = useRef(null);

  // Task 13.3.4 — last evaluate response carried `_warning` (non-null when
  // run outside the EVALUATION phase). Sticky in state so the tooltip
  // hint stays visible after the toast fades.
  const [evaluateWarning, setEvaluateWarning] = useState(null);

  // Task 13.5.3 — last evaluate run's skipped_count, plus reset-confirm state.
  const [lastSkippedCount, setLastSkippedCount] = useState(0);
  const [reEvaluateOpen, setReEvaluateOpen] = useState(false);
  const [reEvaluating, setReEvaluating] = useState(false);

  const currentUser = getCurrentUser();
  const isSuperAdmin = currentUser?.role === ROLES.SUPER_ADMIN;
  const phase = activePeriod?.current_phase || null;

  const fetchData = async () => {
    setLoading(true);
    try {
      const apps = await listRecruiterApplications({
        division: divisionFilter !== "all" ? divisionFilter : undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
      });
      setApplications(apps);
      // Pre-check candidates already announced_pass so the recruiter sees the
      // current state — Task 12.2.
      const initial = {};
      for (const a of apps) {
        if (a.status === "announced_pass") initial[a.id] = true;
      }
      setChecked(initial);
    } catch (err) {
      toast.error(`Failed to load data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchActivePeriod = async () => {
    try {
      const p = await getActivePeriod();
      setActivePeriod(p);
    } catch {
      // 404 = no active period — that's a legitimate state, not an error.
      setActivePeriod(null);
    } finally {
      setPeriodLoading(false);
    }
  };

  useEffect(() => {
    fetchActivePeriod();
  }, []);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisionFilter, statusFilter]);

  // Task 13.5.3 — run evaluate batch and surface evaluated/skipped counts.
  // ``force`` re-evaluates already-scored candidates in the division.
  const runEvaluate = async ({ force = false } = {}) => {
    if (!selectedDivision) {
      toast.error("Please select a division first.");
      return;
    }
    if (force) {
      setReEvaluating(true);
    } else {
      setEvaluating(true);
    }
    try {
      const result = await evaluateBatch(selectedDivision, { force });
      const evaluated = result.evaluated_count ?? 0;
      const skipped = result.skipped_count ?? 0;
      setLastSkippedCount(skipped);

      if (evaluated === 0 && skipped > 0) {
        toast.info(
          "Semua kandidat di divisi ini sudah dievaluasi sebelumnya."
        );
      } else if (skipped > 0) {
        toast.success(
          `Evaluasi selesai. ${evaluated} kandidat dievaluasi, ${skipped} kandidat dilewati (sudah dievaluasi).`
        );
      } else {
        toast.success(
          `Evaluasi selesai. ${evaluated} kandidat dievaluasi.`
        );
      }

      if (result.errors?.length > 0) {
        toast.warning(`${result.errors.length} application(s) had errors.`);
      }
      // Task 13.3.4 — surface the soft-warn from the backend (non-null when
      // evaluation runs outside the EVALUATION phase). Persist in state so
      // the Run Evaluation tooltip keeps reminding the recruiter.
      if (result._warning) {
        toast.warning(result._warning);
        setEvaluateWarning(result._warning);
      } else {
        setEvaluateWarning(null);
      }
      // Successfully ran evaluation → dismiss the prompt banner for this view.
      setBannerDismissed(true);
      fetchData();
      // Active period may now report evaluation_prompt=false → refresh.
      fetchActivePeriod();
    } catch (err) {
      toast.error(`Evaluation failed: ${err.message}`);
    } finally {
      setEvaluating(false);
      setReEvaluating(false);
    }
  };

  const handleEvaluate = () => runEvaluate({ force: false });

  const handleConfirmReEvaluate = async () => {
    setReEvaluateOpen(false);
    await runEvaluate({ force: true });
  };

  const submittedCount = applications.length;
  const scoredCount = applications.filter(
    (a) => a.evaluation?.composite_score != null
  ).length;
  const topScore = applications
    .map((a) => a.evaluation?.composite_score)
    .filter((s) => s != null)
    .sort((a, b) => b - a)[0];

  // ── Task 13.5.3 — re-evaluate visibility ────────────────────────────────
  // Show the "Evaluasi Ulang Semua" button when the last run skipped some
  // candidates, OR when the current view already contains evaluated apps in
  // the selected division (so the recruiter has something to re-evaluate).
  const evaluatedInSelectedDivision = applications.filter(
    (a) =>
      a.division === selectedDivision &&
      a.evaluation?.composite_score != null
  ).length;
  const canReEvaluate =
    selectedDivision != null &&
    (lastSkippedCount > 0 || evaluatedInSelectedDivision > 0);

  // ── Task 12.3 — bulk-publish derived state ─────────────────────────────
  const checkedIds = applications
    .filter((a) => checked[a.id] && EVALUATED_STATUSES.has(a.status))
    .map((a) => a.id);
  const checkedCount = checkedIds.length;
  const evaluatedInView = applications.filter((a) =>
    EVALUATED_STATUSES.has(a.status)
  );
  // Bulk publish targets the divisionFilter — must be a single division.
  // Task 13.3.4: phase must be ANNOUNCEMENT, unless the current user is a
  // Super Admin (backend bypasses the lock for them).
  const phaseAllowsPublish = phase === "ANNOUNCEMENT" || isSuperAdmin;
  const canPublish =
    checkedCount > 0 &&
    divisionFilter !== "all" &&
    activePeriod != null &&
    phaseAllowsPublish;
  // Y = evaluated apps in the targeted division MINUS checked count.
  const evaluatedInDivision = evaluatedInView.filter(
    (a) => divisionFilter === "all" || a.division === divisionFilter
  );
  const failCount = Math.max(evaluatedInDivision.length - checkedCount, 0);

  const handleConfirmPublish = async () => {
    if (!canPublish) return;
    setPublishing(true);
    try {
      const data = await bulkAnnounce({
        division: divisionFilter,
        periodId: activePeriod.id,
        passedApplicationIds: checkedIds,
      });
      toast.success(
        `Publikasi berhasil — ${data.announced_pass} lolos, ${data.announced_fail} tidak lolos.`
      );
      setConfirmOpen(false);
      fetchData();
    } catch (err) {
      toast.error(`Gagal publikasi: ${err.message}`);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2 flex-wrap">
            Recruiter Dashboard
            {/* Task 13.3.4 — phase badge near header. */}
            {activePeriod && phase && (
              <Badge
                variant="outline"
                className={`text-[10px] uppercase tracking-wide ${PHASE_BADGE_CLASS[phase] || ""}`}
                title={`Periode: ${activePeriod.name}`}
              >
                {PHASE_LABEL[phase] || phase}
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground mt-1">
            Submitted applications, document completeness, and evaluation results.
            {activePeriod && (
              <span className="ml-1 text-xs">
                · {activePeriod.name}
              </span>
            )}
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
          {(() => {
            // Task 13.3.4 — Run Evaluation: warn (not disable) if outside the
            // EVALUATION phase, or if the last run returned a backend warning.
            const phaseWarn = activePeriod && phase && phase !== "EVALUATION";
            const showWarn = phaseWarn || Boolean(evaluateWarning);
            const tooltipMsg = showWarn
              ? "Evaluasi dijalankan di luar window evaluasi resmi."
              : !selectedDivision
              ? "Select a division first"
              : null;
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={tooltipMsg ? 0 : -1}>
                    <Button
                      ref={evaluateButtonRef}
                      onClick={handleEvaluate}
                      disabled={evaluating || reEvaluating || !selectedDivision}
                      variant={showWarn ? "outline" : "default"}
                      className={
                        showWarn
                          ? "border-yellow-500/50 text-yellow-700 hover:bg-yellow-500/10 dark:text-yellow-400"
                          : ""
                      }
                    >
                      {evaluating ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Evaluating…
                        </>
                      ) : (
                        <>
                          {showWarn ? (
                            <AlertTriangle className="w-4 h-4 mr-2" />
                          ) : (
                            <Play className="w-4 h-4 mr-2" />
                          )}
                          Run Evaluation
                        </>
                      )}
                    </Button>
                  </span>
                </TooltipTrigger>
                {tooltipMsg && <TooltipContent>{tooltipMsg}</TooltipContent>}
              </Tooltip>
            );
          })()}
          {/* Task 13.5.3 — re-evaluate everything in the selected division. */}
          {canReEvaluate && (
            <Button
              variant="outline"
              onClick={() => setReEvaluateOpen(true)}
              disabled={evaluating || reEvaluating || !selectedDivision}
              title="Re-evaluate all candidates in this division"
            >
              {reEvaluating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Mengevaluasi ulang…
                </>
              ) : (
                <>
                  <RotateCw className="w-4 h-4 mr-2" />
                  Evaluasi Ulang Semua
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Task 13.4.1 — phase timeline card at the top of the dashboard. */}
      <RecruitmentPhaseCard
        role="recruiter"
        period={activePeriod}
        loading={periodLoading}
        submittedCount={applications.length}
      />

      {/* Task 13.3.3 — evaluation prompt banner (dismissible, session-only). */}
      {activePeriod?.evaluation_prompt && !bannerDismissed && (
        <div className="rounded-lg border-2 border-yellow-500/40 bg-yellow-500/10 p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-md bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 flex items-center justify-center shrink-0">
            <Bell className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              Masa pendaftaran telah berakhir.
            </p>
            <p className="text-xs text-yellow-700/80 dark:text-yellow-200/80 mt-0.5">
              Jalankan evaluasi untuk mulai memproses kandidat.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              onClick={() => {
                evaluateButtonRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "center",
                });
                evaluateButtonRef.current?.focus();
              }}
              className="bg-yellow-600 hover:bg-yellow-700 text-white"
            >
              <Play className="w-3.5 h-3.5 mr-1.5" />
              Jalankan Evaluasi
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setBannerDismissed(true)}
              aria-label="Tutup banner"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

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

      {/* Filters + bulk publish */}
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

          {/* Task 12.3 — Publish Hasil button */}
          {checkedCount > 0 && (
            <div className="ml-auto flex items-center gap-2">
              {divisionFilter === "all" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Filter ke satu divisi
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Pilih satu divisi pada filter sebelum publish hasil.
                  </TooltipContent>
                </Tooltip>
              )}
              {divisionFilter !== "all" && activePeriod == null && (
                <span className="text-xs text-destructive inline-flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Tidak ada periode aktif
                </span>
              )}
              {/* Task 13.3.4 — phase guard: disabled outside ANNOUNCEMENT
                  unless the user is a Super Admin (backend bypasses). */}
              {(() => {
                const phaseLocked = !phaseAllowsPublish && activePeriod != null;
                const tooltipMsg = phaseLocked
                  ? "Pengumuman hanya dapat dilakukan pada fase Pengumuman."
                  : null;
                return (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={tooltipMsg ? 0 : -1}>
                        <Button
                          onClick={() => setConfirmOpen(true)}
                          disabled={!canPublish}
                        >
                          <Megaphone className="w-4 h-4 mr-2" />
                          Publish Hasil ({checkedCount})
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {tooltipMsg && <TooltipContent>{tooltipMsg}</TooltipContent>}
                  </Tooltip>
                );
              })()}
            </div>
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
                  <TableHead className="w-10" />
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
                  const isEvaluated = EVALUATED_STATUSES.has(a.status);
                  const isRecommended = a.is_recommended === true;
                  const isChecked = Boolean(checked[a.id]);

                  // Task 12.1 — green highlight when threshold-recommended.
                  const rowHighlight = isRecommended
                    ? "bg-green-50/60 dark:bg-green-900/10 border-l-4 border-l-green-500"
                    : "";

                  const checkboxNode = isEvaluated ? (
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={(v) =>
                        setChecked((prev) => ({ ...prev, [a.id]: Boolean(v) }))
                      }
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${a.candidate?.full_name || "candidate"}`}
                    />
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className="inline-flex"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox checked={false} disabled />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        Jalankan evaluasi terlebih dahulu
                      </TooltipContent>
                    </Tooltip>
                  );

                  return (
                    <TableRow
                      key={a.id}
                      className={`transition-colors ${rowHighlight} ${
                        canOpen
                          ? "cursor-pointer hover:bg-muted/50"
                          : "opacity-90"
                      }`}
                      onClick={() =>
                        canOpen && navigate(`/candidates/${cevalId}`)
                      }
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {checkboxNode}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {a.candidate?.full_name || "—"}
                            </span>
                            {isRecommended && (
                              <Badge
                                variant="outline"
                                className="text-[10px] uppercase border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400"
                              >
                                <Sparkles className="w-3 h-3 mr-1" />
                                Rekomendasi
                              </Badge>
                            )}
                          </div>
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
                          {a.rank != null && (
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              #{a.rank}
                            </span>
                          )}
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

      {/* Task 12.1 — info-text below the table */}
      {!loading && applications.length > 0 && activePeriod?.threshold_n != null && (
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-green-600" />
          Threshold aktif: Top {activePeriod.threshold_n} per divisi
        </p>
      )}

      {/* Task 13.5.3 — Re-evaluate everything confirmation. */}
      <AlertDialog open={reEvaluateOpen} onOpenChange={setReEvaluateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Evaluasi Ulang Semua Kandidat</AlertDialogTitle>
            <AlertDialogDescription>
              Ini akan mengevaluasi ulang semua kandidat di divisi ini,
              termasuk yang sudah memiliki skor. Lanjutkan?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reEvaluating}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmReEvaluate();
              }}
              disabled={reEvaluating}
            >
              {reEvaluating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Mengevaluasi ulang…
                </>
              ) : (
                "Evaluasi Ulang"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Task 12.3 — Publish confirmation */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konfirmasi Publikasi Hasil</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-1">
                <p>
                  Tindakan ini akan mempublikasikan hasil seleksi untuk divisi{" "}
                  <span className="font-medium text-foreground">
                    {divisionFilter !== "all" ? divisionFilter.replace("_", " ") : "—"}
                  </span>
                  .
                </p>
                <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
                  <p>
                    <span className="text-green-600 font-medium">✅ Lolos:</span>{" "}
                    {checkedCount} kandidat
                  </p>
                  <p>
                    <span className="text-destructive font-medium">❌ Tidak Lolos:</span>{" "}
                    {failCount} kandidat
                  </p>
                </div>
                <p className="text-xs">
                  Kandidat yang tidak lolos adalah semua kandidat yang sudah
                  dievaluasi namun tidak dicentang.
                </p>
                <p className="text-xs font-medium text-destructive">
                  Tindakan ini tidak dapat dibatalkan.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishing}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // AlertDialogAction auto-closes; we want the async flow to
                // control closing so the dialog stays open while publishing.
                e.preventDefault();
                handleConfirmPublish();
              }}
              disabled={publishing || !canPublish}
            >
              {publishing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Mempublikasikan…
                </>
              ) : (
                "Publikasikan"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
