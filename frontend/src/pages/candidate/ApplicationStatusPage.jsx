import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowRight,
  ClipboardCopy,
  FileText,
  Inbox,
  Megaphone,
  ShieldCheck,
} from "lucide-react";

import EmptyState from "@/components/common/EmptyState";
import LoadingState from "@/components/common/LoadingState";
import StatusBadge from "@/components/common/StatusBadge";
import PageHeader from "@/components/layout/PageHeader";
import ApplicationProgressCard from "@/components/candidate/ApplicationProgressCard";
import CandidateApplicationStepTrack from "@/components/candidate/CandidateApplicationStepTrack";
import CandidateStatusHero from "@/components/candidate/CandidateStatusHero";
import DocumentRequirementCard from "@/components/candidate/DocumentRequirementCard";
import TechnicalTestCallout from "@/components/candidate/TechnicalTestCallout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getActivePeriod,
  getMe,
  getMyAnnouncement,
  getMyApplication,
  listApplicationDocuments,
} from "@/lib/api";
import {
  REQUIRED_DOCUMENTS,
  applicationReferenceId,
  documentCompleteness,
  formatDateTime,
  formatDivision,
  isAnnouncedStatus,
  isNotFoundError,
  nextApplicationTarget,
} from "@/lib/candidateApplication";
import {
  candidateNextAction,
  candidateStatusCopy,
  cx,
  formatDateTimeId,
} from "@/lib/candidateUx";

function ReferenceBlock({ application }) {
  const reference = applicationReferenceId(application);

  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(reference);
      toast.success("Reference ID copied.");
    } catch {
      toast.error("Failed to copy. Copy it manually from the text shown.");
    }
  };

  return (
    <Card className="brand-card">
      <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">
            Reference ID
          </p>
          <p className="mt-1 font-mono text-lg font-semibold">{reference}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Use this ID if you need to contact a recruiter about your registration.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={copyReference} className="gap-2">
          <ClipboardCopy className="h-4 w-4" />
          Copy
        </Button>
      </CardContent>
    </Card>
  );
}

function StatusExplanationCard({ application, announcement }) {
  const copy = candidateStatusCopy(application, [], announcement);
  return (
    <Card className="brand-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-heading text-xl tracking-normal">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Status Explanation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={application.status} size="md" />
          <span className="text-sm text-muted-foreground">
            Division: {formatDivision(application.division)}
          </span>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          {copy.description}
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-surface-container-low px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Submission Date
            </p>
            <p className="mt-1 text-sm font-medium">
              {formatDateTime(application.submitted_at, "Not submitted")}
            </p>
          </div>
          <div className="rounded-xl bg-surface-container-low px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Current Status
            </p>
            <p className="mt-1 text-sm font-medium">{copy.statusLabel}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CorrectionDocumentsCard({ documents }) {
  const rejectedDocs = documents.filter(
    (document) => document.verification_status === "rejected"
  );
  if (!rejectedDocs.length) return null;

  return (
    <section className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-destructive">
          Document Revision
        </p>
        <h2 className="mt-1 font-heading text-xl font-bold tracking-normal">
          Documents to Replace
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {rejectedDocs.map((document) => {
          const requirement = REQUIRED_DOCUMENTS.find(
            (item) => item.doc_type === document.doc_type
          );
          return (
            <DocumentRequirementCard
              key={document.id || document.doc_type}
              documentType={document.doc_type}
              label={requirement?.label || document.doc_type}
              document={document}
              correctionMode
            />
          );
        })}
      </div>
      <Button asChild className="gap-2">
        <Link to="/documents">
          Fix Documents
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </section>
  );
}

function AnnouncementResultCard({ application, announcement }) {
  if (!isAnnouncedStatus(application?.status)) return null;

  const passed = application.status === "announced_pass";
  return (
    <Card
      className={cx(
        "brand-card",
        passed ? "bg-success/10" : "bg-destructive/10"
      )}
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-heading text-xl tracking-normal">
          <Megaphone className={cx("h-5 w-5", passed ? "text-success" : "text-destructive")} />
          {passed ? "Result: Passed" : "Result: Not Passed"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
        <p>
          {passed
            ? "Congratulations. The selection result is available and you have passed."
            : "The selection result is available. Thank you for taking part in the recruitment process."}
        </p>
        {passed && <TechnicalTestCallout />}
        {announcement?.notes && (
          <p className="rounded-xl bg-card px-4 py-3 text-foreground">
            {announcement.notes}
          </p>
        )}
        {announcement?.announced_at && (
          <p className="text-xs">
            Announced on {formatDateTimeId(announcement.announced_at)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function ApplicationStatusPage() {
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

    async function load() {
      setLoading(true);
      try {
        try {
          const period = await getActivePeriod();
          if (!cancelled) setActivePeriod(period);
        } catch {
          if (!cancelled) setActivePeriod(null);
        } finally {
          if (!cancelled) setPeriodLoading(false);
        }

        try {
          const me = await getMe();
          if (!cancelled) setUser(me);
        } catch {
          if (!cancelled) setUser(null);
        }

        const app = await getMyApplication();
        if (cancelled) return;
        setApplication(app);

        try {
          const { documents: docs } = await listApplicationDocuments(app.id);
          if (!cancelled) setDocuments(docs || []);
        } catch (error) {
          toast.error(error.message || "Failed to load documents.");
        }

        try {
          const ann = await getMyAnnouncement();
          if (!cancelled) setAnnouncement(ann);
        } catch {
          if (!cancelled) setAnnouncement(null);
        }
      } catch (error) {
        if (!isNotFoundError(error)) {
          toast.error(error.message || "Failed to load registration status.");
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

  const action = useMemo(
    () => candidateNextAction(application, documents),
    [application, documents]
  );

  if (loading) {
    return <LoadingState label="Loading registration status..." />;
  }

  const isDraft = application?.status === "draft";
  const announced = isAnnouncedStatus(application?.status);
  const target = nextApplicationTarget(application, documents);
  const completeness = documentCompleteness(documents);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Registration / Status"
        title="Selection Status"
        description="Track the process after your registration is submitted, including document revisions and the final announcement."
      />

      {!application ? (
        <EmptyState
          icon={Inbox}
          title="No registration yet"
          description="This status page becomes active after you create a registration draft."
          actionLabel="Start Registration"
          to="/application/start"
        />
      ) : isDraft ? (
        <>
          <CandidateStatusHero
            user={user}
            application={application}
            documents={documents}
            activePeriod={activePeriod}
            loading={periodLoading && !activePeriod}
            onPrimaryAction={() => navigate(target)}
            primaryActionLabel={
              completeness.complete
                ? "Review & Submit Registration"
                : "Continue Uploading Documents"
            }
          />
          <CandidateApplicationStepTrack
            currentStep={completeness.complete ? "review" : "documents"}
            application={application}
            documents={documents}
            title="Registration Flow"
          />
          <ApplicationProgressCard
            application={application}
            documents={documents}
            activePeriod={activePeriod}
            canManageDocuments
            actionLabel={
              completeness.complete
                ? "Review & Submit Registration"
                : "Continue Uploading Documents"
            }
            onAction={() => navigate(target)}
          />
        </>
      ) : (
        <>
          <CandidateStatusHero
            user={user}
            application={application}
            documents={documents}
            activePeriod={activePeriod}
            announcement={announcement}
            loading={periodLoading && !activePeriod}
            onPrimaryAction={() => navigate(action.to)}
            primaryActionLabel={action.label}
          />

          <CandidateApplicationStepTrack
            mode="status"
            application={application}
            documents={documents}
            title="Selection Stages"
          />

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_0.9fr]">
            <StatusExplanationCard
              application={application}
              announcement={announcement}
            />
            <ReferenceBlock application={application} />
          </div>

          {application.status === "correction_requested" && (
            <CorrectionDocumentsCard documents={documents} />
          )}

          <AnnouncementResultCard
            application={application}
            announcement={announcement}
          />

          {!announced && application.status !== "correction_requested" && (
            <Card className="brand-card">
              <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium text-foreground">
                      No additional action right now
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Your documents are locked. Just keep an eye on this page
                      until the next phase is available.
                    </p>
                  </div>
                </div>
                <Button asChild variant="outline">
                  <Link to="/dashboard">Back to Dashboard</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
