# Async DeepSeek Concurrency Report

Date: 2026-05-27

This report documents the current async LLM client fix. Older batch reports in
this directory are historical context and were not rewritten.

## Problem Summary

Batch evaluation was structured as async code:

- `run_evaluation_pipeline()` used `asyncio.gather(...)`.
- `_LLM_CONCURRENCY` capped work with `asyncio.Semaphore(5)`.
- `_evaluate_one()` awaited `evaluate_candidate(...)`.

However, `evaluate_candidate(...)` called the synchronous `call_llm_json(...)`
helper. That helper used the sync `OpenAI` client and `time.sleep(...)` retry
backoff, so each DeepSeek request blocked the event loop.

## Root Cause

The concurrency boundary was placed around async coroutines, but the slowest
operation inside those coroutines was synchronous network I/O. The semaphore
limited how many evaluation tasks entered the LLM section, but the event loop
could not schedule other evaluation tasks while a sync DeepSeek request was in
progress.

## Files Changed

- `backend/utils/llm_client.py`
- `backend/services/rag_pipeline.py`
- `backend/services/evaluation_service.py`
- `docs/ISSUES_AND_NOTES.md`
- `docs/API_REFERENCE.md`
- `docs/ARCHITECTURE.md`
- `docs/FLOW_DIAGRAMS.md`
- `docs/MODULE_ANALYSIS.md`
- `docs/reports/ASYNC_DEEPSEEK_CONCURRENCY_REPORT.md`

## Implementation Summary

- Added `get_async_llm_client()` with a module-level `AsyncOpenAI` singleton.
- Added `call_llm_async(...)`, mirroring the sync `call_llm(...)` defaults and
  retry behavior while awaiting `client.chat.completions.create(...)`.
- Added `call_llm_json_async(...)`, mirroring `call_llm_json(...)` and reusing
  `_parse_json_response(raw)` so markdown-fence JSON parsing stays identical.
- Switched `rag_pipeline.evaluate_candidate(...)` to await
  `call_llm_json_async(...)`.
- Preserved the existing sync LLM helpers for compatibility with any current or
  future sync callers.
- Updated evaluation-service comments and docs so the concurrency description
  matches the source.

## Why AsyncOpenAI Instead of asyncio.to_thread

`AsyncOpenAI` is the native async client for the OpenAI-compatible SDK. It keeps
network I/O awaitable without spending worker threads on blocked sync requests,
and it lets retry backoff use `asyncio.sleep(...)`.

`asyncio.to_thread(...)` would have avoided blocking the event loop, but it
would still run the synchronous client in a thread pool. That adds thread-pool
capacity as another concurrency limit and leaves the code on the sync transport
path. Native async I/O is the cleaner fit for an async FastAPI pipeline.

## Validation Performed

- `python -m compileall backend`
- Static source check confirmed:
  - `rag_pipeline.evaluate_candidate(...)` imports `call_llm_json_async`.
  - `evaluate_candidate(...)` awaits `call_llm_json_async(...)`.
  - The async retry path uses `asyncio.sleep(...)`.
- Standalone async JSON parse smoke check with a monkeypatched
  `call_llm_async(...)` returned a parsed dict without requiring a DeepSeek key.
- `python -m scripts.smoke_test_evaluation`
- `python -m scripts.smoke_test_submit_ner`
- `python -m scripts.smoke_test_phase_enforcement`

The existing smoke scripts ran against local TestClient/database state. A
DeepSeek key was available in the local environment, so the evaluation and
submit-time NER smoke tests also exercised live DeepSeek-backed scoring.

## Remaining Limitations / Follow-ups

- `_LLM_CONCURRENCY` remains a hard-coded constant set to `5`; expose it through
  `Settings` if operators need environment-specific rate-limit tuning.
- SQLAlchemy access in the evaluation pipeline remains synchronous. This is
  acceptable for the current design because DB work happens outside the awaited
  LLM request, but a fully async DB session would be a larger future refactor.
- The existing end-to-end smoke scripts depend on local database state and, for
  full successful scoring, a working DeepSeek key.
