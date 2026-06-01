import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  Loader2,
  Pencil,
  Plus,
  Save,
  X,
} from "lucide-react";

import ConfirmActionDialog from "@/components/common/ConfirmActionDialog";
import EmptyState from "@/components/common/EmptyState";
import LoadingState from "@/components/common/LoadingState";
import PhaseBadge from "@/components/common/PhaseBadge";
import StatusBadge from "@/components/common/StatusBadge";
import PageHeader from "@/components/layout/PageHeader";
import PeriodSafetyPanel from "@/components/admin/PeriodSafetyPanel";
import PeriodTimelinePreview from "@/components/admin/PeriodTimelinePreview";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  closePeriod,
  createPeriod,
  listPeriods,
  updatePeriod,
} from "@/lib/api";

function toLocalInputValue(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds()
  )}`;
}

function toIsoFromInput(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatDateTime(iso) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function validatePhaseDates({ startDate, submissionEnd, evaluationEnd, endDate }) {
  const errors = {};
  const start = startDate ? new Date(startDate).getTime() : NaN;
  const submission = submissionEnd ? new Date(submissionEnd).getTime() : NaN;
  const evaluation = evaluationEnd ? new Date(evaluationEnd).getTime() : NaN;
  const end = endDate ? new Date(endDate).getTime() : NaN;

  if (!startDate) errors.startDate = "Wajib diisi";
  if (!submissionEnd) errors.submissionEnd = "Wajib diisi";
  if (!evaluationEnd) errors.evaluationEnd = "Wajib diisi";
  if (!endDate) errors.endDate = "Wajib diisi";

  if (!Number.isNaN(start) && !Number.isNaN(submission) && !(start < submission)) {
    errors.submissionEnd = "Harus setelah Tanggal Mulai";
  }
  if (
    !Number.isNaN(submission) &&
    !Number.isNaN(evaluation) &&
    !(submission < evaluation)
  ) {
    errors.evaluationEnd = "Harus setelah Akhir Pendaftaran";
  }
  if (!Number.isNaN(evaluation) && !Number.isNaN(end) && !(evaluation < end)) {
    errors.endDate = "Harus setelah Akhir Evaluasi";
  }

  return Object.keys(errors).length ? errors : null;
}

function FieldError({ message }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

function ActivePeriodSummary({ period, onClose }) {
  if (!period) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Belum ada periode aktif"
        description="Buat periode baru setelah memastikan jadwal fase, threshold, dan konsekuensi workflow sudah jelas."
        actionLabel="Isi form periode baru"
        onAction={() =>
          document
            .getElementById("create-period-form")
            ?.scrollIntoView({ behavior: "smooth", block: "start" })
        }
      />
    );
  }

  return (
    <Card className="brand-card">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 font-heading text-xl tracking-normal">
              <CalendarClock className="h-5 w-5 text-primary" />
              Periode Aktif
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{period.name}</p>
          </div>
          <PhaseBadge phase={period.current_phase} size="md" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Mulai
            </p>
            <p className="mt-1 font-medium">{formatDateTime(period.start_date)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Akhir Pendaftaran
            </p>
            <p className="mt-1 font-medium">
              {formatDateTime(period.submission_end_date)}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Akhir Evaluasi
            </p>
            <p className="mt-1 font-medium">
              {formatDateTime(period.evaluation_end_date)}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Tutup
            </p>
            <p className="mt-1 font-medium">{formatDateTime(period.end_date)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Threshold N
            </p>
            <p className="mt-1 font-medium">
              {period.threshold_n ?? "Belum diatur"}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Total Aplikasi
            </p>
            <p className="mt-1 font-medium">{period.application_count ?? 0}</p>
          </div>
        </div>
        <div className="rounded-xl bg-destructive/10 px-4 py-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="font-medium">Tutup periode bersifat destructive</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Tindakan ini tidak dapat dibatalkan melalui form ini. Kandidat
                tidak dapat submit sampai periode baru dibuat.
              </p>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="mt-3 gap-2"
                onClick={() => onClose(period)}
              >
                <X className="h-4 w-4" />
                Tutup Periode
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CreatePeriodForm({ activePeriod, onCreated }) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [submissionEnd, setSubmissionEnd] = useState("");
  const [evaluationEnd, setEvaluationEnd] = useState("");
  const [endDate, setEndDate] = useState("");
  const [thresholdN, setThresholdN] = useState("");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const draft = useMemo(
    () => ({ startDate, submissionEnd, evaluationEnd, endDate, thresholdN }),
    [startDate, submissionEnd, evaluationEnd, endDate, thresholdN]
  );

  const reset = () => {
    setName("");
    setStartDate("");
    setSubmissionEnd("");
    setEvaluationEnd("");
    setEndDate("");
    setThresholdN("");
    setErrors({});
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (activePeriod) {
      toast.error("Tutup periode aktif terlebih dahulu sebelum membuat periode baru.");
      return;
    }
    if (!name.trim()) {
      toast.error("Lengkapi nama periode.");
      return;
    }

    const dateErrors = validatePhaseDates({
      startDate,
      submissionEnd,
      evaluationEnd,
      endDate,
    });
    if (dateErrors) {
      setErrors(dateErrors);
      toast.error("Periksa urutan dan kelengkapan tanggal.");
      return;
    }

    setErrors({});
    setBusy(true);
    try {
      await createPeriod({
        name: name.trim(),
        start_date: toIsoFromInput(startDate),
        submission_end_date: toIsoFromInput(submissionEnd),
        evaluation_end_date: toIsoFromInput(evaluationEnd),
        end_date: toIsoFromInput(endDate),
        threshold_n: thresholdN === "" ? null : Number(thresholdN),
      });
      toast.success("Periode dibuat dan diaktifkan.");
      reset();
      onCreated();
    } catch (err) {
      toast.error(err.message || "Gagal membuat periode");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="create-period-form" className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <Card className="brand-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-heading text-xl tracking-normal">
            <Plus className="h-5 w-5 text-primary" />
            Buat Periode Baru
          </CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            Periode baru hanya bisa dibuat saat tidak ada periode aktif.
            Threshold N kosong akan dikirim sebagai null.
          </p>
        </CardHeader>
        <CardContent>
          {activePeriod && (
            <div className="mb-5 rounded-xl bg-warning/10 px-4 py-3 text-sm">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                <div>
                  <p className="font-medium">Masih ada periode aktif.</p>
                  <p className="mt-1 leading-6 text-muted-foreground">
                    Tutup periode "{activePeriod.name}" sebelum membuat periode
                    baru. Backend tetap menjadi sumber aturan final.
                  </p>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-6">
            <section className="space-y-4">
              <h3 className="font-heading text-base font-bold tracking-normal">
                Period Identity
              </h3>
              <div className="space-y-1.5">
                <Label htmlFor="period-name">Nama Periode</Label>
                <Input
                  id="period-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Rekrutasi Lab MBC 2026-2027"
                  maxLength={255}
                  disabled={busy || Boolean(activePeriod)}
                />
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="font-heading text-base font-bold tracking-normal">
                Phase Dates
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="period-start">Tanggal Mulai</Label>
                  <Input
                    id="period-start"
                    type="datetime-local"
                    step={1}
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    disabled={busy || Boolean(activePeriod)}
                  />
                  <FieldError message={errors.startDate} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="period-submission-end">Akhir Pendaftaran</Label>
                  <Input
                    id="period-submission-end"
                    type="datetime-local"
                    step={1}
                    value={submissionEnd}
                    onChange={(event) => setSubmissionEnd(event.target.value)}
                    disabled={busy || Boolean(activePeriod)}
                  />
                  <FieldError message={errors.submissionEnd} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="period-evaluation-end">Akhir Evaluasi</Label>
                  <Input
                    id="period-evaluation-end"
                    type="datetime-local"
                    step={1}
                    value={evaluationEnd}
                    onChange={(event) => setEvaluationEnd(event.target.value)}
                    disabled={busy || Boolean(activePeriod)}
                  />
                  <FieldError message={errors.evaluationEnd} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="period-end">Tanggal Tutup</Label>
                  <Input
                    id="period-end"
                    type="datetime-local"
                    step={1}
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    disabled={busy || Boolean(activePeriod)}
                  />
                  <FieldError message={errors.endDate} />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="font-heading text-base font-bold tracking-normal">
                Threshold Settings
              </h3>
              <div className="space-y-1.5">
                <Label htmlFor="period-threshold">
                  Top N kandidat lolos per divisi
                </Label>
                <Input
                  id="period-threshold"
                  type="number"
                  min={1}
                  value={thresholdN}
                  onChange={(event) => setThresholdN(event.target.value)}
                  placeholder="Kosongkan jika tidak ada threshold"
                  disabled={busy || Boolean(activePeriod)}
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  Jika kosong, nilai dikirim sebagai null dan UI akan
                  menjelaskan bahwa threshold belum diatur.
                </p>
              </div>
            </section>

            <Button
              type="submit"
              disabled={busy || Boolean(activePeriod)}
              className="gap-2"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Buat & Aktifkan
            </Button>
          </form>
        </CardContent>
      </Card>

      <PeriodTimelinePreview
        title="Preview sebelum save"
        draft={draft}
        thresholdN={thresholdN}
      />
    </div>
  );
}

function PeriodRow({ period, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(period.name);
  const [submissionEnd, setSubmissionEnd] = useState(
    toLocalInputValue(period.submission_end_date)
  );
  const [evaluationEnd, setEvaluationEnd] = useState(
    toLocalInputValue(period.evaluation_end_date)
  );
  const [endDate, setEndDate] = useState(toLocalInputValue(period.end_date));
  const [thresholdN, setThresholdN] = useState(period.threshold_n ?? "");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const startInput = toLocalInputValue(period.start_date);

  const onSave = async () => {
    const dateErrors = validatePhaseDates({
      startDate: startInput,
      submissionEnd,
      evaluationEnd,
      endDate,
    });
    if (dateErrors) {
      setErrors(dateErrors);
      toast.error("Periksa urutan tanggal.");
      return;
    }

    setErrors({});
    setBusy(true);
    try {
      await updatePeriod(period.id, {
        name: name.trim(),
        submission_end_date: toIsoFromInput(submissionEnd),
        evaluation_end_date: toIsoFromInput(evaluationEnd),
        end_date: toIsoFromInput(endDate),
        threshold_n: thresholdN === "" ? null : Number(thresholdN),
      });
      toast.success("Periode diperbarui.");
      setEditing(false);
      onChanged();
    } catch (err) {
      toast.error(err.message || "Gagal memperbarui");
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <TableRow>
        <TableCell>
          <Input value={name} onChange={(event) => setName(event.target.value)} disabled={busy} />
        </TableCell>
        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
          {formatDateTime(period.start_date)}
        </TableCell>
        <TableCell className="space-y-1">
          <Input
            type="datetime-local"
            step={1}
            value={submissionEnd}
            onChange={(event) => setSubmissionEnd(event.target.value)}
            disabled={busy}
          />
          <FieldError message={errors.submissionEnd} />
        </TableCell>
        <TableCell className="space-y-1">
          <Input
            type="datetime-local"
            step={1}
            value={evaluationEnd}
            onChange={(event) => setEvaluationEnd(event.target.value)}
            disabled={busy}
          />
          <FieldError message={errors.evaluationEnd} />
        </TableCell>
        <TableCell className="space-y-1">
          <Input
            type="datetime-local"
            step={1}
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            disabled={busy}
          />
          <FieldError message={errors.endDate} />
        </TableCell>
        <TableCell>
          <PhaseBadge phase={period.current_phase} />
        </TableCell>
        <TableCell>
          <StatusBadge
            label={period.is_active ? "Aktif" : "Tutup"}
            tone={period.is_active ? "success" : "neutral"}
          />
        </TableCell>
        <TableCell>
          <Input
            type="number"
            min={1}
            value={thresholdN}
            onChange={(event) => setThresholdN(event.target.value)}
            disabled={busy}
            className="w-28"
          />
        </TableCell>
        <TableCell>{period.application_count ?? 0}</TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={onSave} disabled={busy} className="gap-2">
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Simpan
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={busy}>
              Batal
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{period.name}</TableCell>
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
        {formatDateTime(period.start_date)}
      </TableCell>
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
        {formatDateTime(period.submission_end_date)}
      </TableCell>
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
        {formatDateTime(period.evaluation_end_date)}
      </TableCell>
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
        {formatDateTime(period.end_date)}
      </TableCell>
      <TableCell>
        <PhaseBadge phase={period.current_phase} />
      </TableCell>
      <TableCell>
        <StatusBadge
          label={period.is_active ? "Aktif" : "Tutup"}
          tone={period.is_active ? "success" : "neutral"}
        />
      </TableCell>
      <TableCell>{period.threshold_n ?? "Belum diatur"}</TableCell>
      <TableCell>{period.application_count ?? 0}</TableCell>
      <TableCell className="text-right">
        <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="gap-2">
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
      </TableCell>
    </TableRow>
  );
}

export default function RecruitmentPeriodPage() {
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [closeTarget, setCloseTarget] = useState(null);
  const [closing, setClosing] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listPeriods();
      setPeriods(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(err.message || "Gagal memuat periode");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(fetchAll);
  }, [fetchAll]);

  const active = useMemo(
    () => periods.find((period) => period.is_active) || null,
    [periods]
  );

  const handleClosePeriod = async () => {
    if (!closeTarget) return;
    setClosing(true);
    try {
      await closePeriod(closeTarget.id);
      toast.success("Periode ditutup.");
      setCloseTarget(null);
      await fetchAll();
    } catch (err) {
      toast.error(err.message || "Gagal menutup periode");
    } finally {
      setClosing(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Super Admin / Periods"
        title="Kelola Periode Rekrutasi"
        description="Create, update, and close recruitment periods with explicit safety context before high-impact changes."
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <ActivePeriodSummary period={active} onClose={setCloseTarget} />
        <PeriodSafetyPanel
          activePeriod={active}
          activeStats={null}
          applications={[]}
          loading={loading}
        />
      </div>

      <CreatePeriodForm activePeriod={active} onCreated={fetchAll} />

      <Card className="brand-card">
        <CardHeader className="pb-3">
          <CardTitle className="font-heading text-xl tracking-normal">
            Riwayat Periode
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {periods.length} total periode tercatat. Rows edit only the existing
            editable fields: name, phase dates, end date, and threshold N.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-5">
              <LoadingState variant="table" label="Memuat periode..." />
            </div>
          ) : periods.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={CalendarClock}
                title="Belum ada periode"
                description="Buat periode pertama untuk membuka workflow pendaftaran dan seleksi."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[1180px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Mulai</TableHead>
                    <TableHead>Akhir Pendaftaran</TableHead>
                    <TableHead>Akhir Evaluasi</TableHead>
                    <TableHead>Tutup</TableHead>
                    <TableHead>Fase</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Threshold N</TableHead>
                    <TableHead>Total Aplikasi</TableHead>
                    <TableHead className="w-[160px] text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periods.map((period) => (
                    <PeriodRow key={period.id} period={period} onChanged={fetchAll} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmActionDialog
        open={Boolean(closeTarget)}
        onOpenChange={(open) => {
          if (!open) setCloseTarget(null);
        }}
        title={closeTarget ? `Tutup periode "${closeTarget.name}"?` : "Tutup periode?"}
        description="Tindakan ini tidak dapat dibatalkan melalui UI ini. Kandidat tidak dapat submit lagi sampai periode baru dibuat."
        confirmLabel="Ya, tutup periode"
        cancelLabel="Batal"
        destructive
        loading={closing}
        onConfirm={handleClosePeriod}
      />
    </div>
  );
}
