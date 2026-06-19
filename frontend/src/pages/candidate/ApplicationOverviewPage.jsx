import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ClipboardList, Inbox, UserCircle2 } from "lucide-react";

import EmptyState from "@/components/common/EmptyState";
import LoadingState from "@/components/common/LoadingState";
import StatusBadge from "@/components/common/StatusBadge";
import PageHeader from "@/components/layout/PageHeader";
import ApplicationProgressCard from "@/components/candidate/ApplicationProgressCard";
import CandidateNextActionCard from "@/components/candidate/CandidateNextActionCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  formatIpk,
  isNotFoundError,
  nextApplicationTarget,
} from "@/lib/candidateApplication";

function Detail({ label, value, mono }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className={mono ? "mt-1 font-mono text-sm" : "mt-1 text-sm"}>
        {value || <span className="text-muted-foreground">-</span>}
      </p>
    </div>
  );
}

export default function ApplicationOverviewPage() {
  const navigate = useNavigate();
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
            toast.error(error.message || "Failed to load your application.");
          }
        }
      } catch (error) {
        toast.error(error.message || "Failed to load your profile.");
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
    return <LoadingState label="Loading application overview..." />;
  }

  if (!profile) return null;

  const target = nextApplicationTarget(application, documents);
  const completeness = documentCompleteness(documents);
  const isDraft = application?.status === "draft";
  const actionLabel = !application
    ? "Start Application"
    : isDraft && !completeness.complete
    ? "Continue Uploading Documents"
    : isDraft
    ? "Review & Submit"
    : "View Application Status";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Application"
        title="Application Overview"
        description="See your profile, chosen division, document completeness, and next action in one place."
      />

      <CandidateNextActionCard
        application={application}
        documents={documents}
        actionLabel={actionLabel}
        to={target}
      />

      {!application && (
        <EmptyState
          icon={Inbox}
          title="No application created yet"
          description="Once you choose a division, your application draft will appear here along with document progress."
        />
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.2fr]">
        <Card className="brand-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-heading text-xl tracking-normal">
              <UserCircle2 className="h-5 w-5 text-primary" />
              Candidate Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
            <Detail label="Full name" value={profile.full_name} />
            <Detail label="Email" value={profile.email} />
            <Detail label="WhatsApp number" value={profile.whatsapp} />
            <Detail label="NIM" value={profile.nim} mono />
            <Detail label="Faculty" value={profile.faculty} />
            <Detail label="Major" value={profile.major} />
            <Detail label="Year" value={profile.year} />
            <Detail label="GPA" value={formatIpk(profile.ipk)} />
          </CardContent>
        </Card>

        <Card className="brand-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-heading text-xl tracking-normal">
              <ClipboardList className="h-5 w-5 text-primary" />
              Application Details
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
            <Detail
              label="Chosen division"
              value={formatDivision(application?.division || profile.division)}
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Application status
              </p>
              <div className="mt-1">
                {application ? (
                  <StatusBadge status={application.status} />
                ) : (
                  <StatusBadge label="Not Started" tone="brand" />
                )}
              </div>
            </div>
            <Detail
              label="Submitted at"
              value={formatDateTime(application?.submitted_at, "Not submitted yet")}
            />
            <Detail
              label="Reference ID"
              value={application ? applicationReferenceId(application) : "-"}
              mono
            />
          </CardContent>
        </Card>
      </div>

      {application && (
        <ApplicationProgressCard
          application={application}
          documents={documents}
          actionLabel={actionLabel}
          canManageDocuments={application.status === "draft"}
          onAction={() => navigate(target)}
        />
      )}
    </div>
  );
}
