import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Lock,
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
import DivisionSelection from "@/components/candidate/DivisionSelection";
import { createApplication, getMyApplication, getMyProfile } from "@/lib/api";
import {
  formatDivision,
  formatStatus,
  isNotFoundError,
  isSubmittedOrLater,
} from "@/lib/candidateApplication";

export default function StartApplicationPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [application, setApplication] = useState(null);
  const [selectedDivision, setSelectedDivision] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const profileData = await getMyProfile();
        if (cancelled) return;
        setProfile(profileData);
        setSelectedDivision(profileData.division || null);

        try {
          const app = await getMyApplication();
          if (cancelled) return;
          setApplication(app);
          setSelectedDivision(app.division || profileData.division || null);
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

  const submittedOrLater = isSubmittedOrLater(application);
  const divisionLocked = Boolean(application);

  const handleSelect = (division) => {
    if (divisionLocked) return;
    setSelectedDivision(division);
  };

  const handleStart = async () => {
    if (!selectedDivision) {
      toast.error("Pick a division first.");
      return;
    }

    setSaving(true);
    try {
      await createApplication(selectedDivision);
      toast.success("Application started. Next: upload your documents.");
      navigate("/documents");
    } catch (error) {
      toast.error(error.message || "Could not start application");
    } finally {
      setSaving(false);
    }
  };

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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-primary" />
          Start Application
        </h1>
        <p className="text-muted-foreground mt-1">
          Choose one MBC Laboratory division for this recruitment period.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            Division Selection
            {divisionLocked && <Lock className="w-4 h-4 text-muted-foreground" />}
          </CardTitle>
          <CardDescription>
            {divisionLocked
              ? "Division is locked after an application is created so uploaded documents stay attached to the same application."
              : "Pick one division. You can continue to document upload after the application draft is created."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <DivisionSelection
            selected={selectedDivision}
            disabled={divisionLocked || saving}
            onSelect={handleSelect}
          />

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t">
            <div className="text-sm text-muted-foreground">
              {application ? (
                <span className="inline-flex items-center gap-2 text-foreground">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Current division:{" "}
                  <span className="font-medium">
                    {formatDivision(application.division)}
                  </span>
                  <Badge variant="secondary" className="uppercase">
                    {formatStatus(application.status)}
                  </Badge>
                </span>
              ) : (
                "Ready when you are."
              )}
            </div>

            {!application ? (
              <Button
                onClick={handleStart}
                disabled={!selectedDivision || saving}
                className="gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    Start application
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            ) : submittedOrLater ? (
              <Button asChild className="gap-2">
                <Link to="/application/status">
                  View application status
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2">
                <Button asChild variant="outline" className="gap-2">
                  <Link to="/application">
                    Application overview
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
                <Button asChild className="gap-2">
                  <Link to="/documents">
                    Continue documents
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
