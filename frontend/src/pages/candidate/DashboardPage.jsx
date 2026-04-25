import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  Loader2,
  Sparkles,
  XCircle,
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

import RecruitmentJourney from "@/components/RecruitmentJourney";
import {
  getMe,
  getMyApplication,
  listApplicationDocuments,
  getMyAnnouncement,
  getActivePeriod,
} from "@/lib/api";

const DOC_CHECKLIST = [
  { doc_type: "cv", label: "Curriculum Vitae" },
  { doc_type: "motivation_letter", label: "Motivation Letter" },
  { doc_type: "khs", label: "KHS / Transcript" },
  { doc_type: "ktm", label: "KTM / Student ID" },
  { doc_type: "swot", label: "SWOT Analysis" },
  { doc_type: "supporting_docs", label: "Dokumen Pendukung" },
];

function useCountdown(isoDate) {
  const deadline = useMemo(
    () => (isoDate ? new Date(isoDate) : null),
    [isoDate]
  );
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!deadline || Number.isNaN(deadline.getTime())) {
    return { expired: false, days: 0, hours: 0, minutes: 0, deadline: null };
  }

  const msLeft = deadline.getTime() - now.getTime();
  const expired = msLeft <= 0;
  const abs = Math.max(msLeft, 0);
  const days = Math.floor(abs / (24 * 60 * 60 * 1000));
  const hours = Math.floor((abs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((abs % (60 * 60 * 1000)) / (60 * 1000));

  return { expired, days, hours, minutes, deadline };
}

function CountdownCard({ period, loading }) {
  const { expired, days, hours, minutes, deadline } = useCountdown(
    period?.end_date || null
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="py-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-lg bg-muted flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            Memuat informasi periode…
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!period) {
    return (
      <Card className="border-muted">
        <CardContent className="py-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
            <CalendarClock className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Periode Rekrutasi
            </p>
            <p className="text-lg font-semibold">
              Tidak ada periode rekrutasi aktif
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pendaftaran akan dibuka oleh Super Admin.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={expired ? "border-destructive/40 bg-destructive/5" : ""}>
      <CardContent className="py-5 flex items-center gap-4">
        <div
          className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${
            expired ? "bg-destructive/15 text-destructive" : "bg-primary/10 text-primary"
          }`}
        >
          <CalendarClock className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {period.name}
          </p>
          {expired ? (
            <p className="text-lg font-semibold text-destructive">
              Periode telah ditutup
            </p>
          ) : (
            <p className="text-lg font-semibold tabular-nums">
              {days}d {hours}h {minutes}m tersisa
            </p>
          )}
          {deadline && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Tutup {deadline.toLocaleString()}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ChecklistCard({ documents, applicationId, locked }) {
  const navigate = useNavigate();
  const docsByType = new Map(documents.map((d) => [d.doc_type, d]));
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Document Checklist</CardTitle>
        <CardDescription>
          All six documents are required before you can submit.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        {DOC_CHECKLIST.map((item) => {
          const d = docsByType.get(item.doc_type);
          return (
            <div
              key={item.doc_type}
              className="py-2.5 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                    d
                      ? "bg-emerald-500/15 text-emerald-700"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {d ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{item.label}</p>
                  {d && (
                    <p className="text-xs text-muted-foreground truncate" title={d.file_name}>
                      {d.file_name}
                    </p>
                  )}
                </div>
              </div>
              <Badge variant={d ? "secondary" : "outline"} className="text-[10px] uppercase">
                {d ? "Uploaded" : "Missing"}
              </Badge>
            </div>
          );
        })}
        {!locked && applicationId && (
          <div className="pt-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => navigate("/documents")}
            >
              Manage documents
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NoApplicationCard() {
  const navigate = useNavigate();
  return (
    <Card className="border-dashed">
      <CardContent className="py-12 flex flex-col items-center text-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-7 h-7 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">You haven't started an application yet</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Head to your profile to confirm your student information and
            choose the MBC Laboratory division you want to apply to.
          </p>
        </div>
        <Button onClick={() => navigate("/profile")} className="gap-2">
          Go to profile
          <ArrowRight className="w-4 h-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [application, setApplication] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [announcement, setAnnouncement] = useState(null);
  const [activePeriod, setActivePeriod] = useState(null);
  const [periodLoading, setPeriodLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Active period — independent of application; 404 is expected when
      // no period is active and should not raise a toast.
      try {
        const p = await getActivePeriod();
        if (!cancelled) setActivePeriod(p);
      } catch {
        if (!cancelled) setActivePeriod(null);
      } finally {
        if (!cancelled) setPeriodLoading(false);
      }

      try {
        const me = await getMe();
        if (!cancelled) setUser(me);

        try {
          const app = await getMyApplication();
          if (cancelled) return;
          setApplication(app);
          const { documents: docs } = await listApplicationDocuments(app.id);
          if (!cancelled) setDocuments(docs);

          // Load announcement if submitted
          if (app.status !== "draft") {
            try {
              const ann = await getMyAnnouncement();
              if (!cancelled) setAnnouncement(ann);
            } catch { /* no announcement yet */ }
          }
        } catch (err) {
          // 404 is fine — user hasn't started yet.
          if (!err.message?.toLowerCase().includes("not found")) {
            toast.error(err.message || "Failed to load application");
          }
        }
      } catch (err) {
        toast.error(err.message || "Failed to load dashboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const uploadedCount = documents.length;
  const progressPct = Math.round((uploadedCount / DOC_CHECKLIST.length) * 100);
  const locked = application && application.status !== "draft";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-primary" />
            Welcome{user ? `, ${user.full_name.split(" ")[0]}` : ""}
          </h1>
          <p className="text-muted-foreground mt-1">
            Track your MBC Laboratory application progress here.
          </p>
        </div>
        {application && (
          <Badge variant="outline" className="uppercase">
            Division: {application.division.replace("_", " ")}
          </Badge>
        )}
      </div>

      <CountdownCard period={activePeriod} loading={periodLoading} />

      {!application ? (
        <NoApplicationCard />
      ) : (
        <>
          {/* Announcement banner */}
          {application.status === "announced_pass" && (
            <div className="rounded-xl border-2 bg-emerald-500/10 border-emerald-500/30 p-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">LOLOS</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Selamat! Kamu lolos seleksi administrasi. Pantau informasi tahap selanjutnya.
                  </p>
                </div>
              </div>
            </div>
          )}
          {application.status === "announced_fail" && (
            <div className="rounded-xl border-2 bg-destructive/10 border-destructive/30 p-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-destructive/20 text-destructive flex items-center justify-center">
                  <XCircle className="w-8 h-8" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-destructive">TIDAK LOLOS</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Terima kasih telah mendaftar. Kamu belum lolos seleksi administrasi.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Progress overview */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-primary" />
                Application Progress
              </CardTitle>
              <CardDescription>
                {locked
                  ? "Your application has been submitted. You can check the status below."
                  : "Finish uploading all documents, then review and submit."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {uploadedCount}/{DOC_CHECKLIST.length} documents uploaded
                </span>
                <Badge variant="secondary">{progressPct}%</Badge>
              </div>
              <Progress value={progressPct} />
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Badge variant={locked ? "default" : "outline"} className="uppercase">
                  Status: {application.status}
                </Badge>
                {!locked && (
                  <Button
                    size="sm"
                    onClick={() => navigate(progressPct === 100 ? "/review" : "/documents")}
                    className="gap-2"
                  >
                    {progressPct === 100 ? "Review & Submit" : "Continue uploading"}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                )}
                {locked && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate("/submitted")}
                    className="gap-2"
                  >
                    View submission
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Journey tracker — shown once submitted */}
          {locked && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Recruitment Journey</CardTitle>
                <CardDescription>
                  Where your application is in the pipeline right now.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RecruitmentJourney status={application.status} />
              </CardContent>
            </Card>
          )}

          <ChecklistCard
            documents={documents}
            applicationId={application.id}
            locked={locked}
          />
        </>
      )}
    </div>
  );
}
