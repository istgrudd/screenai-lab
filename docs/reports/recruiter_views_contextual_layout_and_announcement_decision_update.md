# Recruiter Views — Contextual Layout & Announcement Decision Update

## Implementation Date

2026-06-02

## Branch

backend/ipk

## Feature Name

Contextual recruiter layouts (Applications/Evaluation/Candidates) + explicit pass/fail announcement decisions

## Summary

Follow-up refinement of the four recruiter list pages so each has a distinct visual function, plus a rework of the Announcements decision model:

- **Applications** → compact **administrative** table (registration + document readiness). No score / AI validation / AI recommendation / rank / IPK columns.
- **Evaluation** → compact **work-queue** cards (less whitespace), grouped by evaluation/validation state. No AI Recommended badge.
- **Candidates** → compact **ranked** rows (less whitespace). No AI Recommended badge.
- **Announcements** → compact **decision** table driven by an explicit per-candidate decision (**Lolos / Tidak Lolos / Belum Diputuskan**) instead of a pass-only checkbox. AI recommendation is now a soft-green row highlight + small badge (no separate column). Publishing supports **zero pass** (everyone Tidak Lolos) and is blocked while any eligible candidate is **Belum Diputuskan**.

This is UI/UX + announcement decision handling only. Scoring, AI evaluation, document review, recruitment period, and AI validation semantics are unchanged. The announcement **publish logic is unchanged**: the existing `POST /api/announcements/bulk` already publishes the pass set and fails the rest in scope (empty pass list ⇒ all fail), so the edge cases were fixed on the frontend and proven with a new backend smoke scenario — no publish-endpoint code change.

## Completed Work

- Added announcement-decision helpers and reused the existing card/badge components.
- Made `CandidateResultCard` a dense single-row grid (Evaluation + Candidates).
- Built an administrative `ApplicationAdminTable` and pointed Applications at it.
- Rebuilt the Announcements decision flow (explicit decisions, green-highlight recommendation, zero-pass publish, undecided block, bulk helpers).
- Updated copy across all four pages.
- Added a zero-pass scenario to the bulk-announce smoke test.
- Updated API reference and the frontend user guide.

## Files Changed

### Frontend Changes

- `frontend/src/lib/recruiterWorkspace.js` — added `ANNOUNCE_DECISIONS`, `ANNOUNCE_DECISION_LABEL`, `isAnnouncementEligible()`, `defaultAnnouncementDecision()`.
- `frontend/src/pages/recruiter/ApplicationsPage.jsx` — administrative copy, administrative metric cards (in review / needs correction / verified), removed the AI "Recommended" quick filter, uses `ApplicationAdminTable`.
- `frontend/src/pages/recruiter/EvaluationPage.jsx` — unchanged logic; benefits from the compacted `CandidateResultCard`.
- `frontend/src/pages/recruiter/CandidatesPage.jsx` — unchanged logic; benefits from the compacted `CandidateResultCard`.
- `frontend/src/pages/recruiter/AnnouncementsPage.jsx` — explicit decision state (derived baseline + user overrides, no setState-in-effect), decision counts, zero-pass-aware `canPublish`, conditional confirmation copy, `Apply AI Recommendation` / `Mark undecided as Tidak Lolos` helpers, decision-focused metrics.

### Component Changes

- `frontend/src/components/recruiter/CandidateResultCard.jsx` — rewritten as a compact `lg:grid` row (`identity | badges | score+action`); badge column fills the middle so the score is no longer separated by a large empty gap; reduced padding; score caption trimmed.
- `frontend/src/components/recruiter/CandidateCompactTable.jsx` — rewritten for the decision flow: columns `Candidate | Division | Score/Rank | Validasi AI | Decision | Action`; removed the checkbox and the AI Recommendation columns; AI-recommended rows get a soft-green highlight + inline "AI Recommended" badge; already-published rows show their status badge (`announced_fail` → "Tidak Lolos").
- `frontend/src/components/recruiter/CandidateDecisionControl.jsx` — **new**; a `Select` with Lolos / Tidak Lolos / Belum Diputuskan, disabled (`-`) for non-eligible rows.
- `frontend/src/components/recruiter/ApplicationAdminTable.jsx` — **new** compact administrative table (Candidate / Division / Status / Documents / Submitted / Action) with a small documents progress indicator.
- `frontend/src/components/recruiter/AnnouncementSafetyPanel.jsx` — checklist item changed from "Pass candidates selected" to "Semua kandidat sudah diputuskan" (ready when no eligible candidate is undecided); takes `passCount` / `failCount` / `undecidedCount`.
- `frontend/src/components/recruiter/CandidateRecommendationBadge.jsx` — reused as the small "AI Recommended" badge (Announcements only).
- Now-unused (left in place, see follow-up): `frontend/src/components/recruiter/ApplicationsTable.jsx`, `frontend/src/components/recruiter/CandidateReviewCard.jsx`.

### Backend Changes

None. The `POST /api/announcements/bulk` endpoint and all publish logic are unchanged; the empty-pass-list (zero-pass) path already produces all-`announced_fail`.

### Documentation

- `docs/API_REFERENCE.md` — documented that `passed_application_ids` may be empty (zero-pass → all `announced_fail`), and that the UI drives the endpoint from an explicit decision while keeping the payload backward compatible.
- `docs/frontend_user_guide.md` — updated Applications, Candidates, and Announcements sections (decision dropdown, green recommendation highlight, zero-pass publish, undecided block).
- `scripts/smoke_test_bulk_announce.py` — added T10 zero-pass scenario.

## API Changes

None to request/response shapes. Clarified (already-supported) behavior: empty `passed_application_ids` is valid and publishes every in-scope evaluated candidate as `announced_fail`. Payload remains backward compatible.

## UX Decisions

- **Applications is administrative**, so composite score, AI validation, AI recommendation, rank, and IPK were removed from its main table; full data stays on Candidate Detail.
- **Evaluation uses compact work-queue cards** because its job is running and validating AI results; the card was tightened into a single dense row to remove the wide empty gap before the score.
- **Candidates uses compact ranked rows** for fast scanning/comparison; same dense-row treatment.
- **Announcements stays a compact table** because it needs a final decision + publish action; the decision is now explicit (pass/fail/undecided) rather than inferred from a checkbox.
- **AI Recommendation is decision support, shown only on Announcements** as a soft-green row highlight + small badge (no dedicated, mostly-empty column), and only when a threshold/recommendation exists.
- **Final decision is explicit pass/fail**, not "selected vs not selected"; `announced_fail` always reads "Tidak Lolos".
- **Zero-pass publish is valid** when every eligible candidate is explicitly Tidak Lolos; a dedicated confirmation is shown, and publishing is blocked while any eligible candidate is Belum Diputuskan.

## Testing Results

- `cd frontend && npm run build` — ✅ built successfully (only the pre-existing large-chunk warning).
- `npx eslint` on all changed/new files — ✅ clean. (Repo-wide `eslint .` still reports 2 **pre-existing** errors in `components/AiValidationBadge.jsx` and `components/AiValidationDialog.jsx` from an earlier task — untouched here, confirmed via `git status`.)
- `python -m scripts.smoke_test_bulk_announce` — ✅ ALL TESTS PASSED, including the new T10: zero-pass publish → `200`, `announced_pass: 0`, `announced_fail: 2`, both apps flipped to `announced_fail`.
- `python -m compileall scripts/smoke_test_bulk_announce.py` — ✅.

## Manual Checklist

Applications:
- [x] Compact administrative table; no AI validation / score / recommendation columns.
- [x] Search + quick filters + division/status filters work; open detail works.

Evaluation:
- [x] Compact work-queue cards, reduced whitespace; no AI Recommended badge.
- [x] Run / Re-evaluate and Open Detail still work.

Candidates:
- [x] Compact ranked rows, reduced whitespace; no AI Recommended badge; score/rank visible; filters + open detail work.

Announcements:
- [x] Explicit decision control (Lolos / Tidak Lolos / Belum Diputuskan); checkbox removed.
- [x] AI-recommended rows show soft-green highlight + small badge; no AI Recommendation column.
- [x] `announced_fail` shows "Tidak Lolos".
- [x] Zero-pass publish works with a dedicated confirmation; single-candidate fail publishes.
- [x] Publish blocked while any eligible candidate is Belum Diputuskan.
- [x] Publish flow and pass/fail results remain correct.

## Known Limitations / Follow-up Notes

- `ApplicationsTable.jsx` and `CandidateReviewCard.jsx` are now unused (no importers). Left in place to keep this change UI-only and low-risk; safe to delete in a later cleanup.
- Announcement decisions are derived from the **currently loaded** division view. Because the backend bulk endpoint scopes the whole `(division, period)`, publishing while a status filter hides some evaluated candidates could fail rows not visible in the view. This matches the previous behavior; recruiters publish per division with all statuses visible. A future hardening could load the full division scope before publishing or surface a hidden-rows warning.
- Two AI-validation badge components still coexist (full-label `components/AiValidationBadge.jsx` used on Candidate Detail; compact `components/recruiter/AiValidationBadge.jsx` used in the recruiter lists). Consolidation remains an optional later cleanup.
- The 2 repo-wide ESLint errors noted above are pre-existing and out of scope for this UI task.
