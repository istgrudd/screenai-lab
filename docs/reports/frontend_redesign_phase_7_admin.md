# Frontend Redesign Phase 7 - Super Admin Control Center Redesign

Date: 2026-06-02

## Summary

Phase 7 redesigned the super admin experience into a safety-oriented control center. The admin dashboard now leads with active period context, operational metrics, period safety, risk alerts, and clear separation between admin-only workspaces and shared recruiter oversight routes.

The work focused on preventing human error around active periods, user management, period close actions, audit review, email delivery monitoring, and settings placeholders. Backend API contracts, auth/token behavior, route guards, candidate workflows, recruiter evaluation blocking, recruiter back navigation, and admin period payload shapes were not changed.

## Files Changed

- `frontend/src/components/admin/AdminControlHero.jsx`
- `frontend/src/components/admin/RiskAlertCard.jsx`
- `frontend/src/components/admin/PeriodSafetyPanel.jsx`
- `frontend/src/components/admin/AdminMetricGrid.jsx`
- `frontend/src/components/admin/UserManagementPanel.jsx`
- `frontend/src/components/admin/AuditTimelineCard.jsx`
- `frontend/src/components/admin/EmailOperationsPanel.jsx`
- `frontend/src/components/admin/PeriodTimelinePreview.jsx`
- `frontend/src/components/admin/AdminPlaceholderPage.jsx`
- `frontend/src/pages/admin/OverviewPage.jsx`
- `frontend/src/pages/admin/AdminPage.jsx`
- `frontend/src/pages/admin/RecruitmentPeriodPage.jsx`
- `frontend/src/pages/admin/AuditLogsPage.jsx`
- `frontend/src/pages/admin/EmailTemplatesPage.jsx`
- `frontend/src/pages/admin/SettingsPage.jsx`
- `frontend/src/components/StaffProfileForm.jsx`
- `frontend/src/components/StaffProfileSummary.jsx`

## Components Added or Updated

- `AdminControlHero`: branded control center hero for active period status, current phase, threshold N, submitted count, total users, and primary period action.
- `RiskAlertCard`: reusable risk list for operational warnings, critical states, info notices, and clear states without creating new backend blocking rules.
- `PeriodSafetyPanel`: explains active period, phase timeline, threshold N, active conflict, pending review context, and destructive close-period risk.
- `AdminMetricGrid`: centralized admin metrics using shared `MetricCard`.
- `UserManagementPanel`: user search/filter and safety messaging for self-protection and assisted reset behavior.
- `AuditTimelineCard`: readable audit timeline with sensitive action highlighting.
- `EmailOperationsPanel`: read-only email operations summary, provider status, and template availability explanation.
- `PeriodTimelinePreview`: preview of submission, evaluation, and announcement date ranges before period creation.
- `AdminPlaceholderPage`: redesigned with `PageHeader`, `EmptyState`, and planned-setting cards without implying save support.
- `StaffProfileForm` and `StaffProfileSummary`: kept Phase 6 visual alignment and deferred profile loading to satisfy Phase 7 targeted lint.

## Pages Redesigned

- `OverviewPage`: now uses `PageHeader`, `AdminControlHero`, `AdminMetricGrid`, `PeriodSafetyPanel`, `RiskAlertCard`, admin action cards, and shared recruiter access cards.
- `AdminPage / Users`: keeps pagination size 20, role/search filters, list/update/deactivate/reactivate/reset APIs, and self-protection. Added safer confirmation for deactivate/reactivate and assisted password reset.
- `RecruitmentPeriodPage`: reworked into active-period summary, safety panel, grouped create form, timeline preview, inline date validation, conflict explanation, and destructive close confirmation.
- `AuditLogsPage`: keeps draft/applied filters, reset, pagination, retry, and API params while moving log display to a clearer timeline.
- `EmailTemplatesPage`: repositioned visually as Email Operations while preserving the route and read-only behavior. Filters, pagination, summary/config display, retry, and API params remain.
- `SettingsPage`: remains a placeholder because no settings backend exists.
- Admin profile/edit profile continue through shared staff profile components with admin route copy.

## Period Safety Improvements

- Active period visibility is now prominent on dashboard and periods page.
- Current phase is rendered with `PhaseBadge`.
- Active period conflict is explained when create-period is disabled.
- Close period is visually destructive and requires `ConfirmActionDialog`.
- Date order validation remains inline and uses the existing required-date rules.
- Threshold N is shown explicitly, including the null/missing state.
- Create period includes a `PeriodTimelinePreview` before save.

## User Management Safety

- Self-protection remains visible and disables role/status/reset actions for the current account.
- Role and account status use shared badge treatment.
- Deactivate/reactivate actions now require confirmation.
- Assisted Password Reset is clearly labeled and still sends only the backend reset-link request.
- Pagination, page size 20, search filter, and role filter semantics are preserved.

## Audit and Email Operations

- Audit filters preserve action type, actor ID, affected user ID, date from, and date to behavior.
- Sensitive actions are highlighted: score override, bulk announcement, announcement, document review finalized, user role update, user deactivated, and period closed.
- Email operations preserve notification type, status, recipient email, date filters, pagination, summary/config display, and retry behavior.
- Email status uses shared `StatusBadge`.
- Email page explicitly states templates are read-only and does not imply an edit feature.
- Empty and error states are clearer and action-oriented.

## Behavior Preservation

- Super admin routes remain protected through the existing route system.
- `listUsers`, `updateUserRole`, `deactivateUser`, `reactivateUser`, and `sendAdminPasswordResetLink` are still used with the same payloads.
- `listPeriods`, `createPeriod`, `updatePeriod`, and `closePeriod` are still used with the same payload shapes.
- `threshold_n` empty string still maps to `null`.
- `getAdminAuditLogs` keeps the same query params.
- `getAdminEmailNotifications` keeps the same query params.
- Staff profile still uses `getMyProfile` and `updateMyProfile`, including password validation and empty payload no-op behavior.
- Super admin shared recruiter access remains available for `/recruiter/applications`, `/recruiter/evaluation`, `/recruiter/candidates`, `/recruiter/documents`, `/recruiter/announcements`, `/recruiter/analytics`, and `/candidates/:id`.

## Copywriting Notes

Admin copy now uses operational and safety-oriented language such as `Admin Control Center`, `System Overview`, `Risk Alerts`, `Kelola Periode`, `Tindakan ini tidak dapat dibatalkan`, `Assisted Password Reset`, and `Email Operations`.

Warnings and destructive-action explanations use Bahasa Indonesia where clarity is highest for local operations.

## Smoke Test Result

Passed:

- `npm run build`
- `npx eslint "src/components/admin/*.jsx" "src/pages/admin/*.jsx" "src/components/StaffProfileForm.jsx" "src/components/StaffProfileSummary.jsx"`

`npm run build` completed successfully with the existing large chunk warning.

`npm run lint` was run and still fails on out-of-scope baseline files only:

- `src/App.jsx`
- `src/components/DocumentPreviewDialog.jsx`
- `src/components/DocumentUploadStep.jsx`
- `src/components/RecruitmentJourney.jsx`
- `src/components/RecruitmentPhaseCard.jsx`
- `src/components/SwotHighlightPanel.jsx`
- `src/components/ui/*`
- `src/pages/RubricConfigPage.jsx`
- `vite.config.js`

No Phase 7 admin files appear in the global lint failures.

HTTP route smoke checks against `http://127.0.0.1:5174` returned `200` and the SPA app shell for:

- `/admin/dashboard`
- `/admin/users`
- `/admin/periods`
- `/admin/audit-logs`
- `/admin/email-templates`
- `/admin/settings`
- `/admin/profile`
- `/admin/profile/edit`
- `/recruiter/applications`
- `/recruiter/evaluation`
- `/recruiter/candidates`
- `/recruiter/documents`
- `/recruiter/announcements`
- `/recruiter/analytics`
- `/candidates/1`

State-specific manual actions were not executed because no test credentials or seeded admin data were provided.

## Known Issues

- Global lint baseline still fails outside Phase 7.
- `git diff --check` global reports trailing whitespace in `frontend/public/favicon.svg`, which is outside the Phase 7 changes.
- Settings remains a placeholder until backend settings support exists.
- Full mobile/table polish remains deferred to Phase 8.
- Data-dependent states were not manually exercised: active/no active period, stats failure simulation, user role update, deactivate/reactivate, reset link send, create/update/close period, audit retry simulation, and email retry simulation.
- Announcement timestamp timezone hotfix was not handled because it remains out of scope.
- The required `code-review-graph` MCP tools were not exposed in this session, so local inspection was used after tool discovery attempts.

## Next Step Recommendation

Proceed to Phase 8: Responsive, Accessibility, QA Polish.
