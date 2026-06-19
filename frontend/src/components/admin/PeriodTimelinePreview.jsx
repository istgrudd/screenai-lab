import { Calendar, Megaphone, Sparkles } from "lucide-react";

import StepTrack from "@/components/common/StepTrack";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PHASE_ORDER } from "@/lib/phaseMaps";

function formatDateTime(value) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function completedFor(phase) {
  const index = PHASE_ORDER.indexOf(phase);
  if (index <= 0) return [];
  return PHASE_ORDER.slice(0, index);
}

export default function PeriodTimelinePreview({
  title = "Phase Timeline Preview",
  period,
  draft,
  thresholdN,
  className,
}) {
  const source = draft || {
    startDate: period?.start_date,
    submissionEnd: period?.submission_end_date,
    evaluationEnd: period?.evaluation_end_date,
    endDate: period?.end_date,
  };
  const currentPhase = period?.current_phase || "SUBMISSION";
  const threshold = thresholdN ?? draft?.thresholdN ?? period?.threshold_n;
  const steps = [
    {
      key: "SUBMISSION",
      label: "Submission",
      icon: Calendar,
      description: `${formatDateTime(source.startDate)} - ${formatDateTime(
        source.submissionEnd
      )}`,
    },
    {
      key: "EVALUATION",
      label: "Evaluation",
      icon: Sparkles,
      description: `${formatDateTime(source.submissionEnd)} - ${formatDateTime(
        source.evaluationEnd
      )}`,
    },
    {
      key: "ANNOUNCEMENT",
      label: "Announcement",
      icon: Megaphone,
      description: `${formatDateTime(source.evaluationEnd)} - ${formatDateTime(
        source.endDate
      )}`,
    },
  ];

  return (
    <Card className={`brand-card ${className || ""}`}>
      <CardHeader className="pb-3">
        <CardTitle className="font-heading text-lg tracking-normal">
          {title}
        </CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">
          Threshold N:{" "}
          <span className="font-medium text-foreground">
            {threshold === "" || threshold == null ? "Not set" : threshold}
          </span>
        </p>
      </CardHeader>
      <CardContent>
        <StepTrack
          steps={steps}
          currentStep={currentPhase}
          completedSteps={completedFor(currentPhase)}
          orientation="vertical"
        />
      </CardContent>
    </Card>
  );
}
