# Batch 1 Bug Fixes — Report

> Date: 2026-05-10
> Branch: `lab/setup`
> Scope: 4 bugs from [docs/ISSUES_AND_NOTES.md](../ISSUES_AND_NOTES.md)

---

## Summary

| # | Bug | Files touched | Status |
|---|---|---|---|
| 1 | Bulk announce action_type mismatch — candidates saw `notes=null` and `announced_at=null` after bulk publishing | [backend/routers/announcements.py](../../backend/routers/announcements.py) | Fixed |
| 2 | BackgroundTask session leak — `next(get_db())` grabbed a generator-yielded session that may not close until GC | [backend/routers/applications.py](../../backend/routers/applications.py), [backend/services/submit_anonymization.py](../../backend/services/submit_anonymization.py) | Fixed |
| 3 | Save-as-Draft button was a no-op (uploads already auto-save server-side) | [frontend/src/pages/candidate/DocumentsPage.jsx](../../frontend/src/pages/candidate/DocumentsPage.jsx) | Fixed |
| 4 | Hardcoded API base URL `http://127.0.0.1:8000/api` blocked production builds | [frontend/src/lib/api.js](../../frontend/src/lib/api.js), [.env.example](../../.env.example), [frontend/.env.example](../../frontend/.env.example) | Fixed |

---

## Bug 1 — Bulk announce action_type mismatch

### Change
[backend/routers/announcements.py:282-293](../../backend/routers/announcements.py#L282) — `GET /announcements/my` now matches both discriminators when looking up the latest announcement audit row:

```python
AuditLog.action_type.in_(("announcement", "bulk_announcement"))
```

The bulk write side (`backend/routers/announcements.py:219`) is unchanged — the `bulk_announcement` discriminator is preserved so audit log readers can still tell single vs. bulk publishes apart.

### Verification
- Read trace: `GET /announcements/my` (the only consumer of these audit rows) reads `AuditLog.candidate_id == app.user_id` ordered by `timestamp DESC` and returns `audit.reason` + `audit.timestamp` for the most recent match. With the new `IN (...)` filter, both single and bulk publishes are visible to the candidate.
- `python -m scripts.smoke_test_bulk_announce` — all 20 checks pass, including the two new positive paths:
  - `pass candidate sees pass result (got {'status': 'announced_pass', 'result': 'pass', 'notes': None, 'announced_at': '2026-05-09T20:41:47.063468'})` — `announced_at` is now populated (was `null` before the fix).
  - `fail candidate sees fail result (got ... 'announced_at': '...'})` — same.

`notes` is still `None` because the bulk write side intentionally writes `reason=None` (bulk has no per-candidate note); the *field plumbing* is what was broken, and it's fixed. A candidate who is later re-announced via the single endpoint with a `notes` payload will now see those notes correctly.

---

## Bug 2 — BackgroundTask session leak

### Change
[backend/routers/applications.py:299-303](../../backend/routers/applications.py#L299) now passes `SessionLocal` (the sessionmaker factory) instead of `next(get_db())`:

```python
background_tasks.add_task(
    run_submit_anonymization, app.id, SessionLocal
)
```

[backend/services/submit_anonymization.py:43-72](../../backend/services/submit_anonymization.py#L43) was updated to accept a `sessionmaker` and own the full session lifecycle:

```python
def run_submit_anonymization(application_id: int, session_factory: sessionmaker) -> None:
    db = session_factory()
    try:
        _run_anonymization(application_id, db)
    except Exception:
        logger.error(...)
    finally:
        db.close()
```

The old fragile pattern (a generator-yielded session that never advances past `yield`, leaving its `try/finally` un-run until garbage collection) is replaced by direct ownership: the task opens its own session and is the only thing that can close it.

### Verification
- `Grep "next\(get_db\(\)\)"` across the whole repo returns no matches.
- `python -m scripts.smoke_test_applications` exercises the full submit path; logs show the new background task running cleanly:
  - `Empty text extracted from cv (app 2), skipping NER` — emitted from inside `_run_anonymization`, confirming the sessionmaker-opened session is alive when the task runs.
  - `[PASS] submit ok -> 200` and downstream document/upload checks all pass — no session-related errors in the test output.
- `get_db` import in `applications.py` is retained (it's still used by every FastAPI dependency in the file); only the buggy `next(get_db())` call was replaced.

---

## Bug 3 — Save-as-Draft no-op

### Change
[frontend/src/pages/candidate/DocumentsPage.jsx](../../frontend/src/pages/candidate/DocumentsPage.jsx):
- Removed the `<Button variant="ghost">… Save as Draft</Button>` block from the navigation footer.
- Removed the now-unused `Save` icon import from `lucide-react`.

The button only ever called `toast.success(...)` and did not persist anything — uploads already auto-save through `POST /api/documents/upload/{doc_type}` (called inline by `handleUpload`).

### Verification
- `Grep "draft|Save|toast"` (case-insensitive) on the file shows only:
  - `import { toast } from "sonner"` — still used by `toast.error(...)` calls in the load `useEffect`.
  - `application.status !== "draft"` — server-driven lock check (legitimate).
  - The header copy "save progress and come back later — nothing is final until you review and submit" — still accurate, since uploads auto-save.
- No dead handler reference remains; `Save` icon import is gone.

---

## Bug 4 — Hardcoded API base URL

### Change
[frontend/src/lib/api.js:3-8](../../frontend/src/lib/api.js#L8) now resolves the base URL from the Vite env, falling back to the dev URL when unset:

```js
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api";
```

Both `.env.example` files document the new variable:
- [.env.example](../../.env.example) — added `VITE_API_BASE_URL=http://127.0.0.1:8000/api` in a new `Frontend (Vite)` section with a comment explaining production must override it.
- [frontend/.env.example](../../frontend/.env.example) — same entry with a comment explaining the fallback behavior in `api.js`.

### Verification
- `Grep "127\.0\.0\.1|localhost:8000"` across `frontend/src/` returns only the two intentional references in `api.js` (the JSDoc comment and the fallback string literal). No other component or page hardcodes the API host.
- `evaluateBatch` and `fetchDocumentBlob` (the two helpers that bypass the generic `request()` wrapper) both read the same `BASE_URL` constant, so they automatically pick up the env-driven value too.

---

## Side effects & follow-up notes

- **Bug 1 minor leftover:** the bulk write path still writes `reason=None`, so candidates publishing via bulk see `notes=null` in the response. This is *intentional and unchanged* — the fix was about plumbing, not policy. If the recruiter UX ever wants per-candidate notes on bulk publish, the bulk write side will need a `reason` field on each id (out of scope for this batch).
- **Bug 2 import cleanup:** `from backend.database import SessionLocal, get_db` now imports both. `get_db` is still used by every other endpoint in the file as a FastAPI `Depends(...)`, so it is not dead.
- **Bug 4 deploy notes:** the [docs/ISSUES_AND_NOTES.md](../ISSUES_AND_NOTES.md) Phase 3 deployment-readiness checklist (item 4) referenced this fix as a prerequisite. The work for that item is now complete; the checklist note can be flipped from "replace api.js:8" to "set `VITE_API_BASE_URL` on Vercel before build."
- **Smoke tests run:**
  - `python -m scripts.smoke_test_auth` — all 16 checks pass.
  - `python -m scripts.smoke_test_applications` — all 28 checks pass (covers new BackgroundTask path).
  - `python -m scripts.smoke_test_bulk_announce` — all 20 checks pass (covers Bug 1 read path).
- **Not run:** `smoke_test_periods`, `smoke_test_submit_ner`, `smoke_test_evaluation`. They were not in the requested list, but `smoke_test_submit_ner` would be the right follow-up to exercise the new `sessionmaker`-based BackgroundTask under a non-empty CV — the applications smoke test only covered the empty-text early-return branch.
