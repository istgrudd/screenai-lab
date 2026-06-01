# Phase 11 Email Notification Lifecycle Implementation Report

## Implementation Date

2026-06-01

## Branch

`fullstack/email`

## Phase Name

Phase 11 - Email Notification Lifecycle

## Summary

Implemented workflow email notification logging and delivery for key recruitment events. Candidate-facing notifications are now triggered for application submission, finalized document rejection, and published announcements. Delivery attempts are centralized through a new notification service, recorded in `email_notifications`, and visible to super admins through a read-only Admin Emails monitoring page.

## Previous Phase Dependency

- Phase 10 audit logs remain read-only and unchanged.
- Admin password reset link adjustment remains a self-service reset-link flow; Phase 11 does not restore admin-set-password.
- Phase 8 document review, NER, and evaluation timing remains tied to finalized document review.
- Phase 9 analytics remains independent and read-only.
- Phase 6/7 document rejection visibility remains tied to finalization; document rejection email is sent only after finalize returns `correction_requested`.

## Completed Work

- Added persistent email notification delivery logs.
- Added hardcoded workflow email templates.
- Added centralized workflow notification service.
- Added notification triggers for:
  - `application_submitted`
  - `document_rejected`
  - `announcement_published`
- Added super-admin email notification listing endpoint.
- Replaced the admin email placeholder with a read-only monitoring page.
- Added summary cards, filters, pagination, status badges, provider config display, and read-only template list.
- Added Phase 11 smoke test coverage.
- Updated related smoke-test cleanup so new notification logs do not leave smoke data behind.

## Files Changed

Backend:

```text
backend/alembic/versions/e1f2a3b4c5d6_email_notifications.py
backend/main.py
backend/models/__init__.py
backend/models/email_notification.py
backend/routers/announcements.py
backend/routers/applications.py
backend/routers/email_notifications.py
backend/services/email_templates.py
backend/services/notification_service.py
```

Frontend:

```text
frontend/src/components/navigation/RoleNavSidebar.jsx
frontend/src/lib/api.js
frontend/src/pages/admin/EmailTemplatesPage.jsx
frontend/src/pages/admin/OverviewPage.jsx
```

Smoke tests:

```text
scripts/smoke_test_email_notifications.py
scripts/smoke_test_applications.py
scripts/smoke_test_bulk_announce.py
scripts/smoke_test_candidate_profile_completion.py
scripts/smoke_test_document_rejection.py
scripts/smoke_test_document_review_flow.py
scripts/smoke_test_evaluation.py
scripts/smoke_test_ner_evaluation_flow.py
scripts/smoke_test_phase_enforcement.py
```

Docs:

```text
docs/reports/phase_11_email_notification_lifecycle.md
```

## Backend Changes

- Added `EmailNotification` ORM model and Alembic migration.
- Added `notification_service.py` as the only workflow notification sender.
- Added workflow templates in `email_templates.py`.
- Added `GET /api/admin/email-notifications`.
- Registered the new router in `backend/main.py`.
- Triggered notification service after primary workflow commits:
  - candidate submit;
  - finalized document review with rejected documents;
  - single announcement publish;
  - bulk announcement publish for each changed application.

## Frontend Changes

- Added `getAdminEmailNotifications(params)` API helper.
- Reused `/admin/email-templates` as the Admin Emails monitoring route.
- Updated sidebar label from Email Templates to Emails.
- Added admin dashboard shortcut to Emails.
- Implemented read-only monitoring UI with:
  - summary cards;
  - provider/config status;
  - notification type, status, recipient, and date filters;
  - paginated table;
  - loading, error, and empty states;
  - status badges;
  - read-only template list.

## Email Notification Model / Logging Behavior

`email_notifications` stores:

- recipient metadata;
- notification type;
- subject;
- provider;
- provider message id;
- delivery status;
- safe error message;
- created/sent timestamps;
- related application id;
- related audit log id.

The table intentionally does not store full email bodies, reset links, verification links, tokens, passwords, JWTs, secrets, or raw provider payloads.

## Notification Events Implemented

- `application_submitted`: sent after candidate submit succeeds and application enters `document_review`.
- `document_rejected`: sent after document review finalization produces `correction_requested`.
- `announcement_published`: sent after single or bulk announcement changes an application to `announced_pass` or `announced_fail`.

`document_verified` remains optional and was not enabled.

## Endpoint Behavior

```text
GET /api/admin/email-notifications
```

Access:

- `super_admin`: allowed.
- `recruiter`: `403`.
- `candidate`: `403`.

Filters:

- `page`
- `limit`
- `notification_type`
- `status`
- `to_email`
- `date_from`
- `date_to`

Response uses the existing `{ success, data, error }` wrapper and includes `page`, `limit`, `total`, `summary`, `config`, and `items`.

## Failure Handling / Non-blocking Policy

- Workflow notification failures do not roll back application submit, document review finalization, or announcement publishing.
- Provider failures are logged as `failed`.
- Disabled development mode logs `captured`.
- Disabled non-captured mode logs `disabled`.
- Successful provider delivery logs `sent`.
- Account-critical verification and forgot-password flows were not rewritten.

## Security / Privacy Notes

- Routers do not call Resend directly.
- Workflow sends go through `notification_service.py` and `email_service.py`.
- Admin listing does not expose email body HTML/text.
- Admin listing redacts sensitive-looking error text.
- Templates avoid score details, thresholds, ranking, LLM justifications, raw document content, attachments, reset links, verification links, secrets, stack traces, and provider raw payloads.

## Smoke Test Results

Passed:

```text
python -m scripts.smoke_test_email_notifications
python -m scripts.smoke_test_email_verification
python -m scripts.smoke_test_forgot_password
python -m scripts.smoke_test_token_invalidation
python -m scripts.smoke_test_document_review_flow
python -m scripts.smoke_test_document_rejection
python -m scripts.smoke_test_audit_logs
python -m scripts.smoke_test_analytics
python -m scripts.smoke_test_evaluation
python -m scripts.smoke_test_bulk_announce
python -m compileall backend scripts
```

Notes:

- Smoke tests used disabled/captured mode and did not send real emails.
- TensorFlow/oneDNN informational logs appeared during some smoke scripts.
- 2026-06-01 hardening: `application_submitted` was verified/fixed to run
  after final submit commit/refresh, not during draft application creation.
- `scripts/smoke_test_email_notifications.py` now asserts clean test state, no
  draft-create notification/outbox email, exactly one captured
  `application_submitted` row and disabled outbox email for the submitting
  candidate after final submit, and no duplicate after repeat submit returns
  `409`.

## Frontend Validation Results

Passed:

```text
cd frontend
npm run build
```

Vite emitted the existing large chunk-size warning.

## Manual Checklist

- Candidate application submit remains successful with email disabled.
- Application submit notification is logged.
- Individual document rejection does not email before finalize.
- Finalized document rejection logs notification.
- Announcement publish logs notification.
- Bulk announcement logs one notification per changed affected application.
- Provider failure is logged and does not break announcement publish.
- Super admin can list email logs.
- Recruiter and candidate cannot list email logs.
- Admin Emails page is monitoring-only.
- No manual compose, resend, or template editor was added.

## Known Limitations / Follow-up Notes

- Templates remain hardcoded.
- Admin Emails page is read-only monitoring.
- No manual compose email.
- No resend notification button.
- No CSV/PDF export.
- No database-editable email templates.
- `document_verified` email is not enabled because it is optional.
- Delivery status depends on provider result.
- Development disabled mode uses captured outbox.
- No real-time Resend webhook/status reconciliation.
- Account-critical email verification and password reset are not yet mirrored into `email_notifications`.

## Phase 12 Readiness

Phase 12 can proceed with regression validation. Phase 11 keeps recruitment workflow email notification scoped to monitoring/logging and does not change Phase 8 NER timing, Phase 9 analytics, Phase 10 audit log listing, or the admin password reset link policy.
