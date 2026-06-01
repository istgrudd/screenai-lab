import {
  ClipboardCheck,
  FileSearch,
  FileText,
  Megaphone,
  Send,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from "lucide-react";

import StepTrack from "@/components/common/StepTrack";
import { Card, CardContent } from "@/components/ui/card";
import {
  documentCompleteness,
  missingRequiredProfileFields,
} from "@/lib/candidateApplication";
import { cx } from "@/lib/candidateUx";

const APPLICATION_STEPS = [
  {
    key: "profile",
    label: "Profil",
    description: "Data kandidat lengkap",
    icon: UserCheck,
  },
  {
    key: "division",
    label: "Pilih Divisi",
    description: "Satu divisi tujuan",
    icon: ShieldCheck,
  },
  {
    key: "documents",
    label: "Dokumen",
    description: "Dokumen wajib",
    icon: FileText,
  },
  {
    key: "review",
    label: "Tinjau",
    description: "Konfirmasi final",
    icon: ClipboardCheck,
  },
  {
    key: "status",
    label: "Status",
    description: "Pantau seleksi",
    icon: Send,
  },
];

const STATUS_STEPS = [
  {
    key: "registration",
    label: "Pendaftaran",
    description: "Data dan dokumen diterima",
    icon: Send,
  },
  {
    key: "document_review",
    label: "Review Dokumen",
    description: "Verifikasi recruiter",
    icon: FileSearch,
  },
  {
    key: "evaluation",
    label: "Evaluasi",
    description: "Penilaian seleksi",
    icon: Sparkles,
  },
  {
    key: "announcement",
    label: "Pengumuman",
    description: "Hasil akhir",
    icon: Megaphone,
  },
];

function statusStep(application) {
  const status = application?.status;
  if (status === "announced_pass" || status === "announced_fail") {
    return "announcement";
  }
  if (status === "verified" || status === "screening" || status === "evaluated") {
    return "evaluation";
  }
  if (status === "document_review" || status === "correction_requested") {
    return "document_review";
  }
  return "registration";
}

function flowCompleted({ profile, profileComplete, application, documents }) {
  const completeProfile =
    profileComplete ?? (profile ? missingRequiredProfileFields(profile).length === 0 : true);
  const completeness = documentCompleteness(documents);
  const completed = [];

  if (completeProfile) completed.push("profile");
  if (application) completed.push("division");
  if (completeness.complete) completed.push("documents");
  if (application?.status && application.status !== "draft") completed.push("review");

  return completed;
}

function flowCurrent(currentStep, application) {
  if (currentStep) return currentStep;
  if (!application) return "division";
  if (application.status !== "draft") return "status";
  return "documents";
}

export default function CandidateApplicationStepTrack({
  mode = "application",
  currentStep,
  application,
  documents = [],
  profile,
  profileComplete,
  title,
  className,
}) {
  const statusMode = mode === "status";
  const steps = statusMode ? STATUS_STEPS : APPLICATION_STEPS;
  const activeStep = statusMode ? statusStep(application) : flowCurrent(currentStep, application);
  const completedSteps = statusMode
    ? []
    : flowCompleted({ profile, profileComplete, application, documents });

  return (
    <Card className={cx("brand-card", className)}>
      <CardContent className="space-y-4 p-5">
        {title && (
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">
            {title}
          </p>
        )}
        <div className="md:hidden">
          <StepTrack
            steps={steps}
            currentStep={activeStep}
            completedSteps={completedSteps}
            orientation="vertical"
          />
        </div>
        <div className="hidden md:block">
          <StepTrack
            steps={steps}
            currentStep={activeStep}
            completedSteps={completedSteps}
            orientation="horizontal"
          />
        </div>
      </CardContent>
    </Card>
  );
}
