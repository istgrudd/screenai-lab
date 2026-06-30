import { ArrowUpRight } from "lucide-react";

// Single technical test guidebook shared by every division, surfaced to accepted
// candidates both here and in the announcement email. This link is mirrored in the
// backend email template (backend/services/email_templates.py
// TECHNICAL_TEST_GUIDEBOOK_URL); update both places if it ever changes.
export const TECHNICAL_TEST_GUIDEBOOK_URL =
  "https://drive.google.com/file/d/1aoU46dtBDew9-TjSc6GRfHznsnWfWi0O/view?usp=sharing";

/**
 * Fixed next-step block shown to accepted candidates: technical test guidance plus
 * the guidebook link. The copy intentionally matches the accepted announcement email.
 */
export default function TechnicalTestCallout() {
  return (
    <div className="rounded-xl border border-success/30 bg-card px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-success">
        Next step — Technical Test
      </p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        You have advanced to the Technical Test stage. The guidebook below contains
        the task for each division along with the submission instructions and
        deadline — please read it carefully before you begin.
      </p>
      <a
        href={TECHNICAL_TEST_GUIDEBOOK_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary underline underline-offset-2"
      >
        Open the Technical Test guidebook
        <ArrowUpRight className="h-4 w-4" />
      </a>
    </div>
  );
}
