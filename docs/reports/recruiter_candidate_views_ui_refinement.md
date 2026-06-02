# Recruiter Candidate Views — Contextual UI Refinement Report

## Implementation Date

2026-06-02

## Branch

backend/ipk

## Feature Name

Contextual recruiter layouts for Evaluation, Candidates, and Announcements

## Summary

The recruiter Evaluation, Candidates, and Announcements pages previously rendered the **same dense table** (Candidate, NIM, IPK, Division, Status, Validasi AI, Docs progress, Composite Score, Submitted, action). The result was repetitive and unfocused.

This change makes each page **contextual** to its job, frontend-only:

- **Evaluation** → a **work queue** of candidate cards grouped by evaluation/validation state (run + validate AI results).
- **Candidates** → a **ranked horizontal candidate list** (review and compare by score/rank).
- **Announcements** → kept as a table, but **compact and decision-focused** (select + publish), and the **only** place the green "AI Recommended" accent appears.

No backend, API, scoring, evaluation, document-review, announcement-publish, or recruitment-period logic was touched. The existing `listRecruiterApplications` response (which already includes `ai_validation_status`, `rank`, `is_recommended`, `evaluation`, and `candidate`) was reused as-is.

## Completed Work

- Added two reusable workspace helpers and four reusable recruiter components.
- Rebuilt Evaluation as a grouped work queue (Pending Evaluation / Pending AI Validation / Needs Discussion / Validated).
- Rebuilt Candidates as a ranked horizontal card list with summary metrics and filters.
- Rebuilt the Announcements table as a compact, decision-focused table that preserves batch selection and publish flow.
- Scoped the "AI Recommended" accent to Announcements only.
- Standardised the compact "Validasi AI" marker across all three contexts.
- Updated page copywriting to the AI-anonymized framing and removed "AI decides"-style wording.

## Files Changed

### Frontend Changes

- `frontend/src/lib/recruiterWorkspace.js` — added `isScoredApplication()` and `getAiValidationStatus()` helpers.
- `frontend/src/pages/recruiter/EvaluationPage.jsx` — replaced the full `ApplicationsTable` with a grouped work-queue of `CandidateResultCard`s; added queue-grouping memo, loading/empty states, and updated description copy.
- `frontend/src/pages/recruiter/CandidatesPage.jsx` — replaced the table (and the separate top-3 `CandidateReviewCard` preview) with a ranked horizontal `CandidateResultCard` list; swapped the "Recommended" metric for a "Tervalidasi" metric; updated copy.
- `frontend/src/pages/recruiter/AnnouncementsPage.jsx` — swapped `ApplicationsTable` for the new `CandidateCompactTable`; updated description copy. Selection state, `canPublish` gating, and `bulkAnnounce` flow are unchanged.

### Component Changes

- **New** `frontend/src/components/recruiter/CandidateResultCard.jsx` — horizontal candidate row used by Evaluation (`variant="evaluation"`) and Candidates (`variant="ranking"`). Props: `application`, `variant`, `from/fromLabel/returnLabel`, `showScore` (default true), `showValidation` (default true), `showRecommendation` (default false), `showAcademicMeta` (default false). Stacks vertically on mobile, score on the right on desktop.
- **New** `frontend/src/components/recruiter/AiValidationBadge.jsx` — compact recruiter marker: `pending → "Menunggu"`, `validated → "Tervalidasi"`, `needs_discussion → "Diskusi"`, fallback `"-"`. Full label exposed via native `title` tooltip. Distinct tones (amber / soft green / orange).
- **New** `frontend/src/components/recruiter/CandidateRecommendationBadge.jsx` — soft green outline "AI Recommended" hint. Used **only** in Announcements.
- **New** `frontend/src/components/recruiter/CandidateCompactTable.jsx` — compact Announcements table: Select, Candidate (name + email/NIM), Division, Score/Rank, Validasi AI, AI Recommendation, Decision (Selected Pass / Not selected), Detail. Preserves selection, lock-unevaluated, and row→detail navigation. Horizontal scroll wrapper for narrow viewports.
- `frontend/src/components/recruiter/ApplicationsTable.jsx` — left untouched; still used by the out-of-scope `ApplicationsPage`.
- `frontend/src/components/recruiter/CandidateReviewCard.jsx` — no longer referenced (was only used by the old Candidates top-3 preview); left in place to keep the change minimal (see follow-up notes).

## UX Decisions

- **Evaluation uses a work queue / card list** because its job is running AI evaluation and then validating results. Grouping by Pending Evaluation → Pending AI Validation → Needs Discussion → Validated turns the page into an actionable queue instead of a data dump. Validation itself is performed on the Candidate Detail page (existing dialog), so each card's primary action is **Open Detail** — no duplicated note-required dialog here.
- **Candidates uses a ranked horizontal card list** because its job is reviewing and comparing candidates. Rank chip + large composite score on the right make scanning easy; identity, status, and AI validation are the secondary line.
- **Announcements stays a compact table** because it needs multi-row selection and a batch publish decision — a table is the right tool. Columns were trimmed to what a publish decision needs.
- **"AI Recommended" is shown only in Announcements.** The AI recommendation is decision support for the final pass/fail call; surfacing it during earlier review risks anchoring recruiters before they've reviewed. Evaluation and Candidates therefore show no recommended accent.
- **NIM / IPK / docs progress / submitted date were removed from the primary lists** to cut repetition and visual noise. They remain fully available on the Candidate Detail page. On Candidates, NIM/IPK are shown only as small secondary metadata (`showAcademicMeta`).
- **Badge color semantics were separated** so green no longer means one thing everywhere: AI Recommended = soft green outline; Selected Pass = solid green; Tervalidasi = soft green chip; Menunggu = amber; Diskusi = orange.

## Testing Results

- `cd frontend && npm run build` — ✅ built successfully (pre-existing large-chunk warning only; unrelated).
- `npx eslint` on all changed pages/components/helpers — ✅ no errors or warnings.
- No backend changes, so no backend smoke test was required.

## Manual Checklist

- [x] Evaluation renders as a grouped work-queue/card list, not a full table.
- [x] Candidates renders as ranked horizontal cards, not a full table.
- [x] Announcements remains a table, but compact and decision-focused.
- [x] "AI Recommended" appears only in Announcements.
- [x] Evaluation shows no AI Recommended accent.
- [x] Candidates shows no dominant AI Recommended accent.
- [x] Validasi AI badge is visible in all three contexts.
- [x] Open Detail still navigates with back-context preserved.
- [x] Division/status filters still work (Candidates, Announcements).
- [x] Publish Results flow and candidate selection unchanged in Announcements.
- [x] Score/rank render correctly.
- [x] No large UI overflow on desktop; table scrolls horizontally on narrow widths.
- [x] Frontend build passed.

## Known Limitations / Follow-up Notes

- `CandidateReviewCard.jsx` is now unused (the old Candidates top-3 preview was removed in favour of the ranked list). It was intentionally left in place to keep this change UI-only and low-risk; it can be deleted in a later cleanup once confirmed unreferenced.
- There are now two AI-validation badge components: the original full-label `components/AiValidationBadge.jsx` (used by Candidate Detail and the untouched `ApplicationsTable`) and the new compact `components/recruiter/AiValidationBadge.jsx` (used by the refined recruiter views). They can be consolidated later if a single component with a `size`/`compact` prop is preferred.
- Optional inline quick-validation actions ("Tandai Tervalidasi" / "Perlu Diskusi") were intentionally not added to the Evaluation cards; validation stays on the Candidate Detail page where the note-required dialog already lives. This can be revisited if recruiters want one-click validation from the queue.
- `ApplicationsPage` (a separate, out-of-scope page) still uses the original dense `ApplicationsTable`; it was deliberately left unchanged.
