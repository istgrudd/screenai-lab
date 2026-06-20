import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronDown,
  CloudUpload,
  Copy,
  Download,
  FileText,
  Loader2,
  Replace,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  POSTER_CAPTION,
  POSTER_IMAGE_URL,
  TWIBBON_CAPTION,
  TWIBBON_TEMPLATE_URL,
} from "@/lib/supportingDocAssets";

function formatSize(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function CvTemplateDownloadPanel() {
  return (
    <details className="group rounded-xl border border-border bg-surface-container-low px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground">
        <span>Optional CV template</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
        <p className="text-sm leading-6 text-muted-foreground">
          This template is optional but recommended so your CV format is more
          standard and easier for recruiters to read.
        </p>
        <Button asChild variant="outline" size="sm" className="gap-2">
          <a href="/templates/mbc-cv-template.docx" download>
            <Download className="h-4 w-4" />
            Download CV Template
          </a>
        </Button>
      </div>
    </details>
  );
}

const SUPPORTING_DOC_CHECKLIST = [
  "Proof of following MBC's Instagram account.",
  "Proof of sharing the poster to your Instagram Story.",
  "Proof of sharing the poster and broadcasting it to 3 WhatsApp groups.",
  "Proof of your uploaded Twibbon on your own Instagram.",
];

function CaptionBox({ label, caption }) {
  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      toast.success(`${label} copied.`);
    } catch {
      toast.error("Failed to copy. Copy it manually from the text shown.");
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1.5"
          onClick={copyCaption}
        >
          <Copy className="h-3.5 w-3.5" />
          Copy
        </Button>
      </div>
      <Textarea
        readOnly
        value={caption}
        rows={3}
        className="resize-none bg-background text-muted-foreground"
      />
    </div>
  );
}

// Guidance for the final upload step: the supporting PDF must combine four
// engagement-proof screenshots into one file. Mirrors CvTemplateDownloadPanel's
// collapsible card + anchor-download pattern; defaults open since the checklist
// is required reading, not an optional extra.
function SupportingDocGuidancePanel() {
  return (
    <details
      className="group rounded-xl border border-border bg-surface-container-low px-4 py-3"
      open
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground">
        <span>What to include in the supporting PDF</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3 space-y-4 border-t border-border/60 pt-3">
        <div className="space-y-2">
          <p className="text-sm leading-6 text-muted-foreground">
            Combine these four screenshots into a single PDF and upload it here:
          </p>
          <ol className="space-y-1.5">
            {SUPPORTING_DOC_CHECKLIST.map((item, index) => (
              <li
                key={index}
                className="flex items-start gap-2 text-sm text-foreground"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                  {index + 1}
                </span>
                <span className="leading-6">{item}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="gap-2">
            <a href={POSTER_IMAGE_URL} download>
              <Download className="h-4 w-4" />
              Download Poster
            </a>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-2">
            <a href={TWIBBON_TEMPLATE_URL} download>
              <Download className="h-4 w-4" />
              Download Twibbon Template
            </a>
          </Button>
        </div>

        <div className="space-y-3">
          <CaptionBox label="Poster / WhatsApp caption" caption={POSTER_CAPTION} />
          <CaptionBox
            label="Twibbon Instagram caption"
            caption={TWIBBON_CAPTION}
          />
        </div>
      </div>
    </details>
  );
}

/**
 * One document upload step in the multi-step candidate flow.
 *
 * Handles: drag-and-drop, file-picker fallback, client-side MIME + size
 * checks (server re-validates), and uploaded-state with "Replace" affordance.
 *
 * Props:
 *   doc:            { label, doc_type, tip, max_bytes, allowed_mime }
 *   existing:       current uploaded document record (or null)
 *   locked:         boolean — disables all interaction (e.g., after submit)
 *   onUpload(file): async; parent handles the POST + updates `existing`
 */
export default function DocumentUploadStep({
  doc,
  existing,
  locked = false,
  lockedMessage = "Documents are locked after final submit.",
  onUpload,
}) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [working, setWorking] = useState(false);

  const allowedMime = useMemo(
    () => new Set(doc.allowed_mime),
    [doc.allowed_mime]
  );
  const accept = useMemo(
    () =>
      doc.allowed_mime
        .map((m) => {
          if (m === "application/pdf") return ".pdf";
          if (m === "image/jpeg") return ".jpg,.jpeg";
          if (m === "image/png") return ".png";
          return "";
        })
        .join(","),
    [doc.allowed_mime]
  );

  const handleFile = useCallback(
    async (file) => {
      if (locked || working) return;
      setWorking(true);
      try {
        await onUpload(file);
        toast.success(`${doc.label} uploaded.`);
      } catch (err) {
        toast.error(err.message || `Failed to upload ${doc.label}`);
      } finally {
        setWorking(false);
      }
    },
    [doc.label, locked, onUpload, working]
  );

  const pickFile = useCallback(
    (fileList) => {
      const file = Array.from(fileList || [])[0];
      if (!file) return;
      if (!allowedMime.has(file.type)) {
        toast.error(
          `Unsupported file type for ${doc.label}. Allowed: ${doc.allowed_mime.join(", ")}.`
        );
        return;
      }
      if (file.size > doc.max_bytes) {
        toast.error(
          `File exceeds the ${formatSize(doc.max_bytes)} limit for ${doc.label}.`
        );
        return;
      }
      handleFile(file);
    },
    [allowedMime, doc.allowed_mime, doc.label, doc.max_bytes, handleFile]
  );

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (locked) return;
    pickFile(e.dataTransfer.files);
  };

  const onChange = (e) => {
    pickFile(e.target.files);
    e.target.value = "";
  };

  const openPicker = () => {
    if (locked || working) return;
    inputRef.current?.click();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            {doc.label}
            {existing && (
              <Badge variant="default" className="gap-1 text-[10px] uppercase">
                <CheckCircle2 className="w-3 h-3" />
                Uploaded
              </Badge>
            )}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="font-medium text-foreground">Allowed:</span>{" "}
            {doc.allowed_mime
              .map((m) => m.replace("application/", "").replace("image/", "").toUpperCase())
              .join(" · ")}
            {" · "}
            <span className="font-medium text-foreground">Max:</span>{" "}
            {formatSize(doc.max_bytes)}
          </p>
        </div>
      </div>

      {doc.tip && (
        <div className="rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Tip:</span> {doc.tip}
        </div>
      )}

      {doc.doc_type === "cv" && <CvTemplateDownloadPanel />}

      {doc.doc_type === "supporting_docs" && <SupportingDocGuidancePanel />}

      {existing ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/30 p-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate" title={existing.file_name}>
                {existing.file_name}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatSize(existing.file_size)}
                {existing.uploaded_at && (
                  <>
                    {" · "}
                    {new Date(existing.uploaded_at).toLocaleString()}
                  </>
                )}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={locked || working}
            onClick={openPicker}
            className="gap-2 shrink-0"
          >
            {working ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Replace className="w-4 h-4" />
            )}
            Replace
          </Button>
        </div>
      ) : (
        <button
          type="button"
          disabled={locked || working}
          onDragOver={(e) => {
            e.preventDefault();
            if (!locked) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={openPicker}
          className={`w-full flex flex-col items-center justify-center gap-3 py-12 rounded-2xl border-2 border-dashed transition-colors ${
            dragOver
              ? "bg-primary/10 border-primary"
              : "border-border hover:bg-muted/50"
          } ${locked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
              dragOver ? "bg-primary/20" : "bg-muted"
            }`}
          >
            {working ? (
              <Loader2 className="w-7 h-7 animate-spin text-primary" />
            ) : (
              <CloudUpload
                className={`w-7 h-7 ${
                  dragOver ? "text-primary" : "text-muted-foreground"
                }`}
              />
            )}
          </div>
          <div className="text-center">
            <p className="text-sm font-medium">
              {working ? "Uploading…" : `Drop your ${doc.label} here`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              or click to browse your files
            </p>
          </div>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        onChange={onChange}
      />

      {locked && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <XCircle className="w-3.5 h-3.5" />
          {lockedMessage}
        </p>
      )}
    </div>
  );
}
