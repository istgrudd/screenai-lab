// Shared status marker for "Validasi Evaluasi AI" — used in the recruiter
// candidates/evaluation tables and on the candidate detail page. This is an
// informative accountability checkpoint only; it never blocks other actions.

export const AI_VALIDATION_META = {
  pending: {
    label: "Menunggu Validasi",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
  validated: {
    label: "Tervalidasi",
    className: "bg-green-500/15 text-green-700 dark:text-green-400",
  },
  needs_discussion: {
    label: "Perlu Diskusi",
    className: "bg-red-500/15 text-red-700 dark:text-red-400",
  },
};

export default function AiValidationBadge({ status, className = "" }) {
  const meta = AI_VALIDATION_META[status] || AI_VALIDATION_META.pending;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${meta.className} ${className}`}
    >
      {meta.label}
    </span>
  );
}
