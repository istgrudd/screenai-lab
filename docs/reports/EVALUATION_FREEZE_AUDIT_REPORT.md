# Evaluation Flow Freeze — Audit Report

Date: 2026-06-12
Scope: `POST /api/recruiter/evaluate/batch` end-to-end (router → evaluation service → KHS/NER/LLM stages → frontend)
Status: **Audit only — no code changes applied yet.** The phased implementation plan is at the end of this report.

## Staging Symptoms Under Audit

1. When a recruiter runs evaluation, the recruiter UI blocks for a long time.
2. Other recruiters doing document review experience the entire app freezing.
3. Refreshing the evaluation page while evaluation is running can make the app unresponsive until the backend container is restarted.

## Executive Summary

The freeze is not one bug but a chain of four compounding ones:

1. **The event loop is blocked.** The batch endpoint is `async def`, but most of its pipeline — PDF extraction, IndoBERT NER inference, KTM validation, and the KHS LLM parser — is synchronous code called directly on the event loop. With a single uvicorn worker, every request from every user stalls while these run (Findings 1, 2).
2. **The KHS parser reintroduced a previously fixed bug class.** `docs/reports/ASYNC_DEEPSEEK_CONCURRENCY_REPORT.md` (2026-05-27) fixed sync DeepSeek calls blocking the loop by switching *scoring* to `AsyncOpenAI`. The KHS parser added later calls DeepSeek through the **sync** client with `time.sleep` retry backoff and **no timeout** — worst case minutes of loop blockage per cache-miss candidate (Finding 2).
3. **Evaluation runs inline in the request with no job record and no lock.** nginx times out at 300 s while the backend keeps working; a page refresh wipes the frontend's only "running" indicator; the recruiter re-triggers, and a second batch stacks on the first. Stacked batches compound the loop blockage and DB load until the container is restarted (Finding 3).
4. **All concurrent candidate coroutines share one SQLAlchemy session.** Interleaved `flush()` calls poison the shared transaction on any failure, and the single trailing `commit()` persists partial rows from candidates that are reported as *failed* (Finding 4).

| # | Finding | Severity |
|---|---------|----------|
| 1 | Sync CPU-bound work (PDF/NER/KTM/KHS) runs on the event loop inside `async def` | Critical |
| 2 | Sync DeepSeek KHS call with `time.sleep` retries and no timeout (regression) | Critical |
| 3 | Evaluation inline in POST request — no job, no progress polling, no per-division lock | Critical |
| 4 | Shared `Session` across `asyncio.gather`; interleaved `flush()`; single mixed `commit()` | High |
| 5 | One DB connection held for the whole batch; pool exhaustion under stacked runs | High |
| 6 | IndoBERT (~1.3 GB) lazy-loads inside the first evaluation request | Medium |
| 7 | Frontend has no job awareness — state lost on refresh, duplicate trigger possible | Medium |
| 8 | Observability gaps (`print`/`traceback.print_exc`, no per-candidate timing) | Low |

All file/line references were verified against the working tree on 2026-06-12 (branch `main`, commit `f28f0b2`).

---

## Finding 1 — Synchronous CPU-bound work runs directly on the event loop inside `async def`

**Severity:** Critical

**Affected file and line:**
- `backend/routers/evaluate_batch.py:59` — `evaluate_batch` is `async def`, so its body runs on the uvicorn event loop.
- `backend/services/evaluation_service.py:359-363` — `extract_text_from_pdf`, `normalize_and_segment`, `anonymize_text` called inline in async `_evaluate_one` (CV cache-miss path).
- `backend/services/evaluation_service.py:384-388` and `:409-413` — same trio for the motivation-letter fallback.
- `backend/services/evaluation_service.py:271` → `:815-822` — `validate_ktm` (PyMuPDF extraction).
- `backend/services/evaluation_service.py:486` → `:834-843` — `_extract_swot` (PyMuPDF extraction).
- `backend/services/evaluation_service.py:610` → `:683-717` — inline KHS parse (see Finding 2).
- `backend/services/anonymizer.py:148` → `backend/utils/ner_utils.py:67-121` — `run_ner` runs IndoBERT transformer inference, chunked, pure CPU; seconds to tens of seconds per CV.

**Root cause:** Synchronous, CPU-bound, and sync-I/O functions are called without `await asyncio.to_thread(...)` (or `run_in_threadpool`) inside an `async def` request handler. While any of them runs, the event loop cannot schedule anything else. FastAPI's plain `def` endpoints do run in the anyio threadpool, but their request parsing and response sending are still dispatched by the event loop — so a blocked loop freezes **every endpoint for every user**, including `/api/health`.

**Why this matches the staging freeze symptom:** "Other recruiters doing document review also experience the app freezing" is exactly the signature of a blocked event loop in a single-worker uvicorn process (`backend/Dockerfile:50` runs uvicorn with the default single worker). The freeze duration scales with batch size, because each candidate's NER/PDF work serializes on the loop regardless of `_LLM_CONCURRENCY`.

**Recommended fix:** Move the entire per-candidate pipeline out of the request path (Phase 2 below). Until then, never let sync work touch the loop.

**Minimal safe patch (Phase 1):** Wrap each sync call site in `await asyncio.to_thread(...)`:

```python
extraction = await asyncio.to_thread(extract_text_from_pdf, cv_doc.file_path)
normalised = await asyncio.to_thread(normalize_and_segment, raw_text)
anonymised = await asyncio.to_thread(anonymize_text, normalised["normalized_text"])
ktm_result = await asyncio.to_thread(_run_ktm, app, user, db)   # see Finding 4 re: session
parsed     = await asyncio.to_thread(parse_khs, khs_doc.file_path)
```

Note: `to_thread` calls that touch the DB session must not run concurrently with other coroutines using the same session — this is why Finding 4's per-candidate session change must land together with this one.

**Longer-term production-grade fix:** Phase 2/3 — run the pipeline in a background job (own sessions, own threads), keep request handlers I/O-only. Optionally move the worker to a separate process/container so transformer inference never shares a process with the API.

**Test cases:**
- *Event-loop responsiveness:* monkeypatch the NER/KHS stage with a 5 s `time.sleep`, start a batch evaluation, and assert a concurrent `GET /api/health` answers in < 1 s (async test with `httpx.AsyncClient`). Fails today; passes after the patch.
- *Pipeline equivalence:* run the evaluation smoke script (`scripts/smoke_test_evaluation.py` pattern) before/after and assert identical result shape, scores persisted, statuses transitioned.

---

## Finding 2 — Sync DeepSeek KHS call with `time.sleep` retries and no timeout (regression of a previously fixed bug class)

**Severity:** Critical

**Affected file and line:**
- `backend/services/khs_parser.py:153` — `parse_khs_text` calls `call_khs_llm_parser` synchronously.
- `backend/utils/llm_client.py:269-351` — `call_khs_llm_parser` uses the **sync** `OpenAI` client (`get_llm_client`, line 289) and `time.sleep(wait)` backoff (line 314).
- `backend/utils/llm_client.py:33-52` — neither `OpenAI` nor `AsyncOpenAI` is constructed with a `timeout` or `max_retries` override.
- Reached from the evaluation path via `backend/services/evaluation_service.py:610` → `_parse_and_store_khs_inline` (`:693`) whenever the KHS cache misses or is stale.

**Root cause:** The OpenAI SDK defaults to a **600 s timeout with 2 internal retries**. `call_khs_llm_parser` adds 3 application-level attempts with 2 s/4 s sleeps. All of it runs synchronously on the event loop. A single slow or failing DeepSeek call during a KHS cache-miss can therefore pin the loop for many minutes; several cache-miss candidates in one batch multiply that. This is the same bug class fixed on 2026-05-27 for the scoring call (`ASYNC_DEEPSEEK_CONCURRENCY_REPORT.md`) — the KHS parser (commit `82a2ad1`) reintroduced it on a different code path.

**Why this matches the staging freeze symptom:** Explains the *length* of the freezes (minutes, not seconds) and the "unresponsive until restart" perception: a batch of candidates with stale/missing KHS caches keeps the loop pegged far longer than any proxy or browser timeout, so from the outside the backend looks dead.

**Recommended fix:** Add an async KHS parser path on `AsyncOpenAI` (mirroring the scoring fix) and configure explicit timeouts on both clients.

**Minimal safe patch (Phase 1):**
1. Run `parse_khs` via `asyncio.to_thread` (covered by Finding 1's patch) so even the worst case blocks a threadpool thread, not the loop.
2. Construct both clients with explicit limits, e.g. in `llm_client.py`:

```python
_client = OpenAI(api_key=..., base_url=..., timeout=90.0, max_retries=0)
_async_client = AsyncOpenAI(api_key=..., base_url=..., timeout=90.0, max_retries=0)
```

`max_retries=0` because `call_llm`, `call_llm_async`, and `call_khs_llm_parser` already implement their own 3-attempt retry loops; SDK-internal retries currently multiply them.

**Longer-term production-grade fix:** `call_khs_llm_parser_async` on `AsyncOpenAI` with `asyncio.sleep` backoff; make `parse_khs_text` async in the evaluation path. The background task in `submit_anonymization.py` may keep the sync variant for now (it is a sync `def`, so FastAPI runs it in the threadpool, off the loop); once Phase 2 moves evaluation to a worker, unify both on the async path.

**Test cases:**
- Assert client construction includes `timeout` and `max_retries=0` (simple unit test on `get_llm_client()`/`get_async_llm_client()` kwargs via monkeypatched constructors).
- Monkeypatch `_khs_chat_completion` to sleep 3 s and assert a concurrent `/api/health` stays responsive during an evaluation containing a KHS cache-miss.
- Worst-case bound: with the client mocked to always raise a timeout, assert one KHS parse completes (with `parse_error`) in under `3 × (timeout + backoff)` and does not raise.

---

## Finding 3 — Evaluation runs inline in the POST request: no job record, no progress polling, no per-division lock

**Severity:** Critical

**Affected file and line:**
- `backend/routers/evaluate_batch.py:59-87` — the handler awaits `run_evaluation_pipeline` to completion before responding; nothing prevents concurrent invocations for the same division.
- `frontend/nginx.conf:38-39` — `proxy_read_timeout 300s` / `proxy_send_timeout 300s`.
- `frontend/src/lib/api.js:585-619` — `evaluateBatch` is a plain `fetch` with no timeout/AbortController.
- `frontend/src/pages/recruiter/EvaluationPage.jsx:146-205` — the only duplicate-run guard is the in-memory `evaluating` state; `frontend/src/components/recruiter/EvaluationRunningOverlay.jsx` — full-screen overlay driven by that same state.

**Root cause / freeze chain:** A batch of N candidates × LLM round-trips easily exceeds 300 s. nginx then returns 504 to the browser, but FastAPI keeps processing the request (no cancellation propagates for a non-streaming response, and a blocked loop cannot even observe the disconnect). The recruiter sees an error or refreshes the page; React state is wiped, so nothing indicates a run is still active server-side; the Evaluate button is enabled again; clicking it starts a **second concurrent batch over the same applications**. Each stacked batch adds loop-blocking NER/LLM work and DB load. There is no evaluation job table, no progress endpoint, and no server-side running lock to break this cycle.

**Why this matches the staging freeze symptom:** Directly explains "refreshing the evaluation page while evaluation is running can make the entire app unresponsive until the backend container is restarted" — restart is the only way to shed the stacked, unobservable, uncancellable work.

**Recommended fix:** Asynchronous job model: POST creates a job and returns immediately; the pipeline runs in the background; the frontend polls job progress and can resume polling after a refresh (Phase 2).

**Minimal safe patch (Phase 1):** Server-side per-division running lock in `evaluate_batch.py`:

```python
_running_divisions: set[str] = set()   # single worker; in-process is sufficient

# in the handler:
if payload.division.value in _running_divisions:
    raise HTTPException(status_code=409, detail="Evaluation for this division is already running.")
_running_divisions.add(payload.division.value)
try:
    result = await run_evaluation_pipeline(...)
finally:
    _running_divisions.discard(payload.division.value)
```

Frontend: surface the 409 as a clear toast ("Evaluation already running — please wait").

**Longer-term production-grade fix:** Phase 2 job table with a partial unique index "one non-terminal job per division" (same pattern as `backend/alembic/versions/15e1fb0f5fe3_partial_unique_active_period.py`), 202 + `job_id` response, polling endpoints, startup recovery for interrupted jobs; Phase 3 cancellation endpoint.

**Test cases:**
- Two concurrent POSTs for the same division → second returns 409 (use an event/`asyncio.Event` in a mocked pipeline to hold the first request open).
- Two concurrent POSTs for *different* divisions → both accepted.
- Lock release on failure: pipeline mocked to raise → subsequent POST for the same division succeeds (no stuck lock).
- (Phase 2) After simulated refresh, `GET /api/recruiter/evaluate/jobs/active?division=...` returns the running job.

---

## Finding 4 — One shared sync `Session` across `asyncio.gather`; interleaved `flush()`; single `commit()` mixes succeeded and failed candidates

**Severity:** High

**Affected file and line:**
- `backend/services/evaluation_service.py:211-237` — `asyncio.Semaphore(5)` + `asyncio.gather` run up to 5 `_bounded` coroutines, all closing over the request-scoped `db`.
- `backend/services/evaluation_service.py:218` — `db.flush()` inside each coroutine; many more flushes inside `_evaluate_one` (`:483`, `:755`, `:769`, `:798`, `:867`, `:877`, `:912`, `:930`) and `backend/services/scoring.py:84,136`.
- `backend/services/evaluation_service.py:237` — single `db.commit()` after `gather` completes.

**Root cause:** A sync SQLAlchemy `Session` is not designed for concurrent use, even cooperative asyncio concurrency. Coroutines interleave at every `await` (the LLM call), so:
- One coroutine's `flush()` flushes *another* coroutine's half-built rows (a Candidate created before its scores exist, a KHS cache row mid-update).
- If any flush fails (e.g. IntegrityError), the shared transaction enters a failed state; every other in-flight coroutine then gets `PendingRollbackError` on its next DB call, the entire batch errors out, and minutes of LLM spend are lost.
- Conversely, when one candidate fails *after* partial writes (Candidate row via `_ensure_candidate`, KHS cache via `_store_khs_cache`), `_bounded` catches the exception and records it in `errors` — but the partial rows are still pending in the shared session and are **persisted by the final `commit()`** at `:237`, leaving "failed" candidates with inconsistent state (e.g. `status="anonymized"` Candidate with no scores).

**Why this matches the staging freeze symptom:** Stacked duplicate batches (Finding 3) make session contention and constraint violations far more likely (two batches both `_ensure_candidate` for the same user), producing the cascading-error/garbage-state behavior observed when the app is wedged.

**Recommended fix:** One session per candidate, opened from `SessionLocal`, committed or rolled back per candidate. The codebase already has this exact pattern: `backend/services/submit_anonymization.py:49-79` takes a `session_factory`, opens its own session, and never reuses the request session.

**Minimal safe patch (Phase 1):** In `run_evaluation_pipeline`, keep the request `db` only for rubric lookup, application selection, and skip counters. Inside `_bounded`, pass *IDs* (not ORM instances bound to the request session) and do:

```python
async def _bounded(app_id: int) -> tuple[str, dict]:
    async with semaphore:
        session = SessionLocal()
        try:
            app = session.query(Application).get(app_id)
            result = await _evaluate_one(app, rubric_id, session)
            app.status = ApplicationStatus.SCREENING
            session.commit()
            return ("ok", result)
        except Exception as exc:
            session.rollback()
            logger.exception("Evaluation failed for application %d", app_id)
            return ("err", {"application_id": app_id, "error": str(exc)})
        finally:
            session.close()
```

(`_evaluate_one` re-fetches the rubric by id inside its own session; the final batch-level `db.commit()` at `:237` is removed.)

**Longer-term production-grade fix:** Same per-candidate transaction model inside the Phase 2 job runner — which additionally enables incremental progress (each commit advances the job's `processed` counter) and makes partial batch completion durable across restarts.

**Test cases:**
- *Isolation:* 3 eligible candidates, the middle one's LLM call mocked to raise → assert the other 2 are fully committed (scores + `SCREENING` status), the failed one has **no** new Candidate/CandidateDocument/DimensionScore rows, and the response reports exactly 1 error.
- *No transaction poisoning:* failure in candidate 1 does not cause `PendingRollbackError` in candidates 2–3.
- *Force re-run:* `force=true` over a mixed scored/unscored division still produces correct per-candidate commits.

---

## Finding 5 — One DB connection held for the entire batch; pool exhaustion under stacked runs

**Severity:** High

**Affected file and line:**
- `backend/database.py:26-28` — `create_engine` with default pool (`pool_size=5`, `max_overflow=10`, `pool_timeout=30`); `get_db()` (`:36-48`) holds the session — and once the first query runs, its connection — for the entire request lifetime.

**Root cause:** A multi-minute inline evaluation request pins one connection in an open transaction the whole time. Stacked duplicate batches (Finding 3) pin several. Normal traffic (document review, dashboards) then exhausts the 15-connection ceiling; requests block up to 30 s in the pool queue and fail — compounding the perceived freeze even in moments when the loop is momentarily free.

**Why this matches the staging freeze symptom:** Contributes to "everyone freezes" and to the long tail of errors after the recruiter retries: even threadpool-`def` endpoints stall waiting for a pooled connection.

**Recommended fix / minimal safe patch:** Largely solved by Finding 4's per-candidate sessions (connections held seconds, not minutes). Additionally set explicit pool sizing in `create_engine` for non-SQLite engines, e.g. `pool_size=10, max_overflow=20`, so capacity is a deliberate choice rather than a default.

**Longer-term production-grade fix:** With Phase 2/3, the job runner's DB usage is brief and bounded; add pool metrics (checkedout/overflow) to logs to catch regressions.

**Test cases:**
- With the pipeline mocked to hold its per-candidate session open 2 s and concurrency 5, assert a parallel burst of 10 ordinary API calls all complete < 5 s (no pool starvation).
- Unit-assert engine kwargs include the explicit pool settings (skip for SQLite).

---

## Finding 6 — IndoBERT model (~1.3 GB) lazy-loads inside the first evaluation request

**Severity:** Medium

**Affected file and line:**
- `backend/utils/ner_utils.py:23-64` — `get_ner_pipeline` singleton downloads/loads the model on first call, i.e. during the first evaluation (or first submit-time NER) after every container start.
- `backend/main.py:39-88` — lifespan startup does no model warmup.

**Root cause:** First post-restart evaluation pays model download/load synchronously — on the event loop, per Finding 1 — adding minutes to the first batch. The load also produces a large memory spike; `docker-compose.yml` sets no memory limits, so on a small VPS the OOM killer terminating uvicorn is a plausible contributor to "dead until restarted." *(Verification note for staging: during a repro, watch `docker stats`, `dmesg | grep -i oom`, and backend logs for `[NER] Loading model` timing.)*

**Why this matches the staging freeze symptom:** Makes the *first* evaluation after a restart dramatically worse — which is exactly when an operator is watching after restarting the container, reinforcing the "restart fixes it briefly" loop.

**Recommended fix / minimal safe patch (Phase 1):** Warm the model during lifespan startup without blocking boot:

```python
import threading
from backend.utils.ner_utils import get_ner_pipeline
threading.Thread(target=get_ner_pipeline, daemon=True, name="ner-warmup").start()
```

If an evaluation arrives before warmup finishes, it still works (singleton guard) — it just waits in its threadpool thread, not on the loop (after Finding 1's patch).

**Longer-term production-grade fix:** Phase 3 — dedicated worker process owns the model; compose `mem_limit`/`deploy.resources` and a container healthcheck; pre-bake the model into the image or assert the `./models` mount is warm at startup.

**Test cases:**
- Startup test: app boots and `/api/health` responds before warmup completes (mock `get_ner_pipeline` with a 3 s sleep).
- `get_ner_pipeline` called concurrently from two threads returns the same singleton without double-loading (lock or idempotence check).

---

## Finding 7 — Frontend has no job awareness: state lost on refresh, duplicate trigger possible, blocking overlay

**Severity:** Medium

**Affected file and line:**
- `frontend/src/pages/recruiter/EvaluationPage.jsx:146-205` — `runEvaluate` guards only via in-memory `evaluating`; nothing persists or rediscovers a running evaluation.
- `frontend/src/components/recruiter/EvaluationRunningOverlay.jsx:14` — fixed full-screen overlay blocks the whole tab for the duration of one HTTP request, with static fake "steps".
- `frontend/src/lib/api.js:585-619` — `evaluateBatch` has no timeout/AbortController; a hung backend hangs the tab's request indefinitely (browser-dependent).

**Root cause:** The UI models evaluation as a single request/response instead of a long-running server-side process. After any interruption (504, refresh, tab close) the client has no way to know work is still running, so it invites the duplicate trigger described in Finding 3.

**Why this matches the staging freeze symptom:** "The recruiter UI blocks for a long time" is partly by design (the overlay), and the refresh → re-trigger path is the human half of the stacked-batch freeze chain.

**Recommended fix:** Phase 2 — `runEvaluate` starts a job, then polls `GET /api/recruiter/evaluate/jobs/{id}` (~3 s interval); the overlay becomes a non-blocking progress card (`processed/total`, errors so far); on page mount, query the active job for the selected division and resume polling — refresh becomes harmless. Evaluate/Re-evaluate buttons disabled whenever an active job exists for the division.

**Minimal safe patch (Phase 1):** Handle the new 409 from Finding 3's lock with a specific toast ("Evaluation for this division is already running — wait for it to finish"), keeping `evaluating` state semantics unchanged.

**Test cases:**
- (Phase 1) Mock 409 → toast shown, no state corruption, button re-enabled.
- (Phase 2) Poll loop advances progress card; simulated remount with an active job resumes polling; job completion triggers `loadApplications()` refresh; failed job shows the error summary.

---

## Finding 8 — Observability gaps

**Severity:** Low

**Affected file and line:**
- `backend/services/evaluation_service.py:221` — `traceback.print_exc()` instead of `logger.exception`.
- `backend/utils/llm_client.py:97,100,137,139,178,181,208,210,307,313,327,343,346` and `backend/services/scoring.py:111` — `print()` for operational events.
- `backend/Dockerfile:50` — single-worker uvicorn (correct for now, but undocumented as a deliberate constraint).
- No per-candidate timing/progress logs, so staging freezes cannot be attributed from logs alone.

**Root cause:** Pipeline diagnostics bypass the logging framework and carry no timings, which is why this audit had to reconstruct the freeze from code reading rather than logs.

**Recommended fix / minimal safe patch:** Replace `print`/`print_exc` with module loggers; log per-candidate start/end with duration and per-stage timing at INFO. **Longer-term:** Phase 3 — structured logging, LLM latency metrics, job-level audit entries.

**Test cases:** caplog-based assertions that a batch run emits per-candidate start/finish records with durations; no `print` smoke (grep in CI).

---

## Implementation Plan

### Phase 1 — Immediate stabilization (small diff, no schema change)

| Step | Change | Files |
|---|---|---|
| 1.1 | Explicit `timeout=90`, `max_retries=0` on both LLM clients | `backend/utils/llm_client.py` |
| 1.2 | `await asyncio.to_thread(...)` around all sync heavy calls in the evaluation path | `backend/services/evaluation_service.py` |
| 1.3 | Per-candidate `SessionLocal` sessions, commit/rollback per candidate; remove batch-level shared-session commit | `backend/services/evaluation_service.py` |
| 1.4 | Per-division in-process running lock → 409 on concurrent trigger; frontend toast for 409 | `backend/routers/evaluate_batch.py`, `frontend/src/pages/recruiter/EvaluationPage.jsx` |
| 1.5 | NER model warmup thread in lifespan startup | `backend/main.py` |

Exit criteria: during a staging evaluation run, a looped `GET /api/health` answers continuously; a second evaluate click returns 409; one candidate's failure no longer corrupts the rest of the batch.

### Phase 2 — Background job + polling

| Step | Change | Files |
|---|---|---|
| 2.1 | `evaluation_jobs` table (Alembic): division, period_id, status `queued/running/completed/failed`, force, total/processed/succeeded/failed counters, errors JSON, triggered_by, timestamps. Partial unique index: one non-terminal job per division (pattern: `15e1fb0f5fe3_partial_unique_active_period.py`) | new model + migration |
| 2.2 | POST creates job, returns **202 + job_id**; pipeline runs as a background task opening its own sessions (pattern: `run_submit_anonymization` session-factory), updating counters per candidate | `backend/routers/evaluate_batch.py`, `backend/services/evaluation_service.py` |
| 2.3 | `GET /api/recruiter/evaluate/jobs/{id}` and `GET /api/recruiter/evaluate/jobs/active?division=` | `backend/routers/evaluate_batch.py` |
| 2.4 | Startup recovery: mark `running` jobs `failed ("interrupted by restart")` in lifespan | `backend/main.py` |
| 2.5 | Frontend: start job → poll ~3 s → progress card (non-blocking); on mount, resume polling of any active job for the division; buttons disabled while a job is active | `EvaluationPage.jsx`, `EvaluationRunningOverlay.jsx` (→ progress panel), `api.js` |

Exit criteria: refresh during a run shows live progress instead of a dead page; nginx 300 s timeout becomes irrelevant; duplicate jobs are impossible at the DB level.

### Phase 3 — Production hardening

- Optional dedicated worker (separate compose service consuming the job table), enabling multiple uvicorn workers for the API.
- Job cancellation endpoint + cooperative cancellation checks between candidates.
- Retry policy for transient LLM errors at the job level; stale-job watchdog.
- Structured logging + per-stage duration metrics; remove remaining `print`s.
- Compose `mem_limit` and healthcheck for the backend; explicit DB pool sizing; rate-limit the evaluate endpoint (slowapi already wired).
- Async KHS parser path on `AsyncOpenAI` (closes the Finding 2 regression class for good).

### Test plan (new — no pytest suite exists today, only `scripts/smoke_test_*.py`)

Add `backend/tests/` with pytest + httpx, mocking the LLM/NER layers:

1. `test_event_loop_responsive_during_eval` — slow mocked stage; `/api/health` < 1 s concurrently.
2. `test_evaluate_conflict_409` / `test_lock_released_on_failure` / `test_different_divisions_parallel`.
3. `test_per_candidate_transaction_isolation` — middle candidate fails; others committed; failed one leaves no partial rows.
4. `test_llm_client_timeout_config` — clients constructed with `timeout` and `max_retries=0`.
5. (Phase 2) `test_job_lifecycle`, `test_job_unique_per_division`, `test_startup_marks_interrupted_jobs_failed`, `test_jobs_active_endpoint`.
6. Keep/extend `scripts/smoke_test_evaluation.py`-style smoke flows for the 202+poll contract.

---

## Related Reports

- `docs/reports/ASYNC_DEEPSEEK_CONCURRENCY_REPORT.md` — prior fix of the same blocking-LLM-call class (scoring path); Finding 2 here is its regression on the KHS path.
- `docs/reports/phase_khs_parser_cache_rubric_gating.md` — introduction of the LLM KHS parser whose sync client call is Finding 2.
- `docs/reports/phase_8_ner_evaluation_flow_adjustment.md` — submit-time NER background task whose session-factory pattern Phases 1.3/2.2 reuse.
