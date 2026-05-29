# Module Analysis

Per-module implementation reference for ScreenAI Lab.

Each section summarizes:

> **Responsibility · Key files · Inputs · Outputs · Dependencies · Business rules · Notable edge cases**

For endpoint-level detail see [API_REFERENCE.md](API_REFERENCE.md). For runtime sequencing see [FLOW_DIAGRAMS.md](FLOW_DIAGRAMS.md). Product-level source of truth lives in [../PRD.md](../PRD.md).

---

## 1. Auth & RBAC

**Responsibility.** Issue, validate, and enforce JWTs for three roles: `super_admin`, `recruiter`, and `candidate`.

**Key files**

- [backend/routers/auth.py](../backend/routers/auth.py)
- [backend/services/auth_service.py](../backend/services/auth_service.py)
- [backend/middleware/auth_middleware.py](../backend/middleware/auth_middleware.py)
- [backend/middleware/rate_limit.py](../backend/middleware/rate_limit.py)
- [backend/utils/security.py](../backend/utils/security.py)
- [backend/models/user.py](../backend/models/user.py)

**Inputs**

- Register body: `{ email, password, full_name, nim, faculty, major, year }`.
- Login body: `{ email, password }`.
- Verify email query: `code`.
- Resend verification body: `{ email }`.
- Admin password reset body: `{ user_id, new_password }`.
- `Authorization: Bearer <token>` on protected endpoints.

**Outputs**

- Register payload: `{ message, email, verification_required: true }`.
- Login token payload: `{ access_token, token_type: "bearer", user: <UserOut> }`.
- `UserOut`: `id, email, full_name, nim, faculty, major, year, whatsapp, role, is_active, email_verified_at`.

**Dependencies**

- `User` ORM.
- `EmailVerificationLink` ORM.
- bcrypt helpers.
- email service abstraction for Resend / disabled smoke-test mode.
- slowapi limiter for register/login.

**Business rules**

- Registration always creates a `candidate` account.
- Candidate registration sends a verification email and does not return a normal access token.
- Candidates must verify email before login; recruiter and super-admin login behavior is unchanged in Phase 3.
- Email is normalized to lowercase.
- NIM must be a numeric string of at least 10 digits.
- Password length: 8–72 chars; upper bound follows bcrypt's effective input limit.
- Login returns `401` for invalid credentials, `403` for valid credentials on deactivated accounts, and `403 EMAIL_NOT_VERIFIED` for unverified candidates.
- JWTs are stateless. Logout is a server-side no-op; the frontend discards the token.
- Admin-assisted reset changes password hash but does not invalidate existing JWTs.

**Notable edge cases**

- Deactivated users cannot pass `get_current_user` even if their JWT has not expired.
- Token storage is currently frontend localStorage; HttpOnly cookie + CSRF remains backlog.

---

## 2. User Management

**Responsibility.** Self-service profile plus super-admin user administration.

**Key files**

- [backend/routers/users.py](../backend/routers/users.py)
- [backend/models/user.py](../backend/models/user.py)
- [backend/models/application.py](../backend/models/application.py)

**Inputs**

- `GET /api/users/me`.
- `PUT /api/users/me` partial body.
- Super-admin list query: `page`, `limit`, `role`, `q`.
- Super-admin role/deactivate/reactivate actions.

**Outputs**

- `MeOut`: user profile plus candidate-only `division` and `application_status`.
- `UserAdminOut`: admin listing/update shape.

**Dependencies**

- `Application` for candidate division derivation and lock state.
- `hash_password` for password changes.

**Business rules**

- `full_name`, `email`, `whatsapp`, and `password` stay editable in all phases.
- `nim`, `faculty`, `major`, and `year` lock once application status is past `draft`.
- `division` locks once any application exists, including `draft`.
- Candidate can create a draft application by sending `division` through `PUT /api/users/me` if they do not already have one.
- Non-candidates cannot set `division`.
- Super admin cannot demote or deactivate their own account.

**Notable edge cases**

- `whatsapp=""` clears the field.
- Same-email updates skip duplicate check against the current user.

---

## 3. Recruitment Period & Phases

**Responsibility.** Manage recruitment periods and derive phase-aware gates for submission, evaluation prompt, and announcement.

**Key files**

- [backend/routers/periods.py](../backend/routers/periods.py)
- [backend/models/period.py](../backend/models/period.py)
- [backend/utils/period_utils.py](../backend/utils/period_utils.py)

**Inputs**

- Create/update period dates: `start_date`, `submission_end_date`, `evaluation_end_date`, `end_date`.
- `threshold_n` optional top-N highlight.
- `is_active` updates.

**Outputs**

- `PeriodOut` with `current_phase` and `phases` object.
- `GET /api/periods/active` adds `evaluation_prompt`.
- `GET /api/periods/active/stats` returns submitted counts per division.

**Dependencies**

- `RecruitmentPeriod`.
- `Application` and `Candidate` for prompt/statistics.

**Business rules**

- There is only one active period at a time.
- The application layer deactivates other periods in the same transaction when a period becomes active.
- PostgreSQL production additionally protects this invariant with a partial unique index for `is_active = true`.
- `start_date` is immutable after creation.
- Create validates `start_date` is in the future.
- Phase order must satisfy `start < submission_end < evaluation_end < end`.
- `current_phase` is derived from calendar boundaries, not stored in DB.
- `is_active` selects which period is consulted; it does not determine the phase.

**Notable edge cases**

- Legacy periods with missing intermediate dates collapse to compatible behavior.
- SQLite may round-trip datetimes without tzinfo; helper logic treats naive values as UTC.

---

## 4. Application Lifecycle

**Responsibility.** Manage candidate application state from `draft` to `submitted`, then `screening`, then `announced_pass`/`announced_fail`.

**Key files**

- [backend/routers/applications.py](../backend/routers/applications.py)
- [backend/models/application.py](../backend/models/application.py)
- [backend/services/submit_anonymization.py](../backend/services/submit_anonymization.py)

**Inputs**

- Create body `{ division: Division }`.
- Submit path param `application_id`.
- Recruiter list query: optional `division` and `status`.
- SWOT text endpoint path param `application_id`.

**Outputs**

- `ApplicationOut`: `id, user_id, division, status, submitted_at, created_at, documents_count`.
- Recruiter list row extends application with `doc_completeness_pct`, `rank`, `is_recommended`, nested candidate profile, and evaluation summary.
- SWOT text endpoint returns `{ application_id, document_id, file_name, text, page_count, source }`.

**Dependencies**

- `User`, `Document`, `Candidate`, `CandidateDocument`, `RecruitmentPeriod`.
- `BackgroundTasks` for submit-time processing.
- `SessionLocal` factory for background DB session.
- `extract_text_from_pdf` for SWOT live fallback.

**Business rules**

- Current implementation enforces one application per user globally.
- Submit requires:
  1. active recruitment period exists;
  2. current phase is `SUBMISSION`;
  3. application status is `draft`;
  4. current user owns the application;
  5. all six `DocumentType` values exist.
- On submit: `status=submitted`, `submitted_at=utcnow`, `period_id=active_period.id`.
- Submit schedules `run_submit_anonymization(app.id, SessionLocal)`. The background task opens/closes its own session and does not reuse the request-scoped `db`.
- Document mutation is locked once application status is no longer `draft`.
- `is_recommended` is visual only: active period must have `threshold_n` and application rank must be `<= threshold_n`.

**Notable edge cases**

- Recruiter dashboard rank is computed within the filtered result set.
- SWOT text endpoint is cache-first: `source="cache"` if `CandidateDocument.raw_text` exists, otherwise `source="live"` after inline PyMuPDF extraction.
- Multi-period re-application would require changing the one-application-per-user constraint to a `(user_id, period_id)` design.

---

## 5. Document Upload & Storage

**Responsibility.** Validate, persist, replace, list, stream, and verify candidate-uploaded documents.

**Key files**

- [backend/routers/documents.py](../backend/routers/documents.py)
- [backend/utils/file_storage.py](../backend/utils/file_storage.py)
- [backend/models/document.py](../backend/models/document.py)
- [docker-compose.yml](../docker-compose.yml)

**Inputs**

- `POST /api/documents/upload/{doc_type}` multipart file.
- `PUT /api/documents/{doc_id}/replace` multipart file.
- `GET /api/documents/{application_id}`.
- `GET /api/documents/{doc_id}/file`.
- `PUT /api/documents/{doc_id}/verify` with `{ is_verified }`.

**Outputs**

- Document metadata: `id, application_id, doc_type, file_name, file_size, uploaded_at, is_verified`.
- Document list includes `required_types` and upload `limits`.
- File endpoint returns raw `FileResponse`.

**Dependencies**

- `Application` for ownership and draft-state checks.
- `settings.upload_dir`, default `./uploads`.

**Business rules**

| DocumentType | Allowed MIME | Max size |
|---|---|---|
| CV | `application/pdf` | 5 MB |
| KHS | `application/pdf` | 5 MB |
| KTM | `application/pdf`, `image/jpeg`, `image/png` | 2 MB |
| MOTIVATION_LETTER | `application/pdf` | 5 MB |
| SWOT | `application/pdf` | 5 MB |
| SUPPORTING_DOCS | `application/pdf` | 10 MB |

- Server validates declared MIME type.
- Server also validates magic bytes/file signatures for PDF, JPEG, and PNG.
- One file per `(application_id, doc_type)`.
- Replace deletes any previous file for that doc type across known extensions.
- Disk filename is deterministic: `{doc_type}.{ext}`.
- Recruiter verification flag is intended mainly for supporting documents.
- Docker production mounts `./uploads:/app/uploads`, matching backend default `settings.upload_dir = "./uploads"`.

**Notable edge cases**

- `410 Gone` means DB row exists but disk file is missing.
- A mismatched declared MIME and file signature returns `400`.
- Uploads are local-disk based; horizontal scaling would require shared storage.

---

## 6. Document Processing (Parsers)

**Responsibility.** Deterministic, non-LLM parsers that extract structured or reviewable signal from candidate documents.

**Key files**

- [backend/services/extractor.py](../backend/services/extractor.py)
- [backend/services/normalizer.py](../backend/services/normalizer.py)
- [backend/services/khs_parser.py](../backend/services/khs_parser.py)
- [backend/services/ktm_validator.py](../backend/services/ktm_validator.py)

**Inputs**

- File path on disk.
- Optional expected NIM for KTM validation.

**Outputs**

- Extractor: raw text, pages, metadata.
- KHS parser: IPK, total SKS, relevant courses, optional parse error.
- KTM validator: valid flag, warning/error.
- EPrT helper: optional certificate detection and score extraction in legacy path.

**Dependencies**

- PyMuPDF.

**Business rules**

- KHS parse errors do not block evaluation; they surface as warnings.
- KTM validation is soft-warning only; it never blocks evaluation.
- SWOT is qualitative highlight only; it is not included in scoring.

**Notable edge cases**

- JPG/PNG KTM support does not imply full OCR; image extraction may not find text unless the implementation explicitly supports it.
- EPrT score range remains 310–677 in legacy helper logic.

---

## 7. AI Pipeline — NER Anonymization

**Responsibility.** Replace identity attributes with indexed tokens for blind screening.

**Key files**

- [backend/services/anonymizer.py](../backend/services/anonymizer.py)
- [backend/utils/ner_utils.py](../backend/utils/ner_utils.py)
- [backend/services/submit_anonymization.py](../backend/services/submit_anonymization.py)

**Inputs**

- Extracted and normalized CV / Motivation Letter text.
- Application ID for submit-time processing.
- `SessionLocal` factory for the background task.

**Outputs**

- `{ anonymized_text, entities_found, entity_count }`.
- `CandidateDocument` rows for `cv`, `motivation_letter`, and SWOT raw-text cache.

**Dependencies**

- HuggingFace Transformers IndoBERT NER.
- Regex fallback rules.
- `Candidate`, `CandidateDocument`, `Document`, and `User` ORM rows.

**Business rules**

- Detection combines model NER, regex fallback, and context patterns.
- Identical text+label pairs reuse the same token.
- Replacement is done in reverse position order so text indices remain stable.
- Submit-time task runs after the submit transaction commits.
- Background task must never raise to the user-facing submit request; failures are logged.
- CV and Motivation Letter are anonymized.
- SWOT is cached as raw text for recruiter highlight, but not anonymized and not scored.

**Notable edge cases**

- If submit-time anonymization has not finished or failed, evaluation falls back to inline NER.
- Empty extracted text returns unchanged text with zero entities.

---

## 8. AI Pipeline — Rubric-Augmented LLM Scoring

**Responsibility.** Build a Bahasa Indonesia prompt using rubric context and anonymized candidate text, call DeepSeek, validate JSON, and compute scores.

**Key files**

- [backend/services/rag_pipeline.py](../backend/services/rag_pipeline.py)
- [backend/services/scoring.py](../backend/services/scoring.py)
- [backend/utils/llm_client.py](../backend/utils/llm_client.py)

**Inputs**

- `anonymized_cv: { anonymized_text }` containing merged CV + Motivation Letter + optional KHS block.
- `rubric_id`.
- Optional certificate data, currently not used by the Lab evaluation path.

**Outputs**

- `composite_score`.
- `dimension_scores` with score, weight, weighted score, justification, and evidence.
- `profile_summary`.
- raw LLM response string.

**Dependencies**

- `Rubric` and `Dimension` ORM rows.
- Configured DeepSeek model through the OpenAI-compatible SDK.

**Business rules**

- Current production path is rubric-augmented prompting, not live vector retrieval.
- Rubric context is built directly from DB dimensions and indicators.
- LLM temperature is `0.1`.
- Scores are clamped to `[0, 100]`.
- Missing dimensions are filled with score `0`.
- Composite score is `Σ(score × weight)`.
- `store_evaluation_results` wipes previous `DimensionScore` rows for the candidate/rubric before inserting new scores.
- `validate_rubric_weights` protects composite-score sanity.

**Notable edge cases**

- `call_llm_json_async` is used by batch evaluation and retries on API or JSON parse failures without blocking the event loop; the sync `call_llm_json` helper remains for compatibility.
- LangChain/ChromaDB remain installed for compatibility/future retrieval, but are not the current active retrieval mechanism.

---

## 9. Evaluation Orchestration

**Responsibility.** Bridge Candidate Portal application records with the AI pipeline.

**Key files**

- [backend/routers/evaluate_batch.py](../backend/routers/evaluate_batch.py)
- [backend/services/evaluation_service.py](../backend/services/evaluation_service.py)
- [backend/routers/evaluation.py](../backend/routers/evaluation.py) — deprecated legacy path.

**Inputs**

- `POST /api/recruiter/evaluate/batch` body: `{ division: Division, application_ids: int[] | null, force: bool }`.

**Outputs**

- Non-standard envelope: `{ success, data: { queued, results, errors }, evaluated_count, skipped_count, warning, error }`.

**Dependencies**

- Application, User, Candidate, Document, Rubric.
- KHS parser, KTM validator, anonymizer, LLM scoring, scoring persistence.
- RecruitmentPeriod for soft warning.

**Business rules**

- Division is validated as a Pydantic `Division` enum.
- 404 if no rubric exists for division.
- 400 if rubric has no dimensions.
- Rubric weights must sum to 1.0 before evaluation.
- Batch target always starts from applications with status `submitted` in selected division.
- `force=false`: skip already-scored linked candidates.
- `force=true`: re-score already-scored linked candidates, but still only applications currently in `submitted` status.
- Evaluation outside `EVALUATION` phase is allowed and returns a soft warning.
- Successful candidate evaluation sets application status to `screening`.
- LLM calls use an async client path and are bounded with an internal semaphore to avoid too many concurrent DeepSeek calls.

**`_evaluate_one` step list**

1. Validate KTM, soft warning only.
2. Parse KHS, soft warning on parse error.
3. Ensure Candidate row exists.
4. Check cached anonymized CV; fallback to inline NER on miss.
5. Append cached/anonymized Motivation Letter.
6. Prepend KHS summary if available.
7. Ensure/update CandidateDocument for CV bookkeeping.
8. Call rubric-augmented LLM scoring.
9. Store evaluation results.
10. Extract SWOT best-effort for result payload/UI context.

**Notable edge cases**

- Per-candidate exceptions are caught and returned in `errors`, so a single failure does not fail the whole batch.
- A single `db.commit()` occurs after collecting batch outcomes.
- Legacy `POST /api/evaluate` is rubric-id driven and not the Lab pipeline.

---

## 10. Rubric Configuration

**Responsibility.** CRUD scoring rubrics and seed one empty rubric per division.

**Key files**

- [backend/routers/rubrics.py](../backend/routers/rubrics.py)
- backend rubric models.
- [backend/services/rubric_seeding.py](../backend/services/rubric_seeding.py)

**Inputs**

- Create/update body: rubric metadata plus `dimensions` array.
- Optional list query: `division`.

**Outputs**

- Full rubric with dimensions for detail/create/update.
- Lightweight list with dimension count for index.

**Dependencies**

- Division enum.
- Alembic migration constraints for division type safety.

**Business rules**

- Recruiter+ access.
- Empty rubric is allowed for seeded placeholders.
- If dimensions are provided, weights must sum to 1.0 ± 0.01.
- Update recreates dimensions atomically.
- Startup seeding is idempotent.
- Division values are constrained to valid MBC division values.

**Notable edge cases**

- Evaluation refuses to run if the selected division's rubric has zero dimensions.
- Bad weights are blocked both in rubric mutation and before scoring/override recompute.

---

## 11. Candidate Detail & Score Override

**Responsibility.** Recruiter view of candidate evaluation and manual score override.

**Key files**

- [backend/routers/candidates.py](../backend/routers/candidates.py)
- Candidate and score models.
- [backend/models/audit.py](../backend/models/audit.py)

**Inputs**

- `GET /api/candidates` with optional `rubric_id`.
- `GET /api/candidates/{candidate_id}`.
- `PUT /api/candidates/{candidate_id}/scores/{dim_score_id}` with `{ score, reason }`.
- Candidate-owned `GET /api/my-applications`.

**Outputs**

- Candidate list summary.
- Candidate detail with application/user cross-link and dimension scores.
- Override response with old/new score and recomputed composite.

**Dependencies**

- `Dimension` and `Rubric` for weight lookup and validation.
- `Application` and `User` for reveal/cross-link.
- `AuditLog` for override logging.

**Business rules**

- Override clamps score to `[0, 100]`.
- Rubric weights are validated before mutation.
- Weighted score is recomputed as `score × dimension.weight`.
- Candidate composite is recomputed as `Σ(weighted_scores) + language_bonus`.
- Override sets `is_override=true` and stores `override_reason`.
- Override writes `AuditLog(action_type="score_override")` in the same transaction.

**Notable edge cases**

- Candidate-owned application list redacts score fields until candidate status is `scored`.
- AuditLog candidate_id stores the user ID, not the Candidate table ID.

---

## 12. Announcements

**Responsibility.** Publish pass/fail results individually or in bulk.

**Key files**

- [backend/routers/announcements.py](../backend/routers/announcements.py)
- [backend/models/audit.py](../backend/models/audit.py)

**Inputs**

- Single body: `{ application_id, result: "pass" | "fail", notes? }`.
- Bulk body: `{ division: Division, period_id: int, passed_application_ids: int[] }`.
- Candidate result endpoint: `GET /api/announcements/my`.

**Outputs**

- Single response with application id, new status, result, notes, announced timestamp.
- Bulk response with pass/fail counts.
- Candidate response: `no_application`, `pending`, `announced_pass`, or `announced_fail`.

**Dependencies**

- `Application`, `RecruitmentPeriod`, `AuditLog`.
- `get_current_phase` for bulk phase gate.
- slowapi limiter on bulk endpoint.

**Business rules**

- Single endpoint can announce from `submitted`, `screening`, `announced_pass`, or `announced_fail`.
- Bulk scope includes only evaluated statuses: `screening`, `announced_pass`, `announced_fail`.
- Bulk does not touch submitted-but-unevaluated applications.
- Bulk validates all passed IDs are inside scope.
- Bulk phase gate requires `ANNOUNCEMENT` unless current user is `super_admin`.
- Bulk writes one audit row per actual status change.
- Candidate result endpoint reads the latest `announcement` or `bulk_announcement` audit row for `notes`/`announced_at`.

**Notable edge cases**

- Re-publishing same status through bulk is a no-op for audit logging.
- Bulk counts reflect final scope statuses, not only changed rows.

---

## 13. Audit Logging

**Responsibility.** Audit recruiter/admin-driven mutations.

**Key files**

- [backend/models/audit.py](../backend/models/audit.py)
- [backend/routers/announcements.py](../backend/routers/announcements.py)
- [backend/routers/candidates.py](../backend/routers/candidates.py)

**Schema**

- `recruiter_id`: acting user.
- `candidate_id`: affected user id.
- `action_type`: discriminator.
- `old_value`, `new_value`, `reason`.
- `timestamp`.

**Currently logged**

| Action type | Source |
|---|---|
| `announcement` | single announcement endpoint |
| `bulk_announcement` | bulk announcement endpoint |
| `score_override` | score override endpoint |

**Not yet logged**

- Document verification toggles.
- Period activation/deactivation.
- Super-admin user management actions.

---

## 14. Legacy Compatibility Endpoints

**Responsibility.** Keep old Capstone-style upload/evaluate endpoints available temporarily without making them the Lab pipeline.

**Key files**

- [backend/routers/upload.py](../backend/routers/upload.py)
- [backend/routers/evaluation.py](../backend/routers/evaluation.py)
- [frontend/src/pages/UploadPage.jsx](../frontend/src/pages/UploadPage.jsx)

**Endpoints**

| Endpoint | Replacement | Status |
|---|---|---|
| `POST /api/upload` | `POST /api/documents/upload/{doc_type}` | Deprecated compatibility only |
| `POST /api/evaluate` | `POST /api/recruiter/evaluate/batch` | Deprecated compatibility only |

**Business rules**

- Both endpoints emit `Deprecation: true` and `X-Deprecated-Message` headers on handled responses.
- Both endpoints write warning logs on use.
- Legacy upload remains candidate-only.
- Legacy evaluate remains recruiter+.

**Notable edge cases**

- Do not use these endpoints for new Lab UI/API work.
- Removal should be a separate backend task because it requires checking frontend legacy page, smoke scripts, and router includes.

---

## 15. Frontend — Routing & Protected Routes

**Responsibility.** Route tree, role-aware sidebar, and client-side route protection.

**Key files**

- [frontend/src/App.jsx](../frontend/src/App.jsx)
- [frontend/src/components/ProtectedRoute.jsx](../frontend/src/components/ProtectedRoute.jsx)
- [frontend/src/lib/auth.js](../frontend/src/lib/auth.js)

**Routes**

See [API_REFERENCE.md](API_REFERENCE.md#frontend-page-routes) for the full route table.

**Business rules**

- Unauthenticated users redirect to `/login`.
- Wrong-role users see a 403 page.
- Backend still enforces all role checks independently.
- Recruiter and super_admin land on `/`; candidates redirect to `/dashboard`.

**Notable edge cases**

- Client-side route guards are UX only, not security boundaries.
- `getCurrentUser()` decodes JWT and returns `null` on expired token.

---

## 16. Frontend — API Client & Auth

**Responsibility.** Centralized HTTP wrapper with bearer-token attach, envelope unwrap, and 401 handling.

**Key files**

- [frontend/src/lib/api.js](../frontend/src/lib/api.js)
- [frontend/src/lib/auth.js](../frontend/src/lib/auth.js)

**Inputs**

- Helper function calls from pages/components.
- JSON or FormData request bodies.

**Outputs**

- Generic `request()` returns unwrapped `data` field.
- `evaluateBatch()` returns merged data plus envelope-level `_warning`, `evaluated_count`, and `skipped_count`.
- Blob helper returns preview URL/mime/filename for document preview.

**Business rules**

- `BASE_URL` reads `import.meta.env.VITE_API_BASE_URL` and falls back to `http://127.0.0.1:8000/api` for local development.
- JSON requests automatically set `Content-Type: application/json`.
- FormData requests intentionally omit `Content-Type` so the browser sets the multipart boundary.
- 401 removes token and redirects to `/login`.
- JWT is stored in localStorage.

**Notable edge cases**

- `VITE_API_BASE_URL` is build-time; production changes require rebuilding the frontend.
- Generic wrapper would drop evaluation envelope-level fields; `evaluateBatch()` avoids that.
- Blob URLs should be revoked by callers after preview.

---

## 17. Frontend — Candidate Portal Pages

**Responsibility.** Candidate UX from registration through result.

**Key files**

- [frontend/src/pages/candidate/DashboardPage.jsx](../frontend/src/pages/candidate/DashboardPage.jsx)
- [frontend/src/pages/candidate/ProfilePage.jsx](../frontend/src/pages/candidate/ProfilePage.jsx)
- [frontend/src/pages/candidate/DocumentsPage.jsx](../frontend/src/pages/candidate/DocumentsPage.jsx)
- [frontend/src/pages/candidate/ReviewPage.jsx](../frontend/src/pages/candidate/ReviewPage.jsx)
- [frontend/src/pages/candidate/SubmittedPage.jsx](../frontend/src/pages/candidate/SubmittedPage.jsx)
- [frontend/src/pages/candidate/ResultPage.jsx](../frontend/src/pages/candidate/ResultPage.jsx)

**Business rules**

- Document upload step order is fixed.
- Review submit requires all six documents and acknowledgments.
- Candidate profile locks match backend locks.
- Result page displays pass/fail and score data when available.

**Notable edge cases**

- UI lock state is mirrored server-side; backend remains authoritative.

---

## 18. Frontend — Recruiter & Admin Pages

**Responsibility.** Recruiter daily workflow and super-admin management pages.

**Key files**

- [frontend/src/pages/DashboardPage.jsx](../frontend/src/pages/DashboardPage.jsx)
- [frontend/src/pages/CandidateDetailPage.jsx](../frontend/src/pages/CandidateDetailPage.jsx)
- [frontend/src/pages/RubricConfigPage.jsx](../frontend/src/pages/RubricConfigPage.jsx)
- [frontend/src/pages/admin/AdminPage.jsx](../frontend/src/pages/admin/AdminPage.jsx)
- [frontend/src/pages/admin/RecruitmentPeriodPage.jsx](../frontend/src/pages/admin/RecruitmentPeriodPage.jsx)
- [frontend/src/components/RecruitmentPhaseCard.jsx](../frontend/src/components/RecruitmentPhaseCard.jsx)

**Business rules**

- Dashboard filters by division and status.
- Run Evaluation is soft-warned outside `EVALUATION`, not blocked.
- Re-evaluate all sends `force=true` after confirmation.
- Publish Hasil requires a single division filter, checked evaluated rows, active period, and `ANNOUNCEMENT` phase unless super_admin.
- Bulk checkbox is enabled only for evaluated statuses.
- Recommended rows are highlighted when `is_recommended === true`.
- Admin users page supports pagination/search/role/active controls.
- Recruitment period page manages four phase boundaries and threshold.

**Notable edge cases**

- Bulk publish failure keeps the confirmation dialog until the async action resolves.
- Super Admin bypass is mirrored in UI and backend.
