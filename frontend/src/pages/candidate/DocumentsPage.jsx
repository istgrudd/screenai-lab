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
  Save,
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

// Step order follows PRD Section 4 / F-26: CV → Motivation Letter → KHS
// → KTM → SWOT → Dokumen Pendukung.
const STEPS = [
  {
    doc_type: "cv",
    label: "Curriculum Vitae",
    short: "CV",
    tip: "Up-to-date CV highlighting projects, achievements, and skills relevant to your chosen division.",
  },
  {
    doc_type: "motivation_letter",
    label: "Motivation Letter",
    short: "Motivation",
    tip: "Explain why you want to join this division and how your interests align with its research focus.",
  },
  {
    doc_type: "khs",
    label: "KHS / Transcript",
    short: "KHS",
    tip: "Most recent official transcript (KHS) from iGracias. Make sure IPK and semester breakdown are visible.",
  },
  {
    doc_type: "ktm",
    label: "KTM / Student ID",
    short: "KTM",
    tip: "Scan or photo of your active KTM showing your NIM and program clearly.",
  },
  {
    doc_type: "swot",
    label: "SWOT Analysis",
    short: "SWOT",
    tip: "A one-page self-assessment: Strengths, Weaknesses, Opportunities, Threats. Used qualitatively by recruiters.",
  },
  {
    doc_type: "supporting_docs",
    label: "Dokumen Pendukung",
    short: "Pendukung",
    tip: "A single PDF bundle: proof of following social media, broadcast shares, and other supporting evidence.",
  },
];

function StepTracker({ steps, activeIndex, uploadedTypes }) {
  const completed = steps.filter((s) => uploadedTypes.has(s.doc_type)).length;
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
        {steps.map((s, i) => {
          const done = uploadedTypes.has(s.doc_type);
          const active = i === activeIndex;
          return (
            <div
              key={s.doc_type}
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
                {i + 1}. {s.short}
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
      } catch (err) {
        if (err.message?.toLowerCase().includes("not found")) {
          toast.error("Please choose a division on your profile first.");
          navigate("/profile", { replace: true });
          return;
        }
        toast.error(err.message || "Failed to load documents");
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
    () => new Set(documents.map((d) => d.doc_type)),
    [documents]
  );
  const allComplete = STEPS.every((s) => uploadedTypes.has(s.doc_type));
  const locked = application && application.status !== "draft";

  const currentStep = STEPS[activeIndex];
  const currentDoc = documents.find((d) => d.doc_type === currentStep?.doc_type);
  const currentLimit = limits[currentStep?.doc_type] || {
    max_bytes: 5 * 1024 * 1024,
    allowed_mime: ["application/pdf"],
  };

  const handleUpload = async (file) => {
    const result = await uploadApplicationDocument(currentStep.doc_type, file);
    setDocuments((prev) => {
      const filtered = prev.filter((d) => d.doc_type !== result.doc_type);
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
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-primary" />
            Upload Documents
          </h1>
          <p className="text-muted-foreground mt-1">
            Submit all six required documents. You can save progress and come
            back later — nothing is final until you review and submit.
          </p>
        </div>
        <Badge variant="outline" className="uppercase">
          Division: {application.division.replace("_", " ")}
        </Badge>
      </div>

      {/* Tracker */}
      <Card>
        <CardContent className="py-5">
          <StepTracker
            steps={STEPS}
            activeIndex={activeIndex}
            uploadedTypes={uploadedTypes}
          />
        </CardContent>
      </Card>

      {/* Current step */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">
            {activeIndex + 1}. {currentStep.label}
          </CardTitle>
          <CardDescription>
            {locked
              ? "Your application has been submitted — documents are locked."
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

      {/* Navigation footer */}
      <Card>
        <CardContent className="py-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
            disabled={activeIndex === 0}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                toast.success("Progress saved — your documents stay until you submit.");
              }}
              className="gap-2"
            >
              <Save className="w-4 h-4" />
              Save as Draft
            </Button>

            {activeIndex < STEPS.length - 1 ? (
              <Button
                onClick={() => setActiveIndex((i) => Math.min(STEPS.length - 1, i + 1))}
                className="gap-2"
              >
                Next Step
                <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                onClick={() => navigate("/review")}
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

      {!allComplete && activeIndex === STEPS.length - 1 && (
        <p className="text-xs text-muted-foreground text-center">
          Upload every document before moving to the review page.
        </p>
      )}
    </div>
  );
}
