# API Reference

Endpoint-by-endpoint reference for ScreenAI Lab.

Unless noted otherwise, endpoints are mounted under `/api/...` and return the standard envelope:

```json
{ "success": true, "data": "<payload>", "error": null }
```

Error responses generally use FastAPI's standard shape:

```json
{ "detail": "..." }
```

Authenticated requests must include:

```http
Authorization: Bearer <token>
```

**Roles:** `candidate` · `recruiter` · `super_admin`.

**Role shorthand:**

| Symbol | Meaning |
|---|---|
| 🔓 | Public, no auth required |
| 🔐 | Any authenticated user |
| 👤 | Candidate only |
| 👀 | Recruiter or super_admin |
| 👑 | Super_admin only |

---

## Important Conventions

### Division enum

```text
big_data | cyber_security | game_tech | gis
```

### Application status enum

```text
draft | submitted | screening | announced_pass | announced_fail
```

### Recruitment phase enum

```text
UPCOMING | SUBMISSION | EVALUATION | ANNOUNCEMENT | CLOSED
```

### Non-standard envelope exception

`POST /api/recruiter/evaluate/batch` returns some fields outside `data`:

```json
{
  "success": true,
  "data": { "queued": 5, "results": [], "errors": [] },
  "evaluated_count": 5,
  "skipped_count": 2,
  "warning": null,
  "error": null
}
```

The frontend helper `evaluateBatch()` intentionally bypasses the generic wrapper so `evaluated_count`, `skipped_count`, and `warning` are not dropped.

---

## Auth (`/api/auth/*`)

Source: [`backend/routers/auth.py`](../backend/routers/auth.py)

### 🔓 `POST /api/auth/register`

Registers a candidate account. Role is always forced to `candidate`.

Rate limit: `5/minute`.

**Body**

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

**Response 201**

```json
{
  "access_token": "jwt...",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "email": "candidate@students.telkomuniversity.ac.id",
    "full_name": "Budi Santoso",
    "nim": "1031234567890",
    "faculty": "Informatics",
    "major": "Software Engineering",
    "year": 2023,
    "whatsapp": null,
    "role": "candidate",
    "is_active": true
  }
}
```

**Errors**

- `409` if email already registered.
- `409` if NIM already registered.
- `422` if payload validation fails. NIM must be a numeric string of at least 10 digits.

### 🔓 `POST /api/auth/login`

Rate limit: `10/minute`.

**Body**

```json
{ "email": "candidate@students.telkomuniversity.ac.id", "password": "min8chars" }
```

**Response 200**

Same data shape as register.

**Errors**

- `401` invalid credentials.
- `403` account deactivated.

### 🔐 `POST /api/auth/logout`

Server-side no-op. Client must discard JWT.

**Response 200**

```json
{ "message": "Logged out" }
```

### 🔐 `GET /api/auth/me`

Returns the authenticated user profile.

### 👑 `POST /api/auth/admin/reset-password`

Super-admin assisted password reset. This changes the stored password hash but does not invalidate already-issued JWTs.

**Body**

```json
{ "user_id": 12, "new_password": "new-min8-password" }
```

**Response 200**

```json
{ "user_id": 12, "email": "user@example.com", "message": "Password has been reset." }
```

**Errors**

- `404` target user not found.

---

## Users (`/api/users/*`)

Source: [`backend/routers/users.py`](../backend/routers/users.py)

### 🔐 `GET /api/users/me`

Returns current profile enriched with candidate application state.

**Response 200**

```json
{
  "id": 1,
  "email": "candidate@example.com",
  "full_name": "Budi Santoso",
  "nim": "1031234567890",
  "faculty": "Informatics",
  "major": "Software Engineering",
  "year": 2023,
  "whatsapp": "62812...",
  "division": "big_data",
  "application_status": "draft",
  "role": "candidate",
  "is_active": true
}
```

For recruiter/super_admin, `division` and `application_status` are `null`.

### 🔐 `PUT /api/users/me`

Updates current user's profile. Every field is optional; only sent fields update.

**Body**

```json
{
  "full_name": "Budi Santoso",
  "email": "candidate@example.com",
  "whatsapp": "62812...",
  "nim": "1031234567890",
  "faculty": "Informatics",
  "major": "Software Engineering",
  "year": 2023,
  "division": "big_data",
  "password": "new-min8-password"
}
```

**Rules**

- `full_name`, `email`, `whatsapp`, and `password` remain editable in every phase.
- `nim`, `faculty`, `major`, `year` lock once application status is past `draft`.
- `division` locks as soon as any application exists, including `draft`.
- Sending `division` as a candidate with no application creates a draft application.
- Non-candidates cannot set `division`.

**Errors**

- `403` locked field attempted; body includes `locked_fields`.
- `400` non-candidate sent `division`.
- `409` duplicate email or NIM.

### 👑 `GET /api/users`

Paginated user list.

**Query**

| Param | Meaning |
|---|---|
| `page` | 1-indexed page, default 1 |
| `limit` | 1-100, default 20 |
| `role` | optional role filter |
| `q` | substring search over email/full_name/NIM |

**Response 200**

```json
{ "page": 1, "limit": 20, "total": 42, "items": [] }
```

### 👑 `PUT /api/users/{user_id}/role`

**Body**

```json
{ "role": "candidate" }
```

Self-demotion/change is blocked with `400`.

### 👑 `PUT /api/users/{user_id}/deactivate`

Sets `is_active=false`. Self-deactivation is blocked with `400`.

### 👑 `PUT /api/users/{user_id}/reactivate`

Sets `is_active=true`.

---

## Applications (`/api/applications/*`, `/api/recruiter/applications`, `/api/my-applications`)

Source: [`backend/routers/applications.py`](../backend/routers/applications.py), [`backend/routers/candidates.py`](../backend/routers/candidates.py)

### 👤 `POST /api/applications`

Creates a draft application. Current implementation allows one application per user globally.

**Body**

```json
{ "division": "big_data" }
```

**Response 201**

```json
{
  "id": 1,
  "user_id": 10,
  "division": "big_data",
  "status": "draft",
  "submitted_at": null,
  "created_at": "2026-05-27T00:00:00+00:00",
  "documents_count": 0
}
```

**Errors**

- `409` if user already has an application. `detail` includes `application_id` and current `status`.

### 👤 `GET /api/applications/my`

Returns the current candidate's application.

**Errors**

- `404` if no application exists.

### 👤 `POST /api/applications/{application_id}/submit`

Final submit. Irreversible from candidate side.

**Response 200**

Application object with `status="submitted"`.

**Required conditions**

- Current user owns the application.
- Application status is `draft`.
- There is an active recruitment period.
- Active period's current phase is `SUBMISSION`.
- All six required documents exist.

**Side effects**

- Sets `status=submitted`.
- Sets `submitted_at`.
- Stamps `period_id` from active recruitment period.
- Schedules `run_submit_anonymization(application_id, SessionLocal)` as a FastAPI BackgroundTask. The task opens and closes its own DB session.

**Errors**

- `404` application not found.
- `403` not owner.
- `409` already submitted / no longer draft.
- `403` no active recruitment period.
- `403` current phase is not `SUBMISSION`.
- `400` missing required documents; `detail` includes `missing` and `required` arrays.

### 🔐 `GET /api/applications/{application_id}/swot-text`

Returns plain text extracted from the uploaded SWOT PDF.

**Response 200**

```json
{
  "application_id": 1,
  "document_id": 99,
  "file_name": "swot.pdf",
  "text": "...",
  "page_count": 2,
  "source": "cache"
}
```

`source` can be:

| Value | Meaning |
|---|---|
| `cache` | Read from `CandidateDocument.raw_text` created by submit-time processing |
| `live` | Cache missing; backend fell back to inline PyMuPDF extraction |

**Rules**

- Candidate can only access their own application.
- Recruiter/super_admin can access any application.
- SWOT is highlight-only: not anonymized and not used for score.

**Errors**

- `403` candidate accessing someone else's application.
- `404` application not found.
- `404` SWOT document missing.
- `422` live extraction failed.

### 👀 `GET /api/recruiter/applications`

Recruiter dashboard list.

**Query**

| Param | Meaning |
|---|---|
| `division` | optional Division enum |
| `status` | optional ApplicationStatus enum |

**Response 200**

Array of application rows with extra fields:

```json
{
  "id": 1,
  "division": "big_data",
  "status": "screening",
  "doc_completeness_pct": 100,
  "rank": 3,
  "is_recommended": true,
  "candidate": {
    "user_id": 10,
    "full_name": "Budi Santoso",
    "email": "candidate@example.com",
    "nim": "1031234567890",
    "faculty": "Informatics",
    "major": "Software Engineering",
    "year": 2023
  },
  "evaluation": {
    "candidate_id": 5,
    "anonymous_id": "CAND-abc123",
    "composite_score": 82.5,
    "language_score": null,
    "language_bonus": 0,
    "status": "scored"
  }
}
```

**Notes**

- Draft applications are omitted by default.
- Rank is computed within the filtered result set.
- `is_recommended` is visual only: `rank <= active_period.threshold_n`.

### 👤 `GET /api/my-applications`

Candidate-owned pipeline records. Scores are redacted until `Candidate.status == "scored"`.

---

## Documents (`/api/documents/*`)

Source: [`backend/routers/documents.py`](../backend/routers/documents.py), [`backend/utils/file_storage.py`](../backend/utils/file_storage.py)

### 👤 `POST /api/documents/upload/{doc_type}`

Uploads or replaces one document for the candidate's draft application.

**Path `doc_type`**

```text
cv | khs | ktm | motivation_letter | swot | supporting_docs
```

**Body**

Multipart form:

```text
file=<File>
```

**Response 201**

```json
{
  "id": 1,
  "application_id": 1,
  "doc_type": "cv",
  "file_name": "cv.pdf",
  "file_size": 123456,
  "uploaded_at": "2026-05-27T00:00:00+00:00",
  "is_verified": false
}
```

**Validation**

| Document | MIME | Max size |
|---|---|---|
| CV | `application/pdf` | 5 MB |
| KHS | `application/pdf` | 5 MB |
| KTM | `application/pdf`, `image/jpeg`, `image/png` | 2 MB |
| Motivation Letter | `application/pdf` | 5 MB |
| SWOT | `application/pdf` | 5 MB |
| Supporting Docs | `application/pdf` | 10 MB |

The backend validates both declared MIME and magic bytes/file signature for supported types.

**Errors**

- `404` no application exists.
- `403` application is no longer draft.
- `415` unsupported MIME.
- `413` file too large.
- `400` empty file or content does not match declared type.

### 👤 `PUT /api/documents/{doc_id}/replace`

Replaces an existing uploaded document. Same validation as upload.

**Errors**

- `404` doc not found.
- `403` not owner or application already submitted.

### 🔐 `GET /api/documents/{application_id}`

Lists documents for an application plus required document types and upload limits.

Candidate can only read their own application. Recruiter/super_admin can read any.

### 🔐 `GET /api/documents/{doc_id}/file`

Streams raw file via `FileResponse`.

**Errors**

- `404` doc/app missing.
- `403` not allowed.
- `410` DB row exists but file missing on disk.

### 👀 `PUT /api/documents/{doc_id}/verify`

Recruiter/super_admin toggles verification flag.

**Body**

```json
{ "is_verified": true }
```

Used mainly for supporting documents manual verification.

---

## Recruitment Periods (`/api/periods/*`)

Source: [`backend/routers/periods.py`](../backend/routers/periods.py)

### 👑 `POST /api/periods`

Creates a new active recruitment period and deactivates other periods in the same transaction.

**Body**

```json
{
  "name": "MBC Recruitment 2026",
  "start_date": "2026-06-01T00:00:00Z",
  "submission_end_date": "2026-06-10T23:59:59Z",
  "evaluation_end_date": "2026-06-20T23:59:59Z",
  "end_date": "2026-06-25T23:59:59Z",
  "threshold_n": 10
}
```

**Response 201**

`PeriodOut`, including `current_phase` and `phases`.

**Errors**

- `400` start date is not in the future.
- `422` invalid date order. Required order: `start < submission_end < evaluation_end < end`.

### 🔓 `GET /api/periods/active`

Returns active period plus `evaluation_prompt`.

`evaluation_prompt` is true when the current phase is `EVALUATION` and no candidate in the active period has been scored yet.

**Errors**

- `404` no active period.

### 👀 `GET /api/periods/active/stats`

Returns submitted-application counts for the active period.

```json
{
  "period_id": 1,
  "total_submitted": 40,
  "by_division": {
    "big_data": 10,
    "cyber_security": 12,
    "game_tech": 8,
    "gis": 10
  }
}
```

### 👑 `GET /api/periods`

Lists all periods, newest-first, with `application_count`.

### 👑 `PUT /api/periods/{period_id}`

Updates mutable period fields.

Mutable fields:

```text
name | end_date | submission_end_date | evaluation_end_date | threshold_n | is_active
```

`start_date` is immutable after creation.

Setting `is_active=true` deactivates other periods in the same transaction.

### 👑 `PUT /api/periods/{period_id}/close`

Closes a period early by setting `is_active=false` and `end_date=now`.

---

## Rubrics (`/api/rubrics/*`)

Source: [`backend/routers/rubrics.py`](../backend/routers/rubrics.py)

All endpoints are recruiter+.

### 👀 `POST /api/rubrics`

Creates a rubric. Dimensions may be empty for division-seeded placeholders.

**Body**

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

**Errors**

- `400` dimension weights do not sum to 1.0 ± 0.01.

### 👀 `GET /api/rubrics`

Optional query: `division`.

Returns lightweight list with `dimension_count`.

### 👀 `GET /api/rubrics/{rubric_id}`

Returns full rubric with dimensions.

### 👀 `PUT /api/rubrics/{rubric_id}`

Replaces rubric data. Existing dimensions are dropped and recreated atomically.

### 👀 `DELETE /api/rubrics/{rubric_id}`

Deletes rubric and cascaded children.

---

## Candidates (`/api/candidates/*`)

Source: [`backend/routers/candidates.py`](../backend/routers/candidates.py)

Recruiter+ unless noted otherwise.

### 👀 `GET /api/candidates`

Optional query: `rubric_id`.

Returns ranked candidates. When `rubric_id` is provided, includes dimension score summary.

### 👀 `GET /api/candidates/{candidate_id}`

Returns candidate detail:

- `composite_score`, `language_score`, `language_bonus`, `cefr_level`;
- `profile_summary`;
- cross-linked `application`;
- revealed `user_profile` for recruiter review;
- processed `documents`;
- `dimension_scores` with evidence, justification, override status, and override reason.

### 👀 `PUT /api/candidates/{candidate_id}/scores/{dim_score_id}`

Overrides one dimension score.

**Body**

```json
{ "score": 85, "reason": "Manual review found stronger evidence in portfolio." }
```

**Response 200**

```json
{
  "candidate_id": 5,
  "dimension_score_id": 12,
  "old_score": 70,
  "new_score": 85,
  "new_weighted_score": 34,
  "new_composite_score": 82.5,
  "reason": "Manual review found stronger evidence in portfolio."
}
```

**Side effects**

- Clamps score to 0–100.
- Validates rubric weights before mutation.
- Recomputes weighted score and composite score.
- Sets `is_override=true` and `override_reason`.
- Writes `AuditLog(action_type="score_override")` in the same transaction.

---

## Recruiter Evaluation (`/api/recruiter/evaluate/batch`, `/api/recruiter/results/{id}`)

Source: [`backend/routers/evaluate_batch.py`](../backend/routers/evaluate_batch.py), [`backend/services/evaluation_service.py`](../backend/services/evaluation_service.py)

### 👀 `POST /api/recruiter/evaluate/batch`

Runs division-based batch evaluation.

**Body**

```json
{ "division": "big_data", "application_ids": null, "force": false }
```

`division` is Pydantic-validated as a `Division` enum.

**Response 200**

Non-standard envelope:

```json
{
  "success": true,
  "data": { "queued": 5, "results": [], "errors": [] },
  "evaluated_count": 5,
  "skipped_count": 2,
  "warning": "Evaluasi dijalankan di luar window evaluasi resmi.",
  "error": null
}
```

**Rules**

- Always restricted to applications in selected division with status `submitted`.
- `force=false`: skip applications whose linked candidate already has `composite_score`.
- `force=true`: re-score already-scored candidates, but still only if application status is `submitted`.
- Successful application evaluations move application status to `screening`.
- Evaluation outside `EVALUATION` phase is allowed but returns a soft `warning`.

**Pipeline summary**

```text
KTM validate -> KHS parse -> ensure Candidate -> cached/inline NER
-> build rubric-augmented prompt -> async DeepSeek LLM call -> store DimensionScore rows
```

**Errors**

- `404` no rubric for division.
- `400` rubric has zero dimensions.
- `400` rubric weights do not sum to 1.0.
- `500` unrecognized setup errors are logged server-side and returned with a sanitized detail.
- Per-candidate pipeline failures are collected in `data.errors` while the batch response can still be `200`.

### 👀 `GET /api/recruiter/results/{application_id}`

Returns `null` if no `Candidate` exists yet. Otherwise returns evaluation result with dimension scores.

---

## Announcements (`/api/announcements/*`)

Source: [`backend/routers/announcements.py`](../backend/routers/announcements.py)

### 👀 `POST /api/announcements`

Per-application publish path. Kept for manual correction/backward compatibility; bulk publish is the main recruiter flow.

**Body**

```json
{ "application_id": 1, "result": "pass", "notes": "Optional note" }
```

**Side effects**

- Sets status to `announced_pass` or `announced_fail`.
- Writes `AuditLog(action_type="announcement")`.

**Errors**

- `400` result not `pass` or `fail`.
- `404` application not found.
- `409` application status cannot be announced.

### 👀 `POST /api/announcements/bulk`

Primary publish flow.

Rate limit: `10/minute` per user/IP key.

**Body**

```json
{
  "division": "big_data",
  "period_id": 1,
  "passed_application_ids": [1, 2, 3]
}
```

**Response 200**

```json
{ "announced_pass": 3, "announced_fail": 7, "division": "big_data", "period_id": 1 }
```

**Rules**

- Scope is applications in `(division, period_id)` with evaluated statuses: `screening`, `announced_pass`, `announced_fail`.
- `submitted` but unevaluated applications are not touched.
- Every ID in `passed_application_ids` must belong to scope.
- Within scope: passed IDs become `announced_pass`; others become `announced_fail`.
- One `AuditLog(action_type="bulk_announcement")` is written per actual status change.
- Non-super-admin users can only bulk announce during `ANNOUNCEMENT` phase.
- Super Admin bypasses the phase gate for correction.

**Errors**

- `404` period not found.
- `403` phase is not `ANNOUNCEMENT` for recruiter.
- `400` invalid passed application IDs.

### 👤 `GET /api/announcements/my`

Candidate result endpoint.

**Possible responses**

```json
{ "status": "no_application", "result": null, "notes": null, "announced_at": null }
```

```json
{ "status": "pending", "result": null, "notes": null, "announced_at": null }
```

```json
{ "status": "announced_pass", "result": "pass", "notes": null, "announced_at": "2026-05-27T00:00:00+00:00" }
```

`notes` and `announced_at` are derived from the latest matching `AuditLog` with action type `announcement` or `bulk_announcement`.

---

## Legacy Compatibility Endpoints

These endpoints are **not the Lab pipeline** and should not be used by new code. They remain mounted temporarily for Capstone compatibility, old scripts, or debugging comparisons.

### 👤 `POST /api/upload`

Source: [`backend/routers/upload.py`](../backend/routers/upload.py)

Deprecated replacement: `POST /api/documents/upload/{doc_type}`.

**Deprecation signals**

```http
Deprecation: true
X-Deprecated-Message: POST /api/upload is deprecated; use POST /api/documents/upload/{doc_type} instead.
```

### 👀 `POST /api/evaluate`

Source: [`backend/routers/evaluation.py`](../backend/routers/evaluation.py)

Deprecated replacement: `POST /api/recruiter/evaluate/batch`.

**Deprecation signals**

```http
Deprecation: true
X-Deprecated-Message: POST /api/evaluate is deprecated; use POST /api/recruiter/evaluate/batch instead.
```

---

## Health (`/api/health`)

Source: [`backend/main.py`](../backend/main.py)

### 🔓 `GET /api/health`

**Response 200**

```json
{ "status": "healthy", "version": "0.1.0" }
```

Used by VPS monitoring / uptime checks.

---

## Frontend Page Routes

Source: [`frontend/src/App.jsx`](../frontend/src/App.jsx)

| Path | Element | Roles |
|---|---|---|
| `/login` | LoginPage | public |
| `/register` | RegisterPage | public |
| `/` | Recruiter dashboard or candidate redirect | any authenticated |
| `/dashboard` | Candidate dashboard | candidate |
| `/profile` | Candidate profile | candidate |
| `/documents` | Candidate document wizard | candidate |
| `/review` | Final review | candidate |
| `/submitted` | Submitted confirmation | candidate |
| `/result` | Candidate result | candidate |
| `/my-applications` | Candidate application history | candidate |
| `/upload` | Legacy upload page | candidate |
| `/rubrics` | Rubric config | recruiter, super_admin |
| `/candidates/:id` | Candidate detail | recruiter, super_admin |
| `/recruiter/profile` | Recruiter profile | recruiter, super_admin |
| `/admin/users` | User management | super_admin |
| `/admin/periods` | Recruitment period management | super_admin |
| `/admin/profile` | Admin profile | super_admin |
