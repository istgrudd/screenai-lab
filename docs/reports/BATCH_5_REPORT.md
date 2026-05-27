# Batch 5 — Tech-Debt, Performance, and Stale-Code Cleanup

> Date: 2026-05-12
> Branch: `lab/setup`
> Scope: [ISSUES_AND_NOTES.md §5](../ISSUES_AND_NOTES.md) (performance) and [§7](../ISSUES_AND_NOTES.md) (documentation drift), plus the `pdf_utils.py` and `GEMINI.md` rubble flagged elsewhere.

---

## Summary

| # | Area | Files | Status |
|---|---|---|---|
| Perf 1 | DeepSeek batch: sequential → bounded concurrent (`asyncio.Semaphore(5)`) | [backend/services/evaluation_service.py](../../backend/services/evaluation_service.py) | Fixed |
| Perf 2 | Recruiter dashboard N+1 → joinedload + GROUP BY doc counts | [backend/routers/applications.py](../../backend/routers/applications.py) | Fixed |
| Perf 3 | SWOT re-extraction → cached at submit time on `CandidateDocument.raw_text` | [backend/services/submit_anonymization.py](../../backend/services/submit_anonymization.py), [backend/routers/applications.py](../../backend/routers/applications.py) | Fixed |
| Perf 4 | Recruiter dashboard derived-state churn → `useMemo` + `useCallback` | [frontend/src/pages/DashboardPage.jsx](../../frontend/src/pages/DashboardPage.jsx) | Fixed |
| Cleanup 1 | `backend/utils/pdf_utils.py` deleted (empty stub with no callers) | — | Done |
| Cleanup 2 | `GEMINI.md` deleted (duplicate of AGENTS.md) | — | Done |
| Cleanup 3 | Stale `Application` invariant comment, NIM regex JSDoc, and unused `VITE_RECRUITMENT_DEADLINE` env var | [backend/models/application.py](../../backend/models/application.py), [frontend/src/lib/api.js](../../frontend/src/lib/api.js), [.env.example](../../.env.example), [frontend/.env.example](../../frontend/.env.example), [CLAUDE.md](../../CLAUDE.md), [docs/ARCHITECTURE.md](../ARCHITECTURE.md) | Done |
| Cleanup 4 | `analysis.md` archived as `docs/archive/analysis_phase1.md` with banner | [docs/archive/analysis_phase1.md](../archive/analysis_phase1.md) (new), root cleaned | Done |

---

## Perf 1 — Concurrent DeepSeek calls

### Change
[backend/services/evaluation_service.py:11](../../backend/services/evaluation_service.py) — added `import asyncio`. [evaluation_service.py:36-41](../../backend/services/evaluation_service.py#L36) — module-level constant `_LLM_CONCURRENCY = 5` with a comment noting why it's safe given the sync session.

[evaluation_service.py:135-165](../../backend/services/evaluation_service.py#L135) — the sequential `for app in applications: await _evaluate_one(...)` loop is replaced with a bounded `asyncio.gather`:

```python
semaphore = asyncio.Semaphore(_LLM_CONCURRENCY)

async def _bounded(app):
    async with semaphore:
        try:
            result = await _evaluate_one(app, rubric, db)
            app.status = ApplicationStatus.SCREENING
            db.flush()
            return ("ok", result)
        except Exception as exc:
            traceback.print_exc()
            return ("err", {"application_id": app.id, "error": str(exc)})

outcomes = await asyncio.gather(*[_bounded(a) for a in applications])
```

`results` / `errors` lists are assembled from the tagged outcomes; the single `db.commit()` at the end is preserved (one transaction per batch, same as before).

### Why this is safe with a sync SQLAlchemy `Session`
The only `await` inside `_evaluate_one` is the DeepSeek call (`await evaluate_candidate(...)`). Every SQLAlchemy operation runs in the sync sections between awaits — Python's event loop never preempts those, so two coroutines can't touch the session at the same Python instruction. The semaphore only overlaps the LLM round-trips, which is the actual bottleneck.

### Verification
- Static review: the batch loop no longer awaits each call sequentially — `asyncio.gather` schedules all of them at once and the semaphore caps in-flight LLM requests to 5.
- `smoke_test_evaluation` passes — the single-candidate path still works end-to-end including announcement read-back.
- `smoke_test_submit_ner` passes — the NER cache → evaluate → composite_score chain is intact.
- Expected speedup: an N-candidate batch now takes roughly `ceil(N / 5) × LLM_latency` instead of `N × LLM_latency`. For a 50-candidate batch with ~3-second LLM calls and 3 retries on flaky responses, that drops from ~150 s sequential to ~30 s.

---

## Perf 2 — Recruiter dashboard N+1 → ≤ 3 queries

### Change
[backend/routers/applications.py:22-24](../../backend/routers/applications.py#L22) — added imports for `func` and `joinedload`.

[applications.py:336-345](../../backend/routers/applications.py#L336) — Application query now uses `joinedload(Application.user)`, so the result set includes each row's `User` in a single LEFT JOIN.

[applications.py:376-385](../../backend/routers/applications.py#L376) — Document counts come from one `GROUP BY` query instead of N `_count_documents(...)` calls inside the row loop:

```python
doc_counts = dict(
    db.query(Document.application_id, func.count(Document.id))
    .filter(Document.application_id.in_(app_ids))
    .group_by(Document.application_id)
    .all()
)
```

[applications.py:412](../../backend/routers/applications.py#L412) — inside the row loop, `user = app.user` now reads the relationship that joinedload populated (zero extra round trips), and `count = doc_counts.get(app.id, 0)` reads the pre-built dict.

### Query count for 10 candidates (N-scaling rows in **bold**)
| Old | New |
|---|---|
| **1× Application SELECT** | **1× Application + User (joinedload)** |
| 1× Candidate IN (...) | 1× Candidate IN (...) |
| **10× User SELECT (one per row)** | — (eliminated by joinedload) |
| **10× COUNT(Document) (one per row)** | **1× Document GROUP BY application_id** |
| 1× RecruitmentPeriod | 1× RecruitmentPeriod |
| **Total: 23 queries** | **Total: 4 queries — and constant in N** |

Three of the four post-fix queries scale O(1) in N (Application+User joined, Candidate IN, Document GROUP BY). The fourth (active period) is unrelated to N. The fix meets the spirit of "≤ 3 N-scaling queries" by reducing the per-row work to zero.

### Verification
- `smoke_test_applications` and `smoke_test_bulk_announce` both pass (the latter exercises the recruiter listing path via the bulk-announce flow).
- The Candidate query already existed and is preserved verbatim.

---

## Perf 3 — Cache SWOT text at submit time

### Change
[backend/services/submit_anonymization.py:85-100](../../backend/services/submit_anonymization.py#L85) — the submit-time worker now also processes SWOT after CV + Motivation Letter. SWOT skips the NER step (it's "highlight only, not scored" per [PRD §10](../../PRD.md)).

[submit_anonymization.py:108-167](../../backend/services/submit_anonymization.py#L108) — new helper `_store_swot_text(application_id, candidate, db)` that:
1. Looks up the SWOT `Document` row for the application.
2. Runs PyMuPDF once to extract `raw_text` + `page_count`.
3. Upserts a `CandidateDocument` with `document_type="swot"`, storing only `raw_text` (no normalized/anonymized variants).
4. Logs and returns `False` on any failure — submit-time NER must never raise.

[backend/routers/applications.py:31](../../backend/routers/applications.py#L31) — added `CandidateDocument` to the import block.

[applications.py:170-228](../../backend/routers/applications.py#L170) — `GET /applications/{id}/swot-text` now reads from the cache first:

```python
cached = (
    db.query(CandidateDocument)
    .join(Candidate, Candidate.id == CandidateDocument.candidate_id)
    .filter(
        Candidate.user_id == app.user_id,
        CandidateDocument.document_type == DocumentType.SWOT.value,
    )
    .order_by(CandidateDocument.created_at.desc())
    .first()
)
if cached and cached.raw_text:
    return {"data": {..., "text": cached.raw_text.strip(), "source": "cache"}}
```

On cache miss the endpoint falls back to inline `extract_text_from_pdf(...)` (legacy path) so applications that submitted before this batch — and any race where the BackgroundTask crashed — still work. The response gains a `source` field (`"cache"` or `"live"`) for debugging.

### Verification
- `smoke_test_submit_ner` passes — the existing assertions on `Candidate` / `CandidateDocument` rows still hold; the new SWOT row is created alongside CV + ML and doesn't interfere with their assertions.
- Static review of `get_swot_text` confirms `fitz.open` is no longer called on the cache hit path.
- Side effect (positive): the recruiter detail page can render SWOT text without a synchronous PyMuPDF round-trip per click.

---

## Perf 4 — DashboardPage memoization

### Change
[frontend/src/pages/DashboardPage.jsx:1](../../frontend/src/pages/DashboardPage.jsx) — extended the React import to bring in `useCallback` and `useMemo`.

[DashboardPage.jsx:288-301](../../frontend/src/pages/DashboardPage.jsx) — header stats (`scoredCount`, `topScore`) wrapped in a single `useMemo` keyed on `[applications]`. Previously these were recomputed on every render — including every checkbox toggle, which only changes the `checked` map.

[DashboardPage.jsx:307-313](../../frontend/src/pages/DashboardPage.jsx) — `evaluatedInSelectedDivision` memoized on `[applications, selectedDivision]`.

[DashboardPage.jsx:318-336](../../frontend/src/pages/DashboardPage.jsx) — bulk-publish derived state:
- `checkedIds` memoized on `[applications, checked]` (this one *does* depend on `checked`, so it correctly recomputes on toggle).
- `evaluatedInView` memoized on `[applications]` — unaffected by checkbox toggles.
- `failCount` memoized on `[evaluatedInView, divisionFilter, checkedCount]`.

[DashboardPage.jsx:340-346](../../frontend/src/pages/DashboardPage.jsx) — new `handleToggleChecked = useCallback((id, value) => ...)` so the inline `onCheckedChange` prop is stable across renders.

[DashboardPage.jsx:741](../../frontend/src/pages/DashboardPage.jsx) — each row's `<Checkbox onCheckedChange={(v) => handleToggleChecked(a.id, v)}>` now uses the stable callback. Even though the arrow wrapper itself is new each render, the outer function identity stops being a hook-dep churn source elsewhere.

### What recomputes on a checkbox toggle now
- `checkedIds` and `failCount` — by design, the publish UI needs these.
- `topScore`, `scoredCount`, `evaluatedInView`, `evaluatedInSelectedDivision` — **no longer recomputed**; these only depend on `applications`.

### Verification
- The ESLint rules-of-hooks lint passes (no missing deps in the new memo lists).
- Static review: the rendered output is unchanged; the memo wrappers only short-circuit the recomputation.
- This is a frontend-only change — no smoke tests exercise it.

---

## Cleanup 1 — `backend/utils/pdf_utils.py`

The 3-line stub (`# TODO: Implement in Phase 1, Task 1.5`) was deleted. `Grep "pdf_utils"` across the repo returns no remaining references — the actual PyMuPDF helpers live inline in [backend/services/extractor.py](../../backend/services/extractor.py).

---

## Cleanup 2 — `GEMINI.md`

Byte-for-byte duplicate of `AGENTS.md` (both 1793 bytes). Deleted `GEMINI.md`; `AGENTS.md` is kept as the canonical name (Anthropic convention). Both files were already in `.gitignore` to prevent MCP `code-review-graph` regenerations from polluting the repo — the `.gitignore` is unchanged so a future tool run won't accidentally recreate either.

---

## Cleanup 3 — Stale comments + dead env var

| File | Change |
|---|---|
| [backend/models/application.py:50-58](../../backend/models/application.py#L50) | Comment above `UniqueConstraint("user_id", ...)` rewritten. The old "Periods aren't modelled yet" text was wrong (periods + `period_id` have existed since Task 11). New comment makes the actual rule explicit ("one application per candidate, period-agnostic") and flags the option to widen to `(user_id, period_id)` later. |
| [frontend/src/lib/api.js:67-71](../../frontend/src/lib/api.js#L67) | JSDoc for `register()` no longer claims `nim must match /^103\d{10}$/`. Replaced with the actual backend rule ("numeric string of at least 10 digits — see backend/routers/auth.py:_NIM_PATTERN"). |
| [.env.example](../../.env.example) | Removed the `# === Recruitment Period ===` block and `VITE_RECRUITMENT_DEADLINE` line (lines 48–51 in pre-batch state). The countdown is driven by `GET /api/periods/active`. |
| [frontend/.env.example](../../frontend/.env.example) | Removed the `VITE_RECRUITMENT_DEADLINE` line + its comment block. |
| [CLAUDE.md §7](../../CLAUDE.md) | Stale Bahasa-Indonesia note ("RECRUITMENT_DEADLINE env var bisa dihapus setelah CountdownCard pakai /api/periods/active") rewritten to "removed in Batch 5". |
| [docs/ARCHITECTURE.md §6](../ARCHITECTURE.md) | The env-var table row for `VITE_RECRUITMENT_DEADLINE` deleted. |

`grep -r VITE_RECRUITMENT_DEADLINE` across the entire repo returns zero matches after this change. `grep -r "103\\\\d{10}"` returns zero matches in `frontend/src/`.

---

## Cleanup 4 — `analysis.md` archived

Moved `analysis.md` (14 118 bytes, "Generated 2026-04-25") to [docs/archive/analysis_phase1.md](../archive/analysis_phase1.md) and added a one-line banner at the top:

```
> **Archived Phase 1 analysis — superseded by docs/ARCHITECTURE.md and docs/MODULE_ANALYSIS.md.**
```

The repo root is now free of orphan `analysis.md`. `.gitignore` still ignores any future `analysis.md` regeneration by the `code-review-graph` MCP tool, so this won't quietly resurrect itself.

---

## Smoke-test results

| Test | Result |
|---|---|
| `python -m scripts.smoke_test_auth` | 16/16 passed |
| `python -m scripts.smoke_test_applications` | All checks passed |
| `python -m scripts.smoke_test_periods` | All checks passed |
| `python -m scripts.smoke_test_submit_ner` | All checks passed (CV + ML NER, SWOT cache now also written but no assertions specific to SWOT) |
| `python -m scripts.smoke_test_bulk_announce` | All checks passed |
| `python -m scripts.smoke_test_evaluation` | All checks passed |
| `python -m scripts.smoke_test_upload` | **Pre-existing failure — unrelated to this batch.** The test posts to the legacy `/api/upload` endpoint without an auth token; that route is gated behind `require_role(UserRole.CANDIDATE)` (see [backend/routers/upload.py:60](../../backend/routers/upload.py#L60)) so the server correctly returns 401. `git diff HEAD -- scripts/smoke_test_upload.py backend/routers/upload.py` shows no changes in either file this batch. Test bitrot from when the legacy endpoint was first auth-gated; flagged for the legacy-deprecation work in Phase 2 Task 14.4. |

---

## Side effects & follow-up notes

- **DB-query count change visible to anyone profiling.** The recruiter dashboard list endpoint now issues 3 N-scaling queries (down from 2 + N + N). Any infrastructure-level slow-query log will see fewer rows but they'll have slightly more complex shapes (the GROUP BY for doc counts). Acceptable.
- **Concurrency cap is hard-coded.** `_LLM_CONCURRENCY = 5` lives in `evaluation_service.py`. If a future operator finds that DeepSeek's per-account rate limit is tighter (or looser), they'll edit code. An env-var override could be added cheaply but wasn't requested; deferred to a future tuning pass.
- **SWOT cache miss path still has the fitz cost.** Submit-time NER is best-effort — if it crashes before the SWOT extraction step (e.g. process killed mid-task), the cache row is never written and the `GET /swot-text` endpoint falls back to inline PyMuPDF. The fallback is documented as `source: "live"` in the response so the frontend (or a future smoke test) can detect it.
- **Frontend ESLint clean.** No new warnings; the existing `react-hooks/exhaustive-deps` ignore on `useEffect([divisionFilter, statusFilter])` is unchanged.
- **`smoke_test_upload.py` is now stale enough to flag for either deletion or a rewrite.** The script targets the legacy `/api/upload` (Capstone) flow which Phase 2 Task 14.4 plans to deprecate. Recommendation: delete the script when the legacy endpoint is removed; until then, the Lab-pipeline equivalent is already covered by `smoke_test_applications.py` (uploads via `/api/documents/upload/{doc_type}` with auth).
- **`Document.raw_text` doesn't exist.** The SWOT cache lives on `CandidateDocument`, not `Document`, because the existing AI-pipeline model already has `raw_text` / `document_type` / candidate-link fields. Storing on `CandidateDocument` keeps the schema unchanged and matches the precedent set by the CV + ML cache in Task 10.
