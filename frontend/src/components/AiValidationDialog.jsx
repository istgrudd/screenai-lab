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
            {needsDiscussion ? "Mark as Needs Discussion" : "Mark as Validated"}
          </DialogTitle>
          <DialogDescription>
            {needsDiscussion
              ? "Mark the AI evaluation result as needing further discussion. A note is required."
              : "Mark that you've reviewed the AI evaluation result and it looks correct. Note optional."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label>Validation Note {needsDiscussion ? "(required)" : "(optional)"}</Label>
          <Textarea
            placeholder={
              needsDiscussion
                ? "Explain why the AI evaluation result needs discussion…"
                : "Additional note (optional)…"
            }
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
          {needsDiscussion && !noteValid && (
            <p className="text-xs text-destructive">
              A note is required for the Needs Discussion status.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !noteValid}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…
              </>
            ) : needsDiscussion ? (
              "Mark as Needs Discussion"
            ) : (
              "Save Validation"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
