# Phase 9 - Analytics API and Dashboard Implementation Report

## Implementation Date

2026-06-01

## Branch

fullstack/analytics

## Phase Name

Phase 9 - Analytics API and Dashboard

## Summary

Implemented active-period recruitment analytics for recruiter and super admin users. The backend now computes application summary metrics, division counts, funnel counts, document completeness, missing document counts, evaluation progress, and score distribution. The frontend `/recruiter/analytics` page now consumes the API and renders metric cards, filters, bar visuals, progress indicators, and empty states.

## Previous Phase Dependency

Phase 9 follows the finalized Phase 7.5 and Phase 8 workflow:

- active period safety remains the default analytics scope;
- application creation, upload, and final submit still follow recruitment phase gates;
- candidate document visibility remains tied to finalized document review;
- correction replacement remains separate from normal draft upload;
- evaluation eligibility is based on `verified`, with `force=true` support for `screening` remaining in the evaluation flow;
- NER/evaluation cache is not recomputed or called by analytics;
- analytics reads evaluation progress from application statuses and `Candidate.composite_score`.

## Completed Work

- Analytics backend endpoint.
- Active-period scoped analytics.
- Division filter.
- Applicants per division.
- Funnel counts.
- Document completeness.
- Missing documents by type.
- Evaluation progress.
- Score distribution.
- Candidate demographics by faculty and major.
- Frontend analytics dashboard.
- Smoke tests.

## Files Changed

- `backend/routers/analytics.py`
- `backend/main.py`
- `frontend/src/lib/api.js`
- `frontend/src/pages/recruiter/AnalyticsPage.jsx`
- `scripts/smoke_test_analytics.py`
- `docs/reports/phase_9_analytics_api_dashboard.md`

## Backend Changes

- Added `GET /api/recruiter/analytics`.
- Registered the analytics router in `backend/main.py`.
- Enforced recruiter/super_admin access with existing RBAC dependency.
- Candidate access returns `403`.
- Default scope is the active recruitment period.
- No active period returns `200` with `active_period: null`, zero metrics, and a message.
- Empty active period returns `200` with zero metrics.
- Invalid `division` query values return FastAPI's normal `422`.
- Metrics are computed on the backend from `Application`, `Document`, `DocumentType`, `RecruitmentPeriod`, and `Candidate`.
- Added `demographics.faculty_distribution` and `demographics.major_distribution`, computed from active-period non-draft/non-cancelled applications joined to `User.faculty` and `User.major`.
- Demographic labels defensively collapse null/blank values to `Unknown`.

## Frontend Changes

- Added `getRecruiterAnalytics({ division })` to `frontend/src/lib/api.js`.
- Replaced the analytics placeholder with a working dashboard at `/recruiter/analytics`.
- Added a division filter dropdown.
- Added active-period summary and no-active-period/empty-period states.
- Added metric cards, applicants per division, funnel counts, document completeness, missing documents, evaluation progress, and score distribution visuals.
- Added readable faculty and major distribution sections using the existing card/bar UI style.
- Route and sidebar link already existed and were reused without duplication.

## API / Endpoint Behavior

```text
GET /api/recruiter/analytics
GET /api/recruiter/analytics?division=big_data
```

Access control:

```text
recruiter: allowed
super_admin: allowed
candidate: 403
```

No active period behavior:

```text
200 OK
active_period: null
all metric counts: 0
message: "No active recruitment period."
```

Division filter behavior:

- `summary`, `funnel_counts`, `document_completeness`, `missing_documents_by_type`, `evaluation_progress`, and `score_distribution` follow the selected division.
- `applicants_per_division` remains all-division overview so the chart still compares divisions while a filter is active.
- `filters.division` echoes the selected division.

## Metrics Definitions

- `total_applications`: all applications where `Application.period_id == active_period.id`, including draft and cancelled records.
- `submitted_or_later`: active-period applications that are not `draft` and not `cancelled`.
- `applicants_per_division`: active-period applications grouped by division; includes `total`, `submitted_or_later`, `verified`, `screening`, `announced_pass`, and `announced_fail`.
- `funnel_counts`: active-period applications grouped by the current status enum: `draft`, `submitted`, `document_review`, `correction_requested`, `verified`, `screening`, `announced_pass`, `announced_fail`, `cancelled`.
- `document_completeness`: non-cancelled active-period applications in scope; uploaded count is distinct `Document.doc_type`; required count comes from `DocumentType`.
- `missing_documents_by_type`: non-cancelled active-period applications in scope that do not have each required `DocumentType`.
- `evaluation_progress.eligible_for_evaluation`: applications with status `verified`.
- `evaluation_progress.evaluated_count`: applications whose latest linked `Candidate` by `user_id` has non-null `composite_score`.
- `evaluation_progress.pending_evaluation_count`: `verified` applications without score.
- `evaluation_progress.document_review_blocked_count`: status `document_review`.
- `evaluation_progress.correction_blocked_count`: status `correction_requested`.
- `score_distribution`: latest linked `Candidate.composite_score` for active-period applications in scope, bucketed into `0-20`, `21-40`, `41-60`, `61-80`, and `81-100`.
- `demographics.faculty_distribution`: non-draft and non-cancelled active-period applications in scope, grouped by linked `User.faculty`; each item returns `{ label, count, percentage }`.
- `demographics.major_distribution`: non-draft and non-cancelled active-period applications in scope, grouped by linked `User.major`; each item returns `{ label, count, percentage }`.

Draft applications without `period_id` are not included because the active-period scope is `Application.period_id == active_period.id`. This matches the current model where `period_id` is stamped at submit time, except directly seeded/test draft rows that already carry a period.

## Smoke Test Results

- `python -m scripts.smoke_test_analytics`: passed; includes demographic distribution counts, division-scoped demographics, and empty-period demographic arrays.
- `python -m scripts.smoke_test_period_safety`: passed.
- `python -m scripts.smoke_test_phase_enforcement`: passed.
- `python -m scripts.smoke_test_document_review_flow`: passed.
- `python -m scripts.smoke_test_document_rejection`: passed.
- `python -m scripts.smoke_test_evaluation`: passed. The script emitted existing TensorFlow logs and one caught evaluation traceback while still exiting `0`.
- `python -m scripts.smoke_test_ner_evaluation_flow`: passed.
- `python -m scripts.smoke_test_candidate_profile_completion`: passed.
- `python -m scripts.smoke_test_applications`: passed.
- `python -m scripts.smoke_test_periods`: passed.
- `python -m compileall backend scripts`: passed.
- `cd frontend && npm run build`: passed with the existing Vite chunk-size warning.

## Manual Checklist

- Analytics page loads for recruiter: implemented and build-verified; backend access smoke-tested.
- Analytics page loads for super admin: route already shared and backend access smoke-tested.
- Candidate cannot access analytics: backend smoke-tested with `403`.
- Empty active period state is readable: implemented and smoke-tested.
- Division filter works: smoke-tested for `big_data`.
- Faculty and major distributions are empty for an empty active period: smoke-tested.
- Faculty and major distributions are counted from seeded candidates: smoke-tested.
- Division filter also scopes faculty and major distributions: smoke-tested.
- Applicants per division renders: implemented and smoke-tested via response shape.
- Funnel counts render: implemented and smoke-tested.
- Document completeness renders: implemented and smoke-tested.
- Missing documents render: implemented and smoke-tested.
- Evaluation progress renders: implemented and smoke-tested.
- Score distribution renders: implemented and smoke-tested.
- No chart crashes on zero data: implemented with zero-safe bar/progress rendering and smoke-tested for no active/empty active period.

## Known Limitations / Follow-up Notes

- Analytics defaults to active period only.
- Historical/inactive period analytics are out of scope.
- Multi-period selectors and exports are out of scope.
- Real-time evaluation task monitoring is out of scope.
- OCR/scanned PDF extraction error analytics are not included.
- Evaluation error count is limited to linked `Candidate.status` values of `error` or `failed`; the current evaluation pipeline does not persist per-run error analytics.
- Demographic analytics depend on candidate profile `faculty` and `major` fields and group missing/blank values as `Unknown`.
- Browser automation/screenshot QA was not added; frontend verification used `npm run build`.
- An in-app browser sanity check was attempted, but the Browser plugin reported `iab` unavailable in this session.

## Phase 10 Readiness

Phase 10 can proceed. Phase 9 does not change period safety, document review, NER, or evaluation flow. No blocker remains from the analytics implementation.
