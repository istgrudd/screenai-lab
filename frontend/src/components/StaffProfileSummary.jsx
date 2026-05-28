import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { GraduationCap, Loader2, Pencil, ShieldCheck } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getMyProfile } from "@/lib/api";

const ROLE_LABEL = {
  super_admin: "Super Admin",
  recruiter: "Recruiter",
  candidate: "Candidate",
};

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
        {label}
      </p>
      <p>{value || <span className="text-muted-foreground italic">-</span>}</p>
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
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-primary" />
            {title}
          </h1>
          <p className="text-muted-foreground mt-1">{description}</p>
        </div>
        <Button asChild className="gap-2">
          <Link to={editPath}>
            <Pencil className="w-4 h-4" />
            Edit Profile
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Account Summary
          </CardTitle>
          <CardDescription>
            Review your account identity and role assignment.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <Field label="Full name" value={profile.full_name} />
          <Field label="Email" value={profile.email} />
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              Role
            </p>
            <Badge variant="secondary" className="text-[10px] uppercase">
              {ROLE_LABEL[profile.role] || profile.role}
            </Badge>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              Account status
            </p>
            <Badge variant={profile.is_active ? "secondary" : "destructive"}>
              {profile.is_active ? "Active" : "Inactive"}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
