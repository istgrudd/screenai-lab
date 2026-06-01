import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  FileText,
  ShieldCheck,
} from "lucide-react";

import LoadingState from "@/components/common/LoadingState";
import PageHeader from "@/components/layout/PageHeader";
import ApplicationProgressCard from "@/components/candidate/ApplicationProgressCard";
import CandidateApplicationStepTrack from "@/components/candidate/CandidateApplicationStepTrack";
import DocumentRequirementCard from "@/components/candidate/DocumentRequirementCard";
import DocumentPreviewDialog from "@/components/DocumentPreviewDialog";
import DocumentUploadStep from "@/components/DocumentUploadStep";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getActivePeriod,
  getMyApplication,
  listApplicationDocuments,
  uploadApplicationDocument,
} from "@/lib/api";
import {
  REQUIRED_DOCUMENTS,
  documentCompleteness,
  isSubmissionPhase,
  submissionPhaseMessage,
} from "@/lib/candidateApplication";

export default function DocumentsPage() {
  const navigate = useNavigate();
  const [application, setApplication] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [limits, setLimits] = useState({});
  const [activePeriod, setActivePeriod] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [previewDoc, setPreviewDoc] = useState(null);
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
          const period = await getActivePeriod();
          if (!cancelled) setActivePeriod(period);
        } catch {
          if (!cancelled) setActivePeriod(null);
        }

        const { documents: docs, limits: lim } = await listApplicationDocuments(
          app.id
        );
        if (cancelled) return;
        setDocuments(docs || []);
        setLimits(lim || {});
      } catch (error) {
        if (error.message?.toLowerCase().includes("not found")) {
          toast.error("Mulai pendaftaran terlebih dahulu.");
          navigate("/application/start", { replace: true });
          return;
        }
        toast.error(error.message || "Gagal memuat dokumen.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const docsByType = useMemo(
    () => new Map(documents.map((document) => [document.doc_type, document])),
    [documents]
  );
  const uploadedTypes = useMemo(
    () => new Set(documents.map((document) => document.doc_type)),
    [documents]
  );
  const completeness = documentCompleteness(documents);
  const allComplete = REQUIRED_DOCUMENTS.every((step) =>
    uploadedTypes.has(step.doc_type)
  );
  const isDraft = application?.status === "draft";
  const isCorrection = application?.status === "correction_requested";
  const submissionOpen = isSubmissionPhase(activePeriod);
  const canManageDocuments = (isDraft && submissionOpen) || isCorrection;

  const currentStep = REQUIRED_DOCUMENTS[activeIndex];
  const currentDoc = docsByType.get(currentStep?.doc_type);
  const currentRejected = currentDoc?.verification_status === "rejected";
  const canEditCurrent = (isDraft && submissionOpen) || (isCorrection && currentRejected);
  const locked = !canEditCurrent;
  const currentLimit = limits[currentStep?.doc_type] || {
    max_bytes: 5 * 1024 * 1024,
    allowed_mime: ["application/pdf"],
  };

  const handleUpload = async (file) => {
    const result = await uploadApplicationDocument(currentStep.doc_type, file);
    setDocuments((prev) => {
      const filtered = prev.filter(
        (document) => document.doc_type !== result.doc_type
      );
      return [...filtered, result];
    });
  };

  const focusFirstMissing = () => {
    const index = REQUIRED_DOCUMENTS.findIndex(
      (item) => !uploadedTypes.has(item.doc_type)
    );
    if (index >= 0) setActiveIndex(index);
  };

  const lockedMessage = isCorrection
    ? currentRejected
      ? "Unggah file pengganti untuk dokumen yang ditolak."
      : "Hanya dokumen yang ditolak yang bisa diganti pada mode revisi."
    : isDraft && !submissionOpen
    ? submissionPhaseMessage(activePeriod)
    : "Dokumen terkunci setelah pendaftaran dikirim.";

  const cardLockedFor = (item) => {
    const doc = docsByType.get(item.doc_type);
    if (doc?.verification_status === "verified") return true;
    if (isCorrection) return doc?.verification_status !== "rejected";
    if (isDraft) return !submissionOpen;
    return true;
  };

  const handleProgressAction = () => {
    if (isDraft && allComplete) {
      navigate("/application/review");
      return;
    }
    if (isCorrection) {
      const index = REQUIRED_DOCUMENTS.findIndex(
        (item) => docsByType.get(item.doc_type)?.verification_status === "rejected"
      );
      if (index >= 0) setActiveIndex(index);
      return;
    }
    focusFirstMissing();
  };

  if (loading) {
    return <LoadingState label="Memuat dokumen pendaftaran..." />;
  }

  if (!application) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pendaftaran / Dokumen"
        title="Lengkapi Dokumen Pendaftaran"
        description="Unggah seluruh dokumen wajib. Validasi tipe dan ukuran file tetap mengikuti aturan server."
      />

      <CandidateApplicationStepTrack
        currentStep="documents"
        application={application}
        documents={documents}
        title="Alur Pendaftaran"
      />

      <ApplicationProgressCard
        application={application}
        documents={documents}
        activePeriod={activePeriod}
        canManageDocuments={canManageDocuments}
        actionLabel={
          isDraft && allComplete
            ? "Tinjau & Kirim Pendaftaran"
            : isCorrection
            ? "Fokus Dokumen Revisi"
            : "Lengkapi Dokumen"
        }
        onAction={handleProgressAction}
      />

      {isCorrection && (
        <Card className="brand-card bg-warning/10">
          <CardContent className="flex items-start gap-3 p-5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <p className="font-medium text-foreground">Dokumen perlu revisi</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Ganti hanya dokumen yang ditolak. Dokumen yang sudah
                terverifikasi tetap terkunci.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isDraft && !submissionOpen && (
        <Card className="brand-card bg-warning/10">
          <CardContent className="flex items-start gap-3 p-5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <p className="font-medium text-foreground">Upload belum tersedia</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {submissionPhaseMessage(activePeriod)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">
            Requirement Dokumen
          </p>
          <h2 className="mt-1 font-heading text-xl font-bold tracking-normal">
            {completeness.completed}/{completeness.total} dokumen tercatat
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {REQUIRED_DOCUMENTS.map((item, index) => {
            const doc = docsByType.get(item.doc_type);
            return (
              <DocumentRequirementCard
                key={item.doc_type}
                documentType={item.doc_type}
                label={item.label}
                document={doc}
                locked={cardLockedFor(item)}
                correctionMode={isCorrection}
                active={index === activeIndex}
                onUpload={() => setActiveIndex(index)}
                onPreview={doc ? setPreviewDoc : undefined}
              />
            );
          })}
        </div>
      </section>

      <Card className="brand-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-heading text-xl tracking-normal">
            <FileText className="h-5 w-5 text-primary" />
            {activeIndex + 1}. {currentStep.label}
          </CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            {canEditCurrent
              ? "Gunakan area unggah di bawah. Validasi file tetap dilakukan sebelum request dikirim."
              : "Dokumen ini tidak bisa diganti pada status atau fase saat ini."}
          </p>
        </CardHeader>
        <CardContent>
          <DocumentUploadStep
            doc={{
              label: currentStep.label,
              doc_type: currentStep.doc_type,
              tip: currentStep.tip,
              max_bytes: currentLimit.max_bytes,
              allowed_mime: currentLimit.allowed_mime,
            }}
            existing={currentDoc}
            locked={locked}
            lockedMessage={lockedMessage}
            onUpload={handleUpload}
          />
        </CardContent>
      </Card>

      <Card className="brand-card">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => setActiveIndex((index) => Math.max(0, index - 1))}
            disabled={activeIndex === 0}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Sebelumnya
          </Button>

          <div className="flex flex-col gap-2 sm:flex-row">
            {activeIndex < REQUIRED_DOCUMENTS.length - 1 ? (
              <Button
                type="button"
                onClick={() =>
                  setActiveIndex((index) =>
                    Math.min(REQUIRED_DOCUMENTS.length - 1, index + 1)
                  )
                }
                className="gap-2"
              >
                Langkah Berikutnya
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : isDraft ? (
              <Button
                type="button"
                onClick={() => navigate("/application/review")}
                disabled={!allComplete || !submissionOpen}
                className="gap-2"
              >
                <ShieldCheck className="h-4 w-4" />
                Tinjau & Kirim
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => navigate("/application/status")}
                className="gap-2"
              >
                <ShieldCheck className="h-4 w-4" />
                Lihat Status
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {isDraft && (!allComplete || !submissionOpen) && (
        <p className="text-center text-xs leading-5 text-muted-foreground">
          {!allComplete
            ? "Tombol review aktif setelah semua dokumen wajib diunggah."
            : submissionPhaseMessage(activePeriod)}
        </p>
      )}

      <DocumentPreviewDialog
        open={Boolean(previewDoc)}
        onClose={() => setPreviewDoc(null)}
        document={previewDoc}
      />
    </div>
  );
}
