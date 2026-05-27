# Batch 4 Security Hardening — Report

> Date: 2026-05-12
> Branch: `lab/setup`
> Scope: pre-Phase-3 security posture — ISSUES_AND_NOTES.md §4 (file-upload MIME spoofing) and §6 (secret-key default, CORS, bcrypt pin, rate limiting)

---

## Summary

| # | Issue | Files | Status |
|---|---|---|---|
| 1 | Server trusted client-supplied `Content-Type` header — magic bytes never checked | [backend/utils/file_storage.py](../../backend/utils/file_storage.py) | Fixed |
| 2 | Server boots with placeholder `SECRET_KEY` in production | [backend/main.py](../../backend/main.py) | Fixed |
| 3 | No startup assertion that `ALLOWED_ORIGINS` is set in production | [backend/main.py](../../backend/main.py) | Fixed |
| 4 | `bcrypt==4.0.1` pin had no documented rationale | [requirements.txt](../../requirements.txt) | Fixed |
| 5 | Login / register / bulk-announce had no rate limiting | [requirements.txt](../../requirements.txt), [backend/main.py](../../backend/main.py), [backend/middleware/rate_limit.py](../../backend/middleware/rate_limit.py) (NEW), [backend/routers/auth.py](../../backend/routers/auth.py), [backend/routers/announcements.py](../../backend/routers/announcements.py) | Fixed |

---

## Fix 1 — Magic-byte file validation

### Change
[backend/utils/file_storage.py:58-65](../../backend/utils/file_storage.py#L58) — new `_MAGIC_BYTES` lookup keyed by MIME:

```python
_MAGIC_BYTES: dict[str, bytes] = {
    "application/pdf": b"%PDF",
    "image/jpeg": b"\xff\xd8\xff",
    "image/png":  b"\x89PNG",
}
```

[backend/utils/file_storage.py:97-107](../../backend/utils/file_storage.py#L97) — new helper `_validate_magic_bytes(mime, data)` raises `HTTP 400 "File content does not match declared type"` if the leading bytes don't match the declared MIME.

[backend/utils/file_storage.py:154-160](../../backend/utils/file_storage.py#L154) — wired into `save_upload` immediately after `_validate_size` (so callers can't fool the server with a tiny PDF-named file containing arbitrary bytes), and *before* the disk write. The file pointer is reset with `upload.file.seek(0)` after the in-memory check so any caller that re-reads the stream sees the full payload.

The existing function is synchronous (`save_upload(...) -> tuple[str, int]`) and reads the entire payload into memory via `upload.file.read()`. The magic-byte check inspects the same buffer, so no extra I/O is added. The sync `upload.file.seek(0)` is used to match the existing pattern; the public `UploadFile.seek` async variant is not needed here.

### Verification
- Static review: `save_upload` order is now `_validate_content_type` → `read()` → `_validate_size` → **`_validate_magic_bytes`** → `seek(0)` → disk write. The magic-byte check is reached before any `open(target, "wb")` call.
- `smoke_test_auth` still passes 16/16 (auth flows do not exercise upload, but proves the import graph is intact after the change).
- Manual reasoning: a client posting a `.exe` with `Content-Type: application/pdf` now gets a 400 because `b"MZ..."` does not start with `b"%PDF"`; a real PDF still passes; JPG and PNG branches mirror the same shape.

---

## Fix 2 — `SECRET_KEY` startup guard

### Change
[backend/main.py:36-46](../../backend/main.py#L36) — the lifespan startup block now refuses to boot if `secret_key.startswith("dev-secret")` and `environment != "development"`:

```python
if (
    settings.secret_key.startswith("dev-secret")
    and settings.environment != "development"
):
    raise RuntimeError("SECRET_KEY must be changed before running in production")
```

Placed at the very top of `lifespan` so it runs *before* `init_db()` and rubric seeding — a misconfigured deploy fails fast with a clear message instead of silently signing JWTs with a public secret.

### Verification
- Static review: `secret_key` default is still `dev-secret-change-me-in-production-min-32-chars` ([backend/config.py:39](../../backend/config.py#L39)) and `environment` default is `development`, so the guard is a no-op locally. `smoke_test_auth` passes 16/16 — register, login, and the JWT-issuing path all run cleanly under the default `environment=development`.
- Manual reasoning: in any non-`development` environment (`staging`, `production`, etc.) the guard fires unless an operator has set a non-`dev-secret` value, matching the `.env.example` instruction.

---

## Fix 3 — CORS production assertion

### Change
[backend/main.py:47-48](../../backend/main.py#L47) — immediately after the SECRET_KEY guard:

```python
if settings.environment != "development" and not settings.allowed_origins:
    raise RuntimeError("ALLOWED_ORIGINS must be set in production")
```

Same lifespan block, same fail-fast intent. `allowed_origins` is the raw env string (empty by default — `cors_origins` falls back to `frontend_url` when empty, which is `http://localhost:5173` and useless for prod).

### Verification
- Static review: the two guards run sequentially at the top of `lifespan`; both must pass before `init_db` is called.
- `smoke_test_auth` passes — dev environment short-circuits both checks.

---

## Fix 4 — bcrypt pin documentation

### Change
[requirements.txt:16-19](../../requirements.txt#L16) — three-line comment above `bcrypt==4.0.1`:

```
# pinned to 4.0.1: bcrypt 4.1.x introduced a passlib incompatibility;
# this project uses bcrypt directly (not via passlib) so the pin can be
# lifted once upstream confirms stability — verify before upgrading
```

Verified the project does not use passlib: `grep -r passlib` finds only [PRD.md:260](../../PRD.md#L260) ("bcrypt langsung, tanpa passlib") and a stale `README.md:12` line. [backend/utils/security.py](../../backend/utils/security.py) imports `bcrypt` directly. No passlib in `requirements.txt`. The comment is accurate.

### Verification
- Static review: comment is inline above the pinned line.
- `pip install -r requirements.txt` is unchanged in behavior (pip ignores `#` lines).

---

## Fix 5 — Rate limiting

### New module
[backend/middleware/rate_limit.py](../../backend/middleware/rate_limit.py) — central `Limiter` and key helpers so routers don't each re-import slowapi:

```python
limiter = Limiter(key_func=get_remote_address)

def user_or_ip_key(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return f"bearer:{auth[7:]}"
    return get_remote_address(request)
```

The bearer-token key function gives the bulk-announce endpoint a per-recruiter bucket (vs. a per-IP bucket that would be shared by everyone behind a campus NAT).

### Wiring
- [requirements.txt:22](../../requirements.txt#L22) — `slowapi>=0.1.9` added.
- [backend/main.py:11-12](../../backend/main.py#L11) — import `RateLimitExceeded` + `_rate_limit_exceeded_handler`.
- [backend/main.py:16](../../backend/main.py#L16) — import the shared `limiter`.
- [backend/main.py:91-93](../../backend/main.py#L91) — register on app:
  ```python
  app.state.limiter = limiter
  app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
  ```

### Decorators
- [backend/routers/auth.py:111-113](../../backend/routers/auth.py#L111) — `POST /api/auth/register` → `@limiter.limit("5/minute")`, IP-keyed (default `key_func`). Signature gains `request: Request` as the first parameter.
- [backend/routers/auth.py:155-157](../../backend/routers/auth.py#L155) — `POST /api/auth/login` → `@limiter.limit("10/minute")`, IP-keyed.
- [backend/routers/announcements.py:140-146](../../backend/routers/announcements.py#L140) — `POST /api/announcements/bulk` → `@limiter.limit("10/minute", key_func=user_or_ip_key)`, per-user (per-bearer-token) keyed.

### Verification
- `slowapi==0.1.9` installs cleanly via `pip install slowapi`; `limits==5.8.0` comes with it as a transitive dep.
- `smoke_test_auth` passes 16/16 (one register + two login attempts + one wrong-password attempt — well under 5/min and 10/min).
- Manual reasoning: slowapi requires the decorated function to expose a `Request` parameter — all three endpoints now declare `request: Request` as the leading positional arg, which FastAPI satisfies via dependency injection. The bulk-announce decorator explicitly passes `key_func=user_or_ip_key` so authenticated recruiters get individual buckets; the auth endpoints default to `get_remote_address` (IP) since the caller is unauthenticated.

---

## Intentionally deferred

| Hardening | Why deferred |
|---|---|
| JWT storage: `localStorage` → HttpOnly cookies + same-site lax + CSRF tokens | Touches frontend auth flow, all 30+ API helpers, and adds a CSRF token round-trip. Cookies + CSRF is its own batch; flagged in [ISSUES_AND_NOTES.md §6](../ISSUES_AND_NOTES.md). |
| Virus scanning on uploads (ClamAV / `python-clamd`) | Acceptable risk inside an internal MBC Lab system per [ISSUES_AND_NOTES.md §4](../ISSUES_AND_NOTES.md). Magic-byte validation closes the obvious wrong-file-type vector; antivirus is an outer perimeter concern best handled at the reverse proxy or storage layer once we have one. |
| JWT revocation / token blacklist | `POST /api/auth/logout` is still a client-side discard; admin-assisted password reset (Batch 3 Fix 4) does not invalidate live tokens. Closing the gap requires either a `token_blacklist` table or a `password_changed_at` claim. Both are flagged for Phase 3. |
| Slowapi storage backend | Default is in-memory — fine for the single-Railway-instance Phase 3 deploy. If we ever scale horizontally we'll need Redis-backed slowapi storage so counters are shared across workers. Not blocking the deploy. |

---

## Side effects & follow-up notes

- **`request: Request` parameter is now required** on three endpoints (`/api/auth/login`, `/api/auth/register`, `/api/announcements/bulk`). FastAPI satisfies it automatically — clients see no change. The smoke test confirms `TestClient.post(json=...)` still works.
- **Rate-limit responses are 429.** Clients hitting the limits get a `429 Too Many Requests` from slowapi's built-in `_rate_limit_exceeded_handler`. The frontend currently does not special-case 429 in [api.js](../../frontend/src/lib/api.js); the existing generic error path will surface it as an error toast. A polished retry-after toast is a future UX polish; not blocking deploy.
- **In-memory rate-limit storage resets on every reload.** A backend restart wipes the counters; this is the slowapi default and matches our single-instance topology. If we add a second worker (e.g. `uvicorn --workers 2`), the buckets become per-worker until we wire a shared backend.
- **Bulk-announce key is the raw bearer token** (`bearer:<jwt>`), not the user id. Logging out and back in produces a new token and thus a fresh bucket. This is intentional — per-token is the cheapest way to get "per session" without parsing the JWT in the key function. A determined attacker could log in repeatedly to re-roll the bucket, but they'd be re-triggering the per-IP `/login` 10/min limit on each new bucket.
- **Production checklist update** (extension of [ISSUES_AND_NOTES.md §9](../ISSUES_AND_NOTES.md)): the deploy now refuses to start unless `ENVIRONMENT != development` is paired with a non-`dev-secret-...` `SECRET_KEY` *and* a non-empty `ALLOWED_ORIGINS`. The Railway env-var configuration must set all three before the first boot or the container will crash-loop.
- **No new migrations** generated by this batch — all changes are application-layer.

---

## Smoke-test results

| Test | Result |
|---|---|
| `python -m scripts.smoke_test_auth` | 16/16 passed |
