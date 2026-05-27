import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileText,
  Inbox,
  Loader2,
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
import {
  getMyApplication,
  getMyProfile,
  listApplicationDocuments,
} from "@/lib/api";
import {
  applicationReferenceId,
  documentCompleteness,
  formatDateTime,
  formatDivision,
  formatStatus,
  isNotFoundError,
  nextApplicationTarget,
  REQUIRED_DOCUMENTS,
} from "@/lib/candidateApplication";

function Detail({ label, value, mono }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
        {label}
      </p>
      <p className={mono ? "font-mono" : ""}>
        {value || <span className="text-muted-foreground italic">-</span>}
      </p>
    </div>
  );
}

function EmptyApplication() {
  return (
    <Card className="border-dashed">
      <CardContent className="py-12 flex flex-col items-center text-center gap-4">
        <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
          <Inbox className="w-7 h-7 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">No application yet</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Start by choosing the division you want to apply to. Your draft will
            be created before document upload.
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

function DocumentProgress({ documents }) {
  const completeness = documentCompleteness(documents);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          Document Completeness
        </CardTitle>
        <CardDescription>
          All required documents must be uploaded before final review.
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
      </CardContent>
    </Card>
  );
}

export default function ApplicationOverviewPage() {
  const [profile, setProfile] = useState(null);
  const [application, setApplication] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const profileData = await getMyProfile();
        if (!cancelled) setProfile(profileData);

        try {
          const app = await getMyApplication();
          if (cancelled) return;
          setApplication(app);

          const { documents: docs } = await listApplicationDocuments(app.id);
          if (!cancelled) setDocuments(docs || []);
        } catch (error) {
          if (!isNotFoundError(error)) {
            toast.error(error.message || "Failed to load application");
          }
        }
      } catch (error) {
        toast.error(error.message || "Failed to load profile");
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

  if (!profile) return null;

  const target = nextApplicationTarget(application, documents);
  const completeness = documentCompleteness(documents);
  const isDraft = application?.status === "draft";
  const actionLabel = !application
    ? "Start application"
    : isDraft && !completeness.complete
    ? "Continue documents"
    : isDraft
    ? "Review and submit"
    : "View application status";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-primary" />
            Application Overview
          </h1>
          <p className="text-muted-foreground mt-1">
            See your current application, document progress, and next step.
          </p>
        </div>
        <Button asChild className="gap-2">
          <Link to={target}>
            {actionLabel}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </Button>
      </div>

      {!application ? (
        <EmptyApplication />
      ) : (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                Application Details
              </CardTitle>
              <CardDescription>
                This summary reflects the current application tied to your
                account.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <Detail label="Candidate" value={profile.full_name} />
              <Detail
                label="Chosen division"
                value={formatDivision(application.division)}
              />
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Application status
                </p>
                <Badge variant={isDraft ? "secondary" : "default"}>
                  {formatStatus(application.status)}
                </Badge>
              </div>
              <Detail
                label="Submitted date"
                value={formatDateTime(
                  application.submitted_at,
                  "Not submitted yet"
                )}
              />
              <Detail
                label="Reference ID"
                value={applicationReferenceId(application)}
                mono
              />
            </CardContent>
          </Card>

          <DocumentProgress documents={documents} />

          <Card>
            <CardContent className="py-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Next action</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {isDraft && !completeness.complete
                    ? "Finish the missing documents before final review."
                    : isDraft
                    ? "All required documents are uploaded. Review everything before final submission."
                    : "Your application has left draft mode. Track it on the status page."}
                </p>
              </div>
              <Button asChild className="gap-2">
                <Link to={target}>
                  {actionLabel}
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
