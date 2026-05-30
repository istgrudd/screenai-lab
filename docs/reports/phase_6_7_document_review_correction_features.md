# Combined Phase 6 + Phase 7 Document Review and Correction Features

## Implementation Metadata
| Item | Value |
|---|---|
| Implementation date | 2026-05-30 |
| Branch | `backend/application-status` |
| Phase name | Combined Phase 6 + Phase 7 - Application Status Expansion, Document Verification Gate, and Document Correction Flow |
| Type | Full-stack workflow update |

## Summary of Completed Work
- Expanded application lifecycle with `document_review`, `correction_requested`, `verified`, and `cancelled`.
- Added per-document review state with `pending`, `verified`, and `rejected`.
- Changed final submit so new applications enter `document_review` and do not run NER immediately.
- Added recruiter/super-admin document review and per-application finalization flow.
- Added correction flow so candidates can replace only rejected documents while the application is `correction_requested`.
- Moved NER/anonymization to final document approval when all required documents are verified.
- Updated evaluation gating so batch evaluation only targets `verified` applications.
- Added minimal frontend support for recruiter document verification and candidate correction visibility.
- Added smoke tests for document review approval and document rejection/correction.

## Files Changed
```text
backend/alembic/versions/d4c1f2e3a6b7_document_review_flow.py
backend/models/__init__.py
backend/models/application.py
backend/models/document.py
backend/routers/announcements.py
backend/routers/applications.py
backend/routers/documents.py
backend/routers/users.py
backend/services/document_review_service.py
backend/services/evaluation_service.py
backend/services/submit_anonymization.py
frontend/src/components/DocumentUploadStep.jsx
frontend/src/components/RecruitmentJourney.jsx
frontend/src/components/recruiter/ApplicationsTable.jsx
frontend/src/lib/api.js
frontend/src/lib/candidateApplication.js
frontend/src/lib/recruiterWorkspace.js
frontend/src/pages/candidate/ApplicationStatusPage.jsx
frontend/src/pages/candidate/DashboardPage.jsx
frontend/src/pages/candidate/DocumentsPage.jsx
frontend/src/pages/recruiter/DocumentVerificationPage.jsx
frontend/src/pages/recruiter/EvaluationPage.jsx
scripts/smoke_test_applications.py
scripts/smoke_test_document_rejection.py
scripts/smoke_test_document_review_flow.py
scripts/smoke_test_evaluation.py
scripts/smoke_test_submit_ner.py
docs/reports/phase_6_7_document_review_correction_features.md
```

## Database Migration Summary
Migration:
```text
backend/alembic/versions/d4c1f2e3a6b7_document_review_flow.py
```

Changes:
- Adds `documents.verification_status` with default `pending`.
- Adds `documents.rejection_reason`.
- Adds `documents.reviewed_at`.
- Adds `documents.reviewed_by_id` FK to `users.id`.
- Backfills `verification_status = verified` for existing rows with `is_verified = true`; all others stay `pending`.
- Keeps `is_verified` for backward compatibility.

The migration was applied locally with:
```text
alembic upgrade head
```

## Routes and Endpoints
Added:
```text
PUT  /api/documents/{doc_id}/review
POST /api/applications/{application_id}/finalize-document-review
```

Changed:
```text
POST /api/applications/{application_id}/submit
PUT  /api/documents/{doc_id}/replace
POST /api/documents/upload/{doc_type}
GET  /api/documents/{application_id}
GET  /api/recruiter/applications
POST /api/recruiter/evaluate/batch
```

Compatibility:
- `PUT /api/documents/{doc_id}/verify` remains available and now syncs `verification_status`.
- `submitted` remains in `ApplicationStatus` as a legacy/transitional value.

## Application Status Flow
Before:
```text
draft -> submitted -> submit-time NER -> evaluation -> screening
```

After:
```text
draft
-> document_review
-> recruiter verifies/rejects each document
-> recruiter finalizes review for one application
```

If all required documents are verified:
```text
document_review -> verified -> NER background task
```

If any required document is rejected:
```text
document_review -> correction_requested
-> candidate replaces rejected document(s)
-> document_review
```

Evaluation later changes:
```text
verified -> screening
```

## Document Verification Behavior
- New documents and submitted documents start as `pending`.
- Recruiters and super admins can set each document to `verified` or `rejected`.
- Rejected documents require a non-empty `reason`.
- Verified documents clear `rejection_reason`.
- Review metadata is stored in `reviewed_at` and `reviewed_by_id`.
- `is_verified` is synchronized to `true` only when `verification_status = verified`.
- Candidates cannot review documents.
- Candidates can replace only their own rejected documents during `correction_requested`.
- Replacement resets review state to `pending` and clears rejection metadata.

## NER Timing Behavior
- Candidate submit no longer triggers `run_submit_anonymization`.
- Final document review queues NER only when all required documents are verified.
- `run_submit_anonymization` now guards against accidental execution unless the application is `verified`.
- Correction-requested applications do not run NER.

## Evaluation Gating Behavior
- `run_evaluation_pipeline` now selects only `ApplicationStatus.VERIFIED`.
- `document_review`, `correction_requested`, `submitted`, `draft`, `cancelled`, and announced states are excluded.
- Successful evaluation moves the application to `screening`.
- NER cache behavior is preserved; evaluation fallback is only reachable for applications selected by the verified-only gate.

## Validation Commands and Results
| Command | Result |
|---|---|
| `alembic upgrade head` | Passed |
| `python -m compileall backend scripts` | Passed |
| `python -m scripts.smoke_test_auth` | Passed |
| `python -m scripts.smoke_test_email_verification` | Passed |
| `python -m scripts.smoke_test_forgot_password` | Passed |
| `python -m scripts.smoke_test_token_invalidation` | Passed |
| `python -m scripts.smoke_test_applications` | Passed |
| `python -m scripts.smoke_test_document_review_flow` | Passed |
| `python -m scripts.smoke_test_document_rejection` | Passed |
| `python -m scripts.smoke_test_evaluation` | Passed |
| `python -m scripts.smoke_test_document_verification_audit` | Passed |
| `python -m scripts.smoke_test_submit_ner` | Passed |
| `cd frontend; npm run build` | Passed |

Notes:
- Vite build completed with the existing large chunk warning.
- TensorFlow/oneDNN informational messages appeared during smoke scripts, but tests passed.

## Manual Checklist Results
| Check | Result |
|---|---|
| Recruiter can review documents per application | Implemented in `/recruiter/documents` |
| Recruiter can verify documents individually | Implemented |
| Recruiter can reject documents with reason | Implemented |
| Recruiter can finalize one candidate | Implemented |
| Candidate can see rejected documents and reasons | Implemented on documents/status pages |
| Candidate can replace only rejected documents | Enforced by backend and surfaced in UI |
| Candidate cannot replace verified/pending documents after submit | Enforced |
| AI evaluation waits for `verified` status | Enforced |

## Known Limitations and Follow-Up Notes
- No full browser click-through was completed; the frontend production build passed.
- No email notification was added for document rejection; this remains a later notification phase.
- The recruiter document verification UI is intentionally minimal but usable.
- `submitted` is retained for legacy records, but new submissions enter `document_review`.
