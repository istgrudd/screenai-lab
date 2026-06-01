import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowRight,
  ClipboardCopy,
  FileText,
  Inbox,
  Megaphone,
  ShieldCheck,
} from "lucide-react";

import EmptyState from "@/components/common/EmptyState";
import LoadingState from "@/components/common/LoadingState";
import StatusBadge from "@/components/common/StatusBadge";
import PageHeader from "@/components/layout/PageHeader";
import ApplicationProgressCard from "@/components/candidate/ApplicationProgressCard";
import CandidateApplicationStepTrack from "@/components/candidate/CandidateApplicationStepTrack";
import CandidateStatusHero from "@/components/candidate/CandidateStatusHero";
import DocumentRequirementCard from "@/components/candidate/DocumentRequirementCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getMyAnnouncement,
  getMyApplication,
  listApplicationDocuments,
} from "@/lib/api";
import {
  REQUIRED_DOCUMENTS,
  applicationReferenceId,
  documentCompleteness,
  formatDateTime,
  formatDivision,
  isAnnouncedStatus,
  isNotFoundError,
  nextApplicationTarget,
} from "@/lib/candidateApplication";
import {
  candidateNextAction,
  candidateStatusCopy,
  cx,
  formatDateTimeId,
} from "@/lib/candidateUx";

function ReferenceBlock({ application }) {
  const reference = applicationReferenceId(application);

  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(reference);
      toast.success("Reference ID disalin.");
    } catch {
      toast.error("Gagal menyalin. Salin manual dari teks yang tampil.");
    }
  };

  return (
    <Card className="brand-card">
      <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">
            Reference ID
          </p>
          <p className="mt-1 font-mono text-lg font-semibold">{reference}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Gunakan ID ini jika perlu menghubungi recruiter terkait pendaftaran.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={copyReference} className="gap-2">
          <ClipboardCopy className="h-4 w-4" />
          Salin
        </Button>
      </CardContent>
    </Card>
  );
}

function StatusExplanationCard({ application, announcement }) {
  const copy = candidateStatusCopy(application, [], announcement);
  return (
    <Card className="brand-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-heading text-xl tracking-normal">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Penjelasan Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={application.status} size="md" />
          <span className="text-sm text-muted-foreground">
            Divisi: {formatDivision(application.division)}
          </span>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          {copy.description}
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-surface-container-low px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Tanggal Submit
            </p>
            <p className="mt-1 text-sm font-medium">
              {formatDateTime(application.submitted_at, "Belum submit")}
            </p>
          </div>
          <div className="rounded-xl bg-surface-container-low px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Status Saat Ini
            </p>
            <p className="mt-1 text-sm font-medium">{copy.statusLabel}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CorrectionDocumentsCard({ documents }) {
  const rejectedDocs = documents.filter(
    (document) => document.verification_status === "rejected"
  );
  if (!rejectedDocs.length) return null;

  return (
    <section className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-destructive">
          Revisi Dokumen
        </p>
        <h2 className="mt-1 font-heading text-xl font-bold tracking-normal">
          Dokumen yang Perlu Diganti
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {rejectedDocs.map((document) => {
          const requirement = REQUIRED_DOCUMENTS.find(
            (item) => item.doc_type === document.doc_type
          );
          return (
            <DocumentRequirementCard
              key={document.id || document.doc_type}
              documentType={document.doc_type}
              label={requirement?.label || document.doc_type}
              document={document}
              correctionMode
            />
          );
        })}
      </div>
      <Button asChild className="gap-2">
        <Link to="/documents">
          Perbaiki Dokumen
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </section>
  );
}

function AnnouncementResultCard({ application, announcement }) {
  if (!isAnnouncedStatus(application?.status)) return null;

  const passed = application.status === "announced_pass";
  return (
    <Card
      className={cx(
        "brand-card",
        passed ? "bg-success/10" : "bg-destructive/10"
      )}
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-heading text-xl tracking-normal">
          <Megaphone className={cx("h-5 w-5", passed ? "text-success" : "text-destructive")} />
          {passed ? "Hasil: Lolos" : "Hasil: Tidak Lolos"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
        <p>
          {passed
            ? "Selamat. Hasil seleksi sudah tersedia dan kamu dinyatakan lolos."
            : "Hasil seleksi sudah tersedia. Terima kasih sudah mengikuti proses rekrutasi."}
        </p>
        {announcement?.notes && (
          <p className="rounded-xl bg-card px-4 py-3 text-foreground">
            {announcement.notes}
          </p>
        )}
        {announcement?.announced_at && (
          <p className="text-xs">
            Diumumkan pada {formatDateTimeId(announcement.announced_at)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function ApplicationStatusPage() {
  const navigate = useNavigate();
  const [application, setApplication] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [announcement, setAnnouncement] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const app = await getMyApplication();
        if (cancelled) return;
        setApplication(app);

        try {
          const { documents: docs } = await listApplicationDocuments(app.id);
          if (!cancelled) setDocuments(docs || []);
        } catch (error) {
          toast.error(error.message || "Gagal memuat dokumen.");
        }

        try {
          const ann = await getMyAnnouncement();
          if (!cancelled) setAnnouncement(ann);
        } catch {
          if (!cancelled) setAnnouncement(null);
        }
      } catch (error) {
        if (!isNotFoundError(error)) {
          toast.error(error.message || "Gagal memuat status pendaftaran.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const action = useMemo(
    () => candidateNextAction(application, documents),
    [application, documents]
  );

  if (loading) {
    return <LoadingState label="Memuat status pendaftaran..." />;
  }

  const isDraft = application?.status === "draft";
  const announced = isAnnouncedStatus(application?.status);
  const target = nextApplicationTarget(application, documents);
  const completeness = documentCompleteness(documents);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pendaftaran / Status"
        title="Status Seleksi"
        description="Pantau proses setelah pendaftaran dikirim, termasuk revisi dokumen dan pengumuman akhir."
      />

      {!application ? (
        <EmptyState
          icon={Inbox}
          title="Belum ada pendaftaran"
          description="Halaman status akan aktif setelah kamu membuat draft pendaftaran."
          actionLabel="Mulai Pendaftaran"
          to="/application/start"
        />
      ) : isDraft ? (
        <>
          <CandidateStatusHero
            application={application}
            documents={documents}
            onPrimaryAction={() => navigate(target)}
            primaryActionLabel={
              completeness.complete
                ? "Tinjau & Kirim Pendaftaran"
                : "Lanjut Unggah Dokumen"
            }
          />
          <CandidateApplicationStepTrack
            currentStep={completeness.complete ? "review" : "documents"}
            application={application}
            documents={documents}
            title="Alur Pendaftaran"
          />
          <ApplicationProgressCard
            application={application}
            documents={documents}
            canManageDocuments
            actionLabel={
              completeness.complete
                ? "Tinjau & Kirim Pendaftaran"
                : "Lanjut Unggah Dokumen"
            }
            onAction={() => navigate(target)}
          />
        </>
      ) : (
        <>
          <CandidateStatusHero
            application={application}
            documents={documents}
            announcement={announcement}
            onPrimaryAction={() => navigate(action.to)}
            primaryActionLabel={action.label}
          />

          <CandidateApplicationStepTrack
            mode="status"
            application={application}
            documents={documents}
            title="Tahapan Seleksi"
          />

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_0.9fr]">
            <StatusExplanationCard
              application={application}
              announcement={announcement}
            />
            <ReferenceBlock application={application} />
          </div>

          {application.status === "correction_requested" && (
            <CorrectionDocumentsCard documents={documents} />
          )}

          <AnnouncementResultCard
            application={application}
            announcement={announcement}
          />

          {!announced && application.status !== "correction_requested" && (
            <Card className="brand-card">
              <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium text-foreground">
                      Tidak ada aksi tambahan saat ini
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Dokumen sudah terkunci. Kamu cukup memantau halaman ini
                      sampai fase berikutnya tersedia.
                    </p>
                  </div>
                </div>
                <Button asChild variant="outline">
                  <Link to="/dashboard">Kembali ke Dashboard</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
