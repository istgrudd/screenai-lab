# Admin Password Reset Link Adjustment Report

## Implementation Date

2026-06-01

## Branch

fullstack/audit-log

## Adjustment Name

Admin Password Reset Link Adjustment

## Background / Problem

The previous super-admin reset flow let an admin choose a user's new password. That meant the admin could know or transmit a user's credential, which is not appropriate for a privacy-sensitive recovery flow.

## Goal

Super admins should only trigger a password recovery email. The target user must set their own new password through the existing reset-password page and one-time reset code flow.

## Completed Work

- Added a new super-admin endpoint for sending password reset links.
- Deprecated the legacy direct admin-set-password endpoint with `410 Gone`.
- Reused the existing one-time password reset service and email template.
- Added an audit log entry for admin-triggered recovery email requests.
- Removed the frontend password prompt.
- Updated the admin users table action to send a reset link after confirmation.
- Added a focused smoke test for the adjustment.
- Updated token invalidation smoke coverage for the new flow.

## Files Changed

- `backend/routers/auth.py`
- `frontend/src/lib/api.js`
- `frontend/src/pages/admin/AdminPage.jsx`
- `scripts/smoke_test_admin_password_reset_link.py`
- `scripts/smoke_test_token_invalidation.py`
- `docs/reports/admin_password_reset_link_adjustment.md`

## Backend Changes

- Added:

```text
POST /api/auth/admin/users/{user_id}/send-password-reset
```

- The endpoint is super-admin only.
- The endpoint accepts no password in the body.
- The target user must exist and be active.
- The endpoint uses `create_and_send_password_reset(db, target)` from the existing password reset service.
- The transaction is committed only after the reset email flow succeeds and the audit row is added.
- Email send failure rolls back the reset link record.
- The legacy `POST /api/auth/admin/reset-password` endpoint now returns `410 Gone` and cannot mutate `password_hash`.

## Frontend Changes

- Replaced `adminResetPassword(userId, newPassword)` with `sendAdminPasswordResetLink(userId)`.
- Updated the admin user table action:
  - label: `Send reset link`;
  - tooltip: `Send a password reset link to this user`;
  - confirmation via `window.confirm`;
  - no password input;
  - success toast says the reset link was sent.

## Endpoint Behavior

New endpoint:

```text
POST /api/auth/admin/users/{user_id}/send-password-reset
```

Access:

- `super_admin`: allowed.
- `recruiter`: `403`.
- `candidate`: `403`.

Failure behavior:

- Missing target user: `404`.
- Deactivated target user: `409`.
- Email provider failure: `503` with rollback.

Response behavior:

- Returns `{ success, data, error }`.
- Does not return reset code, reset URL, raw token, hash, password, or secret.
- Password is not changed until the user completes `POST /api/auth/reset-password`.

## Security / Privacy Notes

- Super admins can no longer choose or know a user's password.
- No temporary password is generated.
- No password is emailed.
- No reset code/link/secret is returned by the admin endpoint.
- Existing token invalidation remains tied to completion of `reset_password_with_code()`.
- Legacy direct admin-set-password is no longer a usable mutation path.

## Audit Log Behavior

The new endpoint writes:

```text
action_type = admin_password_reset_requested
recruiter_id = super admin user id
candidate_id = target user id
old_value = null
new_value = account_recovery_email_sent
reason = admin_initiated_account_recovery_email
```

The audit text fields intentionally avoid reset URLs, codes, tokens, secrets, passwords, hashes, and stack traces.

## Smoke Test Results

- `python -m scripts.smoke_test_admin_password_reset_link`: passed.
- `python -m scripts.smoke_test_forgot_password`: passed.
- `python -m scripts.smoke_test_token_invalidation`: passed.
- `python -m scripts.smoke_test_audit_logs`: passed.
- `python -m compileall backend scripts`: passed.

## Frontend Validation Results

- `cd frontend && npm run build`: passed.
- Vite emitted the existing large chunk-size warning.

## Known Limitations / Follow-up Notes

- No dedicated admin password reset email template was added; the flow reuses the existing password reset email.
- No custom modal was added; the admin page uses `window.confirm()` for this small adjustment.
- Admins cannot see the reset link/token by design.
- No separate admin-triggered resend cooldown was added beyond the existing service behavior.

## Phase 11 Readiness

This adjustment makes Phase 11 safer to begin because password recovery now consistently uses the email/reset-link lifecycle instead of admin-known credentials.
