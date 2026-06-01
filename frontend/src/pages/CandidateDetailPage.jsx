import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Loader2,
  User,
  FileText,
  Pencil,
  ShieldCheck,
  AlertTriangle,
  Eye,
  EyeOff,
  Languages,
  ClipboardList,
  CheckCircle2,
  XCircle,
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
  verifyDocument,
} from "@/lib/api";
import OverrideDialog from "@/components/OverrideDialog";
import JustificationCard from "@/components/JustificationCard";
import DocumentPreviewDialog from "@/components/DocumentPreviewDialog";
import SwotHighlightPanel from "@/components/SwotHighlightPanel";
import { defaultPathForRole, getCurrentUser } from "@/lib/auth";

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
  const [identityRevealed, setIdentityRevealed] = useState(false);
  const [appDocuments, setAppDocuments] = useState([]);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [verifyingDocId, setVerifyingDocId] = useState(null);

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
        `Dokumen Pendukung marked as ${updated.is_verified ? "verified" : "not verified"}.`
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
        <ContextBackButton fallback={fallbackPath} fallbackLabel="Kembali" className="mt-4 gap-2" />
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
        <ContextBackButton fallback={fallbackPath} fallbackLabel="Kembali" className="gap-2" />
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

      {/* Phase-1 application documents */}
      <ApplicationDocumentsCard
        application={candidate.application}
        documents={appDocuments}
        onPreview={setPreviewDoc}
        onVerifyToggle={handleVerify}
        verifyingDocId={verifyingDocId}
      />

      {/* SWOT highlight (read-only, not AI-scored) */}
      {candidate.application?.id && (
        <SwotHighlightPanel applicationId={candidate.application.id} />
      )}

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

      {/* Reveal Identity — only shown after scoring */}
      {hasScores && (
        <Card className={identityRevealed ? "border-amber-400/50 bg-amber-50/30 dark:bg-amber-950/10" : ""}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                {identityRevealed ? (
                  <Eye className="w-4 h-4 text-amber-600" />
                ) : (
                  <EyeOff className="w-4 h-4" />
                )}
                Candidate Identity
              </CardTitle>
              <Button
                variant={identityRevealed ? "outline" : "secondary"}
                size="sm"
                onClick={() => setIdentityRevealed((v) => !v)}
              >
                {identityRevealed ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5 mr-1.5" />
                    Hide Identity
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5 mr-1.5" />
                    Reveal Identity
                  </>
                )}
              </Button>
            </div>
            {!identityRevealed && (
              <p className="text-xs text-muted-foreground mt-1">
                Identity is hidden during blind screening. Reveal only after evaluation is complete.
              </p>
            )}
          </CardHeader>
          {identityRevealed && (() => {
            // Gather entities from all documents
            const allEntities = (candidate.documents || []).flatMap(
              (doc) => doc.entities || []
            );
            // Group by label for display
            const grouped = allEntities.reduce((acc, e) => {
              const key = e.label || "OTHER";
              if (!acc[key]) acc[key] = [];
              if (!acc[key].includes(e.text)) acc[key].push(e.text);
              return acc;
            }, {});
            const labelOrder = ["PERSON", "ORG", "LOC", "PHONE", "EMAIL", "URL", "NIK"];
            const sortedKeys = [
              ...labelOrder.filter((k) => grouped[k]),
              ...Object.keys(grouped).filter((k) => !labelOrder.includes(k)),
            ];
            const labelColor = {
              PERSON: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
              ORG: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
              LOC: "bg-green-500/15 text-green-700 dark:text-green-400",
              PHONE: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
              EMAIL: "bg-pink-500/15 text-pink-700 dark:text-pink-400",
              URL: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400",
              NIK: "bg-red-500/15 text-red-700 dark:text-red-400",
            };

            if (allEntities.length === 0) {
              return (
                <CardContent className="pt-0 pb-4">
                  <p className="text-sm text-muted-foreground italic">
                    No identity entities were detected during anonymization.
                  </p>
                </CardContent>
              );
            }

            return (
              <CardContent className="pt-0 pb-4 space-y-3">
                <div className="rounded-lg border border-amber-300/50 bg-amber-50/50 dark:bg-amber-900/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  This information was masked during evaluation to ensure unbiased screening.
                </div>
                {sortedKeys.map((label) => (
                  <div key={label} className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {label}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {grouped[label].map((text, i) => (
                        <span
                          key={i}
                          className={`inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium ${
                            labelColor[label] || "bg-muted text-foreground"
                          }`}
                        >
                          {text}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            );
          })()}
        </Card>
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
  supporting_docs: "Dokumen Pendukung",
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
