import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileText,
  Loader2,
  ShieldCheck,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

import DocumentUploadStep from "@/components/DocumentUploadStep";
import {
  getActivePeriod,
  getMyApplication,
  listApplicationDocuments,
  uploadApplicationDocument,
} from "@/lib/api";
import {
  formatStatus,
  isSubmissionPhase,
  REQUIRED_DOCUMENTS,
  submissionPhaseMessage,
} from "@/lib/candidateApplication";

function StepTracker({ steps, activeIndex, uploadedTypes }) {
  const completed = steps.filter((step) => uploadedTypes.has(step.doc_type)).length;
  const pct = Math.round((completed / steps.length) * 100);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">
            Step {activeIndex + 1} of {steps.length}
          </p>
          <p className="text-xs text-muted-foreground">
            {completed}/{steps.length} documents uploaded
          </p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <FileText className="w-3 h-3" />
          {pct}%
        </Badge>
      </div>
      <Progress value={pct} />
      <div className="hidden md:grid grid-cols-6 gap-2">
        {steps.map((step, index) => {
          const done = uploadedTypes.has(step.doc_type);
          const active = index === activeIndex;
          return (
            <div
              key={step.doc_type}
              className={`rounded-lg border px-2 py-2 text-xs text-center ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : done
                  ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
                  : "bg-muted/40 text-muted-foreground"
              }`}
            >
              <div className="flex items-center justify-center gap-1 font-medium">
                {done && !active && <CheckCircle2 className="w-3 h-3" />}
                {index + 1}. {step.short}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReviewStatusPanel({ documents }) {
  const docsByType = new Map(documents.map((document) => [document.doc_type, document]));
  const hasReviewState = documents.some((document) => document.verification_status);
  if (!hasReviewState) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Document Review Status</CardTitle>
        <CardDescription>
          Rejected documents show the reason from the recruitment team.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {REQUIRED_DOCUMENTS.map((item) => {
          const doc = docsByType.get(item.doc_type);
          const status = doc?.verification_status || "pending";
          const rejected = status === "rejected";
          const verified = status === "verified";
          return (
            <div
              key={item.doc_type}
              className={`rounded-lg border px-3 py-3 ${
                rejected ? "border-destructive/40 bg-destructive/5" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{item.label}</p>
                <Badge
                  variant={rejected ? "destructive" : verified ? "secondary" : "outline"}
                  className="text-[10px] uppercase"
                >
                  {formatStatus(status)}
                </Badge>
              </div>
              {rejected && doc?.rejection_reason && (
                <p className="text-xs text-destructive mt-2">
                  {doc.rejection_reason}
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default function DocumentsPage() {
  const navigate = useNavigate();
  const [application, setApplication] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [limits, setLimits] = useState({});
  const [activePeriod, setActivePeriod] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
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
        setDocuments(docs);
        setLimits(lim);
      } catch (error) {
        if (error.message?.toLowerCase().includes("not found")) {
          toast.error("Please start an application first.");
          navigate("/application/start", { replace: true });
          return;
        }
        toast.error(error.message || "Failed to load documents");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const uploadedTypes = useMemo(
    () => new Set(documents.map((document) => document.doc_type)),
    [documents]
  );
  const allComplete = REQUIRED_DOCUMENTS.every((step) =>
    uploadedTypes.has(step.doc_type)
  );
  const isDraft = application?.status === "draft";
  const isCorrection = application?.status === "correction_requested";
  const submissionOpen = isSubmissionPhase(activePeriod);

  const currentStep = REQUIRED_DOCUMENTS[activeIndex];
  const currentDoc = documents.find(
    (document) => document.doc_type === currentStep?.doc_type
  );
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

  const lockedMessage = isCorrection
    ? currentRejected
      ? "Upload a replacement for this rejected document."
      : "Only rejected documents can be replaced during correction."
    : isDraft && !submissionOpen
    ? submissionPhaseMessage(activePeriod)
    : "Documents are locked after final submit.";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!application) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-primary" />
            Upload Documents
          </h1>
          <p className="text-muted-foreground mt-1">
            Submit all six required documents. You can save progress and come
            back later. Nothing is final until you review and submit.
          </p>
        </div>
        <Badge variant="outline" className="uppercase">
          Division: {application.division.replace("_", " ")}
        </Badge>
      </div>

      <Card>
        <CardContent className="py-5">
          <StepTracker
            steps={REQUIRED_DOCUMENTS}
            activeIndex={activeIndex}
            uploadedTypes={uploadedTypes}
          />
        </CardContent>
      </Card>

      {isCorrection && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Correction requested</p>
              <p className="text-sm text-muted-foreground mt-1">
                Replace only the rejected document(s). Verified documents remain locked.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isDraft && !submissionOpen && (
        <Card className="border-amber-500/40 bg-amber-500/10">
          <CardContent className="py-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Upload dokumen belum tersedia</p>
              <p className="text-sm text-muted-foreground mt-1">
                {submissionPhaseMessage(activePeriod)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {application.status !== "draft" && (
        <ReviewStatusPanel documents={documents} />
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">
            {activeIndex + 1}. {currentStep.label}
          </CardTitle>
          <CardDescription>
            {canEditCurrent
              ? "Drop the file here or click to browse. We re-validate on the server."
              : "This document is locked in the current review state."}
          </CardDescription>
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

      <Card>
        <CardContent className="py-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={() => setActiveIndex((index) => Math.max(0, index - 1))}
            disabled={activeIndex === 0}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>

          <div className="flex items-center gap-2">
            {activeIndex < REQUIRED_DOCUMENTS.length - 1 ? (
              <Button
                onClick={() =>
                  setActiveIndex((index) =>
                    Math.min(REQUIRED_DOCUMENTS.length - 1, index + 1)
                  )
                }
                className="gap-2"
              >
                Next Step
                <ArrowRight className="w-4 h-4" />
              </Button>
            ) : locked ? (
              <Button
                onClick={() => navigate("/application/status")}
                className="gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                View Status
              </Button>
            ) : (
              <Button
                onClick={() => navigate("/application/review")}
                disabled={!allComplete}
                className="gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                Review & Submit
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {!allComplete && activeIndex === REQUIRED_DOCUMENTS.length - 1 && (
        <p className="text-xs text-muted-foreground text-center">
          Upload every document before moving to the review page.
        </p>
      )}
    </div>
  );
}
