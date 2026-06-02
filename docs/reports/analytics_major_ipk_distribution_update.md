# Analytics — Major & IPK Distribution Update Report

## Implementation Date

2026-06-02

## Branch

backend/ipk

## Feature Name

Analytics demographics: surface Major Distribution and add IPK Distribution

## Summary

Small, focused enhancement to the recruiter Analytics view. The backend already computed `major_distribution` but the UI never rendered it. This change surfaces Major Distribution in the UI and adds a brand-new **IPK Distribution** (`ipk_distribution`) to the analytics API and page, derived from `User.ipk`.

IPK is grouped into fixed, range-stable buckets (`0.00 - 2.49`, `2.50 - 2.99`, `3.00 - 3.49`, `3.50 - 4.00`, `Belum Diisi`). Percentages are computed over the full demographic scope (active-period applications that are not `draft` and not `cancelled`), so candidates without an IPK still count toward the denominator and are surfaced in the `Belum Diisi` bucket.

No recruitment-period flow, scoring, document review, or other dashboard was changed. The `{ success, data, error }` response envelope is preserved.

## Completed Work

- Added `ipk_distribution` to the analytics `demographics` payload (active and zero/no-period payloads).
- Implemented range-stable IPK bucketing with an `Belum Diisi` fallback for null IPK.
- Rendered **Major Distribution** and **IPK Distribution** cards on the Analytics page.
- Regrouped demographics cards (Faculty, Major, Year, IPK) into a single tidy 2-column grid.
- Extended the analytics smoke test with IPK seed data and assertions.
- Updated API reference docs.

## Files Changed

- `backend/routers/analytics.py`
- `frontend/src/pages/recruiter/AnalyticsPage.jsx`
- `scripts/smoke_test_analytics.py`
- `docs/API_REFERENCE.md`
- `docs/reports/analytics_major_ipk_distribution_update.md` (new)

## Backend Changes

- Added `_IPK_BUCKETS` and `_IPK_UNKNOWN_LABEL` ("Belum Diisi") constants.
- Added `_ipk_bucket_label()` (maps a numeric IPK to a bucket via `max_exclusive` boundaries) and `_ipk_distribution()`:
  - Buckets in **fixed order** — never sorted by count — so the IPK ranges stay visually stable.
  - `percentage` is `round(count / total * 100, 1)` where `total` is the full scoped population (one entry per scoped application, `None` included).
  - Returns `[]` when the scope is empty, consistent with the other demographic distributions.
- `_demographics_payload()` now collects `user.ipk` per scoped application and returns `ipk_distribution`.
- Added `"ipk_distribution": []` to the zero/no-active-period payload (`_zero_payload`).
- `major_distribution` logic was left unchanged (it already existed and was correct).

## Frontend Changes

`frontend/src/pages/recruiter/AnalyticsPage.jsx`:

- `EMPTY_ANALYTICS.demographics` now includes `ipk_distribution: []`.
- Added memoized `majorDistribution` and `ipkDistribution` selectors plus `maxMajorCount` and `maxIpkCount` for bar scaling.
- Added a **Major Distribution** card (tone `success`, `"No major distribution data."` empty state) and an **IPK Distribution** card (tone `warning`, `"No IPK distribution data."` empty state), both reusing existing `InsightCard` and `BarRow` components with `${formatScore(item.percentage)}% of scope` detail copy.
- Layout regrouped:
  - Top grid reduced to 2 columns: Applicants Per Division + Funnel Counts.
  - Score Distribution moved to its own full-width row.
  - New demographics grid (`grid grid-cols-1 gap-6 xl:grid-cols-2`) holds Faculty, Major, Year, and IPK distributions together.
- Main metric cards and all other analytics cards were not altered.

## API Changes

`GET /api/recruiter/analytics` → `data.demographics` now returns:

- `faculty_distribution` (existing)
- `major_distribution` (already present in payload; now documented)
- `year_distribution` (existing)
- `ipk_distribution` (**new**) — items `{ label, count, percentage }` in fixed order:
  `0.00 - 2.49`, `2.50 - 2.99`, `3.00 - 3.49`, `3.50 - 4.00`, `Belum Diisi`.

The no-active-period payload returns `ipk_distribution: []` alongside the other empty distributions. Response envelope `{ success, data, error }` unchanged.

## Testing Results

- `python -m compileall backend scripts` — ✅ passed (no errors).
- `python -m scripts.smoke_test_analytics` — ✅ **Analytics smoke checks passed** (includes new IPK bucket counts, stable-order assertion, scope-based percentage check, and division-filtered IPK scoping).
- `cd frontend && npm run build` — ✅ built successfully (pre-existing large-chunk warning only, unrelated to this change).

### Smoke test seed coverage (IPK)

Scoped population = 9 (excludes 1 draft + 1 cancelled). Expected `ipk_distribution`:

| Bucket | Count |
|---|---|
| 0.00 - 2.49 | 1 |
| 2.50 - 2.99 | 1 |
| 3.00 - 3.49 | 2 |
| 3.50 - 4.00 | 3 |
| Belum Diisi | 2 |

Boundary `3.49` correctly lands in `3.00 - 3.49`; two candidates with no IPK land in `Belum Diisi` (22.2% of scope).

## Manual Checklist

- [x] Analytics API returns `demographics.major_distribution`.
- [x] Analytics API returns `demographics.ipk_distribution`.
- [x] Null/empty IPK lands in the `Belum Diisi` bucket.
- [x] IPK buckets returned in a stable, count-independent order.
- [x] Analytics page shows a Major Distribution card.
- [x] Analytics page shows an IPK Distribution card.
- [x] Demographics grid is tidy and responsive on desktop.
- [x] Existing analytics cards still render and work.
- [x] Smoke test passes.
- [x] Frontend build passes.
- [x] Backend compile passes.
- [x] API docs and this report updated.

## Known Limitations / Follow-up Notes

- IPK bucket boundaries are hard-coded in `analytics.py`. If the institution changes IPK banding, update `_IPK_BUCKETS` and the API docs together.
- IPK values are assumed to be on a 0.00–4.00 scale; values above 4.00 still fall into the open `3.50 - 4.00` bucket. No validation of out-of-range IPK is done here (that belongs to the profile/IPK-entry layer).
- Score Distribution is now full-width; if a future card is added next to it, revisit that row's grid.
