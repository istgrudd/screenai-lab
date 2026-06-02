# Frontend Implementation Plan

This document describes the planned frontend restructuring for ScreenAI Lab. It translates the feature roadmap in `OVERVIEW.md` into route changes, page responsibilities, navigation structure, component refactors, role-based UX behavior, and frontend test expectations.

> Status: planning document. The implementation details below describe intended work, not completed work.

> Execution note: frontend phases and route details in this file are implementation guidance. Cross-stack phase order, locked product decisions, and done criteria follow `EXECUTION_PLAN.md`.

---

## 1. Goals

The frontend implementation should improve ScreenAI Lab from an MVP-style interface into a clearer recruitment portal. The goals are:

1. Reduce candidate confusion by removing overlapping pages.
2. Separate account/profile concerns from application/recruitment concerns.
3. Split the overloaded recruiter dashboard into focused pages.
4. Provide role-based navigation that reflects real workflows.
5. Make future backend features easier to expose in the UI.
6. Keep frontend route guards as UX protection while relying on backend authorization as the source of truth.
7. Ensure every frontend change has a build/check strategy.

---

## 2. Current Frontend Problems

### 2.1 Candidate navigation is too fragmented

Current candidate navigation contains:

```text
Dashboard
Profile
Documents
Review
Status
Result
History
```

Problems:

- `Review` is a final submission step, but it appears as a permanent navigation item.
- `Status` and `Result` overlap because both show recruitment progress.
- `History` has limited value while the backend still enforces one application per user.
- `Profile` also contains application/division selection, mixing account and recruitment concerns.

### 2.2 Recruiter workspace is too compressed

The recruiter currently has only a small number of pages, while the dashboard performs many unrelated tasks:

- application table
- filtering
- evaluation trigger
- re-evaluation trigger
- announcement selection
- bulk publish
- phase warning
- stats/cards
- candidate detail navigation

This makes the dashboard hard to reason about and difficult to extend.

### 2.3 Super admin pages are functional but not grouped by workflow

Super admin already has user and period management, but the navigation can be made clearer by grouping:

- recruitment operations
- administration
- configuration
- account/profile

### 2.4 Page responsibility is not always clear

Some current pages behave as both a workflow step and a permanent destination. This should be corrected so each route has one primary responsibility.

---

## 3. Frontend Design Principles

### 3.1 One page, one primary job

Each page should have a clear purpose. If a page is doing multiple unrelated things, split it.

### 3.2 Use dashboard as summary, not workspace overload

Dashboards should show high-level metrics, current phase, alerts, and shortcuts. Operational actions should live in focused pages.

### 3.3 Candidate flow should be linear when applying

Candidate application flow should feel like:

```text
Dashboard -> Start Application -> Documents -> Review & Submit -> Application Status
```

### 3.4 Recruiter flow should be task-based

Recruiter workflow should feel like:

```text
Overview -> Applications -> Evaluation -> Candidates -> Announcements
```

Document verification and analytics should be available as focused supporting workspaces.

### 3.5 Super admin should have oversight and configuration

Super admin should be able to access recruiter workflows, plus user management, periods, audit logs, templates, and settings.

### 3.6 Preserve existing backend constraints

Frontend refactors must not weaken backend rules. For example:

- candidate still cannot edit locked fields after submit
- document replacement remains locked after submit unless backend changes it
- recruiter/super admin route access must still be protected
- backend remains authoritative for phases and permissions

---

## 4. Target Navigation Structure

### 4.1 Candidate navigation

```text
Home
- Dashboard

Application
- Application Overview
- Documents
- Application Status

Account
- Profile
```

Notes:

- `Review & Submit` is not a sidebar item. It is reached from `Documents` or `Application Overview` when required documents are complete.
- `Result` is merged into `Application Status`.
- `History` should be hidden or de-emphasized until multi-period applications are supported.

### 4.2 Recruiter navigation

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

### 4.3 Super admin navigation

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

## 5. Route Plan

### 5.1 Candidate routes

| Route | Page | Status | Purpose |
|---|---|---|---|
| `/dashboard` | CandidateDashboardPage | Keep/refine | Candidate home, current phase, next action, progress summary. |
| `/profile` | CandidateProfilePage | Refactor | Read-only account/profile summary. |
| `/profile/edit` | CandidateEditProfilePage | New | Edit profile, password, WhatsApp, and editable academic fields. |
| `/application` | CandidateApplicationOverviewPage | New/refactor | Application overview and start/resume CTA. |
| `/application/start` | CandidateStartApplicationPage | New | Division selection and application creation. |
| `/documents` | CandidateDocumentsPage | Keep/refine | Upload/manage required documents while draft; support read-only and correction states after submit. |
| `/application/review` | CandidateReviewSubmitPage | Move/rename | Final review and submit step. |
| `/application/status` | CandidateApplicationStatusPage | New/merge | Combined submitted/status/result page. |
| `/result` | Redirect | Deprecated | Redirect to `/application/status`. |
| `/submitted` | Redirect | Deprecated | Redirect to `/application/status`. |
| `/review` | Redirect or compatibility wrapper | Deprecated | Redirect to `/application/review` when draft; otherwise `/application/status`. |
| `/my-applications` | MyApplicationsPage | Hide from main nav | Keep off-nav until multi-period support becomes real. |

### 5.2 Recruiter routes

| Route | Page | Status | Purpose |
|---|---|---|---|
| `/` or `/recruiter/dashboard` | RecruiterOverviewPage | Refactor | High-level overview, phase, alerts, shortcuts. |
| `/recruiter/applications` | RecruiterApplicationsPage | New | Submitted/non-draft applications table, filters, document completeness. |
| `/recruiter/evaluation` | RecruiterEvaluationPage | New | Run evaluation, re-evaluate, see errors/warnings. |
| `/recruiter/candidates` | RecruiterCandidatesPage | New | Ranked/scored candidate list. |
| `/candidates/:id` | CandidateDetailPage | Keep | Candidate detail, score evidence, override, documents, SWOT. |
| `/recruiter/documents` | RecruiterDocumentVerificationPage | New | Review and verify/reject documents. |
| `/recruiter/announcements` | RecruiterAnnouncementsPage | New | Select pass/fail candidates and publish results. |
| `/recruiter/analytics` | RecruiterAnalyticsPage | New | Recruitment analytics charts/cards. |
| `/rubrics` | RubricConfigPage | Keep | Rubric configuration. |
| `/recruiter/profile` | RecruiterProfilePage | Keep/refactor | Recruiter profile summary/edit pattern. |
| `/recruiter/profile/edit` | RecruiterEditProfilePage | New | Dedicated edit profile route. |

### 5.3 Super admin routes

| Route | Page | Status | Purpose |
|---|---|---|---|
| `/admin/dashboard` | AdminOverviewPage | New/refactor | System and recruitment overview. |
| `/admin/users` | AdminPage | Keep/refine | User management, verification status, reset password. |
| `/admin/periods` | RecruitmentPeriodPage | Keep/refine | Recruitment period management. |
| `/admin/audit-logs` | AuditLogPage | New | Browse audit logs. |
| `/admin/email-templates` | EmailTemplatesPage | Implemented | Read-only Admin Emails monitoring for workflow notification logs; editable templates are deferred. |
| `/admin/settings` | AdminSettingsPage | Placeholder | Global operational settings placeholder until backend settings exist. |
| `/admin/profile` | AdminProfilePage | Keep/refactor | Admin profile summary. |
| `/admin/profile/edit` | AdminEditProfilePage | New | Dedicated edit profile route. |

---

## 6. Candidate Page Specifications

### 6.1 Candidate Dashboard

**Route:** `/dashboard`

**Role:** Candidate

**Purpose:** Candidate landing page and next-action hub.

**Should show:**

- active recruitment period and phase
- application status summary
- next recommended action
- document completeness summary
- deadline/status warning
- CTA to start/resume application

**Should not show:**

- full profile edit form
- result detail if announcement is already published; it may show a CTA to `Application Status`

**Primary CTAs:**

| State | CTA |
|---|---|
| no application | Start Application |
| draft + missing docs | Continue Documents |
| draft + complete docs | Review & Submit |
| submitted/screening | View Application Status |
| announced | View Result |

### 6.2 Candidate Profile Summary

**Route:** `/profile`

**Role:** Candidate

**Purpose:** Read-only profile/account summary.

**Should show:**

- full name
- email
- email verification badge once supported
- WhatsApp
- NIM
- faculty
- major
- year
- account status
- edit profile button

**Should not show:**

- division selection
- start application button as the primary content
- password fields

### 6.3 Candidate Edit Profile

**Route:** `/profile/edit`

**Role:** Candidate

**Purpose:** Edit account/profile data.

**Editable fields:**

- full name
- email
- WhatsApp
- password
- NIM/faculty/major/year only when not locked by backend rules

**Behavior:**

- Locked fields should be disabled with a clear explanation.
- Submit should call existing `PUT /api/users/me` unless backend changes are introduced.
- After save, redirect back to `/profile` or show success state.
- If email verification is implemented, changing email should follow the backend verification flow.

### 6.4 Candidate Application Overview

**Route:** `/application`

**Role:** Candidate

**Purpose:** Recruitment/application hub.

**Should show:**

- chosen division if application exists
- current application status
- document completeness
- submitted date if available
- reference ID if submitted
- next action button

**Primary CTAs:**

- Start Application
- Continue Documents
- Review & Submit
- View Status

### 6.5 Candidate Start Application

**Route:** `/application/start`

**Role:** Candidate

**Purpose:** Select division and create a draft application.

**Behavior:**

- If no application exists, allow division selection.
- If draft application exists, show current division and continue options.
- If submitted or later, block changes and link to status.
- Future draft reset/cancel feature should be surfaced here.

### 6.6 Candidate Documents

**Route:** `/documents`

**Role:** Candidate

**Purpose:** Upload and manage required documents.

**Should show:**

- six required document slots
- accepted file types and size limits
- current upload status
- document verification status once rejection/verification is extended
- CTA to review when complete

**Behavior:**

- If no application exists, redirect or CTA to `/application/start`.
- If application is `draft`, allow upload/replacement for required documents.
- If application is `submitted`, `document_review`, `verified`, `screening`, or announced, show the document list in read-only mode and link back to `/application/status` for progress/result context.
- If application is `correction_requested`, allow replacement only for rejected document types; verified or still-pending documents remain read-only unless backend policy changes.

### 6.7 Candidate Review & Submit

**Route:** `/application/review`

**Role:** Candidate

**Purpose:** Final pre-submit step.

**Should show:**

- profile summary
- chosen division
- uploaded document summary
- missing document warnings
- consent/acknowledgement checkboxes
- final submit button

**Behavior:**

- If app is already submitted, redirect to `/application/status`.
- If required documents are missing, disable submit and link back to `/documents`.
- If backend privacy/AI consent is added, include the required consent checkbox here.

### 6.8 Candidate Application Status

**Route:** `/application/status`

**Role:** Candidate

**Purpose:** Single source of truth for candidate application progress and result.

**Replaces:**

- `/submitted`
- `/result`

**Should show:**

- application status
- recruitment journey/progress
- submitted date
- reference ID
- division
- announcement result when published
- announcement notes if any
- document rejection reason if implemented
- next steps

**State handling:**

The page should support both the current backend statuses and the planned expanded statuses from `EXECUTION_PLAN.md`. New statuses introduced by the document-review workflow should be treated as first-class states, not folded into generic submitted/screening copy.

| State | UI | Primary CTA |
|---|---|---|
| no application | Show empty state and explain that the candidate has not started an application. | Start Application |
| `draft` | Show draft progress, selected division if available, and document completeness. | Continue Documents or Review & Submit |
| `submitted` | Show submitted confirmation and explain that the application is waiting for recruiter document review. | View Documents |
| `document_review` | Show that uploaded documents are being checked by recruiter/admin. Candidate should not assume AI screening has started yet. | View Documents |
| `correction_requested` | Highlight rejected document(s), show rejection reason(s), and explain what must be re-uploaded. | Fix Documents |
| `verified` | Show that documents have been accepted and the application is ready for anonymization/evaluation. | Track Status |
| `screening` | Show under-review state and explain that AI/manual screening is in progress. | Track Status |
| `announced_pass` | Show pass result, announcement notes if any, and next-step instructions. | View Next Steps |
| `announced_fail` | Show fail result, announcement notes if any, and closure message. | View Notes |
| `cancelled` | Show that the draft/application was cancelled and prevent normal progress CTAs. | Start New Application if allowed |

Document-review statuses should also affect the progress/journey component:

```text
Draft -> Submitted -> Document Review -> Verified -> Screening -> Announcement
                         |
                         v
                  Correction Requested
```

Implementation notes:

- `correction_requested` should prioritize document rejection reasons over generic status copy.
- `verified` is not the same as `screening`; it means documents are accepted, but evaluation may not have started.
- `cancelled` should be terminal for the current application record unless the backend explicitly allows reopening.
- While the backend still returns the old status set, the UI may hide unavailable future states but the component structure should already account for them.

---

## 7. Recruiter Page Specifications

### 7.1 Recruiter Overview Dashboard

**Route:** `/` or `/recruiter/dashboard`

**Role:** Recruiter, Super Admin

**Purpose:** High-level operational overview.

**Should show:**

- active period and phase
- submitted/evaluated/announced counts
- pending evaluation count
- document verification pending count once available
- quick links to focused workspaces
- warnings if evaluation or announcement is outside expected phase

**Should not contain:**

- full application table
- bulk announcement checkbox workflow
- full evaluation controls beyond shortcuts

### 7.2 Recruiter Applications

**Route:** `/recruiter/applications`

**Role:** Recruiter, Super Admin

**Purpose:** Main application table.

**Should show:**

- candidate identity summary
- division
- application status
- submitted date
- document completeness
- evaluation summary
- filters by division/status/search
- link to candidate detail

**Actions:**

- open candidate detail
- open documents
- send to evaluation page with selected division/context

### 7.3 Recruiter Evaluation

**Route:** `/recruiter/evaluation`

**Role:** Recruiter, Super Admin

**Purpose:** Run and monitor AI evaluation.

**Should show:**

- division selector
- verified / screening-eligible applications per division
- run evaluation button
- re-evaluate button if candidates are already scored
- warning if outside evaluation phase
- result summary after evaluation
- per-application errors

**Eligibility wording:**

- In the current backend, this may still map to submitted applications.
- After the document verification gate is implemented, the evaluation queue should use `verified` applications or any backend-defined screening-eligible state.
- Avoid labeling every submitted application as evaluation-ready because submitted documents may still be pending review or correction.

**Actions:**

- run evaluation
- force re-evaluate
- open candidate detail after scoring

### 7.4 Recruiter Candidates

**Route:** `/recruiter/candidates`

**Role:** Recruiter, Super Admin

**Purpose:** Ranked/scored candidate review list.

**Should show:**

- candidate rank
- anonymous ID if available
- revealed identity if allowed by current product rules
- division
- composite score
- recommendation marker based on `threshold_n`
- status
- filter/sort/search

**Actions:**

- open candidate detail
- navigate to announcements selection

### 7.5 Recruiter Document Verification

**Route:** `/recruiter/documents`

**Role:** Recruiter, Super Admin

**Purpose:** Review uploaded documents and verify/reject them.

**Should show:**

- filter by division/status/document type/verification status
- document preview/download
- current verification status
- verify action
- reject action once rejection reason backend exists

**Future fields:**

- rejection reason
- rejected_at
- verified_by/rejected_by
- candidate-facing fix instructions

### 7.6 Recruiter Announcements

**Route:** `/recruiter/announcements`

**Role:** Recruiter, Super Admin

**Purpose:** Publish pass/fail announcements.

**Should show:**

- evaluated candidate list by division
- threshold_n indicator
- selected pass candidates
- computed fail candidates
- preview modal before publish
- phase gate warning
- super admin bypass notice when relevant

**Actions:**

- select/unselect pass candidates
- bulk publish
- open candidate detail

### 7.7 Recruiter Analytics

**Route:** `/recruiter/analytics`

**Role:** Recruiter, Super Admin

**Purpose:** Visualize recruitment metrics.

**Should show:**

- applicants per division
- funnel chart/counts
- document completeness
- score distribution
- evaluation progress
- active period summary

**Data source:**

- planned analytics endpoint from backend implementation plan

---

## 8. Super Admin Page Specifications

### 8.1 Admin Overview

**Route:** `/admin/dashboard`

**Role:** Super Admin

**Purpose:** System/recruitment overview.

**Should show:**

- active period
- total users by role
- total applications
- evaluation status
- latest admin/recruiter actions once audit API exists
- system warnings

### 8.2 Admin Users

**Route:** `/admin/users`

**Role:** Super Admin

**Purpose:** User management.

**Enhancements:**

- show email verification status once available
- keep role change
- keep deactivate/reactivate
- keep admin reset password as manual fallback
- add clearer distinction between manual reset and self-service forgot password

### 8.3 Admin Periods

**Route:** `/admin/periods`

**Role:** Super Admin

**Purpose:** Recruitment period management.

**Enhancements:**

- better phase preview
- warning before changing dates that instantly change phase
- show application counts per period if endpoint exists

### 8.4 Admin Audit Logs

**Route:** `/admin/audit-logs`

**Role:** Super Admin

**Purpose:** Browse system actions.

**Should show:**

- action type
- actor/recruiter
- affected user/candidate
- old value
- new value
- reason
- timestamp
- filters by action type/date/actor

### 8.5 Admin Emails Monitoring

**Route:** `/admin/email-templates`

**Role:** Super Admin

**Purpose:** Monitor workflow notification delivery logs and provider status.

**Current version is read-only.** It lists `application_submitted`, `document_rejected`, and `announcement_published` logs with filters and pagination. Editable templates, resend workflow, and manual compose are deferred.

### 8.6 Admin Settings

**Route:** `/admin/settings`

**Role:** Super Admin

**Purpose:** Global settings and operational configuration.

**Possible settings:**

- email sender identity
- email notification toggles
- analytics scope defaults
- LLM concurrency display if made configurable

---

## 9. Sidebar and Layout Refactor

### 9.1 Current issue

Sidebar currently returns a flat list of links per role. This becomes difficult to scale as more pages are added.

### 9.2 Target structure

Use grouped navigation data:

```js
const NAV_GROUPS = {
  candidate: [
    {
      label: "Home",
      items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
    },
    {
      label: "Application",
      items: [
        { to: "/application", label: "Overview", icon: ClipboardList },
        { to: "/documents", label: "Documents", icon: FileText },
        { to: "/application/status", label: "Status", icon: CheckCircle2 },
      ],
    },
    {
      label: "Account",
      items: [{ to: "/profile", label: "Profile", icon: GraduationCap }],
    },
  ],
}
```

### 9.3 Sidebar behavior

- Render group labels in small uppercase text.
- Keep active route highlighting.
- Keep role badge and logout button.
- Hide routes that are workflow steps only, such as `/application/review`.
- For super admin, include recruiter workflow routes plus admin-specific routes.

---

## 10. Component Refactor Plan

### 10.1 Shared components to extract

| Component | Purpose |
|---|---|
| `PageHeader` | Standard title, subtitle, icon, right-side actions. |
| `EmptyState` | Reusable empty state with icon, message, CTA. |
| `StatusBadge` | Shared status rendering for application/candidate statuses. |
| `DivisionBadge` | Shared division label rendering. |
| `ApplicationSummaryCard` | Candidate/recruiter summary of application status. |
| `DocumentCompletenessCard` | Document progress summary. |
| `PhaseWarningBanner` | Shared phase warning display. |
| `RoleNavSidebar` | Grouped sidebar renderer. |
| `ConfirmActionDialog` | Reusable confirm modal. |
| `MetricCard` | Analytics/dashboard metric card. |
| `FunnelChart` | Analytics funnel display. |
| `ScoreDistributionChart` | Analytics score buckets. |

### 10.2 Candidate-specific reusable components

| Component | Purpose |
|---|---|
| `CandidateProfileSummary` | Read-only candidate profile fields. |
| `CandidateProfileForm` | Edit form extracted from existing profile page. |
| `DivisionSelectionPanel` | Division selection UI. |
| `ApplicationNextActionCard` | CTA logic based on application state. |
| `ReviewSubmitChecklist` | Final submit acknowledgement checklist. |

### 10.3 Recruiter-specific reusable components

| Component | Purpose |
|---|---|
| `ApplicationsTable` | Shared application table for application/evaluation/announcement pages. |
| `EvaluationControlPanel` | Run/re-evaluate controls. |
| `AnnouncementSelectionTable` | Pass/fail selection table. |
| `DocumentVerificationTable` | Document verification workspace. |
| `CandidateRankingTable` | Ranked candidate list. |

---

## 11. Redirect and Compatibility Strategy

Existing routes should not break immediately. Use redirects during the refactor.

| Old Route | New Route | Behavior |
|---|---|---|
| `/review` | `/application/review` | Redirect if draft; otherwise status. |
| `/submitted` | `/application/status` | Redirect. |
| `/result` | `/application/status` | Redirect. |
| `/my-applications` | keep off-nav | Keep accessible but remove from primary nav. |
| `/` for recruiter/admin | keep or redirect | May continue rendering recruiter overview for compatibility. |

This keeps old links working while the new navigation becomes canonical.

---

## 12. Frontend API Usage Notes

Frontend-only phases should avoid changing API contracts unless necessary.

Existing APIs that can support early frontend refactor:

| Existing API helper | Usage |
|---|---|
| `getMyProfile()` | Candidate/recruiter/admin profile data. |
| `updateMyProfile()` | Edit profile form. |
| `getMyApplication()` | Application overview/status. |
| `listApplicationDocuments()` | Document completeness. |
| `submitApplication()` | Final submit. |
| `listRecruiterApplications()` | Applications table and recruiter workspaces. |
| `evaluateBatch()` | Evaluation page. |
| `bulkAnnounce()` | Announcements page. |
| `getActivePeriod()` | Phase cards, warnings, analytics context. |
| `getMyAnnouncement()` | Candidate status/result. |

Planned backend APIs that later frontend phases will consume:

| Planned API | Frontend page |
|---|---|
| Analytics endpoint | `/recruiter/analytics`, `/admin/dashboard` |
| Audit log listing endpoint | `/admin/audit-logs` |
| Email verification endpoints | login/register/verification pages |
| Forgot password endpoints | forgot/reset password pages |
| Document rejection endpoint | recruiter document verification + candidate document/status pages |
| Draft reset endpoint | candidate application start/overview page |

---

## 13. Frontend Implementation Sequence

The sequence below is a frontend-focused breakdown. The cross-stack implementation order remains governed by `EXECUTION_PLAN.md`; when a frontend phase depends on a backend endpoint, implement and smoke-test the backend contract first.

### Phase F1 — Candidate information architecture cleanup

Scope:

- split profile summary and edit profile
- move division selection to application start page
- create application overview page
- merge submitted/result into application status page
- move review to `/application/review`
- update candidate sidebar
- add redirects from old routes

Expected checks:

```bash
cd frontend
npm run build
```

Manual route checks:

- candidate can open dashboard
- candidate can open profile summary
- candidate can edit profile
- candidate can start application
- candidate can upload documents
- candidate can review and submit
- candidate can view application status/result
- old `/submitted`, `/result`, `/review` routes still behave safely

### Phase F2 — Recruiter and super-admin workspace split

Scope:

- create recruiter overview page
- create applications page
- create evaluation page
- create announcements page
- create candidates page
- move dashboard table/action logic into focused components
- update recruiter sidebar
- group admin navigation
- keep existing users/periods pages
- add placeholder pages for audit logs/settings/templates if backend is not ready yet
- add profile/edit pattern for admin

Expected checks:

```bash
cd frontend
npm run build
```

Manual route checks:

- recruiter can open dashboard overview
- recruiter can filter applications
- recruiter can run evaluation using verified/screening-eligible wording
- recruiter can re-evaluate when applicable
- recruiter can select candidates for announcement
- recruiter can open candidate detail
- super admin sees admin navigation group
- recruiter does not see admin-only pages
- candidate cannot access admin/recruiter pages

### Phase F3 — Auth email UI

Scope:

- update register success copy for email verification
- add verify email result page
- add resend verification UI
- add forgot password page
- add reset password page
- update login handling for unverified email error

Expected checks:

```bash
cd frontend
npm run build
python -m scripts.smoke_test_email_verification
python -m scripts.smoke_test_forgot_password
```

Manual route checks:

- user sees verification notice after register
- unverified user cannot login if backend enforces it
- verification link page shows success/error states
- forgot password page handles submitted email safely
- reset password page handles token success/expired/invalid states

### Phase F4 — Document rejection/correction UI

Scope:

- add rejection reason UI on recruiter document verification page
- show rejection reason on candidate documents/status page
- add document status badges
- allow replacement CTA only for rejected document types in `correction_requested`
- add notification copy if backend email notification is ready

Expected checks:

```bash
cd frontend
npm run build
python -m scripts.smoke_test_document_rejection
```

Manual route checks:

- recruiter can reject document with reason
- candidate can see rejection reason
- candidate can replace rejected document types when the application is `correction_requested`
- candidate cannot replace verified documents unless backend policy changes

### Phase F5 — Analytics UI

Scope:

- add analytics route/page
- add metric cards and charts
- consume backend analytics endpoint once available
- show empty states and loading/error states

Expected checks:

```bash
cd frontend
npm run build
python -m scripts.smoke_test_analytics
```

Manual route checks:

- recruiter and super admin can view analytics
- candidate cannot view analytics
- empty analytics state is readable
- charts render from seeded test data

### Phase F6 — Audit/settings UI

Scope:

- add admin audit log viewer
- add Admin Emails monitoring UI for workflow notification logs
- keep settings as a placeholder if backend settings are not implemented
- add filters and empty states

Expected checks:

```bash
cd frontend
npm run build
python -m scripts.smoke_test_audit_logs
```

Manual route checks:

- super admin can access audit logs
- recruiter/candidate cannot access audit logs
- filters do not break empty results

---

## 14. Frontend Acceptance Criteria

### 14.1 Candidate acceptance criteria

- Candidate navigation no longer shows overlapping `Review`, `Status`, and `Result` pages.
- Candidate can still complete the full application flow.
- Candidate can still upload all required documents.
- Candidate can still submit only after required conditions are met.
- Candidate has one clear application status/result page.
- Candidate profile editing is separate from application start/division selection.

### 14.2 Recruiter acceptance criteria

- Recruiter dashboard becomes an overview, not an all-in-one workspace.
- Recruiter can access applications, evaluation, candidates, announcements, analytics, and rubrics through clear navigation.
- Existing evaluation and announcement actions remain available after the split.
- Candidate detail remains accessible.

### 14.3 Super admin acceptance criteria

- Super admin can access recruiter workflows plus admin-specific pages.
- User and period management remain accessible.
- Admin-only routes remain hidden from recruiter and candidate navigation.
- Placeholder pages should clearly indicate when backend support is pending.

### 14.4 Technical acceptance criteria

- `npm run build` passes after each frontend phase.
- Old routes either redirect safely or remain compatible.
- Role-based protected routes still work.
- No feature relies only on frontend protection for security.
- Components extracted from the old dashboard/profile pages remain readable and testable.

---

## 15. Manual Frontend Smoke Checklist

Run this checklist after each frontend refactor phase.

### Candidate

- Login as candidate.
- Open dashboard.
- Open profile summary.
- Edit profile successfully.
- Start/resume application.
- Upload/replace documents while draft.
- Open review step when documents are complete.
- Submit application.
- Open application status.
- Confirm old `/result`, `/submitted`, and `/review` routes do not break.

### Recruiter

- Login as recruiter.
- Open dashboard overview.
- Open applications page.
- Filter by division/status.
- Open candidate detail.
- Open evaluation page.
- Run or simulate evaluation flow.
- Open announcements page.
- Confirm admin-only pages are not visible.

### Super Admin

- Login as super admin.
- Open dashboard/admin overview.
- Open users page.
- Open periods page.
- Open recruiter workflow pages.
- Confirm audit logs, Admin Emails monitoring, and settings placeholder are accessible to super admins only.
- Confirm route protection works for admin-only pages.

---

## 16. Resolved and Deferred Frontend Decisions

The decisions below replace the previous open-decision list. The goal is to keep Phase 1 and Phase 2 implementable without re-litigating route structure during execution.

### 16.1 Resolved for the first implementation cycle

| Area | Decision |
|---|---|
| Canonical dashboards | Use `/recruiter/dashboard` and `/admin/dashboard` as canonical dashboard routes. `/` may remain as a compatibility route that redirects based on authenticated role. |
| Candidate application overview | Keep `CandidateApplicationOverviewPage` as a separate `/application` route. The dashboard remains a summary/next-action hub, not the full application workspace. |
| `My Applications` visibility | Keep `/my-applications` accessible for compatibility, but remove it from the main candidate sidebar until true multi-period application support exists. |
| Profile routes | Candidate uses `/profile` and `/profile/edit`. Recruiter and super admin use role-prefixed routes (`/recruiter/profile`, `/admin/profile`, and edit variants) while sharing reusable profile components internally. |
| Admin monitoring/settings pages | Audit logs and Admin Emails monitoring are implemented as read-only pages. Settings remains a documented placeholder until backend settings support exists. |
| Candidate documents after submit | Keep `/documents` available after submit as a read-only document list. In `correction_requested`, allow replacement only for rejected document types. Application status should link to documents when review/correction is needed. |
| Analytics route | Use `/recruiter/analytics` as the shared analytics workspace for recruiter and super admin in the first version. Admin dashboard may show analytics summaries, but a separate `/admin/analytics` route is deferred. |

### 16.2 Deferred frontend decisions

| Area | Deferred decision |
|---|---|
| Dedicated admin analytics route | Revisit `/admin/analytics` only after the shared analytics workspace and admin dashboard summary are implemented. |
| Email template editing UI | Keep templates hardcoded/read-only first. Add editable template UI only if the backend exposes database-backed templates. |
| Email resend workflow | Do not add resend actions to Admin Emails monitoring until notification retry semantics are designed. |
| Long-term document UX | After correction flow is used in practice, decide whether read-only documents should remain a separate route or be folded more tightly into application status. |

---

## 17. Recommended First Frontend PR/Batch

Recommended first frontend implementation batch:

1. Introduce grouped sidebar data structure.
2. Add candidate `/profile` summary page.
3. Move existing candidate profile form to `/profile/edit`.
4. Move division selection to `/application/start`.
5. Add `/application/status` and redirect `/submitted` + `/result` to it.
6. Move `/review` behavior to `/application/review`.
7. Remove `Review` and `Result` from candidate sidebar.
8. Run `npm run build`.
9. Update docs if any route names are adjusted during implementation.

This batch improves candidate UX without requiring major backend changes.
