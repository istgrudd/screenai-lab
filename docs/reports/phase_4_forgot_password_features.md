# Phase 4 Forgot Password and Session Invalidation Implementation Report

## Implementation Metadata
| Item | Value |
|---|---|
| Implementation date | 2026-05-29 |
| Branch | `backend/forgot-password` |
| Phase | Phase 4 - Forgot Password and Session Invalidation |
| Type | Backend-first |

## Summary
- Added self-service forgot password with generic responses.
- Reset password link/code is one-time and expiring.
- Reset secrets are stored as HMAC-SHA256 hashes, not plaintext.
- Password reset updates `password_changed_at`.
- JWTs issued before password change are rejected.
- Admin reset password now invalidates old sessions for the target user.
- Authenticated profile password changes also update `password_changed_at`.

## Files Changed
```text
.env.example
backend/alembic/versions/c8a7f4d2e9b1_password_reset.py
backend/config.py
backend/middleware/auth_middleware.py
backend/models/__init__.py
backend/models/password_reset.py
backend/models/user.py
backend/routers/auth.py
backend/routers/users.py
backend/services/auth_service.py
backend/services/email_templates.py
backend/services/password_reset_service.py
docs/API_REFERENCE.md
docs/ARCHITECTURE.md
docs/FLOW_DIAGRAMS.md
docs/ISSUES_AND_NOTES.md
docs/MODULE_ANALYSIS.md
docs/reports/phase_4_forgot_password_features.md
scripts/smoke_test_forgot_password.py
scripts/smoke_test_token_invalidation.py
```

## Models and Migrations
- Added `users.password_changed_at`.
- Added `password_reset_links` with `user_id`, `link_secret_hash`, `expires_at`, `used_at`, `created_at`, and `sent_to_email`.
- Existing users keep `password_changed_at = NULL`, so existing tokens remain valid until that user's password is changed.
- `link_secret_hash` is unique and indexed; `expires_at` and `user_id` are indexed.

## Environment Variables Added
```text
PASSWORD_RESET_EXPIRE_MINUTES=
PASSWORD_RESET_COOLDOWN_SECONDS=
```

## Endpoints Added or Changed
| Endpoint | Result |
|---|---|
| `POST /api/auth/forgot-password` | Added |
| `POST /api/auth/reset-password` | Added |
| `POST /api/auth/admin/reset-password` | Changed |
| `PUT /api/users/me` password update | Changed |
| auth middleware/JWT validation | Changed |

## Validation
| Command | Result |
|---|---|
| `python -m compileall backend scripts` | Passed |
| `python -m scripts.smoke_test_forgot_password` | Passed |
| `python -m scripts.smoke_test_token_invalidation` | Passed |
| `python -m scripts.smoke_test_auth` | Passed |
| `python -m scripts.smoke_test_email_verification` | Passed |

## Manual Checklist
- Forgot password response is generic.
- Unknown email does not leak account existence.
- Inactive user does not leak account existence.
- Invalid/expired/used reset code fails.
- Valid reset code changes password.
- Reset password does not return an access token.
- Old password fails after reset.
- New password works.
- Old JWT fails after reset.
- Admin reset invalidates old JWT.
- Profile password change invalidates the previous JWT.
- Forgot password does not verify unverified candidate email.
- Email disabled/test mode does not send real email.

## Known Limitations and Follow-Up Notes
- Frontend forgot/reset pages are not implemented yet; that is Phase 5.
- Email templates are still hardcoded.
- Email delivery is disabled/mocked in smoke tests.
