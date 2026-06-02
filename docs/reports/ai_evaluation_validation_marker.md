# AI Evaluation Validation Marker — Implementation Report

## Implementation Date

2026-06-02

## Branch

backend/ipk

## Feature Name

Validasi Evaluasi AI — recruiter checkpoint marker for AI evaluation results

## Summary

Adds an informative **"Validasi Evaluasi AI"** marker so a recruiter / super_admin can record that they have reviewed an AI evaluation result. The marker has three states — `pending`, `validated`, `needs_discussion` — with an optional note for `validated` and a **required** note for `needs_discussion`.

This is intentionally **not** a new manual-evaluation flow and **not** an announcement gate. It does not change scores, candidate evaluation status, or application status. Score override remains a separate, independent feature (with its own required reason); overriding does not auto-validate, and a fresh AI (re-)evaluation resets the marker back to `pending`.

Terminology follows the requested wording (Validasi Evaluasi AI / Tandai Tervalidasi / Perlu Diskusi / Catatan Validasi) and avoids "Manual Evaluation", "Recruiter Review", "Approved", and "Rejected".

## Completed Work

- New `Candidate` model fields + Alembic migration.
- Reset-to-`pending` on every fresh AI evaluation result (initial and force re-eval).
- New recruiter/super_admin endpoint `PUT /api/candidates/{id}/ai-validation` with validation rules + audit log.
- `ai_validation` object added to candidate detail; `ai_validation_status` added to candidate list and recruiter applications list.
- Frontend API helper, detail-page card + dialog, and a status badge on the candidates/evaluation table.
- New smoke test, API/architecture/user-guide documentation, and this report.

## Files Changed

### Backend

- `backend/models/candidate.py` — added `ai_validation_status` (String, default/server_default `"pending"`), `ai_validated_by_id` (FK → `users.id`, nullable, `ondelete="SET NULL"`), `ai_validated_at` (DateTime, nullable), `ai_validation_note` (Text, nullable).
- `backend/alembic/versions/a1b2c3d4e5f6_add_ai_validation_to_candidates.py` — new migration (down_revision `f2a4b6c8d9e0`); uses `batch_alter_table` for SQLite compatibility and adds the FK constraint.
- `backend/services/evaluation_service.py` — after `store_evaluation_results(...)` in `_evaluate_one`, reset the candidate's validation marker (`pending`, clear validator/timestamp/note). Runs only when a new result is persisted, so skipped evaluations never reset an existing validation.
- `backend/routers/candidates.py`:
  - `AI_VALIDATION_STATUSES` constant; `AiValidationUpdate` Pydantic schema (`Literal` status).
  - `_ai_validation_payload()` helper (joins `User` for `validated_by` name).
  - `_candidate_has_ai_evaluation()` helper (composite_score set or ≥1 dimension score).
  - `GET /api/candidates/{id}` now returns `ai_validation`.
  - `GET /api/candidates` list items now include `ai_validation_status`.
  - New `PUT /api/candidates/{id}/ai-validation` endpoint with rules + `AuditLog(action_type="ai_validation_updated")`.
- `backend/routers/applications.py` — recruiter applications list items now include `ai_validation_status` (top-level and inside `evaluation`).

### Frontend

- `frontend/src/lib/api.js` — `updateCandidateAiValidation(candidateId, payload)`.
- `frontend/src/components/AiValidationBadge.jsx` — shared status badge (label + tone) for `pending` / `validated` / `needs_discussion`.
- `frontend/src/components/AiValidationDialog.jsx` — dialog for `validated` (optional note) and `needs_discussion` (required note).
- `frontend/src/pages/CandidateDetailPage.jsx` — "Validasi Evaluasi AI" card (shown only when `hasScores`) with badge, validator, timestamp, note, and "Tandai Tervalidasi" / "Perlu Diskusi" actions wired to the dialog and API; refresh on success.
- `frontend/src/components/recruiter/ApplicationsTable.jsx` — new "Validasi AI" column rendering the badge for evaluated rows.

### Tests

- `scripts/smoke_test_ai_validation.py` — new smoke test (runs `init_db()` to apply the migration).

### Documentation

- `docs/API_REFERENCE.md` — documented the new endpoint, `ai_validation` in candidate detail, `ai_validation_status` in candidate list and recruiter applications list, and the override/validation independence note.
- `docs/ARCHITECTURE.md` — overview now describes the validation marker (informative, not an announcement gate, resets on re-eval).
- `docs/frontend_user_guide.md` — CandidateDetailPage section updated with the card, buttons, and table badge.

## Backend Changes

- **Statuses:** `pending` | `validated` | `needs_discussion`, default `pending` (column default + server_default so existing rows backfill).
- **Endpoint rules:** recruiter/super_admin only; candidate must exist (`404`); candidate must already have an AI result (`400` otherwise); `needs_discussion` requires a note (`400` otherwise); invalid status → `422` (Pydantic `Literal`). `validated`/`needs_discussion` set validator + timestamp; `pending` clears them.
- **Audit:** each update writes `AuditLog(action_type="ai_validation_updated")` with `old_value`/`new_value` status and the note/status as `reason`, in the same transaction.
- **Reset on re-eval:** persisting a fresh evaluation result clears any prior validation back to `pending`.

## Frontend Changes

- Detail-page card surfaces status, validator, timestamp, and note, plus the two action buttons and a note that override is separate.
- Dialog enforces the required note for `needs_discussion` (inline error + disabled submit) and treats it as optional for `validated`.
- Table badge is read-only and never blocks row actions; it shows `-` for not-yet-evaluated rows.

## API Changes

- **New:** `PUT /api/candidates/{candidate_id}/ai-validation` (recruiter/super_admin).
- **Changed:** `GET /api/candidates/{id}` adds `ai_validation`; `GET /api/candidates` and `GET /api/recruiter/applications` add `ai_validation_status`.
- Response envelope `{ success, data, error }` preserved throughout.

## Testing Results

- `python -m compileall backend scripts` — ✅ passed.
- `python -m scripts.smoke_test_ai_validation` — ✅ **AI validation smoke checks passed** (default pending in detail + list; unscored candidate `400`; `validated` without note `200`; `needs_discussion` without note `400`; `needs_discussion` with note `200`; invalid status `422`; reset to pending clears fields; candidate role `403`).
- `cd frontend && npm run build` — ✅ built successfully (pre-existing large-chunk warning only).
- `python -m scripts.smoke_test_evaluation` — ⚠️ pre-existing failures unrelated to this change (see Known Limitations). Verified by stashing this change set and reproducing the identical 18 failures, all cascading from `submit -> 400`.

## Manual Checklist

- [x] Candidate model has AI validation fields; default `pending`.
- [x] Recruiter/super_admin can mark `validated` (note optional).
- [x] Recruiter/super_admin can mark `needs_discussion` (note required).
- [x] `validated` saved without a note.
- [x] Unevaluated candidate cannot be validated (`400`).
- [x] Candidate detail returns `ai_validation`; list/table returns `ai_validation_status`.
- [x] CandidateDetailPage shows the "Validasi Evaluasi AI" card with both actions.
- [x] Candidates/Evaluation table shows the validation badge.
- [x] Override stays separate and does not auto-mark validated.
- [x] Validation is not an announcement blocker.
- [x] API docs and report updated; backend compiles; frontend builds; AI validation smoke test passes.
- [ ] **Manual:** confirm in the running app that a force re-evaluation flips a previously `validated` candidate back to `pending` (covered by code in `evaluation_service._evaluate_one`; see below).

## Known Limitations / Follow-up Notes

- **Re-evaluation reset not in an automated test.** The reset logic lives in `evaluation_service._evaluate_one` after results are stored. Exercising it end-to-end requires the full document + LLM pipeline, so it is recorded here as a manual check rather than added to the lightweight smoke test.
- **`smoke_test_evaluation.py` is pre-existing red in this environment.** Its first failure is `submit -> 400`; the seeded `RecruitmentPeriod` does not set `submission_end_date` / `evaluation_end_date`, so the phase gate (`assert_submission_phase`) rejects submit and the rest cascades. This is independent of this feature (reproduced with the change set stashed) and is left for a separate fix to that test's period seed.
- **Validation is intentionally not an announcement gate.** If the lab later wants `needs_discussion` to block bulk announcement, that would be a deliberate follow-up (and a wording/UX decision), not part of this scope.
- **No recruiter endpoint mutates candidate identity/profile data** — only the validation marker is writable.
