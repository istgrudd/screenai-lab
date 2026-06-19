import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, Pencil, UserCircle2 } from "lucide-react";

import LoadingState from "@/components/common/LoadingState";
import StatusBadge from "@/components/common/StatusBadge";
import PageHeader from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMyApplication, getMyProfile } from "@/lib/api";
import {
  applicationReferenceId,
  formatDivision,
  formatIpk,
  isNotFoundError,
} from "@/lib/candidateApplication";

function Field({ label, value, mono }) {
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

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const profileData = await getMyProfile();
        if (cancelled) return;
        setProfile(profileData);

        try {
          const app = await getMyApplication();
          if (!cancelled) setApplication(app);
        } catch (error) {
          if (!isNotFoundError(error)) {
            toast.error(error.message || "Failed to load application status.");
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
    return <LoadingState label="Loading candidate profile..." />;
  }

  if (!profile) return null;

  const appStatus = application?.status || profile.application_status;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Candidate Account"
        title="Profile"
        description="Your profile is used for the application, documents, and MBC Laboratory selection communication."
        status={
          appStatus ? (
            <StatusBadge status={appStatus} size="md" />
          ) : (
            <StatusBadge label="No Application Yet" tone="brand" size="md" />
          )
        }
        action={
          <Button asChild className="gap-2">
            <Link to="/profile/edit">
              <Pencil className="h-4 w-4" />
              Edit Profile
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="brand-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-heading text-xl tracking-normal">
              <UserCircle2 className="h-5 w-5 text-primary" />
              Candidate Identity
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Full name" value={profile.full_name} />
            <Field label="Email" value={profile.email} />
            <Field label="WhatsApp number" value={profile.whatsapp} />
            <Field label="NIM" value={profile.nim} mono />
            <Field label="Faculty" value={profile.faculty} />
            <Field label="Major" value={profile.major} />
            <Field label="Year" value={profile.year} />
            <Field label="GPA" value={formatIpk(profile.ipk)} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Account
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge label={profile.role || "Candidate"} tone="neutral" />
                <StatusBadge
                  label={profile.is_active ? "Active" : "Inactive"}
                  tone={profile.is_active ? "success" : "destructive"}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="brand-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-heading text-xl tracking-normal">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Current Application
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 gap-4 text-sm">
              <Field
                label="Division"
                value={formatDivision(application?.division || profile.division)}
              />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Application status
                </p>
                <div className="mt-1">
                  {appStatus ? (
                    <StatusBadge status={appStatus} />
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      No application yet
                    </span>
                  )}
                </div>
              </div>
              {application && (
                <Field
                  label="Reference ID"
                  value={applicationReferenceId(application)}
                  mono
                />
              )}
            </div>

            <div className="flex justify-end border-t border-border/60 pt-4">
              <Button asChild variant="outline" className="gap-2">
                <Link to="/application">
                  Open Application Overview
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
