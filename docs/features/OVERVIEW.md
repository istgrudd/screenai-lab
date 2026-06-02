# Feature Overview

This document is the entry point for the planned ScreenAI Lab feature expansion. It summarizes the product problems, design principles, feature scope, affected roles, priorities, and dependencies before the work is broken down into frontend, backend, and execution plans.

The detailed implementation documents live beside this file:

- `FRONTEND_IMPLEMENTATION_PLAN.md`
- `BACKEND_IMPLEMENTATION_PLAN.md`
- `EXECUTION_PLAN.md`

> Status: planning document. The feature list below is intentionally written as an implementation roadmap, not as a record of already completed work.

> Implementation source of truth: `EXECUTION_PLAN.md` contains the locked product decisions, phase order, smoke tests, and done criteria. If this overview conflicts with the execution plan, follow `EXECUTION_PLAN.md`.

---

## 1. Background

ScreenAI Lab already supports the core recruitment flow: candidate registration, profile setup, application creation, document upload, final submission, recruiter evaluation, rubric-based scoring, manual review, and announcement publishing.

Phase 1 through Phase 11 plus the frontend redesign have moved the system from a working MVP into a more complete recruitment portal. The remaining notes below describe the feature structure and deferred follow-ups after Phase 12 regression.

1. **Frontend information architecture**
   - Candidate pages contain overlapping concepts, especially `Review`, `Status`, and `Result`.
   - Candidate profile editing is mixed with application/division selection.
   - Recruiter navigation is too limited compared with the number of actions handled by the recruiter dashboard.
   - The recruiter dashboard currently carries too many responsibilities: application list, evaluation trigger, re-evaluation, bulk announcement, filters, phase warning, and candidate selection.

2. **Account and authentication completeness**
   - Candidate registration requires email verification before login.
   - Self-service forgot/reset password is available for all users.
   - Admin-assisted password reset sends a reset link as a support fallback; direct admin-set-password is retired.

3. **Operational and recruitment workflow completeness**
   - Recruiters need more focused pages for applications, evaluations, document verification, announcements, and analytics.
   - Super admins have audit logs and Admin Emails monitoring; global settings remain a placeholder/follow-up.
   - Candidates need clearer status/result feedback and better document rejection visibility.

---

## 2. Current Problems

### 2.1 Candidate UI overlap

The candidate flow currently has several pages that partially repeat each other:

- `Review` is a final pre-submit step, but it appears like a permanent sidebar destination.
- `Status` shows submitted application state and journey progress.
- `Result` also shows announcement/result state and journey progress.

This creates ambiguity: candidates may not understand whether they should check `Status`, `Result`, or both.

### 2.2 Profile and application flow are mixed

Candidate profile currently includes both personal data editing and division/application start logic. These should be separated because they represent different concepts:

- **Profile**: account and identity information.
- **Application**: recruitment-specific process, including chosen division and submitted documents.

### 2.3 Recruiter dashboard is overloaded

The recruiter dashboard currently acts as an all-in-one workspace. This works for an MVP, but it is not ideal for a proper recruitment portal. Recruiter tasks should be separated into clearer pages:

- Applications
- Evaluation
- Candidates
- Document Verification
- Announcements
- Analytics
- Rubrics

### 2.4 Backend feature gaps

Several important backend capabilities are either missing or only partially available:

- Email verification tokens
- Forgot password tokens
- Analytics metrics endpoint
- Audit log listing endpoint
- Document rejection reason
- Email notification service
- Draft application cancellation/reset
- Stronger token/session management

### 2.5 Testing discipline for new features

Every feature addition should include a smoke test script. The goal is to make regressions easier to detect and make failures easier to localize.

---

## 3. Design Principles

The next feature phase should follow these principles.

### 3.1 Role-based information architecture

Each role should have navigation that reflects its actual workflow.

- Candidate: apply, upload, submit, track status.
- Recruiter: review, evaluate, verify, rank, announce.
- Super Admin: configure, audit, manage users, manage periods, supervise the system.

### 3.2 Dashboard should summarize, not contain every action

A dashboard should present high-level status, key metrics, and shortcuts. It should not become the only workspace for every operation.

### 3.3 Review is a step, not a persistent destination

The candidate `Review & Submit` page should behave like a final step after documents are complete, not as a permanent sidebar page.

### 3.4 Status and result should be unified for candidates

Candidates should have one clear application status page that handles:

- Draft state
- Submitted state
- Screening state
- Announcement pending state
- Passed/failed result state
- Notes or rejection information when available

### 3.5 Backend remains the source of truth

Frontend refactors may improve navigation and UX, but phase gates, role authorization, submission rules, evaluation state, and announcement state must remain enforced by the backend.

### 3.6 Feature work should be implemented in vertical slices when possible

For features that need both backend and frontend, implementation should follow a vertical-slice approach:

```text
plan -> API contract -> backend -> backend smoke test -> frontend -> frontend smoke/manual test -> docs update
```

### 3.7 Every new feature must include a smoke test plan

Each new backend or full-stack feature should include a script under `scripts/`, for example:

```text
scripts/smoke_test_email_verification.py
scripts/smoke_test_forgot_password.py
scripts/smoke_test_analytics.py
scripts/smoke_test_document_rejection.py
scripts/smoke_test_audit_logs.py
```

Frontend-only features should at minimum pass:

```text
npm run build
```

If Playwright or another UI test runner is introduced later, route-level UI smoke tests should be added.

---

## 4. Feature Scope Summary

The planned features are grouped into three categories:

1. **Frontend-only**: information architecture, page splitting, route restructuring, and UI cleanup using existing backend APIs.
2. **Backend-only**: API/data/service foundations that can be implemented before UI work.
3. **Full-stack**: features requiring backend, frontend, and smoke tests together.

---

## 5. Frontend-Only Features

| Feature | Affected Roles | Priority | Summary |
|---|---|---:|---|
| Profile page and edit profile page split | Candidate, Recruiter, Super Admin | P0 | Profile becomes a read-only summary page, while editing moves to a dedicated page. |
| Candidate profile/application separation | Candidate | P0 | Division selection and application start are moved out of profile editing. |
| Candidate status/result merge | Candidate | P0 | `Status` and `Result` become one application status page. |
| Review as final step | Candidate | P0 | `Review & Submit` is removed from permanent sidebar navigation and becomes a CTA-driven final step. |
| Role-based grouped sidebar | Candidate, Recruiter, Super Admin | P0 | Sidebar is reorganized by workflow groups instead of a flat route list. |
| Recruiter dashboard decomposition | Recruiter, Super Admin | P1 | Current all-in-one dashboard is split into overview, applications, evaluation, announcements, candidates, and analytics pages. |
| Super admin navigation cleanup | Super Admin | P1 | Admin pages are grouped into users, periods, audit logs, settings, and templates. |
| Shared page layout/components | All roles | P1 | Reusable page headers, empty states, status cards, and action panels are extracted. |

---

## 6. Backend-Only Features

| Feature | Affected Roles | Priority | Summary |
|---|---|---:|---|
| Analytics metrics API | Recruiter, Super Admin | P1 | Provides statistics for applicants per division, funnel counts, document completeness, and score distribution. |
| Audit log listing API | Super Admin | P1 | Allows super admins to inspect recorded recruiter/admin actions. |
| Email service abstraction | Candidate, Recruiter, Super Admin | P1 | Centralizes email sending logic before adding verification, reset, and notification flows. |
| Email template backend structure | Super Admin | P2 | Defines reusable templates for verification, reset password, document rejection, and announcement emails. |
| Token/session hardening design | All roles | P2 | Prepares for token revocation, session invalidation, and safer logout/reset behavior. |
| Smoke test scripts for backend features | Developer / operator | P0 | Ensures each backend feature has a targeted smoke test script. |

---

## 7. Full-Stack Features

| Feature | Affected Roles | Priority | Summary |
|---|---|---:|---|
| Email verification with Resend | Candidate, Super Admin | P0 | Candidate must verify email before gaining full access. Admin can see verification status. |
| Forgot password via email token | Candidate, Recruiter, Super Admin | P0 | All users can request a password reset link. Existing admin reset remains as fallback/manual support. |
| Analytics dashboard | Recruiter, Super Admin | P1 | Displays recruitment statistics from the analytics API. |
| Cancel/reset draft application | Candidate, Super Admin | P2 | Dedicated reset/cancel flow is deferred; do not require a Phase 12 smoke script until the behavior is clarified. |
| Document rejection reason | Candidate, Recruiter, Super Admin | P1 | Recruiter can reject a document with a reason; candidate can see what needs to be fixed. |
| Email notification lifecycle | Candidate, Recruiter, Super Admin | P1 | Sends emails for verification, reset password, successful submit, document rejection, and announcement publication. |
| Audit log viewer page | Super Admin | P1 | UI for browsing audit log entries returned by the audit log API. |
| Admin Emails monitoring | Super Admin | P1 | Read-only UI for workflow notification logs. Editable templates/resend workflows are deferred. |
| Profile/edit consistency for all roles | Candidate, Recruiter, Super Admin | P1 | Ensures profile viewing and editing behave consistently across role-specific routes. |

---

## 8. Role Impact Matrix

| Feature | Candidate | Recruiter | Super Admin |
|---|:---:|:---:|:---:|
| Profile page and edit profile split | Yes | Yes | Yes |
| Candidate profile/application separation | Yes | No | No |
| Candidate status/result merge | Yes | No | No |
| Review as final step | Yes | No | No |
| Role-based grouped sidebar | Yes | Yes | Yes |
| Recruiter dashboard decomposition | No | Yes | Yes |
| Analytics metrics API/dashboard | No | Yes | Yes |
| Email verification | Yes | Optional | Admin visibility |
| Forgot password via email token | Yes | Yes | Yes |
| Cancel/reset draft application | Yes | No | Support action |
| Document rejection reason | Yes | Yes | Yes |
| Email notification lifecycle | Yes | Action trigger | Configuration/supervision |
| Audit log listing/viewer | No | No | Yes |
| Email templates/settings | No | No | Yes |
| Token/session hardening | Yes | Yes | Yes |

Notes:

- Recruiter and super admin accounts may also benefit from email verification, but the first required use case is candidate registration.
- Super admin may not be a direct user of every workflow, but super admin often needs visibility, override, or configuration access.

---

## 9. Priority Matrix

### P0 — must-have for the next structured implementation phase

| Feature | Reason |
|---|---|
| Candidate frontend IA cleanup | Reduces confusion in the main applicant journey. |
| Profile/edit split | Creates a cleaner account pattern for all roles. |
| Status/result merge | Removes overlapping candidate pages. |
| Review as final step | Aligns UI with actual submission workflow. |
| Role-based grouped sidebar | Provides a clearer navigation foundation before adding more pages. |
| Email verification | Prevents invalid accounts and supports trustworthy email workflows. |
| Forgot password via email token | Required for self-service account recovery. |
| Smoke tests per new feature | Prevents feature additions from becoming untestable. |

### P1 — important feature-completeness improvements

| Feature | Reason |
|---|---|
| Recruiter dashboard decomposition | Recruiter workflow needs focused pages instead of one overloaded dashboard. |
| Analytics API/dashboard | Recruiters and super admins need recruitment visibility. |
| Cancel/reset draft application | Prevents candidate mistakes from becoming permanent too early. |
| Document rejection reason | Makes document verification actionable for candidates. |
| Email notification lifecycle | Reduces manual communication burden. |
| Audit log listing/viewer | Improves accountability and admin oversight. |

### P2 — polish and hardening

| Feature | Reason |
|---|---|
| Email templates/settings UI | Useful after email flows are stable. |
| Token/session hardening | Security improvement that touches auth flow broadly. |
| Advanced analytics/reporting | Valuable after basic analytics is stable. |
| UI route smoke automation | Ideal after route structure stabilizes. |

---

## 10. Suggested Navigation Targets

### 10.1 Candidate

```text
Home
- Dashboard

Application
- Application Overview / Start Application
- Documents
- Application Status

Account
- Profile
```

`Review & Submit` should not be in the permanent sidebar. It should be reached through a call-to-action when all required documents are present.

### 10.2 Recruiter

```text
Overview
- Dashboard

Recruitment
- Applications
- Evaluation
- Candidates
- Document Verification
- Announcements
- Analytics

Configuration
- Rubrics

Account
- Profile
```

### 10.3 Super Admin

```text
Overview
- Dashboard

Recruitment
- Applications
- Evaluation
- Candidates
- Announcements
- Analytics

Administration
- Users
- Periods
- Audit Logs
- Email Templates
- Settings

Configuration
- Rubrics

Account
- Profile
```

---

## 11. Analytics Scope

Analytics is a key new full-stack feature. It should not be implemented as a purely frontend-only chart page because the metrics must be computed consistently by the backend.

### 11.1 Required metrics

The first analytics version should include:

- Applicants per division
- Funnel counts by application status:
  - draft
  - submitted
  - document_review
  - correction_requested
  - verified
  - screening
  - announced_pass
  - announced_fail
  - cancelled
- Document completeness:
  - average completeness percentage
  - missing document counts by document type
  - fully complete applications
- Evaluation progress:
  - screening_eligible_count
  - pending_evaluation_count
  - evaluated_count
  - announced count
- Score distribution:
  - 0-59
  - 60-69
  - 70-79
  - 80-89
  - 90-100
- Top-level active-period summary:
  - active period name
  - current phase
  - threshold_n
  - total applications in scope

### 11.2 Access

- Recruiter: can access analytics relevant to recruitment operations.
- Super Admin: can access all analytics and possibly system-wide views.
- Candidate: should not access recruiter analytics.

### 11.3 Smoke test script

```text
scripts/smoke_test_analytics.py
```

The smoke test should verify:

- Recruiter can access analytics endpoint.
- Super admin can access analytics endpoint.
- Candidate cannot access analytics endpoint.
- Empty dataset returns zero counts, not an error.
- Seeded applications produce correct per-division and funnel counts.
- Score buckets are computed correctly.

---

## 12. Testing Strategy Summary

Every new feature should include tests at the correct level.

### 12.1 Backend/full-stack features

Backend or full-stack features should add a targeted smoke test script under `scripts/`.

Recommended scripts:

| Feature | Script |
|---|---|
| Email verification | `scripts/smoke_test_email_verification.py` |
| Forgot password | `scripts/smoke_test_forgot_password.py` |
| Draft application reset | Deferred; no required script until reset/cancel endpoint behavior is clarified |
| Document verification gate | `scripts/smoke_test_document_review_flow.py` |
| Document rejection reason | `scripts/smoke_test_document_rejection.py` |
| Analytics | `scripts/smoke_test_analytics.py` |
| Audit logs | `scripts/smoke_test_audit_logs.py` |
| Notification service | `scripts/smoke_test_email_notifications.py` |

### 12.2 Frontend-only features

At minimum, frontend-only refactors should pass:

```bash
cd frontend
npm run build
```

Manual route checks should verify:

- Each role sees the correct navigation groups.
- Removed/merged pages redirect correctly.
- Candidate review flow is still reachable through the correct CTA.
- Unauthorized role access still shows the existing protected-route behavior.

### 12.3 Final regression checklist

After each phase, run the relevant new smoke test plus existing smoke tests that touch the same domain.

For example:

- Auth feature: run auth, email verification, forgot password tests.
- Application feature: run applications, documents, phase enforcement tests.
- Evaluation feature: run evaluation, analytics, bulk announce tests.
- Admin feature: run users, audit logs, periods tests.

---

## 13. Documentation Plan

This overview should be followed by three implementation documents:

1. `FRONTEND_IMPLEMENTATION_PLAN.md`
   - Route plan
   - Page-by-page behavior
   - Sidebar restructuring
   - Component extraction
   - Frontend acceptance criteria

2. `BACKEND_IMPLEMENTATION_PLAN.md`
   - API contracts
   - Data model changes
   - Service-layer changes
   - Migration plan
   - Backend smoke test plan

3. `EXECUTION_PLAN.md`
   - Implementation phases
   - Dependencies between phases
   - Feature-by-feature smoke test requirements
   - Done criteria
   - Final regression checklist

---

## 14. Out of Scope for This Planning Batch

The following items are intentionally out of scope for the first planning batch:

- Full automated Playwright test suite.
- Full redesign of the visual system/theme.
- Horizontal scaling architecture.
- Replacing local file storage with object storage.
- Rewriting the AI evaluation pipeline.
- Multi-period re-application support beyond draft reset/cancel behavior.
- Advanced BI/report export features.

These can be considered later after the feature roadmap and core UI/API structure are stable.

---

## 15. Resolved Product Decisions

The first implementation cycle follows the locked decisions in `EXECUTION_PLAN.md`. The items below replace the previous open-decision list in this overview.

| Area | Decision |
|---|---|
| Email verification scope | Required for candidates first. Recruiter and super admin verification can be supported later. |
| Register flow | Registration creates the account and sends verification email, but does not return a normal access token. |
| Verification expiry | Verification link/code expires after 60 minutes. Expired users must request resend. |
| Forgot password session behavior | Successful password reset invalidates older sessions/tokens through a `password_changed_at` strategy. |
| Admin reset password | Existing super-admin reset remains as a manual fallback/support flow. |
| Draft reset/cancel | Use a `cancelled` status instead of hard delete, preserving history and avoiding silent data loss. |
| Document verification | Recruiter verifies submitted documents before NER anonymization and AI evaluation. |
| Rejected documents | Candidate is notified and can upload replacement documents after rejection. |
| NER timing | NER anonymization runs only after required documents are verified/accepted. |
| Analytics scope | Analytics defaults to the active recruitment period. |
| Email templates | Hardcoded in backend service first; database-editable templates are deferred. |
| Notification logging | Workflow notifications for application submission, finalized document rejection, and announcements are logged in `email_notifications`; failures do not roll back the main workflow. |
| Smoke tests | Every backend/full-stack feature must include a targeted smoke test script. |

---

## 16. Recommended First Implementation Sequence

Recommended order follows the phase order in `EXECUTION_PLAN.md` after removing the old documentation-only baseline phase:

1. Refactor candidate frontend information architecture.
2. Split recruiter and super-admin frontend workspaces.
3. Add email service and candidate email verification.
4. Add forgot password and session invalidation.
5. Add auth email frontend pages.
6. Expand application statuses and add the document verification gate.
7. Add document rejection/correction UI.
8. Move NER timing to run after document verification.
9. Add analytics API and analytics dashboard.
10. Add audit log listing and admin audit page.
11. Add email notification lifecycle.
12. Run final cleanup, documentation updates, and full regression tests.

This sequence keeps the UI foundation stable first, then implements account-critical flows, then changes the recruitment workflow, and only after that adds analytics, audit viewing, notifications, and final cleanup.
