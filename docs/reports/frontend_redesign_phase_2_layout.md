# Frontend Redesign Phase 2 - Shared Layout System

Date: 2026-06-02

## Summary

Phase 2 added the protected-area shared layout system for ScreenAI Lab. Protected pages now render through a branded `AppShell` with a new `BrandSidebar`, `GlassTopbar`, and consistent `PageContainer`. A reusable `PageHeader` component is available for later page-level redesign phases, but existing candidate/recruiter/admin pages were not broadly refactored in this phase.

The implementation is intentionally layout-only. Route definitions, protected route logic, candidate profile guard logic, legacy redirects, auth storage, API endpoint functions, candidate/recruiter/admin business flows, and page internals were preserved.

## Files Changed

Phase 2 files created or changed:

- `frontend/src/App.jsx`
- `frontend/src/components/layout/AppShell.jsx`
- `frontend/src/components/layout/BrandSidebar.jsx`
- `frontend/src/components/layout/GlassTopbar.jsx`
- `frontend/src/components/layout/PageContainer.jsx`
- `frontend/src/components/layout/PageHeader.jsx`
- `docs/reports/frontend_redesign_phase_2_layout.md`

Existing Phase 1 files remain present in the working tree:

- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/src/index.css`
- `frontend/src/assets/brand/.gitkeep`
- `frontend/src/components/brand/MbcLogo.jsx`
- `docs/reports/frontend_redesign_phase_1_foundation.md`

## Components Added

### AppShell

`AppShell` is the new protected-page wrapper. It renders:

- `BrandSidebar`
- main content area
- `GlassTopbar`
- `PageContainer`
- `children`

Desktop layout uses a fixed sidebar width of `17rem` and offsets the main area with `lg:pl-[17rem]`. The shell keeps `min-h-screen`, uses the MBC background token, and preserves the existing max content width through `PageContainer`.

### BrandSidebar

`BrandSidebar` is the new role-aware navigation surface. It uses `MbcLogo` instead of the old generic chart icon as the brand anchor. It preserves `getCurrentUser()`, `ROLES`, and `logout()` behavior from `auth.js`.

Desktop uses a navy MBC-branded sidebar. Mobile uses a compact top navigation strip so protected pages remain usable without a full drawer implementation.

### GlassTopbar

`GlassTopbar` shows lightweight protected-page context:

- current role label
- current user email
- active recruitment period name, when available
- current phase label, when available

It loads `getActivePeriod()` defensively only when a user exists, never polls, never toasts on failure, and falls back to `Tidak ada periode aktif` if the request fails or no active period is available.

### PageContainer

`PageContainer` centralizes protected-page padding and width:

- responsive horizontal padding
- `max-w-7xl`
- consistent vertical spacing

It does not alter page children.

### PageHeader

`PageHeader` is a reusable header primitive for later phases. It supports:

- `eyebrow`
- `title`
- `description`
- `action`
- `children`
- `status`
- `className`

It is safe with title-only usage and uses the heading font for titles.

## App.jsx Integration

`AuthenticatedShell` now renders:

```jsx
return <AppShell>{children}</AppShell>;
```

The surrounding app logic was preserved:

- `ProtectedShell` still wraps `ProtectedRoute`
- `CandidateShell` still wraps `CandidateProfileGuard`
- `CandidateProfileGuard` still checks profile fields and redirects to `/profile/edit`
- `RootRedirect` behavior is unchanged
- `LegacyReviewRedirect` behavior is unchanged
- route definitions were not changed
- role arrays were not changed

## Navigation Compatibility

Role groups were ported from the old sidebar into `BrandSidebar`.

Candidate navigation:

- `/dashboard`
- `/application`
- `/documents`
- `/application/status`
- `/profile`

Recruiter navigation:

- `/recruiter/dashboard`
- `/recruiter/applications`
- `/recruiter/evaluation`
- `/recruiter/candidates`
- `/recruiter/documents`
- `/recruiter/announcements`
- `/recruiter/analytics`
- `/rubrics`
- `/recruiter/profile`

Super Admin navigation:

- `/admin/dashboard`
- shared recruiter routes
- `/admin/users`
- `/admin/periods`
- `/admin/audit-logs`
- `/admin/email-templates`
- `/admin/settings`
- `/rubrics`
- `/admin/profile`

Active state compatibility was preserved:

- `/application` active for `/application`, `/application/start`, `/application/review`, `/review`
- `/application/status` active for `/application/status`, `/submitted`, `/result`
- `/profile` active for `/profile` and `/profile/edit`
- `/recruiter/candidates` active for `/recruiter/candidates` and `/candidates/:id`
- `/recruiter/profile` active for recruiter profile/edit routes
- `/admin/profile` active for admin profile/edit routes

Super admin shared recruiter routes remain represented in the admin navigation. Logout still calls `logout()` from `auth.js`.

## Topbar Behavior

The topbar reads the current user from `getCurrentUser()` and displays a compact role/email context.

Active period behavior:

- calls `getActivePeriod()` only after a user is available
- shows period name and `current_phase` label on success
- uses `PHASE_LABEL` with a safe unknown-phase fallback
- shows `Tidak ada periode aktif` on failure/no active period
- does not toast errors
- does not poll
- does not block page render

## Responsive Notes

Desktop layout now uses a fixed MBC-branded sidebar and a sticky glass topbar.

Mobile behavior is intentionally minimal for Phase 2:

- the desktop sidebar is hidden
- a compact horizontal mobile nav appears above content
- the topbar remains available for user/period context

A full mobile drawer, deeper mobile navigation ergonomics, and table/card responsive polish should be handled in Phase 8.

## Behavior Changes

Expected behavior change is visual/layout only:

- protected pages now sit inside `AppShell`
- protected navigation uses the new branded sidebar
- protected pages have a shared topbar and container padding

No business logic, auth behavior, route guard behavior, API endpoint functions, candidate profile guard behavior, evaluation flow, announcement flow, document upload flow, or admin period behavior was changed.

## Smoke Test Result

### Build

Command:

```bash
npm run build
```

Result: Passed.

Notes:

- Vite build completed successfully.
- Existing chunk-size warning remains for a JS chunk larger than 500 kB.

### Lint

Command:

```bash
npm run lint
```

Result: Failed with the existing baseline lint issues.

Summary:

- 40 problems total: 33 errors and 7 warnings.
- The failures are the known baseline categories from Phase 0/1.
- No Phase 2 layout files appeared in the full lint error list.

Additional targeted check:

```bash
npx eslint "src/components/layout/*.jsx"
```

Result: Passed.

### Manual Route Check

Limited check performed:

- local dev server was running at `http://127.0.0.1:5173/`
- `GET /login` returned HTTP 200 and the `ScreenAI Lab` app shell HTML

Full browser walkthrough was not performed because the in-app Browser was unavailable in this session and no role credentials were provided.

## Known Issues

- Baseline lint still fails outside Phase 2.
- Existing JS chunk-size warning remains.
- Mobile navigation is usable but not final; full drawer/polish is deferred to Phase 8.
- `PageHeader` exists but has not been applied broadly to pages yet.
- Shared UI components such as `StatusBadge`, `MetricCard`, `StepTrack`, `EmptyState`, and `LoadingState` are still deferred to Phase 3.
- Auth, candidate, recruiter, and admin pages have not received full page-level redesign yet.
- `RoleNavSidebar.jsx` remains in the tree as legacy code but is no longer used by `AuthenticatedShell`.

## Next Step Recommendation

Proceed to Phase 3: Shared UI Components.
