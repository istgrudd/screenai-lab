# Staging Minor Cleanup & Announcement Scope Hardening

## Implementation Date

2026-06-02

## Branch

backend/ipk

## Feature Name

Bulk-announce screening-only scope + recruiter view cleanup (unused components, badge consolidation, lint)

## Summary

Pre-staging cleanup and hardening on top of the contextual recruiter views work:

1. **Bulk announce scope narrowed to `screening` only.** Already-announced candidates (`announced_pass` / `announced_fail`) are no longer re-processed by bulk publish; they are monitoring-only. Empty pass list (zero-pass) still works for screening candidates.
2. **Announcements UI split** into a **Ready to Announce** decision table (screening) and a read-only **Published** view. Only ready candidates enter the publish payload.
3. **Deleted unused components** (`ApplicationsTable.jsx`, `CandidateReviewCard.jsx`).
4. **Consolidated the two `AiValidationBadge` components** into one canonical `common/AiValidationBadge` with `compact` / full label modes.
5. **Fixed the two pre-existing ESLint errors** (the duplicate badge file is gone; `AiValidationDialog` no longer sets state in an effect).

No scoring, AI evaluation, document review, recruitment period, or AI-validation semantics were changed. The bulk-announce request/response shape is unchanged (backward compatible).

## Completed Work

- Hardened `bulk_announce` scope + docstring + error message.
- Rewrote the bulk-announce smoke test for the new scope and required scenarios.
- Added `isReadyToAnnounce` / `isAnnouncedApplication` helpers.
- Created canonical `common/AiValidationBadge`; repointed all imports; deleted both old badge files.
- Added a `readOnly` published mode to `CandidateCompactTable`; decision eligibility is now screening-only.
- Split the Announcements page into Ready-to-Announce vs Published.
- Fixed `AiValidationDialog` lint; deleted unused components.
- Updated API reference, user guide, and this report.

## Files Changed

### Backend Changes

- `backend/routers/announcements.py`
  - Renamed `_EVALUATED_STATUSES` → `_BULK_ANNOUNCE_READY_STATUSES = (ApplicationStatus.SCREENING,)`.
  - Bulk scope query now filters `status == screening` only.
  - Updated `bulk_announce` docstring (scope = screening only; empty pass list valid; already-announced untouched).
  - Updated the invalid-ids error to: "Application(s) … are not ready to announce … Only candidates in screening status can be published by bulk announce."
  - The single-announcement endpoint (`POST /api/announcements`) is unchanged — it remains the correction path that can still touch already-announced applications.

### Frontend Changes

- `frontend/src/lib/recruiterWorkspace.js` — added `isReadyToAnnounce()` (status === "screening") and `isAnnouncedApplication()`.
- `frontend/src/components/common/AiValidationBadge.jsx` — **new** canonical badge with `compact` (Menunggu / Diskusi) vs full (Menunggu Validasi / Perlu Diskusi) labels; "Tervalidasi" in both; `-` for null/unknown; full label always in the title tooltip.
- `frontend/src/components/recruiter/CandidateCompactTable.jsx` — uses the canonical badge (`compact`); added `readOnly` published mode (renders the result `StatusBadge` instead of a decision control); decision control gated on `isReadyToAnnounce`; recommendation highlight/badge only in the editable view.
- `frontend/src/components/recruiter/CandidateResultCard.jsx` — uses the canonical badge with `compact`.
- `frontend/src/pages/CandidateDetailPage.jsx` — imports the canonical badge (full label).
- `frontend/src/pages/recruiter/AnnouncementsPage.jsx` — split into **Ready to Announce** (screening, editable decisions) and **Published** (read-only); decision state/counts/`passIds` derive from ready candidates only; copy updated.
- `frontend/src/components/AiValidationDialog.jsx` — replaced the `useEffect` note-reset with a reset-on-close handler (`handleOpenChange`), fixing the `react-hooks/set-state-in-effect` error.

### Cleanup Changes

- Deleted `frontend/src/components/AiValidationBadge.jsx` (duplicate; had the `react-refresh/only-export-components` error).
- Deleted `frontend/src/components/recruiter/AiValidationBadge.jsx` (duplicate compact badge).
- Deleted `frontend/src/components/recruiter/ApplicationsTable.jsx` (unused).
- Deleted `frontend/src/components/recruiter/CandidateReviewCard.jsx` (unused).
- Verified no remaining importers before deletion.

### Documentation Changes

- `docs/API_REFERENCE.md` — `POST /api/announcements/bulk` scope rewritten to screening-only; documented untouched already-announced rows, empty-pass zero-pass behavior, the 400 "not ready to announce" error, and the correction path note.
- `docs/frontend_user_guide.md` — Announcements section updated (Ready to Announce vs Published; bulk publish only touches screening).
- `scripts/smoke_test_bulk_announce.py` — rewritten for screening-only scope and the required scenarios.

## API Changes

No request/response shape change. Behavioral narrowing only: bulk publish scope is now `screening` only, and passing a non-screening id returns `400`. Empty `passed_application_ids` remains valid (zero-pass).

## Testing Results

- `python -m compileall backend scripts` — ✅ COMPILE_OK.
- `python -m scripts.smoke_test_bulk_announce` — ✅ ALL TESTS PASSED. Scenarios:
  - candidate → 403; invalid division → 422.
  - out-of-division id → 400; submitted id → 400; **already-announced id → 400** with a "ready to announce / screening" message.
  - valid publish (pass=[C]) → screening C → announced_pass, screening D → announced_fail; already-announced A/B and submitted untouched.
  - re-publish empty scope → 200 with 0/0 changes; already-announced rows unchanged.
  - **zero-pass** (2 screening, pass=[]) → announced_pass 0 / announced_fail 2.
  - **single-fail** (1 screening, pass=[]) → announced_pass 0 / announced_fail 1.
- `cd frontend && npm run build` — ✅ built successfully (only the pre-existing large-chunk warning).
- `cd frontend && npx eslint src/components src/pages/recruiter src/pages/CandidateDetailPage.jsx src/lib` — ✅ clean.
- `cd frontend && npx eslint .` — ✅ **clean (0 errors)**; the 2 previously-reported errors are gone.

## Manual Checklist

- [x] Bulk publish only touches `screening` candidates.
- [x] `announced_pass` / `announced_fail` are not re-processed by bulk publish.
- [x] Empty `passed_application_ids` (zero-pass) works for screening candidates.
- [x] Single screening candidate marked fail publishes successfully.
- [x] Invalid pass ID from a non-screening status returns 400 with a clear message.
- [x] Announcements decision payload uses ready (screening) candidates only.
- [x] Published candidates are read-only and excluded from the payload; show Lolos / Tidak Lolos.
- [x] Applications / Evaluation / Candidates pages still build and render after cleanup.
- [x] Single canonical `AiValidationBadge`; Candidate Detail uses full label; recruiter lists use compact.
- [x] No broken imports after deletions.
- [x] Frontend build passed; repo-wide ESLint clean.
- [x] API docs + user guide updated; report created.

## Known Limitations / Follow-up Notes

- **Correcting an already-announced result** is intentionally out of bulk publish. The single-announcement endpoint `POST /api/announcements` still allows flipping `announced_pass`/`announced_fail`; a dedicated correction UI is a possible future addition (not in scope here).
- The Published view derives from the **currently loaded** division/status view. With a status filter applied, it shows only the matching announced rows; this is monitoring-only and does not affect the publish payload (which is screening-only).
- `AiValidationDialog` resets its note on close rather than on open; functionally equivalent for the current open-from-closed usage on the Candidate Detail page.
- The large-bundle Vite warning is pre-existing and unrelated; code-splitting remains a separate follow-up.
