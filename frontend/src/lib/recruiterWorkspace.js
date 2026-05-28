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
    } else if (application?.status === "submitted") {
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
