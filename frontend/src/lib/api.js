/**
 * API client — fetch wrapper for all backend endpoints.
 * Base URL: http://127.0.0.1:8000/api
 */

import { getToken, removeToken } from "@/lib/auth";

const BASE_URL = "http://127.0.0.1:8000/api";

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

  if (res.status === 401) {
    // Token missing / invalid / expired — force re-login.
    removeToken();
    if (!window.location.pathname.startsWith("/login")) {
      window.location.assign("/login");
    }
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail || body.error || JSON.stringify(body);
    } catch {
      // ignore parse error
    }
    throw new Error(detail);
  }

  const json = await res.json();
  if (json.success === false) {
    throw new Error(json.error || "Unknown API error");
  }
  return json.data;
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
 * student info is validated server-side (nim must match /^103\d{10}$/).
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

export async function logoutApi() {
  return request("/auth/logout", { method: "POST" });
}

export async function getMe() {
  return request("/auth/me");
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
  const res = await fetch(`${BASE_URL}/documents/${docId}/file`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 401) {
    removeToken();
    if (!window.location.pathname.startsWith("/login")) {
      window.location.assign("/login");
    }
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`Failed to load document (HTTP ${res.status})`);
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

// ── Rubrics ─────────────────────────────────────────────────────────────────

export async function listRubrics() {
  return request("/rubrics");
}

export async function getRubric(rubricId) {
  return request(`/rubrics/${rubricId}`);
}

/**
 * Create a rubric.
 * @param {{ name: string, position: string, description?: string, dimensions: Array }} payload
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
 * Trigger batch evaluation for a rubric (legacy Capstone).
 * @param {number} rubricId
 */
export async function runEvaluation(rubricId) {
  return request("/evaluate", {
    method: "POST",
    body: JSON.stringify({ rubric_id: rubricId }),
  });
}

/**
 * Trigger batch evaluation for a division (Task 8.1).
 * @param {string} division  — e.g. "big_data"
 * @param {number[]|null} applicationIds — specific IDs, or null for all
 */
export async function evaluateBatch(division, applicationIds = null) {
  return request("/recruiter/evaluate/batch", {
    method: "POST",
    body: JSON.stringify({
      division,
      application_ids: applicationIds,
    }),
  });
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

// ── Health ───────────────────────────────────────────────────────────────────

export async function healthCheck() {
  return request("/health");
}
