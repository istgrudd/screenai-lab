# Frontend Redesign Phase 0 Audit

## Summary

Phase 0 audit completed as preparation for the ScreenAI Lab frontend redesign. No visual redesign, route guard change, API behavior change, dependency install, or business logic refactor was performed.

The current frontend is a React/Vite single page app using React Router, Tailwind CSS v4, shadcn/ui components, lucide-react icons, Recharts, Sonner toasts, and a simple authenticated shell built directly in `App.jsx`. The app already has role-based route grouping for candidate, recruiter, and super admin, but the design foundation still uses Geist and default shadcn grayscale/OKLCH tokens. The next redesign work should start foundation-first: brand tokens and fonts, then shared layout, then shared UI primitives, then role-specific pages.

Important preservation points for later phases are auth token storage and redirects, `ProtectedRoute`, `CandidateProfileGuard`, candidate required-profile checks, submission phase gating, document upload/review/finalization, recruiter evaluation and announcement flows, and super admin user/period management.

## Files Reviewed

| File | Relevance |
| --- | --- |
| `docs/DESIGN.md` | Source of truth for MBC Research Command Curator direction, brand colors, Montserrat/Poppins typography, AppShell/BrandSidebar/GlassTopbar/PageHeader, shared components, and role redesign guidance. |
| `docs/EXECUTION_PLAN_REDESIGN.md` | Phase scope, engineering constraints, smoke test expectations, and Phase 1-8 order. |
| `frontend/package.json` | Confirms React/Vite/Tailwind/shadcn/lucide/Recharts stack and current Geist dependency. |
| `frontend/src/index.css` | Current Tailwind v4/shadcn theme variables and Geist font setup. |
| `frontend/src/App.jsx` | Main router, protected shell, role routes, candidate profile guard, legacy redirects. |
| `frontend/src/components/navigation/RoleNavSidebar.jsx` | Current fixed sidebar, role nav groups, active state rules, logout/user footer. |
| `frontend/src/components/ProtectedRoute.jsx` | Auth and role protection behavior. |
| `frontend/src/lib/auth.js` | Token storage, JWT decode, logout, role constants, default role redirects. |
| `frontend/src/lib/api.js` | Fetch wrapper, auth header behavior, relogin behavior, all frontend API functions. |
| `frontend/src/lib/candidateApplication.js` | Candidate statuses, required documents/profile fields, phase gating helpers, next target logic. |
| `frontend/src/lib/recruiterWorkspace.js` | Recruiter divisions/status filters, evaluated status set, summary/ranking helpers. |
| `frontend/src/lib/phase.js` | Recruitment phase constants, labels, and badge classes. |
| `frontend/src/components/RecruitmentPhaseCard.jsx` | Shared active-period timeline and phase/status hints. |
| `frontend/src/components/RecruitmentJourney.jsx` | Candidate journey step tracker and status/phase mapping. |
| `frontend/src/components/recruiter/WorkspaceCards.jsx` | Current metric and shortcut card primitives. |
| `frontend/src/components/recruiter/ApplicationsTable.jsx` | Shared recruiter table, status/score/division badges, row navigation, selection behavior. |
| `frontend/src/components/recruiter/ApplicationFilters.jsx` | Shared recruiter/admin division/status filters. |
| `frontend/src/components/DocumentUploadStep.jsx` | Candidate document upload, client-side MIME/size validation, drag/drop, locked state. |
| `frontend/src/components/candidate/CandidateProfileForm.jsx` | Candidate profile update validation, locked academic fields, WhatsApp validation. |
| `frontend/src/components/candidate/DivisionSelection.jsx` | Candidate division options and selection UI. |
| `frontend/src/components/DocumentPreviewDialog.jsx` | Authenticated blob fetch and preview/download behavior. |
| `frontend/src/components/StaffProfileForm.jsx` | Recruiter/admin profile update behavior. |
| `frontend/src/components/StaffProfileSummary.jsx` | Recruiter/admin profile summary behavior. |
| `frontend/src/components/SwotHighlightPanel.jsx` | Recruiter SWOT text extraction panel. |
| `frontend/src/components/admin/AdminPlaceholderPage.jsx` | Current admin placeholder pattern for Settings. |
| Candidate pages | `DashboardPage`, `ApplicationOverviewPage`, `StartApplicationPage`, `DocumentsPage`, `ReviewPage`, `ApplicationStatusPage`, `ProfilePage`, `EditProfilePage`. |
| Recruiter pages | `OverviewPage`, `ApplicationsPage`, `DocumentVerificationPage`, `EvaluationPage`, `CandidatesPage`, `AnnouncementsPage`, `AnalyticsPage`, `ProfilePage`, `EditProfilePage`. |
| Super Admin pages | `OverviewPage`, `AdminPage`, `RecruitmentPeriodPage`, `AuditLogsPage`, `EmailTemplatesPage`, `SettingsPage`, `ProfilePage`, `EditProfilePage`. |
| Auth/Public pages | `LoginPage`, `RegisterPage`, `ForgotPasswordPage`, `ResetPasswordPage`, `VerifyEmailPage`. |
| Related routed pages | `CandidateDetailPage` was reviewed because recruiter tables navigate there and it contains score override, document preview, supporting document verification, and identity reveal logic. |

## Current Frontend Architecture

The frontend is a Vite SPA using React 19 and React Router v7. Route definitions live centrally in `frontend/src/App.jsx`; there are no route modules or nested router config files. Public auth pages are mounted directly, while protected pages are wrapped with `ProtectedShell`.

The main protected layout is `AuthenticatedShell` inside `App.jsx`:

- `div.flex.min-h-screen.bg-background`
- fixed `RoleNavSidebar`
- `main.flex-1.ml-64`
- padded max-width content container

Page grouping is folder-based:

- `frontend/src/pages/candidate/*` for candidate flow.
- `frontend/src/pages/recruiter/*` for recruiter workspace.
- `frontend/src/pages/admin/*` for super admin.
- root `frontend/src/pages/*` for auth pages, candidate detail, legacy CV upload/rubric pages, and compatibility routes.

Component grouping is partly shared and partly role-specific:

- `components/ui/*` for shadcn primitives.
- `components/navigation/RoleNavSidebar.jsx` for role-aware navigation.
- `components/recruiter/*` for filters/table/cards reused by recruiter and super admin shared recruitment pages.
- `components/candidate/*` for candidate profile/division components.
- standalone shared workflow components such as `RecruitmentPhaseCard`, `RecruitmentJourney`, `DocumentUploadStep`, `DocumentPreviewDialog`, `StaffProfileForm`, and `StaffProfileSummary`.

The current app has no AppShell, BrandSidebar, GlassTopbar, PageHeader, common StatusBadge, common PhaseBadge, common EmptyState, common LoadingState, or common StepTrack directory yet.

## Current Design System State

Current setup:

- Tailwind CSS v4 with `@tailwindcss/vite`.
- shadcn v4 components imported through `shadcn/tailwind.css`.
- Geist loaded from `@fontsource-variable/geist`.
- `@theme inline` maps `--font-heading` to `var(--font-sans)` and `--font-sans` to Geist.
- CSS variables use mostly default shadcn grayscale OKLCH tokens.
- Dark mode token block exists.
- UI uses shadcn cards, buttons, badges, inputs, selects, tables, dialogs, alert dialogs, progress, tooltips, tabs, and Sonner.

Current visual patterns:

- Card-heavy layouts with `Card`, `CardHeader`, `CardContent`.
- Borders are used heavily for cards, tables, lists, filters, and alerts.
- Buttons use default shadcn variants, mostly flat `primary`/`outline`/`ghost`.
- Status colors are scattered across pages/components with `green`, `yellow`, `red`, `emerald`, `sky`, `amber`, etc.
- No centralized semantic MBC token layer yet.
- No Montserrat/Poppins imports yet.
- No MBC logo assets or logo component yet.
- Sidebar brand mark is `BarChart3`, not MBC Lab logo.

Gap against `docs/DESIGN.md`:

- Brand palette is not implemented (`#0065B0`, `#1E3F75`, `#E12A26`, etc.).
- Typography does not follow Montserrat for headings and Poppins for body.
- AppShell/BrandSidebar/GlassTopbar/PageHeader do not exist.
- StatusBadge, PhaseBadge, EmptyState, LoadingState, MetricCard, StepTrack, ConfirmActionDialog are not centralized.
- Candidate-facing copy is mixed English/Bahasa Indonesia.
- Empty/loading states are inconsistent and often generic.
- Tables do not yet have mobile card fallback.
- Current UI reads closer to default shadcn dashboard than MBC Research Command Curator.

## Routing and Role Protection

Public/auth routes:

- `/login`
- `/register`
- `/verify-email`
- `/forgot-password`
- `/reset-password`

Root route:

- `/` renders `AuthenticatedShell` then `RootRedirect`.
- Unauthenticated users redirect to `/login`.
- Authenticated users redirect by `defaultPathForRole`:
  - candidate -> `/dashboard`
  - recruiter -> `/recruiter/dashboard`
  - super_admin -> `/admin/dashboard`

Candidate protected routes:

- `/dashboard`
- `/profile`
- `/profile/edit`
- `/application`
- `/application/start`
- `/documents`
- `/application/review`
- `/application/status`
- `/review` legacy resolver, sends draft users to review and non-draft users to status.
- `/submitted` -> `/application/status`
- `/result` -> `/application/status`
- `/my-applications`
- `/upload`

Candidate pages except `/profile/edit` are wrapped in `CandidateShell`, which applies:

- `ProtectedShell` with candidate-only role.
- `CandidateProfileGuard`, which calls `getMyProfile()` and redirects to `/profile/edit` when required profile fields are missing.
- `/profile/edit` intentionally bypasses `CandidateProfileGuard` so incomplete candidates can complete profile fields.

Recruiter-plus protected routes:

- `/recruiter/dashboard`
- `/recruiter/applications`
- `/recruiter/evaluation`
- `/recruiter/candidates`
- `/recruiter/documents`
- `/recruiter/announcements`
- `/recruiter/analytics`
- `/rubrics`
- `/candidates/:id`
- `/recruiter/profile`
- `/recruiter/profile/edit`

These allow `[recruiter, super_admin]`, so super admin can access shared recruiter workspaces.

Super-admin-only protected routes:

- `/admin/dashboard`
- `/admin/users`
- `/admin/periods`
- `/admin/audit-logs`
- `/admin/email-templates`
- `/admin/settings`
- `/admin/profile`
- `/admin/profile/edit`

Fallback:

- `*` redirects to `/`.

`ProtectedRoute` behavior:

- Unauthenticated -> `<Navigate to="/login" replace state={{ from: location }} />`.
- Wrong role -> inline 403 Forbidden screen.
- Correct role -> children.

Auth behavior:

- `login` stores `access_token` using `saveToken`.
- JWT is decoded client-side by `getCurrentUser`.
- Expired token is removed.
- API wrapper removes token and redirects to `/login` on protected 401 responses.
- `logout()` removes token and `window.location.assign("/login")`.

## Current Layout and Navigation

`AuthenticatedShell` is simple and fixed-width:

- fixed sidebar width `w-64`
- content shifted by `ml-64`
- no mobile drawer behavior
- no topbar
- no sticky period/phase context outside per-page `RecruitmentPhaseCard`
- page padding is `p-6 lg:p-8`
- content max width is `max-w-7xl`

`RoleNavSidebar`:

- Reads current user using `getCurrentUser()`.
- Chooses groups from `groupsForRole(user?.role)`.
- Uses `NavLink`, `useLocation`, `activePaths`, and `activePrefix`.
- Active item uses `bg-primary text-primary-foreground shadow-sm`.
- Inactive item uses muted foreground and hover muted background.
- Footer shows user email, role badge, logout button, and "MBC Laboratory 2026".
- Brand header uses `BarChart3` icon and "ScreenAI Lab", not MBC logo.

Candidate nav groups:

- Home: Dashboard
- Application: Application Overview, Documents, Application Status
- Account: Profile

Recruiter nav groups:

- Overview: Dashboard
- Recruitment: Applications, Evaluation, Candidates, Document Verification, Announcements, Analytics
- Configuration: Rubrics
- Account: Profile

Super Admin nav groups:

- Overview: Dashboard
- Recruitment: shared recruiter routes for Applications, Evaluation, Candidates, Document Verification, Announcements, Analytics
- Administration: Users, Periods, Audit Logs, Emails, Settings
- Configuration: Rubrics
- Account: Profile

Migration notes for AppShell/BrandSidebar:

- Preserve all `activePaths` and `activePrefix` behavior, especially `/application/*`, legacy candidate routes, `/candidates/:id`, `/recruiter/profile`, and `/admin/profile`.
- Preserve super admin access to shared recruiter routes.
- Preserve `logout()` behavior.
- Do not move `CandidateProfileGuard` behavior into visual shell without careful redirect testing.
- Add mobile drawer only after desktop active state parity is verified.

## Shared Components to Refactor

| Target shared component | Current source/pattern | Notes for later phases |
| --- | --- | --- |
| layout shell | `AuthenticatedShell` in `App.jsx` | Replace in Phase 2 with AppShell while preserving route wrappers. |
| sidebar | `RoleNavSidebar.jsx` | Migrate to BrandSidebar or compatibility wrapper; preserve active state and role groups. |
| topbar | none | GlassTopbar should load active period defensively and never block page render. |
| page header | repeated per-page header divs | Introduce PageHeader for title, description, eyebrow, action, status chip. |
| metric card | `components/recruiter/WorkspaceCards.jsx` and `SummaryCard` in email page | Centralize into common MetricCard with tone/loading/helper support. |
| status badge | `ApplicationsTable.StatusBadge`, page-local badges, email/audit status maps | Centralize application/document/user/email/audit status mapping. |
| phase badge | `lib/phase.js`, local `PhaseBadge` in RecruitmentPeriodPage | Centralize PhaseBadge and reuse across period card, tables, analytics. |
| empty state | local `EmptyState`, `EmptyApplication`, `EmptyStatus`, table empty text | Centralize EmptyState with helpful action support. |
| loading state | repeated `Loader2` centered blocks | Centralize LoadingState variants for page/card/table/metrics. |
| step track | `RecruitmentJourney`, `DocumentsPage.StepTracker`, `RecruitmentPhaseCard` rows | Create StepTrack while preserving candidate status/phase mapping. |
| table components | shadcn tables in ApplicationsTable, AdminPage, AuditLogsPage, EmailTemplatesPage, RecruitmentPeriodPage | Need responsive/mobile strategy and consistent loading/empty/error. |
| confirmation dialog | AlertDialog in Evaluation/Announcements, Dialog in Period close, `window.confirm` in AdminPage/DocumentVerification | Replace risky `window.confirm` flows with ConfirmActionDialog. |
| document upload | `DocumentUploadStep` | Keep MIME/size/locked behavior; restyle only after behavior tests. |
| profile forms | `CandidateProfileForm`, `StaffProfileForm` | Keep validation, locked fields, password update semantics. |
| preview panels | `DocumentPreviewDialog`, inline preview in DocumentVerification | Keep auth Blob URL fetch and revocation. |

## Candidate Pages Inventory

### `frontend/src/pages/candidate/DashboardPage.jsx`

- Purpose: candidate landing/dashboard with active period timeline, application progress, announcement banner, journey tracker, and document checklist.
- Data/API: `getMe`, `getMyApplication`, `listApplicationDocuments`, `getMyAnnouncement`, `getActivePeriod`.
- Components: `RecruitmentPhaseCard`, `RecruitmentJourney`, shadcn Card/Button/Badge/Progress, local `ChecklistCard`, local `NoApplicationCard`.
- Business logic to preserve: active period 404 is non-fatal; missing application 404 is non-fatal; announcement loads only after non-draft; document management is allowed for `draft` and `correction_requested`; status `announced_pass/fail` shows result banner.
- Redesign opportunity: replace with CandidateStatusHero, one primary CTA, centralized StatusBadge, DocumentChecklistCard, helpful Bahasa Indonesia copy, and StepTrack.

### `frontend/src/pages/candidate/ApplicationOverviewPage.jsx`

- Purpose: application summary and next-action routing.
- Data/API: `getMyProfile`, `getMyApplication`, `listApplicationDocuments`.
- Components: shadcn cards/buttons/badges/progress, local `EmptyApplication`, local `DocumentProgress`.
- Business logic to preserve: 404 application is allowed; `nextApplicationTarget()` decides start/documents/review/status destination; document completeness drives action label.
- Redesign opportunity: convert summary into PageHeader + ApplicationProgressCard with centralized document checklist and more supportive candidate-facing Indonesian copy.

### `frontend/src/pages/candidate/StartApplicationPage.jsx`

- Purpose: choose division and create application draft.
- Data/API: `getMyProfile`, `getActivePeriod`, `getMyApplication`, `createApplication`.
- Components: `DivisionSelection`, shadcn Card/Button/Badge.
- Business logic to preserve: division is locked after any application exists; creation disabled outside `SUBMISSION`; existing submitted-or-later application routes to status; existing draft routes to overview/documents; selected division defaults from profile/application.
- Redesign opportunity: use application step indicator, clearer active-period/deadline context, and MBC-branded division cards.

### `frontend/src/pages/candidate/DocumentsPage.jsx`

- Purpose: guided six-document upload and correction workflow.
- Data/API: `getMyApplication`, `getActivePeriod`, `listApplicationDocuments`, `uploadApplicationDocument`.
- Components: `DocumentUploadStep`, local `StepTracker`, local `ReviewStatusPanel`, shadcn Card/Button/Badge/Progress.
- Business logic to preserve: not-found application redirects to `/application/start`; draft uploads only during `SUBMISSION`; correction mode only allows replacing rejected documents; verified documents remain locked; server-provided `limits` are used when available; final review disabled until all required docs are present.
- Redesign opportunity: replace custom tracker with StepTrack, use DocumentRequirementCard per doc, show allowed file/max size consistently, and improve correction guidance.

### `frontend/src/pages/candidate/ReviewPage.jsx`

- Purpose: final application review and irreversible submit.
- Data/API: `getMyProfile`, `getMyApplication`, `getActivePeriod`, `listApplicationDocuments`, `submitApplication`.
- Components: shadcn cards/buttons/badges, local `Field`, local `ConfirmRow`.
- Business logic to preserve: non-draft application redirects to status; missing app redirects to start; submit requires all acknowledgements, all required docs, complete profile, and `SUBMISSION` phase; after submit navigate replace to status.
- Redesign opportunity: use ConfirmActionDialog pattern, PageHeader, clearer readiness checklist, and Bahasa Indonesia candidate copy.

### `frontend/src/pages/candidate/ApplicationStatusPage.jsx`

- Purpose: candidate status tracking, reference ID copy, announcement display, correction action.
- Data/API: `getMyApplication`, `listApplicationDocuments`, `getMyAnnouncement`.
- Components: `RecruitmentJourney`, local `StatusHero`, `DraftStatus`, `CorrectionDocumentsCard`, `ReferenceBlock`.
- Business logic to preserve: missing application is non-fatal; document errors show toast but do not break page; announcement missing is non-fatal; draft state still routes back to documents/review; correction_requested displays rejected documents and fix CTA; announced states use final result.
- Redesign opportunity: turn StatusHero into CandidateStatusHero, centralize StatusBadge and StepTrack, make waiting states more reassuring.

### `frontend/src/pages/candidate/ProfilePage.jsx`

- Purpose: profile and current application summary.
- Data/API: `getMyProfile`, `getMyApplication`.
- Components: shadcn Card/Button/Badge, local `Field`.
- Business logic to preserve: missing application is non-fatal; `profile.application_status` fallback is used; profile edit route remains accessible.
- Redesign opportunity: PageHeader and more compact profile/application sections; use StatusBadge and RoleBadge.

### `frontend/src/pages/candidate/EditProfilePage.jsx`

- Purpose: candidate profile editing and required profile completion target.
- Data/API: `getMyProfile`; child component calls `updateMyProfile`.
- Components: `CandidateProfileForm`.
- Business logic to preserve: missing required fields from `location.state.missingProfileFields` display warning; `POST_SUBMIT_STATUSES` lock academic identity fields; WhatsApp remains required and validated in child form.
- Redesign opportunity: improve guard warning and form layout while preserving locked field affordances.

## Recruiter Pages Inventory

### `frontend/src/pages/recruiter/OverviewPage.jsx`

- Purpose: recruiter dashboard with active period card, summary metrics, and workspace shortcuts.
- Data/API: `listRecruiterApplications`, `getActivePeriod`.
- Components: `RecruitmentPhaseCard`, `MetricCard`, `ShortcutCard`.
- Business logic to preserve: active period 404 is non-fatal; application summary derived with `summarizeApplications`.
- Redesign opportunity: shift from shortcut grid to RecruiterCommandHero, queue metrics, division breakdown, and prioritized work queue.

### `frontend/src/pages/recruiter/ApplicationsPage.jsx`

- Purpose: filter applications and open candidate detail after evaluation unlocks candidate ID.
- Data/API: `listRecruiterApplications({ division, status })`.
- Components: `ApplicationFilters`, `ApplicationsTable`, `MetricCard`.
- Business logic to preserve: `all` filter maps to undefined API params; table row navigation depends on `candidateEvaluationId`; non-evaluated rows do not open detail.
- Redesign opportunity: add search by candidate data, quick filter chips, richer table columns, and mobile card view.

### `frontend/src/pages/recruiter/DocumentVerificationPage.jsx`

- Purpose: review uploaded documents per application, verify/reject each doc, preview files, and finalize review.
- Data/API: `listRecruiterApplications`, `listApplicationDocuments`, `reviewDocument`, `finalizeDocumentReview`, `fetchDocumentBlob`, `getActivePeriod`.
- Components: `ApplicationFilters`, `MetricCard`, shadcn Textarea/Card/Button/Badge, inline preview.
- Business logic to preserve: default status filter `document_review`; preview Blob URLs are revoked; rejection requires reason; finalize requires every doc to be `verified` or `rejected`; finalization may produce `verified` or `correction_requested`; evaluation-phase warning when pending/correction exists.
- Redesign opportunity: split queue and preview panel more deliberately, replace `window.confirm` with ConfirmActionDialog, centralize document status badges.

### `frontend/src/pages/recruiter/EvaluationPage.jsx`

- Purpose: run AI evaluation per division and optionally force re-evaluation.
- Data/API: `getActivePeriod`, `listRecruiterApplications`, `evaluateBatch`.
- Components: `RecruitmentPhaseCard`, `ApplicationsTable`, `MetricCard`, AlertDialog, Select, Tooltip.
- Business logic to preserve: selected division defaults to `big_data`; evaluation only sends division and force flag; result counters/warnings are surfaced; re-evaluate confirmation is required; phase warnings do not block evaluation but warn when outside `EVALUATION`.
- Redesign opportunity: EvaluationActionPanel with readiness counts, threshold context, last run timestamp if available, and stronger re-run warning.

### `frontend/src/pages/recruiter/CandidatesPage.jsx`

- Purpose: ranked/scored candidate review list.
- Data/API: `listRecruiterApplications({ division, status })`.
- Components: `ApplicationFilters`, `ApplicationsTable`, `MetricCard`.
- Business logic to preserve: filters map `all` to undefined; only applications with `candidateEvaluationId()` are shown; `sortRankedApplications()` orders rank then score; recommended count uses `is_recommended`.
- Redesign opportunity: division tabs, score breakdown previews, recommendation badges, and clearer ranking context.

### `frontend/src/pages/recruiter/AnnouncementsPage.jsx`

- Purpose: select pass candidates and publish pass/fail results per division/period.
- Data/API: `getActivePeriod`, `listRecruiterApplications`, `bulkAnnounce`.
- Components: `RecruitmentPhaseCard`, `ApplicationFilters`, `ApplicationsTable`, `MetricCard`, AlertDialog, Tooltip.
- Business logic to preserve: selected pass IDs include only evaluated statuses; already announced pass initializes selected; publish requires selected pass count, single division, active period, and announcement phase unless super admin; unselected evaluated candidates become fail; confirmation dialog states irreversible action.
- Redesign opportunity: pre-publish checklist, candidate-facing preview, pass/fail counts by division, and more visible phase lock/bypass state.

### `frontend/src/pages/recruiter/AnalyticsPage.jsx`

- Purpose: active-period analytics dashboard with division filter, funnel, demographics, document completeness, evaluation progress, and score distribution.
- Data/API: `getRecruiterAnalytics({ division })`.
- Components: `MetricCard`, shadcn Card/Badge/Progress/Select, local bar/stat primitives.
- Business logic to preserve: failed API resets to `EMPTY_ANALYTICS`; no active period and no applications have explicit states; division filter passes `all` to API helper which omits param.
- Redesign opportunity: use MBC chart palette, reduce one-off metric/stat components, improve mobile stacking and copy language consistency.

### `frontend/src/pages/recruiter/ProfilePage.jsx`

- Purpose: recruiter profile summary.
- Data/API: through `StaffProfileSummary` -> `getMyProfile`.
- Components: `StaffProfileSummary`.
- Business logic to preserve: editPath `/recruiter/profile/edit`.
- Redesign opportunity: align with shared PageHeader and role badge style.

### `frontend/src/pages/recruiter/EditProfilePage.jsx`

- Purpose: recruiter name/email/password update.
- Data/API: through `StaffProfileForm` -> `getMyProfile`, `updateMyProfile`.
- Components: `StaffProfileForm`.
- Business logic to preserve: password confirmation and minimum length, empty payload no-op.
- Redesign opportunity: align form controls with branded input and password toggle patterns.

## Super Admin Pages Inventory

### `frontend/src/pages/admin/OverviewPage.jsx`

- Purpose: admin dashboard overview with active period, stats, applications/users metrics, and admin workspace shortcuts.
- Data/API: `getActivePeriod`, `getActivePeriodStats`, `listRecruiterApplications`, `listUsers`.
- Components: `RecruitmentPhaseCard`, `MetricCard`, `ShortcutCard`.
- Business logic to preserve: active period/stats failures are non-fatal; application load failure toasts; user count failure is non-fatal.
- Redesign opportunity: AdminControlHero, PeriodControlPanel, RiskAlerts, and admin-specific metric grid.

### `frontend/src/pages/admin/AdminPage.jsx`

- Purpose: user management for roles, activation, and assisted password reset.
- Data/API: `listUsers`, `updateUserRole`, `deactivateUser`, `reactivateUser`, `sendAdminPasswordResetLink`, `getActivePeriod`, `getActivePeriodStats`.
- Components: `RecruitmentPhaseCard`, shadcn table/select/input/button/badge.
- Business logic to preserve: pagination size 20; role/search filters; self account cannot be modified; reset password uses confirmation and sends email link; role and active toggles refetch page.
- Redesign opportunity: safer action menu, clearer role/status badges, better confirmation dialog, mobile table/card fallback.

### `frontend/src/pages/admin/RecruitmentPeriodPage.jsx`

- Purpose: create/update/close recruitment periods and threshold N.
- Data/API: `listPeriods`, `createPeriod`, `updatePeriod`, `closePeriod`.
- Components: local `ActivePeriodCard`, `CreatePeriodForm`, `PeriodRow`, `StatusBadge`, `PhaseBadge`, shadcn Dialog/Table/Input.
- Business logic to preserve: frontend date ordering validation; all four dates required; cannot create new period while active period exists; threshold_n empty maps to null; close period requires dialog confirmation; period rows edit only name/end dates/threshold.
- Redesign opportunity: PeriodSafetyPanel, timeline preview before save, explicit active-period conflict and irreversible action treatment.

### `frontend/src/pages/admin/AuditLogsPage.jsx`

- Purpose: paginated audit log viewer with filters.
- Data/API: `getAdminAuditLogs({ page, limit, action_type, recruiter_id, candidate_id, date_from, date_to })`.
- Components: shadcn table/select/input/button/badge.
- Business logic to preserve: draft filters vs applied filters; reset behavior; pagination; error state with retry.
- Redesign opportunity: timeline cards or clearer table hierarchy, sensitive/destructive action highlighting, better responsive handling.

### `frontend/src/pages/admin/EmailTemplatesPage.jsx`

- Purpose: email notification log and provider state monitor, with read-only backend template preview names.
- Data/API: `getAdminEmailNotifications({ page, limit, notification_type, status, to_email, date_from, date_to })`.
- Components: shadcn table/select/input/button/badge, local `SummaryCard`, local `StatusBadge`.
- Business logic to preserve: filter application/reset, pagination, error retry, summary/config display, no edit API implied.
- Redesign opportunity: rename/structure as Email Operations, centralize summary cards/status badges, clarify mock/disabled state.

### `frontend/src/pages/admin/SettingsPage.jsx`

- Purpose: placeholder route for future settings backend support.
- Data/API: none.
- Components: `AdminPlaceholderPage`.
- Business logic to preserve: no false configurability; route remains stable.
- Redesign opportunity: keep as clear placeholder or replace only when real settings API exists.

### `frontend/src/pages/admin/ProfilePage.jsx`

- Purpose: super admin profile summary.
- Data/API: through `StaffProfileSummary` -> `getMyProfile`.
- Components: `StaffProfileSummary`.
- Business logic to preserve: editPath `/admin/profile/edit`.
- Redesign opportunity: align with shared PageHeader and role badge style.

### `frontend/src/pages/admin/EditProfilePage.jsx`

- Purpose: super admin name/email/password update.
- Data/API: through `StaffProfileForm` -> `getMyProfile`, `updateMyProfile`.
- Components: `StaffProfileForm`.
- Business logic to preserve: password validation and empty-payload no-op.
- Redesign opportunity: branded form controls and safer password affordance.

## Auth/Public Pages Inventory

### `frontend/src/pages/LoginPage.jsx`

- Purpose: login form, token save, role redirect, unverified email resend.
- Data/API: `login`, `resendVerification`, `getApiErrorCode`, `getApiErrorMessage`.
- Auth logic: redirects authenticated users; `saveToken(data.access_token)`; navigates to `defaultPathForRole(data.user.role)`; handles `EMAIL_NOT_VERIFIED`; password visibility toggle.
- Redesign opportunity: branded split auth layout with MBC logo, Indonesian candidate-facing copy, and official portal headline.

### `frontend/src/pages/RegisterPage.jsx`

- Purpose: candidate registration and email verification handoff.
- Data/API: `register`, `resendVerification`, `getApiErrorMessage`.
- Validation/auth logic: redirects authenticated users; requires fullName/nim/email/password/faculty/major/year; NIM numeric pattern; password min 8; year 2000-2100; registration result switches to verification instructions.
- Redesign opportunity: branded auth layout, clearer Telkom/NIM validation copy, password visibility toggle, Indonesian copy consistency.

### `frontend/src/pages/ForgotPasswordPage.jsx`

- Purpose: request reset link.
- Data/API: `forgotPassword`, `getApiErrorMessage`.
- Validation/auth logic: requires email; generic success message to avoid account enumeration.
- Redesign opportunity: shared AuthLayout and more reassuring support copy.

### `frontend/src/pages/ResetPasswordPage.jsx`

- Purpose: set new password from reset code.
- Data/API: `resetPassword`, `getApiErrorCode`, `getApiErrorMessage`.
- Validation/auth logic: missing/invalid/expired/used reset code terminal states; password required, min 8, confirm match; `removeToken()` after successful reset.
- Redesign opportunity: shared AuthLayout and password visibility toggle.

### `frontend/src/pages/VerifyEmailPage.jsx`

- Purpose: verify email from code and allow resend for recoverable failures.
- Data/API: `verifyEmail`, `resendVerification`, `getApiErrorCode`, `getApiErrorMessage`.
- Validation/auth logic: `verifyEmailOnce` map prevents duplicate verification requests per code; handles missing/expired/used/invalid codes; resend requires email.
- Redesign opportunity: shared AuthLayout, official MBC success/error states, consistent Indonesian copy.

## Status Inventory

| Status/string | Type | Found in | Current behavior | Recommendation for shared map |
| --- | --- | --- | --- | --- |
| `draft` | application | `candidateApplication.js`, `RecruitmentJourney.jsx`, candidate pages, analytics | Editable candidate draft, no journey active step. | StatusBadge tone neutral, label `Draft`; candidate CTA continues documents/review. |
| `submitted` | application | `candidateApplication.js`, `recruiterWorkspace.js`, analytics, recruiter filters | Submitted/non-draft state; recruiter list includes. | StatusBadge tone info, label `Terkirim` for candidate, `Submitted` for staff if needed. |
| `document_review` | application | `candidateApplication.js`, `recruiterWorkspace.js`, `RecruitmentJourney.jsx`, `DocumentVerificationPage`, analytics | Recruiter/admin document verification queue. | StatusBadge tone info/warning, label `Review Dokumen`. |
| `correction_requested` | application | candidate/recruiter libs and pages | Candidate can replace only rejected docs; recruiter sees correction queue. | StatusBadge tone warning, label `Perlu Revisi`. |
| `verified` | application/document | candidate/recruiter libs, docs pages, verification page | Application ready for evaluation; document approved. | StatusBadge tone success, label `Terverifikasi`. |
| `screening` | application | candidate/recruiter libs, analytics, candidate status | Evaluated/screening step. | StatusBadge tone info, label `Evaluasi`. |
| `announced_pass` | application | candidate/recruiter libs, dashboard/status/announcements/analytics | Final pass result. | StatusBadge tone success, label `Lolos`. |
| `announced_fail` | application | candidate/recruiter libs, dashboard/status/announcements/analytics | Final fail result. | StatusBadge tone destructive, label `Tidak Lolos`. |
| `cancelled` | application | `candidateApplication.js`, analytics | Included in status sets/funnel but not heavily surfaced. | StatusBadge tone neutral/destructive depending backend meaning, label `Dibatalkan` or `Cancelled`. |
| `pending` | document/email/internal | `DocumentsPage`, `DocumentVerificationPage`, `EmailTemplatesPage` | Default document review status; email status class exists. | StatusBadge tone neutral, label `Menunggu`. |
| `rejected` | document | `DocumentsPage`, `ApplicationStatusPage`, `DocumentVerificationPage` | Requires rejection reason and candidate replacement. | StatusBadge tone destructive, label `Ditolak`. |
| `scored` | legacy/candidate detail | `CandidateDetailPage` | Candidate evaluation status in detail page. | Map separately as evaluation status tone success/info. |
| `recommended` / `is_recommended` | recommendation | `ApplicationsTable`, `CandidatesPage` | Recommended badge displayed when true. | Create RecommendationBadge or StatusBadge variant `recommended`. |
| `active` / `inactive` / `deactivated` | user/period | `AdminPage`, `RecruitmentPeriodPage`, profile summaries | Account/period state badges. | UserStatusBadge/PeriodStatusBadge or generic StatusBadge with entity namespace. |
| `captured` | email | `EmailTemplatesPage` | Mock/captured email status. | EmailStatusBadge tone info. |
| `sent` | email | `EmailTemplatesPage` | Delivered email status. | EmailStatusBadge tone success. |
| `failed` | email | `EmailTemplatesPage` | Failed email status. | EmailStatusBadge tone destructive. |
| `disabled` | email | `EmailTemplatesPage` | Email disabled/provider off. | EmailStatusBadge tone warning/neutral. |
| `document_verification` | audit action | `AuditLogsPage` | Audit action filter/badge. | AuditActionBadge tone info. |
| `document_review_finalized` | audit action | `AuditLogsPage` | Audit action filter/badge. | AuditActionBadge tone success/info. |
| `announcement` | audit action | `AuditLogsPage` | Audit action filter/badge. | AuditActionBadge tone warning/info. |
| `bulk_announcement` | audit action | `AuditLogsPage` | Audit action filter/badge. | AuditActionBadge tone warning. |
| `score_override` | audit action | `AuditLogsPage` | Audit action filter/badge. | AuditActionBadge tone critical/warning. |
| `application_submitted` | email notification type | `EmailTemplatesPage` | Filter value. | NotificationTypeBadge. |
| `document_rejected` | email notification type | `EmailTemplatesPage` | Filter value. | NotificationTypeBadge warning/destructive. |
| `announcement_published` | email notification type | `EmailTemplatesPage` | Filter value. | NotificationTypeBadge success/info. |

## Phase Inventory

| Phase | Found in | Current behavior | Recommendation |
| --- | --- | --- | --- |
| `UPCOMING` | `lib/phase.js`, `candidateApplication.js`, `RecruitmentJourney.jsx`, `RecruitmentPhaseCard.jsx` | Candidate submission is blocked; journey active step null; phase label `Belum dibuka`. | PhaseBadge neutral, StepTrack inactive, topbar shows upcoming start if available. |
| `SUBMISSION` | same plus candidate pages | Candidate can start/upload/submit; RecruitmentPhaseCard countdown uses submission end. | PhaseBadge info/primary, StepTrack active `Pendaftaran`, candidate CTA enabled. |
| `EVALUATION` | same plus recruiter evaluation/document pages | Candidate submission/upload blocked except correction; recruiter evaluation expected; pending document warning shown. | PhaseBadge warning/info, StepTrack active `Evaluasi`, GlassTopbar deadline context. |
| `ANNOUNCEMENT` | same plus announcements page | Recruiter publish allowed; candidate sees announcement context if result exists. | PhaseBadge success/info, StepTrack active `Pengumuman`, publish checklist. |
| `CLOSED` | same | Recruitment ended. | PhaseBadge neutral, all critical write actions blocked/explained. |

The frontend currently trusts backend-provided `current_phase` from active/list period endpoints and does not derive phase locally. Preserve this.

## Business Logic That Must Be Preserved

- Auth token save/logout: `saveToken`, `getToken`, `removeToken`, `logout`, API auth header attachment, protected 401 relogin behavior.
- Role redirect: `defaultPathForRole`, RootRedirect, Login/Register authenticated redirect.
- `ProtectedRoute`: unauthenticated redirect with `state.from`, wrong-role 403 screen.
- `CandidateProfileGuard`: all candidate protected pages except `/profile/edit` redirect to edit profile when required fields are missing.
- Required profile fields: `full_name`, `email`, `nim`, `faculty`, `major`, `year`, `whatsapp`.
- Candidate profile lock: `POST_SUBMIT_STATUSES` locks academic identity fields after application submission.
- Candidate application draft/submission status: draft can edit docs; non-draft routes to status; review submit requires acknowledgements, docs, profile completeness, and submission phase.
- Document upload flow: six required docs, server limits, MIME/size validation, draft phase gate, correction mode only for rejected docs.
- Document preview flow: authenticated Blob fetch and URL revocation.
- Document verification: per-doc verified/rejected review, rejection reason required, finalize only when every doc has final review status.
- Recruiter filters: division/status `all` maps to undefined query params; filters refetch data.
- Candidate detail navigation: table rows open `/candidates/:id` only when `candidateEvaluationId()` exists.
- Candidate detail evaluation logic: score override, document preview, supporting document verification, identity reveal only after scoring.
- Evaluation run/re-run: `evaluateBatch(division, { force })`, warning/counter handling, re-evaluate confirmation.
- Announcement publish: bulk publish requires single division, active period, evaluated statuses, phase allowance or super admin bypass, confirmation dialog.
- Admin period create/update/close: date order validation, active-period conflict block, threshold null mapping, close confirmation.
- Users management: self-protection, role update, deactivate/reactivate, assisted password reset confirmation.
- Audit/email pagination and filters: draft filters apply/reset behavior and retry states.

## API Dependency Map

| Page/component | API functions used |
| --- | --- |
| `App.jsx` | `getMyProfile`, `getMyApplication` |
| `LoginPage.jsx` | `login`, `resendVerification`, `getApiErrorCode`, `getApiErrorMessage` |
| `RegisterPage.jsx` | `register`, `resendVerification`, `getApiErrorMessage` |
| `ForgotPasswordPage.jsx` | `forgotPassword`, `getApiErrorMessage` |
| `ResetPasswordPage.jsx` | `resetPassword`, `getApiErrorCode`, `getApiErrorMessage` |
| `VerifyEmailPage.jsx` | `verifyEmail`, `resendVerification`, `getApiErrorCode`, `getApiErrorMessage` |
| Candidate Dashboard | `getMe`, `getMyApplication`, `listApplicationDocuments`, `getMyAnnouncement`, `getActivePeriod` |
| Candidate Application Overview | `getMyProfile`, `getMyApplication`, `listApplicationDocuments` |
| Candidate Start Application | `getMyProfile`, `getActivePeriod`, `getMyApplication`, `createApplication` |
| Candidate Documents | `getMyApplication`, `getActivePeriod`, `listApplicationDocuments`, `uploadApplicationDocument` |
| Candidate Review | `getMyProfile`, `getMyApplication`, `getActivePeriod`, `listApplicationDocuments`, `submitApplication` |
| Candidate Status | `getMyApplication`, `listApplicationDocuments`, `getMyAnnouncement` |
| Candidate Profile | `getMyProfile`, `getMyApplication` |
| Candidate Edit Profile | `getMyProfile`; child `CandidateProfileForm` uses `updateMyProfile` |
| `CandidateProfileForm` | `updateMyProfile` |
| Recruiter Overview | `listRecruiterApplications`, `getActivePeriod` |
| Recruiter Applications | `listRecruiterApplications` |
| Recruiter Document Verification | `listRecruiterApplications`, `listApplicationDocuments`, `reviewDocument`, `finalizeDocumentReview`, `fetchDocumentBlob`, `getActivePeriod` |
| Recruiter Evaluation | `getActivePeriod`, `listRecruiterApplications`, `evaluateBatch` |
| Recruiter Candidates | `listRecruiterApplications` |
| Recruiter Announcements | `getActivePeriod`, `listRecruiterApplications`, `bulkAnnounce` |
| Recruiter Analytics | `getRecruiterAnalytics` |
| Recruiter/Admin Profile Summary | `getMyProfile` |
| Recruiter/Admin Profile Edit | `getMyProfile`, `updateMyProfile` |
| Admin Overview | `getActivePeriod`, `getActivePeriodStats`, `listRecruiterApplications`, `listUsers` |
| Admin Users | `listUsers`, `updateUserRole`, `deactivateUser`, `reactivateUser`, `sendAdminPasswordResetLink`, `getActivePeriod`, `getActivePeriodStats` |
| Admin Recruitment Periods | `listPeriods`, `createPeriod`, `updatePeriod`, `closePeriod` |
| Admin Audit Logs | `getAdminAuditLogs` |
| Admin Emails | `getAdminEmailNotifications` |
| Admin Settings | none |
| `CandidateDetailPage.jsx` | `getCandidate`, `listApplicationDocuments`, `overrideScore`, `verifyDocument` |
| `DocumentPreviewDialog.jsx` | `fetchDocumentBlob` |
| `SwotHighlightPanel.jsx` | `getSwotText` |

## Current Loading, Empty, and Error State Patterns

Loading:

- Most pages use centered `Loader2` with `py-24`.
- Tables use inline `Loader2` rows or centered card content.
- `RecruitmentPhaseCard` has a custom card skeleton.
- Analytics has a local `LoadingBlock`.
- Metric cards often use `"..."` as loading value.

Empty:

- Candidate empty states exist but are local: `NoApplicationCard`, `EmptyApplication`, `EmptyStatus`, `DraftStatus`.
- `ApplicationsTable` has a local `EmptyState`.
- Admin tables use inline text such as "No users match those filters."
- Analytics uses dashed cards for no active period/no applications.
- Settings uses `AdminPlaceholderPage`.

Error:

- Many load errors are toast-only and leave stale/empty state.
- Audit logs and email notifications have inline error states with Retry.
- Auth/reset/verify pages have inline terminal error blocks.
- API 404 is intentionally swallowed for active period, missing application, and missing announcement in several places.

Phase 3+ replacement targets:

- Create shared LoadingState variants: `page`, `card`, `table`, `metrics`.
- Create shared EmptyState with title, description, icon, and optional action.
- Keep inline terminal auth errors but style through shared alert primitives.
- Make table empty/error states responsive and action-oriented.

## Risks and Migration Notes

- CSS token regression: replacing shadcn OKLCH variables with MBC HEX tokens must keep all existing `--background`, `--foreground`, `--card`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, and `--sidebar-*` mappings.
- shadcn variable compatibility: current components rely on default token names and variants. Phase 1 should update values, not remove variable names.
- route/layout regression: AppShell migration must not disturb `ProtectedShell`, `CandidateShell`, `CandidateProfileGuard`, RootRedirect, legacy redirects, or wildcard fallback.
- sidebar active state: `activePaths` and `activePrefix` behavior must be ported exactly.
- candidate guard redirect loop: `/profile/edit` must remain outside `CandidateProfileGuard`.
- recruiter/admin shared route behavior: super admin must retain access to `/recruiter/*`, `/rubrics`, and `/candidates/:id`.
- mobile table overflow: admin/recruiter tables use wide shadcn tables; Phase 8 must add mobile card fallback or scroll treatment.
- mixed language copywriting: candidate-facing pages mix English and Bahasa Indonesia; Phase 4/5 should standardize.
- status mapping inconsistency: status labels and colors are duplicated in candidate/recruiter/admin/email/audit code.
- phase mapping inconsistency: phase labels/classes are central in `lib/phase.js`, but `RecruitmentPeriodPage` has a local `PhaseBadge`.
- confirmation inconsistency: irreversible actions use both AlertDialog/Dialog and `window.confirm`.
- lint baseline is currently failing before redesign; Phase 0 does not fix it.
- `RegisterPage` validation mismatch: `NIM_PATTERN` allows 10+ digits, but error/helper copy says 13 digits starting with `103`.
- `DashboardPage` loads `announcement` state but does not use it directly.
- chunk size warning on build indicates possible future code splitting need.
- code-review-graph MCP tools were requested by repo instructions but were not exposed in the current tool session; local file inspection was used after discovery attempts.

## Final Migration Order

Validated order:

1. Phase 1 Brand Foundation & Design Tokens
2. Phase 2 Shared Layout System
3. Phase 3 Shared UI Components
4. Phase 4 Auth Pages
5. Phase 5 Candidate Experience
6. Phase 6 Recruiter Workspace
7. Phase 7 Super Admin Control Center
8. Phase 8 Responsive, Accessibility, QA Polish

Recommended detail:

- Phase 1 should only update fonts/tokens/logo asset scaffolding and verify shadcn compatibility.
- Phase 2 should preserve existing route wrappers and active nav behavior before adding topbar/mobile behavior.
- Phase 3 should centralize status/phase/metric/loading/empty/table/confirm primitives before page redesign.
- Phase 4 should standardize auth layout and copy without changing auth APIs.
- Phase 5 should redesign candidate pages around one next action and document/status clarity.
- Phase 6 should transform recruiter dashboard into queue-first workspace, then table-heavy pages.
- Phase 7 should focus on safety and operational clarity for users/periods/audit/emails/settings.
- Phase 8 should perform responsive, a11y, copywriting, table, and visual consistency QA.

## Smoke Test Result

Commands were run from `frontend` without installing dependencies.

### `npm run lint`

Result: failed.

Detected 40 problems: 33 errors and 7 warnings.

Complete lint findings by file:

```txt
frontend/src/App.jsx
  104:5 error react-hooks/set-state-in-effect
  Calling setState synchronously within an effect can trigger cascading renders.

frontend/src/components/DocumentPreviewDialog.jsx
  32:5 error react-hooks/set-state-in-effect
  Calling setState synchronously within an effect can trigger cascading renders.

frontend/src/components/DocumentUploadStep.jsx
  71:7 error react-hooks/immutability
  Cannot access variable before it is declared: handleFile.

frontend/src/components/RecruitmentJourney.jsx
  3:14 error react-refresh/only-export-components
  Fast refresh only works when a file only exports components.
  37:14 error react-refresh/only-export-components
  Fast refresh only works when a file only exports components.
  48:14 error react-refresh/only-export-components
  Fast refresh only works when a file only exports components.

frontend/src/components/RecruitmentPhaseCard.jsx
  82:27 error no-unused-vars
  'Icon' is defined but never used.

frontend/src/components/SwotHighlightPanel.jsx
  33:24 error react-hooks/set-state-in-effect
  Calling setState synchronously within an effect can trigger cascading renders.

frontend/src/components/admin/AdminPlaceholderPage.jsx
  6:9 error no-unused-vars
  'Icon' is assigned a value but never used.

frontend/src/components/candidate/DivisionSelection.jsx
  9:14 error react-refresh/only-export-components
  Fast refresh only works when a file only exports components.

frontend/src/components/recruiter/WorkspaceCards.jsx
  7:36 error no-unused-vars
  'Icon' is defined but never used.
  32:38 error no-unused-vars
  'Icon' is defined but never used.

frontend/src/components/ui/badge.jsx
  47:17 error react-refresh/only-export-components
  Fast refresh only works when a file only exports components.

frontend/src/components/ui/button.jsx
  63:18 error react-refresh/only-export-components
  Fast refresh only works when a file only exports components.

frontend/src/components/ui/tabs.jsx
  82:52 error react-refresh/only-export-components
  Fast refresh only works when a file only exports components.

frontend/src/pages/CandidateDetailPage.jsx
  175:5 error react-hooks/set-state-in-effect
  Calling setState synchronously within an effect can trigger cascading renders.
  354:40 error no-unused-vars
  'name' is defined but never used.

frontend/src/pages/RubricConfigPage.jsx
  95:5 error react-hooks/set-state-in-effect
  Calling setState synchronously within an effect can trigger cascading renders.

frontend/src/pages/VerifyEmailPage.jsx
  96:7 error react-hooks/set-state-in-effect
  Calling setState synchronously within an effect can trigger cascading renders.

frontend/src/pages/admin/AdminPage.jsx
  128:5 error react-hooks/set-state-in-effect
  Calling setState synchronously within an effect can trigger cascading renders.

frontend/src/pages/admin/AuditLogsPage.jsx
  174:5 error react-hooks/set-state-in-effect
  Calling setState synchronously within an effect can trigger cascading renders.

frontend/src/pages/admin/EmailTemplatesPage.jsx
  150:30 error no-unused-vars
  'Icon' is defined but never used.
  218:5 error react-hooks/set-state-in-effect
  Calling setState synchronously within an effect can trigger cascading renders.

frontend/src/pages/admin/RecruitmentPeriodPage.jsx
  588:5 error react-hooks/set-state-in-effect
  Calling setState synchronously within an effect can trigger cascading renders.

frontend/src/pages/candidate/DashboardPage.jsx
  136:10 error no-unused-vars
  'announcement' is assigned a value but never used.

frontend/src/pages/recruiter/AnalyticsPage.jsx
  115:41 error no-unused-vars
  'Icon' is defined but never used.
  173:9 warning react-hooks/exhaustive-deps
  applicantsByDivision expression could make useMemo dependencies change on every render.
  174:9 warning react-hooks/exhaustive-deps
  missingDocuments expression could make useMemo dependencies change on every render.
  175:9 warning react-hooks/exhaustive-deps
  funnelCounts expression could make useMemo dependencies change on every render.
  176:9 warning react-hooks/exhaustive-deps
  facultyDistribution expression could make useMemo dependencies change on every render.
  177:9 warning react-hooks/exhaustive-deps
  majorDistribution expression could make useMemo dependencies change on every render.
  178:9 warning react-hooks/exhaustive-deps
  yearDistribution expression could make useMemo dependencies change on every render.
  200:9 warning react-hooks/exhaustive-deps
  scoreBuckets expression could make useMemo dependencies change on every render.

frontend/src/pages/recruiter/AnnouncementsPage.jsx
  89:5 error react-hooks/set-state-in-effect
  Calling setState synchronously within an effect can trigger cascading renders.
  93:5 error react-hooks/set-state-in-effect
  Calling setState synchronously within an effect can trigger cascading renders.

frontend/src/pages/recruiter/DocumentVerificationPage.jsx
  103:5 error react-hooks/set-state-in-effect
  Calling setState synchronously within an effect can trigger cascading renders.
  113:5 error react-hooks/set-state-in-effect
  Calling setState synchronously within an effect can trigger cascading renders.

frontend/src/pages/recruiter/EvaluationPage.jsx
  95:5 error react-hooks/set-state-in-effect
  Calling setState synchronously within an effect can trigger cascading renders.
  99:5 error react-hooks/set-state-in-effect
  Calling setState synchronously within an effect can trigger cascading renders.

frontend/vite.config.js
  11:25 error no-undef
  '__dirname' is not defined.
```

Phase 0 did not fix these lint findings because the instructions prohibit unrelated logic/refactor changes in this phase.

### `npm run build`

Result: passed.

Important output:

```txt
vite v8.0.8 building client environment for production...
2464 modules transformed.
dist/index.html 0.47 kB gzip 0.31 kB
dist/assets/index-BPs8H3Ue.css 91.20 kB gzip 15.03 kB
dist/assets/index-fgZ-cORG.js 1,059.34 kB gzip 295.26 kB
built in 1.27s
```

Build warning:

```txt
Some chunks are larger than 500 kB after minification.
Consider dynamic import/code-splitting or adjusting chunk size warning limit.
```

### Manual route check

Not performed in Phase 0 because no dev server or test credentials were requested/provided, and this phase did not change runtime behavior.

## Known Issues

- `npm run lint` fails on existing code with React compiler/hook lint errors, fast-refresh export rules, unused variables, and `vite.config.js` `__dirname` in ESM.
- `npm run build` passes but warns about a JavaScript chunk over 500 kB.
- Current design tokens are default shadcn grayscale/OKLCH and do not match MBC brand.
- Current font is Geist, not Montserrat/Poppins.
- MBC logo assets/components are not present.
- Sidebar uses a generic chart icon as brand mark.
- Candidate-facing copy is mixed English and Bahasa Indonesia.
- Status/phase badge logic is duplicated and inconsistent.
- Empty/loading/error patterns are local and inconsistent.
- Several destructive/irreversible actions use different confirmation styles; some use `window.confirm`.
- Tables are desktop-first and likely need mobile treatment.
- `RegisterPage` NIM validation copy says 13 digits starting with `103`, but the regex only enforces 10+ digits.
- Legacy candidate routes `/my-applications` and `/upload` remain mounted but are outside the main redesign page list; include them in later regression smoke tests if still supported.

## Next Step Recommendation

Proceed to Phase 1 only after accepting the lint baseline as pre-existing or creating a small separate lint-baseline fix task. Phase 1 should update design tokens, add Montserrat/Poppins dependencies, prepare MBC logo assets/component, and keep all existing shadcn variable names compatible so current pages continue to render before layout migration starts.
