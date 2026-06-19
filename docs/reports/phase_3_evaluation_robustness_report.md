# Phase 3 — Evaluation Robustness & Ops Hardening — Implementation Report

- **Date:** 2026-06-19
- **Branch:** `fix/backend-evaluation`
- **Status:** Phase 3 **closed at W1 + W2 + W5 by decision.** W1 ✅ · W2 ✅ · W5 ✅ implemented and tested · W3 ⬜ out of scope (deferred) · W4 ⬜ out of scope (deferred) · W6 ⏸ deferred (decision-gated)
- **Commits (local, not pushed):**
  - `475b4a1` — `perf(eval): hold write tx only around score persist` (W1)
  - `8df85b3` — `feat(eval): cancellable evaluation jobs` (W2)
  - `b10ef33` — `chore(ops): pre-bake NER model, mem limits, healthchecks, leveled logs` (W5)

> Grounding note: every result below is a real run captured in this environment
> (Windows, SQLite dev DB). Where something could not be run here — chiefly the
> W5 Docker image build, which needs a running Docker daemon that was not
> available — it is called out explicitly rather than assumed green.

---

## 1. Summary

Phase 3 set out to make a long-running evaluation **interruptible, self-healing,
and operationally boring** while staying **in-process** on the single uvicorn
worker. This pass delivered three of the planned workstreams:

- **W1** narrowed the per-candidate write transaction so the DB write lock is
  held only around the final score persist, not across the slow LLM/NER/KHS
  work. This is the biggest lever for the cross-writer contention seen locally.
- **W2** added cooperative job cancellation: a recruiter can stop a running
  batch; the in-flight candidate finishes, the rest are skipped, and the job
  ends in a terminal `cancelled` state with the division slot freed.
- **W5** hardened operations: the NER model is pre-baked into the backend image
  with Hugging Face offline at runtime, the compose stack gained memory limits +
  healthchecks + readiness-ordered startup, and logging gained an optional JSON
  format on top of the already-leveled third-party loggers.

**W3** (heartbeat + stale-job watchdog) and **W4** (async KHS parser) were
intentionally not implemented in this pass (see §6). **W6** (dedicated worker
process) remains deferred by design (see §7).

The plan's regression matrix stayed green throughout (§8).

---

## 2. Dependency on Phase 1 / Phase 2

Phase 3 builds directly on, and preserves, the Phase 1/2 foundation:

- Per-candidate `SessionLocal` sessions with isolation (a failed candidate rolls
  back only itself and leaves no partial rows).
- The `evaluation_jobs` model as the durable job source of truth, atomic
  progress counters, the partial unique index ("one non-terminal job per
  division"), and startup recovery of interrupted jobs.
- The Phase 2 `202 + job_id` contract and the ~3 s polling shape.

No Phase 1/2 invariant was removed. W1 changed transaction **scope**, not the
data model. W2 **extended** the job model and the partial-unique predicate
without changing the 202 contract or the existing uniqueness guarantee.

---

## 3. W1 — Narrow the per-candidate write transaction

**Commit:** `475b4a1` · **Migration:** none (transaction-scope change only)

### What changed
`backend/services/evaluation_service.py` — `_evaluate_one` is split into:

- **Read/compute phase:** `user` lookup, a new read-only `_find_candidate`,
  KTM, KHS resolution, NER (cache lookup or inline), and the RAG LLM call —
  reads + slow async work only, **no flushed write**. Under pysqlite a `BEGIN`
  is only emitted on the first DML, so a read-only session holds no lock and
  concurrent writers are not blocked.
- **Persist phase (short write tx):** `_ensure_candidate`, KHS cache via
  `_apply_khs_persist`, motivation-letter + CV `CandidateDocument` refresh,
  `store_evaluation_results`, and the AI-validation reset — no `await`s. The
  caller flips the application to `SCREENING` and commits immediately after, so
  the write lock is held only for that brief window.

Supporting refactors: `_resolve_khs_context` became read/compute-only and now
returns a `_persist` blob; the inline KHS parse was split into `_parse_khs_inline`
(no store) + `_apply_khs_persist` (writes in the persist phase). Cache lookups
guard on the existing Candidate, so a first-ever evaluation falls through to
inline NER/KHS and creates the row only in the persist phase.

### Files
- `backend/services/evaluation_service.py`
- `scripts/smoke_test_evaluation_w1_write_window.py` (new test)

### W1 before/after contention observation (real numbers)
A new smoke test parks a candidate inside the RAG stage (read phase complete)
and times an unrelated document-verification write from a separate session:

| Code | Verification write while a candidate is parked mid-run |
|---|---|
| **Pre-W1** (service file stashed) | **blocked > 4.0 s** — held by the per-candidate write lock from the early `_ensure_candidate` flush; the parked job ran 4.1 s and the probe never committed in-window (3 checks failed) |
| **Post-W1** | **committed in 0.0154 s** — no write lock held during compute (all checks pass) |

So an unrelated write went from blocked-for-the-candidate's-duration (~4 s, → SQLite "database is locked") to **~15 ms**.

### Tests
- `scripts/smoke_test_evaluation_w1_write_window.py` — **all pass** (probe ~15 ms;
  job completes; candidate scored + `SCREENING`; probe write durable).
- Existing evaluation suites pass unchanged (§8), including the
  failed-candidate-leaves-no-partial-rows isolation check — under W1 a failing
  candidate now fails *before* any write, so rollback is a no-op and isolation
  holds for the same reason.

---

## 4. W2 — Cooperative cancellation

**Commit:** `8df85b3` · **Migration:** `b3c5e7d9f1a2` (reversible)

### What changed
- **Model** (`backend/models/evaluation_job.py`): added `cancel_requested: bool`
  and statuses `cancelling` (non-terminal) / `cancelled` (terminal).
  `NON_TERMINAL_JOB_STATUSES` now includes `cancelling`; a `TERMINAL_JOB_STATUSES`
  tuple was added.
- **Migration** (`b3c5e7d9f1a2_add_cancellation_to_evaluation_jobs.py`): adds the
  `cancel_requested` column (`server_default=false`) and widens the partial
  unique index predicate to
  `WHERE status IN ('queued','running','cancelling')`. The `status` column is a
  plain `VARCHAR` (the `Enum` uses `native_enum=False`, and SQLAlchemy 1.4+
  defaults `create_constraint=False`, so there is **no CHECK constraint** to
  widen) — the new status *values* needed no column DDL. Reversible.
- **Endpoint** (`backend/routers/evaluate_batch.py`):
  `POST /api/recruiter/evaluate/jobs/{id}/cancel` (recruiter/super_admin) sets
  `cancel_requested=true` and flips `running → cancelling`. Contract: 404
  unknown; idempotent 200 while non-terminal; 200 no-op if already `cancelled`;
  409 if `completed`/`failed`. `_serialize_job` now exposes `cancel_requested`.
- **Runner** (`backend/services/evaluation_service.py`): `_is_cancel_requested()`
  reads the flag from a fresh short session before each candidate; flagged
  candidates are skipped (not counted), in-flight ones finish, and
  `run_evaluation_job` finalizes `status=cancelled`
  (note `"cancelled by recruiter"`) with as-processed counters
  (`processed < total`). No candidate is hard-killed.
- **Frontend**: a **Batalkan** (Cancel) control on the progress card while a job
  is active (`EvaluationProgressPanel.jsx`), calling `cancelEvaluationJob`
  (`lib/api.js`); the page keeps polling and resolves to a `cancelled` card
  (`EvaluationPage.jsx`, with `cancelling`/`cancelled` handled in terminal logic).

### Files
- `backend/models/evaluation_job.py`
- `backend/alembic/versions/b3c5e7d9f1a2_add_cancellation_to_evaluation_jobs.py` (new)
- `backend/services/evaluation_service.py`
- `backend/routers/evaluate_batch.py`
- `frontend/src/components/recruiter/EvaluationProgressPanel.jsx`
- `frontend/src/lib/api.js`
- `frontend/src/pages/recruiter/EvaluationPage.jsx`
- `scripts/smoke_test_evaluation_cancel.py` (new test)

### Tests
- `scripts/smoke_test_evaluation_cancel.py` — **all pass**. Parks candidate 1,
  cancels while running, and asserts: cancel on running → 200 + status
  `cancelling` + `cancel_requested=true`; second cancel idempotent → 200;
  terminal state `cancelled` with `total=3, succeeded=1, failed=0, processed=1`
  (stopped early); exactly one candidate committed (`SCREENING` + composite),
  two skipped (`VERIFIED`, no Candidate rows); the division slot freed (new
  trigger → 202); cancel on an already-cancelled job → 200 no-op; cancel of an
  unknown job → 404. Runner log: `cancelled: ok=1 failed=0 skipped=2`.
- Migration validated both single-step (`downgrade -1` → `upgrade head`) and as a
  full chain on a throwaway DB (`base → head → base → head`) — clean each way.
- Frontend `lint` + `build` clean.

---

## 5. W5 — Ops hardening

**Commit:** `b10ef33` · **Migration:** none

### What changed
- **NER model pre-baked into the image** (`backend/Dockerfile`): a build-time
  `RUN` downloads the IndoBERT model into `settings.ner_cache_dir`
  (`/app/models/ner`, the same path the runtime loader reads). The download is
  ordered **before** the new `ENV HF_HUB_OFFLINE=1` / `TRANSFORMERS_OFFLINE=1`
  (so the build may reach the Hub) and the model dir is **dropped from VOLUME**
  (writes to a path later declared `VOLUME` are discarded; the model is
  immutable image content, not runtime state). Runtime therefore makes **zero**
  `huggingface.co` calls.
- **`.dockerignore`** (new, root + `frontend/`): excludes the host model cache,
  dev DB, uploads, `.git`, and `.env` from the build context — without it the
  whole repo (incl. the ~1.3 GB host model cache) would ship to the daemon and
  defeat the pre-bake.
- **Compose drops the `./models` bind mount**: a bind mount over `/app/models`
  would shadow the baked-in model with an empty host dir and force a fresh
  download on boot. The model now lives in the image; rebuild to update it.
- **Compose mem limit + healthchecks** (`docker-compose.yml`):
  - backend `mem_limit: ${BACKEND_MEM_LIMIT:-3g}` (headroom over the ~1.3 GB
    model + PyTorch + app).
  - backend `healthcheck` on `/api/health` via stdlib `urllib` (the slim image
    has no curl); db `healthcheck` via `pg_isready`.
  - `depends_on` now gates on `condition: service_healthy`
    (db → backend → frontend), removing the boot-order race. `restart:
    unless-stopped` retained on all services.
- **Logging** (`backend/main.py`): an optional one-line-JSON format behind
  `LOG_FORMAT=json` (default `text` unchanged). The third-party WARNING pins
  from the prior `4c364c9` cleanup are kept (`backend.*` INFO;
  `sqlalchemy`/`httpx`/`huggingface_hub`/`transformers`/`alembic.runtime.plugins`
  WARNING).
- **`.env.example`**: documented `LOG_FORMAT` and `BACKEND_MEM_LIMIT`.

### Files
- `backend/Dockerfile`, `docker-compose.yml`, `.dockerignore`,
  `frontend/.dockerignore`, `backend/main.py`, `.env.example`

### Tests (what was and was not run here)
The **Docker daemon was not available** in this environment, so the full image
build + container boot could not be exercised here. What was validated:

- `docker compose config` renders valid: `mem_limit: "3221225472"` (3 GiB from
  `${BACKEND_MEM_LIMIT:-3g}`), backend `/api/health` healthcheck, db
  `pg_isready` healthcheck, and `condition: service_healthy` ordering all
  present. (Unset-var warnings for `POSTGRES_*` / `VITE_API_BASE_URL` are
  expected — they come from the operator's deploy `.env`.)
- Logging verified in-process: default `text` keeps third-party loggers at
  WARNING and `backend.*` at INFO; `LOG_FORMAT=json` emits a valid JSON line
  (`{ts, level, logger, msg}`).
- The Dockerfile build snippet's config resolution checked
  (`settings.ner_model_name` / `settings.ner_cache_dir` resolve to the expected
  values) without performing the download.

**Operator verification (needs a running daemon)** — left for the deploy host:

```bash
# Build with the model baked in (first build downloads ~1.3 GB):
docker compose build backend
# Boot and confirm NO huggingface.co calls in the logs and a healthy container:
docker compose up -d
docker compose logs backend | grep -i huggingface   # expect: no hits
docker inspect --format '{{.State.Health.Status}}' <backend-container>  # expect: healthy
# Watch memory stays under the limit during a batch:
docker stats <backend-container>
```

---

## 6. Out of scope for Phase 3 (deferred by decision)

Phase 3 is **closed at W1 + W2 + W5.** W3 and W4 were deliberately dropped from
this phase; they remain valid future work but are not part of Phase 3. Both are
independent and can be picked up later without reworking W1/W2/W5.

- **W3 — heartbeat + stale-job watchdog.** Not implemented. Phase 2 startup
  recovery still catches jobs orphaned by a restart, but a job that wedges
  **without** a restart is not yet auto-failed. No model/migration or watchdog
  task was added; there is consequently no `heartbeat_at` column and no watchdog
  threshold env flag yet. (See the remaining-risk note in §9.)
- **W4 — async KHS parser.** Not implemented. The KHS parse path still uses the
  sync DeepSeek client offloaded via `asyncio.to_thread` (the Phase 1 stopgap),
  which keeps it off the event loop but does not yet use the native `AsyncOpenAI`
  client. W1 did split the KHS path into `_parse_khs_inline` (compute) +
  `_apply_khs_persist` (write), which is a clean seam should W4 be revisited.

---

## 7. W6 — Dedicated worker process (deferred)

W6 remains **deferred by design**. It is gated on a real trigger: either moving
the API to multiple uvicorn workers/replicas, or — on Postgres — evaluation load
still degrading API responsiveness in practice. Neither holds today.

The decisive cost is memory: the API process already needs the IndoBERT model
resident for candidate-upload NER, so a separate worker process would load the
**~1.3 GB model a second time** — a real burden on a single VPS. With W1 having
narrowed the write window (the actual source of the contention observed
locally), the in-process model is sufficient. If/when triggered, the design
stays broker-free: a worker claims `queued` jobs via
`SELECT … FOR UPDATE SKIP LOCKED`, owns its own startup recovery and (once built)
the W3 heartbeat; the API only creates jobs and serves polling.

---

## 8. Regression matrix (real results)

All run on the SQLite dev DB in this environment:

| Gate | Result |
|---|---|
| `python -m compileall backend` | OK |
| `smoke_test_evaluation` | PASS |
| `smoke_test_evaluation_stabilization` | PASS |
| `smoke_test_evaluation_jobs` | PASS |
| `smoke_test_ner_evaluation_flow` | PASS |
| `smoke_test_ai_validation` | PASS |
| `smoke_test_evaluation_w1_write_window` (new, W1) | PASS |
| `smoke_test_evaluation_cancel` (new, W2) | PASS |
| `alembic` up/down (single-step + full `base↔head` chain) | clean |
| frontend `lint` | clean |
| frontend `build` | clean |
| `docker compose config` | valid (image build/boot not run — no daemon) |

---

## 9. Remaining risks

- **Wedge without restart (W3 gap).** A job that hangs mid-run with no restart is
  not auto-failed yet; it holds its division slot until a restart triggers Phase
  2 recovery. Mitigation until W3: restart the backend, or (super-admin) clear
  the stuck `evaluation_jobs` row.
- **KHS parse still sync-via-thread (W4 gap).** Functionally correct and off the
  event loop, but it occupies a threadpool thread for the DeepSeek round-trip; a
  burst of KHS-cache-miss candidates can saturate the default threadpool. Bounded
  in practice by `_effective_concurrency()` and the LLM concurrency cap.
- **W5 image build unverified here.** The Dockerfile/compose changes were
  validated by `docker compose config`, in-process logging checks, and the build
  snippet's config resolution, but not by an actual `docker compose build`/`up`
  (no daemon). The first real build must confirm the model downloads into
  `/app/models/ner` and that boot logs show no `huggingface.co` calls — see the
  operator commands in §5.
- **`mem_limit` tuning.** `3g` is a default; a VPS with < ~2.5 GB free could
  OOM-kill the backend during the model load spike. Operators on small hosts
  should set `BACKEND_MEM_LIMIT` deliberately and watch `docker stats` on the
  first batch.

---

## 10. Operational runbook (env flags)

| Flag | Default | Effect |
|---|---|---|
| `HF_HUB_OFFLINE` | `1` **in the image** (unset locally) | Skips all huggingface.co round-trips at boot. The image sets it (and `TRANSFORMERS_OFFLINE`) because the model is pre-baked; locally, leave unset for the first run so the model can download, then set `=1` for a quiet boot. |
| `TRANSFORMERS_OFFLINE` | mirrors `HF_HUB_OFFLINE` | Set together with the above (the image sets both; `backend/config.py` also propagates it from `HF_HUB_OFFLINE`). |
| `NER_WARMUP` | `1` | Background-loads the ~1.3 GB model at boot so the first evaluation doesn't pay for it. Set `0` for fast `uvicorn --reload` iteration. |
| `BACKEND_MEM_LIMIT` | `3g` | Hard memory cap on the backend container. Keep comfortably above ~2 GB (model + PyTorch + app). |
| `LOG_FORMAT` | `text` | `json` emits one JSON object per log line for staging/prod aggregation. |

- **Watchdog threshold:** not applicable yet — the stale-job watchdog (W3) is not
  implemented, so there is no threshold flag in this build. When W3 lands, this
  table should gain its interval/threshold flag.
- **Cancelling a job (W2):** `POST /api/recruiter/evaluate/jobs/{id}/cancel`, or
  the **Batalkan** button on the evaluation progress card. The in-flight
  candidate finishes; the job ends `cancelled` with the slot freed.
- **Recovering a stuck job (until W3):** restart the backend
  (`docker compose restart backend`) — Phase 2 startup recovery flips any
  non-terminal job to `failed("interrupted by restart")` and frees the slot.
