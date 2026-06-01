# Frontend Redesign Phase 3 - Shared UI Components

Date: 2026-06-02

## Summary

Phase 3 added the shared UI primitives and centralized status/phase maps needed for the next redesign phases. The work intentionally stops at reusable components and mapping foundations; no candidate, recruiter, admin, auth, route, guard, API, document, evaluation, announcement, or admin period flow was redesigned.

## Files Changed

Phase 3 files created:

- `frontend/src/lib/statusMaps.js`
- `frontend/src/lib/phaseMaps.js`
- `frontend/src/components/common/StatusBadge.jsx`
- `frontend/src/components/common/PhaseBadge.jsx`
- `frontend/src/components/common/MetricCard.jsx`
- `frontend/src/components/common/ActionCard.jsx`
- `frontend/src/components/common/EmptyState.jsx`
- `frontend/src/components/common/LoadingState.jsx`
- `frontend/src/components/common/StepTrack.jsx`
- `frontend/src/components/common/ConfirmActionDialog.jsx`
- `docs/reports/frontend_redesign_phase_3_shared_components.md`

No existing page consumer was migrated in Phase 3.

## Shared Maps Added

### statusMaps.js

Adds centralized metadata and tone classes for:

- application statuses: `draft`, `submitted`, `document_review`, `correction_requested`, `verified`, `screening`, `evaluated`, `announced_pass`, `announced_fail`, `cancelled`, `closed`, `rejected`
- document statuses: `pending`, `uploaded`, `verified`, `rejected`, `correction_requested`, `missing`
- user statuses: `active`, `inactive`, `deactivated`, `suspended`
- email statuses: `pending`, `captured`, `sent`, `failed`, `disabled`
- audit actions: `document_verification`, `document_review_finalized`, `announcement`, `bulk_announcement`, `score_override`, `user_role_update`, `user_deactivated`, `user_reactivated`, `period_created`, `period_updated`, `period_closed`
- recommendation statuses: `recommended`, `not_recommended`

Exports:

- `APPLICATION_STATUS_META`
- `DOCUMENT_STATUS_META`
- `USER_STATUS_META`
- `EMAIL_STATUS_META`
- `AUDIT_ACTION_META`
- `RECOMMENDATION_STATUS_META`
- `STATUS_TONE_CLASS`
- `getStatusMeta(status, entityType)`
- `formatStatusLabel(status)`

Unknown or null statuses return a neutral fallback and never throw.

### phaseMaps.js

Adds centralized recruitment phase metadata:

- `UPCOMING`
- `SUBMISSION`
- `EVALUATION`
- `ANNOUNCEMENT`
- `CLOSED`

Exports:

- `PHASE_META`
- `PHASE_ORDER`
- `PHASE_TONE_CLASS`
- `getPhaseMeta(phase)`
- `getPhaseLabel(phase)`
- `getPhaseTone(phase)`
- `getPhaseStepStatus(currentPhase, targetPhase)`

Unknown phases return a safe neutral fallback. `lib/phase.js` was left intact for existing consumers.

## Components Added

### StatusBadge

Shared badge for application, document, user, email, audit, recommendation, and generic status display. It uses `getStatusMeta()` and supports label/tone overrides, optional icons, sizes, uppercase mode, and safe unknown status rendering.

### PhaseBadge

Shared badge for recruitment phases. It uses `getPhaseMeta()`, supports unknown phases, label/tone overrides, sizes, and uppercase mode.

### MetricCard

Reusable metric surface with optional icon, value, label, helper text, action slot, tone support, and a skeleton loading state. Numeric values use the heading font.

### ActionCard

Reusable shortcut/action card for later dashboard redesigns. It supports icon, title, description, optional `Link` action, optional button action, disabled state, tone styling, and children content.

### EmptyState

Helpful card-like empty state with optional icon, title, description, action link/button, and children. It avoids generic "No data" copy.

### LoadingState

Shared loading primitive with `page`, `card`, `table`, and `metrics` variants using existing Tailwind skeleton styling.

### StepTrack

Reusable step track supporting string steps or object steps with `key`/`id`, `label`, `description`, and optional icon. It supports horizontal and vertical rendering, active/completed/upcoming states, thick connectors, empty steps safely returning null, and configurable key/label getters.

### ConfirmActionDialog

Reusable confirmation dialog built on the existing shadcn `AlertDialog`. It supports controlled or internal open state, optional trigger children, async `onConfirm`, loading state, custom labels, and destructive styling.

## Compatibility Notes

Phase 3 did not migrate existing consumers such as:

- `ApplicationsTable`
- `RecruitmentJourney`
- `RecruitmentPhaseCard`
- `WorkspaceCards`
- admin period/email/audit local badges

Those pages still use their existing local logic until Phase 4-7 role/page redesign work. This keeps Phase 3 low-risk and avoids changing current workflow behavior.

## Behavior Changes

No business logic behavior changed.

The only runtime additions are new importable shared components and map files. No route definitions, guards, API calls, auth behavior, document upload/review/finalization flow, evaluation flow, announcement flow, or admin period behavior changed.

## Smoke Test Result

### Build

Command:

```bash
npm run build
```

Result: Passed.

Notes:

- Vite build completed successfully.
- Existing JS chunk-size warning remains.

### Global Lint

Command:

```bash
npm run lint
```

Result: Failed with existing baseline lint issues.

Summary:

- 40 problems total: 33 errors and 7 warnings.
- Failures match the known baseline categories from previous phases.
- No Phase 3 files appeared in the global lint error list.

### Targeted Phase 3 Lint

Command:

```bash
npx eslint "src/components/common/*.jsx" "src/lib/statusMaps.js" "src/lib/phaseMaps.js"
```

Result: Passed.

### Manual Route Check

Limited check:

- local dev server is running at `http://127.0.0.1:5173/`
- `GET /login` returned HTTP 200 with title `ScreenAI Lab`

Full role walkthrough was not performed because no role credentials were provided and the in-app Browser was unavailable in this session.

## Known Issues

- Global lint baseline still fails outside Phase 3.
- New shared components are not yet used broadly.
- Existing duplicated badge/status/phase logic remains until Phase 4-7 adoption.
- Mobile/table polish remains deferred to Phase 8.
- Auth, candidate, recruiter, and admin pages have not received full page-level redesign yet.

## Next Step Recommendation

Proceed to Phase 4: Auth Pages Redesign.
