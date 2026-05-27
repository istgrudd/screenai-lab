# Document Verification Audit Report

Date: 2026-05-27

This report documents the audit-log fix for recruiter document verification.
Older batch reports in this directory are historical context and were not
rewritten.

## Problem Summary

`backend/models/audit.py` documents `AuditLog` as the table for recruiter
actions such as score override, document verification, and announcement publish.
Score overrides and announcements already wrote audit rows, but
`backend/routers/documents.py::verify_document(...)` did not.

That left recruiter verification of uploaded documents, especially D-06
supporting documents, without the audit trail implied by the model comments and
project documentation.

## Root Cause

`verify_document(...)` only fetched the `Document`, toggled
`Document.is_verified`, committed, refreshed the row, and returned the serialized
document. It did not load the owning `Application`, so it also did not have the
candidate user's `users.id` value needed for `AuditLog.candidate_id`.

## Files Changed

- `backend/routers/documents.py`
- `docs/ISSUES_AND_NOTES.md`
- `docs/API_REFERENCE.md`
- `docs/reports/DOCUMENT_VERIFICATION_AUDIT_REPORT.md`
- `scripts/smoke_test_document_verification_audit.py`

## Implementation Summary

- `verify_document(...)` now receives `current_user`.
- It fetches the owning `Application` from `doc.application_id`.
- It captures the old `is_verified` value before mutation.
- It writes `AuditLog(action_type="document_verification")`.
- It records `current_user.id` as `AuditLog.recruiter_id`.
- It records `app.user_id` as `AuditLog.candidate_id`, because
  `AuditLog.candidate_id` references `users.id`, not `candidates.id`.
- It stores system-generated context in `reason`, including `doc_id` and
  `doc_type`.
- It commits the document mutation and audit row together.
- The endpoint response shape remains unchanged:
  `{"success": True, "data": _serialize_document(doc), "error": None}`.

## Validation Performed

- `python -m compileall backend`
- `python -m scripts.smoke_test_document_verification_audit`
- `python -m scripts.smoke_test_applications`

The targeted smoke test verifies that a recruiter can call
`PUT /api/documents/{doc_id}/verify`, the document row changes, and exactly one
`AuditLog(action_type="document_verification")` row is created with the expected
recruiter ID, candidate user ID, old/new values, and document context.

## Remaining Limitations / Follow-ups

- There is still no dedicated audit-log listing endpoint unless one is added in
  a later phase.
- The `reason` is system-generated because the frontend does not send a document
  verification reason.
