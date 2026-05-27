# API Reference

Endpoint-by-endpoint reference for ScreenAI Lab. All endpoints are mounted under `/api/...` and return the envelope:

```json
{ "success": true, "data": <payload>, "error": null }
```

Error responses use FastAPI's standard `{ "detail": "..." }` shape; auth errors include `WWW-Authenticate: Bearer` for 401s. JWT must be sent as `Authorization: Bearer <token>` on protected routes.

**Roles:** `candidate` · `recruiter` · `super_admin`. "Recruiter+" means recruiter or super_admin.

> Where the `data` payload is described, the field-name convention follows the actual response key in source. All datetime fields are ISO 8601 in UTC (`+00:00`).

---

## Conventions

| Symbol | Meaning |
|---|---|
| 🔓 | Public — no auth required |
| 🔐 | Authenticated user (any role) |
| 👤 | Candidate-only |
| 👀 | Recruiter or super_admin |
| 👑 | Super_admin only |

---

## Auth (`/api/auth/*`)

Source: [backend/routers/auth.py](../backend/routers/auth.py).

### 🔓 `POST /api/auth/register`
- **Body** ([RegisterRequest](../backend/routers/auth.py#L39)):
  ```json
  {
    "email": "candidate@students.telkomuniversity.ac.id",
    "password": "min8chars",
    "full_name": "Budi Santoso",
    "nim": "1031234567890",
    "faculty": "Informatics",
    "major": "Software Engineering",
    "year": 2023
  }
  ```
- **Response 201:** `{ access_token, token_type: "bearer", user: <UserOut> }`.
- **Errors:** 409 if `email` or `nim` already registered. 422 if NIM fails `^\d{10,}$`.
- **Notes:** Role is forced to `candidate`. Email is lowercased.

### 🔓 `POST /api/auth/login`
- **Body:** `{ email, password }`.
- **Response 200:** same shape as register.
- **Errors:** 401 invalid credentials. 403 if account is deactivated.

### 🔐 `POST /api/auth/logout`
- **Response 200:** `{ message: "Logged out" }`.
- **Notes:** No-op server-side. Client must discard the JWT.

### 🔐 `GET /api/auth/me`
- **Response 200:** `<UserOut>` (id, email, full_name, nim, faculty, major, year, whatsapp, role, is_active).

---

## Users (`/api/users/*`)

Source: [backend/routers/users.py](../backend/routers/users.py).

### 🔐 `GET /api/users/me`
- **Response 200** (`MeOut`): includes `division` (derived from latest application) and `application_status` so the UI can lock fields appropriately.

### 🔐 `PUT /api/users/me`
- **Body** ([ProfileUpdate](../backend/routers/users.py#L113)) — all fields optional, only sent fields update:
  ```json
  {
    "full_name": "...", "email": "...", "whatsapp": "...",
    "nim": "...", "faculty": "...", "major": "...", "year": 2023,
    "division": "big_data", "password": "..."
  }
  ```
- **Response 200:** updated `<MeOut>`.
- **Errors:**
  - 403 — attempting to change locked fields. After SUBMIT, `nim/faculty/major/year` are locked. As soon as *any* application exists (even DRAFT), `division` is locked. Response body lists offending `locked_fields`.
  - 400 — non-candidate sending `division`.
  - 409 — duplicate email or NIM.
- **Side effects:** sending `division` for a candidate without an application creates a DRAFT application on the fly.

### 👑 `GET /api/users`
- **Query:** `page` (≥1, default 1), `limit` (1-100, default 20), `role?` (`UserRole`), `q?` (substring on email/full_name/NIM).
- **Response 200:** `{ page, limit, total, items: [<UserAdminOut>] }`.

### 👑 `PUT /api/users/{user_id}/role`
- **Body:** `{ role: "super_admin" | "recruiter" | "candidate" }`.
- **Response 200:** updated `<UserAdminOut>`.
- **Errors:** 400 if target == self.

### 👑 `PUT /api/users/{user_id}/deactivate`
- **Response 200:** updated `<UserAdminOut>` (is_active=false).
- **Errors:** 400 if target == self.

### 👑 `PUT /api/users/{user_id}/reactivate`
- **Response 200:** updated `<UserAdminOut>`.

---

## Applications (`/api/applications/*`, `/api/my-applications`, `/api/recruiter/applications`)

Source: [backend/routers/applications.py](../backend/routers/applications.py), [backend/routers/candidates.py](../backend/routers/candidates.py).

### 👤 `POST /api/applications`
- **Body:** `{ division: "big_data" | "cyber_security" | "game_tech" | "gis" }`.
- **Response 201** (`ApplicationOut`): `{ id, user_id, division, status: "draft", submitted_at: null, created_at, documents_count: 0 }`.
- **Errors:** 409 if user already has an application — body includes `application_id` and current `status`.

### 👤 `GET /api/applications/my`
- **Response 200:** `<ApplicationOut>`.
- **Errors:** 404 if no application exists.

### 🔐 `GET /api/applications/{application_id}/swot-text`
- **Response 200:** `{ application_id, document_id, file_name, text, page_count }`.
- **Errors:** 403 if candidate accessing someone else's application. 404 if no SWOT uploaded. 422 if PyMuPDF extraction fails.
- **Notes:** Recruiter+ may read any application. Extraction is not cached.

### 👤 `POST /api/applications/{application_id}/submit`
- **Response 200:** `<ApplicationOut>` (status now `submitted`).
- **Errors:**
  - 404 — application not found.
  - 403 — not the owner.
  - 409 — application already submitted.
  - 403 — no active recruitment period (`Tidak ada periode rekrutasi yang aktif saat ini.`).
  - 403 — active period not in SUBMISSION phase (Indonesian phase-aware messages).
  - 400 — required documents missing; body contains `missing` array and `required` list.
- **Side effects:** stamps `submitted_at`, sets `period_id` to active period, schedules `run_submit_anonymization` BackgroundTask.

### 👀 `GET /api/recruiter/applications`
- **Query:** `division?` (Division enum), `status?` (ApplicationStatus enum, alias `status`).
- **Response 200:** array of rows; each is `<ApplicationOut>` extended with:
  ```json
  {
    "doc_completeness_pct": 100,
    "rank": 3,             // 1-based per division within the filtered set, null if not scored
    "is_recommended": true, // rank ≤ active_period.threshold_n
    "candidate": { "user_id", "full_name", "email", "nim", "faculty", "major", "year" },
    "evaluation": {
      "candidate_id", "anonymous_id", "composite_score",
      "language_score", "language_bonus", "status"
    }
  }
  ```
- **Notes:** Default omits DRAFT applications. Ranks are computed within the *filtered* result set (changing `division` filter changes ranks).

### 👤 `GET /api/my-applications`
- **Response 200:** array of pipeline records owned by the current candidate. `composite_score`/`language_score`/`cefr_level` are `null` while `Candidate.status != "scored"`.

---

## Documents (`/api/documents/*`)

Source: [backend/routers/documents.py](../backend/routers/documents.py).

### 👤 `POST /api/documents/upload/{doc_type}`
- **Path:** `doc_type` ∈ `cv | khs | ktm | motivation_letter | swot | supporting_docs`.
- **Body:** multipart `file=<File>`.
- **Response 201:** serialized document `{ id, application_id, doc_type, file_name, file_size, uploaded_at, is_verified }`.
- **Errors:**
  - 404 — no application; create one first.
  - 403 — application past DRAFT (locked).
  - 415 — MIME not in allowed list (per-doc — see [MODULE_ANALYSIS § 5](MODULE_ANALYSIS.md#5-document-upload--storage)).
  - 413 — exceeds size limit.
  - 400 — empty file.
- **Behaviour:** if a Document for `(application, doc_type)` exists, the row is updated and disk file replaced; otherwise inserted.

### 👤 `PUT /api/documents/{doc_id}/replace`
- **Body:** multipart `file=<File>`.
- **Response 200:** serialized document.
- **Errors:** 404 (doc not found), 403 (not your application or already submitted).

### 🔐 `GET /api/documents/{application_id}`
- **Response 200:**
  ```json
  {
    "application_id": 12,
    "documents": [...],
    "required_types": ["cv","khs","ktm","motivation_letter","swot","supporting_docs"],
    "limits": {
      "cv": { "max_bytes": 5242880, "allowed_mime": ["application/pdf"] },
      "ktm": { "max_bytes": 2097152, "allowed_mime": ["application/pdf","image/jpeg","image/png"] },
      "...": "..."
    }
  }
  ```
- **Errors:** 403 if candidate accessing another's application; 404 if application missing.

### 🔐 `GET /api/documents/{doc_id}/file`
- **Response 200:** raw file via `FileResponse` with appropriate `Content-Type` (`application/pdf`, `image/jpeg`, `image/png`, or `application/octet-stream`).
- **Errors:** 404 (doc not found / app missing), 403 (not yours), 410 (DB row exists but disk file missing).

### 👀 `PUT /api/documents/{doc_id}/verify`
- **Body:** `{ is_verified: bool }`.
- **Response 200:** serialized document.
- **Notes:** Used by recruiter to mark D-06 (Dokumen Pendukung) as verified.

---

## Recruitment Periods (`/api/periods/*`)

Source: [backend/routers/periods.py](../backend/routers/periods.py).

### 👑 `POST /api/periods`
- **Body** ([PeriodCreate](../backend/routers/periods.py#L40)):
  ```json
  {
    "name": "MBC Recruitment 2026",
    "start_date": "2026-04-01T00:00:00Z",
    "submission_end_date": "2026-04-15T23:59:59Z",
    "evaluation_end_date": "2026-04-25T23:59:59Z",
    "end_date": "2026-04-30T23:59:59Z",
    "threshold_n": 10
  }
  ```
- **Response 201:** `<PeriodOut>` with `current_phase` and `phases`.
- **Errors:**
  - 422 — date ordering violations (start < submission_end < evaluation_end < end).
  - 400 — `start_date` not in the future.
- **Side effects:** all other periods become `is_active=false` in the same transaction.

### 🔓 `GET /api/periods/active`
- **Response 200:** `<PeriodOut>` with extra `evaluation_prompt: bool`. The flag is true iff phase==EVALUATION AND no candidate in the period has been scored yet.
- **Errors:** 404 if no active period (`Tidak ada periode rekrutasi yang aktif`).

### 👀 `GET /api/periods/active/stats`
- **Response 200:** `{ period_id, total_submitted, by_division: { big_data, cyber_security, game_tech, gis } }`. `total_submitted` = applications past DRAFT in the active period.
- **Errors:** 404 if no active period.

### 👑 `GET /api/periods`
- **Response 200:** array of `<PeriodOut>` ordered newest-first, each with `application_count`.

### 👑 `PUT /api/periods/{period_id}`
- **Body:** any subset of `{ name, end_date, submission_end_date, evaluation_end_date, threshold_n, is_active }`.
- **Response 200:** updated `<PeriodOut>`.
- **Errors:** 422 if the resulting four-date order is invalid. 404 if not found.
- **Notes:**
  - `start_date` is **immutable** (no field on schema).
  - Setting `is_active=true` deactivates every other period in the same transaction.

### 👑 `PUT /api/periods/{period_id}/close`
- **Response 200:** `<PeriodOut>` (`is_active=false`, `end_date=now_utc`).
- **Errors:** 400 if the period is already inactive.

---

## Rubrics (`/api/rubrics/*`)

Source: [backend/routers/rubrics.py](../backend/routers/rubrics.py). All endpoints recruiter+.

### 👀 `POST /api/rubrics`
- **Body** ([RubricCreate](../backend/routers/rubrics.py#L37)):
  ```json
  {
    "name": "Big Data Rubric",
    "position": "Big Data Division",
    "division": "big_data",
    "description": "...",
    "dimensions": [
      { "name": "Technical", "weight": 0.4, "description": "...", "indicators": ["..."] },
      { "name": "Communication", "weight": 0.3, "indicators": ["..."] },
      { "name": "Leadership", "weight": 0.3 }
    ]
  }
  ```
- **Response 200:** `<Rubric>` with embedded dimensions.
- **Errors:** 400 if dimension weights don't sum to 1.0 (±0.01).
- **Notes:** `dimensions` may be empty (allowed for division-seeded rubrics that recruiters fill in later).

### 👀 `GET /api/rubrics`
- **Query:** `division?` (Division enum) — restrict to one division.
- **Response 200:** lightweight list with `dimension_count` (no dimension details).

### 👀 `GET /api/rubrics/{rubric_id}`
- **Response 200:** full rubric with dimensions.
- **Errors:** 404.

### 👀 `PUT /api/rubrics/{rubric_id}`
- **Body** ([RubricUpdate](../backend/routers/rubrics.py#L53)) — same shape as create. Existing dimensions are dropped and recreated atomically.
- **Response 200:** updated rubric.
- **Errors:** 404 / 400 (weight sum).

### 👀 `DELETE /api/rubrics/{rubric_id}`
- **Response 200:** `{ deleted_id }`.
- **Notes:** Cascades to dimensions and dimension_scores.

---

## Candidates (`/api/candidates/*`)

Source: [backend/routers/candidates.py](../backend/routers/candidates.py). Recruiter+.

### 👀 `GET /api/candidates`
- **Query:** `rubric_id?` — filter to candidates against this rubric.
- **Response 200:** ranked array; when `rubric_id` is provided, includes `dimension_scores` per candidate. Always includes CEFR level and language fields.

### 👀 `GET /api/candidates/{candidate_id}`
- **Response 200:** detailed candidate including:
  - `composite_score`, `language_score`, `language_bonus`, `cefr_level`, `language_certificate` (or null), `profile_summary`, `created_at`.
  - Cross-link `application` (id/division/status/submitted_at) and `user_profile` (full_name/email/nim/...).
  - `documents`: list with `sections_detected` and `entities` array.
  - `dimension_scores`: full justification + evidence + override info.
- **Errors:** 404.

### 👀 `PUT /api/candidates/{candidate_id}/scores/{dim_score_id}`
- **Body:** `{ score: float, reason: string }`.
- **Response 200:** `{ candidate_id, dimension_score_id, old_score, new_score, new_weighted_score, new_composite_score, reason }`.
- **Side effects:** clamps score to 0–100, sets `is_override=true`, recomputes candidate composite as `Σ(weighted_scores) + language_bonus`.
- **Notes:** No audit log written today (Task 14.3 outstanding).

---

## Recruiter Evaluation (`/api/recruiter/evaluate/batch`, `/api/recruiter/results/{id}`)

Source: [backend/routers/evaluate_batch.py](../backend/routers/evaluate_batch.py). Recruiter+.

### 👀 `POST /api/recruiter/evaluate/batch`
- **Body** ([EvaluateBatchRequest](../backend/routers/evaluate_batch.py#L31)):
  ```json
  { "division": "big_data", "application_ids": null, "force": false }
  ```
- **Response 200** (envelope is *non-standard* — extra fields outside `data`):
  ```json
  {
    "success": true,
    "data": { "queued": 5, "results": [...], "errors": [...] },
    "evaluated_count": 5,
    "skipped_count": 2,
    "warning": "Evaluasi dijalankan di luar window evaluasi resmi." | null,
    "error": null
  }
  ```
- **Errors:**
  - 404 — no rubric for this division.
  - 400 — rubric has zero dimensions.
  - 422 — any other ValueError from the pipeline.
- **Behaviour:**
  - Always restricts to applications in `division` with `status == SUBMITTED`.
  - When `force=false`, skips those whose Candidate already has a non-null composite_score.
  - On success, applications transition to `SCREENING`.
  - `warning` is non-null when no active period exists or the active period isn't in EVALUATION phase — evaluation still runs.

### 👀 `GET /api/recruiter/results/{application_id}`
- **Response 200:** `null` if no Candidate exists yet, otherwise:
  ```json
  {
    "application_id", "candidate_id", "anonymous_id",
    "composite_score", "profile_summary", "status",
    "language_score", "language_bonus",
    "dimension_scores": [
      {
        "id", "dimension_id", "dimension_name",
        "score", "weighted_score", "weight",
        "justification", "evidence", "is_override"
      }
    ]
  }
  ```
- **Errors:** 404 if `application_id` not found.

---

## Announcements (`/api/announcements/*`)

Source: [backend/routers/announcements.py](../backend/routers/announcements.py).

### 👀 `POST /api/announcements`
- **Body:** `{ application_id, result: "pass" | "fail", notes? }`.
- **Response 200:** `{ application_id, status, result, notes, announced_at }`.
- **Errors:**
  - 400 — `result` not in `("pass","fail")`.
  - 404 — application not found.
  - 409 — application status not in `{SUBMITTED, SCREENING, ANNOUNCED_PASS, ANNOUNCED_FAIL}`.
- **Side effects:** sets status to `announced_pass`/`announced_fail`, writes `AuditLog(action_type="announcement")`.
- **Notes:** No phase gate on this endpoint (only the bulk endpoint has one).

### 👀 `POST /api/announcements/bulk`
- **Body:** `{ division: Division, period_id: int, passed_application_ids: int[] }`.
- **Response 200:** `{ announced_pass, announced_fail, division, period_id }`.
- **Errors:**
  - 404 — period not found.
  - 403 — phase != ANNOUNCEMENT (super_admin bypasses this).
  - 400 — any id in `passed_application_ids` doesn't belong to scope (wrong division/period or not yet evaluated).
- **Behaviour:**
  - Scope = `(Application.division == X AND Application.period_id == Y AND Application.status IN {SCREENING, ANNOUNCED_PASS, ANNOUNCED_FAIL})`. SUBMITTED-but-not-evaluated applications are intentionally untouched.
  - Within scope: id ∈ passed → `announced_pass`, else → `announced_fail`.
  - One audit-log row per actual status *change* (no-ops generate no log).
  - Single `db.commit()` at end (transactional).

### 👤 `GET /api/announcements/my`
- **Response 200:**
  - When announced: `{ status: "announced_pass"|"announced_fail", result: "pass"|"fail", notes, announced_at }`.
  - When still pending: `{ status: "pending", result: null, notes: null, announced_at: null }`.
  - When no application exists: `{ status: "no_application", ... null }`.
- **Notes:** `notes` and `announced_at` come from the most recent `AuditLog` with `action_type == "announcement"`. Bulk announces use `bulk_announcement` and won't populate these fields.

---

## Legacy (Capstone) (`/api/upload`, `/api/evaluate`)

> Deprecated in spirit (per CLAUDE.md). Still mounted; not yet header-flagged.

### 👤 `POST /api/upload`
Source: [backend/routers/upload.py](../backend/routers/upload.py).
- **Body:** multipart `files=<PDF>[]` plus optional `rubric_id` form field.
- **Response 200:** `{ uploaded_count, candidates: [...] }`.
- **Behaviour:** for each file detects EPrT certificate vs CV; on CV runs full extract → normalize → anonymize and stores raw + anonymized JSON to `data/extracted/` and `data/anonymized/`. Candidate is created with `status="anonymized"` and the optional rubric_id.
- **Notes:** off-nav from the modern UI; Phase 1 candidate portal uses `/api/documents/upload/{doc_type}` instead.

### 👀 `POST /api/evaluate`
Source: [backend/routers/evaluation.py](../backend/routers/evaluation.py).
- **Body:** `{ rubric_id: int }`.
- **Response 200:** `{ rubric_id, rubric_name, evaluated_count, error_count, results, errors }`.
- **Behaviour:** processes only candidates with `Candidate.status == "anonymized"` for that rubric, sequentially; calls `evaluate_candidate` and `store_evaluation_results`. Skips candidates without an anonymized CV CandidateDocument.
- **Notes:** rubric-id-driven (not division-based); superseded by `/api/recruiter/evaluate/batch`.

---

## Health (`/api/health`)

Source: [backend/main.py](../backend/main.py#L105).

### 🔓 `GET /api/health`
- **Response 200:** `{ success: true, data: { status: "healthy", version: "0.1.0" }, error: null }`.
- **Notes:** Intended as the health endpoint for the VPS reverse proxy / uptime monitor (curl + cron, Uptime Kuma, etc).

---

## Frontend Page Routes (for cross-reference)

Source: [frontend/src/App.jsx](../frontend/src/App.jsx).

| Path | Element | Roles |
|---|---|---|
| `/login` | LoginPage | public |
| `/register` | RegisterPage | public |
| `/` | DashboardPage (recruiter+admin) or `Navigate` to `/dashboard` (candidate) | any auth |
| `/dashboard` | candidate DashboardPage | candidate |
| `/profile` | candidate ProfilePage | candidate |
| `/documents` | candidate DocumentsPage | candidate |
| `/review` | candidate ReviewPage | candidate |
| `/submitted` | candidate SubmittedPage | candidate |
| `/result` | candidate ResultPage | candidate |
| `/my-applications` | MyApplicationsPage | candidate |
| `/upload` | UploadPage (legacy) | candidate |
| `/rubrics` | RubricConfigPage | recruiter, super_admin |
| `/candidates/:id` | CandidateDetailPage | recruiter, super_admin |
| `/recruiter/profile` | recruiter ProfilePage | recruiter, super_admin |
| `/admin/users` | AdminPage | super_admin |
| `/admin/periods` | RecruitmentPeriodPage | super_admin |
| `/admin/profile` | admin ProfilePage | super_admin |
| `*` | `<Navigate to="/" replace />` | — |
