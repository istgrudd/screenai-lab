# Backend Implementation Plan

This document describes the planned backend work for the ScreenAI Lab feature expansion. It complements `OVERVIEW.md` and `FRONTEND_IMPLEMENTATION_PLAN.md` by defining the backend capabilities, data model changes, API contracts, service boundaries, authorization rules, and smoke test requirements needed for the next feature phase.

> Status: planning document. The content below describes intended work, not completed work.

---

## 1. Goals

The backend should remain the source of truth for authentication, recruitment state, document state, evaluation state, announcements, analytics, and auditability.

The planned backend goals are:

1. Add email verification for new accounts.
2. Add self-service forgot password through email-based reset links.
3. Keep the existing super-admin assisted password reset as a manual fallback.
4. Add analytics endpoints for recruiter and super-admin dashboards.
5. Add document rejection reason and candidate-facing visibility.
6. Add audit log listing for super-admin oversight.
7. Add a reusable email service abstraction for Resend.
8. Add draft application reset/cancel behavior.
9. Prepare safer session/token behavior for password changes.
10. Add smoke test scripts for every new backend or full-stack feature.

---

## 2. Current Backend Baseline

The backend already supports:

- Candidate registration and login.
- JWT-based RBAC for `candidate`, `recruiter`, and `super_admin`.
- Candidate profile update through `GET/PUT /api/users/me`.
- Super-admin user management.
- Application creation, document upload, and final submission.
- Recruitment period and phase gating.
- Submit-time anonymization.
- Recruiter batch evaluation.
- Rubric CRUD.
- Candidate detail and score override.
- Bulk announcements.
- Audit logs for several recruiter/admin actions.
- File upload MIME and magic-byte validation.
- Rate limiting on login, register, and bulk announcement.

The planned work should build on this baseline instead of replacing the core recruitment flow.

---

## 3. Backend Design Principles

### 3.1 Backend is authoritative

Frontend route changes must not weaken backend validation. The backend must enforce role access, phase gates, application status transitions, document mutation rules, evaluation permissions, and announcement permissions.

### 3.2 Store workflow state explicitly

If a feature affects recruitment workflow or account security, it should be represented in backend state. Examples include email verification timestamp, document review status, rejection reason, and password-change timestamp.

### 3.3 Keep sensitive account flows one-time and expiring

Verification and reset links should be one-time use, expire after a configured duration, and be stored in a non-plaintext form.

### 3.4 Admin reset remains a support fallback

Self-service forgot password should not remove the existing super-admin assisted reset. The admin reset feature remains useful for support cases where a user cannot access their email.

### 3.5 Every feature must be smoke-testable

Every backend or full-stack feature should include a targeted smoke test under `scripts/`.

---

## 4. Planned Backend Feature Areas

| Feature Area | Priority | Main Roles | Summary |
|---|---:|---|---|
| Email verification | P0 | Candidate, Super Admin | Verify registered email before full account access. |
| Forgot password | P0 | Candidate, Recruiter, Super Admin | Self-service account recovery through email. |
| Email service abstraction | P0/P1 | All roles | Centralize Resend integration and test mode. |
| Analytics API | P1 | Recruiter, Super Admin | Recruitment metrics for dashboards. |
| Draft application reset/cancel | P1 | Candidate, Super Admin | Allow correction before final submission. |
| Document rejection reason | P1 | Candidate, Recruiter, Super Admin | Make document verification actionable. |
| Audit log listing | P1 | Super Admin | View audit trail from the UI. |
| Email notification lifecycle | P1 | Candidate, Recruiter, Super Admin | Notify users about key workflow events. |
| Email template/settings support | P2 | Super Admin | Optional configurable email templates. |
| Session/token hardening | P2 | All roles | Improve logout and password-change behavior. |

---

## 5. Auth and Account Features

## 5.1 Email Verification

### Purpose

Ensure candidate accounts use a reachable email address before accessing the recruitment portal. This also becomes the foundation for forgot password and notification features.

### Affected roles

| Role | Impact |
|---|---|
| Candidate | Must verify email after registration. |
| Recruiter | Optional future enforcement. |
| Super Admin | Can see verification status in user management. |

### Data model plan

Add fields to `users`:

```text
email_verified_at
email_verification_sent_at
```

Add a new table for verification links:

```text
email_verification_links
- id
- user_id
- link_secret_hash
- expires_at
- used_at
- created_at
- sent_to_email
```

Notes:

- Store only a hash of the link secret.
- Links should be one-time use.
- Expired links should fail cleanly.
- `sent_to_email` helps track which email address is being verified.

### API contract

#### `POST /api/auth/register`

Planned behavior:

- Create candidate user with no verified email timestamp.
- Create verification link record.
- Send verification email.
- Do not return an access token by default.
- Return a message telling the user to verify email before signing in.

Planned response:

```json
{
  "success": true,
  "data": {
    "message": "Account created. Please verify your email before signing in.",
    "email": "candidate@example.com",
    "verification_required": true
  },
  "error": null
}
```

#### `POST /api/auth/login`

If a user is not verified, return `403` with a structured error code.

```json
{
  "detail": {
    "code": "EMAIL_NOT_VERIFIED",
    "message": "Please verify your email before signing in."
  }
}
```

#### `GET /api/auth/verify-email?code=...`

Marks email as verified when the provided code is valid.

Possible errors:

- invalid code
- expired code
- already used code
- user not found

#### `POST /api/auth/resend-verification`

Body:

```json
{ "email": "candidate@example.com" }
```

Behavior:

- Return a generic success message even if the email does not exist.
- If the user exists and is not verified, create a new verification link and send email.
- Rate-limit this endpoint.

### Service-layer plan

Create:

```text
backend/services/email_service.py
backend/services/email_verification_service.py
```

Responsibilities:

- generate verification code
- store hashed link secret
- send verification email
- verify submitted code
- mark email as verified
- track sent timestamp

### Environment variables

Add:

```env
RESEND_API_KEY=
EMAIL_FROM=
PUBLIC_FRONTEND_URL=
EMAIL_ENABLED=true
EMAIL_VERIFICATION_EXPIRE_MINUTES=60
EMAIL_RESEND_COOLDOWN_SECONDS=60
```

### Smoke test

Script:

```text
scripts/smoke_test_email_verification.py
```

Must verify:

- Register creates an unverified user.
- Login before verification is blocked.
- Invalid verification code fails.
- Valid verification code succeeds.
- Login after verification succeeds.
- Reusing a verification code fails.
- Resend endpoint returns a generic response.
- Email sending can be mocked or disabled during tests.

---

## 5.2 Forgot Password

### Purpose

Allow users to reset their own password without super-admin intervention.

### Affected roles

| Role | Impact |
|---|---|
| Candidate | Can reset forgotten password. |
| Recruiter | Can reset forgotten password. |
| Super Admin | Can reset forgotten password and still manually reset others. |

### Existing admin reset

`POST /api/auth/admin/reset-password` should remain. It is a manual support path, not a replacement for self-service forgot password.

### Data model plan

Add a new table:

```text
password_reset_links
- id
- user_id
- link_secret_hash
- expires_at
- used_at
- created_at
```

Recommended user field:

```text
password_changed_at
```

This allows previously issued login sessions to be rejected after a password change if implemented in auth middleware.

### API contract

#### `POST /api/auth/forgot-password`

Body:

```json
{ "email": "user@example.com" }
```

Response should be generic:

```json
{
  "success": true,
  "data": {
    "message": "If the account exists, a password reset email has been sent."
  },
  "error": null
}
```

#### `POST /api/auth/reset-password`

Body:

```json
{
  "code": "reset-code-from-email",
  "new_password": "new-minimum-8-character-password"
}
```

Behavior:

- Validate reset code.
- Check expiry and used status.
- Hash new password.
- Mark reset link as used.
- Update `password_changed_at` if session invalidation is implemented.

### Service-layer plan

Create:

```text
backend/services/password_reset_service.py
```

Responsibilities:

- create reset link
- send reset email
- validate reset code
- update password hash
- mark reset link used

### Smoke test

Script:

```text
scripts/smoke_test_forgot_password.py
```

Must verify:

- Existing user can request reset.
- Unknown email receives the same generic response.
- Invalid reset code fails.
- Expired reset code fails.
- Valid reset code changes password.
- Old password no longer logs in.
- New password logs in.
- Reusing reset code fails.
- Admin reset endpoint still works separately.

---

## 5.3 Session and Token Hardening

### Purpose

Improve behavior after password changes and future logout improvements.

### Recommended first step

Add `password_changed_at` to `users` and include a password-issued timestamp in JWT claims. During authenticated requests, reject tokens issued before the latest password change.

### Later option

A dedicated revoked-session table can be added later if exact per-session logout or force logout is needed.

### Priority

P2 unless password reset is expected to immediately invalidate existing sessions.

### Smoke test

Script if implemented:

```text
scripts/smoke_test_token_invalidation.py
```

Must verify:

- Token issued before password reset is rejected after password change.
- Token issued after password reset works.

---

## 6. Email Service and Notifications

## 6.1 Email Service Abstraction

### Purpose

Avoid calling Resend directly from routers. Email sending should be centralized and testable.

### Proposed files

```text
backend/services/email_service.py
backend/services/email_templates.py
```

### Responsibilities

`email_service.py`:

- configure provider client
- send generic email
- support disabled/mock mode for tests
- log failures safely
- return structured send result

`email_templates.py`:

- verification email
- password reset email
- application submitted email
- document rejected email
- announcement pass/fail email

### Failure policy

Account-critical emails:

- If verification email cannot be sent, registration should return a controlled error unless an alternative verification flow exists.

Workflow notification emails:

- Submit success, document rejection, and announcement emails should not break the main transaction unless product policy requires it.

---

## 6.2 Notification Lifecycle

### Planned notifications

| Event | Recipient | Trigger |
|---|---|---|
| Email verification | Candidate | Registration/resend verification |
| Forgot password | Any user | Forgot password request |
| Submit success | Candidate | Application submitted |
| Document rejected | Candidate | Recruiter rejects document |
| Announcement published | Candidate | Single or bulk announcement |

### Optional notification log

If operational tracking is needed, add:

```text
email_notifications
- id
- user_id
- notification_type
- to_email
- subject
- provider_message_id
- status
- error_message
- created_at
- sent_at
```

### Smoke test

Script if notification logging is implemented:

```text
scripts/smoke_test_email_notifications.py
```

Must verify:

- Notification event is created for submit success.
- Notification event is created for document rejection.
- Notification event is created for announcement publication.
- Email sending can be disabled or mocked in tests.

---

## 7. Application Lifecycle Features

## 7.1 Cancel or Reset Draft Application

### Purpose

Allow candidates to correct mistakes before final submission, especially wrong division selection, without silently deleting historical application data.

### Affected roles

| Role | Impact |
|---|---|
| Candidate | Can cancel their own draft application before final submission. |
| Super Admin | Can support manual correction if needed, but should not bypass submitted/screening history without a separate admin workflow. |

### Data model plan

Extend `ApplicationStatus` with:

```text
cancelled
```

Optional metadata fields can be added if operational audit/history is needed:

```text
cancelled_at
cancelled_by_user_id
cancellation_reason
```

The first implementation can rely on the `cancelled` status alone if no explicit cancellation metadata is required yet.

### API contract

#### `POST /api/applications/my/draft/cancel`

Rules:

- Candidate only.
- Only allowed for the authenticated candidate's own `draft` application.
- Submitted, document-review, correction-requested, verified, screening, announced, and already-cancelled applications cannot be cancelled through this endpoint.
- The application status is changed to `cancelled`; the application row is not hard-deleted.
- Existing draft document rows remain linked to the cancelled application for history/debugging, but they must not appear as active upload state for the candidate's next draft.
- After cancellation, the candidate may create a new draft application.

Response:

```json
{
  "success": true,
  "data": {
    "application_id": 123,
    "status": "cancelled",
    "message": "Draft application has been cancelled."
  },
  "error": null
}
```

### Cancelled status vs hard delete

Use `cancelled` status rather than hard delete. This matches the execution-plan decision and avoids silent data loss while still allowing candidates to restart before final submission.

Implementation implications:

- Application queries that mean "current active application" should exclude `cancelled` unless the route is explicitly history-oriented.
- `POST /api/applications` should allow a new draft when the candidate's previous application is only `cancelled`.
- Document upload/list endpoints should resolve against the active draft, not cancelled applications.
- Recruiter operational lists should omit `cancelled` by default unless a status filter explicitly requests it.

### Smoke test

Script:

```text
scripts/smoke_test_draft_application_reset.py
```

Must verify:

- Candidate can cancel their own draft.
- Candidate cannot cancel submitted, document-review, correction-requested, verified, screening, or announced applications.
- Candidate cannot cancel another user's draft.
- Candidate can create a new draft after cancellation.
- Old draft documents remain linked to the cancelled application but are no longer visible as the active draft's uploaded documents.
- Recruiter default application listing does not include cancelled drafts.

---

## 7.2 Candidate Application Status Support

The frontend can initially compose status data from existing endpoints. A consolidated candidate status endpoint is optional.

Optional endpoint:

```text
GET /api/applications/my/status
```

Possible response sections:

- application
- documents
- announcement
- active period
- next action

Recommendation: defer until frontend composition becomes too complex.

---

## 8. Document Verification and Rejection

## 8.1 Document Rejection Reason

### Purpose

Make document verification actionable. A boolean verification flag does not explain what a candidate should fix.

### Affected roles

| Role | Impact |
|---|---|
| Candidate | Sees rejected document and reason. |
| Recruiter | Can verify or reject with reason. |
| Super Admin | Can verify/reject and audit actions. |

### Data model plan

Add explicit review fields to `documents`:

```text
verification_status: pending | verified | rejected
rejection_reason
reviewed_at
reviewed_by_user_id
```

Existing `is_verified` can remain temporarily for backward compatibility or be migrated to the new enum status.

### API contract

#### `PUT /api/documents/{doc_id}/review`

Body for verification:

```json
{
  "status": "verified",
  "reason": null
}
```

Body for rejection:

```json
{
  "status": "rejected",
  "reason": "KTM tidak terbaca. Mohon upload ulang dokumen yang lebih jelas."
}
```

Rules:

- Recruiter or super admin only.
- Reason is required when status is `rejected`.
- Writes audit log in the same transaction.
- Sends notification if notification feature is enabled.

### Candidate visibility

`GET /api/documents/{application_id}` should include:

```text
verification_status
rejection_reason
reviewed_at
```

### Replacement behavior decision

Open decision: should rejected documents be replaceable after submit?

Default recommendation: keep the current post-submit lock unless recruitment policy explicitly allows corrections after submission.

### Smoke test

Script:

```text
scripts/smoke_test_document_rejection.py
```

Must verify:

- Recruiter can verify document.
- Recruiter can reject document with reason.
- Reject without reason fails.
- Candidate can see rejection reason.
- Candidate cannot review documents.
- Audit log row is written.

---

## 9. Analytics API

## 9.1 Purpose

Provide consistent recruitment metrics for recruiter and super-admin dashboards.

### Access

| Role | Access |
|---|---|
| Candidate | Forbidden. |
| Recruiter | Allowed. |
| Super Admin | Allowed. |

### API contract

#### `GET /api/recruiter/analytics`

Query parameters:

| Param | Type | Meaning |
|---|---|---|
| `period_id` | int optional | Specific period; default active period. |
| `division` | Division optional | Filter metrics to one division. |

Response sections:

```text
period
totals
by_division
document_completeness
evaluation
score_distribution
```

Example response:

```json
{
  "success": true,
  "data": {
    "period": {
      "id": 7,
      "name": "MBC Recruitment 2026",
      "current_phase": "EVALUATION",
      "start_date": "2026-06-01T00:00:00Z",
      "submission_end_date": "2026-06-10T23:59:59Z",
      "evaluation_end_date": "2026-06-20T23:59:59Z",
      "end_date": "2026-06-25T23:59:59Z"
    },
    "totals": {
      "applications": 120,
      "draft": 18,
      "submitted": 24,
      "document_review": 16,
      "correction_requested": 7,
      "verified": 20,
      "screening": 25,
      "announced_pass": 8,
      "announced_fail": 2,
      "cancelled": 0
    },
    "by_division": [
      {
        "division": "big_data",
        "applications": 35,
        "submitted": 8,
        "document_review": 5,
        "verified": 7,
        "screening": 10,
        "announced_pass": 3,
        "announced_fail": 1
      },
      {
        "division": "cyber_security",
        "applications": 30,
        "submitted": 6,
        "document_review": 4,
        "verified": 5,
        "screening": 8,
        "announced_pass": 2,
        "announced_fail": 1
      }
    ],
    "document_completeness": {
      "average_pct": 91.4,
      "complete_applications": 96,
      "incomplete_applications": 24,
      "missing_by_type": {
        "cv": 3,
        "khs": 5,
        "ktm": 2,
        "motivation_letter": 4,
        "swot": 6,
        "supporting_docs": 12
      }
    },
    "evaluation": {
      "screening_eligible_count": 20,
      "pending_evaluation_count": 14,
      "evaluated_count": 35,
      "average_score": 78.6,
      "highest_score": 94.2,
      "lowest_score": 51.0
    },
    "score_distribution": [
      { "bucket": "0-59", "count": 3 },
      { "bucket": "60-69", "count": 7 },
      { "bucket": "70-79", "count": 12 },
      { "bucket": "80-89", "count": 10 },
      { "bucket": "90-100", "count": 3 }
    ]
  },
  "error": null
}
```

Required metrics:

- total applications
- counts by application status
- counts by division
- average document completeness
- missing document count by type
- pending evaluation count
- evaluated count
- announced count
- score distribution buckets

### Implementation notes

- Prefer SQL aggregates over per-row loops.
- Default scope should be the active period.
- Empty dataset should return zero counts, not crash.
- Candidate role must receive 403.

### Smoke test

Script:

```text
scripts/smoke_test_analytics.py
```

Must verify:

- Candidate receives 403.
- Recruiter receives 200.
- Super admin receives 200.
- Empty dataset returns zero counts.
- Seeded applications produce correct funnel counts.
- Division filter returns scoped metrics.
- Score buckets are computed correctly.
- Missing document counts are correct.

---

## 10. Audit Log Listing

## 10.1 Purpose

Expose audit logs to super admins so recruiter/admin actions can be reviewed from the UI.

### API contract

#### `GET /api/admin/audit-logs`

Access:

- Super admin only.

Query parameters:

```text
page
limit
action_type
recruiter_id
candidate_id
date_from
date_to
```

Response sections:

```text
page
limit
total
items[]
```

Example response:

```json
{
  "success": true,
  "data": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "items": [
      {
        "id": 101,
        "action_type": "document_verification",
        "actor": {
          "user_id": 5,
          "full_name": "Recruiter MBC",
          "email": "recruiter@example.com",
          "role": "recruiter"
        },
        "affected_user": {
          "user_id": 17,
          "full_name": "Budi Santoso",
          "email": "candidate@example.com",
          "nim": "1031234567890"
        },
        "old_value": "false",
        "new_value": "true",
        "reason": "doc_id=88; doc_type=supporting_docs",
        "timestamp": "2026-06-12T09:30:00Z"
      },
      {
        "id": 100,
        "action_type": "score_override",
        "actor": {
          "user_id": 6,
          "full_name": "Lead Reviewer",
          "email": "lead@example.com",
          "role": "super_admin"
        },
        "affected_user": {
          "user_id": 18,
          "full_name": "Siti Aminah",
          "email": "siti@example.com",
          "nim": "1031234567891"
        },
        "old_value": "72.0",
        "new_value": "80.0",
        "reason": "Manual review found stronger portfolio evidence.",
        "timestamp": "2026-06-12T08:15:00Z"
      }
    ]
  },
  "error": null
}
```

Default sorting should be newest first by `timestamp DESC`. The response may include user summaries for readability, but it should not expose sensitive fields such as password hashes, raw JWT data, verification/reset secrets, or internal stack traces.

Each item should include:

- action type
- actor/recruiter summary
- affected candidate/user summary
- old value
- new value
- reason
- timestamp

### Implementation notes

- Avoid N+1 user lookups.
- Keep audit rows immutable.
- Do not expose sensitive internal details.

### Smoke test

Script:

```text
scripts/smoke_test_audit_logs.py
```

Must verify:

- Super admin can list audit logs.
- Recruiter cannot list audit logs.
- Candidate cannot list audit logs.
- Pagination works.
- Filtering by action type works.
- Known actions appear after triggering audited operations.

---

## 11. Email Templates and Settings

### First version recommendation

Start with code-based templates in:

```text
backend/services/email_templates.py
```

This is simpler and safer while email flows are still stabilizing.

### Future database-backed templates

If needed later:

```text
email_templates
- id
- key
- subject
- html_body
- text_body
- is_active
- updated_by_user_id
- updated_at
```

Potential keys:

```text
email_verification
forgot_password
application_submitted
document_rejected
announcement_pass
announcement_fail
```

Future endpoints:

```text
GET /api/admin/email-templates
GET /api/admin/email-templates/{key}
PUT /api/admin/email-templates/{key}
```

Access:

- Super admin only.

---

## 12. Profile Consistency for All Roles

The frontend profile/edit split can initially use existing `GET/PUT /api/users/me`.

Possible backend additions:

```text
email_verified_at
is_email_verified
password_changed_at
pending_email
```

Email change decision:

- If email verification is enabled, changing email should eventually use a pending-email verification flow.
- This can be deferred if the first version only verifies email during registration.

---

## 13. Database Migration Plan

Expected Alembic migrations:

### Migration 1 — Email verification

- add email verification fields to `users`
- create email verification link table

### Migration 2 — Forgot password

- create password reset link table
- optionally add `password_changed_at`

### Migration 3 — Document review

- add document verification status fields
- migrate existing `is_verified` values to review status

### Migration 4 — Optional notification log

- create email notification log table if notification tracking is implemented

### Migration 5 — Optional email templates

- create email templates table if templates become database-editable

---

## 14. Backend Smoke Test Strategy

### Required new smoke scripts

| Feature | Script |
|---|---|
| Email verification | `scripts/smoke_test_email_verification.py` |
| Forgot password | `scripts/smoke_test_forgot_password.py` |
| Analytics | `scripts/smoke_test_analytics.py` |
| Draft application reset | `scripts/smoke_test_draft_application_reset.py` |
| Document rejection reason | `scripts/smoke_test_document_rejection.py` |
| Audit log listing | `scripts/smoke_test_audit_logs.py` |
| Email notifications | `scripts/smoke_test_email_notifications.py` |
| Session invalidation | `scripts/smoke_test_token_invalidation.py` |

### Smoke test conventions

Each script should:

- run with `python -m scripts.<script_name_without_py>`
- use FastAPI `TestClient` where possible
- create its own test data
- avoid production credentials
- avoid sending real emails
- print clear pass/fail output
- exit non-zero on failure

### Email test strategy

Email tests must not require real Resend delivery.

Recommended approaches:

1. Add `EMAIL_ENABLED=false` test mode.
2. Use a fake email provider in tests.
3. Monkeypatch email service methods inside smoke scripts.

---

## 15. Regression Test Groups

After implementing a new feature, run related existing smoke tests.

| New Feature | Existing tests to rerun |
|---|---|
| Email verification | `smoke_test_auth` |
| Forgot password | `smoke_test_auth` |
| Draft reset | `smoke_test_applications` |
| Document rejection | `smoke_test_document_verification_audit` |
| Analytics | `smoke_test_applications`, `smoke_test_evaluation`, `smoke_test_bulk_announce` |
| Audit logs | document verification audit, announcement tests, score override path if covered |

---

## 16. API Documentation Updates

After implementation, update:

```text
docs/API_REFERENCE.md
docs/ARCHITECTURE.md
docs/MODULE_ANALYSIS.md
docs/FLOW_DIAGRAMS.md
docs/ISSUES_AND_NOTES.md
```

Updates should include:

- new endpoints
- new models/tables
- new auth flows
- new smoke scripts
- resolved issue notes
- flow diagrams for email verification and forgot password

---

## 17. Security Considerations

### 17.1 Account enumeration

Forgot password and resend verification endpoints must return generic messages regardless of whether the email exists.

### 17.2 Secret link storage

Verification/reset link secrets should not be stored in plaintext.

### 17.3 Expiry

Recommended durations:

| Flow | Suggested expiry |
|---|---|
| Email verification | 60 minutes to 24 hours |
| Forgot password | 30 to 60 minutes |

### 17.4 Rate limiting

Suggested limits:

| Endpoint | Suggested limit |
|---|---|
| resend verification | 1/minute/IP or stricter per email |
| forgot password | 5/hour/IP or per email |
| reset password | 10/hour/IP |

### 17.5 URL safety

Verification and reset URLs should be based on trusted `PUBLIC_FRONTEND_URL`. Do not accept arbitrary redirect URLs from request bodies.

### 17.6 Auditability

Consider audit logging for:

- admin reset password
- document rejection
- email template update
- user role update
- user deactivation/reactivation

---

## 18. Open Backend Decisions

Resolve these before implementation:

1. Should email verification be required only for candidates first, or for all roles?
2. Should register return no token after account creation, or a limited verification-only response?
3. Should verification link expiry be 60 minutes or 24 hours?
4. Should changing email require pending-email verification?
5. Should draft cancellation hard-delete the draft or add a `cancelled` status?
6. Should rejected documents be replaceable after submit if the phase is still `SUBMISSION`?
7. Should analytics default to active period only, or support all periods from the first version?
8. Should email notifications be logged in the database from the first version?
9. Should email templates be hardcoded first or database-configurable from the first version?
10. Should password reset immediately invalidate existing active sessions?

---

## 19. Recommended First Backend Batches

### Batch B1 — Email service and verification

1. Add email service abstraction with disabled/mock mode.
2. Add email verification fields and verification link table.
3. Update register/login behavior for candidate email verification.
4. Add verify-email and resend-verification endpoints.
5. Add `scripts/smoke_test_email_verification.py`.
6. Update API docs for auth changes.
7. Run auth and verification smoke tests.

### Batch B2 — Forgot password

1. Add password reset link table.
2. Add forgot-password and reset-password endpoints.
3. Add password-change timestamp if session invalidation is included.
4. Add `scripts/smoke_test_forgot_password.py`.
5. Confirm admin reset still works.

### Batch B3 — Analytics API

1. Add recruiter analytics endpoint.
2. Add aggregate queries for funnel, division counts, document completeness, and score buckets.
3. Add `scripts/smoke_test_analytics.py`.
4. Support frontend analytics dashboard.

### Batch B4 — Document rejection

1. Add document review fields.
2. Add document review endpoint.
3. Add audit logging and candidate visibility.
4. Add `scripts/smoke_test_document_rejection.py`.

### Batch B5 — Audit log listing

1. Add audit log listing endpoint.
2. Add pagination/filtering.
3. Add `scripts/smoke_test_audit_logs.py`.
4. Support admin audit log page.

---

## 20. Backend Acceptance Criteria

Backend feature work is done when:

- API contract is implemented.
- Migrations are added and run cleanly.
- Role authorization is enforced server-side.
- Invalid inputs return clear errors.
- Email/account flows avoid account enumeration.
- Sensitive link values are not stored in plaintext.
- Targeted smoke test exists and passes.
- Related existing smoke tests still pass.
- API and architecture docs are updated.

---

## 21. Final Notes

Some frontend refactors can proceed using existing APIs, but account, analytics, document rejection, audit, and notification features should be implemented backend-first or as full-stack vertical slices.

A feature is not considered ready unless it has a clear API contract and a smoke test path.
