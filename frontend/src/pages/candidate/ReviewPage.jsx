import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
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

import {
  getMe,
  getMyApplication,
  listApplicationDocuments,
  submitApplication,
} from "@/lib/api";

const DOC_LABELS = {
  cv: "Curriculum Vitae",
  motivation_letter: "Motivation Letter",
  khs: "KHS / Transcript",
  ktm: "KTM / Student ID",
  swot: "SWOT Analysis",
  supporting_docs: "Dokumen Pendukung",
};
const REQUIRED_TYPES = [
  "cv",
  "motivation_letter",
  "khs",
  "ktm",
  "swot",
  "supporting_docs",
];

function formatSize(bytes) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function ReviewPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [application, setApplication] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [ackAccurate, setAckAccurate] = useState(false);
  const [ackIrreversible, setAckIrreversible] = useState(false);
  const [ackAuthentic, setAckAuthentic] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [me, app] = await Promise.all([getMe(), getMyApplication()]);
        if (cancelled) return;
        setUser(me);
        setApplication(app);
        if (app.status !== "draft") {
          // Already submitted — bounce to the confirmation page.
          navigate("/submitted", { replace: true });
          return;
        }
        const { documents: docs } = await listApplicationDocuments(app.id);
        if (!cancelled) setDocuments(docs);
      } catch (err) {
        toast.error(err.message || "Failed to load review data");
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
  const docsByType = new Map(documents.map((d) => [d.doc_type, d]));
  const allDocsPresent = REQUIRED_TYPES.every((t) => docsByType.has(t));

  const handleSubmit = async () => {
    if (!allAcked || !allDocsPresent) return;
    setSubmitting(true);
    try {
      await submitApplication(application.id);
      toast.success("Application submitted!");
      navigate("/submitted", { replace: true });
    } catch (err) {
      toast.error(err.message || "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user || !application) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-primary" />
          Review & Submit
        </h1>
        <p className="text-muted-foreground mt-1">
          Confirm everything looks right. Submission is final.
        </p>
      </div>

      {/* Irreversible warning banner */}
      <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-5 py-4 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium text-amber-900 dark:text-amber-200">
            This action is irreversible.
          </p>
          <p className="text-sm text-amber-800 dark:text-amber-300/80">
            Once submitted, you cannot replace documents or change your chosen
            division. Your application will enter the AI screening queue
            immediately.
          </p>
        </div>
      </div>

      {/* Profile summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Profile Summary</CardTitle>
          <CardDescription>These details go into your application.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <Field label="Full name" value={user.full_name} />
          <Field label="NIM" value={user.nim} mono />
          <Field label="Email" value={user.email} />
          <Field label="Angkatan" value={user.year} />
          <Field label="Fakultas" value={user.faculty} />
          <Field label="Jurusan" value={user.major} />
          <Field
            label="Division applied to"
            value={(application.division || "").replace("_", " ")}
            emphasize
          />
          <Field label="Status" value={application.status} />
        </CardContent>
      </Card>

      {/* Documents list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Uploaded Documents</CardTitle>
          <CardDescription>
            Every required document must be present before submitting.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {REQUIRED_TYPES.map((type) => {
            const d = docsByType.get(type);
            return (
              <div
                key={type}
                className="py-3 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      d
                        ? "bg-emerald-500/15 text-emerald-700"
                        : "bg-destructive/15 text-destructive"
                    }`}
                  >
                    {d ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <AlertTriangle className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{DOC_LABELS[type]}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {d ? (
                        <>
                          {d.file_name} · {formatSize(d.file_size)}
                        </>
                      ) : (
                        "Missing — please upload on the Documents page"
                      )}
                    </p>
                  </div>
                </div>
                {d ? (
                  <Badge variant="secondary" className="gap-1 text-[10px] uppercase">
                    <FileText className="w-3 h-3" />
                    Uploaded
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="text-[10px] uppercase">
                    Missing
                  </Badge>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Confirmation checkboxes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Confirm & Submit</CardTitle>
          <CardDescription>
            Tick all three boxes to enable the submit button.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ConfirmRow
            checked={ackAccurate}
            onChange={setAckAccurate}
            label="Accurate information"
            hint="All personal data and documents are current and correct."
          />
          <ConfirmRow
            checked={ackAuthentic}
            onChange={setAckAuthentic}
            label="Authentic documents"
            hint="Every file belongs to me — no impersonation or fabricated evidence."
          />
          <ConfirmRow
            checked={ackIrreversible}
            onChange={setAckIrreversible}
            label="I understand this is final"
            hint="After submission I can no longer edit profile info or replace files."
          />

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => navigate("/documents")}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to documents
            </Button>

            <Button
              onClick={handleSubmit}
              disabled={!allAcked || !allDocsPresent || submitting}
              className="gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Submit final application
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, mono, emphasize }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
        {label}
      </p>
      <p
        className={`${mono ? "font-mono" : ""} ${
          emphasize ? "font-semibold capitalize" : ""
        }`}
      >
        {value || <span className="text-muted-foreground italic">—</span>}
      </p>
    </div>
  );
}

function ConfirmRow({ checked, onChange, label, hint }) {
  return (
    <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/30 transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 rounded border-input accent-primary"
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground mt-0.5">
          {hint}
        </span>
      </span>
    </label>
  );
}
