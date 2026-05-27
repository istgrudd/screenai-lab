# Module Analysis

Per-module reference for ScreenAI Lab. Each section follows a consistent template:

> **Responsibility · Key files · Inputs · Outputs · Inter-module dependencies · Business rules · Notable edge cases**

For endpoint-level detail see [API_REFERENCE.md](API_REFERENCE.md). For runtime sequencing see [FLOW_DIAGRAMS.md](FLOW_DIAGRAMS.md).

---

## 1. Auth & RBAC

**Responsibility.** Issue, validate, and enforce JWTs for three roles (`super_admin`, `recruiter`, `candidate`). Provide reusable FastAPI dependencies for "current user" and role-based access.

**Key files**
- [backend/routers/auth.py](../backend/routers/auth.py) — `register / login / logout / me` endpoints.
- [backend/services/auth_service.py](../backend/services/auth_service.py) — JWT create/decode + `authenticate_user` discriminator.
- [backend/middleware/auth_middleware.py](../backend/middleware/auth_middleware.py) — `get_current_user` and `require_role` dependency factory.
- [backend/utils/security.py](../backend/utils/security.py) — bcrypt `hash_password` / `verify_password`.
- [backend/models/user.py](../backend/models/user.py) — `User` ORM + `UserRole` enum.

**Inputs**
- Login body `{ email, password }`.
- Register body `{ email, password, full_name, nim, faculty, major, year }` — NIM regex `^\d{10,}$` (relaxed from the original Telkom 13-digit `^103\d{10}$` rule that the frontend comment still reflects).
- `Authorization: Bearer <token>` on protected endpoints.

**Outputs**
- JWT envelope: `{ access_token, token_type: "bearer", user: <UserOut> }`.
- `UserOut` shape: `id, email, full_name, nim, faculty, major, year, whatsapp, role, is_active`.

**Inter-module dependencies**
- All routers depend on `get_current_user` and/or `require_role`.
- Database via `get_db`.

**Business rules**
- Passwords: bcrypt with `bcrypt.gensalt()`, max 72 chars (bcrypt limit).
- JWT claims: `sub` (user id), `email`, `role`, `iat`, `exp`. HS256, lifetime 480 minutes.
- 401 = bad credentials or unknown email; 403 = correct credentials but `is_active == False` (reserved so a candidate sees a clear "contact support" message instead of guessing-game retries).
- Logout endpoint exists but is a no-op server-side (JWTs are stateless; there is no blacklist).
- Inactive accounts cannot pass `get_current_user` even if their token is still time-valid.

**Notable edge cases**
- Re-registration with an in-use email → 409 (`Email is already registered`); duplicate NIM → 409 (`NIM is already registered`).
- `OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)` — `auto_error=False` so the dependency can present a uniform 401 even for missing tokens.

---

## 2. User Management

**Responsibility.** Self-service profile (`GET/PUT /api/users/me`) plus super-admin user administration (list / role / activate / deactivate).

**Key files**
- [backend/routers/users.py](../backend/routers/users.py)
- [backend/models/user.py](../backend/models/user.py)

**Inputs**
- `GET /me` — auth required.
- `PUT /me` — partial `ProfileUpdate` body (every field optional). Locks: `nim/faculty/major/year` lock once application is past `DRAFT`; `division` locks as soon as *any* application exists (even DRAFT); `full_name/email/whatsapp/password` always editable.
- Super-admin: `?page&limit&role&q` for list; role updates accept `UserRole` enum.

**Outputs**
- `MeOut`: profile + derived `division` + `application_status` (so the UI knows which inputs to lock).
- `UserAdminOut` for admin endpoints.

**Dependencies**
- `Application` model (for division derivation and lock state).
- `hash_password` for password change.

**Business rules**
- Email uniqueness checked on update (case-insensitive via `.lower()`).
- NIM uniqueness checked on update.
- A super_admin **cannot deactivate or demote themselves** (self-action footgun guard at [users.py:153](../backend/routers/users.py#L153)).
- Updating `division` for a candidate with no application creates a DRAFT application on the fly.
- Updating `division` for a non-candidate returns 400.

**Notable edge cases**
- Same-email update is treated as no-op (the uniqueness check skips the row matching the candidate's current email).
- Empty-string `whatsapp` clears the field (sending `null` also works); any other falsy value preserves the existing value.

---

## 3. Recruitment Period & Phases

**Responsibility.** Single-active-period management with four explicit phase boundaries. Drives countdowns, submit/announce gates, and the recruiter dashboard's evaluation-prompt banner.

**Key files**
- [backend/routers/periods.py](../backend/routers/periods.py)
- [backend/models/period.py](../backend/models/period.py) — `RecruitmentPeriod` + `current_phase` derived property.
- [backend/utils/period_utils.py](../backend/utils/period_utils.py) — pure `get_current_phase(period, now) -> Literal[...]`.

**Inputs**
- Create / update bodies with up to four datetimes: `start_date`, `submission_end_date?`, `evaluation_end_date?`, `end_date`. Optional `threshold_n` (≥1) and `is_active`.

**Outputs**
- `PeriodOut`: includes derived `current_phase` + `phases` object (`{submission, evaluation, announcement}` each `{start, end}`).
- `GET /periods/active` adds `evaluation_prompt: bool` (true iff `current_phase == EVALUATION` and zero candidates in the period have been scored yet).
- `GET /periods/active/stats` returns `{period_id, total_submitted, by_division}`.

**Dependencies**
- `RecruitmentPeriod` model.
- `Application` (to count submissions per period and derive `evaluation_prompt`).
- `Candidate` (to detect if any composite score exists in the period).

**Business rules**
- Single-active invariant is **application-level**, not DB-level: `_deactivate_others` runs in the same transaction as create / `is_active=true` updates.
- `start_date` is immutable after creation — only the three end-date boundaries and `name` / `threshold_n` / `is_active` can be edited.
- `_validate_phase_order` enforces `start < submission_end < evaluation_end < end`. Each intermediate may be null; the function tolerates that and only orders the boundaries that are present, but always enforces `start < end`.
- `start_date` must be in the future on create.
- Close-early sets `is_active=False` and `end_date=now`.
- Phase derivation never reads `is_active` — it is a pure function of `(period, now)`. The "active" flag selects *which* period is consulted, not what phase that period is in.

**Notable edge cases**
- Legacy periods without `submission_end_date`/`evaluation_end_date` collapse those boundaries onto `end_date` — equivalent to one continuous SUBMISSION window followed by CLOSED.
- Naive datetimes (SQLite round-trip strips `tzinfo`) are coerced to UTC in `_ensure_aware`.
- DateTime ISO emitted with explicit `+00:00` so the browser parses as UTC, not local.

---

## 4. Application Lifecycle

**Responsibility.** Manage the candidate's single application from DRAFT through SUBMITTED → SCREENING → ANNOUNCED_PASS/FAIL.

**Key files**
- [backend/routers/applications.py](../backend/routers/applications.py)
- [backend/models/application.py](../backend/models/application.py) — `Application`, `ApplicationStatus`, `Division`.

**Inputs**
- Create body `{ division: Division }`.
- Submit (path param) — no body; relies on DB state and active period.
- Recruiter list query: `?division&status`.

**Outputs**
- `ApplicationOut`: `id, user_id, division, status, submitted_at, created_at, documents_count`.
- Recruiter list adds `rank`, `is_recommended`, `doc_completeness_pct`, nested `candidate` (user info) and `evaluation` (composite score, language fields).

**Dependencies**
- `User`, `Document`, `Candidate`, `RecruitmentPeriod` (for submit gate + rank computation).
- `BackgroundTasks` to schedule `run_submit_anonymization` after commit.
- `extract_text_from_pdf` for the SWOT-text endpoint.

**Business rules**
- One application per user (DB-level `uq_applications_user_id`).
- Submit requires:
  1. There is an active `RecruitmentPeriod`.
  2. That period's `current_phase == "SUBMISSION"` (Indonesian phase-aware error messages otherwise).
  3. Every `DocumentType` has a Document for this application; otherwise 400 with `missing` list.
- On submit: `status = SUBMITTED`, `submitted_at = utcnow()`, `period_id = active_period.id`, schedule background NER. The schedule call uses `next(get_db())` to spin a **fresh** session — the request-scoped session is closed by the time the BackgroundTask runs.
- Documents become immutable post-submit (the documents router returns 403 for any mutation if `status != DRAFT`).

**Notable edge cases**
- Recruiter `list_submitted_applications` ranks candidates **per division** and within the *currently filtered* result set, so changing the division filter changes the displayed ranks.
- `is_recommended` is `True` iff active period has `threshold_n` AND the application's rank ≤ that threshold. It is *visual* — no auto-action.
- SWOT-text endpoint never caches; PyMuPDF re-extracts on every call.

---

## 5. Document Upload & Storage

**Responsibility.** Validated upload of six required document types per application; recruiter verification flag; raw file streaming.

**Key files**
- [backend/routers/documents.py](../backend/routers/documents.py)
- [backend/utils/file_storage.py](../backend/utils/file_storage.py) — limits, MIME map, `save_upload`, `delete_stored_file`.
- [backend/models/document.py](../backend/models/document.py) — `Document` + `DocumentType` enum.

**Inputs**
- `POST /api/documents/upload/{doc_type}` — multipart form file, candidate-only, application must be DRAFT.
- `PUT /api/documents/{doc_id}/replace` — multipart form file.
- `GET /api/documents/{application_id}` — list + `limits` map.
- `GET /api/documents/{doc_id}/file` — raw file (streamed via `FileResponse`).
- `PUT /api/documents/{doc_id}/verify` — recruiter+, `{ is_verified: bool }`.

**Outputs**
- Per document: `id, application_id, doc_type, file_name, file_size, uploaded_at, is_verified`.
- List endpoint includes `required_types` and a `limits` map keyed by `doc_type`: `{max_bytes, allowed_mime}`.

**Dependencies**
- `Application` (ownership + draft-state check).
- `User.role` for visibility (candidate sees own; recruiter+ sees any).

**Business rules** (PRD Section 8 limits, encoded in [file_storage.py:34](../backend/utils/file_storage.py#L34))

| DocumentType | Allowed MIME | Max bytes |
|---|---|---|
| CV | `application/pdf` | 5 MB |
| KHS | `application/pdf` | 5 MB |
| KTM | `application/pdf`, `image/jpeg`, `image/png` | 2 MB |
| MOTIVATION_LETTER | `application/pdf` | 5 MB |
| SWOT | `application/pdf` | 5 MB |
| SUPPORTING_DOCS | `application/pdf` | 10 MB |

- One file per `(application_id, doc_type)` enforced by `uq_documents_app_type`.
- Replace flow deletes the old disk file and overwrites in place (filename normalized to `{doc_type}.{ext}`).
- `is_verified` is recruiter-only — used for D-06 (Dokumen Pendukung) sanity check.
- 415 (UNSUPPORTED_MEDIA_TYPE) for bad MIME, 413 for oversized, 400 for empty file.
- 410 (Gone) when the DB row exists but the file is missing on disk — candidate must re-upload.

**Notable edge cases**
- MIME validation is **content-type-header only** — no magic-byte / file-signature check. A client that lies about Content-Type passes server validation. (Flagged in [ISSUES_AND_NOTES.md](ISSUES_AND_NOTES.md).)
- `_remove_existing_files` walks all known extensions to delete any leftover from a prior upload of the same `doc_type`.
- File response media type derived from the disk extension, not from the original upload — safe because `save_upload` writes a deterministic extension based on validated MIME.

---

## 6. Document Processing (parsers)

**Responsibility.** Deterministic, non-LLM parsers that pull structured signal from candidate uploads.

**Key files**
- [backend/services/extractor.py](../backend/services/extractor.py) — PyMuPDF text extraction + EPrT detection.
- `backend/services/normalizer.py` — text cleanup + section segmentation (referenced by anonymizer + evaluation_service; not read in detail here).
- `backend/services/khs_parser.py` — IPK + course list extraction (referenced).
- `backend/services/ktm_validator.py` — Rule-based ID validation (referenced).

**Inputs**
- File path on disk (PDF or image for KTM).
- Optional `expected_nim` for KTM cross-check.

**Outputs**
- Extractor: `{ raw_text, pages, metadata: {page_count, file_size_kb} }`.
- KHS parser: `{ ipk, total_sks, relevant_courses[], parse_error? }`.
- KTM validator: `{ valid: bool, error?: str, warning?: str }`.
- EPrT helpers: `detect_certificate_type(text) -> "eprt" | None`, `extract_eprt_score(text) -> int | None` (rejects values outside 310–677).

**Dependencies**
- `fitz` (PyMuPDF). Nothing LLM-related.

**Business rules**
- EPrT score range: 310–677 (rejected otherwise).
- Certificate detection looks for substrings `eprt`, `total score`, `english proficiency test` (case-insensitive).
- Extractor reads pages with `page.get_text("text")` (natural top-to-bottom order).

**Notable edge cases**
- KHS `parse_error` keeps the candidate evaluable — the field is surfaced as a warning instead of hard-failing.
- KTM validation is image-tolerant (KTM is the only doc type that allows `image/jpeg`/`image/png`) — gettext on a JPG returns nothing, hence the validator's rule-based fallback.

---

## 7. AI Pipeline — NER Anonymization

**Responsibility.** Replace identity attributes (names, orgs, locations, phones, emails, IDs, URLs) with indexed `[LABEL_n]` tokens for blind screening.

**Key files**
- [backend/services/anonymizer.py](../backend/services/anonymizer.py)
- `backend/utils/ner_utils.py` — `run_ner` IndoBERT pipeline singleton.
- [backend/services/submit_anonymization.py](../backend/services/submit_anonymization.py) — submit-time BackgroundTask.

**Inputs**
- Plain text (already extracted + normalized).

**Outputs**
- `{ anonymized_text, entities_found: [{text, label, replacement}], entity_count }`.

**Dependencies**
- IndoBERT NER (HuggingFace `transformers`).
- `re` for regex passes.

**Business rules**
- Three-pass detection:
  1. NER (PER/LOC/ORG; `PER` is normalized to `PERSON`).
  2. Regex: PHONE (Indonesian formats), EMAIL, NIK (16 digits), NIM (with label), URLs (incl. linkedin/github).
  3. Context patterns: Indonesian street/city/province names, common org formats (`PT …`, `Universitas …`, `SMA Negeri …`), university abbreviations (ITB, ITS, ...).
- Overlap dedup keeps the longer span.
- Identical text+label pairs reuse the same token (e.g. two mentions of "Budi Santoso" both become `[PERSON_1]`).
- Subword artifacts (`##wai`) are skipped.
- Replacement is done in reverse position order so earlier indices stay valid.

**Submit-time behaviour ([submit_anonymization.py](../backend/services/submit_anonymization.py))**
- Runs as a FastAPI BackgroundTask **after** the submit transaction commits.
- Loads only CV + Motivation Letter (the other docs are not used by the LLM scoring step).
- Creates / updates a `Candidate` row keyed on `user_id` (`rubric_id` left None at this stage).
- Stores results in `CandidateDocument(candidate_id, document_type=cv|motivation_letter)`.
- **Must never raise** — wraps the body in `try/except` and logs the traceback. The DB session it receives is a fresh session (not request-scoped); it's closed in `finally`.

**Notable edge cases**
- If submit-time NER hasn't finished (or failed) when the recruiter triggers evaluation, [evaluation_service.py:237](../backend/services/evaluation_service.py#L237) falls back to inline NER on demand.
- Empty/whitespace text returns the input unchanged with zero entities.

---

## 8. AI Pipeline — RAG & Scoring

**Responsibility.** Build a Bahasa-Indonesia prompt with rubric context + anonymized CV, call DeepSeek, normalize the response, and persist scores.

**Key files**
- [backend/services/rag_pipeline.py](../backend/services/rag_pipeline.py) — `evaluate_candidate(anonymized_cv, rubric_id, db, certificate_data)`.
- [backend/services/scoring.py](../backend/services/scoring.py) — `store_evaluation_results`, `cefr_from_score`.
- [backend/utils/llm_client.py](../backend/utils/llm_client.py) — DeepSeek client + retry + JSON-fence stripping.

**Inputs**
- `anonymized_cv: { anonymized_text }` — the merged CV + ML + KHS-prefix text.
- `rubric_id: int` — the rubric whose dimensions drive the evaluation.
- `certificate_data: dict | None` — optional, currently always `None` from `_evaluate_one`.

**Outputs**
- `{ composite_score, dimension_scores: [...], profile_summary, raw_llm_response }`.
- Each dimension score: `{ dimension, score (0-100), weight (0-1), weighted_score, justification, evidence: [str] }`.

**Dependencies**
- `Rubric` + `Dimension` ORM rows for context.
- DeepSeek API.

**Business rules**
- LLM temperature `0.1` — deterministic-ish output.
- System prompt enforces:
  - Bahasa Indonesia output for `profile_summary`.
  - Strict 0–100 scoring per dimension.
  - Evidence must be quoted/paraphrased from the CV.
  - Anonymization tokens (`[PERSON_1]` etc.) are to be ignored.
- `_process_llm_response`:
  - Clamps each score to `[0, 100]`.
  - Looks up dimension by exact lowercase name; falls back to fuzzy substring match; falls back further to equal-weighting (`1/N`).
  - Fills missing dimensions with `score=0` + justification "Dimensi ini tidak dievaluasi oleh model."
- Composite score = `Σ(score × weight)` rounded to 2dp.
- `cefr_from_score`: EPrT TOTAL SCORE → CEFR band → bonus added to composite (A1=0, A2=2, B1=4, B2=6, C1=8). No certificate → 0 bonus, no penalty.
- `store_evaluation_results`:
  - **Wipes** existing `DimensionScore` rows for `(candidate_id, rubric_id)` before inserting.
  - Sets `candidate.composite_score = round(weighted_total + language_bonus, 2)`.
  - Sets `candidate.status = "scored"`.

**Notable edge cases**
- `call_llm_json` retries up to 3 times on JSON parse failure (separate from LLM call retries).
- LangChain / ChromaDB are imported by `requirements.txt` but the current pipeline does not perform vector retrieval — rubric context is inlined directly. The vector store is reserved for a future richer retrieval pass.

---

## 9. Evaluation Orchestration

**Responsibility.** Glue layer that bridges `Application` (Phase 1 portal) ↔ `Candidate` (Capstone AI pipeline). Drives the full per-candidate eval: KTM → KHS → cached/inline NER → RAG → store results.

**Key files**
- [backend/routers/evaluate_batch.py](../backend/routers/evaluate_batch.py) — `POST /api/recruiter/evaluate/batch` and `GET /api/recruiter/results/{application_id}`.
- [backend/services/evaluation_service.py](../backend/services/evaluation_service.py) — `run_evaluation_pipeline`, `_evaluate_one`, `_ensure_candidate`.
- [backend/routers/evaluation.py](../backend/routers/evaluation.py) — legacy `POST /api/evaluate` (rubric-id based).

**Inputs**
- Body: `{ division: str, application_ids: int[] | null, force: bool }` — `force` re-evaluates already-scored candidates, status filter (SUBMITTED) always applies.

**Outputs**
- `{ success, data: {queued, results, errors}, evaluated_count, skipped_count, warning, error }`.
- `_warning` is a soft phase warning ("Evaluasi dijalankan di luar window evaluasi resmi.") when the active period isn't in the EVALUATION phase or no period is active.

**Dependencies**
- All AI pipeline modules above.
- `RecruitmentPeriod` (for soft-warn).
- `Rubric` (for division-to-rubric mapping; raises if rubric has no dimensions).

**Business rules**
- Hard guards:
  - 404 if no rubric for the division.
  - 400 if rubric has zero dimensions ("Please set up the rubric first").
  - 422 for any other ValueError surfaced by the pipeline.
- Status filter is **always** SUBMITTED — non-SUBMITTED applications never re-evaluate, even with `force=true`.
- `force=false` (default): skips candidates whose `Candidate.composite_score` is already non-null (Task 13.5.1).
- `force=true`: skip filter dropped, but the SUBMITTED-only rule remains.
- After successful evaluation, application status flips to `SCREENING`.
- Phase soft-warn: NEVER blocks evaluation; only adds a `warning` field for the frontend to surface (Task 13.2.2).

**`_evaluate_one` step list**
1. KTM validate (warning surfaced; never blocks).
2. KHS parse (parse_error surfaced as warning).
3. `_ensure_candidate` (one Candidate per user; rubric_id set on this call).
4. NER cache check (`CandidateDocument.anonymized_text != None`); fallback inline if miss.
5. Append motivation-letter anonymized text under `=== SURAT MOTIVASI ===` heading.
6. Prepend KHS summary under `=== DATA AKADEMIK ===` heading if parsed.
7. Update `CandidateDocument` (raw + normalized + anonymized + entities).
8. Call `evaluate_candidate` (RAG pipeline).
9. `store_evaluation_results` (DimensionScore + composite + language bonus + profile summary).
10. Best-effort SWOT text extraction for downstream UI.

**Notable edge cases**
- Each iteration commits after the entire batch (`db.commit()` once at the end). Per-candidate exceptions are caught and recorded in `errors` so a single failure doesn't blow up the rest.
- `Application.division` is stored as enum **name** (`BIG_DATA`); rubric `division` is the enum **value** (`big_data`). The service coerces the request string into the enum then queries by enum to bridge the difference (see [evaluation_service.py:89](../backend/services/evaluation_service.py#L89)).
- Legacy `POST /api/evaluate` only processes candidates with `Candidate.status == "anonymized"` — it does not iterate by Application/Division and is the older Capstone path.

---

## 10. Rubric Configuration

**Responsibility.** CRUD for scoring rubrics + their dimensions. Idempotent seeding of one empty rubric per division on startup.

**Key files**
- [backend/routers/rubrics.py](../backend/routers/rubrics.py)
- [backend/models/rubric.py](../backend/models/rubric.py) — `Rubric`, `Dimension`.
- [backend/services/rubric_seeding.py](../backend/services/rubric_seeding.py)

**Inputs**
- Create/update body: `{ name, position, division?, description?, dimensions: [{id?, name, weight (0,1], description?, indicators? }] }`.
- List query: `?division`.

**Outputs**
- Rubric with embedded dimensions (full detail on detail/create/update; dimension count only on list).

**Dependencies**
- `Division` enum.

**Business rules**
- Recruiter+ for all endpoints (super-admin inherits).
- Empty rubric (no dimensions) is allowed — division-seeded defaults are empty by design.
- If dimensions are provided, weights must sum to 1.0 (±0.01 tolerance) — 400 otherwise.
- Update wipes and recreates dimensions in one transaction.
- Delete cascades to dimensions and (via FK) to dimension_scores tied to that rubric.
- Seed is idempotent: only inserts a rubric for a division if no rubric for that division exists.

**Notable edge cases**
- Rubric `division` column is `String(20)` (not an Enum). Updating with a `Division` enum is supported via `_division_value` unwrapping; raw string values also pass through. Phase 2 Task 14.2 plans to migrate this to an Enum column.

---

## 11. Candidate Detail & Score Override

**Responsibility.** Recruiter view of a single candidate's evaluation, with the ability to override individual dimension scores.

**Key files**
- [backend/routers/candidates.py](../backend/routers/candidates.py)
- [backend/models/candidate.py](../backend/models/candidate.py) — `Candidate`, `CandidateDocument`, `DimensionScore`.

**Inputs**
- `GET /api/candidates?rubric_id=` — optional rubric filter.
- `GET /api/candidates/{candidate_id}` — full detail.
- `PUT /api/candidates/{candidate_id}/scores/{dim_score_id}` body `{score: float, reason: str}`.
- `GET /api/my-applications` — candidate-owned listing of own pipeline records.

**Outputs**
- List: rank, anonymous_id, composite_score, language_score/bonus, CEFR level, doc summary.
- Detail: + dimension_scores with justification/evidence/override info, language_certificate, profile_summary, application + user_profile cross-link, raw documents (page_count/file_size_kb/sections_detected/entities).

**Dependencies**
- `cefr_from_score` (for level lookup).
- `Application` + `User` (cross-link).
- `Dimension` (weight lookup for override recompute).

**Business rules**
- Override clamps `score` to `[0, 100]`.
- Recomputes `weighted_score = score × dimension.weight` (raw weight 0–1, so weighted is on a 0–100 scale only if weight is 1 — be aware that the LLM-side composite uses the same formula).
- Recomputes candidate composite as `Σ(weighted_scores) + language_bonus` for that rubric.
- Sets `is_override = True` and stores `override_reason`.
- **No audit log** is currently written for overrides (Phase 2 Task 14.3 outstanding).

**Notable edge cases**
- `list_my_applications` redacts `composite_score / language_score / cefr_level` until `Candidate.status == "scored"`.
- The "anonymized" pipeline state is exposed in `status` strings (`uploaded | extracted | anonymized | scored`).

---

## 12. Announcements

**Responsibility.** Per-application and bulk pass/fail publishing. Bulk endpoint is the primary recruiter flow; per-application is retained for backwards compatibility.

**Key files**
- [backend/routers/announcements.py](../backend/routers/announcements.py)

**Inputs**
- Single: `{ application_id, result: "pass"|"fail", notes? }`.
- Bulk: `{ division: Division, period_id: int, passed_application_ids: int[] }`.

**Outputs**
- Single: `{ application_id, status, result, notes, announced_at }`.
- Bulk: `{ announced_pass: int, announced_fail: int, division, period_id }`.
- Candidate `GET /announcements/my`: `{ status, result, notes, announced_at }` or `{ status: "pending" }` / `{ status: "no_application" }`.

**Dependencies**
- `Application`, `RecruitmentPeriod`, `AuditLog`.
- `get_current_phase` for the bulk-only ANNOUNCEMENT-phase gate.

**Business rules**
- Single endpoint allowed statuses to announce from: SUBMITTED, SCREENING, ANNOUNCED_PASS, ANNOUNCED_FAIL (re-publishing is allowed; DRAFT is rejected with 409).
- Bulk endpoint scope: applications in `(division, period_id)` with status in `{SCREENING, ANNOUNCED_PASS, ANNOUNCED_FAIL}` only — SUBMITTED-but-unevaluated apps are intentionally untouched.
- Bulk endpoint validates that every id in `passed_application_ids` belongs to scope; otherwise 400 with the offending ids.
- Bulk endpoint's phase gate: 403 outside ANNOUNCEMENT phase **unless** the caller is super_admin (manual correction bypass).
- Bulk endpoint runs in a single transaction (`db.commit()` once at the end).
- Audit log entries written only on actual status change (`new != old`).

**Notable edge cases**
- The single endpoint does **not** apply a phase gate — only the bulk endpoint does.
- `GET /announcements/my` looks up the most recent `action_type == "announcement"` audit row to derive `notes`/`announced_at`. Bulk announces use `action_type == "bulk_announcement"`, so candidates whose status was set via bulk see `notes = null` and `announced_at = null`.

---

## 13. Audit Logging

**Responsibility.** Free-form audit trail for recruiter-driven mutations.

**Key files**
- [backend/models/audit.py](../backend/models/audit.py)

**Schema**
- `recruiter_id` (FK users.id, nullable on delete) — who acted.
- `candidate_id` (FK users.id, nullable on delete) — whose state changed.
- `action_type` (str, indexed) — discriminator.
- `old_value`, `new_value`, `reason` — free-form text.
- `timestamp` (indexed).

**Currently logged**
- `action_type = "announcement"` — single-announce endpoint.
- `action_type = "bulk_announcement"` — bulk endpoint.

**Not yet logged** (gaps to close per CLAUDE.md Task 14.3)
- Score overrides (`PUT /api/candidates/{id}/scores/{dim_score_id}`).
- Document verification toggles.
- Period activation/deactivation.

---

## 14. Frontend — Routing & Protected Routes

**Responsibility.** Route tree, role-aware sidebar, and per-route auth/role enforcement.

**Key files**
- [frontend/src/App.jsx](../frontend/src/App.jsx) — `BrowserRouter`, `Sidebar`, `RootRedirect`, route definitions.
- [frontend/src/components/ProtectedRoute.jsx](../frontend/src/components/ProtectedRoute.jsx) — `<ProtectedRoute roles={[...]}>` HOC.
- [frontend/src/lib/auth.js](../frontend/src/lib/auth.js) — `getCurrentUser`, `isAuthenticated`, `defaultPathForRole`, `ROLES` constants.

**Routes** (full list in [API_REFERENCE.md](API_REFERENCE.md) section "Frontend page routes")

| Path | Element | Roles |
|---|---|---|
| `/login`, `/register` | LoginPage / RegisterPage | public |
| `/` | RootRedirect → DashboardPage (recruiter/admin) or `Navigate` to `/dashboard` (candidate) | any auth |
| `/dashboard`, `/profile`, `/documents`, `/review`, `/submitted`, `/result`, `/my-applications`, `/upload` | candidate pages | candidate |
| `/rubrics`, `/candidates/:id`, `/recruiter/profile` | recruiter+admin | recruiter, super_admin |
| `/admin/users`, `/admin/periods`, `/admin/profile` | admin pages | super_admin |
| `*` | `<Navigate to="/" replace />` | — |

**Business rules**
- `ProtectedRoute`: unauthenticated → `<Navigate to="/login">`; wrong role → 403 page (rendered, not redirected).
- `RootRedirect` resolves the role-default landing page; recruiter / super_admin land at `/` and render `DashboardPage` directly inside the same route to avoid a flicker redirect.
- Sidebar nav links derived from `getCurrentUser().role` — no static menu.

**Notable edge cases**
- Role checks are **client-side only**; backend independently enforces them. A modified frontend bundle that bypasses `ProtectedRoute` cannot bypass the backend's `require_role` dependency.
- `getCurrentUser()` decodes the JWT each call (cheap; no caching). It returns `null` if the `exp` claim is in the past.

---

## 15. Frontend — API Client & Auth

**Responsibility.** Centralized HTTP layer with bearer-token attach, response unwrapping, and 401-redirect.

**Key files**
- [frontend/src/lib/api.js](../frontend/src/lib/api.js) — single `request()` wrapper + ~40 endpoint helpers.
- [frontend/src/lib/auth.js](../frontend/src/lib/auth.js) — token storage, JWT decode, role constants.

**Inputs**
- Function-call API used by every page. JSON or FormData bodies.

**Outputs**
- Returns the unwrapped `data` field of the backend `{success, data, error}` envelope.
- Throws `Error` with the backend's `detail` on non-2xx.

**Business rules**
- Base URL is **hard-coded** at `http://127.0.0.1:8000/api` ([api.js:8](../frontend/src/lib/api.js#L8)) — production deploys must edit this. (Flagged in [ISSUES_AND_NOTES.md](ISSUES_AND_NOTES.md).)
- JWT lives in `localStorage["screenai_lab.token"]` (XSS-vulnerable; documented threat).
- Every request automatically attaches `Authorization: Bearer <token>` if a token is present.
- 401 → `removeToken()` + redirect to `/login` (skips redirect if already on `/login`).
- Special helper `evaluateBatch` does its own fetch (not `request()`) so it can surface envelope-level fields `_warning / evaluated_count / skipped_count` that the generic wrapper would otherwise drop.
- `fetchDocumentBlob(docId)` returns `{url, mime, filename}` for blob preview; callers must `URL.revokeObjectURL(url)` to release memory.

**Notable edge cases**
- `Content-Type: application/json` is auto-set unless the body is `FormData` (then the browser sets the multipart boundary).
- No retry, no offline handling, no token refresh.

---

## 16. Frontend — Candidate Portal Pages

**Responsibility.** End-to-end candidate UX: register → fill profile → upload 6 docs → review → submit → status / result.

**Key files**
- [frontend/src/pages/candidate/DashboardPage.jsx](../frontend/src/pages/candidate/DashboardPage.jsx) — landing, status, progress, RecruitmentPhaseCard.
- [frontend/src/pages/candidate/ProfilePage.jsx](../frontend/src/pages/candidate/ProfilePage.jsx) — personal info + division select; locks academic fields post-submit.
- [frontend/src/pages/candidate/DocumentsPage.jsx](../frontend/src/pages/candidate/DocumentsPage.jsx) — 6-step upload wizard.
- [frontend/src/pages/candidate/ReviewPage.jsx](../frontend/src/pages/candidate/ReviewPage.jsx) — final review + 3 acknowledgments + submit.
- [frontend/src/pages/candidate/SubmittedPage.jsx](../frontend/src/pages/candidate/SubmittedPage.jsx) — post-submit confirmation.
- [frontend/src/pages/candidate/ResultPage.jsx](../frontend/src/pages/candidate/ResultPage.jsx) — pass/fail banner + scores.

**Page-level business rules**
- DocumentsPage: step order is fixed (CV → ML → KHS → KTM → SWOT → Supporting). "Save as Draft" button currently shows a toast and does **not** persist (flagged).
- ReviewPage: submit disabled until all 6 docs uploaded AND all 3 acknowledgments checked.
- ProfilePage: NIM/faculty/major/year locked once `application_status` is past `DRAFT` (server enforces; UI matches).
- ResultPage: only shows scores when `Candidate.status == "scored"`.

---

## 17. Frontend — Recruiter & Admin Pages

**Responsibility.** Recruiter daily workflow (review → evaluate → publish) plus super-admin user/period administration.

**Key files**
- [frontend/src/pages/DashboardPage.jsx](../frontend/src/pages/DashboardPage.jsx) — recruiter dashboard (filter, evaluate, bulk publish).
- [frontend/src/pages/CandidateDetailPage.jsx](../frontend/src/pages/CandidateDetailPage.jsx) — radar/bar charts + override.
- [frontend/src/pages/RubricConfigPage.jsx](../frontend/src/pages/RubricConfigPage.jsx) — rubric CRUD.
- [frontend/src/pages/admin/AdminPage.jsx](../frontend/src/pages/admin/AdminPage.jsx) — user list + role/active toggles.
- [frontend/src/pages/admin/RecruitmentPeriodPage.jsx](../frontend/src/pages/admin/RecruitmentPeriodPage.jsx) — period CRUD + close.
- [frontend/src/components/RecruitmentPhaseCard.jsx](../frontend/src/components/RecruitmentPhaseCard.jsx) — shared phase timeline + countdown.

**Business rules**
- DashboardPage:
  - Filter by division (single or `all`) + status (`all`, `submitted`, `screening`, `announced_pass`, `announced_fail`).
  - Run Evaluation: yellow soft-warn variant if outside EVALUATION phase or last run had a warning; never blocked.
  - "Evaluasi Ulang Semua": confirmation modal, sends `force: true`.
  - Publish Hasil: enabled only when (a) single division filter selected, (b) ≥1 row checked, (c) active period exists, (d) phase is ANNOUNCEMENT (super_admin bypass).
  - Row highlighted green when `is_recommended === true`.
  - Bulk-publish checkbox only enabled for evaluated statuses.
- AdminPage: pagination 20/page, search across email/name/NIM, role select + activate toggle.
- RecruitmentPeriodPage: form requires all four datetimes (frontend Opsi A) and validates ordering before POST/PUT; close-early uses a confirmation dialog.
- CandidateDetailPage: radar chart of dimension scores; OverrideDialog modal collects `{score, reason}` before PUT.
