import {
  CheckCircle2,
  Sparkles,
  Trophy,
  UserCheck,
} from "lucide-react";

export const JOURNEY_STEPS = [
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

// Map backend ApplicationStatus → which step in the UI journey is active.
// Note: peer_review is UI-only — no backend status maps to it today.
// See Task 6 flags: peer_review scheduled for Post-Phase-3 backlog.
export const STATUS_TO_JOURNEY_STEP = {
  draft: null,
  submitted: "submitted",
  screening: "ai_screening",
  announced_pass: "final_decision",
  announced_fail: "final_decision",
};

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

/**
 * Timeline tracker visualising where a candidate's application sits in
 * the recruitment pipeline.
 *
 * Props:
 *   status   — backend ApplicationStatus value (draft, submitted, …)
 *   pending  — override: show all steps as upcoming (pre-submit view)
 */
export default function RecruitmentJourney({ status, pending = false }) {
  const activeId = pending ? null : STATUS_TO_JOURNEY_STEP[status];
  const activeIndex = JOURNEY_STEPS.findIndex((s) => s.id === activeId);

  return (
    <div className="flex items-start justify-between gap-2 relative">
      {JOURNEY_STEPS.map((step, idx) => (
        <JourneyStep
          key={step.id}
          step={step}
          active={idx === activeIndex}
          done={activeIndex >= 0 && idx < activeIndex}
          isLast={idx === JOURNEY_STEPS.length - 1}
        />
      ))}
    </div>
  );
}
