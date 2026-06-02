# AI-Anonymized Evaluation — Concept & UI Update Report

## Implementation Date

2026-06-02

## Branch

backend/ipk

## Feature Name

AI-Anonymized Evaluation — terminology, CandidateDetailPage UI, and documentation alignment

## Summary

Reframed the product concept from **"Blind Screening"** to **"AI-Anonymized Evaluation"**. The system anonymizes candidate document text *before it is sent to the AI*, so personal identifiers are excluded from AI scoring input. Recruiters, however, retain full access to candidate identity for administrative verification, review, and final decision-making. This is **not** full blind recruitment, and the previous wording overstated that.

Scope of this change is conceptual/copywriting plus a focused CandidateDetailPage UI rework. The AI anonymization pipeline, scoring logic, recruitment-period flow, and document upload/review logic were **not** altered (only naming/copy in their docstrings was clarified).

## Completed Work

- Standardized on the term **AI-Anonymized Evaluation** across UI and docs.
- Removed the Reveal/Hide Identity mechanism from CandidateDetailPage.
- Added a persistent **Candidate Profile** card at the top of the candidate detail page.
- Removed the large SWOT Highlight panel from CandidateDetailPage (SWOT remains previewable via Application Documents).
- Added `whatsapp` to the candidate detail `user_profile` backend response.
- Added clarifying helper copy to the Evaluation and Candidates pages.
- Updated documentation and code docstrings to reflect the new concept.

## Files Changed

### Frontend Changes

- `frontend/src/pages/CandidateDetailPage.jsx`
  - Removed `identityRevealed` state and the entire Reveal/Hide Identity card (including the "masked during evaluation to ensure unbiased screening" and "Identity is hidden during blind screening" copy).
  - Removed the `SwotHighlightPanel` import and its render block. SWOT documents stay available via the Preview button in Application Documents.
  - Replaced the amber `CandidateProfileSnapshot` helper with a new `CandidateProfileCard` rendered at the top of the page (after the candidate header, before Application Documents).
  - Candidate Profile card shows: full name, email, WhatsApp, NIM, faculty, major, year, IPK, division, application status, submitted-at, and anonymous ID — with `-` fallbacks for null/undefined fields.
  - Card description states identity is visible to recruiters and that personal identifiers are excluded from AI evaluation input.
  - Removed now-unused imports (`Pencil`, `EyeOff`).
- `frontend/src/pages/recruiter/EvaluationPage.jsx`
  - Updated page description to "Run AI-anonymized evaluation per division…" clarifying anonymization applies to AI input only.
- `frontend/src/pages/recruiter/CandidatesPage.jsx`
  - Added helper copy: "AI scoring uses anonymized document content; recruiter-facing candidate data remains visible for operational review."

### Backend Changes

- `backend/routers/candidates.py`
  - Added `whatsapp` to the `user_profile` object returned by `GET /api/candidates/{id}`.
  - Updated the cross-link comment to clarify recruiters may view identity; only the AI-facing document text is anonymized.
- `backend/services/anonymizer.py`
  - Reworded module docstring from "blind screening" to AI-anonymized evaluation framing.
- `backend/models/candidate.py`
  - Reworded the `Candidate` docstring; `anonymous_id` is the AI-facing label, not a recruiter-side identity gate.
- `backend/main.py`
  - Updated FastAPI app description: "NER blind screening" → "NER-based AI-anonymized evaluation".

No recruiter endpoint to mutate candidate data was added. The anonymization pipeline itself was not changed.

### Documentation Changes

- `PRD.md` — Ringkasan Produk, feature F-57, recruiter flow, and role matrix now describe AI-Anonymized Evaluation and clarify it is not full blind recruitment.
- `docs/API_REFERENCE.md` — candidate detail endpoint now lists full `user_profile` fields (incl. `whatsapp`) and notes identity is always visible to recruiters.
- `docs/MODULE_ANALYSIS.md` — NER anonymization responsibility reworded.
- `docs/frontend_user_guide.md` — CandidateDetailPage section updated to describe the Candidate Profile card; removed Reveal/Hide Identity buttons.
- `docs/features/EXECUTION_PLAN.md` — document-verification design notes reworded from "blind screening" to AI-anonymized evaluation.
- `docs/reports/frontend_feature_button_inventory.md` — CandidateDetailPage entries updated (Candidate Profile card; removed reveal/hide identity and SWOT refresh actions).

## Testing Results

- `cd frontend && npm run build` — ✅ passed (built successfully; pre-existing large-chunk warning unrelated to this change).
- `python -m compileall backend scripts` — ✅ passed (no compile errors).
- Repository search for stale copy (`blind screening`, `Reveal Identity`, `Hide Identity`, `identity is hidden`, `unbiased screening`, `masked during`) — only intentional negations remain ("this is not full blind recruitment").

## Manual Checklist

- [x] CandidateDetailPage shows the Candidate Profile card at the top.
- [x] No Reveal Identity / Hide Identity buttons remain.
- [x] SWOT Highlight panel no longer renders on the detail page.
- [x] SWOT document is still previewable from Application Documents.
- [x] Candidates table is unchanged and still shows candidate identity.
- [x] Evaluation page still works; copy clarifies AI-anonymized evaluation.
- [x] Document Verification page still works (administrative validation, unchanged).
- [x] Copywriting no longer claims full blind screening.
- [x] No unused imports in `CandidateDetailPage.jsx`.

## Known Limitations / Follow-up Notes

- `frontend/src/components/SwotHighlightPanel.jsx` is now unused (no remaining imports). It was intentionally left in place to keep this change minimal; it can be deleted in a future cleanup once confirmed unnecessary.
- The candidate-side NER entity breakdown that was previously shown in the Reveal Identity card is no longer surfaced in the UI. The data is still returned in `documents[].entities` from the API if a future feature needs it.
- This change does not introduce field-level anonymization of the recruiter table; per scope, recruiter-facing identity remains fully visible.
