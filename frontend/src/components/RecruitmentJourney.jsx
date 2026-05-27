import { CheckCircle2, Sparkles, Trophy } from "lucide-react";

export const JOURNEY_STEPS = [
  {
    id: "pendaftaran",
    label: "Pendaftaran",
    description:
      "Aplikasi dan dokumen sudah dikirim atau masih berada di tahap pendaftaran.",
    icon: CheckCircle2,
  },
  {
    id: "evaluasi_ai",
    label: "Evaluasi AI",
    description: "Aplikasi sedang dievaluasi dan disaring oleh sistem AI.",
    icon: Sparkles,
  },
  {
    id: "pengumuman",
    label: "Pengumuman",
    description: "Hasil akhir tersedia atau akan tampil di sini saat diumumkan.",
    icon: Trophy,
  },
];

export const STATUS_TO_JOURNEY_STEP = {
  draft: null,
  submitted: "pendaftaran",
  screening: "evaluasi_ai",
  announced_pass: "pengumuman",
  announced_fail: "pengumuman",
};

export const PHASE_TO_JOURNEY_STEP = {
  UPCOMING: null,
  SUBMISSION: "pendaftaran",
  EVALUATION: "evaluasi_ai",
  ANNOUNCEMENT: "pengumuman",
  CLOSED: "pengumuman",
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

export default function RecruitmentJourney({
  status,
  currentPhase = null,
  pending = false,
}) {
  let activeId = null;
  if (!pending) {
    if (status === "announced_pass" || status === "announced_fail") {
      activeId = "pengumuman";
    } else if (currentPhase && PHASE_TO_JOURNEY_STEP[currentPhase] !== undefined) {
      activeId = PHASE_TO_JOURNEY_STEP[currentPhase];
    } else {
      activeId = STATUS_TO_JOURNEY_STEP[status] ?? null;
    }
  }
  const activeIndex = JOURNEY_STEPS.findIndex((step) => step.id === activeId);

  return (
    <div className="flex items-start justify-between gap-2 relative">
      {JOURNEY_STEPS.map((step, index) => (
        <JourneyStep
          key={step.id}
          step={step}
          active={index === activeIndex}
          done={activeIndex >= 0 && index < activeIndex}
          isLast={index === JOURNEY_STEPS.length - 1}
        />
      ))}
    </div>
  );
}
