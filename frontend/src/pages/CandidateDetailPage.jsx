import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Loader2,
  User,
  FileText,
  ShieldCheck,
  AlertTriangle,
  Eye,
  Languages,
  ClipboardList,
  CheckCircle2,
  XCircle,
  MessageCircleWarning,
} from "lucide-react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import ContextBackButton from "@/components/recruiter/ContextBackButton";
import {
  getCandidate,
  listApplicationDocuments,
  overrideScore as apiOverrideScore,
  updateCandidateAiValidation,
  verifyDocument,
} from "@/lib/api";
import OverrideDialog from "@/components/OverrideDialog";
import JustificationCard from "@/components/JustificationCard";
import DocumentPreviewDialog from "@/components/DocumentPreviewDialog";
import AiValidationBadge from "@/components/common/AiValidationBadge";
import AiValidationDialog from "@/components/AiValidationDialog";
import { defaultPathForRole, getCurrentUser } from "@/lib/auth";
import { formatIpk } from "@/lib/candidateApplication";

const CHART_COLORS = [
  "hsl(210, 80%, 55%)",
  "hsl(150, 70%, 45%)",
  "hsl(35, 90%, 55%)",
  "hsl(280, 60%, 55%)",
  "hsl(0, 70%, 55%)",
  "hsl(180, 60%, 45%)",
];

function getScoreColor(score) {
  if (score >= 75) return "text-green-600";
  if (score >= 50) return "text-yellow-600";
  if (score >= 25) return "text-orange-600";
  return "text-red-600";
}

const CEFR_COLORS = {
  A1: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  A2: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  B1: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  B2: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  C1: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
};

function LanguageCertificateCard({ candidate }) {
  const cert = candidate.language_certificate;
  const hasCert = cert && cert.raw_score != null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Languages className="w-4 h-4" /> Language Certificate
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasCert ? (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">
                {cert.certificate_type || "Certificate"}
              </span>
              <span className="text-xl font-bold tabular-nums">
                {cert.raw_score}
              </span>
              <span className="text-muted-foreground">·</span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${
                  CEFR_COLORS[cert.cefr_level] || "bg-muted"
                }`}
              >
                {cert.cefr_level || "—"}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-sm font-semibold text-green-600 tabular-nums">
                +{Number(cert.bonus || 0).toFixed(0)} pts bonus
              </span>
            </div>
            {cert.filename && (
              <span className="text-xs text-muted-foreground truncate max-w-xs">
                {cert.filename}
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No language certificate uploaded
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function formatDivisionLabel(division) {
  if (!division) return "-";
  return String(division).replace(/_/g, " ");
}

function CandidateProfileCard({ candidate }) {
  const profile = candidate.user_profile || {};
  const application = candidate.application || {};

  const items = [
    ["Full Name", profile.full_name],
    ["Email", profile.email],
    ["WhatsApp", profile.whatsapp],
    ["NIM", profile.nim, "font-mono"],
    ["Faculty", profile.faculty],
    ["Major", profile.major],
    ["Year", profile.year],
    ["IPK", formatIpk(profile.ipk)],
    ["Division", formatDivisionLabel(application.division)],
    ["Application Status", application.status],
    ["Submitted At", formatDateTime(application.submitted_at)],
    ["Anonymous ID", candidate.anonymous_id, "font-mono"],
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <User className="w-4 h-4" /> Candidate Profile
        </CardTitle>
        <CardDescription>
          Candidate identity is visible to recruiters for verification and
          decision-making. Personal identifiers are excluded from AI evaluation
          input.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {items.map(([label, value, className]) => (
            <div key={label}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
              <p className={`mt-1 break-words ${className || ""}`}>
                {value || value === 0 ? value : "-"}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AiValidationCard({ validation, onValidate, onNeedsDiscussion }) {
  const status = validation?.status || "pending";
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> AI Evaluation Validation
            </CardTitle>
            <CardDescription>
              Internal checkpoint that a recruiter has reviewed the AI
              evaluation result. It does not change the score and is not a
              requirement for announcement.
            </CardDescription>
          </div>
          <AiValidationBadge status={status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Validated By
            </p>
            <p className="mt-1">{validation?.validated_by || "-"}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Validation Time
            </p>
            <p className="mt-1">{formatDateTime(validation?.validated_at)}</p>
          </div>
          <div className="sm:col-span-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Validation Note
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words">
              {validation?.note || "-"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onValidate} className="gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Mark as Validated
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onNeedsDiscussion}
            className="gap-2"
          >
            <MessageCircleWarning className="w-4 h-4" />
            Needs Discussion
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          The validation note is separate from the score override reason.
          Overriding a score does not automatically mark the result as
          validated.
        </p>
      </CardContent>
    </Card>
  );
}

export default function CandidateDetailPage() {
  const { id } = useParams();
  const currentUser = getCurrentUser();
  const fallbackPath =
    currentUser?.role === "recruiter" || currentUser?.role === "super_admin"
      ? "/recruiter/candidates"
      : defaultPathForRole(currentUser?.role);
  const [candidate, setCandidate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [overrideTarget, setOverrideTarget] = useState(null);
  const [appDocuments, setAppDocuments] = useState([]);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [verifyingDocId, setVerifyingDocId] = useState(null);
  const [validationDialogMode, setValidationDialogMode] = useState(null);

  const fetchCandidate = async () => {
    setLoading(true);
    try {
      const data = await getCandidate(id);
      setCandidate(data);
      if (data.application?.id) {
        try {
          const { documents } = await listApplicationDocuments(data.application.id);
          setAppDocuments(documents);
        } catch (err) {
          console.warn("Could not load application documents:", err.message);
          setAppDocuments([]);
        }
      } else {
        setAppDocuments([]);
      }
    } catch (err) {
      toast.error(`Failed to load candidate: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (docId, next) => {
    setVerifyingDocId(docId);
    try {
      const updated = await verifyDocument(docId, next);
      setAppDocuments((prev) =>
        prev.map((d) => (d.id === docId ? { ...d, is_verified: updated.is_verified } : d))
      );
      toast.success(
        `Supporting document marked as ${updated.is_verified ? "verified" : "not verified"}.`
      );
    } catch (err) {
      toast.error(`Verification failed: ${err.message}`);
    } finally {
      setVerifyingDocId(null);
    }
  };

  useEffect(() => {
    Promise.resolve().then(fetchCandidate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleOverride = async (score, reason) => {
    if (!overrideTarget) return;
    try {
      await apiOverrideScore(
        candidate.candidate_id,
        overrideTarget.id,
        score,
        reason
      );
      toast.success("Score overridden successfully.");
      setOverrideTarget(null);
      fetchCandidate();
    } catch (err) {
      toast.error(`Override failed: ${err.message}`);
    }
  };

  const handleAiValidation = async (note) => {
    if (!validationDialogMode) return;
    try {
      await updateCandidateAiValidation(candidate.candidate_id, {
        status: validationDialogMode,
        note: note || null,
      });
      toast.success(
        validationDialogMode === "needs_discussion"
          ? "Marked as needs discussion."
          : "AI evaluation validation saved."
      );
      setValidationDialogMode(null);
      fetchCandidate();
    } catch (err) {
      toast.error(`Failed to save validation: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="text-center py-24">
        <AlertTriangle className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
        <p className="text-sm text-muted-foreground">Candidate not found.</p>
        <ContextBackButton fallback={fallbackPath} fallbackLabel="Back" className="mt-4 gap-2" />
      </div>
    );
  }

  const scores = candidate.dimension_scores || [];
  const hasScores = scores.length > 0;

  const radarData = scores.map((s) => ({
    dimension: s.dimension_name,
    score: s.score,
    fullMark: 100,
  }));

  const barData = scores.map((s, i) => ({
    name: s.dimension_name,
    score: s.score,
    weight: Math.round(s.weight * 100),
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <ContextBackButton fallback={fallbackPath} fallbackLabel="Back" className="gap-2" />
        <Separator orientation="vertical" className="h-6" />
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight font-mono">
              {candidate.anonymous_id}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge
                variant={candidate.status === "scored" ? "default" : "secondary"}
                className="text-xs"
              >
                {candidate.status}
              </Badge>
              {candidate.composite_score != null && (
                <span className={`text-sm font-bold tabular-nums ${getScoreColor(candidate.composite_score)}`}>
                  {candidate.composite_score.toFixed(1)} / 100
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Candidate profile — visible to recruiters for verification */}
      <CandidateProfileCard candidate={candidate} />

      {/* Phase-1 application documents */}
      <ApplicationDocumentsCard
        application={candidate.application}
        documents={appDocuments}
        onPreview={setPreviewDoc}
        onVerifyToggle={handleVerify}
        verifyingDocId={verifyingDocId}
      />

      {/* Language certificate (Capstone) */}
      <LanguageCertificateCard candidate={candidate} />

      {/* Profile summary */}
      {candidate.profile_summary && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" /> Profile Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {candidate.profile_summary}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      {hasScores && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Radar Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Competency Radar</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis
                    dataKey="dimension"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 100]}
                    tick={{ fontSize: 10 }}
                  />
                  <Radar
                    dataKey="score"
                    stroke="hsl(210, 80%, 55%)"
                    fill="hsl(210, 80%, 55%)"
                    fillOpacity={0.2}
                    strokeWidth={2}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Bar Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Score Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={barData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={100}
                    tick={{ fontSize: 11 }}
                  />
                  <RTooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(value) => [`${value.toFixed(1)}`, "Score"]}
                  />
                  <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={20}>
                    {barData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Justification cards */}
      {hasScores && (
        <div>
          <h2 className="text-lg font-semibold mb-4">
            Dimension Scores & Justifications
          </h2>
          <div className="grid gap-4">
            {scores.map((s, i) => (
              <JustificationCard
                key={s.id || i}
                dimScore={s}
                color={CHART_COLORS[i % CHART_COLORS.length]}
                onOverride={() => setOverrideTarget(s)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recruiter validation of the AI evaluation (informative marker) */}
      {hasScores && (
        <AiValidationCard
          validation={candidate.ai_validation}
          onValidate={() => setValidationDialogMode("validated")}
          onNeedsDiscussion={() => setValidationDialogMode("needs_discussion")}
        />
      )}

      {/* Documents info */}
      {candidate.documents && candidate.documents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {candidate.documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{doc.filename}</span>
                  <Badge variant="outline" className="text-xs capitalize">
                    {doc.document_type}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {doc.page_count} page(s) · {doc.file_size_kb?.toFixed(1)} KB
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* No scores state */}
      {!hasScores && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <ShieldCheck className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-sm font-medium mb-1">Not yet evaluated</p>
            <p className="text-sm text-muted-foreground">
              Run an evaluation from the Dashboard to score this candidate.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Override dialog */}
      <OverrideDialog
        open={!!overrideTarget}
        onOpenChange={(open) => !open && setOverrideTarget(null)}
        dimScore={overrideTarget}
        onSubmit={handleOverride}
      />

      {/* Document preview dialog (Blob-based fetch, auth header attached) */}
      <DocumentPreviewDialog
        open={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        document={previewDoc}
      />

      {/* AI evaluation validation dialog */}
      <AiValidationDialog
        open={!!validationDialogMode}
        mode={validationDialogMode}
        onOpenChange={(open) => !open && setValidationDialogMode(null)}
        onSubmit={handleAiValidation}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Application Documents card
// ---------------------------------------------------------------------------

const APP_DOC_LABELS = {
  cv: "Curriculum Vitae",
  motivation_letter: "Motivation Letter",
  khs: "KHS / Transcript",
  ktm: "KTM / Student ID",
  swot: "SWOT Analysis",
  supporting_docs: "Supporting Documents",
};
const APP_DOC_ORDER = [
  "cv",
  "motivation_letter",
  "khs",
  "ktm",
  "swot",
  "supporting_docs",
];

function ApplicationDocumentsCard({
  application,
  documents,
  onPreview,
  onVerifyToggle,
  verifyingDocId,
}) {
  const byType = new Map(documents.map((d) => [d.doc_type, d]));
  const uploadedCount = documents.length;
  const pct = Math.round((uploadedCount / APP_DOC_ORDER.length) * 100);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="w-4 h-4" />
              Application Documents
            </CardTitle>
            <CardDescription>
              {application
                ? `The six documents uploaded by the candidate (${uploadedCount}/${APP_DOC_ORDER.length}, ${pct}%).`
                : "This candidate has no associated Phase-1 application yet."}
            </CardDescription>
          </div>
          {application && (
            <Badge variant="outline" className="capitalize">
              {application.division?.replace("_", " ")} · {application.status}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="divide-y">
        {!application && (
          <p className="text-sm text-muted-foreground py-4">
            Candidate wasn't uploaded via the candidate portal — no application
            document list available.
          </p>
        )}
        {application &&
          APP_DOC_ORDER.map((type) => {
            const doc = byType.get(type);
            const isSupporting = type === "supporting_docs";
            return (
              <div
                key={type}
                className="py-3 flex items-center justify-between gap-3 flex-wrap"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      doc
                        ? "bg-emerald-500/15 text-emerald-700"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {doc ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <XCircle className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {APP_DOC_LABELS[type]}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {doc
                        ? `${doc.file_name} · ${(doc.file_size / 1024).toFixed(1)} KB`
                        : "Missing"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isSupporting && doc && (
                    <label className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs cursor-pointer hover:bg-muted/40">
                      <input
                        type="checkbox"
                        checked={Boolean(doc.is_verified)}
                        disabled={verifyingDocId === doc.id}
                        onChange={(e) => onVerifyToggle(doc.id, e.target.checked)}
                        className="h-3.5 w-3.5 accent-primary"
                      />
                      Verified
                    </label>
                  )}
                  {doc ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onPreview(doc)}
                      className="gap-2"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Preview
                    </Button>
                  ) : (
                    <Badge variant="destructive" className="text-[10px] uppercase">
                      Missing
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}
