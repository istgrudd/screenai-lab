# Phase 1 Candidate Frontend Features Implementation Report

## Implementation Metadata

| Item | Value |
|---|---|
| Implementation date | 2026-05-28 |
| Branch | `frontend/candidate` |
| Phase | Phase 1 - Candidate Frontend Information Architecture Refactor |
| Type | Frontend-only |
| Source commits reviewed | `135706f` (`feat: add candidate profile management and application process`), `972398c` (`feat: localize application status and recruitment journey labels to Indonesian`) |

## Summary

Phase 1 reorganized the candidate portal into a clearer application workflow without changing backend contracts. The candidate sidebar now exposes the main workspaces only: Dashboard, Application Overview, Documents, Application Status, and Profile. The old overlapping Review, Submitted, and Result navigation concepts were removed from the primary navigation and preserved through redirects or compatibility exports.

Completed work:

- Split profile viewing and editing into `/profile` and `/profile/edit`.
- Moved division selection into `/application/start`.
- Added `/application` as the candidate application overview and next-action hub.
- Kept `/documents` as a guided upload workflow for the required documents.
- Kept `/application/review` as the final review-and-submit step, reachable through workflow CTAs rather than permanent sidebar navigation.
- Added `/application/status` as the unified status/result page.
- Preserved legacy route behavior for `/review`, `/submitted`, and `/result`.
- Added shared candidate application helpers for document completeness, status labels, reference IDs, and next-action routing.
- Localized candidate journey/status labels for the submitted, AI evaluation, and announcement stages.

## Files Changed

```text
frontend/src/App.jsx
frontend/src/components/RecruitmentJourney.jsx
frontend/src/components/candidate/CandidateProfileForm.jsx
frontend/src/components/candidate/DivisionSelection.jsx
frontend/src/lib/candidateApplication.js
frontend/src/pages/candidate/ApplicationOverviewPage.jsx
frontend/src/pages/candidate/ApplicationStatusPage.jsx
frontend/src/pages/candidate/DashboardPage.jsx
frontend/src/pages/candidate/DocumentsPage.jsx
frontend/src/pages/candidate/EditProfilePage.jsx
frontend/src/pages/candidate/ProfilePage.jsx
frontend/src/pages/candidate/ResultPage.jsx
frontend/src/pages/candidate/ReviewPage.jsx
frontend/src/pages/candidate/StartApplicationPage.jsx
frontend/src/pages/candidate/SubmittedPage.jsx
```

No backend files or backend API contracts were changed in this phase.

## Routes Added or Changed

| Route | Result |
|---|---|
| `/dashboard` | Candidate home with current application context and next actions. |
| `/profile` | Read-only candidate profile summary. |
| `/profile/edit` | Candidate profile edit form with post-submit field locking. |
| `/application` | Application overview, document completeness, and next-action CTA. |
| `/application/start` | Division selection and draft application start. |
| `/documents` | Required document upload wizard. |
| `/application/review` | Final review and submit step. |
| `/application/status` | Unified status/result page. |
| `/review` | Legacy redirect: draft applications go to `/application/review`; submitted or missing/error cases go to the appropriate application route. |
| `/submitted` | Redirects to `/application/status`. |
| `/result` | Redirects to `/application/status`. |
| `/my-applications` | Still accessible, but removed from the main candidate sidebar. |
| `/upload` | Kept as legacy candidate-only upload route outside the main sidebar. |

Backend endpoints added or changed: none.

Existing frontend API usage retained:

```text
GET  /api/users/me
PUT  /api/users/me
POST /api/applications
GET  /api/applications/my
POST /api/applications/{application_id}/submit
GET  /api/documents/{application_id}
POST /api/documents/upload/{doc_type}
GET  /api/announcements/my
```

## Validation

| Command | Result |
|---|---|
| `cd frontend && npm run build` | Passed on 2026-05-28. Vite built successfully in 1.57s. |

Build note:

- Vite reported a non-blocking warning that the generated JS chunk is larger than 500 kB after minification. This does not fail the build, but can be revisited later with code splitting.

## Manual Checklist

The route and workflow checklist was statically verified from the router and candidate page implementations. A full authenticated browser walkthrough was not executed in this reporting pass because it requires a running backend session and candidate test account.

| Checklist Item | Result |
|---|---|
| Candidate can open dashboard. | Verified by `/dashboard` candidate protected route and build. |
| Candidate can open profile summary. | Verified by `/profile` route and `ProfilePage`. |
| Candidate can edit profile. | Verified by `/profile/edit` route and `CandidateProfileForm`. |
| Candidate can start application. | Verified by `/application/start` route and `createApplication` flow. |
| Candidate can upload documents. | Verified by `/documents` route and upload wizard flow. |
| Candidate can open review step. | Verified by `/application/review` route and draft guard. |
| Candidate can submit application. | Verified by `ReviewPage` calling `submitApplication` and navigating to `/application/status`. |
| Candidate can view status/result through `/application/status`. | Verified by `ApplicationStatusPage` and unified status/result rendering. |
| Old `/review`, `/submitted`, and `/result` do not break. | Verified by router redirects and compatibility exports. |

## Known Limitations and Follow-Up Notes

- This phase intentionally does not change backend submission, evaluation, document review, or announcement behavior.
- The current frontend status labels still map the existing statuses used before later workflow phases: `draft`, `submitted`, `screening`, `announced_pass`, and `announced_fail`.
- Future phases will need to extend these helpers and UI states for `document_review`, `correction_requested`, `verified`, and `cancelled`.
- Full end-to-end manual acceptance should still be run with an authenticated candidate account before marking the UX checklist as browser-verified.
