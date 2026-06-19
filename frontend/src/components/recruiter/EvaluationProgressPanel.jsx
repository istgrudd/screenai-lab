import { AlertTriangle, Ban, CheckCircle2, Loader2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Non-blocking evaluation progress panel (Phase 2 + W2 cancellation).
 *
 * Replaces the old full-screen blocking overlay + fake steps. Bound to a real
 * evaluation job's counters: shows processed/total, succeeded/failed, and the
 * errors collected so far. Renders inline in the page flow so recruiters can
 * keep working while a job runs; a page refresh re-discovers the active job.
 *
 * W2: while the job is active (queued/running/cancelling) a Cancel control is
 * shown. Clicking it calls ``onCancel``; the card then resolves to a
 * "cancelled" state once the runner finishes draining.
 */
export default function EvaluationProgressPanel({ job, onCancel, cancelling = false }) {
  if (!job) return null;

  const total = job.total ?? 0;
  const processed = job.processed ?? 0;
  const succeeded = job.succeeded ?? 0;
  const failed = job.failed ?? 0;
  const errors = Array.isArray(job.errors) ? job.errors : [];
  const status = job.status;

  const isCompleted = status === "completed";
  const isFailed = status === "failed";
  const isCancelled = status === "cancelled";
  const isCancelling = status === "cancelling";
  const isTerminal = isCompleted || isFailed || isCancelled;
  // A cancel has been requested (button clicked or the server flipped the job
  // to cancelling) but the job is not yet terminal.
  const cancelPending = !isTerminal && (cancelling || isCancelling || Boolean(job.cancel_requested));
  const pct =
    total > 0
      ? Math.min(100, Math.round((processed / total) * 100))
      : isTerminal
        ? 100
        : 0;

  const title = isFailed
    ? "Evaluasi gagal"
    : isCancelled
      ? "Evaluasi dibatalkan"
      : isCompleted
        ? "Evaluasi selesai"
        : isCancelling
          ? "Membatalkan evaluasi…"
          : status === "queued"
            ? "Evaluasi dalam antrean"
            : "Evaluasi sedang berjalan";

  const subtitle = isFailed
    ? job.note || "Job evaluasi gagal diselesaikan. Silakan coba lagi."
    : isCancelled
      ? "Evaluasi dihentikan. Kandidat yang sudah dinilai tetap tersimpan."
      : isCompleted
        ? "Hasil sudah tersimpan. Tabel kandidat telah diperbarui."
        : isCancelling
          ? "Permintaan pembatalan diterima. Menyelesaikan kandidat yang sedang berjalan…"
          : "Anda tetap bisa bekerja di halaman lain; progres diperbarui otomatis.";

  const barColor = isFailed
    ? "bg-destructive"
    : isCancelled || isCancelling
      ? "bg-warning"
      : isCompleted
        ? "bg-success"
        : "bg-primary";

  return (
    <Card className="brand-card">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
              isFailed
                ? "bg-destructive/10 text-destructive"
                : isCancelled
                  ? "bg-warning/10 text-warning"
                  : isCompleted
                    ? "bg-success/10 text-success"
                    : "bg-primary/10 text-primary"
            }`}
          >
            {isFailed ? (
              <XCircle className="h-5 w-5" />
            ) : isCancelled ? (
              <Ban className="h-5 w-5" />
            ) : isCompleted ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-heading text-base font-bold tracking-normal">
                {title}
              </h3>
              <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                {processed} / {total}
              </span>
            </div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {subtitle}
            </p>
          </div>
          {!isTerminal && onCancel && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={onCancel}
              disabled={cancelPending}
            >
              {cancelPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Membatalkan…
                </>
              ) : (
                "Batalkan"
              )}
            </Button>
          )}
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-highest">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-surface-container-low px-4 py-3">
            <p className="text-xs text-muted-foreground">Processed</p>
            <p className="font-heading text-lg font-bold tabular-nums">
              {processed} / {total}
            </p>
          </div>
          <div className="rounded-xl bg-surface-container-low px-4 py-3">
            <p className="text-xs text-muted-foreground">Succeeded</p>
            <p className="font-heading text-lg font-bold tabular-nums text-success">
              {succeeded}
            </p>
          </div>
          <div className="rounded-xl bg-surface-container-low px-4 py-3">
            <p className="text-xs text-muted-foreground">Failed</p>
            <p className="font-heading text-lg font-bold tabular-nums text-destructive">
              {failed}
            </p>
          </div>
        </div>

        {errors.length > 0 && (
          <div className="rounded-xl bg-warning/10 p-4">
            <div className="flex items-center gap-2 text-warning">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <p className="text-sm font-medium">
                {errors.length} application(s) had errors
              </p>
            </div>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {errors.slice(0, 5).map((err, idx) => (
                <li key={`${err.application_id ?? "x"}-${idx}`}>
                  App #{err.application_id ?? "?"}: {err.error}
                </li>
              ))}
              {errors.length > 5 && (
                <li>…and {errors.length - 5} more.</li>
              )}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
