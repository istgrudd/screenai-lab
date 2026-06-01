import { AlertTriangle, CalendarClock, LockKeyhole, ShieldCheck } from "lucide-react";

import PhaseBadge from "@/components/common/PhaseBadge";
import StepTrack from "@/components/common/StepTrack";
import StatusBadge from "@/components/common/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PHASE_ORDER } from "@/lib/phaseMaps";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function completedFor(phase) {
  const index = PHASE_ORDER.indexOf(phase);
  if (index <= 0) return [];
  return PHASE_ORDER.slice(0, index);
}

export default function PeriodSafetyPanel({
  activePeriod,
  activeStats,
  applications = [],
  loading = false,
  className,
}) {
  const phase = activePeriod?.current_phase;
  const pendingDocuments = applications.filter((application) =>
    ["submitted", "document_review", "correction_requested"].includes(
      application.status
    )
  ).length;
  const evaluated = applications.filter(
    (application) => application?.evaluation?.composite_score != null
  ).length;
  const thresholdMissing =
    activePeriod && (activePeriod.threshold_n === null || activePeriod.threshold_n === undefined);
  const timelineSteps = [
    {
      key: "SUBMISSION",
      label: "Pendaftaran",
      description: `${formatDate(activePeriod?.start_date)} - ${formatDate(
        activePeriod?.submission_end_date
      )}`,
    },
    {
      key: "EVALUATION",
      label: "Evaluasi",
      description: `${formatDate(activePeriod?.submission_end_date)} - ${formatDate(
        activePeriod?.evaluation_end_date
      )}`,
    },
    {
      key: "ANNOUNCEMENT",
      label: "Pengumuman",
      description: `${formatDate(activePeriod?.evaluation_end_date)} - ${formatDate(
        activePeriod?.end_date
      )}`,
    },
  ];

  return (
    <Card className={`brand-card ${className || ""}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-heading text-xl tracking-normal">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Period Safety
        </CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">
          Ringkasan ini menjelaskan risiko create/update/close tanpa membuat
          aturan baru di luar backend.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl bg-surface-container-low px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Active Period
            </p>
            <p className="mt-1 font-medium">
              {loading ? "Memuat..." : activePeriod?.name || "Tidak ada"}
            </p>
            <div className="mt-2">
              {phase ? (
                <PhaseBadge phase={phase} />
              ) : (
                <StatusBadge label="No active period" tone="warning" />
              )}
            </div>
          </div>
          <div className="rounded-xl bg-surface-container-low px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Threshold N
            </p>
            <p className="mt-1 font-heading text-xl font-bold">
              {activePeriod?.threshold_n ?? "Belum diatur"}
            </p>
            {thresholdMissing && (
              <p className="mt-1 text-xs leading-5 text-warning">
                Ranking tetap tampil, tetapi batas kelulusan otomatis tidak
                dijelaskan oleh threshold.
              </p>
            )}
          </div>
          <div className="rounded-xl bg-surface-container-low px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Submitted
            </p>
            <p className="mt-1 font-heading text-xl font-bold">
              {activeStats?.total_submitted ?? activePeriod?.application_count ?? applications.length}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {evaluated} evaluated, {pendingDocuments} masih review/revisi.
            </p>
          </div>
        </div>

        {activePeriod ? (
          <StepTrack
            steps={timelineSteps}
            currentStep={phase}
            completedSteps={completedFor(phase)}
            orientation="vertical"
          />
        ) : (
          <div className="flex items-start gap-3 rounded-xl bg-warning/10 px-4 py-3">
            <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <p className="text-sm leading-6 text-muted-foreground">
              Tidak ada periode aktif. Create period akan membuka workflow baru;
              pastikan jadwal fase dan threshold sudah dicek sebelum simpan.
            </p>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex items-start gap-3 rounded-xl bg-warning/10 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <p className="font-medium">Active period conflict</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {activePeriod
                  ? `Periode "${activePeriod.name}" masih aktif. UI menjelaskan alasan create dinonaktifkan, sementara backend tetap menjadi sumber aturan final.`
                  : "Tidak ada conflict aktif saat ini."}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl bg-destructive/10 px-4 py-3">
            <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">Tutup periode</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Tindakan close bersifat destructive dan harus dikonfirmasi.
                Kandidat tidak dapat submit sampai periode baru tersedia.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
