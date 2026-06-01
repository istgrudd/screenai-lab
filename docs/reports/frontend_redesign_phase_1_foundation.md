# Frontend Redesign Phase 1 - Brand Foundation & Design Tokens

Date: 2026-06-02

## Scope Completed

- Replaced the global frontend design foundation with MBC brand tokens in `frontend/src/index.css`.
- Added Montserrat for heading/display usage and Poppins for body/form/table usage.
- Preserved shadcn/Tailwind CSS variable compatibility for existing components.
- Updated primary, secondary, accent, destructive, chart, sidebar, surface, radius, ring, border, and input tokens.
- Added safe brand utility classes:
  - `.font-heading`
  - `.brand-gradient`
  - `.brand-surface`
  - `.brand-card`
  - `.glass-surface`
  - `.ambient-shadow`
  - `.navy-shadow`
- Added `frontend/src/assets/brand/` with a `.gitkeep` placeholder.
- Added `frontend/src/components/brand/MbcLogo.jsx` as a safe logo component that:
  - Uses real logo files automatically if added later under `src/assets/brand/`.
  - Falls back to a CSS-rendered MBC mark and text.
  - Does not import missing files directly, so builds do not fail when logo assets are absent.

## Brand Tokens Applied

- MBC Blue: `#0065B0`
- Atlanta Navy: `#1E3F75`
- Boho Red: `#E12A26`
- Flat Black: `#0D0D0D`
- Funky Gray: `#777777` direction retained through neutral muted usage
- White: `#FFFFFF`
- App background: `#F7FAFC`
- Radius base: `0.875rem`

## Dependency Notes

Installed:

- `@fontsource-variable/montserrat`
- `@fontsource/poppins`

The requested package `@fontsource-variable/poppins` is not available in the npm registry. `npm view @fontsource-variable/poppins version` returned `E404`, so `@fontsource/poppins` was used as the closest official Fontsource package for Poppins.

`@fontsource-variable/geist` was left in `package.json` to avoid unrelated dependency cleanup in this phase.

## Files Changed

- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/src/index.css`
- `frontend/src/assets/brand/.gitkeep`
- `frontend/src/components/brand/MbcLogo.jsx`

## Out of Scope Confirmed

No changes were made to:

- Login/Register layout or behavior
- `RoleNavSidebar`
- `App.jsx` routing or guards
- API/auth/business logic
- NIM validation mismatch
- responsive/table redesign
- broad baseline lint cleanup

The requested files were reviewed before editing:

- `frontend/src/App.jsx`
- `frontend/src/components/navigation/RoleNavSidebar.jsx`
- `frontend/src/pages/LoginPage.jsx`
- `frontend/src/pages/RegisterPage.jsx`

## Verification

### Build

Command:

```bash
npm run build
```

Result: Passed.

Notes:

- Vite completed successfully.
- Existing bundle-size warning remains: one JS chunk is larger than 500 kB after minification.
- Build output includes Montserrat and Poppins font assets.

### Lint

Command:

```bash
npm run lint
```

Result: Failed with the existing baseline lint issues.

Summary:

- 40 problems total: 33 errors and 7 warnings.
- No lint errors were reported for the new Phase 1 files.
- The failure matches the known Phase 0 baseline categories, including `react-hooks/set-state-in-effect`, `react-refresh/only-export-components`, `no-unused-vars`, and `vite.config.js` `__dirname` usage.

### Local Preview

Dev server:

```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

Result: Running at `http://127.0.0.1:5173/`.

The in-app Browser verification was attempted, but the Browser plugin was unavailable in this session, so no automated visual screenshot was captured.

## Next Recommended Step

Proceed to the next redesign phase after deciding whether baseline lint cleanup should remain deferred or be handled as a separate stabilization pass.
