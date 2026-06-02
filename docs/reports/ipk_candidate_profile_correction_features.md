# IPK Candidate Profile Correction Features Implementation Report

## Implementation Date

2026-06-02

## Branch

backend/ipk

## Feature Name

Candidate IPK Profile Field and KHS Correction Unlock

## Summary

Implemented candidate-owned `ipk` as a profile field outside registration. IPK is optional for registration/login, required before final application submit, locked after submit, and reopened only when the candidate is in `correction_requested` because the KHS document was rejected.

## Completed Work

- Added nullable `users.ipk` database column and Alembic migration.
- Added `ipk` to auth/user/admin/profile responses.
- Added backend IPK validation for numeric `0.00` through `4.00` with at most 2 decimals.
- Required IPK for `POST /api/applications/{application_id}/submit`.
- Added backend `ipk_editable` source-of-truth for `GET/PUT /api/users/me`.
- Kept registration request and register frontend unchanged.
- Added candidate profile display/edit/review UI for IPK.
- Added recruiter-visible IPK in application list and candidate detail profile.
- Added/updated smoke tests for profile completion and KHS correction behavior.
- Updated API reference.

## Files Changed

- `backend/models/user.py`
- `backend/alembic/versions/f2a4b6c8d9e0_add_ipk_to_users.py`
- `backend/routers/auth.py`
- `backend/routers/users.py`
- `backend/routers/applications.py`
- `backend/routers/candidates.py`
- `frontend/src/lib/candidateApplication.js`
- `frontend/src/pages/candidate/ProfilePage.jsx`
- `frontend/src/pages/candidate/EditProfilePage.jsx`
- `frontend/src/pages/candidate/ReviewPage.jsx`
- `frontend/src/pages/candidate/ApplicationOverviewPage.jsx`
- `frontend/src/components/candidate/CandidateProfileForm.jsx`
- `frontend/src/components/recruiter/ApplicationsTable.jsx`
- `frontend/src/pages/CandidateDetailPage.jsx`
- `scripts/smoke_test_candidate_profile_completion.py`
- `scripts/smoke_test_candidate_ipk_correction.py`
- `docs/API_REFERENCE.md`
- `docs/reports/ipk_candidate_profile_correction_features.md`

## Backend Changes

- `User.ipk` is nullable so candidates can register/login before filling IPK and staff users do not need a value.
- `ProfileUpdate.ipk` accepts empty/null before final submit and validates non-empty values.
- `GET /api/users/me` and `PUT /api/users/me` return `ipk_editable`.
- IPK editability:
  - no application: editable;
  - `draft`: editable;
  - `correction_requested`: editable only if KHS is rejected;
  - all other statuses: locked.
- NIM, faculty, major, and year remain locked in `correction_requested`.
- Recruiter/admin views can read IPK but cannot mutate it.

## Frontend Changes

- Candidate profile and application overview show IPK as a two-decimal value or `-`.
- Edit Profile adds an IPK input with decimal validation and backend-driven lock state.
- Review checklist treats IPK as a required profile field before submit.
- Register page remains unchanged and does not request IPK.
- Recruiter application table and candidate detail reveal include IPK.

## API / Endpoint Changes

- `POST /api/auth/register`: no IPK field added.
- `GET /api/auth/me` and login `data.user`: include `ipk`.
- `GET /api/users/me`: includes `ipk` and `ipk_editable`.
- `PUT /api/users/me`: accepts candidate `ipk`.
- `POST /api/applications/{application_id}/submit`: rejects missing IPK via `missing_fields`.

## Smoke Test Results

- `python -m compileall backend scripts`: passed.
- `python -m scripts.smoke_test_candidate_profile_completion`: passed.
- `python -m scripts.smoke_test_candidate_ipk_correction`: passed.
- `cd frontend && npm run build`: passed; Vite emitted the existing large chunk warning.

## Manual Checklist

- Candidate can register and login without IPK.
- Candidate can fill IPK from Edit Profile.
- Candidate cannot final-submit without IPK.
- IPK locks after final submit.
- KHS rejection in `correction_requested` unlocks only IPK.
- Non-KHS correction keeps IPK locked.
- NIM/faculty/major/year stay locked during correction.
- Recruiter can see but not edit IPK.

## Known Limitations / Follow-up Notes

- Browser-level visual QA was attempted, but the in-app Browser plugin had no available browser instances in this session. Local Vite `/profile` returned `200 OK`; frontend validation is covered through build and backend smoke tests remain the source of truth.
- IPK is stored as `Float` for simple JSON compatibility as requested; validation enforces range and decimal precision at API boundary.
