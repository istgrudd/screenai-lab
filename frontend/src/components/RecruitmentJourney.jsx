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

// Task 13.3.2 — phase → which journey step should glow as "active".
// Phase mapping is spec-driven (CLAUDE.md Task 13.3.2):
//   SUBMISSION   → Submitted
//   EVALUATION   → AI Screening
//   ANNOUNCEMENT → Final Decision
//   CLOSED       → final state (all done)
//   UPCOMING     → none (rare for already-submitted candidate)
export const PHASE_TO_JOURNEY_STEP = {
  UPCOMING: null,
  SUBMISSION: "submitted",
  EVALUATION: "ai_screening",
  ANNOUNCEMENT: "final_decision",
  CLOSED: "final_decision",
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
 * Active-step resolution (Task 13.3.2):
 *   1. If `pending`, show every step as upcoming (pre-submit preview).
 *   2. A terminal application status (announced_pass/fail) wins outright —
 *      regardless of phase, the candidate has a result.
 *   3. Otherwise, prefer the phase mapping (currentPhase) so the tracker
 *      reflects where the *recruitment* is, not just the candidate's last
 *      stored status. CLOSED with no announcement → still Final Decision.
 *   4. Fall back to the legacy status mapping if no phase is provided.
 *
 * Props:
 *   status        — backend ApplicationStatus (draft, submitted, …)
 *   currentPhase  — UPCOMING | SUBMISSION | EVALUATION | ANNOUNCEMENT | CLOSED
 *   pending       — override: render all steps as upcoming
 */
export default function RecruitmentJourney({
  status,
  currentPhase = null,
  pending = false,
}) {
  let activeId = null;
  if (!pending) {
    if (status === "announced_pass" || status === "announced_fail") {
      activeId = "final_decision";
    } else if (currentPhase && PHASE_TO_JOURNEY_STEP[currentPhase] !== undefined) {
      activeId = PHASE_TO_JOURNEY_STEP[currentPhase];
    } else {
      activeId = STATUS_TO_JOURNEY_STEP[status] ?? null;
    }
  }
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
