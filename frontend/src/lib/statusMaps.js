export const STATUS_TONE_CLASS = {
  neutral:
    "border-border bg-muted text-muted-foreground dark:border-border dark:bg-muted dark:text-muted-foreground",
  info:
    "border-info/25 bg-info/10 text-info dark:border-info/30 dark:bg-info/15 dark:text-info",
  success:
    "border-success/25 bg-success/10 text-success dark:border-success/30 dark:bg-success/15 dark:text-success",
  warning:
    "border-warning/25 bg-warning/10 text-warning dark:border-warning/30 dark:bg-warning/15 dark:text-warning",
  destructive:
    "border-destructive/25 bg-destructive/10 text-destructive dark:border-destructive/30 dark:bg-destructive/15 dark:text-destructive",
  brand:
    "border-primary/25 bg-primary/10 text-primary dark:border-primary/30 dark:bg-primary/15 dark:text-primary",
};

export const APPLICATION_STATUS_META = {
  draft: { label: "Draft", tone: "neutral" },
  submitted: { label: "Terkirim", tone: "info" },
  document_review: { label: "Review Dokumen", tone: "info" },
  correction_requested: { label: "Perlu Revisi", tone: "warning" },
  verified: { label: "Terverifikasi", tone: "success" },
  screening: { label: "Screening", tone: "info" },
  evaluated: { label: "Terevaluasi", tone: "info" },
  announced_pass: { label: "Lolos", tone: "success" },
  announced_fail: { label: "Tidak Lolos", tone: "destructive" },
  cancelled: { label: "Dibatalkan", tone: "neutral" },
  closed: { label: "Ditutup", tone: "neutral" },
  rejected: { label: "Ditolak", tone: "destructive" },
};

export const DOCUMENT_STATUS_META = {
  pending: { label: "Menunggu", tone: "neutral" },
  uploaded: { label: "Terunggah", tone: "info" },
  verified: { label: "Terverifikasi", tone: "success" },
  rejected: { label: "Ditolak", tone: "destructive" },
  correction_requested: { label: "Perlu Revisi", tone: "warning" },
  missing: { label: "Belum Ada", tone: "neutral" },
};

export const USER_STATUS_META = {
  active: { label: "Aktif", tone: "success" },
  inactive: { label: "Tidak Aktif", tone: "neutral" },
  deactivated: { label: "Dinonaktifkan", tone: "destructive" },
  suspended: { label: "Ditangguhkan", tone: "warning" },
};

export const EMAIL_STATUS_META = {
  pending: { label: "Menunggu", tone: "neutral" },
  captured: { label: "Tercatat", tone: "info" },
  sent: { label: "Terkirim", tone: "success" },
  failed: { label: "Gagal", tone: "destructive" },
  disabled: { label: "Nonaktif", tone: "warning" },
};

export const AUDIT_ACTION_META = {
  document_verification: { label: "Document Verification", tone: "info" },
  document_review_finalized: { label: "Document Review Finalized", tone: "success" },
  announcement: { label: "Announcement", tone: "warning" },
  bulk_announcement: { label: "Bulk Announcement", tone: "warning" },
  score_override: { label: "Score Override", tone: "brand" },
  user_role_update: { label: "User Role Update", tone: "info" },
  user_deactivated: { label: "User Deactivated", tone: "destructive" },
  user_reactivated: { label: "User Reactivated", tone: "success" },
  period_created: { label: "Period Created", tone: "success" },
  period_updated: { label: "Period Updated", tone: "info" },
  period_closed: { label: "Period Closed", tone: "warning" },
};

export const RECOMMENDATION_STATUS_META = {
  recommended: { label: "Recommended", tone: "success" },
  not_recommended: { label: "Not Recommended", tone: "neutral" },
};

function normalizeStatus(status) {
  if (status == null || status === "") return "unknown";
  return String(status).trim().toLowerCase();
}

function mapForEntity(entityType) {
  if (entityType === "application") return APPLICATION_STATUS_META;
  if (entityType === "document") return DOCUMENT_STATUS_META;
  if (entityType === "user") return USER_STATUS_META;
  if (entityType === "email") return EMAIL_STATUS_META;
  if (entityType === "audit") return AUDIT_ACTION_META;
  if (entityType === "recommendation") return RECOMMENDATION_STATUS_META;
  return {};
}

export function formatStatusLabel(status) {
  if (status == null || status === "") return "Unknown";
  return String(status)
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getStatusMeta(status, entityType = "generic") {
  const normalized = normalizeStatus(status);
  const meta = mapForEntity(entityType)[normalized];

  if (meta) {
    return {
      status: normalized,
      label: meta.label,
      tone: meta.tone,
    };
  }

  return {
    status: normalized,
    label: formatStatusLabel(status),
    tone: "neutral",
  };
}
