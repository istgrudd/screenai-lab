import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Pencil, ShieldCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import LoadingState from "@/components/common/LoadingState";
import PageHeader from "@/components/layout/PageHeader";
import StatusBadge from "@/components/common/StatusBadge";
import { getMyProfile } from "@/lib/api";

const ROLE_LABEL = {
  super_admin: "Super Admin",
  recruiter: "Recruiter",
  candidate: "Candidate",
};

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm">
        {value || <span className="text-muted-foreground">-</span>}
      </p>
    </div>
  );
}

export default function StaffProfileSummary({ title, description, editPath }) {
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
    return <LoadingState label="Loading profile..." />;
  }

  if (!profile) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title={title}
        description={description}
        status={<StatusBadge label={ROLE_LABEL[profile.role] || profile.role} tone="brand" size="md" />}
        action={
          <Button asChild className="gap-2">
            <Link to={editPath}>
              <Pencil className="h-4 w-4" />
              Edit Profile
            </Link>
          </Button>
        }
      />

      <Card className="brand-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-heading text-xl tracking-normal">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Account Summary
          </CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            Review your account identity and role assignment.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Full name" value={profile.full_name} />
          <Field label="Email" value={profile.email} />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Role
            </p>
            <div className="mt-1">
              <StatusBadge label={ROLE_LABEL[profile.role] || profile.role} tone="brand" />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Account status
            </p>
            <div className="mt-1">
              <StatusBadge
                label={profile.is_active ? "Active" : "Inactive"}
                tone={profile.is_active ? "success" : "destructive"}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
