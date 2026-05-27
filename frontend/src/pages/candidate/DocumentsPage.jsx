import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
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
  getMyApplication,
  listApplicationDocuments,
  uploadApplicationDocument,
} from "@/lib/api";
import { REQUIRED_DOCUMENTS } from "@/lib/candidateApplication";

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

export default function DocumentsPage() {
  const navigate = useNavigate();
  const [application, setApplication] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [limits, setLimits] = useState({});
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
  const locked = application && application.status !== "draft";

  const currentStep = REQUIRED_DOCUMENTS[activeIndex];
  const currentDoc = documents.find(
    (document) => document.doc_type === currentStep?.doc_type
  );
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">
            {activeIndex + 1}. {currentStep.label}
          </CardTitle>
          <CardDescription>
            {locked
              ? "Your application has been submitted. Documents are locked."
              : "Drop the file here or click to browse. We re-validate on the server."}
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
