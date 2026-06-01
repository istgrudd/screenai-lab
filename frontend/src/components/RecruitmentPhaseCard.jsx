import { createElement, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Hourglass,
  Layers,
  Sparkles,
  Users,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PHASE_BADGE_CLASS, PHASE_LABEL } from "@/lib/phase";

/**
 * Shared phase-timeline card — Task 13.4.1.
 *
 * Renders the active recruitment period's three phases (Submission,
 * Evaluation, Announcement), highlights the active one, and shows a
 * role-specific action hint at the bottom.
 *
 * For super_admin, an additional stats block lists threshold_n, total
 * submitted, and a per-division breakdown.
 *
 * Props:
 *   role           — "candidate" | "recruiter" | "super_admin"
 *   period         — { id, name, current_phase, phases:{ submission,
 *                       evaluation, announcement }, threshold_n, ... }
 *                     or null when no active period
 *   loading        — show skeleton while fetching
 *   stats          — { total_submitted, by_division } (super_admin only)
 *   submittedCount — convenience override for the recruiter SUBMISSION hint
 */

const DIVISION_LABEL = {
  big_data: "Big Data",
  cyber_security: "Cyber Security",
  game_tech: "Game Technology",
  gis: "GIS",
};

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function useNow(refreshMs = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), refreshMs);
    return () => clearInterval(t);
  }, [refreshMs]);
  return now;
}

function countdownText(targetIso, now) {
  if (!targetIso) return null;
  const target = new Date(targetIso);
  if (Number.isNaN(target.getTime())) return null;
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return "Berakhir";
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (days > 0) return `${days}h ${hours}j tersisa`;
  if (hours > 0) return `${hours}j ${minutes}m tersisa`;
  return `${minutes}m tersisa`;
}

function PhaseRow({ icon, title, range, status, countdown }) {
  // status: "done" | "active" | "upcoming"
  const isActive = status === "active";
  const isDone = status === "done";

  const iconClass = isActive
    ? "bg-primary text-primary-foreground"
    : isDone
    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
    : "bg-muted text-muted-foreground";

  const containerClass = isActive
    ? "rounded-lg border border-primary/40 bg-primary/5 px-3 py-2.5"
    : "rounded-lg border border-transparent px-3 py-2.5";

  const StatusIcon = isDone
    ? CheckCircle2
    : isActive
    ? CircleDot
    : Hourglass;

  return (
    <div className={`flex items-center gap-3 ${containerClass}`}>
      <div
        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconClass}`}
      >
        {createElement(icon, { className: "w-4 h-4" })}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p
            className={`text-sm font-medium ${
              isActive || isDone ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {title}
          </p>
          <StatusIcon
            className={`w-3.5 h-3.5 ${
              isDone
                ? "text-emerald-600"
                : isActive
                ? "text-primary"
                : "text-muted-foreground/60"
            }`}
          />
          {isActive && countdown && (
            <span className="text-[11px] tabular-nums text-primary font-medium">
              {countdown}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{range}</p>
      </div>
    </div>
  );
}

function StatsBlock({ stats, threshold }) {
  const total = stats?.total_submitted ?? 0;
  const byDivision = stats?.by_division ?? {};
  const divisionEntries = Object.entries(byDivision);

  return (
    <div className="border-t pt-4 mt-2 space-y-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        Statistik Periode
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border bg-muted/30 px-3 py-2.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="w-3.5 h-3.5" />
            Threshold N
          </div>
          <p className="text-lg font-semibold tabular-nums mt-0.5">
            {threshold ?? (
              <span className="text-sm font-normal text-muted-foreground">
                Tidak diatur
              </span>
            )}
          </p>
        </div>
        <div className="rounded-lg border bg-muted/30 px-3 py-2.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="w-3.5 h-3.5" />
            Total Submitted
          </div>
          <p className="text-lg font-semibold tabular-nums mt-0.5">{total}</p>
        </div>
        <div className="rounded-lg border bg-muted/30 px-3 py-2.5 sm:col-span-1 col-span-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Layers className="w-3.5 h-3.5" />
            Divisi Aktif
          </div>
          <p className="text-lg font-semibold tabular-nums mt-0.5">
            {divisionEntries.filter(([, n]) => n > 0).length || 0}
          </p>
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Per Divisi
        </p>
        {divisionEntries.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            Belum ada submit per divisi.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {divisionEntries.map(([div, count]) => (
              <div
                key={div}
                className="flex items-center justify-between text-sm border rounded-md px-2.5 py-1.5"
              >
                <span className="text-muted-foreground">
                  {DIVISION_LABEL[div] || div.replace("_", " ")}
                </span>
                <span className="tabular-nums font-medium">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function actionHintText({ role, phase, period, submittedCount }) {
  if (!phase) return null;
  if (role === "candidate") {
    if (phase === "SUBMISSION")
      return "Segera lengkapi dan submit dokumen kamu.";
    if (phase === "EVALUATION")
      return "Aplikasi kamu sedang dievaluasi oleh AI.";
    if (phase === "ANNOUNCEMENT") return "Cek hasil seleksi kamu di bawah.";
    if (phase === "CLOSED") return "Periode rekrutasi telah berakhir.";
    if (phase === "UPCOMING") {
      const dt = period?.start_date ? formatDate(period.start_date) : "—";
      return `Pendaftaran akan dibuka pada ${dt}.`;
    }
  }
  if (role === "recruiter") {
    if (phase === "SUBMISSION") {
      const n = submittedCount ?? period?.application_count ?? 0;
      return `Periode pendaftaran sedang berjalan. ${n} kandidat telah submit.`;
    }
    if (phase === "EVALUATION")
      return "Jalankan evaluasi per divisi sebelum fase ini berakhir.";
    if (phase === "ANNOUNCEMENT")
      return "Publikasikan hasil seleksi untuk setiap divisi.";
    if (phase === "CLOSED") return "Periode rekrutasi telah ditutup.";
    if (phase === "UPCOMING") return "Periode rekrutasi belum dibuka.";
  }
  // super_admin role intentionally returns no action hint — the stats
  // block carries everything they need (threshold, totals, by division).
  return null;
}

function phaseStatus(phase, target) {
  // Returns done/active/upcoming for a target phase, given the current phase.
  if (!phase) return "upcoming";
  const order = ["UPCOMING", "SUBMISSION", "EVALUATION", "ANNOUNCEMENT", "CLOSED"];
  const cur = order.indexOf(phase);
  const tgt = order.indexOf(target);
  if (cur === -1 || tgt === -1) return "upcoming";
  if (cur > tgt) return "done";
  if (cur === tgt) return "active";
  return "upcoming";
}

function EmptyState({ role }) {
  const text =
    role === "super_admin"
      ? "Tidak ada periode aktif. Buat periode baru di halaman Periode Rekrutasi."
      : "Tidak ada periode rekrutasi aktif saat ini.";
  return (
    <Card className="border-dashed">
      <CardContent className="py-8 flex items-center gap-4">
        <div className="w-11 h-11 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
          <CalendarClock className="w-5 h-5" />
        </div>
        <p className="text-sm text-muted-foreground">{text}</p>
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <Card>
      <CardContent className="py-6 flex items-center gap-4">
        <div className="w-11 h-11 rounded-lg bg-muted animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
          <div className="h-3 w-2/3 rounded bg-muted animate-pulse" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function RecruitmentPhaseCard({
  role,
  period,
  loading = false,
  stats = null,
  submittedCount,
}) {
  const now = useNow();
  const phase = period?.current_phase || null;
  const phases = period?.phases || {};

  const subEnd = phases?.submission?.end || period?.submission_end_date;
  const evalEnd = phases?.evaluation?.end || period?.evaluation_end_date;
  const annEnd = phases?.announcement?.end || period?.end_date;

  const submissionStart = phases?.submission?.start || period?.start_date;
  const evaluationStart = phases?.evaluation?.start || subEnd;
  const announcementStart = phases?.announcement?.start || evalEnd;

  const subCountdown = useMemo(
    () => (phase === "SUBMISSION" ? countdownText(subEnd, now) : null),
    [phase, subEnd, now]
  );
  const evalCountdown = useMemo(
    () => (phase === "EVALUATION" ? countdownText(evalEnd, now) : null),
    [phase, evalEnd, now]
  );
  const annCountdown = useMemo(
    () => (phase === "ANNOUNCEMENT" ? countdownText(annEnd, now) : null),
    [phase, annEnd, now]
  );

  if (loading) return <LoadingState />;
  if (!period) return <EmptyState role={role} />;

  const hint = actionHintText({ role, phase, period, submittedCount });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-primary" />
              {period.name}
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Timeline periode rekrutasi
            </CardDescription>
          </div>
          {phase && (
            <Badge
              variant="outline"
              className={`text-[10px] uppercase tracking-wide ${PHASE_BADGE_CLASS[phase] || ""}`}
            >
              {PHASE_LABEL[phase] || phase}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="space-y-1">
          <PhaseRow
            icon={Calendar}
            title="Pendaftaran"
            range={`${formatDate(submissionStart)} → ${formatDate(subEnd)}`}
            status={phaseStatus(phase, "SUBMISSION")}
            countdown={subCountdown}
          />
          <PhaseRow
            icon={Sparkles}
            title="Evaluasi AI"
            range={`${formatDate(evaluationStart)} → ${formatDate(evalEnd)}`}
            status={phaseStatus(phase, "EVALUATION")}
            countdown={evalCountdown}
          />
          <PhaseRow
            icon={ChevronRight}
            title="Pengumuman"
            range={`${formatDate(announcementStart)} → ${formatDate(annEnd)}`}
            status={phaseStatus(phase, "ANNOUNCEMENT")}
            countdown={annCountdown}
          />
        </div>

        {hint && (
          <div className="text-sm text-foreground/90 border-t pt-3 mt-1 flex items-start gap-2">
            <ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <span>{hint}</span>
          </div>
        )}

        {role === "super_admin" && (
          <StatsBlock stats={stats} threshold={period.threshold_n} />
        )}
      </CardContent>
    </Card>
  );
}
