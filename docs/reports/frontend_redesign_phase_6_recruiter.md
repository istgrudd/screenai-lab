# Frontend Redesign Phase 6 - Recruiter Workspace

Date: 2026-06-02

## Scope

Phase 6 focused on the recruiter workspace and the shared surfaces needed by recruiter flows:

- Recruiter pages: overview, applications, document verification, evaluation, candidates, announcements, analytics, profile, and profile edit.
- Recruiter components used by those pages.
- Candidate detail navigation when opened from recruiter workflows.
- Shared staff profile components for recruiter profile surfaces.

No backend API contracts, auth/token handling, protected routes, candidate upload/submission flow, super-admin-only pages, admin period logic, or announcement timestamp timezone behavior were changed.

## Implemented Changes

- Added a recruiter workspace visual system using existing shared primitives such as `PageHeader`, `MetricCard`, `EmptyState`, `LoadingState`, `PhaseBadge`, `StatusBadge`, and `ConfirmActionDialog`.
- Added recruiter-specific components:
  - `RecruiterCommandHero`
  - `WorkQueueCard`
  - `DivisionBreakdownCard`
  - `CandidateReviewCard`
  - `VerificationQueuePanel`
  - `EvaluationActionPanel`
  - `EvaluationRunningOverlay`
  - `AnnouncementSafetyPanel`
  - `ContextBackButton`
- Added `src/lib/navigationContext.js` so recruiter tables can open candidate detail pages with a source-aware return target.
- Updated `CandidateDetailPage` to return to the recruiter context that opened it: Applications, Evaluation, Candidates, or Announcements. Direct visits still fall back to the correct dashboard path for the current role.
- Reworked recruiter Applications and Candidates pages with recruiter-oriented metrics, search, filters, and consistent candidate detail navigation state.
- Reworked Document Verification with a queue panel, selected application review surface, preview states, and a confirm dialog for finalization.
- Reworked Evaluation with a focused action panel, duplicate-run guard, disabled controls while evaluation is running, a blocking overlay, and a result summary.
- Reworked Announcements with a safety panel, evaluated-candidate selection workflow, candidate preview, and confirm dialog before publish.
- Reworked Analytics into recruiter-facing insight cards and bar rows while preserving the existing `getRecruiterAnalytics` API usage.
- Aligned recruiter profile and edit profile surfaces through the shared staff profile components without changing profile API behavior.

## Evaluation Blocking

`RecruiterEvaluationPage` now guards `runEvaluate` with the `evaluating` state. While evaluation is running:

- the division selector and run controls are disabled through `EvaluationActionPanel`;
- duplicate evaluation requests return early;
- `EvaluationRunningOverlay` blocks interaction and communicates that the queue is processing;
- the page refreshes applications and active-period state after completion.

## Context-Aware Back Navigation

Recruiter tables now pass source metadata when navigating to candidate detail:

- Applications: `/recruiter/applications`
- Evaluation: `/recruiter/evaluation`
- Candidates: `/recruiter/candidates`
- Announcements: `/recruiter/announcements`

`CandidateDetailPage` uses that state through `ContextBackButton`; when no state is available, it falls back to the role-appropriate recruiter candidate list or default role path.

## Verification

Passed:

- `npx eslint "src/components/recruiter/*.jsx" "src/pages/recruiter/*.jsx" "src/pages/CandidateDetailPage.jsx" "src/lib/navigationContext.js"`
- `npm run build`

`npm run build` completed successfully with Vite's existing large chunk warning.

`npm run lint` was run and failed on existing out-of-scope lint errors in files such as:

- `src/App.jsx`
- `src/components/DocumentPreviewDialog.jsx`
- `src/components/DocumentUploadStep.jsx`
- `src/components/RecruitmentJourney.jsx`
- `src/components/RecruitmentPhaseCard.jsx`
- `src/components/SwotHighlightPanel.jsx`
- `src/components/admin/AdminPlaceholderPage.jsx`
- `src/components/ui/*`
- `src/pages/RubricConfigPage.jsx`
- `src/pages/admin/*`
- `vite.config.js`

Those failures are outside the Phase 6 recruiter scope and were not changed to avoid broad lint cleanup.

Smoke route checks against `http://127.0.0.1:5174` returned `200` and the SPA app shell for:

- `/recruiter/dashboard`
- `/recruiter/applications`
- `/recruiter/documents`
- `/recruiter/evaluation`
- `/recruiter/candidates`
- `/recruiter/announcements`
- `/recruiter/analytics`
- `/recruiter/profile`
- `/recruiter/profile/edit`
- `/rubrics`

## Notes

The required `code-review-graph` MCP tools were not exposed in this session, so local file inspection was used as a fallback after attempting tool discovery.
