import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ANNOUNCE_DECISIONS } from "@/lib/recruiterWorkspace";

// Explicit pass/fail/undecided decision picker for the Announcements page.
// Replaces the old "selected pass" checkbox so a recruiter can mark every
// eligible candidate as Lolos / Tidak Lolos / Belum Diputuskan before publish.
export default function CandidateDecisionControl({
  value,
  onChange,
  disabled = false,
}) {
  if (disabled) {
    return <span className="text-xs text-muted-foreground">-</span>;
  }

  return (
    <Select value={value || ANNOUNCE_DECISIONS.UNDECIDED} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-[160px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANNOUNCE_DECISIONS.PASS}>Pass</SelectItem>
        <SelectItem value={ANNOUNCE_DECISIONS.FAIL}>Fail</SelectItem>
        <SelectItem value={ANNOUNCE_DECISIONS.UNDECIDED}>
          Undecided
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
