// Canonical "Validasi Evaluasi AI" marker.
//
// Single source of truth used across the app:
//   - Candidate Detail uses the full label (default).
//   - Recruiter list/table contexts use `compact` for dense layouts.
//
// Informative checkpoint only — never blocks other actions. The full label is
// always exposed via the native title tooltip, even in compact mode.

const META = {
  pending: {
    compact: "Menunggu",
    full: "Menunggu Validasi",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
  validated: {
    compact: "Tervalidasi",
    full: "Tervalidasi",
    className: "bg-green-500/15 text-green-700 dark:text-green-400",
  },
  needs_discussion: {
    compact: "Diskusi",
    full: "Perlu Diskusi",
    className: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  },
};

export default function AiValidationBadge({ status, compact = false, className = "" }) {
  if (!status || !META[status]) {
    return <span className="text-muted-foreground text-xs">-</span>;
  }
  const meta = META[status];
  return (
    <span
      title={meta.full}
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${meta.className} ${className}`}
    >
      {compact ? meta.compact : meta.full}
    </span>
  );
}
