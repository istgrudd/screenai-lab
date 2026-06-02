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

JWTs issued before the user's latest password change are rejected by the auth
middleware. Clients should discard the token and sign in again after a password
change.

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
draft | submitted | document_review | correction_requested | verified | screening | announced_pass | announced_fail | cancelled
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
The account must verify email before login; this endpoint no longer returns
a normal access token.
IPK is intentionally not accepted during registration; candidates fill it
later through `PUT /api/users/me`.

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
  "success": true,
  "data": {
    "message": "Account created. Please verify your email before signing in.",
    "email": "candidate@students.telkomuniversity.ac.id",
    "verification_required": true
  },
  "error": null
}
```

**Errors**

- `409` if email already registered.
- `409` if NIM already registered.
- `503` if email sending is enabled but the verification email cannot be sent.
- `422` if payload validation fails. NIM must be a numeric string of at least 10 digits.

### 🔓 `POST /api/auth/login`

Rate limit: `10/minute`.

**Body**

```json
{ "email": "candidate@students.telkomuniversity.ac.id", "password": "min8chars" }
```

**Response 200**

```json
{
  "success": true,
  "data": {
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
      "ipk": null,
      "whatsapp": null,
      "role": "candidate",
      "is_active": true,
      "email_verified_at": "2026-05-29T10:15:00"
    }
  },
  "error": null
}
```

**Errors**

- `401` invalid credentials.
- `403` account deactivated.
- `403` candidate email not verified:

```json
{
  "detail": {
    "code": "EMAIL_NOT_VERIFIED",
    "message": "Please verify your email before signing in."
  }
}
```

Recruiter and `super_admin` login behavior is unchanged in Phase 3.

Tokens returned by login include standard expiry plus issued-at metadata. If
`users.password_changed_at` is newer than the token issue time, protected
endpoints return `401`.

### 🔓 `GET /api/auth/verify-email?code=...`

Verifies a candidate email using a one-time, expiring verification code.
The raw code is not stored in the database, and this endpoint does not return
an access token.

Rate limit: `20/minute`.

Production UX note: users should normally arrive via the frontend page
`/verify-email?code=...`. That page then calls this backend endpoint with the
same code. Email templates should not send production users directly to the
backend JSON endpoint.

**Response 200**

```json
{
  "success": true,
  "data": {
    "message": "Email verified. Please sign in.",
    "email": "candidate@students.telkomuniversity.ac.id"
  },
  "error": null
}
```

**Errors**

- `400 INVALID_VERIFICATION_CODE` if the code is invalid.
- `400 VERIFICATION_CODE_EXPIRED` if the code is expired.
- `400 VERIFICATION_CODE_USED` if the code has already been used.

### 🔓 `POST /api/auth/resend-verification`

Requests a new verification email. The response is intentionally generic for
existing, missing, already verified, and cooldown-limited accounts.

Rate limit: `5/minute`.

**Body**

```json
{ "email": "candidate@students.telkomuniversity.ac.id" }
```

**Response 200**

```json
{
  "success": true,
  "data": {
    "message": "If an unverified candidate account exists for this email, a verification email has been sent."
  },
  "error": null
}
```

### 🔓 `POST /api/auth/forgot-password`

Requests a self-service password reset email. The response is intentionally
generic for existing, missing, inactive, and cooldown-limited accounts.

Rate limit: `5/minute`.

**Body**

```json
{ "email": "user@example.com" }
```

**Response 200**

```json
{
  "success": true,
  "data": {
    "message": "If the account exists, a password reset email has been sent."
  },
  "error": null
}
```

### 🔓 `POST /api/auth/reset-password`

Resets a password using a one-time, expiring reset code. The raw reset code is
not stored in the database. This endpoint does not auto-login and does not
return an access token.

Rate limit: `10/minute`.

Production UX note: users should normally arrive via the frontend page
`/reset-password?code=...`. That page then submits the code and new password to
this backend endpoint.

**Body**

```json
{
  "code": "reset-code-from-email",
  "new_password": "new-min8-password"
}
```

**Response 200**

```json
{
  "success": true,
  "data": {
    "message": "Password has been reset. Please sign in again."
  },
  "error": null
}
```

**Errors**

- `400 INVALID_RESET_CODE` if the code is invalid.
- `400 RESET_CODE_EXPIRED` if the code is expired.
- `400 RESET_CODE_USED` if the code has already been used.
- `422` if `new_password` validation fails.

### 🔐 `POST /api/auth/logout`

Server-side no-op. Client must discard JWT.

**Response 200**

```json
{ "message": "Logged out" }
```

### 🔐 `GET /api/auth/me`

Returns the authenticated user profile.

### 👑 `POST /api/auth/admin/reset-password`

Super-admin assisted password reset. This changes the stored password hash and
updates `password_changed_at`, so already-issued JWTs for the target user are
rejected on subsequent protected requests.

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
  "ipk": 3.75,
  "whatsapp": "62812...",
  "division": "big_data",
  "application_status": "draft",
  "ipk_editable": true,
  "role": "candidate",
  "is_active": true,
  "email_verified_at": "2026-05-29T10:15:00"
}
```

For recruiter/super_admin, `division` and `application_status` are `null`,
and `ipk_editable` is `false`.

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
  "ipk": 3.75,
  "division": "big_data",
  "password": "new-min8-password"
}
```

**Rules**

- `full_name`, `whatsapp`, and `password` remain editable in every phase.
- Updating `password` sets `password_changed_at`; existing JWTs for that user are rejected after the update.
- `nim`, `faculty`, `major`, `year` lock once application status is past `draft`.
- `ipk` is optional at registration but required before final submit.
- `ipk` accepts numeric values from `0.00` to `4.00` with at most 2 decimals.
- `ipk` is editable before submit, locks after submit, and reopens only when application status is `correction_requested` and the KHS document is rejected.
- `division` locks as soon as any application exists, including `draft`.
- Sending `division` as a candidate with no application creates a draft application.
- Non-candidates cannot set `division`.
- Non-candidates cannot set `ipk`.
- Recruiters verify IPK only through KHS document review/rejection reasons; no recruiter endpoint edits candidate IPK.
- Phase 3: candidate email changes are temporarily blocked until email re-verification UI/flow is implemented. Sending the same email value is allowed.
- Recruiter and `super_admin` email changes keep the existing behavior with duplicate checks.

**Errors**

- `403` locked field attempted; body includes `locked_fields`.
- `403 CANDIDATE_EMAIL_CHANGE_REQUIRES_VERIFICATION_FLOW` if a candidate tries to change email:

```json
{
  "detail": {
    "code": "CANDIDATE_EMAIL_CHANGE_REQUIRES_VERIFICATION_FLOW",
    "message": "Candidate email changes are temporarily disabled until the email re-verification flow is available."
  }
}
```

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

Application object with `status="document_review"` and candidate-safe document-review progress.

**Required conditions**

- Current user owns the application.
- Application status is `draft`.
- There is an active recruitment period.
- Active period's current phase is `SUBMISSION`.
- Candidate profile is complete, including WhatsApp and IPK.
- All six required documents exist.

**Side effects**

- Sets `status=document_review`.
- Sets `submitted_at`.
- Stamps `period_id` from active recruitment period.
- Resets every submitted document to pending review.
- Logs/sends the `application_submitted` workflow notification.
- Does not run NER. NER is queued only after recruiter/super_admin finalizes document review as accepted.

**Errors**

- `404` application not found.
- `403` not owner.
- `409` already submitted / no longer draft.
- `403` no active recruitment period.
- `403` current phase is not `SUBMISSION`.
- `400` missing required documents; `detail` includes `missing` and `required` arrays.
- `400` missing required profile fields; `detail` includes `missing_fields`
  such as `["ipk"]` when IPK has not been filled.

### Recruiter+ `POST /api/applications/{application_id}/finalize-document-review`

Recruiter/super_admin finalizes document review for one application after every required document has been marked `verified` or `rejected`.

**Response 200**

Application object plus:

```json
{
  "rejected_document_types": ["khs"],
  "anonymization_queued": false
}
```

**Rules and side effects**

- Application must be in `document_review` or legacy `submitted`.
- If all required documents are verified, application becomes `verified` and NER anonymization is queued in a background task.
- If any required document is rejected, application becomes `correction_requested`; candidate can see rejected document types/reasons and can replace only those documents.
- Finalized rejected review logs/sends `document_rejected` workflow notification.
- Finalization writes `AuditLog(action_type="document_review_finalized")`.

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
| `cache` | Read from `CandidateDocument.raw_text` created by post-verification anonymization/cache processing |
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
  "ai_validation_status": "pending",
  "candidate": {
    "user_id": 10,
    "full_name": "Budi Santoso",
    "email": "candidate@example.com",
    "nim": "1031234567890",
    "faculty": "Informatics",
    "major": "Software Engineering",
    "year": 2023,
    "ipk": 3.75,
    "whatsapp": "62812..."
  },
  "evaluation": {
    "candidate_id": 5,
    "anonymous_id": "CAND-abc123",
    "composite_score": 82.5,
    "language_score": null,
    "language_bonus": 0,
    "status": "scored",
    "ai_validation_status": "pending"
  }
}
```

**Notes**

- Draft applications are omitted by default.
- Rank is computed within the filtered result set.
- `is_recommended` is visual only: `rank <= active_period.threshold_n`.
- `ai_validation_status` (`pending` | `validated` | `needs_discussion`) is the recruiter "Validasi Evaluasi AI" marker; it is `null` for applications with no Candidate row yet. It is informative only and does not gate announcement.

### 👤 `GET /api/my-applications`

Candidate-owned pipeline records. Scores are redacted until `Candidate.status == "scored"`.

---

## Recruiter Analytics (`/api/recruiter/analytics`)

Source: [`backend/routers/analytics.py`](../backend/routers/analytics.py)

### Recruiter+ `GET /api/recruiter/analytics`

Returns active-period recruitment metrics for recruiter and super_admin dashboards. Candidate access returns `403`.

**Query**

| Param | Meaning |
|---|---|
| `division` | optional Division enum filter |

**Response 200**

```json
{
  "active_period": { "id": 1, "name": "MBC Recruitment 2026", "current_phase": "SUBMISSION" },
  "filters": { "division": null },
  "summary": {
    "total_applications": 12,
    "submitted_or_later": 10,
    "total_verified": 3,
    "total_evaluated": 2,
    "total_announced": 0,
    "total_correction_requested": 1,
    "average_score": 78.5
  },
  "applicants_per_division": [],
  "funnel_counts": {},
  "document_completeness": {},
  "missing_documents_by_type": [],
  "evaluation_progress": {},
  "score_distribution": {},
  "demographics": {
    "faculty_distribution": [{ "label": "Fakultas Informatika", "count": 5, "percentage": 55.6 }],
    "major_distribution": [{ "label": "Data Science", "count": 3, "percentage": 33.3 }],
    "year_distribution": [{ "label": "2023", "count": 3, "percentage": 33.3 }],
    "ipk_distribution": [
      { "label": "0.00 - 2.49", "count": 1, "percentage": 11.1 },
      { "label": "2.50 - 2.99", "count": 1, "percentage": 11.1 },
      { "label": "3.00 - 3.49", "count": 2, "percentage": 22.2 },
      { "label": "3.50 - 4.00", "count": 3, "percentage": 33.3 },
      { "label": "Belum Diisi", "count": 2, "percentage": 22.2 }
    ]
  }
}
```

**`demographics`** is scoped to applications in the active period that are not `draft` and not `cancelled` (division filter applies). Each distribution item carries `label`, `count`, and `percentage`. `percentage` is computed over the full scoped population.

- `faculty_distribution`, `major_distribution` — sorted by count descending; missing/empty values are bucketed under `Unknown`.
- `year_distribution` — sorted by year descending, with `Unknown` last.
- `ipk_distribution` — derived from `User.ipk`, returned in a **fixed, count-independent order** so the IPK ranges stay stable:
  - `0.00 - 2.49`
  - `2.50 - 2.99`
  - `3.00 - 3.49`
  - `3.50 - 4.00`
  - `Belum Diisi` (candidate has no IPK recorded)

If there is no active period, the endpoint still returns `200` with zeroed metrics and `active_period: null`. In that case every demographic distribution (including `ipk_distribution`) is an empty array.

---

## Documents (`/api/documents/*`)

Source: [`backend/routers/documents.py`](../backend/routers/documents.py), [`backend/utils/file_storage.py`](../backend/utils/file_storage.py)

### 👤 `POST /api/documents/upload/{doc_type}`

Uploads or replaces one document for the candidate's draft application. During `correction_requested`, the same endpoint can replace only an existing rejected document type.

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
  "is_verified": false,
  "verification_status": "pending",
  "rejection_reason": null,
  "review_visibility": "visible"
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
- `403` application is no longer draft, except rejected-document replacement during `correction_requested`.
- `415` unsupported MIME.
- `413` file too large.
- `400` empty file or content does not match declared type.

### 👤 `PUT /api/documents/{doc_id}/replace`

Replaces an existing uploaded document. Same validation as upload.

During `correction_requested`, only documents with `verification_status="rejected"` are replaceable. Replacement resets the document to `pending`, clears rejection reason/reviewer metadata, invalidates stale NER cache where applicable, and returns the application to `document_review` when no rejected documents remain.

**Errors**

- `404` doc not found.
- `403` not owner, locked application, or non-rejected document during correction.

### 🔐 `GET /api/documents/{application_id}`

Lists documents for an application plus required document types and upload limits.

Candidate can only read their own application. Recruiter/super_admin can read any.

### 🔐 `GET /api/documents/{doc_id}/file`

Streams raw file via `FileResponse`.

**Errors**

- `404` doc/app missing.
- `403` not allowed.
- `410` DB row exists but file missing on disk.

### Recruiter+ `PUT /api/documents/{doc_id}/review`

Recruiter/super_admin marks one document as `verified` or `rejected`.

**Body**

```json
{ "status": "rejected", "reason": "KHS tidak terbaca dengan jelas." }
```

**Rules and side effects**

- Application must be in `document_review` or legacy `submitted`.
- `status` must be `verified` or `rejected`.
- `reason` is required for rejected documents.
- Candidate document listing masks in-flight per-document decisions before finalization.
- Writes `AuditLog(action_type="document_verification")`.

### 👀 `PUT /api/documents/{doc_id}/verify`

Compatibility endpoint that marks a document verified. It delegates to the same document-review service as `/review`.

**Body**

```json
{ "is_verified": true }
```

`is_verified=false` is rejected; use `PUT /api/documents/{doc_id}/review` for rejection or future status changes.

**Side effects**

- Writes `AuditLog(action_type="document_verification")` in the same transaction.
- Application must be in `document_review` or legacy `submitted`.
- Response shape is unchanged; no frontend-supplied reason is required for verification.

---

## Recruitment Periods (`/api/periods/*`)

Source: [`backend/routers/periods.py`](../backend/routers/periods.py)

### 👑 `POST /api/periods`

Creates a new active recruitment period.

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
- `409` another active period already exists. Close it explicitly before creating/activating another active period.
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

Setting `is_active=true` is blocked with `409` while another active period exists. Close the current active period explicitly first.

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

Returns ranked candidates. When `rubric_id` is provided, includes dimension score summary. Each item also carries `ai_validation_status` (`pending` | `validated` | `needs_discussion`) — the recruiter "Validasi Evaluasi AI" marker.

### 👀 `GET /api/candidates/{candidate_id}`

Returns candidate detail:

- `composite_score`, `language_score`, `language_bonus`, `cefr_level`;
- `profile_summary`;
- cross-linked `application`;
- `user_profile` for recruiter review (`full_name`, `email`, `whatsapp`, `nim`, `faculty`, `major`, `year`, `ipk`) — candidate identity is always visible to recruiters; only the AI-facing document text is anonymized;
- processed `documents`;
- `dimension_scores` with evidence, justification, override status, and override reason;
- `ai_validation` — the recruiter AI-evaluation validation marker:

```json
{
  "ai_validation": {
    "status": "validated",
    "validated_by": "Nama Recruiter",
    "validated_by_id": 3,
    "validated_at": "2026-06-02T08:15:00+00:00",
    "note": "Hasil AI sudah dicek dan sesuai."
  }
}
```

For an unvalidated candidate `status` is `pending` and the other fields are `null`.

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
- Does **not** change the candidate's `ai_validation` marker. Override and AI validation are independent: after overriding, the recruiter should re-validate explicitly.

### 👀 `PUT /api/candidates/{candidate_id}/ai-validation`

Recruiter / super_admin only. Sets the **"Validasi Evaluasi AI"** marker — an informative accountability checkpoint that a recruiter has reviewed the AI evaluation. It does **not** change the score, the candidate evaluation status, or the application status, and is **not** a prerequisite for announcement (at least for now).

**Body**

```json
{ "status": "validated", "note": "Hasil AI sudah dicek dan sesuai." }
```

```json
{ "status": "needs_discussion", "note": "Skor AI terlihat terlalu rendah dibanding isi CV." }
```

`status` is one of `validated` | `needs_discussion` | `pending`.

- `note` is **optional** for `validated`.
- `note` is **required** for `needs_discussion`.
- `pending` is a manual reset: it clears the validator, timestamp, and note.

**Response 200**

```json
{
  "success": true,
  "data": {
    "candidate_id": 5,
    "ai_validation": {
      "status": "validated",
      "validated_by": "Nama Recruiter",
      "validated_by_id": 3,
      "validated_at": "2026-06-02T08:15:00+00:00",
      "note": "Hasil AI sudah dicek dan sesuai."
    }
  },
  "error": null
}
```

**Error cases**

- `404` — candidate not found.
- `400` — candidate has no AI result yet (`composite_score` null and no dimension scores), or `needs_discussion` without a note.
- `422` — `status` is not one of the three allowed values.
- `403` — caller is not a recruiter / super_admin.

**Side effects**

- For `validated` / `needs_discussion`: sets `ai_validated_by_id = current user`, `ai_validated_at = now`, and stores the note (required for `needs_discussion`).
- For `pending`: clears validator, timestamp, and note.
- Writes `AuditLog(action_type="ai_validation_updated")` in the same transaction.
- A subsequent AI (re-)evaluation that stores a fresh score resets this marker back to `pending`.

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

- Normal evaluation targets applications in selected division with status `verified`.
- `force=false`: skip applications whose linked candidate already has `composite_score`.
- `force=true`: re-score eligible already-scored candidates in `verified` or `screening` status.
- `draft`, `submitted`, `document_review`, `correction_requested`, `cancelled`, and announced applications are skipped.
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

## Admin Audit Logs (`/api/admin/audit-logs`)

Source: [`backend/routers/audit_logs.py`](../backend/routers/audit_logs.py)

### Super Admin `GET /api/admin/audit-logs`

Read-only audit log listing for super-admin oversight.

**Query**

| Param | Meaning |
|---|---|
| `page` | 1-indexed page, default 1 |
| `limit` | 1-100, default 20 |
| `action_type` | exact audit action filter |
| `recruiter_id` | actor user id |
| `candidate_id` | affected user id stored in `AuditLog.candidate_id` |
| `date_from` | ISO date/datetime lower bound |
| `date_to` | ISO date/datetime upper bound |

**Response 200**

```json
{
  "page": 1,
  "limit": 20,
  "total": 1,
  "items": [
    {
      "id": 10,
      "action_type": "document_verification",
      "actor": { "user_id": 2, "email": "recruiter@example.com", "role": "recruiter" },
      "affected_user": { "user_id": 8, "email": "candidate@example.com", "nim": "103..." },
      "old_value": "pending",
      "new_value": "verified",
      "reason": "doc_id=99; doc_type=cv",
      "timestamp": "2026-06-02T05:00:00Z"
    }
  ]
}
```

Recruiter and candidate access returns `403`. Sensitive text markers are redacted from audit text fields.

---

## Admin Email Notifications (`/api/admin/email-notifications`)

Source: [`backend/routers/email_notifications.py`](../backend/routers/email_notifications.py)

### Super Admin `GET /api/admin/email-notifications`

Read-only workflow notification delivery log used by the Admin Emails monitoring page.

**Query**

| Param | Meaning |
|---|---|
| `page` | 1-indexed page, default 1 |
| `limit` | 1-100, default 20 |
| `notification_type` | exact type, e.g. `application_submitted`, `document_rejected`, `announcement_published` |
| `status` | `sent`, `captured`, `failed`, or `disabled` |
| `to_email` | recipient substring |
| `date_from` | ISO date/datetime lower bound |
| `date_to` | ISO date/datetime upper bound |

**Response 200**

```json
{
  "page": 1,
  "limit": 20,
  "total": 1,
  "summary": { "total": 1, "sent": 0, "captured": 1, "failed": 0, "disabled": 0 },
  "config": { "provider": "disabled", "email_enabled": false, "environment": "development" },
  "items": [
    {
      "id": 1,
      "notification_type": "application_submitted",
      "to_email": "candidate@example.com",
      "subject": "Aplikasi ScreenAI Lab berhasil dikirim",
      "provider": "disabled",
      "status": "captured",
      "created_at": "2026-06-02T05:00:00Z",
      "sent_at": "2026-06-02T05:00:00Z",
      "related_application_id": 12
    }
  ]
}
```

The table intentionally stores metadata only, not email bodies, reset links, verification links, JWTs, secrets, or raw provider payloads. Workflow notification failures are non-blocking: application submit, document review finalization, and announcement publish continue while the failed/captured/disabled delivery result is logged. Recruiter and candidate access returns `403`.

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
| `/verify-email` | VerifyEmailPage | public |
| `/forgot-password` | ForgotPasswordPage | public |
| `/reset-password` | ResetPasswordPage | public |
| `/` | Recruiter dashboard or candidate redirect | any authenticated |
| `/dashboard` | Candidate dashboard | candidate |
| `/profile` | Candidate profile | candidate |
| `/profile/edit` | Candidate edit profile | candidate |
| `/application` | Application overview | candidate |
| `/application/start` | Start/select division | candidate |
| `/documents` | Candidate document wizard | candidate |
| `/application/review` | Final application review | candidate |
| `/application/status` | Unified status/result page | candidate |
| `/review` | Legacy redirect to review/status | candidate |
| `/submitted` | Redirect to `/application/status` | candidate |
| `/result` | Redirect to `/application/status` | candidate |
| `/my-applications` | Candidate application history | candidate |
| `/upload` | Legacy upload page | candidate |
| `/recruiter/dashboard` | Recruiter overview | recruiter, super_admin |
| `/recruiter/applications` | Recruiter applications | recruiter, super_admin |
| `/recruiter/evaluation` | Evaluation workspace | recruiter, super_admin |
| `/recruiter/candidates` | Scored candidates | recruiter, super_admin |
| `/recruiter/documents` | Document verification | recruiter, super_admin |
| `/recruiter/announcements` | Announcements | recruiter, super_admin |
| `/recruiter/analytics` | Active-period analytics | recruiter, super_admin |
| `/rubrics` | Rubric config | recruiter, super_admin |
| `/candidates/:id` | Candidate detail | recruiter, super_admin |
| `/recruiter/profile` | Recruiter profile | recruiter, super_admin |
| `/recruiter/profile/edit` | Recruiter edit profile | recruiter, super_admin |
| `/admin/dashboard` | Admin overview | super_admin |
| `/admin/users` | User management | super_admin |
| `/admin/periods` | Recruitment period management | super_admin |
| `/admin/audit-logs` | Audit log listing | super_admin |
| `/admin/email-templates` | Admin Emails monitoring | super_admin |
| `/admin/settings` | Settings placeholder | super_admin |
| `/admin/profile` | Admin profile | super_admin |
| `/admin/profile/edit` | Admin edit profile | super_admin |
