import { PHASE_LABEL } from "@/lib/phase";

export const PHASE_ORDER = [
  "UPCOMING",
  "SUBMISSION",
  "EVALUATION",
  "ANNOUNCEMENT",
  "CLOSED",
];

export const PHASE_TONE_CLASS = {
  neutral:
    "border-border bg-muted text-muted-foreground dark:border-border dark:bg-muted dark:text-muted-foreground",
  info:
    "border-info/25 bg-info/10 text-info dark:border-info/30 dark:bg-info/15 dark:text-info",
  success:
    "border-success/25 bg-success/10 text-success dark:border-success/30 dark:bg-success/15 dark:text-success",
  warning:
    "border-warning/25 bg-warning/10 text-warning dark:border-warning/30 dark:bg-warning/15 dark:text-warning",
  brand:
    "border-primary/25 bg-primary/10 text-primary dark:border-primary/30 dark:bg-primary/15 dark:text-primary",
};

export const PHASE_META = {
  UPCOMING: {
    label: "Belum Dibuka",
    tone: "neutral",
    description: "Periode rekrutasi belum dimulai.",
  },
  SUBMISSION: {
    label: "Pendaftaran",
    tone: "brand",
    description: "Kandidat dapat mengirim pendaftaran dan dokumen.",
  },
  EVALUATION: {
    label: "Evaluasi",
    tone: "warning",
    description: "Aplikasi kandidat sedang masuk tahap evaluasi.",
  },
  ANNOUNCEMENT: {
    label: "Pengumuman",
    tone: "info",
    description: "Hasil seleksi dapat dipublikasikan atau dilihat.",
  },
  CLOSED: {
    label: "Ditutup",
    tone: "neutral",
    description: "Periode rekrutasi telah berakhir.",
  },
};

function normalizePhase(phase) {
  if (phase == null || phase === "") return "UNKNOWN";
  return String(phase).trim().toUpperCase();
}

export function getPhaseLabel(phase) {
  const normalized = normalizePhase(phase);
  return PHASE_META[normalized]?.label || PHASE_LABEL[normalized] || String(phase || "Unknown");
}

export function getPhaseTone(phase) {
  const normalized = normalizePhase(phase);
  return PHASE_META[normalized]?.tone || "neutral";
}

export function getPhaseMeta(phase) {
  const normalized = normalizePhase(phase);
  const meta = PHASE_META[normalized];

  if (meta) {
    return {
      phase: normalized,
      label: meta.label,
      tone: meta.tone,
      description: meta.description,
    };
  }

  return {
    phase: normalized,
    label: getPhaseLabel(phase),
    tone: "neutral",
    description: "Fase rekrutmen belum dikenali.",
  };
}

export function getPhaseStepStatus(currentPhase, targetPhase) {
  const currentIndex = PHASE_ORDER.indexOf(normalizePhase(currentPhase));
  const targetIndex = PHASE_ORDER.indexOf(normalizePhase(targetPhase));

  if (currentIndex === -1 || targetIndex === -1) return "upcoming";
  if (currentIndex > targetIndex) return "completed";
  if (currentIndex === targetIndex) return "active";
  return "upcoming";
}
