import { Sparkles } from "lucide-react";

// "AI Recommended" decision-support badge. Intentionally scoped to the
// Announcements page only — the AI recommendation is surfaced where the final
// pass/fail decision is made, not during earlier review steps. Uses a soft
// green outline so it reads as a hint, not as a final decision.
export default function CandidateRecommendationBadge({ className = "" }) {
  return (
    <span
      title="Above the configured threshold — AI decision support only"
      className={`inline-flex items-center gap-1 rounded-full border border-green-500/40 bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-green-700 dark:text-green-400 ${className}`}
    >
      <Sparkles className="h-3 w-3" />
      AI Recommended
    </span>
  );
}
