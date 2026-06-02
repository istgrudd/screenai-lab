import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// Dialog for the recruiter "Validasi Evaluasi AI" checkpoint. `mode` decides
// whether the note is optional (validated) or required (needs_discussion).
// onSubmit receives the trimmed note string and should return a promise.
export default function AiValidationDialog({ open, mode, onOpenChange, onSubmit }) {
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const needsDiscussion = mode === "needs_discussion";

  // Clear the note as the dialog closes so the next open (any mode) starts
  // blank — avoids resetting state inside an effect.
  const handleOpenChange = (next) => {
    if (!next) setNote("");
    onOpenChange(next);
  };

  const noteValid = !needsDiscussion || note.trim().length > 0;

  const handleSubmit = async () => {
    if (!noteValid) return;
    setSubmitting(true);
    try {
      await onSubmit(note.trim());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {needsDiscussion ? "Tandai Perlu Diskusi" : "Tandai Tervalidasi"}
          </DialogTitle>
          <DialogDescription>
            {needsDiscussion
              ? "Tandai hasil evaluasi AI sebagai perlu dibahas lebih lanjut. Catatan wajib diisi."
              : "Tandai bahwa hasil evaluasi AI sudah Anda cek dan sesuai. Catatan opsional."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label>Catatan Validasi {needsDiscussion ? "(wajib)" : "(opsional)"}</Label>
          <Textarea
            placeholder={
              needsDiscussion
                ? "Jelaskan mengapa hasil evaluasi AI perlu didiskusikan…"
                : "Catatan tambahan (opsional)…"
            }
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
          {needsDiscussion && !noteValid && (
            <p className="text-xs text-destructive">
              Catatan wajib diisi untuk status Perlu Diskusi.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !noteValid}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Menyimpan…
              </>
            ) : needsDiscussion ? (
              "Tandai Perlu Diskusi"
            ) : (
              "Simpan Validasi"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
