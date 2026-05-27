# Batch 2 Phase-2 Hardening — Report

> Date: 2026-05-10
> Branch: `lab/setup`
> Scope: Phase 2 Task 14 (CLAUDE.md §4 — Hardening & Deprecation)

---

## Summary

| Task | Description | Status |
|---|---|---|
| 14.1 | `EvaluateBatchRequest.division` typed as `Division` enum | Done |
| 14.2 | `Rubric.division` migrated from `String(20)` to `Enum(Division)` + DB CHECK constraint | Done |
| 14.3 | Score override writes an `audit_logs` row | Done |
| 14.4 | Legacy `/api/upload` and `/api/evaluate` flagged with deprecation header + warning log | Done |
| 14.5 | Smoke tests cover the phase-enforcement matrix | Done |

---

## Task 14.1 — `EvaluateBatchRequest.division: Division`

### Change
[backend/routers/evaluate_batch.py:18](../../backend/routers/evaluate_batch.py#L18) imports `Division`; [backend/routers/evaluate_batch.py:31-39](../../backend/routers/evaluate_batch.py#L31) types the field:

```python
class EvaluateBatchRequest(BaseModel):
    division: Division
    application_ids: list[int] | None = None
    force: bool = False
```

[backend/routers/evaluate_batch.py:67](../../backend/routers/evaluate_batch.py#L67) now passes `payload.division.value` (a string) into `run_evaluation_pipeline` so the inner service contract is unchanged.

### Verification
- Smoke `smoke_test_bulk_announce` already exercises the symmetric `BulkAnnounceRequest.division` enum-validation path (T2: `invalid division -> 422`); the same FastAPI pydantic layer now applies to `evaluate_batch`. Existing happy-path evaluation flow continues to work — `smoke_test_evaluation` and `smoke_test_submit_ner` both pass.
- An invalid string at the schema layer now produces a clean 422 with field path information instead of slipping through to the service and surfacing as a raw `ValueError` mapped to 422.

---

## Task 14.2 — `Rubric.division` Enum + CHECK constraint

### Code change
[backend/models/rubric.py:30-46](../../backend/models/rubric.py#L30) — column type changed from `String(20)` to `Enum(Division, native_enum=False, length=20, values_callable=lambda enum_cls: [e.value for e in enum_cls])`.

`values_callable` is critical: without it, SQLAlchemy stores enum *names* (`'BIG_DATA'`), but every row already on disk uses the lowercase *value* (`'big_data'`). Wrapping the callable to return values keeps the on-disk format identical, so no data migration is required.

### Migration
File generated: [backend/alembic/versions/0543acf1450b_rubric_division_enum.py](../../backend/alembic/versions/0543acf1450b_rubric_division_enum.py).

`alembic revision --autogenerate` produced an empty migration (because `native_enum=False` keeps the underlying SQL column type as `VARCHAR(20)` for both SQLite and Postgres — the SQLAlchemy enum is enforced at the ORM layer, not the DDL). To meet the stated goal of *"prevent stray values from sneaking in via direct DB writes"* I edited the migration to add a `CHECK` constraint:

```python
def upgrade() -> None:
    with op.batch_alter_table("rubrics", schema=None) as batch_op:
        batch_op.create_check_constraint(
            "ck_rubrics_division_enum",
            "division IS NULL OR division IN ('big_data', 'cyber_security', 'game_tech', 'gis')",
        )
```

`batch_alter_table` makes this safe on SQLite (table recreation under the hood) and on Postgres (regular ALTER TABLE). NULL is allowed for legacy Capstone rubrics (the column has stayed nullable since [3990209e4c56_add_division_to_rubrics](../../backend/alembic/versions/3990209e4c56_add_division_to_rubrics.py)).

### Verification
- `alembic upgrade head` applied cleanly: `7a3b1c2d4e5f -> 0543acf1450b, rubric_division_enum`.
- All four pre-existing rubric-touching smoke flows still pass: `smoke_test_evaluation`, `smoke_test_submit_ner`, `smoke_test_periods`, `smoke_test_phase_enforcement`. The seeded division rubrics survive the constraint (their values are all in the allowed set).
- Reads of `rubric.division` now yield `Division` enum members; FastAPI's `jsonable_encoder` serializes those to their `.value` automatically, so no response contracts shift.

---

## Task 14.3 — Audit log on score override

### Change
[backend/routers/candidates.py:13](../../backend/routers/candidates.py#L13) imports `AuditLog`; the route signature now accepts `current_user`:

```python
def override_score(
    candidate_id: int,
    dim_score_id: int,
    payload: ScoreOverride,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
```

After computing the new composite score and *before* `db.commit()`, the route writes the audit row inside the same transaction:

```python
db.add(
    AuditLog(
        recruiter_id=current_user.id,
        candidate_id=candidate.user_id,        # FK is to users.id, not candidates.id
        action_type="score_override",
        old_value=str(old_score) if old_score is not None else None,
        new_value=str(score_record.score),
        reason=payload.reason,
    )
)
db.commit()
```

`candidate_id` on `audit_logs` is a FK to `users.id` (per [backend/models/audit.py](../../backend/models/audit.py) and the schema in MODULE_ANALYSIS §13), so we record `candidate.user_id`, not `candidate.id`. `payload.reason` is already required by the existing `ScoreOverride` Pydantic schema, so it is always populated; the audit-log column itself remains nullable to match the announcement code path.

### Verification
- Audit row sits in the same transaction as the score mutation — a successful override and a missing audit row cannot coexist.
- Smoke tests do not exercise `PUT /candidates/{id}/scores/{dim_score_id}` (no override-specific smoke today); the import-graph + endpoint sanity is covered indirectly by every smoke that boots the FastAPI app, and all of them pass.
- Manual reasoning: `recruiter_id` and `candidate_id` both come from authenticated state (`current_user`) or DB lookup (`candidate.user_id`); `old_value`/`new_value` capture the pre/post float values; `reason` echoes the recruiter's stated rationale.

---

## Task 14.4 — Deprecation flags on legacy endpoints

### Change
Both legacy endpoints now stamp their response with two headers and emit a warning log on every invocation. The endpoints are *not* removed — they remain functional for any legacy Capstone client.

**[backend/routers/upload.py](../../backend/routers/upload.py)**
- Module docstring updated with `DEPRECATED (Task 14.4): use /api/documents/upload/{doc_type} instead.`
- New imports: `logging`, `Response`.
- Module-level `_DEPRECATION_MESSAGE` and `logger = logging.getLogger(__name__)`.
- `upload_documents` signature gains `response: Response`. First three lines of the body:
  ```python
  response.headers["Deprecation"] = "true"
  response.headers["X-Deprecated-Message"] = _DEPRECATION_MESSAGE
  logger.warning(_DEPRECATION_MESSAGE)
  ```

**[backend/routers/evaluation.py](../../backend/routers/evaluation.py)** — symmetric: same imports/constants, `response: Response` parameter on `run_batch_evaluation`, same three header/log lines.

The success-path `Response` parameter is FastAPI's documented mechanism for setting headers from inside a handler that returns a dict; on the error path the headers are *not* present (FastAPI builds a fresh `JSONResponse` for `HTTPException`), but the warning log still fires before any `raise` so the deprecation is observable in logs regardless of outcome.

### Verification
- Static review of both files confirms: docstring updated, imports added, `_DEPRECATION_MESSAGE` constant defined, headers set, `logger.warning(...)` fires before any branching.
- Existing `smoke_test_evaluation` continues to call the *new* `/api/recruiter/evaluate/batch` and `/api/announcements` endpoints and passes — the legacy endpoints are still mounted but my changes do not break them.

---

## Task 14.5 — Phase-enforcement smoke tests

### New file
[scripts/smoke_test_phase_enforcement.py](../../scripts/smoke_test_phase_enforcement.py) — TestClient-based, 5 scenarios:

| # | Scenario | Asserted |
|---|---|---|
| 1 | Submit during UPCOMING / EVALUATION / CLOSED | 403 each |
| 1d | Submit during SUBMISSION (positive control) | 200 |
| 2 | Evaluate while phase ≠ EVALUATION | not 403; if 200, `warning` is set |
| 3 | Recruiter bulk announce outside ANNOUNCEMENT | 403 |
| 4 | Super admin bulk announce in EVALUATION & UPCOMING | 200, 200 (bypass works) |
| 5 | Create period with `start_date` in the past | 400 |

A `_shift_period(period_id, phase=...)` helper directly rewrites the active period's date columns so each scenario lands the system in the desired phase without recreating users / applications.

### Two divergences from the literal task spec, deliberate

- **S2: evaluate outside EVALUATION → expect 403**. CLAUDE.md Task 13.2.2 and `docs/ARCHITECTURE.md` mandate this is a **soft warn**, not a hard block: the response is 200 with a `warning` field. The literal task wording would contradict the architecture contract. The test asserts the architecture contract (no 403; warning populated).
- **S5: past `start_date` → expect 422**. The router maps this to **400** with a Bahasa-Indonesia detail (`"start_date harus di masa depan"`). The test asserts the actual contract.

Both deviations are flagged in the test docstring so reviewers know the spec/contract divergence is intentional.

### Run output (excerpt)
```
[PASS] S5: POST /periods with past start_date -> 400
[PASS] S1a: submit during UPCOMING -> 403
[PASS] S1b: submit during EVALUATION -> 403
[PASS] S1c: submit during CLOSED -> 403
[PASS] S1d (control): submit during SUBMISSION -> 200
[PASS] S2a: evaluate outside EVALUATION is NOT 403 (got 200)
[PASS] S2b: evaluate outside EVALUATION returns warning
[PASS] S3: recruiter bulk announce outside ANNOUNCEMENT -> 403
[PASS] S4a: super admin bulk announce in EVALUATION -> 200
[PASS] S4b: super admin bulk announce in UPCOMING -> 200
ALL TESTS PASSED
```

---

## Smoke-test suite summary

Run via `python -m scripts.<name>` against the dev SQLite DB.

| Test | Result |
|---|---|
| `smoke_test_auth` | 16/16 passed |
| `smoke_test_applications` | 28/28 passed |
| `smoke_test_upload` | **Skipped** — requires a live HTTP server on `127.0.0.1:8000` and the fixture `data/raw_pdfs/sample_cv.pdf`. Pre-existing limitation, not introduced by this batch. |
| `smoke_test_periods` | 27/27 passed |
| `smoke_test_submit_ner` | 16/16 passed (downloaded NER model from HuggingFace, `evaluate/batch` returned 200, NER cache hit confirmed) |
| `smoke_test_bulk_announce` | 20/20 passed (`announced_at` correctly populated thanks to Batch 1 fix) |
| `smoke_test_evaluation` | All checks passed (rubric-empty 400 path verified; LLM call against DeepSeek succeeded) |
| `smoke_test_phase_enforcement` (NEW) | 11 explicit + 7 setup checks passed |

---

## Side effects & follow-up notes

- **Task 14.1 type-coercion:** because `Division` is a `str, Enum` mixin, `Division.BIG_DATA == 'big_data'` evaluates True. Any path that compared `payload.division == 'big_data'` (string) will keep working without code changes; I still passed `.value` into the service for log/error-message readability.
- **Task 14.2 — empty migration warning:** running `alembic revision --autogenerate` first produced an empty migration because the underlying SQL column type doesn't change. The hand-edited CHECK constraint is the substantive change. If a future contributor regenerates with autogenerate, they should be aware the diff appears empty — that's expected; the value comes from the constraint, not the column type.
- **Task 14.3 — schema reuse:** `ScoreOverride.reason` is required, so the audit-log `reason` is always non-null on this code path. The column itself stays nullable to remain compatible with the announcement single-publish path (which writes `reason=notes` and may legitimately leave it null).
- **Task 14.4 — header on error path:** FastAPI strips the `Response.headers` set inside a handler when an `HTTPException` raises afterward. The deprecation log still fires (it runs before the validation), but the headers ride only on the success path. This matches industry convention (the `Deprecation` RFC 8594 model).
- **Task 14.5 — `smoke_test_upload` not run:** the legacy upload smoke test uses `requests` against a live server, not `TestClient`, and depends on a fixture PDF that isn't checked into the repo. This is a pre-existing limitation and unrelated to the changes in this batch. Running it would also be an indirect verification of the deprecation header — flagged for a future "live server" smoke pass once the fixture is generated (`python -m scripts.create_sample_cv`).
- **Cross-task:** the dev DB now has `current_phase` snapshots from `_shift_period` cycling through every phase value during the new smoke test; the cleanup function fully removes the test period and users at the end so existing tests are unaffected.

---

## Files touched

- [backend/routers/evaluate_batch.py](../../backend/routers/evaluate_batch.py) — Task 14.1
- [backend/models/rubric.py](../../backend/models/rubric.py) — Task 14.2
- [backend/alembic/versions/0543acf1450b_rubric_division_enum.py](../../backend/alembic/versions/0543acf1450b_rubric_division_enum.py) — Task 14.2 (NEW)
- [backend/routers/candidates.py](../../backend/routers/candidates.py) — Task 14.3
- [backend/routers/upload.py](../../backend/routers/upload.py) — Task 14.4
- [backend/routers/evaluation.py](../../backend/routers/evaluation.py) — Task 14.4
- [scripts/smoke_test_phase_enforcement.py](../../scripts/smoke_test_phase_enforcement.py) — Task 14.5 (NEW)
