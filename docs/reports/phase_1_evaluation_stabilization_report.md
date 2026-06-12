# Phase 1 — Evaluation Flow Immediate Stabilization

Date: 2026-06-12
Branch: `fix/backend-evaluation`
Source of truth: [EVALUATION_FREEZE_AUDIT_REPORT.md](./EVALUATION_FREEZE_AUDIT_REPORT.md) (Phase 1 only)
Status: **Implemented and smoke-tested.**

---

## 1. Staging Issue Summary

During staging, `POST /api/recruiter/evaluate/batch` froze the whole backend:

1. The recruiter triggering evaluation saw the UI block for minutes.
2. Other recruiters doing document review saw the entire app freeze.
3. Refreshing the evaluation page mid-run and re-triggering stacked a second
   batch on top of the first, eventually making the backend unresponsive
   until the container was restarted.

The audit traced this to four compounding bugs: sync CPU-bound work (PDF
extraction, IndoBERT NER, KTM validation, KHS LLM parsing) running directly
on the uvicorn event loop inside an `async def` handler; the KHS parser
calling DeepSeek through the sync client with no timeout and `time.sleep`
retries; no server-side lock against duplicate concurrent batches; and one
shared SQLAlchemy session across all candidate coroutines, where any failure
poisoned the batch transaction and the single trailing commit persisted
partial rows for failed candidates.

## 2. Phase 1 Goals

Small-diff stabilization, no schema change, no API contract change:

1. Explicit LLM timeout + disabled SDK-internal retries.
2. No sync heavy work on the event loop (`asyncio.to_thread`).
3. Per-candidate DB sessions with per-candidate commit/rollback.
4. Per-division in-process running lock → 409 on duplicate trigger.
5. Minimal frontend handling for the new 409.
6. NER model warmup on startup (non-blocking).
7. Minimal observability: real logs with per-candidate timings.

## 3. Files Changed

| File | Change |
|---|---|
| `backend/utils/llm_client.py` | `timeout=90.0, max_retries=0` on both clients; `print` → module logger |
| `backend/services/evaluation_service.py` | `asyncio.to_thread` offloading; per-candidate `SessionLocal` sessions; batch/candidate logging with durations; SQLite-aware concurrency |
| `backend/routers/evaluate_batch.py` | Per-division in-process running lock → 409; lock-conflict logging |
| `backend/main.py` | NER warmup daemon thread in lifespan; root logging configuration |
| `backend/utils/ner_utils.py` | Thread-safe double-checked lock around the NER singleton load |
| `backend/alembic/env.py` | Stop alembic's `fileConfig` from disabling app loggers at startup |
| `backend/services/scoring.py` | `print` → `logger.warning` |
| `frontend/src/pages/recruiter/EvaluationPage.jsx` | 409 → dedicated toast; state recovers |
| `scripts/smoke_test_evaluation_stabilization.py` | **New** smoke suite for all Phase 1 behaviors |
| `scripts/smoke_test_ner_evaluation_flow.py` | Fixed pre-existing breakage (seed users missing `ipk`, required by the newer profile-completion submit gate) |

No `api.js` change was needed: `evaluateBatch` already throws an `ApiError`
carrying `status`, so the page can branch on `error.status === 409`.

## 4. Implementation Details

### 4.1 LLM timeout and retry config (`llm_client.py`)

Both `OpenAI` and `AsyncOpenAI` are now constructed with
`timeout=LLM_TIMEOUT_SECONDS` (90.0) and `max_retries=LLM_MAX_RETRIES` (0).
The SDK defaults were 600 s with 2 internal retries, which multiplied the
existing app-level 3-attempt retry loops in `call_llm`, `call_llm_async`,
and `call_khs_llm_parser` — worst case many minutes per call. App-level
retry behavior and all JSON parsing behavior are unchanged.

### 4.2 `asyncio.to_thread` offloading (`evaluation_service.py`)

Every sync heavy call in the per-candidate pipeline now runs in a worker
thread instead of on the event loop:

- `extract_text_from_pdf` — CV cache-miss path, both motivation-letter
  fallback blocks, KHS inline parse, SWOT extraction.
- `normalize_and_segment` and `anonymize_text` (IndoBERT NER) — CV cache-miss
  path and both ML fallback blocks.
- `validate_ktm` — `_run_ktm` is now async; the Document lookup stays on the
  session, only the pure PyMuPDF validation is offloaded.
- `parse_khs` (sync DeepSeek call, Finding 2's regression) —
  `_parse_and_store_khs_inline` is now async; even the worst-case retry loop
  blocks a threadpool thread, not the loop.

`_resolve_khs_context` and `_extract_swot` became `async def` accordingly.
Only pure functions (path/text in, dict out) are offloaded — all SQLAlchemy
session work stays on the coroutine, so a session is never touched from two
threads. Functions are resolved from module globals at call time, so the
existing smoke-test monkeypatching (`evaluation_service.anonymize_text = ...`)
keeps working.

### 4.3 Per-candidate DB sessions and transaction isolation

`run_evaluation_pipeline` uses the request-scoped `db` only for rubric
lookup/validation, application selection, and skip counters. The
gather/semaphore section now:

- passes only `application_id` and `rubric_id` into each coroutine (never
  ORM instances bound to another session);
- opens a fresh `SessionLocal()` per candidate (inside the semaphore, so at
  most `concurrency` extra connections are held);
- re-queries `Application` and `Rubric` inside that session; `_evaluate_one`
  re-queries `User`, `Candidate`, `Document`, `CandidateDocument` on it as
  before;
- commits per candidate on success (after the `SCREENING` status flip);
- rolls back per candidate on failure, logs via `logger.exception`, and
  reports `{application_id, error}` exactly as before;
- closes the session in `finally`.

The batch-level `db.commit()` was removed. Consequences: candidate A's
failure can no longer poison B/C (`PendingRollbackError` class is gone), and
a failed candidate leaves **no** partial `Candidate`/`CandidateDocument`/
`DimensionScore` rows because its whole transaction rolls back.

**SQLite note:** per-candidate sessions hold a write transaction for the
candidate's whole duration. SQLite permits one writer, and contention spins
in sqlite3's busy-wait *on the event loop*. `_effective_concurrency()`
therefore serializes candidates (concurrency 1) when the engine dialect is
SQLite (local dev); Postgres (staging/production) keeps `_LLM_CONCURRENCY=5`
overlap. This was observed directly in the smoke test before the guard:
`database is locked` errors plus a 5.5 s health stall from the busy-wait.

### 4.4 Per-division in-process running lock (`evaluate_batch.py`)

Module-level `_running_divisions: set[str]`. The handler rejects a trigger
for a division already in the set with **409 Conflict** ("Evaluation for
this division is already running. Please wait until it finishes."), adds the
division before running, and releases it in `finally` — including when the
pipeline raises. Check-then-add is race-free because no `await` occurs
between them on the single event loop.

**Different divisions may run concurrently** — this is safe because the
pipeline now uses per-candidate sessions (no shared session state between
batches) and LLM concurrency is bounded per batch. The lock is explicitly
in-process: correct for the current single-worker uvicorn deployment
(`backend/Dockerfile`), to be replaced by the Phase 2 DB-level job
uniqueness. The deprecated legacy `/api/evaluate` endpoint does not take
this lock (it is deprecated and off the recruiter UI).

### 4.5 Frontend 409 handling (`EvaluationPage.jsx`)

`runEvaluate`'s catch now branches on `error.status === 409`: it shows a
dedicated `toast.warning` ("Evaluation for this division is already running.
Please wait until it finishes.") and does *not* overwrite the last-result
panel with an error. The existing `finally` resets `evaluating`, so the
buttons and overlay recover. The UI model is otherwise unchanged — no
polling, no job awareness (Phase 2).

### 4.6 NER warmup (`main.py`, `ner_utils.py`)

Lifespan startup launches a daemon thread (`ner-warmup`) that calls
`get_ner_pipeline()`. Boot is not blocked; warmup start/success/failure is
logged; a warmup failure is swallowed (`logger.exception`) so the app boots
regardless and the first evaluation loads the model on demand instead.
`get_ner_pipeline()` gained a double-checked `threading.Lock` so the warmup
thread and an early evaluation worker thread cannot double-load the ~1.3 GB
model (which would double the memory spike).

### 4.7 Observability

- `traceback.print_exc()` in the evaluation path replaced with
  `logger.exception` (includes the application id and elapsed time).
- New logs: batch started (division, force, selected count, skip
  breakdown), per-candidate start, per-candidate success/failure with
  duration, batch finished (ok/failed counts, total duration), lock
  conflict (warning), NER warmup lifecycle.
- `print` → logger in `llm_client.py` and `scoring.py` (evaluation path).
- **Found while verifying:** module logs never reached the container logs at
  all — `init_db()` runs alembic's `env.py`, whose `fileConfig()` defaults
  to `disable_existing_loggers=True` and silently disabled every app logger
  created before startup, then capped root at WARN. This explains why the
  staging freeze had to be diagnosed from code instead of logs. Fixed by
  (a) configuring a root INFO handler in `main.py` (with `sqlalchemy` held
  at WARNING so SQL isn't echoed) and (b) making `env.py` apply
  `fileConfig` only when no logging is configured yet (i.e. the alembic
  CLI), and with `disable_existing_loggers=False`.

## 5. Intentionally NOT Implemented (deferred to Phase 2/3)

- No `evaluation_jobs` model/table.
- No Alembic migration (the `env.py` change is logging-only, no schema).
- No 202 + `job_id` response — the endpoint still responds 200 with the full
  result after the run completes.
- No progress-polling endpoints and no frontend polling.
- No background worker / job runner; evaluation still runs inline in the
  request (now without blocking the loop).
- No job cancellation, no startup job recovery, no DB-level lock.

## 6. Test Results

### New: `python -m scripts.smoke_test_evaluation_stabilization` — **22/22 PASS**

| Check | Result |
|---|---|
| Sync + async LLM clients: `timeout == 90.0`, `max_retries == 0` | PASS |
| Duplicate trigger same division → 409 with "already running" detail | PASS |
| Different division accepted while first division runs | PASS |
| `/api/health` responsive while evaluation held (0.002 s) | PASS |
| Held first request completes normally → 200 | PASS |
| Pipeline crash → sanitized 500, lock released, next trigger → 200 | PASS |
| Real pipeline, 3 candidates, middle one's LLM call raises: 2 succeed, exactly 1 error reported | PASS |
| `/api/health` stayed responsive during the real run with 1.5 s sync NER stages (worst sample 0.035 s; was 5.5 s before the SQLite concurrency guard) | PASS |
| Successful candidates committed (`SCREENING`, `composite_score` persisted) | PASS |
| Failed candidate stays `VERIFIED`, zero partial `Candidate` rows | PASS |

### Regression: existing smoke suites

- `python -m scripts.smoke_test_evaluation` — **all checks pass** (full
  upload → review → evaluate → re-evaluate → force → announce flow; result
  shape, KHS gating, and status transitions unchanged).
- `python -m scripts.smoke_test_ner_evaluation_flow` — **all checks pass**
  (cache-hit, ML-fallback, full-inline-fallback, review/correction skip
  paths). Note: this script was already broken on `main` — it predates the
  IPK profile-completion submit gate (commit `82520b4`) and failed at submit
  with `missing_fields: ["ipk"]`. Fixed by seeding `ipk=3.46` on the test
  users; unrelated to the Phase 1 changes.

### Manual verification

- Backend boots (uvicorn): `[OK]` startup lines, NER warmup runs in the
  daemon thread, `/api/health` answers 200 in 15–95 ms during warmup, and
  `NER model warmup finished successfully` is logged.
- Frontend: `eslint` clean on `EvaluationPage.jsx`; `npm run build` succeeds
  (pre-existing chunk-size warning only).
- `git status` confirms: no Alembic version file added, no new model, no new
  endpoint.

## 7. Remaining Risks

- **nginx 300 s timeout still applies.** A very large batch can still exceed
  `proxy_read_timeout`; the browser gets a 504 while the backend finishes the
  run correctly in the background. The 409 lock now prevents the dangerous
  re-trigger stacking, but the recruiter has no progress visibility until
  Phase 2.
- **In-process lock only.** If the deployment ever moves to multiple uvicorn
  workers or replicas before Phase 2, the lock no longer guards across
  processes. Single-worker is the documented current deployment.
- **Lock state lost on restart** (acceptable: a restart also kills the run).
- **SQLite serializes candidates.** Local-dev batches run one candidate at a
  time; staging/production Postgres keeps the 5-way LLM overlap.
- **Per-candidate sessions raise commit frequency.** Each candidate is its
  own transaction; a mid-batch crash now leaves earlier candidates committed
  (by design — durable progress), which differs from the old all-or-nothing
  appearance.
- **`asyncio.gather` without `return_exceptions`**: `_bounded` catches all
  exceptions internally (including rollback failures), so gather cannot blow
  up, but the pattern relies on that invariant.
- **Legacy `/api/evaluate`** (deprecated) does not take the division lock.

## 8. Recommended Next Step — Phase 2

Background job + polling, per the audit:

1. `evaluation_jobs` table (Alembic migration) with a partial unique index
   enforcing one non-terminal job per division (pattern:
   `15e1fb0f5fe3_partial_unique_active_period.py`).
2. POST creates the job and returns **202 + job_id**; the pipeline runs as a
   background task using the same per-candidate session model from this
   phase, updating `processed/succeeded/failed` counters per commit.
3. `GET /api/recruiter/evaluate/jobs/{id}` and
   `GET /api/recruiter/evaluate/jobs/active?division=`.
4. Lifespan startup recovery: mark `running` jobs as
   `failed ("interrupted by restart")`.
5. Frontend: non-blocking progress card with ~3 s polling; on mount, resume
   polling of any active job — page refresh becomes harmless and the nginx
   300 s timeout becomes irrelevant.

The per-candidate transaction isolation built in this phase is the direct
foundation for the job runner's incremental progress reporting.
