# Phase 8 - NER and Evaluation Flow Adjustment Implementation Report

## Implementation Date

2026-06-01

## Branch

backend/application-status

## Phase Name

Phase 8 - NER and Evaluation Flow Adjustment

## Summary

Implemented Phase 8 backend workflow adjustments so NER cache creation is tied to finalized accepted document review, correction replacement clears stale NER artifacts, and evaluation can safely use cached anonymized CV/motivation-letter text or rebuild it inline when missing.

## Previous Phase Dependency

Phase 8 builds on Phase 7.5 behavior:

- active period safety remains unchanged;
- candidate phase enforcement remains unchanged;
- candidate document visibility still follows the document-review finalize point;
- force re-evaluation still targets `verified` and `screening`;
- correction replacement remains allowed for rejected documents after submission phase ends.

## Completed Work

- Confirmed NER is queued only from finalized accepted document review.
- Submit still moves applications to `document_review` without NER.
- Individual document review still updates document state without NER.
- Correction replacement invalidates stale `CandidateDocument` cache for CV, motivation letter, and SWOT.
- Post-verification anonymization updates cache file metadata when rebuilding rows.
- Evaluation uses current CV and motivation-letter cache when available.
- Evaluation falls back to inline extraction/normalization/anonymization when cache is missing or stale.
- Evaluation fallback stores rebuilt CV and motivation-letter cache.
- Evaluation eligibility remains aligned with Phase 7.5.
- Added a targeted Phase 8 smoke test.

## Files Changed

- `backend/routers/applications.py`
- `backend/routers/evaluate_batch.py`
- `backend/services/document_review_service.py`
- `backend/services/evaluation_service.py`
- `backend/services/submit_anonymization.py`
- `scripts/smoke_test_ner_evaluation_flow.py`
- `docs/reports/phase_8_ner_evaluation_flow_adjustment.md`

## Backend Changes

- Applications router: updated SWOT cache wording from submit-time to post-verification cache.
- Document review service: added targeted `CandidateDocument` cache invalidation for replaced CV, motivation letter, and SWOT documents.
- Submit/post-verification anonymization service: updated docstrings/comments, kept defensive `verified` status guard, and now refreshes cache metadata (`filename`, `file_path`, `page_count`, `file_size_kb`) when updating rows.
- Evaluation service: checks that cache metadata still matches the current upload, uses cached CV/motivation letter when valid, and rebuilds/stores CV and motivation-letter cache on fallback.
- Evaluation batch router: updated stale comments so force evaluation wording matches Phase 7.5 status eligibility.
- Smoke tests: added `scripts/smoke_test_ner_evaluation_flow.py`.

## API / Endpoint Behavior

- `POST /api/applications/{application_id}/submit`: leaves application in `document_review`; does not queue NER.
- `PUT /api/documents/{doc_id}/review`: reviews one document only; does not queue NER.
- `POST /api/applications/{application_id}/finalize-document-review`: queues NER only when finalization sets application status to `verified`.
- `PUT /api/documents/{doc_id}/replace`: rejected correction replacement clears stale NER/cache rows for affected cache-backed document types.
- `POST /api/recruiter/evaluate/batch`: evaluates only eligible `verified` apps normally and `verified`/`screening` apps with `force=true`; uses cache when current, fallback when missing.

## NER Flow

```text
submit -> document_review
document review finalized accepted -> verified
verified -> post-verification anonymization queued
anonymization cache exists -> evaluation uses cache
cache missing/stale -> evaluation fallback inline anonymization
evaluation success -> screening
```

## Correction Cache Handling

When a candidate replaces a rejected CV, motivation letter, or SWOT document, the document review service deletes matching `CandidateDocument` rows for that candidate and document type. The `Candidate` row and score history are not deleted. After the replacement is reviewed and finalization returns the application to `verified`, post-verification anonymization rebuilds cache from the replacement file metadata/content.

## Evaluation Flow

- Normal evaluation (`force=false`) targets `verified`.
- Force re-evaluation (`force=true`) targets `verified` and `screening`.
- Skipped statuses remain `draft`, `submitted`, `document_review`, `correction_requested`, `cancelled`, `announced_pass`, and `announced_fail`.
- Valid CV cache is used directly.
- Valid motivation-letter cache is appended as context.
- Missing/stale cache falls back to inline extraction, normalization, anonymization, and cache update.

## Smoke Test Results

- `python -m scripts.smoke_test_document_review_flow`: passed.
- `python -m scripts.smoke_test_document_rejection`: passed.
- `python -m scripts.smoke_test_evaluation`: passed.
- `python -m scripts.smoke_test_ner_evaluation_flow`: passed.
- `python -m scripts.smoke_test_period_safety`: passed.
- `python -m scripts.smoke_test_phase_enforcement`: passed.
- `python -m scripts.smoke_test_candidate_profile_completion`: passed.
- `python -m scripts.smoke_test_applications`: passed.
- `python -m scripts.smoke_test_periods`: passed.
- `python -m compileall backend scripts`: passed.
- `git diff --check`: passed with Windows LF/CRLF warnings only.
- `cd frontend && npm run build`: not run; Phase 8 changed backend/tests/docs only.

## Manual Checklist

- Submit complete application does not immediately create NER cache.
- Verifying individual documents does not create NER cache.
- Finalizing all documents as accepted triggers/creates NER cache.
- Rejected/correction application does not trigger NER.
- Replacement document gets fresh anonymization after final accepted review.
- Evaluation skips `document_review` and `correction_requested`.
- Evaluation works with cache.
- Evaluation works without cache through fallback.
- Re-evaluate All behavior from Phase 7.5 remains intact.

## Known Limitations / Follow-up Notes

- Background task observability remains minimal; richer task status/monitoring can be improved later.
- Analytics dashboard remains Phase 9.
- Audit log listing UI remains Phase 10.
- Email notification lifecycle remains Phase 11.
- No new model columns or migrations were added.

## Phase 9 Readiness

Phase 9 can proceed. Phase 8 keeps Phase 7.5 workflow gates intact while making NER/evaluation timing and cache handling safe for finalized document review.
