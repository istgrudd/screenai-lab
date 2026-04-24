import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, ClipboardCopy, Loader2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import RecruitmentJourney from "@/components/RecruitmentJourney";
import { getMyApplication } from "@/lib/api";

function referenceId(app) {
  if (!app) return "—";
  return `MBC-${String(app.id).padStart(5, "0")}-${app.division.slice(0, 3).toUpperCase()}`;
}

export default function SubmittedPage() {
  const navigate = useNavigate();
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const app = await getMyApplication();
        if (cancelled) return;
        if (app.status === "draft") {
          navigate("/documents", { replace: true });
          return;
        }
        setApplication(app);
      } catch (err) {
        toast.error(err.message || "Failed to load application status");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const ref = referenceId(application);

  const copyRef = async () => {
    try {
      await navigator.clipboard.writeText(ref);
      toast.success("Reference ID copied.");
    } catch {
      toast.error("Copy failed — please copy manually.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!application) return null;

  const submittedAt = application.submitted_at
    ? new Date(application.submitted_at).toLocaleString()
    : "—";

  return (
    <div className="space-y-6">
      {/* Hero confirmation */}
      <Card className="overflow-hidden">
        <CardContent className="py-10 flex flex-col items-center text-center gap-4">
          <div className="w-20 h-20 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-white" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-semibold">
              Application submitted
            </h1>
            <p className="text-muted-foreground mt-1 max-w-md mx-auto">
              Thanks for applying to MBC Laboratory. We'll notify you here when
              the recruitment journey moves to the next step.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <div className="rounded-lg border bg-muted/40 px-4 py-2 font-mono text-sm">
              {ref}
            </div>
            <Button variant="outline" size="sm" onClick={copyRef} className="gap-2">
              <ClipboardCopy className="w-4 h-4" />
              Copy
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground pt-1">
            <span className="inline-flex items-center gap-1">
              Division:{" "}
              <Badge variant="secondary" className="capitalize">
                {application.division.replace("_", " ")}
              </Badge>
            </span>
            <span>Submitted: {submittedAt}</span>
            <span className="inline-flex items-center gap-1">
              Status:{" "}
              <Badge variant="default" className="uppercase">
                {application.status}
              </Badge>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Recruitment journey tracker */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recruitment Journey</CardTitle>
          <CardDescription>
            Where your application is in the pipeline.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <RecruitmentJourney status={application.status} />
        </CardContent>
      </Card>

      {/* Next steps */}
      <Card>
        <CardContent className="py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            You don't need to do anything else for now. Check back later for updates.
          </p>
          <Button variant="outline" onClick={() => navigate("/profile")}>
            Back to profile
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
