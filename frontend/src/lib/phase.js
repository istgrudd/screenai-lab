/**
 * Helpers for the phase-aware UI introduced in Task 13.3.
 *
 * Phases (mirror backend `get_current_phase`):
 *   UPCOMING / SUBMISSION / EVALUATION / ANNOUNCEMENT / CLOSED
 *
 * Phase is computed by the backend and returned as `current_phase` on
 * GET /api/periods/active and on each row of GET /api/periods. The frontend
 * never derives it locally — it just renders.
 */

export const PHASES = {
  UPCOMING: "UPCOMING",
  SUBMISSION: "SUBMISSION",
  EVALUATION: "EVALUATION",
  ANNOUNCEMENT: "ANNOUNCEMENT",
  CLOSED: "CLOSED",
};

export const PHASE_LABEL = {
  UPCOMING: "Belum dibuka",
  SUBMISSION: "Pendaftaran",
  EVALUATION: "Evaluasi AI",
  ANNOUNCEMENT: "Pengumuman",
  CLOSED: "Selesai",
};

/** Tailwind class set for the phase badge — colour per spec 13.3.4. */
export const PHASE_BADGE_CLASS = {
  UPCOMING:
    "bg-slate-500/15 text-slate-700 border-slate-500/30 dark:text-slate-300",
  SUBMISSION:
    "bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-300",
  EVALUATION:
    "bg-yellow-500/15 text-yellow-700 border-yellow-500/30 dark:text-yellow-300",
  ANNOUNCEMENT:
    "bg-green-500/15 text-green-700 border-green-500/30 dark:text-green-300",
  CLOSED:
    "bg-gray-500/15 text-gray-700 border-gray-500/30 dark:text-gray-300",
};
