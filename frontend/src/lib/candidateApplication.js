export const REQUIRED_DOCUMENTS = [
  {
    doc_type: "cv",
    label: "Curriculum Vitae",
    short: "CV",
    tip: "Up-to-date CV highlighting projects, achievements, and skills relevant to your chosen division.",
  },
  {
    doc_type: "motivation_letter",
    label: "Motivation Letter",
    short: "Motivation",
    tip: "Explain why you want to join this division and how your interests align with its research focus.",
  },
  {
    doc_type: "khs",
    label: "KHS / Transcript",
    short: "KHS",
    tip: "Most recent official transcript (KHS) from iGracias. Make sure IPK and semester breakdown are visible.",
  },
  {
    doc_type: "ktm",
    label: "KTM / Student ID",
    short: "KTM",
    tip: "Scan or photo of your active KTM showing your NIM and program clearly.",
  },
  {
    doc_type: "swot",
    label: "SWOT Analysis",
    short: "SWOT",
    tip: "A one-page self-assessment: Strengths, Weaknesses, Opportunities, Threats. Used qualitatively by recruiters.",
  },
  {
    doc_type: "supporting_docs",
    label: "Dokumen Pendukung",
    short: "Pendukung",
    tip: "A single PDF bundle: proof of following social media, broadcast shares, and other supporting evidence.",
  },
];

export const POST_SUBMIT_STATUSES = new Set([
  "submitted",
  "screening",
  "announced_pass",
  "announced_fail",
]);

export const STATUS_LABELS = {
  draft: "Draft",
  submitted: "Submitted",
  screening: "Screening",
  announced_pass: "Passed",
  announced_fail: "Not passed",
};

export function formatDivision(division) {
  if (!division) return "-";
  return String(division)
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatStatus(status) {
  if (!status) return "-";
  return STATUS_LABELS[status] || formatDivision(status);
}

export function formatDateTime(value, empty = "-") {
  if (!value) return empty;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return empty;
  return date.toLocaleString();
}

export function applicationReferenceId(application) {
  if (!application?.id || !application?.division) return "-";
  return `MBC-${String(application.id).padStart(5, "0")}-${String(
    application.division
  )
    .slice(0, 3)
    .toUpperCase()}`;
}

export function isNotFoundError(error) {
  return error?.message?.toLowerCase().includes("not found");
}

export function isDraftApplication(application) {
  return application?.status === "draft";
}

export function isSubmittedOrLater(applicationOrStatus) {
  const status =
    typeof applicationOrStatus === "string"
      ? applicationOrStatus
      : applicationOrStatus?.status;
  return Boolean(status && status !== "draft");
}

export function isAnnouncedStatus(status) {
  return status === "announced_pass" || status === "announced_fail";
}

export function documentsByType(documents = []) {
  return new Map(documents.map((document) => [document.doc_type, document]));
}

export function documentCompleteness(documents = []) {
  const byType = documentsByType(documents);
  const missing = REQUIRED_DOCUMENTS.filter(
    (item) => !byType.has(item.doc_type)
  );
  const completed = REQUIRED_DOCUMENTS.length - missing.length;
  const total = REQUIRED_DOCUMENTS.length;
  const percent = Math.round((completed / total) * 100);

  return {
    byType,
    missing,
    completed,
    total,
    percent,
    complete: missing.length === 0,
  };
}

export function nextApplicationTarget(application, documents = []) {
  if (!application) return "/application/start";
  if (application.status === "draft") {
    return documentCompleteness(documents).complete
      ? "/application/review"
      : "/documents";
  }
  return "/application/status";
}
