# Phase 7.5 — Workflow Hardening and Bug Fixes Implementation Report

## Implementation Date

2026-06-01

## Branch

backend/application-status

## Phase Name

Phase 7.5 — Workflow Hardening and Bug Fixes

## Summary

Implemented workflow hardening after Phase 6 and Phase 7: active period safety, candidate phase gates, candidate profile completion, candidate-facing document visibility, legacy document verify hardening, force re-evaluation for screening candidates, recruiter pending-document warnings, document preview, and login password visibility.

## Completed Work

- Period safety
- Candidate phase enforcement
- Candidate document visibility
- Legacy verify endpoint hardening
- Evaluation/re-evaluation fix
- Pending document warning
- Profile completion enforcement
- Document preview toggle
- Login password visibility toggle

## Files Changed

- `backend/routers/applications.py`
- `backend/routers/documents.py`
- `backend/routers/evaluate_batch.py`
- `backend/routers/periods.py`
- `backend/routers/users.py`
- `backend/services/evaluation_service.py`
- `backend/utils/period_utils.py`
- `frontend/src/App.jsx`
- `frontend/src/components/candidate/CandidateProfileForm.jsx`
- `frontend/src/lib/api.js`
- `frontend/src/lib/candidateApplication.js`
- `frontend/src/pages/LoginPage.jsx`
- `frontend/src/pages/admin/RecruitmentPeriodPage.jsx`
- `frontend/src/pages/candidate/DocumentsPage.jsx`
- `frontend/src/pages/candidate/EditProfilePage.jsx`
- `frontend/src/pages/candidate/ReviewPage.jsx`
- `frontend/src/pages/candidate/StartApplicationPage.jsx`
- `frontend/src/pages/recruiter/DocumentVerificationPage.jsx`
- `frontend/src/pages/recruiter/EvaluationPage.jsx`
- `scripts/smoke_test_applications.py`
- `scripts/smoke_test_candidate_profile_completion.py`
- `scripts/smoke_test_document_rejection.py`
- `scripts/smoke_test_document_review_flow.py`
- `scripts/smoke_test_evaluation.py`
- `scripts/smoke_test_period_safety.py`
- `scripts/smoke_test_periods.py`
- `scripts/smoke_test_phase_enforcement.py`
- `docs/reports/phase_7_5_workflow_hardening_features.md`

## Backend Changes

- `POST /api/periods` and `PUT /api/periods/{period_id}` now reject creating/activating a period while another period is active.
- `PUT /api/periods/{period_id}/close` remains explicit and now writes a `period_closed` audit row.
- Candidate application creation, draft document upload, draft replacement, and final submit now require an active `SUBMISSION` phase.
- Correction replacement remains allowed for rejected documents when application status is `correction_requested`, even after submission phase ends.
- Final submit validates `full_name`, `email`, `nim`, `faculty`, `major`, `year`, and `whatsapp`.
- Candidate document serialization hides per-document review decisions while application status is `document_review`.
- Legacy `PUT /api/documents/{doc_id}/verify` routes safe verification through the review service and rejects unverify/deprecated use.
- Batch evaluation targets `verified` normally and `verified` + `screening` when `force=true`.
- Evaluation response includes skipped counters for already scored, unverified/pending, and correction candidates.
- `PUT /api/users/me` validates Indonesian WhatsApp format.

## Frontend Changes

- Login password field now has an eye/eye-off visibility toggle.
- Candidate routes redirect incomplete profiles to `/profile/edit` without looping on the edit page.
- Candidate review page blocks final submit if profile is incomplete or phase is not `SUBMISSION`.
- Candidate start/upload/review pages show phase-aware blocking messages outside `SUBMISSION`.
- Candidate correction replacement remains available for rejected documents.
- Recruiter Document Verification page can preview authenticated PDF/image blobs and revokes object URLs.
- Evaluation page warns when document-review/correction candidates will be skipped.
- Recruitment Period UI no longer suggests creating a period auto-replaces the active period.

## API / Endpoint Changes

- `POST /api/periods`: returns `409 Conflict` if another active period exists.
- `PUT /api/periods/{period_id}`: returns `409 Conflict` when activating while another period is active.
- `PUT /api/periods/{period_id}/close`: explicit close remains; audit row is written.
- `POST /api/applications`: requires active `SUBMISSION` phase.
- `POST /api/applications/{application_id}/submit`: requires active `SUBMISSION` phase and complete required profile/contact data.
- `POST /api/documents/upload/{doc_type}`: draft upload requires active `SUBMISSION`; correction replacement remains allowed.
- `PUT /api/documents/{doc_id}/replace`: draft replacement requires active `SUBMISSION`; rejected correction replacement remains allowed.
- `PUT /api/documents/{doc_id}/review`: remains canonical review endpoint.
- `PUT /api/documents/{doc_id}/verify`: hardened legacy endpoint; safe verify only through review service, unverify rejected.
- `GET /api/documents/{application_id}`: masks candidate document review status before finalize.
- `POST /api/recruiter/evaluate/batch`: `force=true` includes `screening`; response includes skipped counters.

## Smoke Test Results

- `python -m scripts.smoke_test_period_safety`: passed.
- `python -m scripts.smoke_test_phase_enforcement`: passed.
- `python -m scripts.smoke_test_document_review_flow`: passed.
- `python -m scripts.smoke_test_document_rejection`: passed.
- `python -m scripts.smoke_test_evaluation`: passed.
- `python -m scripts.smoke_test_candidate_profile_completion`: passed.
- `python -m scripts.smoke_test_applications`: passed.
- `python -m scripts.smoke_test_periods`: passed.
- `python -m compileall backend scripts`: passed.
- `cd frontend && npm run build`: passed; Vite emitted the existing large chunk warning.

## Manual Checklist

- Login eye icon works: implemented and build-verified.
- Document preview works for recruiter/admin: implemented with authenticated blob fetch and URL revoke.
- Candidate cannot start/upload outside SUBMISSION: backend smoke-tested and frontend-guarded.
- Candidate can replace rejected document during correction: smoke-tested after submission phase ended.
- Candidate cannot see per-document status before finalize: smoke-tested.
- Re-evaluate All works for screening candidates: smoke-tested with deterministic fake LLM.
- Super admin cannot create active period while another active period exists: smoke-tested.
- Candidate with incomplete profile cannot final submit: smoke-tested.

## Known Limitations / Follow-up Notes

- Frontend UI behavior was validated by `npm run build`; no browser automation or screenshot test was added in this phase.
- Evaluation skipped counters are intentionally simple and focused on Phase 7.5 needs; richer analytics remain Phase 8/9 territory.
- Period close audit is written, but audit log listing UI remains out of scope for Phase 7.5.

## Phase 8 Readiness

Phase 8 can proceed. The core document review/finalize rules, candidate visibility, phase enforcement, period safety, and re-evaluation eligibility are now stable and covered by smoke tests.
