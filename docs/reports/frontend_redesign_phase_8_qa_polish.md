# Frontend Redesign Phase 8 - Responsive, Accessibility, QA Polish

Date: 2026-06-02

## Summary

Phase 8 completed final QA polish across the ScreenAI Lab redesign. The work focused on safe cleanup rather than a new redesign: timestamp timezone handling, lint baseline cleanup, small accessibility improvements, dialog overflow behavior, mobile/table usability guardrails, and route smoke testing.

No auth/token behavior, route guards, candidate submission/upload workflow, recruiter evaluation payloads, announcement publish payloads, document verification payloads, admin period payloads, or database schema were changed.

## Files Changed

- `backend/routers/announcements.py`
- `frontend/public/favicon.svg`
- `frontend/src/App.jsx`
- `frontend/src/components/DocumentPreviewDialog.jsx`
- `frontend/src/components/DocumentUploadStep.jsx`
- `frontend/src/components/RecruitmentJourney.jsx`
- `frontend/src/components/RecruitmentPhaseCard.jsx`
- `frontend/src/components/SwotHighlightPanel.jsx`
- `frontend/src/components/ui/badge.jsx`
- `frontend/src/components/ui/button.jsx`
- `frontend/src/components/ui/dialog.jsx`
- `frontend/src/components/ui/tabs.jsx`
- `frontend/src/lib/candidateUx.js`
- `frontend/src/pages/RubricConfigPage.jsx`
- `frontend/vite.config.js`
- `docs/reports/frontend_redesign_phase_8_qa_polish.md`

## Responsive Polish

- `DialogContent` now has a viewport-aware max height and vertical scrolling so long dialogs remain usable on small screens.
- Data-heavy recruiter/admin/rubric tables keep safe horizontal overflow behavior from earlier phases.
- Candidate document upload and modal preview paths retain existing responsive card/dialog behavior.
- No large layout rewrite was performed; full visual device-by-device QA remains a recommended follow-up with seeded data.

## Accessibility Polish

- Added accessible labels for icon-only dialog close and Rubric actions.
- Dialog close button now has an explicit `aria-label`.
- Existing visible focus styles from shadcn/MBC tokens were preserved.
- Statuses remain text labels through shared badges, not color-only indicators.
- Confirmation dialogs remain in place for destructive actions.

## Visual Consistency Polish

- Kept MBC tokenized surfaces, Montserrat/Poppins typography, PageHeader usage, shared badge/metric/loading/empty components, and role-specific visual systems from Phases 1-7.
- Cleaned `frontend/public/favicon.svg` trailing whitespace.
- Left broad page redesigns untouched to avoid Phase 8 scope creep.

## Copywriting Polish

- Candidate timestamp display remains user-friendly through Indonesian locale formatting.
- Recruiter/admin terms remain operational: Applications, Evaluation, Audit Logs, Email Operations, Assisted Password Reset.
- Existing Bahasa Indonesia safety copy remains on candidate/admin critical flows.

## Announcement Timestamp Timezone Fix

Root cause:

- Candidate announcement timestamps could be returned from audit rows without an explicit timezone marker. JavaScript then interpreted a UTC database timestamp as local time, causing WIB users to see the UTC date/time as if it were already local.

Files changed:

- `backend/routers/announcements.py`
- `frontend/src/lib/candidateUx.js`

Backend behavior:

- `_as_utc_iso()` now treats naive audit timestamps as UTC.
- Timezone-aware timestamps are converted to UTC via `astimezone(timezone.utc)`.
- `/api/announcements/my` continues returning the same `announced_at` field, now as UTC-aware ISO.

Frontend fallback:

- `formatDateTimeId()` now treats ISO-like strings without `Z` or timezone offset as UTC before browser-local formatting.
- Timestamps with explicit `Z` or offset are formatted normally.
- No WIB hardcode was added; browser/local timezone conversion is used.

Verification:

- `2026-06-01T19:17:00Z` formats as `02 Jun 2026, 02.17` in the current Asia/Jakarta environment.
- Missing/invalid timestamps still render the empty fallback.

## Lint and Build Result

Passed:

- `npm run build`
- `npm run lint`
- `git diff --check`
- `python -m py_compile backend/routers/announcements.py`

Targeted lint passed:

- Layout/common/auth/candidate:
  `npx eslint "src/components/layout/*.jsx" "src/components/common/*.jsx" "src/pages/LoginPage.jsx" "src/pages/RegisterPage.jsx" "src/pages/ForgotPasswordPage.jsx" "src/pages/ResetPasswordPage.jsx" "src/pages/VerifyEmailPage.jsx" "src/pages/candidate/*.jsx" "src/components/candidate/*.jsx" "src/lib/candidateUx.js"`
- Recruiter/admin/shared staff:
  `npx eslint "src/pages/recruiter/*.jsx" "src/components/recruiter/*.jsx" "src/pages/CandidateDetailPage.jsx" "src/lib/navigationContext.js" "src/pages/admin/*.jsx" "src/components/admin/*.jsx" "src/components/StaffProfileForm.jsx" "src/components/StaffProfileSummary.jsx"`

Notes:

- The previous global lint baseline is now clean.
- Vite still emits the existing large chunk warning.
- No backend test suite command was discovered beyond `requirements.txt`; backend verification was limited to Python syntax compilation for the changed router.

## Route Smoke Test

HTTP route checks against `http://127.0.0.1:5174` all returned `200` with the SPA app shell:

- `/login`
- `/register`
- `/forgot-password`
- `/reset-password`
- `/verify-email`
- `/dashboard`
- `/application`
- `/application/start`
- `/documents`
- `/application/review`
- `/application/status`
- `/profile`
- `/profile/edit`
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
- `/admin/dashboard`
- `/admin/users`
- `/admin/periods`
- `/admin/audit-logs`
- `/admin/email-templates`
- `/admin/settings`
- `/admin/profile`
- `/admin/profile/edit`
- `/candidates/1`

## Manual Regression Result

Checked through compile/lint/route serving:

- Public/auth routes render through the SPA shell.
- Candidate, recruiter, admin, and shared candidate detail routes resolve.
- Announcement timestamp conversion was verified with a UTC sample timestamp.
- Candidate upload handler still calls the existing `onUpload(file)` path with the same MIME/size checks.
- Destructive dialog components still compile and keep confirmation behavior.

Not manually exercised because no credentials or seeded test states were provided:

- Candidate incomplete profile redirect.
- Candidate no-application/draft/complete-doc/correction/announced states.
- Document upload/replace with real files.
- Recruiter document review/finalize/evaluation/publish flows.
- Admin role update, deactivate/reactivate, reset link send, period create/update/close, audit/email pagination with real data.

## Remaining Known Issues

- Vite large chunk warning remains and should be handled with code splitting in a separate task.
- Settings remains a placeholder until backend settings support exists.
- Full mobile visual QA should still be performed on real devices or Playwright screenshots with authenticated fixtures.
- Data-dependent states need seeded test accounts and applications for complete E2E validation.

## Final Redesign Completion Notes

From the frontend implementation perspective, Phases 0-8 are complete: brand foundation, shared layout, shared components, auth, candidate, recruiter, super admin, and QA polish are all in place. Build and global lint now pass.

## Recommended Follow-up Tasks

- Seed test data for all candidate/recruiter/admin states.
- Add automated E2E tests for candidate submission, recruiter evaluation, announcements, and admin period/user flows.
- Add code splitting for the large Vite chunk warning.
- Implement backend-supported settings when product requirements are ready.
- Replace fallback logo assets with final official MBC Laboratory assets if needed.
