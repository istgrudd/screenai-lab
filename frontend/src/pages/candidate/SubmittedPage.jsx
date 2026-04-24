import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  CheckCircle2,
  ClipboardCopy,
  Loader2,
  Sparkles,
  Trophy,
  UserCheck,
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

import { getMyApplication } from "@/lib/api";

const JOURNEY = [
  {
    id: "submitted",
    label: "Submitted",
    description: "Your application has been received.",
    icon: CheckCircle2,
  },
  {
    id: "ai_screening",
    label: "AI Screening",
    description: "Our AI evaluates your documents against the rubric.",
    icon: Sparkles,
  },
  {
    id: "peer_review",
    label: "Peer Review",
    description: "Recruiters review the AI output and your SWOT + supporting docs.",
    icon: UserCheck,
  },
  {
    id: "final_decision",
    label: "Final Decision",
    description: "You'll see the announcement on your dashboard.",
    icon: Trophy,
  },
];

// Map application.status → which journey step is currently active.
const STATUS_TO_STEP = {
  submitted: "submitted",
  screening: "ai_screening",
  announced_pass: "final_decision",
  announced_fail: "final_decision",
};

function referenceId(app) {
  if (!app) return "—";
  return `MBC-${String(app.id).padStart(5, "0")}-${app.division.slice(0, 3).toUpperCase()}`;
}

function JourneyStep({ step, active, done, isLast }) {
  const Icon = step.icon;
  return (
    <div className="flex-1 flex flex-col items-center relative">
      <div
        className={`w-12 h-12 rounded-full flex items-center justify-center border-2 shrink-0 z-10 ${
          active
            ? "bg-primary text-primary-foreground border-primary shadow-md"
            : done
            ? "bg-emerald-500 text-white border-emerald-500"
            : "bg-background text-muted-foreground border-border"
        }`}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-center mt-3 px-2">
        <p
          className={`text-sm font-medium ${
            active || done ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          {step.label}
        </p>
        <p className="text-xs text-muted-foreground mt-1 max-w-[150px]">
          {step.description}
        </p>
      </div>
      {!isLast && (
        <div
          className={`absolute top-6 left-1/2 w-full h-0.5 ${
            done ? "bg-emerald-500" : "bg-border"
          }`}
        />
      )}
    </div>
  );
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

  const activeStepId = STATUS_TO_STEP[application?.status] || "submitted";
  const activeIndex = JOURNEY.findIndex((s) => s.id === activeStepId);

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
          <div className="flex items-start justify-between gap-2 relative">
            {JOURNEY.map((step, idx) => (
              <JourneyStep
                key={step.id}
                step={step}
                active={idx === activeIndex}
                done={idx < activeIndex}
                isLast={idx === JOURNEY.length - 1}
              />
            ))}
          </div>
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
