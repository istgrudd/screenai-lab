import { useEffect, useState } from "react";
import { Download, Loader2, ExternalLink } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fetchDocumentBlob } from "@/lib/api";

/**
 * Document preview modal that fetches the file via authenticated fetch()
 * and renders the resulting Blob. Never exposes the raw endpoint via
 * <a href> or <img src>, which can't carry the Authorization header.
 * (Resolves Task 4/5 Flag 1.)
 *
 * Props:
 *   open, onClose   — dialog control
 *   document        — { id, file_name, doc_type } from the documents list
 */
export default function DocumentPreviewDialog({ open, onClose, document: doc }) {
  const [state, setState] = useState({ status: "idle", url: null, mime: null, error: null });

  useEffect(() => {
    if (!open || !doc) return;

    let revoked = false;
    let activeUrl = null;
    Promise.resolve().then(async () => {
      setState({ status: "loading", url: null, mime: null, error: null });
      try {
        const { url, mime } = await fetchDocumentBlob(doc.id);
        if (revoked) {
          URL.revokeObjectURL(url);
          return;
        }
        activeUrl = url;
        setState({ status: "ready", url, mime, error: null });
      } catch (err) {
        if (!revoked) {
          setState({ status: "error", url: null, mime: null, error: err.message || "Failed to load" });
        }
      }
    });

    return () => {
      revoked = true;
      if (activeUrl) URL.revokeObjectURL(activeUrl);
    };
  }, [open, doc]);

  const triggerDownload = () => {
    if (!state.url) return;
    const a = window.document.createElement("a");
    a.href = state.url;
    a.download = doc?.file_name || `document-${doc?.id}`;
    window.document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const openInNewTab = () => {
    if (!state.url) return;
    window.open(state.url, "_blank", "noopener,noreferrer");
  };

  const isPdf = state.mime === "application/pdf";
  const isImage = state.mime?.startsWith("image/");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="truncate">{doc?.file_name || "Document"}</DialogTitle>
          <DialogDescription className="capitalize">
            {doc?.doc_type?.replace("_", " ")}
          </DialogDescription>
        </DialogHeader>

        {state.status === "loading" && (
          <div className="h-[60vh] flex items-center justify-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading…
          </div>
        )}

        {state.status === "error" && (
          <div className="h-[30vh] flex items-center justify-center text-sm text-destructive">
            Could not load document: {state.error}
          </div>
        )}

        {state.status === "ready" && (
          <div className="space-y-3">
            {isPdf && (
              <iframe
                src={state.url}
                title={doc?.file_name || "PDF preview"}
                className="w-full h-[70vh] rounded-lg border bg-muted"
              />
            )}
            {isImage && (
              <div className="max-h-[70vh] overflow-auto rounded-lg border bg-muted/40 p-4 flex items-center justify-center">
                <img
                  src={state.url}
                  alt={doc?.file_name || "Document preview"}
                  className="max-w-full h-auto"
                />
              </div>
            )}
            {!isPdf && !isImage && (
              <div className="rounded-lg border px-4 py-6 text-sm text-muted-foreground">
                Inline preview not available for this file type ({state.mime}). Use Download.
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={openInNewTab} className="gap-2">
                <ExternalLink className="w-4 h-4" />
                Open in new tab
              </Button>
              <Button size="sm" onClick={triggerDownload} className="gap-2">
                <Download className="w-4 h-4" />
                Download
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
