# Batch 3 Validation & Hardening — Report

> Date: 2026-05-10
> Branch: `lab/setup`
> Scope: ISSUES_AND_NOTES.md §4 (validation/error handling), §3 (DB-level uniqueness), and §4 (password reset workaround)

---

## Summary

| # | Issue | Files | Status |
|---|---|---|---|
| 1 | `evaluate_batch` leaked raw `ValueError` text via 422 | [backend/routers/evaluate_batch.py](../../backend/routers/evaluate_batch.py) | Fixed |
| 2 | Composite score formula assumed weights sum to 1.0 with no guard | [backend/services/scoring.py](../../backend/services/scoring.py), [backend/services/evaluation_service.py](../../backend/services/evaluation_service.py), [backend/routers/candidates.py](../../backend/routers/candidates.py) | Fixed |
| 3 | No DB-level uniqueness for `is_active = True` periods | [backend/alembic/versions/15e1fb0f5fe3_partial_unique_active_period.py](../../backend/alembic/versions/15e1fb0f5fe3_partial_unique_active_period.py) (NEW) | Fixed (Postgres only) |
| 4 | No password-reset workaround when a user forgets their password | [backend/routers/auth.py](../../backend/routers/auth.py), [frontend/src/lib/api.js](../../frontend/src/lib/api.js), [frontend/src/pages/admin/AdminPage.jsx](../../frontend/src/pages/admin/AdminPage.jsx) | Fixed (admin-assisted, Phase-2 stop-gap) |

---

## Fix 1 — `evaluate_batch` raw exception leak

### Change
[backend/routers/evaluate_batch.py:11-14](../../backend/routers/evaluate_batch.py#L11) — added `import logging`. [evaluate_batch.py:31-37](../../backend/routers/evaluate_batch.py#L31) — module-level logger plus a single sanitized error string:

```python
_SANITIZED_ERROR = (
    "Evaluation failed due to an internal error. "
    "Please contact the administrator."
)
```

[evaluate_batch.py:75-118](../../backend/routers/evaluate_batch.py#L75) — error chain now reads:

1. `except ValueError`:
   - "no dimensions configured" → 400 (existing).
   - "no rubric found" → 404 (existing).
   - "rubric weights must sum" → 400 (NEW; surfaces Fix 2 cleanly with the original message).
   - **Else** → log full detail server-side with `exc_info=True`, raise 500 with `_SANITIZED_ERROR`. (Was: 422 with raw exception text — the leak.)
2. `except HTTPException: raise` — passes through any `HTTPException` we just raised so the catch-all does not double-wrap them into 500.
3. `except Exception` (catch-all, last) — log + 500 sanitized.

### Verification
- `smoke_test_evaluation` passes; the documented 400/404 paths still return their original messages (`error message mentions 'no dimensions'` check still passes).
- Static review: catch-all `except Exception` is positioned last; the intermediate `except HTTPException: raise` ensures known errors are not swallowed.
- Internal exception text now never reaches the client for unrecognized paths — only the sanitized string + the server log carries the full trace.

---

## Fix 2 — Composite score weight assertion

### Change
[backend/services/scoring.py:14-30](../../backend/services/scoring.py#L14) — new helper:

```python
def validate_rubric_weights(rubric: Rubric) -> None:
    total_weight = sum(d.weight for d in rubric.dimensions)
    if not (0.99 <= total_weight <= 1.01):
        raise ValueError(f"Rubric weights must sum to 1.0, got {total_weight}")
```

The ±0.01 tolerance matches the existing rubric-CRUD validation rule ([rubrics.py:88](../../backend/routers/rubrics.py#L88)) so a rubric created through the UI will always pass.

Wiring:
- [backend/services/evaluation_service.py:78](../../backend/services/evaluation_service.py#L78) — invoked in `run_evaluation_pipeline` immediately after the empty-dimensions guard, *before* any per-application work begins.
- [backend/routers/candidates.py:262-272](../../backend/routers/candidates.py#L262) — invoked in `override_score` *before* mutating any score record. A malformed rubric raises `ValueError` → mapped to `HTTPException(400)` so the recruiter sees the same Bahasa-friendly message instead of a 500.

The evaluation path already lifts known `ValueError` shapes to 400 via the new "rubric weights must sum" mapping in Fix 1 — so the surface area for both call sites is consistent.

### Verification
- `smoke_test_evaluation` still passes (the seeded division rubric has no dimensions, so the empty-dimension 400 fires before the new weight check is reached — confirming Fix 1's chain ordering is correct).
- A future rubric with valid (sum=1.0) dimensions falls through cleanly; a rubric whose weights sum to e.g. 100 raises `ValueError` and is now caught with a clear 400 instead of producing an off-scale composite.

---

## Fix 3 — DB-level uniqueness for `is_active = True`

### Change
New migration: [backend/alembic/versions/15e1fb0f5fe3_partial_unique_active_period.py](../../backend/alembic/versions/15e1fb0f5fe3_partial_unique_active_period.py).

Generated via `alembic revision -m "partial_unique_active_period"` (filename `15e1fb0f5fe3_partial_unique_active_period.py`); upgrade/downgrade hand-written so the index is created only on PostgreSQL:

```python
_INDEX_NAME = "uq_one_active_period"

def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.execute(
        f"CREATE UNIQUE INDEX IF NOT EXISTS {_INDEX_NAME} "
        f"ON recruitment_periods (is_active) WHERE is_active = true"
    )

def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.execute(f"DROP INDEX IF EXISTS {_INDEX_NAME}")
```

The module docstring documents:
- Why partial unique (allows unbounded inactive rows; permits at most one active row).
- Why Postgres-only (SQLite would reject the index because existing inactive rows duplicate `is_active = FALSE`; the application-level `_deactivate_others` guard continues to enforce the invariant on dev SQLite).

### Verification
- `alembic upgrade head` runs cleanly: `0543acf1450b -> 15e1fb0f5fe3, partial_unique_active_period` applied as a no-op on the SQLite dev DB.
- All four pre-existing period-touching smoke flows (auth, applications, periods, phase enforcement) keep passing on dev.
- On Postgres deploy, the migration will create the partial unique index and any concurrent insert of a second active period will be rejected at the DB level. The race window described in `docs/ISSUES_AND_NOTES.md §3` is closed.

---

## Fix 4 — Admin-assisted password reset

### Backend
[backend/routers/auth.py:14](../../backend/routers/auth.py#L14) — imports `require_role`. [auth.py:65-75](../../backend/routers/auth.py#L65) — new request schema:

```python
class AdminResetPasswordRequest(BaseModel):
    user_id: int
    new_password: str = Field(..., min_length=8, max_length=72)
```

(Min 8 / max 72 mirrors the candidate-register `RegisterRequest.password` rule and respects bcrypt's 72-byte ceiling.)

[auth.py:202-235](../../backend/routers/auth.py#L202) — new endpoint:

```python
@router.post(
    "/admin/reset-password",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))],
)
def admin_reset_password(payload: AdminResetPasswordRequest, db: Session = Depends(get_db)):
    target = db.query(User).filter(User.id == payload.user_id).first()
    if not target:
        raise HTTPException(404, "User not found")
    target.password_hash = hash_password(payload.new_password)
    db.commit()
    db.refresh(target)
    return {"success": True, "data": {...}, "error": None}
```

The role guard sits in the route's `dependencies=[...]` list; `require_role(UserRole.SUPER_ADMIN)` is the same factory used by the existing super-admin user-management endpoints, so the access contract is identical.

The endpoint **does not** invalidate existing JWTs — there is no token blacklist today. The next login will require the new password; existing sessions remain until their `exp`. Documented in the docstring; this aligns with the Phase-2 stop-gap framing.

### Frontend
[frontend/src/lib/api.js:248-258](../../frontend/src/lib/api.js#L248) — new helper:

```js
export async function adminResetPassword(userId, newPassword) {
  return request("/auth/admin/reset-password", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, new_password: newPassword }),
  });
}
```

[frontend/src/pages/admin/AdminPage.jsx](../../frontend/src/pages/admin/AdminPage.jsx) — added the `KeyRound` icon import, the API import, a `handleResetPassword(user)` handler that prompts for the new password (8-char minimum check on the client), calls the API with optimistic feedback via Sonner, and a "Reset password" ghost button rendered next to the existing Deactivate/Reactivate action on every user row. The button is disabled while another action for that user is in flight (shared `busy` flag), matching the existing UX. Self-row reset is allowed (a super admin resetting their own password through this UI is harmless — they keep their existing JWT and re-login picks up the new hash).

### Verification
- `smoke_test_auth` passes (the public auth endpoints are unchanged; the new admin endpoint is gated behind `require_role(SUPER_ADMIN)` and not exercised by the candidate-only smoke).
- Manual reasoning: a candidate cannot hit the endpoint (returns 403 via the existing role guard); a super_admin gets 200 with `{ user_id, email, message }`; a super_admin sending a non-existent user_id gets 404; a super_admin sending a 7-char password gets 422 from the pydantic `min_length=8` validator before any DB work.

---

## Migration files generated this batch

- [backend/alembic/versions/15e1fb0f5fe3_partial_unique_active_period.py](../../backend/alembic/versions/15e1fb0f5fe3_partial_unique_active_period.py) — Fix 3.

(Batch 2's `0543acf1450b_rubric_division_enum.py` is the previous head; this batch chains on top.)

---

## Smoke-test results

| Test | Result |
|---|---|
| `smoke_test_auth` | 16/16 passed |
| `smoke_test_evaluation` | All checks passed (400 path for empty rubric verified; LLM 200 path verified; announcement read-back verified) |

---

## Side effects & follow-up notes

- **Fix 1 — error contract change:** clients that previously received a 422 with raw exception text on unknown ValueErrors will now receive a 500 with the sanitized message. This is a wire-level visible change; the only known internal caller is the frontend `evaluateBatch` helper, which surfaces `error.detail` verbatim — recruiters will see "Evaluation failed due to an internal error" instead of stack-trace-flavored text. Server logs retain the full traceback under the `evaluate_batch` logger.
- **Fix 2 — pre-existing rubric data:** the dev DB's seeded rubrics have zero dimensions, so Fix 2's check is short-circuited by the empty-dimensions 400 that runs immediately before. Real rubric data (when recruiters configure dimensions through the UI) is already validated to sum to 1.0 by [rubrics.py:88](../../backend/routers/rubrics.py#L88), so the new guard is a defense-in-depth check against direct DB writes / partial migrations.
- **Fix 3 — Postgres deploy:** the partial unique index lands the next time a Postgres instance runs `alembic upgrade head` (Railway auto-runs this on boot per [database.py::init_db](../../backend/database.py#L50)). On staging/prod, a sanity check that no two `is_active=true` rows already exist is implicit — `_deactivate_others` should have prevented that, but if a manual SQL edit ever produced two active rows, the migration would fail and require manual cleanup. Worth checking before the first Postgres deploy.
- **Fix 4 — token revocation gap:** the reset endpoint changes the stored hash, but any JWT minted before the reset is still valid until its `exp` (8 hours by default per `ACCESS_TOKEN_EXPIRE_MINUTES`). Closing this gap requires a token blacklist or a `password_changed_at` claim; both are flagged for Phase 3 in [docs/ISSUES_AND_NOTES.md §6](../ISSUES_AND_NOTES.md).
- **Fix 4 — UX caveat:** the admin UI uses `window.prompt()` for the new password. That's an intentional minimum-viable UX (no hidden password field, no confirmation, plaintext in browser memory). A polished modal with a confirm field is Phase 3 follow-up; the task scope explicitly framed this as a stop-gap.
- **Fix 4 — endpoint location:** the task asked for `/api/auth/admin/reset-password`. I kept that path verbatim even though `/api/users/{id}/reset-password` would be more REST-idiomatic. The router prefix is already `/api/auth`; the new path lives there alongside `register`/`login`/`me`. If the team later prefers it under `/api/users/...` it would be a one-line move.
