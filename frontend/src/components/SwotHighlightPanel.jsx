import { useEffect, useState } from "react";
import { AlertCircle, FileText, Loader2, RefreshCcw } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSwotText } from "@/lib/api";

/**
 * Read-only panel that extracts the plain text of a candidate's SWOT PDF
 * and renders it as a scrollable block. Not scored by the pipeline — shown
 * to recruiters purely as qualitative context (PRD §D-05).
 */
export default function SwotHighlightPanel({ applicationId }) {
  const [state, setState] = useState({ status: "idle", text: "", error: null });

  async function fetchText() {
    setState({ status: "loading", text: "", error: null });
    try {
      const data = await getSwotText(applicationId);
      setState({ status: "ready", text: data.text || "", error: null, fileName: data.file_name });
    } catch (err) {
      setState({ status: "error", text: "", error: err.message || "Failed to load SWOT" });
    }
  }

  useEffect(() => {
    if (applicationId) fetchText();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  const missing = state.status === "error" && /not found|404/i.test(state.error || "");

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" />
            SWOT Highlight
          </CardTitle>
          <CardDescription>
            Extracted text from the candidate's SWOT document. Not part of the AI score.
          </CardDescription>
        </div>
        {state.status === "ready" && (
          <Button variant="ghost" size="sm" onClick={fetchText} className="gap-2">
            <RefreshCcw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {state.status === "loading" && (
          <div className="py-8 flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Extracting SWOT text…
          </div>
        )}
        {state.status === "error" && (
          <div className="py-8 flex items-start gap-3 rounded-lg border border-dashed px-4">
            <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5" />
            <div className="text-sm text-muted-foreground">
              {missing
                ? "Candidate has not uploaded a SWOT document yet."
                : `Could not extract SWOT text: ${state.error}`}
            </div>
          </div>
        )}
        {state.status === "ready" && (
          <>
            {state.fileName && (
              <p className="text-xs text-muted-foreground mb-2">
                Source: <span className="font-medium text-foreground">{state.fileName}</span>
              </p>
            )}
            {state.text.trim().length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground italic">
                SWOT PDF contained no extractable text (might be a scanned image).
              </div>
            ) : (
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed font-sans">
                {state.text}
              </pre>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
