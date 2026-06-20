import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Lock, UserCircle2 } from "lucide-react";

import LoadingState from "@/components/common/LoadingState";
import StatusBadge from "@/components/common/StatusBadge";
import PageHeader from "@/components/layout/PageHeader";
import CandidateProfileForm from "@/components/candidate/CandidateProfileForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMyProfile } from "@/lib/api";
import {
  POST_SUBMIT_STATUSES,
  PROFILE_FIELD_LABELS,
} from "@/lib/candidateApplication";

export default function EditProfilePage() {
  const location = useLocation();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await getMyProfile();
        if (!cancelled) setProfile(data);
      } catch (error) {
        toast.error(error.message || "Failed to load profile.");
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
    return <LoadingState label="Loading profile form..." />;
  }

  if (!profile) return null;

  const locked = POST_SUBMIT_STATUSES.has(profile.application_status);
  const ipkCorrectionOpen = locked && profile.ipk_editable === true;
  const missingFields = location.state?.missingProfileFields || [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Candidate Account"
        title="Edit Profile"
        description="Complete your personal, contact, and academic details so your registration can be submitted."
        status={
          ipkCorrectionOpen ? (
            <StatusBadge label="GPA correction available" tone="warning" size="md" />
          ) : locked ? (
            <StatusBadge label="Academic fields locked" tone="warning" size="md" />
          ) : (
            <StatusBadge label="Editable" tone="brand" size="md" />
          )
        }
        action={
          <Button asChild variant="outline" className="gap-2">
            <Link to="/profile">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
        }
      />

      {missingFields.length > 0 && (
        <Card className="brand-card bg-warning/10">
          <CardContent className="flex items-start gap-3 p-5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <p className="font-medium text-foreground">
                Complete your profile before continuing
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Required:{" "}
                {missingFields
                  .map((field) => PROFILE_FIELD_LABELS[field] || field)
                  .join(", ")}
                .
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {locked && (
        <Card className="brand-card bg-surface-container-low">
          <CardContent className="flex items-start gap-3 p-5">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium text-foreground">
                Some academic fields are locked
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Once your registration is submitted, your NIM, faculty, major,
                and year can no longer be changed. GPA is also locked after
                submission, but can be reopened if the KHS is rejected and needs
                correction. Your name, email, WhatsApp, and password can still be
                updated.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="brand-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-heading text-xl tracking-normal">
            <UserCircle2 className="h-5 w-5 text-primary" />
            Candidate Information
          </CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            WhatsApp number is required and validated by the form before saving.
          </p>
        </CardHeader>
        <CardContent>
          <CandidateProfileForm
            profile={profile}
            locked={locked}
            onSaved={setProfile}
          />
        </CardContent>
      </Card>
    </div>
  );
}
