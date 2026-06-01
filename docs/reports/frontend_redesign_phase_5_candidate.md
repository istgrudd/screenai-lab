# Frontend Redesign Phase 5 - Candidate Experience Redesign

## Summary

Phase 5 redesigned the candidate-facing journey around one clear next action, document readiness, correction awareness, and final status clarity. The candidate pages now use the Phase 1-3 MBC brand foundation, shared layout header, shared badges/loading/empty states, and new candidate-specific presentation components.

The work is visual/UX focused. Backend API helpers, route guards, candidate profile guard behavior, upload validation, document phase gating, correction replacement rules, and submit validation were preserved.

## Files Changed

- `frontend/src/lib/candidateUx.js`
- `frontend/src/components/candidate/CandidateStatusHero.jsx`
- `frontend/src/components/candidate/ApplicationProgressCard.jsx`
- `frontend/src/components/candidate/DocumentRequirementCard.jsx`
- `frontend/src/components/candidate/CandidateApplicationStepTrack.jsx`
- `frontend/src/components/candidate/CandidateNextActionCard.jsx`
- `frontend/src/components/candidate/DivisionSelection.jsx`
- `frontend/src/pages/candidate/DashboardPage.jsx`
- `frontend/src/pages/candidate/ApplicationOverviewPage.jsx`
- `frontend/src/pages/candidate/StartApplicationPage.jsx`
- `frontend/src/pages/candidate/DocumentsPage.jsx`
- `frontend/src/pages/candidate/ReviewPage.jsx`
- `frontend/src/pages/candidate/ApplicationStatusPage.jsx`
- `frontend/src/pages/candidate/ProfilePage.jsx`
- `frontend/src/pages/candidate/EditProfilePage.jsx`
- `docs/reports/frontend_redesign_phase_5_candidate.md`

## Components Added or Updated

- `CandidateStatusHero`: main candidate hero for dashboard/status. It shows current status, primary next action, document count, division, and phase/deadline context when available. It is safe for null application, active period, and announcement.
- `ApplicationProgressCard`: document completeness and submit readiness card. It keeps completeness based on existing required document presence rules.
- `DocumentRequirementCard`: visual requirement card for missing/uploaded/verified/rejected document states, including reviewer notes for rejected documents.
- `CandidateApplicationStepTrack`: candidate flow/status tracker built on shared `StepTrack`.
- `CandidateNextActionCard`: compact one-CTA card for overview/dashboard contexts.
- `DivisionSelection`: copy and visual styling aligned with MBC brand; selection behavior unchanged.
- `candidateUx.js`: candidate-only UI helpers for next-action copy, status copy, deadline text, document status display, and formatting.

## Pages Redesigned

- `DashboardPage`: PageHeader, status hero, candidate step track, progress card, document requirement checklist, and announcement card.
- `ApplicationOverviewPage`: PageHeader, next action card, profile summary, application summary, and progress card.
- `StartApplicationPage`: PageHeader, application step track, phase-aware period context, branded division selection, and clearer disabled state outside submission.
- `DocumentsPage`: PageHeader, step track, progress card, requirement cards, correction warning, phase warning, preserved `DocumentUploadStep`, and preview dialog for existing docs.
- `ReviewPage`: PageHeader, step track, readiness checklist, profile/document summaries, confirmation checklist, and `ConfirmActionDialog` for final submit.
- `ApplicationStatusPage`: PageHeader, status hero, status step track, reference ID block, correction document section, announcement result card, and waiting state.
- `ProfilePage`: PageHeader, status badge, profile/application summaries, and MBC card styling.
- `EditProfilePage`: PageHeader, required-field warning, locked-field explanation, and aligned form container.

## Behavior Preservation

- `CandidateProfileGuard` was not changed.
- Required profile fields and missing-field redirect behavior were not changed.
- Start application still uses `getMyProfile`, `getActivePeriod`, `getMyApplication`, and `createApplication` with the same payload.
- Division selection remains disabled after an application exists.
- Document upload still uses `DocumentUploadStep` and `uploadApplicationDocument`.
- Draft upload is still gated by `SUBMISSION`.
- Correction mode still allows only rejected documents to be replaced.
- Verified documents remain visually locked.
- Server-provided document limits remain passed into `DocumentUploadStep`.
- Review submit still requires all acknowledgements, all required docs, complete profile, and `SUBMISSION`.
- Submit still calls `submitApplication(application.id)` and navigates replace to status.
- Status/announcement loading remains non-fatal for missing announcement.
- Profile update still delegates to `CandidateProfileForm`.
- Backend API functions, auth/token behavior, route definitions, `ProtectedRoute`, and `CandidateProfileGuard` were not changed.

## Candidate Next Action Logic

- No application: `Mulai Pendaftaran` to `/application/start`.
- Draft with missing documents: `Lanjut Unggah Dokumen` to `/documents`.
- Draft with all required documents present: `Tinjau & Kirim Pendaftaran` to `/application/review`.
- Submitted, document review, verified, screening, evaluated: `Lihat Status Pendaftaran` to `/application/status`.
- Correction requested: `Perbaiki Dokumen` to `/documents`.
- Announced pass/fail: `Cek Pengumuman` to `/application/status`.

## Copywriting Notes

Candidate-facing page copy was standardized toward Bahasa Indonesia with action-oriented labels such as `Mulai Pendaftaran`, `Lanjut Unggah Dokumen`, `Tinjau & Kirim Pendaftaran`, `Status Seleksi`, `Perlu Revisi`, `Terverifikasi`, and `Cek Pengumuman`.

Technical terms such as email, password, preview, and Reference ID were kept only where they are already natural in the product context.

## Smoke Test Result

- `npm run build`: passed.
- Build warning remains: one JavaScript chunk is larger than 500 kB after minification.
- `npm run lint`: failed with existing baseline errors outside Phase 5. Current output: 37 problems, 30 errors and 7 warnings.
- Targeted Phase 5 lint:

```bash
npx eslint "src/components/candidate/*.jsx" "src/pages/candidate/*.jsx" "src/lib/candidateUx.js"
```

Result: passed.

- HTTP route smoke test against Vite dev server at `http://127.0.0.1:5174`: all returned 200.
  - `/dashboard`
  - `/application`
  - `/application/start`
  - `/documents`
  - `/application/review`
  - `/application/status`
  - `/profile`
  - `/profile/edit`

Browser/in-app visual walkthrough was not completed because Browser-specific tooling was not exposed in this session. No test credentials or seeded candidate states were available, so state-specific manual checks were limited to compile, lint, and route serving.

## Known Issues

- Global lint baseline still fails outside Phase 5, including existing React compiler hook warnings, fast-refresh export warnings, unused variables in non-candidate files, and `vite.config.js` `__dirname`.
- Candidate state variants that require backend data were not manually verified: no application, draft with missing docs, draft complete docs, correction requested, announced pass, announced fail, no active period, active submission, and non-submission phase.
- Mobile polish was improved through responsive grids and vertical step tracks, but full visual QA remains deferred to Phase 8.
- Recruiter/admin redesign was not performed.
- Recruiter Evaluation blocking state remains Phase 6.
- Context-aware back navigation for CandidateDetail/Evaluation remains Phase 6.

## Next Step Recommendation

Proceed to Phase 6: Recruiter Workspace Redesign.
