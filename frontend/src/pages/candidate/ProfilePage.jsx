import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  Loader2,
  Pencil,
  UserCircle2,
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
import { getMyApplication, getMyProfile } from "@/lib/api";
import {
  applicationReferenceId,
  formatDivision,
  formatStatus,
  isNotFoundError,
} from "@/lib/candidateApplication";

function Field({ label, value, mono }) {
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
            toast.error(error.message || "Failed to load application status");
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

  const appStatus = application?.status || profile.application_status;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-primary" />
            Profile
          </h1>
          <p className="text-muted-foreground mt-1">
            Account and student information used for your application.
          </p>
        </div>
        <Button asChild className="gap-2">
          <Link to="/profile/edit">
            <Pencil className="w-4 h-4" />
            Edit Profile
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <UserCircle2 className="w-5 h-5 text-primary" />
            Profile Summary
          </CardTitle>
          <CardDescription>
            Review your personal, contact, and academic details.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <Field label="Full name" value={profile.full_name} />
          <Field label="Email" value={profile.email} />
          <Field label="WhatsApp" value={profile.whatsapp} />
          <Field label="NIM" value={profile.nim} mono />
          <Field label="Faculty" value={profile.faculty} />
          <Field label="Major" value={profile.major} />
          <Field label="Year" value={profile.year} />
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              Role / Account status
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="capitalize">
                {profile.role || "candidate"}
              </Badge>
              <Badge variant={profile.is_active ? "secondary" : "destructive"}>
                {profile.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-primary" />
            Current Application
          </CardTitle>
          <CardDescription>
            Application details are managed in the application workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <Field
              label="Division"
              value={formatDivision(application?.division || profile.division)}
            />
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                Application status
              </p>
              {appStatus ? (
                <Badge variant={appStatus === "draft" ? "secondary" : "default"}>
                  {formatStatus(appStatus)}
                </Badge>
              ) : (
                <span className="text-muted-foreground italic">No application</span>
              )}
            </div>
            {application && (
              <Field
                label="Reference ID"
                value={applicationReferenceId(application)}
                mono
              />
            )}
          </div>

          <div className="pt-2 border-t flex justify-end">
            <Button asChild variant="outline" className="gap-2">
              <Link to="/application">
                Open Application Overview
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
