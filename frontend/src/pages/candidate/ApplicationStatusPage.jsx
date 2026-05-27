import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCopy,
  FileText,
  Inbox,
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import RecruitmentJourney from "@/components/RecruitmentJourney";
import {
  getMyApplication,
  getMyAnnouncement,
  listApplicationDocuments,
} from "@/lib/api";
import {
  applicationReferenceId,
  documentCompleteness,
  formatDateTime,
  formatDivision,
  formatStatus,
  isAnnouncedStatus,
  isNotFoundError,
  nextApplicationTarget,
  REQUIRED_DOCUMENTS,
} from "@/lib/candidateApplication";

function EmptyStatus() {
  return (
    <Card className="border-dashed">
      <CardContent className="py-12 flex flex-col items-center text-center gap-4">
        <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
          <Inbox className="w-7 h-7 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">No application yet</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Your status page will activate once you create an application draft.
          </p>
        </div>
        <Button asChild className="gap-2">
          <Link to="/application/start">
            Start application
            <ArrowRight className="w-4 h-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ReferenceBlock({ application }) {
  const reference = applicationReferenceId(application);

  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(reference);
      toast.success("Reference ID copied.");
    } catch {
      toast.error("Copy failed. Please copy manually.");
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="rounded-lg border bg-muted/40 px-4 py-2 font-mono text-sm">
        {reference}
      </div>
      <Button variant="outline" size="sm" onClick={copyReference} className="gap-2">
        <ClipboardCopy className="w-4 h-4" />
        Copy
      </Button>
    </div>
  );
}

function DraftStatus({ application, documents }) {
  const completeness = documentCompleteness(documents);
  const target = nextApplicationTarget(application, documents);
  const label = completeness.complete ? "Review and submit" : "Continue documents";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Draft Progress</CardTitle>
          <CardDescription>
            Finish your draft before final submission.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {completeness.completed}/{completeness.total} documents uploaded
            </span>
            <Badge variant="secondary">{completeness.percent}%</Badge>
          </div>
          <Progress value={completeness.percent} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {REQUIRED_DOCUMENTS.map((item) => {
              const uploaded = completeness.byType.has(item.doc_type);
              return (
                <div
                  key={item.doc_type}
                  className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                >
                  <span className="text-sm">{item.label}</span>
                  <Badge
                    variant={uploaded ? "secondary" : "outline"}
                    className="text-[10px] uppercase"
                  >
                    {uploaded ? "Uploaded" : "Missing"}
                  </Badge>
                </div>
              );
            })}
          </div>
          <div className="pt-2 border-t flex justify-end">
            <Button asChild className="gap-2">
              <Link to={target}>
                {label}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusHero({ application, announcement }) {
  const status = application.status;
  const isPass = status === "announced_pass";
  const isFail = status === "announced_fail";
  const announced = isPass || isFail;
  const Icon = isPass ? CheckCircle2 : isFail ? XCircle : ShieldCheck;
  const iconClass = isPass
    ? "bg-emerald-500/15 text-emerald-700"
    : isFail
    ? "bg-destructive/15 text-destructive"
    : "bg-primary/10 text-primary";

  const title = isPass
    ? "You passed"
    : isFail
    ? "You did not pass"
    : status === "screening"
    ? "Application under review"
    : "Application submitted";

  const description = isPass
    ? "Congratulations. Keep an eye on official follow-up information from the recruitment team."
    : isFail
    ? "Thank you for applying to MBC Laboratory. The published result is shown below."
    : status === "screening"
    ? "Your application is being reviewed. Results will appear here once announced."
    : "Your application has been received. You can track the journey here.";

  return (
    <Card className={announced ? "overflow-hidden" : ""}>
      <CardContent className="py-10 flex flex-col items-center text-center gap-4">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center ${iconClass}`}>
          <Icon className="w-10 h-10" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold">{title}</h2>
          <p className="text-muted-foreground mt-1 max-w-md mx-auto">
            {description}
          </p>
          {announcement?.notes && announced && (
            <p className="text-sm mt-3 italic text-muted-foreground">
              Notes: {announcement.notes}
            </p>
          )}
        </div>

        <ReferenceBlock application={application} />

        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground pt-1">
          <span className="inline-flex items-center gap-1">
            Division:{" "}
            <Badge variant="secondary">
              {formatDivision(application.division)}
            </Badge>
          </span>
          <span>
            Submitted:{" "}
            {formatDateTime(application.submitted_at, "Not submitted yet")}
          </span>
          <span className="inline-flex items-center gap-1">
            Status:{" "}
            <Badge variant={announced ? "default" : "secondary"}>
              {formatStatus(status)}
            </Badge>
          </span>
          {announcement?.announced_at && announced && (
            <span>
              Announced: {formatDateTime(announcement.announced_at)}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ApplicationStatusPage() {
  const [application, setApplication] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [announcement, setAnnouncement] = useState(null);
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
          const { documents: docs } = await listApplicationDocuments(app.id);
          if (!cancelled) setDocuments(docs || []);
        } catch (error) {
          toast.error(error.message || "Failed to load documents");
        }

        try {
          const ann = await getMyAnnouncement();
          if (!cancelled) setAnnouncement(ann);
        } catch {
          if (!cancelled) setAnnouncement(null);
        }
      } catch (error) {
        if (!isNotFoundError(error)) {
          toast.error(error.message || "Failed to load application status");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
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

  const isDraft = application?.status === "draft";
  const announced = isAnnouncedStatus(application?.status);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-primary" />
          Application Status
        </h1>
        <p className="text-muted-foreground mt-1">
          Track your submitted application and published result in one place.
        </p>
      </div>

      {!application ? (
        <EmptyStatus />
      ) : isDraft ? (
        <>
          <Card>
            <CardContent className="py-5 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Application is still a draft</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Submit from the review step when all required documents are
                  uploaded.
                </p>
              </div>
            </CardContent>
          </Card>
          <DraftStatus application={application} documents={documents} />
        </>
      ) : (
        <>
          <StatusHero application={application} announcement={announcement} />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Recruitment Journey</CardTitle>
              <CardDescription>
                Where your application is in the current pipeline.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RecruitmentJourney status={application.status} />
            </CardContent>
          </Card>

          {!announced && (
            <Card>
              <CardContent className="py-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <FileText className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Documents are locked</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      No further action is needed unless the recruitment team
                      contacts you.
                    </p>
                  </div>
                </div>
                <Button asChild variant="outline">
                  <Link to="/dashboard">Back to dashboard</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
