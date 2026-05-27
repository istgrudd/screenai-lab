import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, GraduationCap, Loader2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import CandidateProfileForm from "@/components/candidate/CandidateProfileForm";
import { getMyProfile } from "@/lib/api";
import { POST_SUBMIT_STATUSES } from "@/lib/candidateApplication";

export default function EditProfilePage() {
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

  const locked = POST_SUBMIT_STATUSES.has(profile.application_status);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-primary" />
            Edit Profile
          </h1>
          <p className="text-muted-foreground mt-1">
            Update account, contact, and student information.
          </p>
        </div>
        <Button asChild variant="outline" className="gap-2">
          <Link to="/profile">
            <ArrowLeft className="w-4 h-4" />
            Back to Profile
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Personal Information</CardTitle>
          <CardDescription>
            {locked
              ? "Academic identity fields are locked because your application has been submitted. Name, email, contact, and password remain editable."
              : "Complete your profile before final submission."}
          </CardDescription>
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
