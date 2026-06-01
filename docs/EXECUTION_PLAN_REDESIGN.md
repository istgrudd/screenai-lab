# EXECUTION_PLAN_REDESIGN.md

## 0. Purpose

Dokumen ini menjadi rencana eksekusi untuk implementasi redesign frontend ScreenAI Lab berdasarkan `docs/DESIGN.md`.

Redesign tidak dikerjakan langsung per role dari awal. Urutan yang tepat adalah **foundation-first, role-based later**:

```txt
Design Foundation → Shared Layout → Shared Components → Auth → Candidate → Recruiter → Super Admin → QA
```

Pendekatan ini dipilih karena sebagian besar perubahan visual bersifat shared: color tokens, typography, logo, AppShell, sidebar, topbar, page header, badge, metric card, empty state, loading state, step track, dan table treatment.

Jika langsung dibagi menjadi Candidate / Recruiter / Super Admin, komponen yang sama berisiko dibuat ulang berkali-kali dan hasil akhirnya tidak konsisten.

---

## 1. Global Implementation Rules

### 1.1 Source of Truth

Sebelum coding, selalu baca:

```txt
docs/DESIGN.md
frontend/package.json
frontend/src/index.css
frontend/src/App.jsx
frontend/src/components/navigation/RoleNavSidebar.jsx
frontend/src/pages/LoginPage.jsx
frontend/src/pages/RegisterPage.jsx
frontend/src/pages/candidate/DashboardPage.jsx
frontend/src/pages/recruiter/OverviewPage.jsx
frontend/src/pages/admin/OverviewPage.jsx
```

Untuk phase yang menyentuh page tertentu, baca juga page dan component pendukungnya.

### 1.2 Non-Negotiable Design Rules

Implementasi harus mengikuti aturan berikut:

- Gunakan brand MBC Laboratory, bukan palette ScholarFlow mentah.
- Gunakan Montserrat untuk heading/title/metric number.
- Gunakan Poppins untuk body/form/table/label.
- Gunakan logo MBC Lab asli sebagai brand anchor.
- Hindari default shadcn grayscale look.
- Gunakan tonal layering, bukan border tebal sebagai pembatas utama.
- Gunakan Boho Red hanya untuk destructive, rejected, urgent, atau action required.
- Candidate-facing copy sebaiknya Bahasa Indonesia.
- Setiap halaman harus punya status context dan next action yang jelas.
- Jangan mengubah business logic backend kecuali benar-benar dibutuhkan.
- Jangan menghapus guard, role protection, API call, atau validation existing tanpa alasan kuat.

### 1.3 Engineering Rules

- Pertahankan stack saat ini: React, Vite, Tailwind CSS, shadcn/ui, lucide-react, Recharts.
- Jangan melakukan rewrite total frontend.
- Refactor secara bertahap.
- Shared component dulu, page redesign belakangan.
- Pastikan `npm run lint` dan `npm run build` tetap lolos.
- Setiap phase wajib membuat report di `docs/reports/`.
- Setiap report harus mencatat files changed, behavior changed, smoke test, dan known issues.

### 1.4 Recommended Branch Strategy

Gunakan branch terpisah untuk redesign:

```bash
git checkout -b feature/frontend-redesign-foundation
```

Jika ingin lebih aman, pecah menjadi beberapa branch:

```txt
feature/redesign-phase-1-foundation
feature/redesign-phase-2-layout
feature/redesign-phase-3-components
feature/redesign-phase-4-auth
feature/redesign-phase-5-candidate
feature/redesign-phase-6-recruiter
feature/redesign-phase-7-admin
feature/redesign-phase-8-polish
```

---

## 2. Phase Overview

```txt
Phase 0  Audit & Preparation
Phase 1  Brand Foundation & Design Tokens
Phase 2  AppShell, Sidebar, Topbar, PageHeader
Phase 3  Shared UI Components
Phase 4  Auth Pages Redesign
Phase 5  Candidate Experience Redesign
Phase 6  Recruiter Workspace Redesign
Phase 7  Super Admin Control Center Redesign
Phase 8  Responsive, Accessibility, QA Polish
```

---

# Phase 0 — Audit & Preparation

## Goal

Memahami struktur frontend saat ini dan membuat migration map sebelum melakukan perubahan visual besar.

Phase ini tidak perlu mengubah UI secara signifikan. Fokusnya adalah audit, mapping, dan validasi rencana.

## Read First

```txt
docs/DESIGN.md
frontend/package.json
frontend/src/index.css
frontend/src/App.jsx
frontend/src/components/navigation/RoleNavSidebar.jsx
frontend/src/lib/auth.js
frontend/src/lib/api.js
frontend/src/lib/candidateApplication.js
frontend/src/lib/recruiterWorkspace.js
frontend/src/components/RecruitmentPhaseCard.jsx
frontend/src/components/RecruitmentJourney.jsx
frontend/src/components/recruiter/WorkspaceCards.jsx
frontend/src/components/recruiter/ApplicationsTable.jsx
```

## Tasks

1. Audit current frontend structure.
2. Identify shared components that will be replaced or wrapped.
3. Identify role-specific pages:
   - Candidate pages
   - Recruiter pages
   - Super Admin pages
   - Auth/public pages
4. Identify components with business logic that must not be broken.
5. List all status strings and phase strings used in UI.
6. List pages that still use generic loading, empty, and error states.
7. Create migration order confirmation.

## Deliverables

Create:

```txt
docs/reports/frontend_redesign_phase_0_audit.md
```

Report content:

```md
# Frontend Redesign Phase 0 Audit

## Summary
## Files Reviewed
## Current Frontend Architecture
## Shared Components to Refactor
## Role Pages Inventory
## Status and Phase Inventory
## Business Logic That Must Be Preserved
## Risks
## Final Migration Order
## Smoke Test Result
```

## Acceptance Criteria

- No major UI refactor is performed in this phase.
- Report exists and clearly maps the next phases.
- The team can identify which components are shared vs role-specific.
- No existing route is broken.

## Smoke Test

```bash
cd frontend
npm install
npm run lint
npm run build
```

Manual:

- Open login page.
- Login as candidate.
- Login as recruiter.
- Login as super admin.
- Navigate to each dashboard.

---

# Phase 1 — Brand Foundation & Design Tokens

## Goal

Mengganti visual foundation dari default grayscale/Geist menjadi MBC Laboratory brand system.

## Read First

```txt
docs/DESIGN.md
frontend/package.json
frontend/src/index.css
```

## Tasks

1. Install brand fonts:

```bash
cd frontend
npm install @fontsource-variable/montserrat @fontsource-variable/poppins
```

2. Update `frontend/src/index.css`:
   - Import Montserrat and Poppins.
   - Set `--font-heading` to Montserrat.
   - Set `--font-sans` to Poppins.
   - Replace default grayscale tokens with MBC tokens.
   - Add surface hierarchy tokens.
   - Add brand shadow variables.
   - Add brand gradient variables.
   - Add helper utility classes if needed.

3. Add brand assets directory:

```txt
frontend/src/assets/brand/
```

Expected assets:

```txt
mbc-logo-primary.png
mbc-logo-blue.png
mbc-logo-white.png
mbc-logo-mark.png
```

If assets are not available yet, create placeholders or document required filenames, but do not block the rest of implementation.

4. Create brand logo component:

```txt
frontend/src/components/brand/MbcLogo.jsx
```

Recommended props:

```txt
variant: "primary" | "blue" | "white" | "mark"
size: "sm" | "md" | "lg"
className
```

5. Keep backward compatibility with existing shadcn variables:
   - `background`
   - `foreground`
   - `card`
   - `primary`
   - `secondary`
   - `muted`
   - `accent`
   - `destructive`
   - `border`
   - `input`
   - `ring`
   - `sidebar-*`

## Suggested Files Changed

```txt
frontend/package.json
frontend/src/index.css
frontend/src/components/brand/MbcLogo.jsx
frontend/src/assets/brand/*
docs/reports/frontend_redesign_phase_1_foundation.md
```

## Acceptance Criteria

- App uses Montserrat/Poppins.
- Primary color is MBC Blue `#0065B0`.
- Deep navy is Atlanta `#1E3F75`.
- Destructive color is Boho Red `#E12A26`.
- Existing pages still render.
- No route breaks.
- No broken CSS variables.

## Smoke Test

```bash
cd frontend
npm run lint
npm run build
```

Manual:

- Login page renders.
- Sidebar renders.
- Candidate dashboard renders.
- Recruiter dashboard renders.
- Admin dashboard renders.
- Buttons, cards, inputs, and badges are still readable.

## Report

Create:

```txt
docs/reports/frontend_redesign_phase_1_foundation.md
```

Report content:

```md
# Frontend Redesign Phase 1 — Brand Foundation & Design Tokens

## Summary
## Files Changed
## Design Tokens Added/Updated
## Font Changes
## Logo Asset Notes
## Compatibility Notes
## Smoke Test
## Known Issues
```

---

# Phase 2 — Shared Layout System

## Goal

Mengganti layout shell sederhana menjadi branded application shell yang konsisten untuk semua role.

## Read First

```txt
docs/DESIGN.md
frontend/src/App.jsx
frontend/src/components/navigation/RoleNavSidebar.jsx
frontend/src/lib/auth.js
frontend/src/lib/api.js
```

## Tasks

1. Create layout directory:

```txt
frontend/src/components/layout/
```

2. Create:

```txt
AppShell.jsx
BrandSidebar.jsx
GlassTopbar.jsx
PageContainer.jsx
PageHeader.jsx
```

3. Migrate role navigation from `RoleNavSidebar.jsx` to `BrandSidebar.jsx`, or keep `RoleNavSidebar.jsx` as compatibility wrapper while moving visual implementation.

4. Update `AuthenticatedShell` in `App.jsx` to use `AppShell`.

5. `BrandSidebar` requirements:
   - Use MBC logo.
   - Show role-specific grouped nav.
   - Preserve active state behavior.
   - Preserve logout behavior.
   - Show user email and role.
   - Use MBC brand styling.

6. `GlassTopbar` requirements:
   - Shows current role.
   - Shows user context.
   - Optionally loads active recruitment period.
   - Gracefully handles no active period.
   - Does not block page if active period API fails.

7. `PageHeader` requirements:
   - Title.
   - Description.
   - Eyebrow/breadcrumb.
   - Optional primary action.
   - Optional status badge/chip.

## Suggested Files Changed

```txt
frontend/src/App.jsx
frontend/src/components/navigation/RoleNavSidebar.jsx
frontend/src/components/layout/AppShell.jsx
frontend/src/components/layout/BrandSidebar.jsx
frontend/src/components/layout/GlassTopbar.jsx
frontend/src/components/layout/PageContainer.jsx
frontend/src/components/layout/PageHeader.jsx
docs/reports/frontend_redesign_phase_2_layout.md
```

## Acceptance Criteria

- Candidate, recruiter, and super admin still see their correct navigation.
- Protected routes still work.
- Logout still works.
- Active nav state still works.
- Main content spacing is consistent.
- Topbar does not crash if period API fails.
- Mobile layout is not perfect yet, but not unusable.

## Smoke Test

```bash
cd frontend
npm run lint
npm run build
```

Manual:

- Login as candidate and navigate all candidate routes.
- Login as recruiter and navigate all recruiter routes.
- Login as super admin and navigate all admin routes.
- Check active nav state.
- Check logout.
- Check page scroll behavior.

## Report

Create:

```txt
docs/reports/frontend_redesign_phase_2_layout.md
```

---

# Phase 3 — Shared UI Components

## Goal

Membangun component primitives yang akan dipakai lintas role agar page redesign konsisten.

## Read First

```txt
docs/DESIGN.md
frontend/src/components/recruiter/WorkspaceCards.jsx
frontend/src/components/recruiter/ApplicationsTable.jsx
frontend/src/components/RecruitmentPhaseCard.jsx
frontend/src/components/RecruitmentJourney.jsx
frontend/src/lib/recruiterWorkspace.js
frontend/src/lib/phase.js
```

## Tasks

Create shared components:

```txt
frontend/src/components/common/StatusBadge.jsx
frontend/src/components/common/PhaseBadge.jsx
frontend/src/components/common/MetricCard.jsx
frontend/src/components/common/ActionCard.jsx
frontend/src/components/common/EmptyState.jsx
frontend/src/components/common/LoadingState.jsx
frontend/src/components/common/StepTrack.jsx
frontend/src/components/common/ConfirmActionDialog.jsx
```

Create shared maps:

```txt
frontend/src/lib/statusMaps.js
frontend/src/lib/phaseMaps.js
```

## Component Requirements

### StatusBadge

Must support:

```txt
draft
submitted
screening
verified
correction_requested
evaluated
announced_pass
announced_fail
rejected
closed
```

Unknown status must render safely.

### PhaseBadge

Must support:

```txt
UPCOMING
SUBMISSION
EVALUATION
ANNOUNCEMENT
CLOSED
```

Unknown phase must render safely.

### MetricCard

Props should support:

```txt
icon
label
value
helper
tone
loading
```

### EmptyState

Props should support:

```txt
icon
title
description
actionLabel
onAction
```

### LoadingState

Support layout variants:

```txt
card
table
page
metrics
```

### StepTrack

Support:

```txt
steps
currentStep
completedSteps
orientation
```

### ConfirmActionDialog

Use for destructive or irreversible actions.

## Suggested Files Changed

```txt
frontend/src/components/common/*
frontend/src/lib/statusMaps.js
frontend/src/lib/phaseMaps.js
docs/reports/frontend_redesign_phase_3_shared_components.md
```

## Acceptance Criteria

- Shared components compile and can be imported.
- No duplicate status color logic remains in newly touched components.
- Components handle unknown/null values gracefully.
- No existing pages are broken.
- Existing components may still be using old UI, but shared replacements are ready.

## Smoke Test

```bash
cd frontend
npm run lint
npm run build
```

Manual:

- Visit candidate dashboard.
- Visit recruiter applications.
- Visit admin dashboard.
- Confirm no import/runtime error.

## Report

Create:

```txt
docs/reports/frontend_redesign_phase_3_shared_components.md
```

---

# Phase 4 — Auth Pages Redesign

## Goal

Membuat first impression yang resmi, branded, dan terpercaya.

## Read First

```txt
docs/DESIGN.md
frontend/src/pages/LoginPage.jsx
frontend/src/pages/RegisterPage.jsx
frontend/src/pages/ForgotPasswordPage.jsx
frontend/src/pages/ResetPasswordPage.jsx
frontend/src/pages/VerifyEmailPage.jsx
frontend/src/lib/api.js
frontend/src/lib/auth.js
```

## Tasks

1. Create shared auth layout:

```txt
frontend/src/components/layout/AuthLayout.jsx
```

2. Redesign:
   - Login
   - Register
   - Forgot Password
   - Reset Password
   - Verify Email

3. Preserve existing logic:
   - Login API
   - Save token
   - Role redirect
   - Register validation
   - Resend verification
   - Forgot/reset password behavior
   - Password visibility toggle

4. Copywriting direction:
   - Candidate-facing UI in Bahasa Indonesia.
   - Use helpful error messages.
   - Avoid mixed language in the same block.

## Recommended Auth Layout

Desktop:

```txt
Left: Brand hero
  MBC Logo
  Main headline
  Short description
  Recruitment phase mini-card / division list

Right: Form card
  Title
  Description
  Form
  Secondary links
```

Mobile:

```txt
Logo
Form card
Helper links
```

## Suggested Files Changed

```txt
frontend/src/components/layout/AuthLayout.jsx
frontend/src/pages/LoginPage.jsx
frontend/src/pages/RegisterPage.jsx
frontend/src/pages/ForgotPasswordPage.jsx
frontend/src/pages/ResetPasswordPage.jsx
frontend/src/pages/VerifyEmailPage.jsx
docs/reports/frontend_redesign_phase_4_auth.md
```

## Acceptance Criteria

- Login still works.
- Register still works.
- Email verification messaging still works.
- Forgot/reset password still works.
- Password toggle still works.
- Auth pages use MBC logo and brand colors.
- No business logic regression.

## Smoke Test

```bash
cd frontend
npm run lint
npm run build
```

Manual:

- Login valid user.
- Login invalid password.
- Login unverified candidate and resend verification.
- Register candidate.
- Open forgot password page.
- Open reset password page.
- Open verify email page.

## Report

Create:

```txt
docs/reports/frontend_redesign_phase_4_auth.md
```

---

# Phase 5 — Candidate Experience Redesign

## Goal

Candidate harus langsung memahami status pendaftaran, next action, deadline, dan progress dokumen.

## Read First

```txt
docs/DESIGN.md
frontend/src/pages/candidate/DashboardPage.jsx
frontend/src/pages/candidate/ApplicationOverviewPage.jsx
frontend/src/pages/candidate/StartApplicationPage.jsx
frontend/src/pages/candidate/DocumentsPage.jsx
frontend/src/pages/candidate/ReviewPage.jsx
frontend/src/pages/candidate/ApplicationStatusPage.jsx
frontend/src/pages/candidate/ProfilePage.jsx
frontend/src/pages/candidate/EditProfilePage.jsx
frontend/src/components/RecruitmentJourney.jsx
frontend/src/components/RecruitmentPhaseCard.jsx
frontend/src/lib/candidateApplication.js
frontend/src/lib/api.js
```

## Tasks

Create candidate-specific components:

```txt
frontend/src/components/candidate/CandidateStatusHero.jsx
frontend/src/components/candidate/ApplicationProgressCard.jsx
frontend/src/components/candidate/DocumentRequirementCard.jsx
frontend/src/components/candidate/CandidateApplicationStepTrack.jsx
```

Redesign pages:

1. Candidate Dashboard
2. Application Overview
3. Start Application
4. Documents
5. Review
6. Application Status
7. Profile/Edit Profile visual alignment if needed

## Candidate Dashboard Structure

```txt
PageHeader
CandidateStatusHero
Recruitment StepTrack
ApplicationProgressCard
DocumentChecklist / DocumentRequirementCard list
AnnouncementCard, only when relevant
```

## Candidate Next Action Rules

Dashboard should produce one primary next action:

| Condition | Primary CTA |
| --- | --- |
| No application | Mulai Pendaftaran |
| Draft + missing documents | Lanjut Unggah Dokumen |
| Draft + complete documents | Tinjau & Kirim Pendaftaran |
| Submitted/screening/verified/evaluated | Lihat Status Pendaftaran |
| Correction requested | Perbaiki Dokumen |
| Announced pass/fail | Cek Pengumuman |

## Preserve Existing Logic

- Candidate profile guard.
- Required profile fields.
- Application start flow.
- Division selection.
- Document upload.
- Review and final submit.
- Submit disabled state.
- Status display.
- Correction requested flow.

## Suggested Files Changed

```txt
frontend/src/pages/candidate/*
frontend/src/components/candidate/*
frontend/src/components/RecruitmentJourney.jsx
frontend/src/components/RecruitmentPhaseCard.jsx
docs/reports/frontend_redesign_phase_5_candidate.md
```

## Acceptance Criteria

- Candidate without application sees clear start CTA.
- Candidate draft sees document progress.
- Candidate can upload/manage documents.
- Candidate can review and submit.
- Candidate submitted sees clear status.
- Candidate correction requested sees revision action.
- Candidate announced pass/fail sees result clearly.
- Required profile guard still works.
- No API behavior regression.

## Smoke Test

```bash
cd frontend
npm run lint
npm run build
```

Manual:

- Candidate first login with incomplete profile.
- Candidate with no application.
- Candidate starts application.
- Candidate uploads documents.
- Candidate reviews application.
- Candidate submits final application.
- Candidate views status.
- Candidate sees correction requested state if available.
- Candidate sees announcement state if available.

## Report

Create:

```txt
docs/reports/frontend_redesign_phase_5_candidate.md
```

---

# Phase 6 — Recruiter Workspace Redesign

## Goal

Recruiter dashboard dan workspace harus menjadi work queue yang membantu prioritas operasional, bukan hanya kumpulan shortcut.

## Read First

```txt
docs/DESIGN.md
frontend/src/pages/recruiter/OverviewPage.jsx
frontend/src/pages/recruiter/ApplicationsPage.jsx
frontend/src/pages/recruiter/DocumentVerificationPage.jsx
frontend/src/pages/recruiter/EvaluationPage.jsx
frontend/src/pages/recruiter/CandidatesPage.jsx
frontend/src/pages/recruiter/AnnouncementsPage.jsx
frontend/src/pages/recruiter/AnalyticsPage.jsx
frontend/src/components/recruiter/*
frontend/src/pages/CandidateDetailPage.jsx
frontend/src/lib/recruiterWorkspace.js
frontend/src/lib/api.js
```

## Tasks

Create recruiter-specific components:

```txt
frontend/src/components/recruiter/RecruiterCommandHero.jsx
frontend/src/components/recruiter/WorkQueueCard.jsx
frontend/src/components/recruiter/DivisionBreakdownCard.jsx
frontend/src/components/recruiter/CandidateReviewCard.jsx
frontend/src/components/recruiter/VerificationQueuePanel.jsx
frontend/src/components/recruiter/EvaluationActionPanel.jsx
```

Redesign pages:

1. Recruiter Dashboard
2. Applications
3. Document Verification
4. Evaluation
5. Candidates
6. Announcements
7. Analytics visual alignment

## Recruiter Dashboard Structure

```txt
PageHeader
RecruiterCommandHero
QueueMetrics
DivisionBreakdownCard
WorkQueueCard
Secondary workspace shortcuts
```

## Applications Page Improvements

- Search by name/email/NIM if data is already available client-side.
- Quick filter chips:
  - All
  - Submitted
  - Verified
  - Correction Requested
  - Evaluated
  - Recommended
- Division filter.
- Status filter.
- Sort by submitted date, score, completeness where feasible.
- Preserve existing table behavior.
- Add mobile card view if practical in this phase.

## Document Verification Page Improvements

Recommended layout:

```txt
Left: Candidate/document queue
Right: Document preview + verification panel
```

Requirements:

- Toggle or tab per document type.
- Clear status per document.
- Notes/rejection reason.
- Finalize verification action.
- Clear state when verification is not finalized.

## Evaluation Page Improvements

- Show evaluation readiness.
- Show current phase requirement.
- Show division selector.
- Show candidates ready for evaluation.
- Show threshold N context.
- Show last evaluation timestamp if available.
- Add clear confirmation for re-run/destructive actions.

## Announcements Page Improvements

- Pre-publish checklist.
- Pass/fail counts per division.
- Publish confirmation.
- Candidate-facing preview if possible.
- Disable/clarify publish if evaluation incomplete.

## Preserve Existing Logic

- Application listing.
- Existing filters.
- Candidate detail navigation.
- Document verification APIs.
- Evaluation APIs.
- Announcement publish flow.
- Recruiter + super admin shared access.

## Suggested Files Changed

```txt
frontend/src/pages/recruiter/*
frontend/src/components/recruiter/*
frontend/src/pages/CandidateDetailPage.jsx
docs/reports/frontend_redesign_phase_6_recruiter.md
```

## Acceptance Criteria

- Recruiter dashboard shows operational priorities.
- Applications list still works.
- Filters still work.
- Candidate detail still opens.
- Document verification still works.
- Evaluation still works.
- Announcement flow still works.
- Super admin can still access shared recruiter pages.

## Smoke Test

```bash
cd frontend
npm run lint
npm run build
```

Manual:

- Recruiter dashboard.
- Applications filters.
- Open candidate detail.
- Document verification page.
- Verify/finalize document flow.
- Evaluation page.
- Run evaluation if test data allows.
- Announcements page.
- Publish flow if test data allows.

## Report

Create:

```txt
docs/reports/frontend_redesign_phase_6_recruiter.md
```

---

# Phase 7 — Super Admin Control Center Redesign

## Goal

Super admin experience harus terasa seperti control center yang membantu monitoring, konfigurasi, dan pencegahan human error.

## Read First

```txt
docs/DESIGN.md
frontend/src/pages/admin/OverviewPage.jsx
frontend/src/pages/admin/AdminPage.jsx
frontend/src/pages/admin/RecruitmentPeriodPage.jsx
frontend/src/pages/admin/AuditLogsPage.jsx
frontend/src/pages/admin/EmailTemplatesPage.jsx
frontend/src/pages/admin/SettingsPage.jsx
frontend/src/components/admin/*
frontend/src/lib/api.js
```

## Tasks

Create admin-specific components:

```txt
frontend/src/components/admin/AdminControlHero.jsx
frontend/src/components/admin/RiskAlertCard.jsx
frontend/src/components/admin/PeriodSafetyPanel.jsx
frontend/src/components/admin/AdminMetricGrid.jsx
```

Redesign pages:

1. Admin Dashboard
2. Users
3. Recruitment Periods
4. Audit Logs
5. Email Templates
6. Settings
7. Shared recruiter pages visual consistency for super admin

## Admin Dashboard Structure

```txt
PageHeader
AdminControlHero
SystemMetrics
PeriodControlPanel
RiskAlerts
Admin Workspace Cards
```

## Recruitment Period Safety Rules

UI should make these risks visible:

- Active period already exists.
- Creating new period while another is active.
- Stopping active period.
- Overlapping phase dates.
- Missing threshold N.
- Evaluation phase active while documents are not finalized.
- Announcement phase active while evaluation incomplete.

If backend already prevents an action, UI should still explain why the action is blocked.

## Users Page Improvements

- Search/filter by role/status.
- Role badge.
- Account status badge.
- Safer action menu.
- Confirmation for dangerous changes.
- Assisted password reset clearly labeled.

## Audit Logs Improvements

- Timeline-style or cleaner table.
- Filter by actor/action/date/entity if available.
- Highlight destructive/sensitive actions.
- Avoid raw JSON-first display unless expanded.

## Preserve Existing Logic

- User management APIs.
- Period create/update/close APIs.
- Audit log loading.
- Email template/log behavior.
- Settings behavior.
- Super admin route protection.

## Suggested Files Changed

```txt
frontend/src/pages/admin/*
frontend/src/components/admin/*
docs/reports/frontend_redesign_phase_7_admin.md
```

## Acceptance Criteria

- Admin dashboard shows active period status clearly.
- Period management is safer and clearer.
- Active period conflict is clearly communicated.
- User management still works.
- Audit logs still load.
- Email pages still load.
- Settings page still loads.
- No super admin route regression.

## Smoke Test

```bash
cd frontend
npm run lint
npm run build
```

Manual:

- Admin dashboard.
- Users page.
- Create/update user if test data allows.
- Recruitment period page.
- Create/update/close period if test data allows.
- Audit logs page.
- Email templates/logs page.
- Settings page.
- Shared recruiter pages as super admin.

## Report

Create:

```txt
docs/reports/frontend_redesign_phase_7_admin.md
```

---

# Phase 8 — Responsive, Accessibility, QA Polish

## Goal

Menyelesaikan polish lintas role: responsive behavior, accessibility, copywriting consistency, and UI QA.

## Read First

```txt
docs/DESIGN.md
all files changed in phases 1-7
```

## Tasks

1. Responsive QA:
   - Auth pages.
   - Sidebar drawer/mobile behavior.
   - Candidate pages.
   - Recruiter tables.
   - Admin tables.
   - Dialogs and forms.

2. Accessibility QA:
   - Focus states.
   - `aria-label` for icon buttons.
   - Form labels and errors.
   - Keyboard navigation.
   - Color contrast.
   - Status does not rely on color alone.

3. Copywriting QA:
   - Candidate pages use Bahasa Indonesia consistently.
   - Recruiter/admin technical wording is consistent.
   - Empty states are helpful.
   - Error states are helpful.

4. Table UX:
   - Important tables readable on desktop.
   - Mobile card fallback where practical.
   - Search/filter controls are clear.
   - Loading/empty/error states consistent.

5. Visual consistency:
   - Cards follow new design system.
   - Badges use shared components.
   - Metrics use shared components.
   - Page headers are consistent.
   - No remaining generic brand icons where MBC logo should appear.

## Suggested Files Changed

```txt
frontend/src/**/*.jsx
frontend/src/index.css
docs/reports/frontend_redesign_phase_8_qa_polish.md
```

## Acceptance Criteria

- `npm run lint` passes.
- `npm run build` passes.
- All major routes are usable on desktop.
- All major candidate routes are usable on mobile.
- Recruiter/admin data-heavy pages do not break on mobile.
- Destructive actions require confirmation.
- No obvious default shadcn-looking major page remains.
- UI feels like MBC Laboratory Recruitment Portal.

## Smoke Test

```bash
cd frontend
npm run lint
npm run build
```

Manual full walkthrough:

Candidate:

- Login.
- Profile guard.
- Dashboard.
- Start application.
- Documents.
- Review.
- Status.
- Profile.

Recruiter:

- Dashboard.
- Applications.
- Candidate detail.
- Documents.
- Evaluation.
- Candidates.
- Announcements.
- Analytics.
- Profile.

Super Admin:

- Dashboard.
- Users.
- Periods.
- Applications.
- Evaluation.
- Documents.
- Announcements.
- Audit logs.
- Emails.
- Settings.
- Profile.

## Report

Create:

```txt
docs/reports/frontend_redesign_phase_8_qa_polish.md
```

---

## 3. Batch Recommendation

Jika ingin implementasi lebih aman, gabungkan phase menjadi batch seperti berikut:

### Batch 1 — Redesign Foundation

Includes:

```txt
Phase 0
Phase 1
Phase 2
Phase 3
```

Goal:

Shared foundation selesai sebelum page role-specific disentuh.

### Batch 2 — Public/Auth + Candidate

Includes:

```txt
Phase 4
Phase 5
```

Goal:

Candidate-facing experience selesai dan first impression portal sudah branded.

### Batch 3 — Recruiter

Includes:

```txt
Phase 6
```

Goal:

Recruiter workspace menjadi operational work queue.

### Batch 4 — Super Admin

Includes:

```txt
Phase 7
```

Goal:

Super admin experience menjadi control center yang aman.

### Batch 5 — QA Polish

Includes:

```txt
Phase 8
```

Goal:

Responsive, accessibility, copywriting, dan visual consistency selesai.

---

## 4. Recommended First Implementation Prompt

Gunakan prompt berikut untuk mulai dari Batch 1 / Phase 0.

```txt
Saya ingin memulai implementasi frontend redesign berdasarkan docs/DESIGN.md dan docs/EXECUTION_PLAN_REDESIGN.md.

Mulai dari Phase 0 saja: Audit & Preparation.

Instruksi:
1. Baca docs/DESIGN.md.
2. Baca docs/EXECUTION_PLAN_REDESIGN.md.
3. Audit frontend structure tanpa melakukan redesign besar.
4. Review file berikut:
   - frontend/package.json
   - frontend/src/index.css
   - frontend/src/App.jsx
   - frontend/src/components/navigation/RoleNavSidebar.jsx
   - frontend/src/lib/auth.js
   - frontend/src/lib/api.js
   - frontend/src/lib/candidateApplication.js
   - frontend/src/lib/recruiterWorkspace.js
   - frontend/src/components/RecruitmentPhaseCard.jsx
   - frontend/src/components/RecruitmentJourney.jsx
   - frontend/src/components/recruiter/WorkspaceCards.jsx
   - frontend/src/components/recruiter/ApplicationsTable.jsx
5. Buat report docs/reports/frontend_redesign_phase_0_audit.md.
6. Jangan ubah business logic.
7. Jangan redesign page dulu.
8. Jalankan npm run lint dan npm run build jika memungkinkan.
9. Report harus mencakup:
   - summary
   - files reviewed
   - current frontend architecture
   - shared components to refactor
   - role pages inventory
   - status and phase inventory
   - business logic that must be preserved
   - risks
   - final migration order
   - smoke test result
```

---

## 5. Definition of Done for Full Redesign

Full redesign dianggap selesai jika:

- `docs/DESIGN.md` sudah menjadi acuan visual utama.
- `docs/EXECUTION_PLAN_REDESIGN.md` diikuti per phase.
- Semua phase report tersedia di `docs/reports/`.
- Frontend memakai MBC colors dan Montserrat/Poppins.
- AppShell, BrandSidebar, GlassTopbar, dan PageHeader digunakan konsisten.
- Auth pages sudah branded.
- Candidate flow jelas dan action-oriented.
- Recruiter dashboard menjadi work queue.
- Admin dashboard menjadi control center.
- Data-heavy pages lebih readable dan filterable.
- Empty/loading/error states sudah helpful.
- Destructive actions punya confirmation.
- `npm run lint` pass.
- `npm run build` pass.
- Manual smoke test semua role pass.
- UI terasa seperti MBC Laboratory Recruitment Portal, bukan generic SaaS dashboard.
