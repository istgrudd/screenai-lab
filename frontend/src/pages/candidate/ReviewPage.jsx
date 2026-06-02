import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  ShieldCheck,
  UserCircle2,
} from "lucide-react";

import ConfirmActionDialog from "@/components/common/ConfirmActionDialog";
import LoadingState from "@/components/common/LoadingState";
import StatusBadge from "@/components/common/StatusBadge";
import PageHeader from "@/components/layout/PageHeader";
import CandidateApplicationStepTrack from "@/components/candidate/CandidateApplicationStepTrack";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getActivePeriod,
  getMyApplication,
  getMyProfile,
  listApplicationDocuments,
  submitApplication,
} from "@/lib/api";
import {
  REQUIRED_DOCUMENTS,
  formatIpk,
  isSubmissionPhase,
  missingRequiredProfileFields,
  PROFILE_FIELD_LABELS,
  submissionPhaseMessage,
} from "@/lib/candidateApplication";
import { formatFileSize } from "@/lib/candidateUx";

function Field({ label, value, mono, emphasize }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p
        className={`${mono ? "font-mono" : ""} ${
          emphasize ? "font-semibold capitalize" : ""
        } mt-1 text-sm`}
      >
        {value || <span className="text-muted-foreground">-</span>}
      </p>
    </div>
  );
}

function ReadinessItem({ ready, title, description }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-surface-container-low px-4 py-3">
      <div
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
          ready ? "bg-success text-success-foreground" : "bg-warning/15 text-warning"
        }`}
      >
        {ready ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <AlertTriangle className="h-4 w-4" />
        )}
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

function ConfirmRow({ checked, onChange, label, hint }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-surface-container-low px-4 py-3 transition-colors hover:bg-surface-container-high">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 rounded border-input accent-primary"
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
          {hint}
        </span>
      </span>
    </label>
  );
}

export default function ReviewPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [application, setApplication] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [activePeriod, setActivePeriod] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [ackAccurate, setAckAccurate] = useState(false);
  const [ackIrreversible, setAckIrreversible] = useState(false);
  const [ackAuthentic, setAckAuthentic] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [me, app] = await Promise.all([getMyProfile(), getMyApplication()]);
        if (cancelled) return;
        setUser(me);
        setApplication(app);

        if (app.status !== "draft") {
          navigate("/application/status", { replace: true });
          return;
        }

        try {
          const period = await getActivePeriod();
          if (!cancelled) setActivePeriod(period);
        } catch {
          if (!cancelled) setActivePeriod(null);
        }

        const { documents: docs } = await listApplicationDocuments(app.id);
        if (!cancelled) setDocuments(docs || []);
      } catch (error) {
        if (error.message?.toLowerCase().includes("not found")) {
          navigate("/application/start", { replace: true });
          return;
        }
        toast.error(error.message || "Gagal memuat data review.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const allAcked = ackAccurate && ackIrreversible && ackAuthentic;
  const docsByType = new Map(documents.map((document) => [document.doc_type, document]));
  const allDocsPresent = REQUIRED_DOCUMENTS.every((item) =>
    docsByType.has(item.doc_type)
  );
  const missingProfile = missingRequiredProfileFields(user);
  const profileComplete = missingProfile.length === 0;
  const submissionOpen = isSubmissionPhase(activePeriod);
  const canSubmit =
    allAcked && allDocsPresent && profileComplete && submissionOpen && !submitting;

  const handleSubmit = async () => {
    if (!allAcked || !allDocsPresent || !profileComplete || !submissionOpen) return;
    setSubmitting(true);
    try {
      await submitApplication(application.id);
      toast.success("Pendaftaran berhasil dikirim.");
      navigate("/application/status", { replace: true });
    } catch (error) {
      toast.error(error.message || "Gagal mengirim pendaftaran.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingState label="Memuat review pendaftaran..." />;
  }

  if (!user || !application) return null;

  const disabledReasons = [
    !profileComplete && "Profil belum lengkap.",
    !allDocsPresent && "Masih ada dokumen wajib yang belum diunggah.",
    !submissionOpen && submissionPhaseMessage(activePeriod),
    !allAcked && "Semua pernyataan konfirmasi harus dicentang.",
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pendaftaran / Review"
        title="Tinjau & Kirim Pendaftaran"
        description="Pastikan profil, divisi, dan dokumen sudah benar sebelum pendaftaran dikirim final."
      />

      <CandidateApplicationStepTrack
        currentStep="review"
        application={application}
        documents={documents}
        profile={user}
        title="Alur Pendaftaran"
      />

      <Card className="brand-card bg-warning/10">
        <CardContent className="flex items-start gap-3 p-5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div>
            <p className="font-medium text-foreground">
              Submit pendaftaran bersifat final
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Setelah dikirim, divisi dan dokumen tidak bisa diubah kecuali
              recruiter meminta revisi dokumen.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="brand-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-heading text-xl tracking-normal">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Checklist Kesiapan
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <ReadinessItem
            ready={profileComplete}
            title="Profil lengkap"
            description={
              profileComplete
                ? "Seluruh field wajib kandidat sudah terisi."
                : `Wajib diisi: ${missingProfile
                    .map((field) => PROFILE_FIELD_LABELS[field] || field)
                    .join(", ")}.`
            }
          />
          <ReadinessItem
            ready={allDocsPresent}
            title="Dokumen wajib lengkap"
            description={
              allDocsPresent
                ? "Semua dokumen wajib sudah tercatat."
                : "Lengkapi semua dokumen dari halaman Dokumen."
            }
          />
          <ReadinessItem
            ready={submissionOpen}
            title="Fase pendaftaran aktif"
            description={
              submissionOpen
                ? "Submit final tersedia pada fase ini."
                : submissionPhaseMessage(activePeriod)
            }
          />
          <ReadinessItem
            ready={allAcked}
            title="Konfirmasi kandidat"
            description={
              allAcked
                ? "Semua pernyataan sudah disetujui."
                : "Centang seluruh pernyataan sebelum submit."
            }
          />
        </CardContent>
      </Card>

      {!profileComplete && (
        <Card className="brand-card bg-warning/10">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-foreground">Profil belum lengkap</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Lengkapi profil sebelum mengirim pendaftaran final.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link to="/profile/edit">Edit Profil</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1fr]">
        <Card className="brand-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-heading text-xl tracking-normal">
              <UserCircle2 className="h-5 w-5 text-primary" />
              Ringkasan Profil
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Nama lengkap" value={user.full_name} />
            <Field label="NIM" value={user.nim} mono />
            <Field label="Email" value={user.email} />
            <Field label="WhatsApp" value={user.whatsapp} />
            <Field label="Angkatan" value={user.year} />
            <Field label="IPK" value={formatIpk(user.ipk)} />
            <Field label="Fakultas" value={user.faculty} />
            <Field label="Jurusan" value={user.major} />
            <Field
              label="Divisi pilihan"
              value={(application.division || "").replace("_", " ")}
              emphasize
            />
          </CardContent>
        </Card>

        <Card className="brand-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-heading text-xl tracking-normal">
              <FileText className="h-5 w-5 text-primary" />
              Ringkasan Dokumen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {REQUIRED_DOCUMENTS.map((item) => {
              const document = docsByType.get(item.doc_type);
              return (
                <div
                  key={item.doc_type}
                  className="flex items-center justify-between gap-3 rounded-xl bg-surface-container-low px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {document
                        ? `${document.file_name || "Dokumen"} - ${formatFileSize(
                            document.file_size
                          )}`
                        : "Belum diunggah"}
                    </p>
                  </div>
                  <StatusBadge
                    status={document ? "uploaded" : "missing"}
                    entityType="document"
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card className="brand-card">
        <CardHeader className="pb-3">
          <CardTitle className="font-heading text-xl tracking-normal">
            Konfirmasi Final
          </CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            Centang semua pernyataan untuk mengaktifkan tombol submit.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <ConfirmRow
            checked={ackAccurate}
            onChange={setAckAccurate}
            label="Data sudah akurat"
            hint="Profil, divisi, dan dokumen yang saya kirim sudah benar."
          />
          <ConfirmRow
            checked={ackAuthentic}
            onChange={setAckAuthentic}
            label="Dokumen asli milik saya"
            hint="Seluruh file adalah milik saya dan tidak dimanipulasi."
          />
          <ConfirmRow
            checked={ackIrreversible}
            onChange={setAckIrreversible}
            label="Saya memahami submit bersifat final"
            hint="Saya tidak bisa mengganti dokumen setelah submit kecuali diminta revisi."
          />

          {disabledReasons.length > 0 && (
            <div className="rounded-xl bg-warning/10 px-4 py-3 text-sm leading-6 text-warning">
              {disabledReasons.join(" ")}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-border/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/documents")}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Kembali ke Dokumen
            </Button>

            <ConfirmActionDialog
              title="Kirim pendaftaran final?"
              description="Pendaftaran akan masuk ke proses review dan dokumen terkunci setelah dikirim."
              confirmLabel="Kirim Pendaftaran"
              cancelLabel="Periksa Lagi"
              loading={submitting}
              onConfirm={handleSubmit}
            >
              <Button type="button" disabled={!canSubmit} className="gap-2">
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                Kirim Pendaftaran
              </Button>
            </ConfirmActionDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
