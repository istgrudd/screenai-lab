# Feature Execution Plan

This document defines the phased execution plan for the ScreenAI Lab feature expansion. It is intended to guide implementation through small, testable batches. Each phase includes scope, affected areas, implementation notes, smoke tests, validation commands, and done criteria.

This plan is based on:

- `docs/features/OVERVIEW.md`
- `docs/features/FRONTEND_IMPLEMENTATION_PLAN.md`
- `docs/features/BACKEND_IMPLEMENTATION_PLAN.md`

> Status: planning document. This file describes intended implementation phases, not completed work.

---

## 1. Locked Product Decisions

The following decisions are locked for the first implementation cycle.

| Area | Decision |
|---|---|
| Email verification scope | Required for candidates. Recruiter and super admin may be supported later, but candidate registration is the first required flow. |
| Register flow | After registration, the user must verify email before login. Register should not return a normal access token. |
| Verification expiry | Verification link/code expires after 60 minutes. User must request resend after expiry. |
| Forgot password session behavior | After successful password reset, existing sessions/tokens should be invalidated using a `password_changed_at` strategy. |
| Admin reset password | Existing super-admin reset password remains as a manual fallback/support flow. |
| Draft reset/cancel | Use `cancelled` status rather than hard delete. This preserves history and avoids silent data loss. |
| Document verification | Recruiter verifies submitted documents before NER anonymization and AI evaluation. |
| Rejected documents | If documents are rejected, candidate is notified and can upload replacement documents. |
| NER timing | NER anonymization runs only after required documents are verified/accepted. |
| Analytics scope | Analytics defaults to the active recruitment period. |
| Email templates | Hardcoded in backend service first. Database-editable templates are deferred. |
| Smoke tests | Every backend/full-stack feature must include a targeted smoke test script. |

---

## 2. Recommended Forgot Password Behavior

The recommended best-practice behavior for this project:

1. User submits email through forgot password page.
2. Backend returns a generic response regardless of whether the email exists.
3. If the user exists, backend creates a short-lived reset link/code.
4. Email is sent through the email service.
5. User opens reset page and submits new password.
6. Backend validates the reset code.
7. Backend updates password hash.
8. Backend sets `users.password_changed_at = now()`.
9. Any JWT issued before `password_changed_at` is rejected by auth middleware.
10. User must login again with the new password.

Why this is recommended:

- It prevents old/stolen tokens from remaining valid after a password reset.
- It works with the current stateless JWT model.
- It avoids a complex token blacklist in the first version.
- It can also apply to admin-assisted password reset.

Implementation implication:

- Add `password_changed_at` to `users`.
- Add an issued-at or password-issued timestamp to JWT claims.
- In `get_current_user`, reject token if it was issued before `password_changed_at`.

---

## 3. Revised Recruitment Workflow

The planned workflow after document verification is introduced:

```text
candidate register
-> verify email
-> login
-> create application draft
-> upload documents
-> review & submit
-> application status: submitted
-> recruiter verifies uploaded documents
   -> if accepted:
      -> application status: verified / ready_for_anonymization
      -> run NER anonymization
      -> application status: screening
      -> AI evaluation
      -> recruiter review
      -> announcement
   -> if rejected:
      -> application status: correction_requested
      -> candidate receives notification
      -> candidate uploads replacement document
      -> candidate resubmits document correction
      -> recruiter verifies again
````

Important note:

Document verification is an administrative validation step. Recruiters may see raw documents during this step. Blind screening starts after documents are accepted and NER anonymization runs.

---

## 4. Application Status Direction

The current application statuses are not enough for the new workflow. The first implementation should consider extending the status enum.

Recommended statuses:

```text
draft
submitted
document_review
correction_requested
verified
screening
announced_pass
announced_fail
cancelled
```

Meaning:

| Status                 | Meaning                                                                       |
| ---------------------- | ----------------------------------------------------------------------------- |
| `draft`                | Candidate started application but has not submitted.                          |
| `submitted`            | Candidate submitted application and documents.                                |
| `document_review`      | Recruiter/admin is checking document correctness.                             |
| `correction_requested` | One or more documents were rejected and candidate must upload replacement.    |
| `verified`             | Documents are accepted and application is ready for anonymization/evaluation. |
| `screening`            | Application has entered AI/manual screening.                                  |
| `announced_pass`       | Candidate passed after announcement.                                          |
| `announced_fail`       | Candidate failed after announcement.                                          |
| `cancelled`            | Candidate/admin cancelled the application before final screening.             |

Open implementation choice:

* `submitted` may immediately transition to `document_review` after submit.
* Or submit endpoint may directly set `document_review`.

Recommendation:

Use `document_review` after submit to make the workflow explicit.

---

## 5. Execution Principles

Each phase should follow these principles:

1. Implement in small batches.
2. Avoid mixing unrelated frontend and backend changes.
3. Add or update smoke tests in the same batch as backend/full-stack changes.
4. Keep old routes/endpoints compatible during transition.
5. Prefer explicit statuses and clear state transitions.
6. Run existing regression smoke tests after related changes.
7. Update documentation after implementation.

General implementation loop:

```text
plan
-> implement backend contract if needed
-> add smoke test
-> implement frontend
-> run build/tests
-> update docs
-> commit
```

---

## 6. Phase Overview

| Phase    | Type          | Scope                                                     | Main Smoke Tests                                                    |
| -------- | ------------- | --------------------------------------------------------- | ------------------------------------------------------------------- |
| Phase 1  | Frontend-only | Candidate information architecture refactor               | `npm run build` + manual route checklist                            |
| Phase 2  | Frontend-only | Recruiter and super-admin navigation/workspace split      | `npm run build` + manual route checklist                            |
| Phase 3  | Backend-first | Email service + candidate email verification              | `smoke_test_email_verification.py`                                  |
| Phase 4  | Backend-first | Forgot password + session invalidation                    | `smoke_test_forgot_password.py`, `smoke_test_token_invalidation.py` |
| Phase 5  | Full-stack    | Auth email frontend pages                                 | auth smoke tests + frontend build                                   |
| Phase 6  | Backend-first | Application status expansion + document verification gate | `smoke_test_document_review_flow.py`                                |
| Phase 7  | Full-stack    | Document rejection/correction UI                          | `smoke_test_document_rejection.py` + frontend build                 |
| Phase 8  | Backend-first | NER timing change after document verification             | application/evaluation smoke tests                                  |
| Phase 9  | Full-stack    | Analytics API + analytics dashboard                       | `smoke_test_analytics.py` + frontend build                          |
| Phase 10 | Full-stack    | Audit log listing + admin audit page                      | `smoke_test_audit_logs.py`                                          |
| Phase 11 | Full-stack    | Email notifications lifecycle                             | `smoke_test_email_notifications.py`                                 |
| Phase 12 | Regression    | Final cleanup, docs, regression suite                     | all smoke tests + frontend build                                    |

---

# Phase 1 — Candidate Frontend Information Architecture Refactor

## Type

Frontend-only.

## Goal

Clean up candidate navigation and remove overlapping pages before adding new backend features.

## Scope

* Split profile summary and edit profile.
* Move division selection out of profile page.
* Add application overview page.
* Merge submitted/status/result into one application status page.
* Make review a final workflow step, not a permanent sidebar item.
* Keep old routes as redirects.

## Target Routes

| Route                 | Purpose                                   |
| --------------------- | ----------------------------------------- |
| `/dashboard`          | Candidate home and next action summary.   |
| `/profile`            | Read-only profile summary.                |
| `/profile/edit`       | Edit profile form.                        |
| `/application`        | Application overview.                     |
| `/application/start`  | Division selection and application start. |
| `/documents`          | Upload documents.                         |
| `/application/review` | Final review and submit.                  |
| `/application/status` | Unified status/result page.               |

## Redirects

| Old Route          | New Behavior                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------- |
| `/review`          | Redirect to `/application/review` if draft, otherwise `/application/status`.              |
| `/submitted`       | Redirect to `/application/status`.                                                        |
| `/result`          | Redirect to `/application/status`.                                                        |
| `/my-applications` | Keep accessible but remove from main candidate sidebar until multi-period support exists. |

## Affected Files

Expected:

```text
frontend/src/App.jsx
frontend/src/pages/candidate/ProfilePage.jsx
frontend/src/pages/candidate/DocumentsPage.jsx
frontend/src/pages/candidate/ReviewPage.jsx
frontend/src/pages/candidate/SubmittedPage.jsx
frontend/src/pages/candidate/ResultPage.jsx
frontend/src/pages/candidate/DashboardPage.jsx
frontend/src/lib/api.js
```

Possible new files:

```text
frontend/src/pages/candidate/EditProfilePage.jsx
frontend/src/pages/candidate/ApplicationOverviewPage.jsx
frontend/src/pages/candidate/StartApplicationPage.jsx
frontend/src/pages/candidate/ApplicationStatusPage.jsx
frontend/src/components/navigation/RoleNavSidebar.jsx
frontend/src/components/candidate/CandidateProfileSummary.jsx
frontend/src/components/candidate/CandidateProfileForm.jsx
frontend/src/components/candidate/ApplicationNextActionCard.jsx
```

## Do Not Change

* Do not change backend API contracts in this phase.
* Do not remove existing protected route behavior.
* Do not remove old routes without redirect compatibility.
* Do not change application submission backend rules.

## Validation

```bash
cd frontend
npm run build
```

Manual candidate route checklist:

* Candidate can open dashboard.
* Candidate can open profile summary.
* Candidate can edit profile.
* Candidate can start application.
* Candidate can upload documents.
* Candidate can open review step.
* Candidate can submit application.
* Candidate can view status/result through `/application/status`.
* Old `/review`, `/submitted`, and `/result` do not break.

## Done Criteria

* Candidate sidebar no longer shows overlapping Review/Status/Result pages.
* Review is reachable through CTA only.
* Status and result are unified.
* Profile edit is separated from application start.
* Frontend build passes.

---

# Phase 2 — Recruiter and Super Admin Frontend Workspace Split

## Type

Frontend-only.

## Goal

Split the overloaded recruiter dashboard into focused workspaces and prepare UI structure for later backend features.

## Scope

Recruiter pages:

* Overview
* Applications
* Evaluation
* Candidates
* Document Verification
* Announcements
* Analytics
* Rubrics
* Profile

Super admin pages:

* Admin overview
* Users
* Periods
* Audit logs placeholder
* Email templates placeholder
* Settings placeholder
* Recruiter workflow access
* Profile

## Target Recruiter Routes

| Route                      | Purpose                          |
| -------------------------- | -------------------------------- |
| `/recruiter/dashboard`     | Overview and shortcuts.          |
| `/recruiter/applications`  | Application table and filters.   |
| `/recruiter/evaluation`    | Run/re-run AI evaluation.        |
| `/recruiter/candidates`    | Ranked/scored candidates.        |
| `/recruiter/documents`     | Document verification workspace. |
| `/recruiter/announcements` | Publish pass/fail announcements. |
| `/recruiter/analytics`     | Analytics dashboard.             |
| `/rubrics`                 | Rubric configuration.            |
| `/recruiter/profile`       | Profile summary.                 |
| `/recruiter/profile/edit`  | Edit profile.                    |

## Target Super Admin Routes

| Route                    | Purpose                          |
| ------------------------ | -------------------------------- |
| `/admin/dashboard`       | Admin overview.                  |
| `/admin/users`           | User management.                 |
| `/admin/periods`         | Recruitment period management.   |
| `/admin/audit-logs`      | Audit log viewer or placeholder. |
| `/admin/email-templates` | Template page or placeholder.    |
| `/admin/settings`        | Settings page or placeholder.    |
| `/admin/profile`         | Profile summary.                 |
| `/admin/profile/edit`    | Edit profile.                    |

## Affected Files

Expected:

```text
frontend/src/App.jsx
frontend/src/pages/DashboardPage.jsx
frontend/src/pages/RubricConfigPage.jsx
frontend/src/pages/CandidateDetailPage.jsx
frontend/src/pages/admin/AdminPage.jsx
frontend/src/pages/admin/RecruitmentPeriodPage.jsx
frontend/src/pages/admin/ProfilePage.jsx
frontend/src/pages/recruiter/ProfilePage.jsx
```

Possible new files:

```text
frontend/src/pages/recruiter/OverviewPage.jsx
frontend/src/pages/recruiter/ApplicationsPage.jsx
frontend/src/pages/recruiter/EvaluationPage.jsx
frontend/src/pages/recruiter/CandidatesPage.jsx
frontend/src/pages/recruiter/DocumentVerificationPage.jsx
frontend/src/pages/recruiter/AnnouncementsPage.jsx
frontend/src/pages/recruiter/AnalyticsPage.jsx
frontend/src/pages/admin/OverviewPage.jsx
frontend/src/pages/admin/AuditLogsPage.jsx
frontend/src/pages/admin/EmailTemplatesPage.jsx
frontend/src/pages/admin/SettingsPage.jsx
```

## Do Not Change

* Do not change backend evaluation or announcement behavior.
* Do not duplicate complex dashboard logic without extracting reusable components.
* Do not expose admin-only routes to recruiter/candidate navigation.

## Validation

```bash
cd frontend
npm run build
```

Manual route checklist:

* Recruiter can open dashboard overview.
* Recruiter can open applications page.
* Recruiter can open evaluation page.
* Recruiter can open announcements page.
* Recruiter can open candidate detail.
* Super admin sees admin navigation group.
* Candidate cannot access recruiter/admin pages.
* Recruiter cannot access admin-only pages.

## Done Criteria

* Recruiter dashboard is no longer the only operational workspace.
* Sidebar is grouped by role and workflow.
* Super admin navigation is organized.
* Frontend build passes.

---

# Phase 3 — Email Service and Candidate Email Verification

## Type

Backend-first.

## Goal

Add candidate email verification using Resend through a backend email service abstraction.

## Locked Decisions

* Email verification required for candidate accounts.
* Register does not return a normal access token.
* Candidate must verify email before login.
* Verification expires after 60 minutes.
* Resend verification is required after expiry.
* Email templates are hardcoded first.

## Backend Scope

* Add email service abstraction.
* Add email verification model/table.
* Add user email verification fields.
* Update candidate registration.
* Update login behavior for unverified candidate.
* Add verify email endpoint.
* Add resend verification endpoint.
* Add smoke test.

## Suggested Data Model

Add to `users`:

```text
email_verified_at
email_verification_sent_at
```

Add table:

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

## Suggested API

```text
POST /api/auth/register
GET  /api/auth/verify-email?code=...
POST /api/auth/resend-verification
POST /api/auth/login
```

Login behavior:

* valid credentials + unverified candidate -> `403 EMAIL_NOT_VERIFIED`
* verified candidate -> normal login
* recruiter/super admin behavior unchanged unless verification is later extended

## Affected Files

Expected:

```text
backend/models/user.py
backend/routers/auth.py
backend/services/auth_service.py
backend/utils/security.py
backend/config.py
backend/alembic/versions/<revision>_email_verification.py
.env.example
frontend/.env.example
```

New:

```text
backend/models/email_verification.py
backend/services/email_service.py
backend/services/email_templates.py
backend/services/email_verification_service.py
scripts/smoke_test_email_verification.py
```

## Do Not Change

* Do not remove admin reset password.
* Do not require verification for recruiter/admin in this first version unless explicitly decided later.
* Do not send real email in smoke tests.
* Do not store raw verification code/link secret in plaintext.
* Do not leak account existence through resend endpoint.

## Smoke Test

Script:

```bash
python -m scripts.smoke_test_email_verification
```

Must verify:

* Register creates candidate with unverified email.
* Register response does not include normal access token.
* Login before verification returns `403 EMAIL_NOT_VERIFIED`.
* Invalid verification code fails.
* Expired verification code fails.
* Valid verification code succeeds.
* Login after verification succeeds.
* Reusing verification code fails.
* Resend verification returns generic response.
* Email sending is mocked/disabled in test mode.

## Regression Tests

```bash
python -m scripts.smoke_test_auth
```

## Done Criteria

* Candidate email verification works end-to-end.
* Resend is abstracted behind service layer.
* Smoke test passes.
* Existing auth smoke test passes.
* API docs are updated.

---

# Phase 4 — Forgot Password and Session Invalidation

## Type

Backend-first.

## Goal

Add self-service forgot password and invalidate old sessions after password reset.

## Locked Decision

Forgot password should invalidate existing sessions/tokens after successful reset using `password_changed_at`.

## Backend Scope

* Add password reset link table.
* Add forgot password endpoint.
* Add reset password endpoint.
* Add `password_changed_at` to user model.
* Update JWT creation/auth validation to reject tokens issued before password change.
* Ensure admin reset password also updates `password_changed_at`.
* Add smoke tests.

## Suggested Data Model

Add to `users`:

```text
password_changed_at
```

Add table:

```text
password_reset_links
- id
- user_id
- link_secret_hash
- expires_at
- used_at
- created_at
```

## Suggested API

```text
POST /api/auth/forgot-password
POST /api/auth/reset-password
POST /api/auth/admin/reset-password
```

Expected behavior:

* Forgot password returns generic response regardless of email existence.
* Reset password validates code, updates password, marks link used.
* Old password no longer works.
* Old issued JWT no longer works.
* New login works.
* Admin reset also invalidates previous sessions.

## Affected Files

Expected:

```text
backend/models/user.py
backend/routers/auth.py
backend/services/auth_service.py
backend/utils/security.py
backend/middleware/auth_middleware.py
backend/config.py
backend/alembic/versions/<revision>_password_reset.py
```

New:

```text
backend/models/password_reset.py
backend/services/password_reset_service.py
scripts/smoke_test_forgot_password.py
scripts/smoke_test_token_invalidation.py
```

## Do Not Change

* Do not remove admin reset password.
* Do not reveal whether an email exists.
* Do not store raw reset code/link secret in plaintext.
* Do not send real email in smoke tests.

## Smoke Tests

```bash
python -m scripts.smoke_test_forgot_password
python -m scripts.smoke_test_token_invalidation
```

Must verify:

* Existing user can request password reset.
* Unknown email gets same generic response.
* Invalid reset code fails.
* Expired reset code fails.
* Valid reset code changes password.
* Old password fails.
* New password works.
* Reusing reset code fails.
* JWT issued before reset is rejected.
* Admin reset also invalidates previous sessions.

## Regression Tests

```bash
python -m scripts.smoke_test_auth
python -m scripts.smoke_test_email_verification
```

## Done Criteria

* Self-service password reset works.
* Existing sessions are invalidated after password reset.
* Admin reset remains available.
* Smoke tests pass.
* Auth docs are updated.

---

# Phase 5 — Auth Email Frontend Pages

## Type

Full-stack frontend integration.

## Goal

Expose email verification and forgot password flows in the frontend.

## Scope

* Register success verification notice.
* Verify email result page.
* Resend verification UI.
* Forgot password page.
* Reset password page.
* Login handling for unverified candidate error.

## Routes

| Route              | Purpose                           |
| ------------------ | --------------------------------- |
| `/verify-email`    | Handles verification code result. |
| `/forgot-password` | Request reset email.              |
| `/reset-password`  | Set new password from reset code. |

## Affected Files

Expected:

```text
frontend/src/App.jsx
frontend/src/pages/RegisterPage.jsx
frontend/src/pages/LoginPage.jsx
frontend/src/lib/api.js
```

New:

```text
frontend/src/pages/VerifyEmailPage.jsx
frontend/src/pages/ForgotPasswordPage.jsx
frontend/src/pages/ResetPasswordPage.jsx
```

## Do Not Change

* Do not store reset/verification codes in localStorage.
* Do not auto-login after reset.
* Do not reveal whether email exists on forgot password page.

## Validation

```bash
cd frontend
npm run build
```

Backend smoke:

```bash
python -m scripts.smoke_test_email_verification
python -m scripts.smoke_test_forgot_password
```

Manual checks:

* Register shows verify email instruction.
* Login before verification shows clear message.
* Verify email page handles success, expired, invalid.
* Resend verification works.
* Forgot password page shows generic success.
* Reset password page handles success and invalid/expired code.

## Done Criteria

* Auth email flows are usable from UI.
* Frontend build passes.
* Backend smoke tests pass.

---

# Phase 6 — Application Status Expansion and Document Verification Gate

## Type

Backend-first.

## Goal

Change the application lifecycle so submitted documents are verified before NER anonymization and AI evaluation.

## Scope

* Add new application statuses.
* Move submit behavior from direct anonymization trigger to document review state.
* Add document review status.
* Add review endpoint.
* Ensure NER anonymization runs only after document acceptance.
* Add smoke test for document review flow.

## Recommended Application Statuses

```text
draft
submitted
document_review
correction_requested
verified
screening
announced_pass
announced_fail
cancelled
```

## Recommended Document Review Statuses

```text
pending
verified
rejected
```

## Revised Submit Behavior

Current:

```text
submit -> status=submitted -> background NER anonymization
```

Target:

```text
submit
-> status=document_review
-> documents pending verification
-> recruiter verifies required documents
-> if all accepted:
   -> status=verified
   -> trigger NER anonymization
   -> status=screening when ready/evaluated
-> if any rejected:
   -> status=correction_requested
   -> candidate can upload replacement
```

## Important Design Note

Recruiter document verification happens before blind screening. Recruiters may see raw documents to validate file correctness. The AI evaluation path should use anonymized content after verification.

## Suggested API

```text
PUT /api/documents/{doc_id}/review
POST /api/applications/{application_id}/complete-document-review
```

Alternative:

* `PUT /api/documents/{doc_id}/review` automatically checks whether all required docs are verified and transitions application state.

Recommendation:

Keep transition automatic when all required documents are verified, but make the logic explicit in a service.

## Affected Files

Expected:

```text
backend/models/application.py
backend/models/document.py
backend/routers/applications.py
backend/routers/documents.py
backend/services/submit_anonymization.py
backend/services/evaluation_service.py
backend/alembic/versions/<revision>_document_review_flow.py
```

New:

```text
backend/services/document_review_service.py
scripts/smoke_test_document_review_flow.py
```

## Do Not Change

* Do not allow AI evaluation for applications still in `document_review` or `correction_requested`.
* Do not run NER anonymization before document verification.
* Do not allow candidates to review/verify their own documents.
* Do not remove existing file validation.

## Smoke Test

```bash
python -m scripts.smoke_test_document_review_flow
```

Must verify:

* Candidate submits application.
* Application enters `document_review`.
* NER anonymization is not triggered immediately.
* Recruiter verifies all required documents.
* Application becomes `verified` or proceeds to anonymization flow.
* NER anonymization runs after verification.
* Evaluation only targets verified/screening-eligible applications.
* Candidate cannot verify documents.

## Regression Tests

```bash
python -m scripts.smoke_test_applications
python -m scripts.smoke_test_evaluation
```

## Done Criteria

* Document review gate is enforced.
* Anonymization timing is correct.
* Evaluation respects new status flow.
* Smoke tests pass.

---

# Phase 7 — Document Rejection and Correction Flow

## Type

Full-stack.

## Goal

Allow recruiters to reject incorrect documents with reason and allow candidates to upload replacements.

## Scope

* Add document rejection reason.
* Add candidate visibility for rejected documents.
* Allow replacement in `correction_requested` state.
* Notify candidate through website and optionally email.
* Add recruiter document verification page integration.
* Add candidate document/status UI integration.

## Backend Behavior

When recruiter rejects a document:

```text
document.verification_status = rejected
document.rejection_reason = <reason>
application.status = correction_requested
audit log written
notification sent/logged if enabled
```

When candidate uploads replacement:

```text
replace rejected document
document.verification_status = pending
document.rejection_reason = null or archived
if all rejected docs corrected:
   application.status = document_review
```

## Suggested API

```text
PUT /api/documents/{doc_id}/review
PUT /api/documents/{doc_id}/replace
GET /api/documents/{application_id}
GET /api/applications/my/status
```

## Affected Files

Backend:

```text
backend/models/document.py
backend/models/application.py
backend/routers/documents.py
backend/routers/applications.py
backend/models/audit.py
backend/services/document_review_service.py
```

Frontend:

```text
frontend/src/pages/recruiter/DocumentVerificationPage.jsx
frontend/src/pages/candidate/DocumentsPage.jsx
frontend/src/pages/candidate/ApplicationStatusPage.jsx
frontend/src/lib/api.js
```

New smoke:

```text
scripts/smoke_test_document_rejection.py
```

## Do Not Change

* Do not allow replacement for verified documents unless policy says so.
* Do not allow replacement after final screening/announcement.
* Do not let candidate bypass review by replacing document after verification.
* Do not run evaluation while application is `correction_requested`.

## Smoke Test

```bash
python -m scripts.smoke_test_document_rejection
```

Must verify:

* Recruiter can reject document with reason.
* Reject without reason fails.
* Candidate can see rejection reason.
* Candidate can replace rejected document.
* Replacement resets document status to pending.
* Application returns to document review.
* Candidate cannot replace unrelated/other user's document.
* Audit log is written.

## Frontend Validation

```bash
cd frontend
npm run build
```

Manual checks:

* Recruiter can reject with reason.
* Candidate sees rejected document clearly.
* Candidate sees next action.
* Candidate can upload replacement if allowed.
* Candidate status page explains correction state.

## Done Criteria

* Document rejection is actionable.
* Candidate correction loop works.
* Evaluation remains blocked until verification is complete.
* Smoke tests pass.

---

# Phase 8 — NER and Evaluation Flow Adjustment

## Type

Backend-first.

## Goal

Ensure NER anonymization and evaluation operate only on verified documents.

## Scope

* Update submit-time anonymization behavior.
* Trigger anonymization after document verification.
* Update evaluation target filtering.
* Update smoke tests.
* Update docs.

## Target Behavior

```text
submit -> document_review
document verified -> trigger anonymization
anonymization done -> ready for evaluation/screening
evaluation run -> screening
```

## Affected Files

Expected:

```text
backend/services/submit_anonymization.py
backend/services/evaluation_service.py
backend/routers/evaluate_batch.py
backend/routers/applications.py
backend/routers/documents.py
```

## Do Not Change

* Do not evaluate applications with rejected/pending documents.
* Do not remove fallback handling unless safely replaced.
* Do not expose anonymized content to candidates.

## Smoke Tests

```bash
python -m scripts.smoke_test_document_review_flow
python -m scripts.smoke_test_evaluation
```

Additional checks:

* Submitted but unverified application is skipped by evaluation.
* Verified application can be evaluated.
* Rejected/correction application is skipped.
* Anonymized candidate documents are created after verification.

## Done Criteria

* Evaluation pipeline respects document verification.
* NER runs at the correct time.
* Existing evaluation behavior remains stable for verified applications.

---

# Phase 9 — Analytics API and Dashboard

## Type

Full-stack.

## Goal

Add recruitment analytics for recruiter and super admin, scoped to active period by default.

## Locked Decision

Analytics defaults to active period only.

## Backend Scope

Add analytics endpoint:

```text
GET /api/recruiter/analytics
```

Query params:

```text
division optional
```

Default:

```text
active period
```

Metrics:

* applicants per division
* funnel counts
* document completeness
* missing documents by type
* evaluation progress
* score distribution
* active period summary

## Frontend Scope

Add page:

```text
/recruiter/analytics
```

Possibly visible to:

```text
Recruiter
Super Admin
```

UI sections:

* metric cards
* applicants per division
* funnel chart
* document completeness
* score distribution
* evaluation progress

## Affected Files

Backend:

```text
backend/routers/analytics.py
backend/models/application.py
backend/models/document.py
backend/models/candidate.py
backend/models/score.py
backend/main.py
```

Frontend:

```text
frontend/src/pages/recruiter/AnalyticsPage.jsx
frontend/src/lib/api.js
frontend/src/App.jsx
```

Smoke:

```text
scripts/smoke_test_analytics.py
```

## Do Not Change

* Do not expose analytics to candidates.
* Do not compute analytics only in frontend.
* Do not include inactive periods unless explicitly requested later.
* Do not make charts depend on non-existent data without empty state.

## Smoke Test

```bash
python -m scripts.smoke_test_analytics
```

Must verify:

* Recruiter can access analytics.
* Super admin can access analytics.
* Candidate receives 403.
* Empty active period returns zero counts.
* Seeded data returns correct division counts.
* Funnel counts are correct.
* Missing document counts are correct.
* Score buckets are correct.

## Frontend Validation

```bash
cd frontend
npm run build
```

Manual checks:

* Analytics page loads for recruiter/super admin.
* Candidate cannot access analytics.
* Empty state is readable.
* Charts/cards render from API data.

## Done Criteria

* Analytics endpoint is stable.
* Analytics dashboard renders.
* Smoke test passes.
* Frontend build passes.

---

# Phase 10 — Audit Log Listing and Admin Audit Page

## Type

Full-stack.

## Goal

Allow super admin to inspect audit logs from the UI.

## Backend Scope

Add endpoint:

```text
GET /api/admin/audit-logs
```

Filters:

```text
page
limit
action_type
recruiter_id
candidate_id
date_from
date_to
```

## Frontend Scope

Add page:

```text
/admin/audit-logs
```

UI:

* table
* filters
* pagination
* empty state
* action type badges

## Affected Files

Backend:

```text
backend/routers/audit_logs.py
backend/models/audit.py
backend/main.py
```

Frontend:

```text
frontend/src/pages/admin/AuditLogsPage.jsx
frontend/src/lib/api.js
frontend/src/App.jsx
```

Smoke:

```text
scripts/smoke_test_audit_logs.py
```

## Do Not Change

* Do not allow recruiter/candidate access.
* Do not expose sensitive internal traces.
* Do not mutate audit logs through this endpoint.

## Smoke Test

```bash
python -m scripts.smoke_test_audit_logs
```

Must verify:

* Super admin can list audit logs.
* Recruiter receives 403.
* Candidate receives 403.
* Pagination works.
* Filtering by action type works.
* Document rejection/verification logs appear.

## Frontend Validation

```bash
cd frontend
npm run build
```

## Done Criteria

* Admin can inspect audit logs.
* Access control is enforced.
* Smoke test passes.

---

# Phase 11 — Email Notification Lifecycle

## Type

Full-stack.

## Goal

Send user-facing email notifications for key recruitment events.

## Locked Decision

Email templates are hardcoded first.

## Notification Events

| Event                  | Recipient | Trigger                          |
| ---------------------- | --------- | -------------------------------- |
| Email verification     | Candidate | Register/resend verification     |
| Forgot password        | Any role  | Forgot password request          |
| Application submitted  | Candidate | Candidate submits application    |
| Document rejected      | Candidate | Recruiter rejects document       |
| Document verified      | Candidate | Optional, when all docs accepted |
| Announcement published | Candidate | Single/bulk announcement         |

## Backend Scope

* Add notification methods to email service.
* Add hardcoded templates.
* Optional notification log table.
* Trigger notifications from service layer, not directly from frontend.

## Frontend Scope

* Show website notification/status messages.
* Do not depend solely on email delivery.
* Candidate status page should show same state as backend.

## Affected Files

Backend:

```text
backend/services/email_service.py
backend/services/email_templates.py
backend/services/document_review_service.py
backend/routers/applications.py
backend/routers/announcements.py
```

Optional:

```text
backend/models/email_notification.py
```

Smoke:

```text
scripts/smoke_test_email_notifications.py
```

## Do Not Change

* Do not fail announcement publishing only because notification email fails unless explicitly required.
* Do not send real emails in smoke tests.
* Do not duplicate email sending logic across routers.

## Smoke Test

```bash
python -m scripts.smoke_test_email_notifications
```

Must verify:

* Submit success notification is triggered/logged.
* Document rejection notification is triggered/logged.
* Announcement notification is triggered/logged.
* Email disabled/mock mode works.

## Done Criteria

* Notification lifecycle works.
* Email templates are centralized.
* Email failures are handled safely.
* Smoke test passes.

---

# Phase 12 — Final Regression and Documentation Update

## Type

Regression/docs.

## Goal

Ensure all feature phases work together and documentation reflects the final implemented behavior.

## Required Commands

Backend smoke tests:

```bash
python -m scripts.smoke_test_auth
python -m scripts.smoke_test_email_verification
python -m scripts.smoke_test_forgot_password
python -m scripts.smoke_test_token_invalidation
python -m scripts.smoke_test_applications
python -m scripts.smoke_test_draft_application_reset
python -m scripts.smoke_test_document_review_flow
python -m scripts.smoke_test_document_rejection
python -m scripts.smoke_test_analytics
python -m scripts.smoke_test_audit_logs
python -m scripts.smoke_test_email_notifications
python -m scripts.smoke_test_evaluation
python -m scripts.smoke_test_bulk_announce
```

Frontend:

```bash
cd frontend
npm run build
```

Optional backend compile check:

```bash
python -m compileall backend scripts
```

## Documentation Updates

Update:

```text
docs/API_REFERENCE.md
docs/ARCHITECTURE.md
docs/MODULE_ANALYSIS.md
docs/FLOW_DIAGRAMS.md
docs/ISSUES_AND_NOTES.md
docs/features/OVERVIEW.md
docs/features/FRONTEND_IMPLEMENTATION_PLAN.md
docs/features/BACKEND_IMPLEMENTATION_PLAN.md
docs/features/EXECUTION_PLAN.md
```

## Done Criteria

* All smoke tests pass.
* Frontend build passes.
* Docs match implemented behavior.
* Old route redirects work.
* Backend role protection is confirmed.
* Candidate, recruiter, and super admin workflows are manually checked.

---

## Final Implementation Order Recommendation

Recommended implementation order:

1. Phase 1 — candidate frontend IA cleanup.
2. Phase 2 — recruiter/super admin frontend workspace split.
3. Phase 3 — email verification backend.
4. Phase 4 — forgot password and session invalidation backend.
5. Phase 5 — auth email frontend pages.
6. Phase 6 — document verification gate backend.
7. Phase 7 — document rejection/correction full-stack flow.
8. Phase 8 — NER/evaluation timing adjustment.
9. Phase 9 — analytics API and dashboard.
10. Phase 10 — audit log listing and admin page.
11. Phase 11 — email notification lifecycle.
12. Phase 12 — final regression and docs.

This order keeps frontend structure clean before large workflow changes, while ensuring backend-critical authentication and document verification features are implemented before analytics and notification polish.