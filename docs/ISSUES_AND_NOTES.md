# Issues & Notes

A consolidated list of bugs, gaps, edge cases, and TODOs discovered while writing this documentation. Each entry links to source.

> Originally from branch `lab/setup`, commit `9060bc56f1f8`; updated through Batch 5 (2026-05-12). `🟥` = bug or correctness issue, `🟧` = gap (function present but incomplete or thin), `🟨` = perf / quality concern, `🟦` = security / hardening, `⚪` = informational note, `✅` = resolved (batch number cited inline). Items already tracked in [CLAUDE.md](../CLAUDE.md) are tagged with their task ID. Per-batch reports live in [reports/](reports/).

---

## 1. Explicit TODOs in Code

| File | Line | Note |
|---|---|---|
| [backend/services/xai.py](../backend/services/xai.py) | 3 | `# TODO: Implement in Phase 4` — the entire module is a stub. Justification text currently comes from `DimensionScore.justification` populated by the LLM, so the explainability surface is "good enough" for Phase 2 but the dedicated XAI service is empty. |
| ~~`backend/utils/pdf_utils.py`~~ | — | ✅ **Resolved in Batch 5** — empty stub deleted. PyMuPDF helpers are inlined in [services/extractor.py](../backend/services/extractor.py); no callers were affected. |

No other `TODO/FIXME/XXX/HACK` comments exist in `backend/` or `frontend/src/`.

---

## 2. Logic Gaps & Potential Bugs

### ✅ Save-as-Draft button is a no-op — **Resolved in Batch 1**
- The redundant ghost button was removed from [DocumentsPage.jsx](../frontend/src/pages/candidate/DocumentsPage.jsx). Uploads already auto-save through `POST /api/documents/upload/{doc_type}`, so the button was implying persistence that already existed under a different name. See [BATCH_1_REPORT.md](reports/BATCH_1_REPORT.md).

### ✅ Hard-coded API base URL on the frontend — **Resolved in Batch 1**
- [frontend/src/lib/api.js:8](../frontend/src/lib/api.js#L8) now reads `import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api"`. Production sets the env var before `npm run build` / `docker compose build frontend`.

### ✅ Unused `VITE_RECRUITMENT_DEADLINE` env var — **Resolved in Batch 5**
- The env var was removed from [.env.example](../.env.example), [frontend/.env.example](../frontend/.env.example), [CLAUDE.md](../CLAUDE.md), and [docs/ARCHITECTURE.md](ARCHITECTURE.md). Countdowns are driven by `GET /api/periods/active`.

### ✅ Score override has no audit trail (Task 14.3) — **Resolved in Batch 2**
- [backend/routers/candidates.py](../backend/routers/candidates.py) now writes an `AuditLog(action_type="score_override")` row alongside each `DimensionScore` override. See [BATCH_2_REPORT.md](reports/BATCH_2_REPORT.md).

### ✅ Legacy endpoints not flagged deprecated (Task 14.4) — **Resolved in Batch 2**
- `POST /api/upload` and `POST /api/evaluate` now set `Deprecation: true` headers and log a `warning` on each call. The Lab pipeline (`/api/documents/upload/{doc_type}` + `/api/recruiter/evaluate/batch`) is the supported path.

### ✅ `EvaluateBatchRequest.division: str` not type-safe (Task 14.1) — **Resolved in Batch 2**
- [backend/routers/evaluate_batch.py](../backend/routers/evaluate_batch.py) now declares `division: Division`; FastAPI returns 422 with field-path info for any value outside the enum.

### ✅ `Rubric.division` is `String(20)` not Enum (Task 14.2) — **Resolved in Batch 2**
- Column type migrated to `Enum(Division, native_enum=False, length=20, values_callable=...)` via [Alembic migration 0543acf1450b](../backend/alembic/versions/0543acf1450b_rubric_division_enum.py). `values_callable` preserved the existing on-disk lowercase format so no data migration was needed.

### ✅ Bulk announce notes/announced_at mismatch — **Resolved in Batch 1**
- [GET /announcements/my](../backend/routers/announcements.py#L249) now matches both `action_type IN ("announcement", "bulk_announcement")`, so bulk-published candidates see their `announced_at` correctly. The bulk write side still uses `"bulk_announcement"` so the discriminator is preserved for auditors.

### ✅ BackgroundTask uses `next(get_db())` for the second session — **Resolved in Batch 1**
- [submit_application](../backend/routers/applications.py) now passes `SessionLocal` (the factory), not a session instance. [run_submit_anonymization](../backend/services/submit_anonymization.py) owns the open + close lifecycle inside the task.

### ✅ Composite score formula assumes weights ≤ 1.0 — **Resolved in Batch 3**
- [backend/services/scoring.py](../backend/services/scoring.py)::`validate_rubric_weights` runs in both `run_evaluation_pipeline` and the override path. A rubric whose weights don't sum to 1.0 (±0.01) now raises a clean 400 with the original message.

---

## 3. Phase-Transition Edge Cases

### 🟧 Server clock-skew vs candidate countdown
- All phases are derived from server `datetime.now(timezone.utc)`. The candidate's countdown is purely visual ([RecruitmentPhaseCard](../frontend/src/components/RecruitmentPhaseCard.jsx)) and refreshes every 60s. If the server's clock and the user's clock differ by more than a minute, the user may see "0s left" for several seconds while the server still allows submission, or vice versa. Acceptable for a recruitment portal; document the expectation.

### ✅ No DB-level uniqueness for `is_active=True` — **Resolved in Batch 3** (Postgres only)
- Alembic migration [15e1fb0f5fe3_partial_unique_active_period](../backend/alembic/versions/15e1fb0f5fe3_partial_unique_active_period.py) adds a partial unique index `CREATE UNIQUE INDEX uq_one_active_period ON recruitment_periods (is_active) WHERE is_active = true` — Postgres only. On dev SQLite the application-level `_deactivate_others` guard remains authoritative.

### 🟧 NER cache vs evaluation race (intended but worth flagging)
- A candidate submitting at the last second triggers a BackgroundTask. If the recruiter clicks **Run Evaluation** before that task finishes, [evaluation_service.py:237](../backend/services/evaluation_service.py#L237) falls back to inline NER. This is the documented behaviour, not a bug — but it means the same CV may get NER'd twice in a tight race.

### 🟦 Bulk announce phase bypass
- `super_admin` can bulk-announce in any phase ([announcements.py:171](../backend/routers/announcements.py#L171)). This is intentional ("manual correction bypass"). Document it operationally so it doesn't surprise auditors.

### 🟧 Period uniqueness on create when `start_date <= now`
- [periods.py:259–263](../backend/routers/periods.py#L259) rejects creating a period that starts in the past. But the same restriction is **not** enforced on update — a super-admin can move `submission_end_date` backward, instantly transitioning the phase. This is by design (CLAUDE.md Task 13.2.4 explicitly grants this) but it can produce surprising state if combined with the soft-warn evaluation path.

---

## 4. Missing Validations & Thin Error Handling

### ✅ File upload: MIME validated only via header — **Resolved in Batch 4**
- [backend/utils/file_storage.py](../backend/utils/file_storage.py) now runs a magic-byte check (`%PDF` / `\xff\xd8\xff` / `\x89PNG`) inside `save_upload` *after* size validation and *before* the disk write. Mismatched signatures raise `400 "File content does not match declared type"`. See [BATCH_4_REPORT.md](reports/BATCH_4_REPORT.md).

### 🟦 No virus scanning on uploads
- Files land directly on disk. Recruiters preview them via `FileResponse`. Acceptable inside an internal lab system but a hardening note for any wider deployment.

### 🟦 JWT cannot be revoked
- [backend/services/auth_service.py](../backend/services/auth_service.py) has no blacklist. `POST /api/auth/logout` is a no-op server-side ([routers/auth.py:171](../backend/routers/auth.py#L171)). A leaked token is valid until `exp` (480 min default).
- Hardening: add a `token_blacklist` table or switch to short-lived access + refresh tokens.

### ✅ `evaluate_batch` returns 422 for unknown ValueError — **Resolved in Batch 3**
- Unrecognized `ValueError`s now log the full traceback server-side and return a sanitized 500 (`"Evaluation failed due to an internal error. Please contact the administrator."`). Known shapes (`"no dimensions configured"`, `"no rubric found"`, `"rubric weights must sum"`) still map to clean 400/404 with their original message. The intermediate `except HTTPException: raise` makes sure deliberate HTTPExceptions aren't double-wrapped.

### 🟧 No CSRF protection
- The app uses bearer tokens (not cookies), so traditional CSRF is not exploitable for state-changing requests; document this trust model so future contributors don't introduce cookie-based auth without remembering to add CSRF tokens.

### ✅ No password reset flow — **Partially resolved in Batch 3** (admin-assisted)
- `POST /api/auth/admin/reset-password` lets a super_admin reset any user's password directly (no email round-trip). The endpoint is gated by `require_role(SUPER_ADMIN)` and the new password is bcrypt-hashed. JWTs are **not** invalidated — existing sessions remain valid until `exp`. Self-service email reset is still deferred to Phase 3. UI: a "Reset password" button on every row of [/admin/users](../frontend/src/pages/admin/AdminPage.jsx).

---

## 5. Performance Concerns

### ✅ Recruiter dashboard N+1 query — **Resolved in Batch 5**
- [backend/routers/applications.py](../backend/routers/applications.py)::`list_submitted_applications` now uses `joinedload(Application.user)` and a single `GROUP BY` for `Document` counts. The 3 N-scaling queries from before are reduced to constants: 1× Application+User (joined), 1× Candidate IN (...), 1× Document GROUP BY application_id, plus a single active-period query. Listing 10 candidates is now ~4 queries total, down from ~23.

### ✅ No memoization in heavy components — **Resolved in Batch 5**
- [DashboardPage.jsx](../frontend/src/pages/DashboardPage.jsx) wraps `scoredCount` / `topScore` / `evaluatedInView` / `failCount` / `evaluatedInSelectedDivision` in `useMemo`, and exposes a stable `useCallback` for the per-row checkbox handler. A checkbox toggle no longer recomputes the stats above it.

### 🟨 No code splitting
- All routes loaded eagerly. `npm run build` produces a single bundle. Phase 3 should add `React.lazy` for at least the admin tree (super_admin only ships the rest).

### 🟨 ChromaDB persist directory grows unbounded
- No cleanup on rubric delete, no eviction strategy. Today's pipeline doesn't actually use vector retrieval at evaluation time, so this is dormant — but if/when retrieval is wired in, plan for cleanup.

### ✅ DeepSeek calls are sequential per application — **Resolved in Batch 5**
- [evaluation_service.py](../backend/services/evaluation_service.py)::`run_evaluation_pipeline` runs `_evaluate_one` through an `asyncio.Semaphore(5)` + `asyncio.gather`. Up to 5 LLM round-trips overlap; the sync SQLAlchemy Session remains safe because every DB op runs in the non-await sections of `_evaluate_one`. Expected N-candidate wall-clock: `ceil(N/5) × LLM_latency` instead of `N × LLM_latency`.

### ✅ SWOT-text endpoint re-extracts every call — **Resolved in Batch 5**
- [submit_anonymization.py](../backend/services/submit_anonymization.py) now extracts SWOT raw_text at submit-time and caches it on a `CandidateDocument(document_type="swot")` row. [GET /applications/{id}/swot-text](../backend/routers/applications.py) reads from this cache first; falls back to inline PyMuPDF if the cache row is missing (e.g. the submit-time task crashed before reaching SWOT).

---

## 6. Security Observations

### 🟦 JWT in localStorage (XSS-vulnerable)
- [frontend/src/lib/auth.js:13–23](../frontend/src/lib/auth.js#L13). Standard tradeoff: easier multi-tab UX, but any injected script reads the token. Mitigated by absent third-party scripts and shadcn/ui's safe rendering, but not airtight.
- Hardening: HttpOnly secure cookies + same-site lax, paired with CSRF tokens (which the app currently doesn't need given bearer model).

### ✅ `SECRET_KEY` defaults to a placeholder — **Resolved in Batch 4**
- [backend/main.py](../backend/main.py) lifespan now raises `RuntimeError("SECRET_KEY must be changed before running in production")` if `secret_key.startswith("dev-secret") and environment != "development"`. The Docker checklist surfaces this as a fail-fast condition on first boot.

### ✅ bcrypt 4.0.1 pin — **Resolved in Batch 4** (documented)
- [requirements.txt](../requirements.txt) carries a three-line comment above the pin explaining why (bcrypt 4.1.x ↔ passlib incompatibility; this project uses bcrypt directly so the pin can be lifted once stability is confirmed upstream).

### ✅ No rate limiting — **Resolved in Batch 4**
- `slowapi` is wired in [backend/middleware/rate_limit.py](../backend/middleware/rate_limit.py). `/api/auth/login` is capped at 10/minute/IP, `/api/auth/register` at 5/minute/IP, `/api/announcements/bulk` at 10/minute per bearer-token. In-memory storage; resets on backend restart and is per-process (acceptable for the single-instance VPS topology).

### ✅ Open CORS in dev — **Resolved in Batch 4**
- The lifespan startup guard now raises `RuntimeError("ALLOWED_ORIGINS must be set in production")` whenever `environment != "development"` and `ALLOWED_ORIGINS` is empty. Production must set the var explicitly or the container crash-loops.

---

## 7. Documentation Drift

### ✅ NIM regex documentation mismatch — **Resolved in Batch 5**
- [frontend/src/lib/api.js](../frontend/src/lib/api.js) JSDoc for `register()` now reads "numeric string of at least 10 digits — see backend/routers/auth.py:_NIM_PATTERN" — matching the actual server-side rule.

### ✅ `analysis.md` at repo root — **Resolved in Batch 5**
- Moved to [docs/archive/analysis_phase1.md](archive/analysis_phase1.md) with a banner pointing at [ARCHITECTURE.md](ARCHITECTURE.md) and [MODULE_ANALYSIS.md](MODULE_ANALYSIS.md) as the live successors. The repo root no longer carries an `analysis.md`; `.gitignore` still ignores it to prevent the `code-review-graph` MCP tool from quietly recreating it.

### ✅ AGENTS.md == GEMINI.md — **Resolved in Batch 5**
- `GEMINI.md` deleted; `AGENTS.md` kept as the canonical name. Both filenames remain in `.gitignore` so future MCP regenerations don't leak back in.

### ✅ Phase 1 invariant comment in `Application` model — **Resolved in Batch 5**
- [backend/models/application.py:50-58](../backend/models/application.py#L50) — the stale "Periods aren't modelled yet" wording is gone. The comment now states the actual rule ("one application per candidate, period-agnostic") and explicitly flags the option to widen the constraint to `(user_id, period_id)` if multi-period candidates are ever needed.

---

## 8. Phase 2 Tasks Outstanding (cross-reference to CLAUDE.md)

| Task | Description | Status |
|---|---|---|
| 14.1 | Convert `EvaluateBatchRequest.division` to `Division` enum | ✅ Batch 2 |
| 14.2 | Migrate `Rubric.division` to `Enum(Division)` | ✅ Batch 2 |
| 14.3 | Audit-log score overrides | ✅ Batch 2 |
| 14.4 | Header-flag legacy `/api/upload` and `/api/evaluate` as deprecated | ✅ Batch 2 |
| 14.5 | Smoke tests covering Period phases + bulk announce | ✅ Batch 2 (phase-enforcement matrix added) |

Phase 1 / 2 features that **are** done and verified by reading source:
- ✅ Submit-time NER BackgroundTask + cache fallback (Task 10).
- ✅ RecruitmentPeriod model + four-phase boundaries + active-period gates (Task 11, 13.1–13.2).
- ✅ Bulk announce endpoint with phase gate + audit log (Task 12.4, 13.2.3).
- ✅ Recruiter dashboard `rank` + `is_recommended` fields (Task 12.5).
- ✅ Phase-aware UI banners and disabled states (Task 13.3).
- ✅ Force re-evaluate path (Task 13.5.1).
- ✅ Idempotent division-rubric seeding on startup.

---

## 8a. New issues discovered during Batch 5

### ⚪ `scripts/smoke_test_upload.py` is stale
- The script posts to the legacy `POST /api/upload` endpoint without any authentication. That endpoint has been gated behind `Depends(require_role(UserRole.CANDIDATE))` since Phase 1, so a fresh run against a live server returns 401 before the test reaches its assertions.
- `git diff HEAD -- scripts/smoke_test_upload.py backend/routers/upload.py` is empty after this batch — the failure pre-existed; it surfaced when Batch 5 ran the full smoke suite.
- The Lab-pipeline equivalent (`POST /api/documents/upload/{doc_type}`) is already covered by `smoke_test_applications.py`. Recommendation: delete this script when Phase 2 Task 14.4's legacy-endpoint removal lands.

### 🟨 `_LLM_CONCURRENCY` is a hard-coded constant
- [evaluation_service.py:41](../backend/services/evaluation_service.py#L41) caps in-flight DeepSeek calls at 5. The right value depends on DeepSeek's per-account rate limit, which isn't accessible to the code. If a future operator hits 429s during a large batch, they'll need to edit the constant and redeploy. Cheap follow-up: surface as an env var on `Settings`.

---

## 9. Operational Notes

### Deployment readiness checklist (before Phase 3 cutover)

Target: a self-hosted VPS in the MBC Lab running three Docker containers (frontend, backend, db) behind a host-level reverse proxy that terminates TLS. The full step-by-step walkthrough lives in [docs/DEPLOYMENT.md](DEPLOYMENT.md); the list below is the shortlist operators tick off in order.

1. **Provision the VPS.** Linux (Ubuntu/Debian recommended), Docker Engine ≥24, Docker Compose v2, Nginx or Caddy on the host (outside Docker) for TLS termination, basic firewall (UFW or equivalent). Open ports 80/443 only to the public; SSH gated by key.
2. **Clone the repo and configure `.env`.** Fill in every variable in the `# Docker / VPS Production` block of `.env.example` — `ENVIRONMENT=production`, `SECRET_KEY` (generated with `python -c "import secrets; print(secrets.token_urlsafe(48))"`), `ALLOWED_ORIGINS`, `DEEPSEEK_API_KEY`, `DATABASE_URL` pointing at the `db` service hostname, and the matching `POSTGRES_*` triplet.
3. **Set `VITE_API_BASE_URL` in `.env` (or `frontend/.env`) before building.** Vite inlines this value at build time, not runtime; changing it later requires `docker compose build frontend` to re-run. Use the public URL your users will hit (e.g. `http://lab-domain.example/api`).
4. **Bring everything up:** `docker compose up --build -d`. The first build downloads Python + Node deps and produces both images. The frontend nginx serves the React SPA on port 80; the backend uvicorn listens internally on `backend:8000`; Postgres listens internally on `db:5432`.
5. **Verify services:** `docker compose ps` — all three (`db`, `backend`, `frontend`) should show `Up`.
6. **Watch the backend logs** during first boot: `docker compose logs -f backend`. The Batch-4 startup guards will fail-fast with clear `RuntimeError`s if `SECRET_KEY` is still the placeholder or `ALLOWED_ORIGINS` is empty in non-dev. Fix and re-run if so.
7. **Verify migrations applied.** Alembic runs inside the FastAPI lifespan, but you can confirm explicitly with `docker compose exec backend alembic current`.
8. **First-boot NER model download.** The IndoBERT model (~1.3 GB) downloads on the first evaluation and is cached into the mounted `./models/` volume on the host. The download is slow but one-time; subsequent restarts reuse the cache. Monitor with `docker compose logs -f backend`.
9. **Configure the host-level reverse proxy.** Install Nginx or Caddy on the VPS itself (not inside Docker), terminate TLS with a Let's Encrypt cert, and proxy `https://your-domain/` to `http://127.0.0.1:80` (the published port of the frontend container). Do **not** put TLS inside `docker-compose.yml` — keeping it outside Docker simplifies cert renewal and lets you run multiple sites on the same VPS.
10. **Wire `GET /api/health` to monitoring** (Uptime Kuma, cron + curl, etc.) — the FastAPI app exposes this endpoint already.
11. **Backups.** Two things to back up:
    - PostgreSQL: `docker compose exec db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup-$(date +%F).sql`. Run nightly via cron.
    - Uploaded files in `./uploads/`: `rsync` to off-host storage or take a filesystem snapshot. The Postgres volume (`postgres_data`) is managed by Docker; the `pg_dump` above is the canonical backup path.
12. **Updates.** `git pull && docker compose up --build -d`. Alembic migrations are auto-applied on the next backend boot via the lifespan.

### Schema migration safety
- Every model change must produce an Alembic migration via `alembic revision --autogenerate -m "..."`. The lifespan `init_db()` calls `alembic upgrade head` on every boot — production will auto-apply pending migrations. Review before deploy.

### Smoke-test runner
- `scripts/smoke_test_*.py` are stand-alone Python scripts; they hit `http://localhost:8000` directly. There is no `pytest` harness today. Run them sequentially after a clean DB to validate Phase 2 behaviour:
  ```
  python -m scripts.smoke_test_auth
  python -m scripts.smoke_test_applications
  python -m scripts.smoke_test_upload
  python -m scripts.smoke_test_periods
  python -m scripts.smoke_test_submit_ner
  python -m scripts.smoke_test_bulk_announce
  python -m scripts.smoke_test_evaluation
  ```
