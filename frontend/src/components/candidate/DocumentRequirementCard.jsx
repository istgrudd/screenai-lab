import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileText,
  Lock,
  Upload,
} from "lucide-react";

import StatusBadge from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  cx,
  documentStatusInfo,
  formatDateTimeId,
  formatFileSize,
} from "@/lib/candidateUx";

function RequirementIcon({ status, className }) {
  if (status === "verified") return <CheckCircle2 className={className} />;
  if (status === "rejected" || status === "correction_requested") {
    return <AlertTriangle className={className} />;
  }
  if (status === "missing") return <Upload className={className} />;
  return <FileText className={className} />;
}

export default function DocumentRequirementCard({
  documentType,
  label,
  document,
  required = true,
  locked = false,
  correctionMode = false,
  active = false,
  onUpload,
  onPreview,
  className,
}) {
  const info = documentStatusInfo(document);
  const reviewerNote =
    document?.rejection_reason ||
    document?.reviewer_note ||
    document?.review_note ||
    document?.notes;
  const canPreview = Boolean(document && onPreview);
  const actionLabel = locked
    ? "Lihat Detail"
    : info.status === "missing"
    ? "Unggah"
    : correctionMode && info.status === "rejected"
    ? "Ganti Dokumen"
    : "Kelola";

  return (
    <Card
      className={cx(
        "brand-card transition-colors",
        active && "ring-2 ring-primary/30",
        info.status === "rejected" && "border-destructive/25 bg-destructive/5",
        className
      )}
    >
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <div
            className={cx(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
              info.tone === "success" && "bg-success/10 text-success",
              info.tone === "warning" && "bg-warning/10 text-warning",
              info.tone === "destructive" && "bg-destructive/10 text-destructive",
              info.tone === "info" && "bg-info/10 text-info",
              info.tone === "neutral" && "bg-muted text-muted-foreground"
            )}
          >
            <RequirementIcon status={info.status} className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-heading text-base font-bold tracking-normal">
                {label || documentType}
              </h3>
              {required && (
                <span className="rounded-full bg-surface-container-highest px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Wajib
                </span>
              )}
              {locked && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  <Lock className="h-3 w-3" />
                  Terkunci
                </span>
              )}
            </div>
            <div className="mt-2">
              <StatusBadge
                status={info.status}
                entityType="document"
                label={info.label}
                tone={info.tone}
              />
            </div>
          </div>
        </div>

        {document ? (
          <div className="rounded-xl bg-surface-container-low px-4 py-3">
            <p className="truncate text-sm font-medium" title={document.file_name}>
              {document.file_name || "Dokumen terunggah"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatFileSize(document.file_size)}
              {document.uploaded_at
                ? ` - Diunggah ${formatDateTimeId(document.uploaded_at)}`
                : ""}
            </p>
          </div>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            Dokumen ini belum diunggah. Lengkapi sebelum pendaftaran dikirim.
          </p>
        )}

        {info.status === "verified" && (
          <p className="text-sm leading-6 text-success">
            Dokumen sudah disetujui dan tidak perlu diganti.
          </p>
        )}

        {correctionMode && (
          <p className="text-sm leading-6 text-muted-foreground">
            {info.status === "rejected"
              ? "Mode revisi aktif untuk dokumen ini. Unggah file pengganti yang sesuai catatan."
              : "Pada mode revisi, hanya dokumen yang ditolak yang bisa diganti."}
          </p>
        )}

        {info.status === "rejected" && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-destructive">
              Catatan reviewer
            </p>
            <p className="mt-1 text-sm leading-6 text-destructive">
              {reviewerNote || "Catatan belum tersedia. Hubungi recruiter jika perlu klarifikasi."}
            </p>
          </div>
        )}

        {(onUpload || canPreview) && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 pt-4">
            {canPreview && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => onPreview(document)}
              >
                <Eye className="h-4 w-4" />
                Pratinjau
              </Button>
            )}
            {onUpload && (
              <Button
                type="button"
                variant={locked ? "outline" : "default"}
                size="sm"
                className="gap-2"
                onClick={onUpload}
              >
                <Upload className="h-4 w-4" />
                {actionLabel}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
