/**
 * API client — fetch wrapper for all backend endpoints.
 * Base URL: VITE_API_BASE_URL (falls back to http://127.0.0.1:8000/api for dev).
 */

import { getToken, removeToken } from "@/lib/auth";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api";

const PUBLIC_AUTH_ENDPOINTS = [
  "/auth/login",
  "/auth/register",
  "/auth/verify-email",
  "/auth/resend-verification",
  "/auth/forgot-password",
  "/auth/reset-password",
];

export class ApiError extends Error {
  constructor(message, { status = null, code = null, detail = null, body = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.body = body;
  }
}

function normalizeErrorPayload(payload, fallbackMessage, status = null) {
  const source =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload.detail ?? payload.error ?? payload.message ?? payload
      : payload;

  let code =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload.code ?? payload.error_code ?? null
      : null;
  let message = fallbackMessage;

  if (typeof source === "string") {
    message = source;
  } else if (Array.isArray(source)) {
    const validationMessages = source
      .map((item) => item?.msg || item?.message)
      .filter(Boolean);
    message = validationMessages.length
      ? validationMessages.join("; ")
      : fallbackMessage;
  } else if (source && typeof source === "object") {
    code = source.code ?? source.error_code ?? code;
    const nestedMessage = source.message ?? source.detail ?? source.error;
    if (typeof nestedMessage === "string") {
      message = nestedMessage;
    } else if (Array.isArray(nestedMessage)) {
      const validationMessages = nestedMessage
        .map((item) => item?.msg || item?.message)
        .filter(Boolean);
      message = validationMessages.length
        ? validationMessages.join("; ")
        : fallbackMessage;
    }
  }

  return {
    status,
    code,
    detail: source,
    body: payload,
    message: String(message || fallbackMessage),
  };
}

function createApiError(status, payload, fallbackMessage = `HTTP ${status}`) {
  const normalized = normalizeErrorPayload(payload, fallbackMessage, status);
  return new ApiError(normalized.message, normalized);
}

export function getApiErrorCode(error) {
  return error?.code || null;
}

export function getApiErrorMessage(error, fallbackMessage = "Request failed") {
  return error?.message || fallbackMessage;
}

async function parseResponseBody(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function shouldForceRelogin(endpoint, status) {
  if (status !== 401) return false;
  return !PUBLIC_AUTH_ENDPOINTS.some((publicEndpoint) =>
    endpoint.startsWith(publicEndpoint)
  );
}

function forceReloginIfNeeded(endpoint, status, token) {
  if (!shouldForceRelogin(endpoint, status)) return;
  if (token) removeToken();
  if (!window.location.pathname.startsWith("/login")) {
    window.location.assign("/login");
  }
}

/**
 * Generic fetch wrapper that handles JSON responses and errors.
 * Unwraps the { success, data, error } envelope.
 * Automatically attaches Authorization: Bearer <token> if present.
 */
async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const token = getToken();
  const config = {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  };

  const res = await fetch(url, config);
  const body = await parseResponseBody(res);

  if (!res.ok) {
    forceReloginIfNeeded(endpoint, res.status, token);
    throw createApiError(res.status, body);
  }

  const json = body;
  if (json?.success === false) {
    throw createApiError(res.status, json, "Unknown API error");
  }
  return json && Object.prototype.hasOwnProperty.call(json, "data")
    ? json.data
    : json;
}

// ── Auth ────────────────────────────────────────────────────────────────────

export async function login(email, password) {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

/**
 * Register a new candidate. All fields are required — Telkom-specific
 * student info is validated server-side (nim must be a numeric string
 * of at least 10 digits — see backend/routers/auth.py:_NIM_PATTERN).
 */
export async function register({
  email,
  password,
  fullName,
  nim,
  faculty,
  major,
  year,
}) {
  return request("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      full_name: fullName,
      nim,
      faculty,
      major,
      year: Number(year),
    }),
  });
}

export async function verifyEmail(code) {
  const params = new URLSearchParams({ code });
  return request(`/auth/verify-email?${params.toString()}`);
}

export async function resendVerification(email) {
  return request("/auth/resend-verification", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function forgotPassword(email) {
  return request("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(code, newPassword) {
  return request("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ code, new_password: newPassword }),
  });
}

export async function logoutApi() {
  return request("/auth/logout", { method: "POST" });
}

export async function getMe() {
  return request("/auth/me");
}

/**
 * GET /api/users/me — enriched profile including division (from active app)
 * and the current application_status (used by the candidate ProfilePage to
 * decide which fields are locked).
 */
export async function getMyProfile() {
  return request("/users/me");
}

/**
 * PUT /api/users/me — partial update.
 * Caller should omit (not send empty string) any field they don't want to
 * change. Password is special: only sent when the user fills it in.
 */
export async function updateMyProfile(payload) {
  return request("/users/me", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function listMyApplications() {
  return request("/my-applications");
}

// ── Application (Phase 1 candidate portal) ──────────────────────────────────

export async function createApplication(division) {
  return request("/applications", {
    method: "POST",
    body: JSON.stringify({ division }),
  });
}

export async function getMyApplication() {
  return request("/applications/my");
}

export async function submitApplication(applicationId) {
  return request(`/applications/${applicationId}/submit`, { method: "POST" });
}

// ── Documents (Phase 1 candidate portal) ────────────────────────────────────

export async function uploadApplicationDocument(docType, file) {
  const formData = new FormData();
  formData.append("file", file);
  return request(`/documents/upload/${docType}`, {
    method: "POST",
    body: formData,
  });
}

export async function replaceApplicationDocument(docId, file) {
  const formData = new FormData();
  formData.append("file", file);
  return request(`/documents/${docId}/replace`, {
    method: "PUT",
    body: formData,
  });
}

export async function listApplicationDocuments(applicationId) {
  return request(`/documents/${applicationId}`);
}

export function documentFileUrl(docId) {
  // File download needs the Authorization header; callers fetch it
  // manually where the auth interceptor runs. Exposed for <a href> fallbacks.
  return `${BASE_URL}/documents/${docId}/file`;
}

/**
 * Fetch a document with the auth header attached, returning a Blob URL.
 * Callers must revoke the URL when done: URL.revokeObjectURL(url).
 * Resolves to { url, mime, filename } so the caller can render in a
 * <iframe>/<img> or trigger a download without exposing the raw endpoint.
 */
export async function fetchDocumentBlob(docId) {
  const token = getToken();
  const endpoint = `/documents/${docId}/file`;
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await parseResponseBody(res);
    forceReloginIfNeeded(endpoint, res.status, token);
    throw createApiError(
      res.status,
      body,
      `Failed to load document (HTTP ${res.status})`
    );
  }
  const mime = res.headers.get("content-type") || "application/octet-stream";
  const disposition = res.headers.get("content-disposition") || "";
  const match = /filename\*?="?([^";]+)"?/i.exec(disposition);
  const filename = match ? decodeURIComponent(match[1]) : `document-${docId}`;
  const blob = await res.blob();
  return { url: URL.createObjectURL(blob), mime, filename };
}

export async function verifyDocument(docId, isVerified) {
  return request(`/documents/${docId}/verify`, {
    method: "PUT",
    body: JSON.stringify({ is_verified: isVerified }),
  });
}

export async function reviewDocument(docId, { status, reason = null }) {
  return request(`/documents/${docId}/review`, {
    method: "PUT",
    body: JSON.stringify({ status, reason }),
  });
}

export async function finalizeDocumentReview(applicationId) {
  return request(`/applications/${applicationId}/finalize-document-review`, {
    method: "POST",
  });
}

export async function getSwotText(applicationId) {
  return request(`/applications/${applicationId}/swot-text`);
}

// ── Recruiter: applications list ────────────────────────────────────────────

export async function listRecruiterApplications({ division, status } = {}) {
  const params = new URLSearchParams();
  if (division) params.set("division", division);
  if (status) params.set("status", status);
  const qs = params.toString();
  return request(`/recruiter/applications${qs ? `?${qs}` : ""}`);
}

export async function getRecruiterAnalytics({ division } = {}) {
  const params = new URLSearchParams();
  if (division && division !== "all") params.set("division", division);
  const qs = params.toString();
  return request(`/recruiter/analytics${qs ? `?${qs}` : ""}`);
}

// ── Super Admin: users management ───────────────────────────────────────────

export async function listUsers({ page = 1, limit = 20, role, q } = {}) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (role) params.set("role", role);
  if (q) params.set("q", q);
  return request(`/users?${params.toString()}`);
}

export async function getAdminAuditLogs({
  page = 1,
  limit = 20,
  action_type,
  recruiter_id,
  candidate_id,
  date_from,
  date_to,
} = {}) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  const optionalParams = {
    action_type,
    recruiter_id,
    candidate_id,
    date_from,
    date_to,
  };

  Object.entries(optionalParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      params.set(key, String(value).trim());
    }
  });

  return request(`/admin/audit-logs?${params.toString()}`);
}

export async function getAdminEmailNotifications({
  page = 1,
  limit = 20,
  notification_type,
  status,
  to_email,
  date_from,
  date_to,
} = {}) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  const optionalParams = {
    notification_type,
    status,
    to_email,
    date_from,
    date_to,
  };

  Object.entries(optionalParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      params.set(key, String(value).trim());
    }
  });

  return request(`/admin/email-notifications?${params.toString()}`);
}

export async function updateUserRole(userId, role) {
  return request(`/users/${userId}/role`, {
    method: "PUT",
    body: JSON.stringify({ role }),
  });
}

export async function deactivateUser(userId) {
  return request(`/users/${userId}/deactivate`, { method: "PUT" });
}

export async function reactivateUser(userId) {
  return request(`/users/${userId}/reactivate`, { method: "PUT" });
}

/**
 * Super Admin only - send a password reset link for a user.
 * The admin never sets or sees the user's new password.
 * @param {number} userId
 */
export async function sendAdminPasswordResetLink(userId) {
  return request(`/auth/admin/users/${userId}/send-password-reset`, {
    method: "POST",
  });
}

// ── Upload ──────────────────────────────────────────────────────────────────

/**
 * Upload one or more PDF files.
 * @param {File[]} files
 * @param {number|null} rubricId - optional rubric to associate candidates with
 * @returns {Promise<{uploaded_count: number, candidates: Array}>}
 */
export async function uploadFiles(files, rubricId = null) {
  const formData = new FormData();
  files.forEach((f) => formData.append("files", f));
  if (rubricId != null) {
    formData.append("rubric_id", String(rubricId));
  }
  return request("/upload", { method: "POST", body: formData });
}

// ── Candidates ──────────────────────────────────────────────────────────────

/**
 * List candidates, optionally filtered by rubric.
 * @param {number|null} rubricId
 */
export async function listCandidates(rubricId = null) {
  const qs = rubricId ? `?rubric_id=${rubricId}` : "";
  return request(`/candidates${qs}`);
}

/**
 * Get detailed info for a single candidate.
 * @param {number} candidateId
 */
export async function getCandidate(candidateId) {
  return request(`/candidates/${candidateId}`);
}

/**
 * Override a dimension score.
 * @param {number} candidateId
 * @param {number} dimScoreId — the DimensionScore primary key (id)
 * @param {number} score
 * @param {string} reason
 */
export async function overrideScore(candidateId, dimScoreId, score, reason) {
  return request(`/candidates/${candidateId}/scores/${dimScoreId}`, {
    method: "PUT",
    body: JSON.stringify({ score, reason }),
  });
}

/**
 * Update the recruiter "Validasi Evaluasi AI" marker for a candidate.
 * Informative checkpoint only — does not change the score or status.
 * @param {number} candidateId
 * @param {{ status: "validated"|"needs_discussion"|"pending", note?: string }} payload
 *   note is required when status is "needs_discussion".
 */
export async function updateCandidateAiValidation(candidateId, payload) {
  return request(`/candidates/${candidateId}/ai-validation`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

// ── Rubrics ─────────────────────────────────────────────────────────────────

export async function listRubrics() {
  return request("/rubrics");
}

export async function getRubric(rubricId) {
  return request(`/rubrics/${rubricId}`);
}

/**
 * Create a rubric.
 * @param {{ name: string, position: string, description?: string, dimensions: Array, division: name }} payload
 */
export async function createRubric(payload) {
  return request("/rubrics", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Update a rubric.
 */
export async function updateRubric(rubricId, payload) {
  return request(`/rubrics/${rubricId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteRubric(rubricId) {
  return request(`/rubrics/${rubricId}`, { method: "DELETE" });
}

// ── Evaluation ──────────────────────────────────────────────────────────────

/**
 * Trigger batch evaluation for a division (Phase 2: 202 + job_id).
 *
 * The endpoint no longer runs the pipeline inline — it validates, resolves the
 * eligible set, creates an `evaluation_jobs` row, and returns **202** with a
 * `job_id`. Poll progress via {@link getEvaluationJob} / {@link getActiveEvaluationJob}.
 *
 * Returns the `data` payload (`{ job_id, status, total }`) merged with
 * envelope-level fields surfaced for backward-compatible UI counters:
 *   job_id           — the created job's id (also in data)
 *   status           — "queued"
 *   _warning         — Task 13.2.2 soft phase warning (or null)
 *   evaluated_count  — number of eligible candidates queued this run (= total)
 *   skipped_count    — number skipped (already scored, force=False)
 * These sit outside `data` in the envelope, so the generic request wrapper
 * would drop them; this helper does its own fetch to surface them.
 *
 * A duplicate trigger while a job is active throws an {@link ApiError} with
 * `status === 409` (DB-level partial unique index).
 * @param {string} division  — e.g. "big_data"
 * @param {object} [opts]
 * @param {number[]|null} [opts.applicationIds] — specific IDs, or null for all
 * @param {boolean} [opts.force] — Task 13.5.1 re-evaluate already-scored apps
 */
export async function evaluateBatch(division, opts = {}) {
  const { applicationIds = null, force = false } = opts;
  const token = getToken();
  const endpoint = "/recruiter/evaluate/batch";
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      division,
      application_ids: applicationIds,
      force,
    }),
  });
  const body = await parseResponseBody(res);
  if (!res.ok) {
    forceReloginIfNeeded(endpoint, res.status, token);
    throw createApiError(res.status, body);
  }
  const json = body;
  if (json.success === false) {
    throw createApiError(res.status, json, "Unknown API error");
  }
  return {
    ...(json.data || {}),
    _warning: json.warning ?? null,
    evaluated_count: json.evaluated_count ?? 0,
    skipped_count: json.skipped_count ?? 0,
    skipped_already_scored_count: json.skipped_already_scored_count ?? 0,
    skipped_unverified_count: json.skipped_unverified_count ?? 0,
    skipped_correction_count: json.skipped_correction_count ?? 0,
  };
}

/**
 * Get an evaluation job's live state by id (Phase 2 polling).
 * Returns { id, division, status, total, processed, succeeded, failed,
 * errors, force, created_at, started_at, finished_at, note }.
 * @param {number} jobId
 */
export async function getEvaluationJob(jobId) {
  return request(`/recruiter/evaluate/jobs/${jobId}`);
}

/**
 * Get the active (non-terminal) evaluation job for a division, or null when
 * none is running. Used on mount to resume polling after a page refresh.
 * @param {string} division — e.g. "big_data"
 */
export async function getActiveEvaluationJob(division) {
  return request(
    `/recruiter/evaluate/jobs/active?division=${encodeURIComponent(division)}`
  );
}

/**
 * Get evaluation result for an application (Task 8.3).
 * @param {number} applicationId
 */
export async function getEvaluationResult(applicationId) {
  return request(`/recruiter/results/${applicationId}`);
}

// ── Announcements ───────────────────────────────────────────────────────────

/**
 * Publish pass/fail announcement for a candidate (Task 9.1).
 * @param {number} applicationId
 * @param {"pass"|"fail"} result
 * @param {string|null} notes
 */
export async function createAnnouncement(applicationId, result, notes = null) {
  return request("/announcements", {
    method: "POST",
    body: JSON.stringify({
      application_id: applicationId,
      result,
      notes,
    }),
  });
}

/**
 * Get the candidate's own announcement status (Task 9.2).
 */
export async function getMyAnnouncement() {
  return request("/announcements/my");
}

/**
 * Bulk-announce per division + period (Task 12.4).
 * @param {{ division: string, periodId: number, passedApplicationIds: number[] }}
 */
export async function bulkAnnounce({ division, periodId, passedApplicationIds }) {
  return request("/announcements/bulk", {
    method: "POST",
    body: JSON.stringify({
      division,
      period_id: periodId,
      passed_application_ids: passedApplicationIds,
    }),
  });
}

// ── Recruitment Periods (Phase 2B) ───────────────────────────────────────────

/**
 * Get the active recruitment period.
 * Throws if there is no active period (404).
 */
export async function getActivePeriod() {
  return request("/periods/active");
}

/**
 * Recruiter+: submitted-application counts for the active period.
 * Throws 404 when no period is active.
 */
export async function getActivePeriodStats() {
  return request("/periods/active/stats");
}

/** Super Admin only — list all periods (with application_count). */
export async function listPeriods() {
  return request("/periods");
}

/**
 * Super Admin only — create a new period (auto-active, deactivates others).
 * @param {{name:string, start_date:string, submission_end_date:string,
 *   evaluation_end_date:string, end_date:string, threshold_n:number|null}} payload
 */
export async function createPeriod(payload) {
  return request("/periods", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Super Admin only — update a period.
 * Editable: name, end_date, submission_end_date, evaluation_end_date,
 * threshold_n, is_active.
 */
export async function updatePeriod(periodId, payload) {
  return request(`/periods/${periodId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

/** Super Admin only — close a period early. */
export async function closePeriod(periodId) {
  return request(`/periods/${periodId}/close`, { method: "PUT" });
}

// ── Health ───────────────────────────────────────────────────────────────────

export async function healthCheck() {
  return request("/health");
}
