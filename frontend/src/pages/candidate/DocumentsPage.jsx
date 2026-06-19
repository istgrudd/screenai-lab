import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  isNotFoundError,
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
  const uploadCardRef = useRef(null);

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
        if (isNotFoundError(error)) {
          toast.error("Start your application first.");
          navigate("/application/start", { replace: true });
          return;
        }
        toast.error(error.message || "Failed to load documents.");
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

  // Bring the upload area into view and move focus there so clicking a
  // requirement / "Complete documents" gives clear viewport feedback.
  const scrollToUpload = useCallback(() => {
    requestAnimationFrame(() => {
      const node = uploadCardRef.current;
      if (!node) return;
      node.scrollIntoView({ behavior: "smooth", block: "start" });
      const focusTarget = node.querySelector(
        "button:not([disabled]), a[href], input:not([disabled])"
      );
      focusTarget?.focus?.({ preventScroll: true });
    });
  }, []);

  const selectStep = useCallback(
    (index) => {
      if (index < 0) return;
      setActiveIndex(index);
      scrollToUpload();
    },
    [scrollToUpload]
  );

  const focusFirstMissing = useCallback(() => {
    const index = REQUIRED_DOCUMENTS.findIndex(
      (item) => !uploadedTypes.has(item.doc_type)
    );
    selectStep(index >= 0 ? index : 0);
  }, [selectStep, uploadedTypes]);

  const lockedMessage = isCorrection
    ? currentRejected
      ? "Upload a replacement file for the rejected document."
      : "Only rejected documents can be replaced in revision mode."
    : isDraft && !submissionOpen
    ? submissionPhaseMessage(activePeriod)
    : "Documents are locked after the application is submitted.";

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
      selectStep(index >= 0 ? index : 0);
      return;
    }
    focusFirstMissing();
  };

  if (loading) {
    return <LoadingState label="Loading application documents..." />;
  }

  if (!application) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Application / Documents"
        title="Complete Your Documents"
        description="Upload every required document. File type and size are still validated by the server."
      />

      <CandidateApplicationStepTrack
        currentStep="documents"
        application={application}
        documents={documents}
        title="Application Flow"
      />

      <ApplicationProgressCard
        application={application}
        documents={documents}
        activePeriod={activePeriod}
        canManageDocuments={canManageDocuments}
        actionLabel={
          isDraft && allComplete
            ? "Review & Submit"
            : isCorrection
            ? "Fix Flagged Documents"
            : "Complete Documents"
        }
        onAction={handleProgressAction}
      />

      {isCorrection && (
        <Card className="brand-card bg-warning/10">
          <CardContent className="flex items-start gap-3 p-5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <p className="font-medium text-foreground">Documents need revision</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Replace only the rejected documents. Documents that are already
                verified stay locked.
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
              <p className="font-medium text-foreground">Upload not available yet</p>
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
            Document Requirements
          </p>
          <h2 className="mt-1 font-heading text-xl font-bold tracking-normal">
            {completeness.completed}/{completeness.total} documents recorded
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
                onUpload={() => selectStep(index)}
                onPreview={doc ? setPreviewDoc : undefined}
              />
            );
          })}
        </div>
      </section>

      <Card ref={uploadCardRef} className="brand-card scroll-mt-24">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-heading text-xl tracking-normal">
            <FileText className="h-5 w-5 text-primary" />
            {activeIndex + 1}. {currentStep.label}
          </CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            {canEditCurrent
              ? "Use the upload area below. Files are validated before the request is sent."
              : "This document can't be changed in the current status or phase."}
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
            Previous
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
                Next Step
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
                Review & Submit
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => navigate("/application/status")}
                className="gap-2"
              >
                <ShieldCheck className="h-4 w-4" />
                View Status
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {isDraft && (!allComplete || !submissionOpen) && (
        <p className="text-center text-xs leading-5 text-muted-foreground">
          {!allComplete
            ? "The review button activates once all required documents are uploaded."
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
