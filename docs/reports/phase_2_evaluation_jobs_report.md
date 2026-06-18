# Phase 2 — Evaluation Background Jobs + Polling

Date: 2026-06-18
Branch: `fix/backend-evaluation`
Phase: **Phase 2 — Evaluation Background Jobs + Polling**
Source of truth: [EVALUATION_FREEZE_AUDIT_REPORT.md](./EVALUATION_FREEZE_AUDIT_REPORT.md) (Implementation Plan → Phase 2; Findings 3, 4, 5, 7)
Builds on: [phase_1_evaluation_stabilization_report.md](./phase_1_evaluation_stabilization_report.md)
Status: **Implemented, verified, and smoke-tested.** One pre-existing, unrelated regression-suite failure documented below (not introduced by Phase 2).

---

## 1. Summary

Phase 1 stopped the event-loop freeze but kept the inline request/response
contract: `POST /api/recruiter/evaluate/batch` still ran the whole pipeline
inside the request (just without blocking the loop), responded `200` with the
full result, and guarded duplicates with an in-process `set`.

Phase 2 makes evaluation a **durable background job**:

- The POST now validates + resolves the eligible set synchronously (DB-only, no
  LLM), inserts an `evaluation_jobs` row, schedules the pipeline as a FastAPI
  `BackgroundTask`, and returns **202 + `job_id`** immediately.
- Duplicate triggers are blocked at the **database level** by a partial unique
  index (one non-terminal job per division); a duplicate insert raises
  `IntegrityError`, mapped to **409** — no TOCTOU window.
- The runner reuses Phase 1's **per-candidate session model** verbatim and
  advances `processed/succeeded/failed` counters with **atomic SQL increments**;
  the detailed `errors` list is written **once** at completion.
- Two polling endpoints (`GET …/jobs/{id}`, `GET …/jobs/active?division=`) expose
  live progress.
- **Startup recovery** marks any `queued`/`running` job left by a restart as
  `failed("interrupted by restart")`, freeing the division slot.
- The frontend replaces the blocking full-screen overlay with a **non-blocking
  progress card** that polls every ~3 s and **resumes polling on mount**, so a
  page refresh during a run is harmless and the nginx 300 s timeout becomes
  irrelevant. Buttons are gated while an active job exists; the Phase 1 `409`
  toast is preserved.
- The deprecated legacy `POST /api/evaluate` endpoint is **removed entirely**.
- Finding 5 is closed with explicit non-SQLite DB pool sizing.

All Phase 1 invariants (no sync heavy work on the loop, LLM `timeout=90` /
`max_retries=0`, `sqlalchemy` logger at WARNING) remain intact.

---

## 2. Dependency on Phase 1 (what it reuses)

| Phase 1 mechanism | Reused by Phase 2 |
|---|---|
| Per-candidate `SessionLocal` sessions, per-candidate commit/rollback | `_evaluate_candidate_in_session` is the same model, now driven by the job runner |
| `asyncio.to_thread` offload of all sync heavy stages inside `_evaluate_one` | Unchanged — `_evaluate_one` is called as-is |
| `_effective_concurrency()` SQLite-serialize guard (`asyncio.Semaphore`) | Unchanged — used by `_run_job_candidates` |
| Session-factory background pattern (`run_submit_anonymization`) | The runner receives `SessionLocal` and opens its own sessions; only plain IDs cross the boundary |
| LLM client `timeout=90`, `max_retries=0` | Unchanged |
| Root INFO logging + `sqlalchemy` at WARNING; `alembic/env.py` no longer disables app loggers | Unchanged |
| NER warmup daemon thread in lifespan | Unchanged, runs alongside the new startup recovery |

The per-candidate transaction isolation Phase 1 built is the direct foundation
for the job runner's incremental, durable progress.

---

## 3. Goal verification (Section 1 checklist)

| Goal | Status | Evidence |
|---|---|---|
| `POST …/evaluate/batch` returns **202 + job_id** (no inline pipeline) | **Present** | `evaluate_batch.py` `status_code=HTTP_202_ACCEPTED`; body carries `job_id`; pipeline scheduled via `background_tasks.add_task(run_evaluation_job, …)` |
| `evaluation_jobs` table with planned columns | **Present** | Model + migration; fresh-DB inspect shows all 15 columns |
| Partial unique index: one non-terminal job per division | **Present** | `uq_one_active_job_per_division ON evaluation_jobs (division) WHERE status IN ('queued','running')` |
| Duplicate → **409** via caught `IntegrityError` (TOCTOU-safe, not app-level SELECT) | **Present** | `db.commit()` in `try`, `except IntegrityError: rollback → 409`; no "is a job active?" pre-check guards the insert |
| Runner reuses Phase 1 per-candidate session model (no shared session; per-candidate commit/rollback; SQLite guard) | **Present** | `_evaluate_candidate_in_session` opens/commits/rolls back/closes its own session; `_effective_concurrency()==1` on SQLite |
| Counters via **atomic SQL increments** (no read-modify-write) | **Present** | `_increment_job_counter`: `UPDATE … SET processed = processed + 1, …` |
| `errors` written **once** at completion (no concurrent append) | **Present** | Errors collected locally in `_run_job_candidates`; `_finalize_job` writes `job.errors = errors` once |
| Polling endpoints `GET …/jobs/{id}` and `GET …/jobs/active?division=` | **Present** | Both in `evaluate_batch.py`; `active` declared before `{job_id}` |
| Startup recovery → `failed("interrupted by restart")` | **Present** | `recover_interrupted_jobs` called in lifespan |
| Frontend: non-blocking progress card, ~3 s polling, resume-on-mount, buttons gated, `409` toast preserved | **Present** | `EvaluationProgressPanel.jsx`; `JOB_POLL_INTERVAL_MS=3000`; `resumeActiveJob` in mount/division effect; `controlsBusy` includes `hasActiveJob`; `409` branch in `runEvaluate` |
| Legacy `/api/evaluate` removed (code, registration, frontend caller, tests, docs) | **Present** | `backend/routers/evaluation.py` deleted; not imported in `main.py`; `runEvaluation` removed from `api.js`; grep clean |
| Finding 5: explicit non-SQLite DB pool sizing | **Present** | `database.py`: `pool_size=10, max_overflow=20` (non-SQLite branch) |
| Phase 1 invariants intact (no sync work on loop; LLM `timeout=90`/`max_retries=0`; `sqlalchemy` WARNING) | **Present** | `llm_client.py` `LLM_TIMEOUT_SECONDS=90.0`, `LLM_MAX_RETRIES=0`; `main.py` sqlalchemy WARNING; `to_thread` offload unchanged; verified live by `/api/health` responsiveness test (worst 0.003–0.004 s during a 1.5 s sync stage) |

No production-code defects were found during verification. The only fix made
this pass was to a regression **test** broken by the deliberate contract change
(Section 17).

---

## 4. Files changed

### New

| File | Purpose |
|---|---|
| `backend/models/evaluation_job.py` | `EvaluationJob` ORM model, `EvaluationJobStatus` enum, `NON_TERMINAL_JOB_STATUSES` |
| `backend/alembic/versions/a2f4d6b8c0e1_add_evaluation_jobs.py` | Creates `evaluation_jobs` + the partial unique index |
| `frontend/src/components/recruiter/EvaluationProgressPanel.jsx` | Non-blocking progress card bound to a real job's counters |
| `scripts/smoke_test_evaluation_jobs.py` | Primary Phase 2 smoke + race suite |

### Modified

| File | Change |
|---|---|
| `backend/routers/evaluate_batch.py` | POST → `202 + job_id`; `IntegrityError → 409`; `select_evaluation_targets` + `run_evaluation_job` scheduling; `GET …/jobs/{id}` and `GET …/jobs/active`; `_serialize_job` |
| `backend/services/evaluation_service.py` | `select_evaluation_targets` (sync selection); `run_evaluation_job` + `_mark_job_running` / `_run_job_candidates` / `_evaluate_candidate_in_session` / `_increment_job_counter` / `_finalize_job`; `recover_interrupted_jobs` |
| `backend/main.py` | Lifespan calls `recover_interrupted_jobs(SessionLocal)` and logs the recovered count |
| `backend/database.py` | Finding 5: `pool_size=10, max_overflow=20` for non-SQLite engines |
| `backend/models/__init__.py` | Register `EvaluationJob` so it is created/migrated |
| `frontend/src/lib/api.js` | `evaluateBatch` documented for 202 + 409; new `getEvaluationJob`, `getActiveEvaluationJob`; legacy `runEvaluation` removed |
| `frontend/src/pages/recruiter/EvaluationPage.jsx` | Progress card, ~3 s polling, resume-on-mount, button gating, 409 toast, terminal-job toasts |
| `docs/API_REFERENCE.md` | 202 contract, job endpoints, 409, legacy-removal note |
| `docs/ARCHITECTURE.md`, `docs/MODULE_ANALYSIS.md`, `docs/ISSUES_AND_NOTES.md` | Reconciled to the job model + legacy removal |
| `docs/FLOW_DIAGRAMS.md` | Batch-evaluation flowchart updated to the 202 + job + background-runner + polling path (was the inline 200 contract) — updated this pass |
| `scripts/smoke_test_evaluation.py`, `scripts/smoke_test_ner_evaluation_flow.py`, `scripts/smoke_test_document_review_flow.py`, `scripts/smoke_test_phase_enforcement.py` | Regression suites updated to the 202 + job contract |
| `scripts/smoke_test_evaluation_stabilization.py` | Updated to the 202 + job contract (see Section 17) — updated this pass |

### Deleted

| File | Reason |
|---|---|
| `backend/routers/evaluation.py` | Legacy `POST /api/evaluate` removed |
| `frontend/src/components/recruiter/EvaluationRunningOverlay.jsx` | Replaced by `EvaluationProgressPanel.jsx` |
| `scripts/integration_test_phase3.py` | Obsolete (referenced the removed legacy flow) |

---

## 5. Data model — `evaluation_jobs`

| Column | Type | Notes |
|---|---|---|
| `id` | Integer PK | autoincrement |
| `division` | Enum(Division), `native_enum=False`, len 20 | stored as lowercase **value** (`big_data`…) via `values_callable`; indexed |
| `period_id` | Integer FK → `recruitment_periods.id` (`ON DELETE SET NULL`) | nullable — evaluation may run with no active period |
| `status` | Enum(EvaluationJobStatus), `native_enum=False`, len 20 | lowercase values `queued`/`running`/`completed`/`failed`; default `queued` |
| `force` | Boolean | re-evaluate already-scored candidates |
| `total` | Integer | eligible candidates resolved at trigger time |
| `processed` | Integer | atomic `+1` per settled candidate |
| `succeeded` | Integer | atomic `+1` per success |
| `failed` | Integer | atomic `+1` per failure |
| `errors` | JSON | list of `{application_id, error}`; written once at completion |
| `triggered_by` | Integer FK → `users.id` (`ON DELETE SET NULL`) | nullable |
| `created_at` | DateTime | row insert time |
| `started_at` | DateTime | set when flipped to `running` |
| `finished_at` | DateTime | set at terminal state (incl. recovery) |
| `note` | String(255) | free-form; recovery sets `"interrupted by restart"` |

`NON_TERMINAL_JOB_STATUSES = (QUEUED, RUNNING)` is shared by the runner, the
polling endpoints, and startup recovery so they agree on what "active" means.

**Indexes**
- `ix_evaluation_jobs_division` — non-unique, on `division`.
- `uq_one_active_job_per_division` — **partial unique**:
  `UNIQUE (division) WHERE status IN ('queued', 'running')`.

The index predicate's string literals match the on-disk lowercase enum values
(model uses `values_callable`), so the constraint actually fires on both SQLite
and Postgres.

---

## 6. Migration

- **Revision:** `a2f4d6b8c0e1` (`add evaluation_jobs table + partial unique index`)
- **Down-revision:** `a1b2c3d4e5f6`
- **Upgrade:** `op.create_table("evaluation_jobs", …)`, the non-unique division
  index via `batch_alter_table`, then
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_job_per_division ON
  evaluation_jobs (division) WHERE status IN ('queued','running')`.
- **Downgrade:** drop the partial index, drop the division index, drop the table.

**SQLite/Postgres note.** Unlike `15e1fb0f5fe3_partial_unique_active_period.py`
(Postgres-only, because the pre-existing `recruitment_periods` table already
held duplicate `is_active=FALSE` rows), `evaluation_jobs` is a brand-new empty
table and terminal rows are *excluded* from the predicate, so the partial
unique index creates cleanly on both engines, which share the
`CREATE UNIQUE INDEX … WHERE` syntax. Verified on a fresh SQLite DB:

```
upgrade head            → a1b2c3d4e5f6 -> a2f4d6b8c0e1 (clean)
evaluation_jobs present : True
columns                 : id, division, period_id, status, force, total,
                          processed, succeeded, failed, errors, triggered_by,
                          created_at, started_at, finished_at, note
INDEX uq_one_active_job_per_division ::
   CREATE UNIQUE INDEX uq_one_active_job_per_division
   ON evaluation_jobs (division) WHERE status IN ('queued', 'running')
downgrade -1            → table dropped (present: False)
re-upgrade head        → recreated cleanly
```

---

## 7. Endpoint behavior

### `POST /api/recruiter/evaluate/batch` → 202

Body: `{ division: Division, application_ids: [int]|null, force: bool }`
(`division` is Pydantic-validated, so unknown values are a clean 422).

Synchronously (in-request, DB-only): rubric lookup + validation
(`select_evaluation_targets`), eligible-status filter (VERIFIED, +SCREENING with
`force`), already-scored skip, skip counters; then insert the job and schedule
the runner. Response envelope:

```json
{
  "success": true,
  "data": { "job_id": 42, "status": "queued", "total": 5 },
  "job_id": 42, "status": "queued", "total": 5,
  "evaluated_count": 5, "skipped_count": 2,
  "skipped_already_scored_count": 2,
  "skipped_unverified_count": 0,
  "skipped_correction_count": 0,
  "warning": "Evaluasi dijalankan di luar window evaluasi resmi.",
  "error": null
}
```

`evaluated_count` is the number **queued** at trigger time, not a success count.
`warning` is the Task 13.2.2 soft phase warning (the job still runs).

### `GET /api/recruiter/evaluate/jobs/{job_id}` → 200 / 404

Returns `_serialize_job`: `{ id, division, status, total, processed, succeeded,
failed, errors, force, created_at, started_at, finished_at, note }`. `404` if
not found.

### `GET /api/recruiter/evaluate/jobs/active?division=big_data` → 200

Returns the most recent non-terminal job for the division, or an explicit
`{ "data": null }` (HTTP 200) when none. Declared **before** `/{job_id}` so
`active` is never parsed as an id. The frontend calls this on mount to resume
polling after a refresh.

### 409 path

The insert is the guard. `db.add(job); db.commit()` inside `try`; a second
non-terminal job for the same division violates `uq_one_active_job_per_division`
→ `IntegrityError` → `db.rollback()` → `409` with detail "Evaluation for this
division is already running…". There is **no** app-level "is a job active?"
SELECT used as the primary guard, so there is no check-then-insert race.

---

## 8. Background execution mechanism

The runner is scheduled with FastAPI `BackgroundTasks`:

```python
background_tasks.add_task(
    run_evaluation_job, job_id, division_value,
    targets["application_ids"], targets["rubric_id"], SessionLocal,
)
```

Only plain values cross the boundary (`job_id`, division string, ID list,
rubric id, the `SessionLocal` factory) — never ORM instances bound to the
request session, mirroring `run_submit_anonymization`. `run_evaluation_job`
owns the full lifecycle: `_mark_job_running` (stamp `started_at`) →
`_run_job_candidates` (bounded-concurrency `_evaluate_candidate_in_session`
over per-candidate sessions, atomic counter bump after each) → `_finalize_job`
(terminal state + `errors` once + `finished_at`). It **never raises**: an
orchestration-level failure is caught and the job is finalized `failed`, so the
division's partial-unique slot is always released.

**Why in-process, not a broker.** The production deployment is a single-worker
uvicorn container (`backend/Dockerfile`); an in-process BackgroundTask plus a
DB-backed job row is sufficient and durable enough for the lab's load, and
avoids introducing Redis/Celery/extra workers. A dedicated worker (which would
also enable multiple API workers) is explicitly deferred to Phase 3.

---

## 9. Counter transactionality

- **Atomic increments.** `_increment_job_counter` issues
  `UPDATE evaluation_jobs SET processed = processed + 1, (succeeded|failed) =
  (…)+1 WHERE id = :id` in its own short session. The increment is computed by
  the database, so concurrent candidate coroutines (Postgres) cannot lose
  updates — no read-modify-write, no `SELECT … FOR UPDATE`.
- **`errors` written once.** The per-candidate `{application_id, error}` entries
  are accumulated in a local list inside `_run_job_candidates` and handed to
  `_finalize_job`, which assigns `job.errors = errors` a single time. No
  coroutine ever reads-modifies-writes the JSON column, so there is no
  concurrent-append/lost-write hazard.
- **Final reconciliation.** `_finalize_job` also sets `succeeded`/`failed` to the
  authoritative totals (`len(results)`/`len(errors)`) and `processed =
  succeeded + failed`, so even a (hypothetically) missed live increment cannot
  leave the terminal row out of step. The smoke test asserts the live counters
  and the terminal totals agree (`processed=3, succeeded=2, failed=1`).

---

## 10. Startup recovery

`recover_interrupted_jobs(SessionLocal)` runs in the lifespan after migrations
and rubric seeding. Any job still `queued`/`running` after a boot means the
worker died mid-run (crash/deploy): it can never progress and is holding the
division's slot. Recovery flips each to `failed`, sets
`note="interrupted by restart"` and `finished_at`, commits, and returns the
count (logged + printed). The slot frees and recruiters can re-trigger.

Verified: a seeded `running` job becomes `failed` with the expected note and a
set `finished_at`; `recover_interrupted_jobs` returns `1`.

---

## 11. DB pool change — Finding 5

`backend/database.py`, non-SQLite branch only:

```python
engine_kwargs["pool_pre_ping"] = True
engine_kwargs["pool_size"] = 10
engine_kwargs["max_overflow"] = 20
```

This replaces SQLAlchemy's default `5 + 10` ceiling with a deliberate `10 + 20`,
giving headroom for the job runner's short-lived per-candidate sessions, the
frontend's ~3 s polling, and concurrent recruiter/candidate traffic, while
staying well under Postgres' default `max_connections`. SQLite (dev/test) keeps
its existing kwargs untouched. Closes Finding 5's "explicit pool sizing"
recommendation; the bulk of the original risk was already removed by Phase 1's
per-candidate sessions (connections held seconds, not minutes).

---

## 12. Legacy `/api/evaluate` removal

- **Deleted:** `backend/routers/evaluation.py` (the `POST /api/evaluate` +
  `GET /api/evaluate/status` router).
- **Registration dropped:** `main.py` no longer imports or includes it.
- **Frontend caller removed:** `runEvaluation` deleted from `api.js`.
- **Docs reconciled:** `API_REFERENCE.md`, `MODULE_ANALYSIS.md`,
  `ISSUES_AND_NOTES.md` note the removal and point to
  `POST /api/recruiter/evaluate/batch`.

Proof — grep for `api/evaluate` excluding `evaluate/batch` and `evaluate/jobs`
across `backend frontend scripts docs`:

```
No matches found
```

The only remaining `runEvaluation` / `EvaluationRunningOverlay` references are
in historical report docs (the audit report and earlier redesign/inventory
reports) that describe the prior state, plus the removal notes themselves — no
live code references remain.

---

## 13. Frontend changes

- **`EvaluationProgressPanel.jsx` (new).** Inline, non-blocking card bound to a
  real job's counters: title/subtitle by status, `processed/total` progress bar,
  Processed/Succeeded/Failed tiles, and the first few `errors`. Renders in the
  page flow — recruiters keep working while a job runs.
- **`EvaluationPage.jsx`.**
  - `JOB_POLL_INTERVAL_MS = 3000`; `pollJobOnce` updates the job and stops on a
    terminal state, firing success/warning/error toasts and refreshing the
    queue.
  - `resumeActiveJob(division)` runs on mount and on division change
    (`getActiveEvaluationJob`), so a refresh re-discovers a running job (its own
    or another recruiter's) and resumes polling — a page refresh is harmless.
  - `controlsBusy = triggering || hasActiveJob || loading || periodLoading`
    gates Evaluate / Re-evaluate / Force while an active job exists.
  - The Phase 1 `409` branch is preserved: a duplicate trigger shows the
    "already running" toast and calls `resumeActiveJob` instead of corrupting
    state.
  - The poller is stored in a `useRef` and cleared on unmount/division change.
- **`api.js`.** `evaluateBatch` surfaces `job_id`/`status` and still throws an
  `ApiError` with `status === 409`; `getEvaluationJob(jobId)` and
  `getActiveEvaluationJob(division)` added; legacy `runEvaluation` removed.
- **Removed:** `EvaluationRunningOverlay.jsx` (the blocking full-screen overlay
  with fake steps).

---

## 14. Test results

All commands run with the venv Python (3.12.6); dev DB is SQLite, so the runner
serializes candidates (`_effective_concurrency()==1`).

### Primary — `python -m scripts.smoke_test_evaluation_jobs` — **36/36 PASS**

Covers: `202 + job_id` (status `queued`, `total=3`); duplicate same-division →
`409` ("already running"); different division while active → `202`;
`GET …/jobs/{id}` progress + terminal state (`started_at`/`finished_at` set);
`GET …/jobs/active` returns the running job and `null` when none; real 3-candidate
run with the middle LLM call raising → `total=3, succeeded=2, failed=1`, exactly
one `errors` entry for the middle app, the two successes persisted as `SCREENING`
with `composite_score=82.0` + dimension scores, the failure left `VERIFIED` with
**zero** partial Candidate rows; `queued → running → completed` transition;
**two concurrent same-division POSTs → exactly one 202, one 409** (held via
`asyncio.Event`); **slot released on failure** (a failing runner → next
same-division POST `202`); startup recovery; and `/api/health` responsive
throughout (44 samples, **worst 0.004 s** while a 1.5 s sync stage ran).

### `python -m scripts.smoke_test_evaluation_stabilization` — **25/25 PASS** (updated this pass)

LLM clients `timeout==90.0` / `max_retries==0` (sync+async); DB-level `409` on
duplicate; different division `202`; `/api/health` responsive while a job is held
(0.002 s); held first request `202`; failing job reaches terminal `failed` and
the slot frees (`202`); real run isolation (`succeeded=2, failed=1`, one error
for the middle app, no partial rows); `/api/health` worst 0.003 s during the real
run. (The single `RuntimeError: smoke: intentional candidate failure` traceback
in the log is the *expected* middle-candidate failure logged via
`logger.exception` — all assertions pass.)

### `python -m scripts.smoke_test_evaluation` — **all checks PASS (39/39)**

Full flow on the 202 contract: empty-rubric `400`; eval `202` → job `completed`,
`succeeded==1`; result detail + KHS metadata; academic vs non-academic KHS
gating; status → `screening`; normal re-run skips scored, `force` re-evaluates;
bulk announce + candidate result visibility; KHS cache invalidation.

### `python -m scripts.smoke_test_ner_evaluation_flow` — **all checks PASS (39/39)**

Cache-hit, missing-ML fallback, full-inline fallback, document-review/correction
skip paths, and stale-cache invalidation on CV replacement — all on the `202`
contract.

### `python -m scripts.smoke_test_applications` — **pre-existing FAILURE, unrelated to Phase 2**

Fails at `r.json()["detail"]["missing"]` → `KeyError: 'missing'`. The seeded user
has `ipk: null`, so submit hits the **profile-completion gate** first, whose
`400` detail does not carry a `missing` key (it reports `missing_fields`). This
is the same IPK-gate shape mismatch the Phase 1 report flagged for the NER test
(commit `82520b4`, predating Phase 1); `scripts/smoke_test_applications.py` is
**untouched** by both Phase 1 and Phase 2 (`git diff main...HEAD` and
`git status` both empty for it), and Phase 2 changed nothing in the
applications/submit/profile path. Not fixed here (out of Phase 2 scope — see
Section 18); the one-line `ipk` seed Phase 1 applied to the NER test would
resolve it if desired.

### Static / build

| Check | Result |
|---|---|
| `python -m compileall backend scripts` | clean (exit 0) |
| `alembic upgrade head` / `downgrade -1` / re-`upgrade` on fresh SQLite DB | clean; table + partial unique index correct (Section 6) |
| `grep -rn "api/evaluate"` (excl. `evaluate/batch`, `evaluate/jobs`) over `backend frontend scripts docs` | **No matches** |
| `eslint` on `EvaluationPage.jsx`, `EvaluationProgressPanel.jsx`, `api.js` | clean (exit 0) |
| `npm run build` | success (only the pre-existing >500 kB chunk-size warning) |

### Race tests (Section 3.2)

The recommended race tests were implemented **inside the smoke suites** (no
separate pytest harness was introduced this pass — see Section 18): two
concurrent same-division POSTs → exactly one 202/one 409, and slot-release on
failure, both held open with `asyncio.Event`, in
`smoke_test_evaluation_jobs.py` (and again in `smoke_test_evaluation_stabilization.py`).
Both pass.

---

## 15. Manual verification

- **Backend boot.** With migrations applied, the lifespan runs rubric seeding,
  then `recover_interrupted_jobs` (prints `[OK] No interrupted evaluation jobs
  to recover`, or the recovered count), then starts the NER warmup daemon — all
  observed via the smoke runs and the startup path. The recovery routine was
  exercised directly (seeded `running` job → `failed("interrupted by restart")`).
- **Event-loop responsiveness during a run.** Confirmed quantitatively rather
  than by eyeballing: `/api/health` stayed at **0.003–0.004 s** worst-case across
  44 samples while a job ran a 1.5 s sync stage per candidate — proving the loop
  is never blocked (the Phase 1 `to_thread` offload still holds under the runner).
- **Resume on refresh (logic).** `resumeActiveJob` is wired into the mount /
  division-change effect and `getActiveEvaluationJob` returns the running job;
  the smoke suite verifies the server side (`jobs/active` returns the running job
  and `null` when none). A live browser click-through against a running backend
  was **not** performed this pass.
- **Duplicate trigger / gating (logic).** The `409` path and `controlsBusy`
  gating are present and unit-exercised server-side; the visual toast/disabled-
  button states were verified by reading the component wiring, not a live UI run.

---

## 16. Fixes during verification

**`scripts/smoke_test_evaluation_stabilization.py` updated to the Phase 2
contract (test-only).** The committed Phase 1 stabilization suite asserted the
*old* inline contract: it patched `evaluate_batch_router.run_evaluation_pipeline`
(a symbol Phase 2 removed) and expected `200` with inline
`data["queued"|"results"|"errors"]`. Under Phase 2 it raised
`AttributeError: module 'backend.routers.evaluate_batch' has no attribute
'run_evaluation_pipeline'`. The invariants it guards (LLM config, division
mutual-exclusion, per-candidate isolation, event-loop responsiveness) are all
still present — only the delivery mechanism changed (inline → async job). The
fix re-points the two HTTP tests at the `202 + job_id` contract using the same
held-runner / `_await_job_terminal` patterns as the passing jobs suite:
`run_evaluation_pipeline` → `run_evaluation_job`; `200` → `202` + poll-to-terminal;
the in-process-lock release test → a failing-runner job reaching `failed` and the
partial-unique slot freeing. (A latent deadlock in the first draft — awaiting a
different-division POST inline while its globally-patched held runner blocked on
the not-yet-set release event — was found and fixed by driving that POST as a
task and releasing before awaiting.) Result: **25/25 PASS**. No production code
was changed for this.

No production-code correctness fixes were necessary: counters are atomic, the
409 is DB-enforced via caught `IntegrityError`, and the runner always reaches a
terminal state (releasing the slot) via its catch-all finalize.

---

## 17. Deviations / open items

- **No standalone `backend/tests/` pytest harness** was added this pass. The
  audit's suggested pytest cases (and the Section 3.2 race tests) are implemented
  as `asyncio.Event`-held checks inside the smoke suites instead, which the
  project already uses as its test convention. A formal pytest harness remains a
  reasonable future addition.
- **`smoke_test_applications.py` left red** — pre-existing, unrelated IPK
  profile-gate shape mismatch (Section 14). Documented and flagged rather than
  silently patched, to avoid expanding Phase 2's scope into the applications
  flow.
- **Live browser walk-through not performed** — frontend behavior verified by
  server-side smoke assertions + component wiring review (Section 15), not a
  Playwright/manual click-through against a running stack.

---

## 18. Intentionally NOT implemented (Phase 3)

- Dedicated worker process / job broker (Redis/Celery), and the multiple-uvicorn-
  worker API that a separate worker would enable.
- Job cancellation endpoint + cooperative cancellation between candidates.
- Job-level retry policy for transient LLM errors; stale-job watchdog.
- Async KHS parser path on `AsyncOpenAI` (closes the Finding 2 regression class
  for good).
- Structured logging + per-stage LLM latency metrics; removing the remaining
  `print`s; job-level audit-log entries.
- Compose `mem_limit` / `deploy.resources` + a backend container healthcheck.

---

## 19. Remaining risks

- **Single-process durability boundary.** The runner is an in-process
  BackgroundTask; a crash mid-run loses in-flight candidates of the current job.
  This is bounded by per-candidate commits (earlier candidates stay persisted)
  and by startup recovery (the job is marked `failed`, slot freed), but the
  partially-done job must be re-triggered. Acceptable for single-worker; revisit
  with the Phase 3 worker.
- **No cancellation.** A wrongly-triggered large batch runs to completion; the
  only lever is a restart (→ recovery marks it `failed`).
- **SQLite serializes candidates** in dev/test; Postgres keeps the 5-way LLM
  overlap. Wall-clock characteristics differ between the two.
- **Partial-unique guard is per-database**, which is exactly right for one DB;
  it (correctly) does not constrain anything cross-database.
- **Polling load.** ~3 s polling per active recruiter is light, but the new
  `jobs/{id}`/`jobs/active` endpoints are not rate-limited; the `10 + 20` pool
  has ample headroom for the lab's scale.

---

## 20. Phase 3 readiness

Phase 2 leaves a clean seam for Phase 3:

- `evaluation_jobs` is already the durable, pollable source of truth — a separate
  worker process can consume `queued` rows from the same table with no schema
  change, at which point the API can run multiple uvicorn workers (the DB-level
  partial-unique guard already works across processes).
- Counters and `errors` are transactionally safe, so a worker/watchdog can update
  them concurrently.
- `note` + `finished_at` + the recovery routine give the hooks a watchdog needs
  for stale-job detection and cancellation messaging.
- The frontend already models evaluation as a long-running, resumable job, so
  cancellation and richer progress are additive UI changes, not a rewrite.
