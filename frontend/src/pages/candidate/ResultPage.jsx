import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Award,
  BarChart3,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

import RecruitmentJourney from "@/components/RecruitmentJourney";
import {
  getMe,
  getMyApplication,
  getMyAnnouncement,
  getEvaluationResult,
} from "@/lib/api";

function AnnouncementBanner({ announcement }) {
  if (!announcement || !announcement.result) return null;

  const isPass = announcement.result === "pass";

  return (
    <div
      className={`rounded-xl border-2 p-6 mb-6 ${
        isPass
          ? "bg-emerald-500/10 border-emerald-500/30"
          : "bg-destructive/10 border-destructive/30"
      }`}
    >
      <div className="flex items-center gap-4">
        <div
          className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
            isPass
              ? "bg-emerald-500/20 text-emerald-600"
              : "bg-destructive/20 text-destructive"
          }`}
        >
          {isPass ? (
            <CheckCircle2 className="w-8 h-8" />
          ) : (
            <XCircle className="w-8 h-8" />
          )}
        </div>
        <div>
          <h2
            className={`text-2xl font-bold ${
              isPass ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"
            }`}
          >
            {isPass ? "LOLOS" : "TIDAK LOLOS"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isPass
              ? "Selamat! Kamu lolos seleksi administrasi. Pantau informasi tahap selanjutnya."
              : "Terima kasih telah mendaftar. Kamu belum lolos seleksi administrasi."}
          </p>
          {announcement.notes && (
            <p className="text-sm mt-2 italic text-muted-foreground">
              Catatan: {announcement.notes}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function WarningBanner({ icon: Icon, message, variant = "amber" }) {
  if (!message) return null;
  const colors =
    variant === "amber"
      ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400"
      : "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400";
  return (
    <div className={`rounded-lg border px-4 py-3 flex items-center gap-3 ${colors}`}>
      <Icon className="w-5 h-5 shrink-0" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

function DimensionScoreBar({ dimension, score, weight, justification }) {
  const percentage = Math.min(100, Math.max(0, score));
  const barColor =
    percentage >= 80
      ? "bg-emerald-500"
      : percentage >= 60
      ? "bg-blue-500"
      : percentage >= 40
      ? "bg-amber-500"
      : "bg-red-500";

  return (
    <div className="space-y-2 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <BarChart3 className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">{dimension}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="secondary" className="text-xs tabular-nums">
            {weight ? `${(weight * 100).toFixed(0)}%` : "—"}
          </Badge>
          <span className="text-sm font-semibold tabular-nums w-12 text-right">
            {score.toFixed(1)}
          </span>
        </div>
      </div>
      <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {justification && (
        <p className="text-xs text-muted-foreground leading-relaxed pl-6">
          {justification}
        </p>
      )}
    </div>
  );
}

function KhsSummaryCard({ khs }) {
  if (!khs) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" />
          Data Akademik (KHS)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-6">
          <div className="text-center">
            <p className="text-2xl font-bold text-primary tabular-nums">
              {khs.ipk != null ? khs.ipk.toFixed(2) : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">IPK</p>
          </div>
          <div className="w-px h-10 bg-border" />
          <div className="text-center">
            <p className="text-2xl font-bold tabular-nums">
              {khs.total_sks ?? "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Total SKS</p>
          </div>
        </div>
        {khs.relevant_courses?.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Relevant Courses</p>
            <div className="grid gap-1">
              {khs.relevant_courses.map((c, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm py-1 px-2 rounded bg-muted/50"
                >
                  <span className="truncate">{c.name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[10px]">
                      {c.grade}
                    </Badge>
                    {c.semester && (
                      <span className="text-xs text-muted-foreground">
                        Sem {c.semester}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ResultPage() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [application, setApplication] = useState(null);
  const [announcement, setAnnouncement] = useState(null);
  const [evalResult, setEvalResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await getMe();
        if (!cancelled) setUser(me);

        let app = null;
        try {
          app = await getMyApplication();
          if (!cancelled) setApplication(app);
        } catch {
          // No application
        }

        try {
          const ann = await getMyAnnouncement();
          if (!cancelled) setAnnouncement(ann);
        } catch {
          // No announcement
        }

        // Try to load evaluation result if we have an application
        // Note: candidate can only see results via the announcement flow
        // The evaluation result endpoint is recruiter-only, so we'll
        // display what we can from the announcement data
      } catch (err) {
        toast.error(err.message || "Failed to load results");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const appStatus = application?.status || "draft";
  const isAnnounced = appStatus === "announced_pass" || appStatus === "announced_fail";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Award className="w-6 h-6 text-primary" />
          Application Result
        </h1>
        <p className="text-muted-foreground mt-1">
          View your evaluation results and recruitment status.
        </p>
      </div>

      {/* Announcement banner */}
      {isAnnounced && <AnnouncementBanner announcement={announcement} />}

      {/* Pending state */}
      {!isAnnounced && (
        <Card className="border-dashed">
          <CardContent className="py-12 flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Results Pending</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                Your application is being reviewed. Results will appear here once
                the recruitment team publishes the announcement.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recruitment Journey */}
      {application && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Recruitment Journey</CardTitle>
            <CardDescription>
              Your application's progress through the pipeline.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RecruitmentJourney status={appStatus} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
