# Announcement Table Ordering · Resend 429 Hardening · Support Contact Footer

**Date:** 2026-06-21
**Scope:** Three small, independent fixes. No refactors outside the explicit scope below.

---

## Summary

| Part | Change | Area |
|---|---|---|
| 1 | Sort both Announcements tables best-first (rank asc, then composite score desc) | Frontend |
| 2 | Retry Resend HTTP 429 with bounded exponential backoff (safety net for every send path, incl. the bulk announce loop) | Backend |
| 3 | Add a support/bug-report contact footer (`support@mbclaboratory.com`) inside the app shell | Frontend |

---

## Files changed

| File | Part | What |
|---|---|---|
| `frontend/src/pages/recruiter/AnnouncementsPage.jsx` | 1 | Import `sortRankedApplications`; wrap the `readyApplications` and `publishedApplications` memos with it. |
| `backend/services/email_service.py` | 2 | Add `random`/`time` imports, retry constants, `_retry_after_seconds` helper, and a retry loop around the Resend POST. |
| `frontend/src/components/layout/AppShell.jsx` | 3 | Add a `<footer>` with a `mailto:` support link below `PageContainer`. |

### Symbols / signatures confirmed while reading

**Part 1 — `frontend/src/lib/recruiterWorkspace.js`**
- `sortRankedApplications(applications = [])` — spreads (`[...applications]`) before `.sort()`, so it returns a **new** array and does not mutate input. Orders by `rank` ascending (missing rank → `+Infinity`, i.e. last), tie-broken by `evaluation.composite_score` descending (missing score → `-1`).
- `isReadyToAnnounce(application)` → `application?.status === "screening"`.
- `isAnnouncedApplication(application)` → status is `announced_pass` or `announced_fail`.
- The same helper is already used in `frontend/src/pages/recruiter/CandidatesPage.jsx:50` for the ranked candidate table, so this usage is consistent with the existing pattern.

**Part 2 — backend**
- `email_service.send_email(*, to_email, subject, html, text) -> EmailSendResult` — single entry point used by every send path. The Resend request is built with `urllib.request.Request(...)` and executed via `request.urlopen(req, timeout=10)`; HTTP failures surface as `urllib.error.HTTPError` (has `.code` and `.headers`). Signature and return type are unchanged.
- `EmailSendResult` — frozen dataclass: `success, provider, disabled, captured, message_id, error`.
- `notification_service._send_notification(...)` calls `send_email`, derives the row status via `_status_from_result(result)`, and stores `_safe_error(email_result.error)` on failure. **Unchanged** by this task.
- The **public function that sends the `announcement_published` notification** is
  `notification_service.send_announcement_published_notification(db, *, application, user, result, notes=None, related_audit_log_id=None)`.
- `routers/announcements.py::bulk_announce(...)` collects changed applications into `notifications_to_send` and, **after** the single `db.commit()`, loops calling `send_announcement_published_notification(...)` **once per changed application**. This loop is **unchanged** — it inherits the retry from fix A automatically via `send_email`.
- `email_templates.announcement_published_email(*, recipient_name, result, portal_url, notes=None) -> EmailTemplate`. **Unchanged.**

**Part 3 — `frontend/src/components/layout/AppShell.jsx`**
- `AppShell({ children })` renders `<PageContainer>{children}</PageContainer>` inside `<main>`. The footer was added as a sibling directly below `PageContainer`, still inside `<main>`.

---

## Part 1 — Announcements table ordering

Both memos now wrap the filtered list with `sortRankedApplications(...)`:

```js
const readyApplications = useMemo(
  () => sortRankedApplications(applications.filter(isReadyToAnnounce)),
  [applications]
);
const publishedApplications = useMemo(
  () => sortRankedApplications(applications.filter(isAnnouncedApplication)),
  [applications]
);
```

No backend/API change, no change to selection, decisions, `canPublish`, or bulk-publish logic.
Because `sortRankedApplications` spreads before sorting, application state is never mutated.

### Observed order (deterministic check against the real helper)

Ran the actual exported helper over a sample with mixed ranks, a rank tie, and an
unranked row:

```
input:  c(rank=3,score=70), a(rank=1,score=92), tieB(rank=2,score=80),
        b(rank=2,score=88), norank(score=50)

output: a(rank=1,score=92) -> b(rank=2,score=88) -> tieB(rank=2,score=80)
        -> c(rank=3,score=70) -> norank(rank=-,score=50)

input mutated? false  (original[0] still 'c')
```

So **#1 renders at the top, descending by rank then by composite score**, ties broken by
score descending, unranked rows pushed to the bottom — and the source array is not mutated.

> Full in-browser Playwright capture was not run because it needs a live backend +
> recruiter login + seeded announced cohort; the deterministic helper check above
> proves the exact ordering the table renders, and the helper is already battle-tested
> on `CandidatesPage`.

---

## Part 2 — Resend HTTP 429 retry/backoff

### Retry policy values used

| Setting | Value |
|---|---|
| Max retries | `_RESEND_MAX_RETRIES = 3` (→ 4 attempts total) |
| Base backoff | `_RESEND_BASE_BACKOFF_SECONDS = 0.5` → waits ≈ 0.5s, 1s, 2s (`0.5 * 2**attempt`) |
| Jitter | `+ random.uniform(0, 0.25)` per wait |
| `Retry-After` honored | yes — `backoff = max(backoff, retry_after)` when the header carries a seconds value |
| Hard cap | `min(backoff, _RESEND_MAX_BACKOFF_SECONDS = 5.0)` so an in-request publish can't hang excessively (applied **before** jitter, so worst-case wait ≈ 5.25s) |

### Behavior

- Retries **only** on `HTTPError.code == 429`, and **only** while attempts remain.
- On a non-429 `HTTPError`, or on the final attempt still returning 429, it returns the
  existing failure shape `EmailSendResult(success=False, provider="resend", error=f"Resend HTTP {code}")`
  — for 429 that string is exactly `"Resend HTTP 429"`, so `_safe_error` and the
  `email_notifications` row logging keep working unchanged.
- `URLError` and `TimeoutError` keep their previous behavior (no new retries) — those
  handlers were only re-indented to live inside the loop.
- `except error.HTTPError` precedes `except error.URLError` (HTTPError is a URLError
  subclass), so the ordering is correct.
- The send stays **in the request cycle** — no background task, no batch endpoint, no
  queue, no schema or template change.

### Disabled/captured mode — no network call (preserved)

The `if not settings.email_enabled:` early-return at the top of `send_email` is untouched
and sits **before** any `Request`/`urlopen`. So in disabled mode no HTTP call is made and
rows are logged as `captured` (development) or `disabled` exactly as before. The retry loop
is unreachable in that mode.

### One row per candidate (preserved)

`notification_service.py` and the `bulk_announce` notification loop were **not modified**.
The loop still calls `send_announcement_published_notification` once per changed
application, and `_send_notification` still inserts exactly one `EmailNotification` row per
call. The invariant is preserved by construction — fix A only adds retries inside the
already-single `send_email` call.

---

## Part 3 — Support / bug-report footer

Added inside `<main>`, below `PageContainer`:

```jsx
<footer className="px-4 py-6 text-center text-xs text-muted-foreground">
  Menemukan bug atau punya masukan? Hubungi{" "}
  <a
    href="mailto:support@mbclaboratory.com?subject=ScreenAI%20Lab%20%E2%80%94%20Bug%20Report%20%2F%20Feedback"
    className="font-medium text-primary underline-offset-2 hover:underline"
  >
    support@mbclaboratory.com
  </a>
</footer>
```

Uses existing tokens (`text-muted-foreground`, `text-primary`); no new dependency or
component file. Because every protected route is wrapped by `AppShell`, the footer renders
across all roles (candidate, recruiter, super admin) and all protected pages.

---

## Test output (real)

### Backend compile
```
python -m compileall backend scripts   →  clean (no errors)
```

### Smoke tests

```
python -m scripts.smoke_test_bulk_announce          →  26 PASS / 0 FAIL  →  ALL TESTS PASSED
python -m scripts.smoke_test_email_notifications     →   3 PASS / 1 FAIL  (see note)
```

- **`smoke_test_bulk_announce`: 26/26 pass.** This test seeds applications directly in
  `screening` and drives `POST /api/announcements/bulk` end-to-end — i.e. it exercises the
  exact bulk loop fix A protects — and passes unchanged. Disabled-mode `[DEV EMAIL]`
  captures fire once per announced candidate, confirming the one-email-per-candidate
  behavior.

- **`smoke_test_email_notifications`: pre-existing failure, NOT caused by this task.**
  The script aborts at the `application submit still succeeds` assertion. Captured cause:

  ```
  STATUS: 400
  BODY: {"detail":{"message":"Lengkapi data profil sebelum submit aplikasi.","missing_fields":["ipk"]}}
  ```

  The submit endpoint's `_missing_required_profile_fields` now requires an `ipk` (GPA)
  field that the test fixture `_create_user(...)` does not set — test/fixture drift in the
  submit profile-validation path, **unrelated to email sending**. Verified pre-existing by
  stashing `email_service.py` and re-running against baseline: the same
  `[FAIL] application submit still succeeds` / `KeyError: 'data'` occurs without any of my
  changes. The script then crashes on the uncaught `KeyError` before reaching its
  bulk-announce / email assertions, which is why only 3 checks print. Per the task
  instruction ("only adjust a test if fix A changes observable behavior; otherwise leave
  them untouched"), the test was left unmodified — fix A is dormant in disabled mode and
  does not affect this failure.

### Frontend
```
cd frontend && npm run lint    →  clean (eslint, no errors)
cd frontend && npm run build   →  ✓ built in 1.89s
```
(The "chunks larger than 500 kB" notice is a pre-existing warning, already tracked in the
backlog as "Frontend code splitting"; not introduced here.)

---

## Known limitations

- **Public/auth pages lack the footer.** Login, register, etc. are not wrapped by
  `AppShell`, so the support contact is not visible there. Can be added later if needed.
- **In-request send still has a hard ceiling.** Fix A bounds per-send waits (~5.25s
  worst-case, max 4 attempts), so a very large bulk announce against a sustained 429 can
  still add latency, and a backend container recreate mid-publish can interrupt sending.
  The existing per-row "resend" admin action remains the manual fallback. Background/batch
  sending was explicitly out of scope.
- **`smoke_test_email_notifications` is currently red at the submit step** due to the
  pre-existing `ipk` fixture drift described above; fixing that fixture (add `ipk` to
  `_create_user`) is a separate, out-of-scope change.
