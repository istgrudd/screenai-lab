# Frontend Redesign Phase 4 - Auth Pages Redesign

Date: 2026-06-02

## Summary

Phase 4 redesigns the public/auth first impression around MBC Laboratory branding. A reusable `AuthLayout` now provides a desktop split view with a branded hero panel and a focused form card, while mobile collapses into a single-column auth experience.

The work stays scoped to auth/public pages. AppShell, role dashboards, guards, API helpers, token storage, and role redirects were not redesigned or refactored.

## Files Changed

- `frontend/src/components/layout/AuthLayout.jsx`
- `frontend/src/pages/LoginPage.jsx`
- `frontend/src/pages/RegisterPage.jsx`
- `frontend/src/pages/ForgotPasswordPage.jsx`
- `frontend/src/pages/ResetPasswordPage.jsx`
- `frontend/src/pages/VerifyEmailPage.jsx`
- `docs/reports/frontend_redesign_phase_4_auth.md`

## Components Added

### AuthLayout

`AuthLayout` is a reusable auth shell for Login, Register, Forgot Password, Reset Password, and Verify Email pages. It provides:

- desktop split layout with an MBC Laboratory hero side
- mobile single-column layout
- MBC logo via `MbcLogo`
- MBC brand gradient, tonal layering, glass surfaces, and ambient/navy shadow
- form/content card with title, description, eyebrow, children, optional side content, and optional footer
- no API calls or auth logic

## Pages Redesigned

- `LoginPage`: migrated from generic centered card to the branded portal login experience, with Indonesian copy, MBC hero, forgot password link, password visibility toggle, and clearer unverified-email recovery block.
- `RegisterPage`: migrated to the shared auth layout, grouped fields into candidate identity, contact/account, and academic sections, added password visibility toggle, and made the post-registration verification state feel more official.
- `ForgotPasswordPage`: migrated to the shared auth layout with enumeration-safe success messaging, a calmer success state, and a clear login return action.
- `ResetPasswordPage`: migrated to the shared auth layout, added visibility toggles for both password fields, and improved missing/invalid/expired/used code states.
- `VerifyEmailPage`: migrated to the shared auth layout with clearer loading, success, failure, and resend states while preserving duplicate request prevention.

## Behavior Preservation

- Login still calls `loginApi(trimmedEmail, password)`.
- Login still saves `data.access_token` with `saveToken`.
- Login and authenticated auth-page redirects still use `defaultPathForRole`.
- `EMAIL_NOT_VERIFIED` still uses `getApiErrorCode(err) === "EMAIL_NOT_VERIFIED"` and exposes resend verification.
- Register still sends the same `registerApi` payload fields: email, password, fullName, nim, faculty, major, year.
- Register still enforces required fields, existing `NIM_PATTERN`, password minimum length, and year validation.
- Register success still sets `registrationResult`, clears password, and supports resend verification.
- Forgot password still calls `forgotPassword(trimmedEmail)` and keeps the generic success message to avoid account enumeration.
- Reset password still parses `code` from the URL, calls `resetPassword(code, newPassword)`, validates password length/match, and calls `removeToken()` after success.
- Verify email still uses `verifyEmailOnce(code)` to prevent duplicate verification requests and still calls `verifyEmail`, `resendVerification`, `getApiErrorCode`, and `getApiErrorMessage`.

## Copywriting Notes

Candidate-facing copy was moved toward Bahasa Indonesia across the auth pages while keeping natural terms like email, password, login, and portal.

The NIM helper copy was made neutral: `Masukkan NIM numerik sesuai data akademik.` The validation logic itself was not changed and remains `^\d{10,}$`.

Some toast fallback strings were localized, but API payloads, state transitions, and redirect/token behavior were preserved.

## Smoke Test Result

### Build

Command:

```bash
npm run build
```

Result: Passed.

Notes:

- Vite build completed successfully.
- Existing large JS chunk-size warning remains.

### Global Lint

Command:

```bash
npm run lint
```

Result: Failed with existing baseline lint issues.

Summary:

- 39 problems total: 32 errors and 7 warnings.
- Failures are in existing non-Phase 4 files such as `App.jsx`, document/recruiter/admin pages, shadcn UI exports, and `vite.config.js`.
- No Phase 4 auth files appeared in the global lint error list.

### Targeted Phase 4 Lint

Command:

```bash
npx eslint \
  "src/components/layout/AuthLayout.jsx" \
  "src/pages/LoginPage.jsx" \
  "src/pages/RegisterPage.jsx" \
  "src/pages/ForgotPasswordPage.jsx" \
  "src/pages/ResetPasswordPage.jsx" \
  "src/pages/VerifyEmailPage.jsx"
```

Result: Passed.

### Manual Route Check

In-app Browser was unavailable in this session, so route smoke testing used HTTP checks against the running Vite dev server at `http://127.0.0.1:5173`.

Results:

- `GET /login` returned 200.
- `GET /register` returned 200.
- `GET /forgot-password` returned 200.
- `GET /reset-password` returned 200.
- `GET /verify-email` returned 200.

Full credential-based login/register/reset/verify flows were not executed because no test credentials or backend test data were provided.

## Known Issues

- Global lint baseline still fails outside Phase 4.
- Official final logo assets are still pending if `frontend/src/assets/brand/` only contains placeholders; `MbcLogo` falls back safely until final files are added.
- Candidate, recruiter, and admin page-level redesign remains deferred.
- Data-heavy tables, mobile table treatment, and role dashboard polish remain out of scope for Phase 4.
- No credential-backed auth flow walkthrough was performed in this session.

## Next Step Recommendation

Proceed to Phase 5: Candidate Experience Redesign.
