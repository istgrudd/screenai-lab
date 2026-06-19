export const DIVISIONS = [
  { id: "all", label: "All divisions" },
  { id: "big_data", label: "Big Data" },
  { id: "cyber_security", label: "Cyber Security" },
  { id: "game_tech", label: "Game Technology" },
  { id: "gis", label: "GIS" },
];

export const WORKFLOW_DIVISIONS = DIVISIONS.filter((division) => division.id !== "all");

export const STATUSES = [
  { id: "all", label: "All statuses (non-draft)" },
  { id: "submitted", label: "Submitted" },
  { id: "document_review", label: "Document review" },
  { id: "correction_requested", label: "Correction requested" },
  { id: "verified", label: "Verified" },
  { id: "screening", label: "Screening" },
  { id: "announced_pass", label: "Passed" },
  { id: "announced_fail", label: "Not passed" },
];

export const EVALUATED_STATUSES = new Set([
  "screening",
  "announced_pass",
  "announced_fail",
]);

export const DIVISION_LABEL = Object.fromEntries(
  DIVISIONS.map((division) => [division.id, division.label])
);

export function formatDivision(division) {
  if (!division) return "-";
  return DIVISION_LABEL[division] || String(division).replace(/_/g, " ");
}

export function formatStatus(status) {
  if (!status) return "-";
  return String(status).replace(/_/g, " ");
}

export function candidateEvaluationId(application) {
  return application?.evaluation?.candidate_id ?? null;
}

export function isEvaluatedApplication(application) {
  return Boolean(application?.status && EVALUATED_STATUSES.has(application.status));
}

/**
 * True when the candidate already has an AI composite score stored.
 * Used to decide whether evaluation/validation UI is relevant for a row.
 */
export function isScoredApplication(application) {
  return application?.evaluation?.composite_score != null;
}

/**
 * Read the recruiter "Validasi Evaluasi AI" marker, tolerating either the
 * top-level field or the nested evaluation field. Returns null when the
 * candidate has not been evaluated yet.
 */
export function getAiValidationStatus(application) {
  if (!isScoredApplication(application)) return null;
  return (
    application?.ai_validation_status ??
    application?.evaluation?.ai_validation_status ??
    "pending"
  );
}

export function summarizeApplications(applications = []) {
  let scoredCount = 0;
  let announcedCount = 0;
  let pendingEvaluationCount = 0;
  let topScore = null;

  for (const application of applications) {
    const score = application?.evaluation?.composite_score;
    if (score != null) {
      scoredCount += 1;
      if (topScore == null || Number(score) > topScore) topScore = Number(score);
    } else if (application?.status === "verified") {
      pendingEvaluationCount += 1;
    }

    if (
      application?.status === "announced_pass" ||
      application?.status === "announced_fail"
    ) {
      announcedCount += 1;
    }
  }

  return {
    applicationCount: applications.length,
    scoredCount,
    announcedCount,
    pendingEvaluationCount,
    topScore,
  };
}

// --- Announcement decisions ------------------------------------------------

export const ANNOUNCE_DECISIONS = {
  PASS: "pass",
  FAIL: "fail",
  UNDECIDED: "undecided",
};

export const ANNOUNCE_DECISION_LABEL = {
  pass: "Passed",
  fail: "Not Passed",
  undecided: "Undecided",
};

/**
 * Candidates eligible for a pass/fail decision are exactly the evaluated ones
 * (screening or already announced). Others are not part of the publish scope.
 */
export function isAnnouncementEligible(application) {
  return isEvaluatedApplication(application);
}

/**
 * Ready-to-announce candidates are the ones bulk publish actually touches:
 * status === "screening" (evaluated but not yet announced). Already-announced
 * candidates are monitoring-only and must never enter the publish payload.
 */
export function isReadyToAnnounce(application) {
  return application?.status === "screening";
}

/**
 * Already-published candidates (announced_pass / announced_fail) — shown in a
 * read-only Published view, excluded from the decision payload.
 */
export function isAnnouncedApplication(application) {
  return (
    application?.status === "announced_pass" ||
    application?.status === "announced_fail"
  );
}

/**
 * Resolve the default decision for an eligible candidate.
 *  - Already announced rows mirror their published status.
 *  - Otherwise, when an AI recommendation is available (active period with a
 *    threshold), default to pass when recommended and fail when not.
 *  - With no recommendation signal, stay undecided so nothing is published by
 *    accident.
 */
export function defaultAnnouncementDecision(application, { recommendationAvailable } = {}) {
  const status = application?.status;
  if (status === "announced_pass") return ANNOUNCE_DECISIONS.PASS;
  if (status === "announced_fail") return ANNOUNCE_DECISIONS.FAIL;
  if (recommendationAvailable) {
    return application?.is_recommended
      ? ANNOUNCE_DECISIONS.PASS
      : ANNOUNCE_DECISIONS.FAIL;
  }
  return ANNOUNCE_DECISIONS.UNDECIDED;
}

export function sortRankedApplications(applications = []) {
  return [...applications].sort((a, b) => {
    const rankA = a.rank ?? Number.POSITIVE_INFINITY;
    const rankB = b.rank ?? Number.POSITIVE_INFINITY;
    if (rankA !== rankB) return rankA - rankB;
    const scoreA = a.evaluation?.composite_score ?? -1;
    const scoreB = b.evaluation?.composite_score ?? -1;
    return Number(scoreB) - Number(scoreA);
  });
}
