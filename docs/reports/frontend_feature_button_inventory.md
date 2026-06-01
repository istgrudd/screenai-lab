# Frontend Feature and Button Inventory

## Metadata
- Date: 2026-06-01
- Branch: main
- Purpose: Mendokumentasikan fitur, halaman, route, tombol, state, dan dampak API frontend sebelum Phase 12 final regression.
- Scope: Frontend React/Vite, role-based navigation, helper API, dokumen planning/report terkait Phase 1 sampai Phase 11, dan halaman publik/auth, candidate, recruiter, serta super admin.
- Validation: Static source review selesai. `cd frontend && npm run build` berhasil pada 2026-06-01. Vite memberi warning chunk besar > 500 kB setelah minification.

## Summary

Frontend sudah dipisah menjadi empat area besar:

- Public/Auth untuk login, register, email verification, forgot password, dan reset password.
- Candidate untuk dashboard, profil, application overview, start application, document upload, review/submit, dan status/result.
- Recruiter untuk dashboard, applications, document verification, evaluation, candidates, announcements, analytics, rubrics, candidate detail, dan profil.
- Super Admin untuk admin dashboard, user management, periods, audit logs, email notification monitoring, settings placeholder, profil, plus akses ke workspace recruiter yang dibagikan.

Route protection utama ada di `frontend/src/App.jsx` melalui `ProtectedShell`, `CandidateShell`, dan `ProtectedRoute`. Candidate route memakai `CandidateProfileGuard` kecuali `/profile/edit`, sehingga candidate yang belum melengkapi profil akan diarahkan ke edit profile sebelum mengakses workflow aplikasi.

Catatan penting untuk manual testing:

- Super admin memiliki route admin-only dan juga bisa membuka route recruiter-plus.
- Beberapa route candidate lama masih ada tetapi tidak muncul di sidebar: `/review`, `/submitted`, `/result`, `/my-applications`, dan `/upload`.
- Sidebar dan mayoritas copy UI memakai English, tetapi beberapa state/flow penting memakai Bahasa Indonesia. Ini tidak diperbaiki di dokumen ini, hanya dicatat sebagai finding.
- Beberapa action sensitif memakai confirm dialog, tetapi ada juga action sensitif yang langsung berjalan setelah klik/select, seperti role change dan deactivate/reactivate user.

## Source Files Reviewed

Dokumen planning/report:

- `docs/features/OVERVIEW.md`
- `docs/features/EXECUTION_PLAN.md`
- `docs/features/FRONTEND_IMPLEMENTATION_PLAN.md`
- `docs/features/BACKEND_IMPLEMENTATION_PLAN.md`
- `docs/reports/phase_1_candidate_frontend_features.md`
- `docs/reports/phase_2_recruiter_admin_frontend_features.md`
- `docs/reports/phase_5_auth_email_frontend_features.md`
- `docs/reports/phase_6_7_document_review_correction_features.md`
- `docs/reports/phase_7_5_workflow_hardening_features.md`
- `docs/reports/phase_8_ner_evaluation_flow_adjustment.md`
- `docs/reports/phase_9_analytics_api_dashboard.md`
- `docs/reports/phase_10_audit_log_listing_admin_page.md`
- `docs/reports/phase_11_email_notification_lifecycle.md`
- `docs/reports/admin_password_reset_link_adjustment.md`

Frontend shell, routing, auth, dan API:

- `frontend/src/App.jsx`
- `frontend/src/main.jsx`
- `frontend/src/lib/auth.js`
- `frontend/src/lib/api.js`
- `frontend/src/lib/candidateApplication.js`
- `frontend/src/lib/recruiterWorkspace.js`
- `frontend/src/lib/phase.js`
- `frontend/src/components/ProtectedRoute.jsx`
- `frontend/src/components/navigation/RoleNavSidebar.jsx`

Public/auth pages:

- `frontend/src/pages/LoginPage.jsx`
- `frontend/src/pages/RegisterPage.jsx`
- `frontend/src/pages/ForgotPasswordPage.jsx`
- `frontend/src/pages/ResetPasswordPage.jsx`
- `frontend/src/pages/VerifyEmailPage.jsx`

Candidate pages/components:

- `frontend/src/pages/candidate/DashboardPage.jsx`
- `frontend/src/pages/candidate/ProfilePage.jsx`
- `frontend/src/pages/candidate/EditProfilePage.jsx`
- `frontend/src/pages/candidate/ApplicationOverviewPage.jsx`
- `frontend/src/pages/candidate/StartApplicationPage.jsx`
- `frontend/src/pages/candidate/DocumentsPage.jsx`
- `frontend/src/pages/candidate/ReviewPage.jsx`
- `frontend/src/pages/candidate/ApplicationStatusPage.jsx`
- `frontend/src/pages/candidate/ResultPage.jsx`
- `frontend/src/pages/candidate/SubmittedPage.jsx`
- `frontend/src/pages/MyApplicationsPage.jsx`
- `frontend/src/pages/UploadPage.jsx`
- `frontend/src/components/candidate/CandidateProfileForm.jsx`
- `frontend/src/components/candidate/DivisionSelection.jsx`
- `frontend/src/components/DocumentUploadStep.jsx`
- `frontend/src/components/RecruitmentJourney.jsx`
- `frontend/src/components/RecruitmentPhaseCard.jsx`

Recruiter pages/components:

- `frontend/src/pages/recruiter/OverviewPage.jsx`
- `frontend/src/pages/recruiter/ApplicationsPage.jsx`
- `frontend/src/pages/recruiter/EvaluationPage.jsx`
- `frontend/src/pages/recruiter/CandidatesPage.jsx`
- `frontend/src/pages/recruiter/DocumentVerificationPage.jsx`
- `frontend/src/pages/recruiter/AnnouncementsPage.jsx`
- `frontend/src/pages/recruiter/AnalyticsPage.jsx`
- `frontend/src/pages/recruiter/ProfilePage.jsx`
- `frontend/src/pages/recruiter/EditProfilePage.jsx`
- `frontend/src/pages/CandidateDetailPage.jsx`
- `frontend/src/pages/RubricConfigPage.jsx`
- `frontend/src/components/recruiter/ApplicationFilters.jsx`
- `frontend/src/components/recruiter/ApplicationsTable.jsx`
- `frontend/src/components/recruiter/WorkspaceCards.jsx`
- `frontend/src/components/JustificationCard.jsx`
- `frontend/src/components/OverrideDialog.jsx`
- `frontend/src/components/SwotHighlightPanel.jsx`
- `frontend/src/components/DocumentPreviewDialog.jsx`
- `frontend/src/components/StaffProfileForm.jsx`
- `frontend/src/components/StaffProfileSummary.jsx`

Super admin pages/components:

- `frontend/src/pages/admin/OverviewPage.jsx`
- `frontend/src/pages/admin/AdminPage.jsx`
- `frontend/src/pages/admin/RecruitmentPeriodPage.jsx`
- `frontend/src/pages/admin/AuditLogsPage.jsx`
- `frontend/src/pages/admin/EmailTemplatesPage.jsx`
- `frontend/src/pages/admin/SettingsPage.jsx`
- `frontend/src/pages/admin/ProfilePage.jsx`
- `frontend/src/pages/admin/EditProfilePage.jsx`
- `frontend/src/components/admin/AdminPlaceholderPage.jsx`

Shared UI reviewed at usage level:

- `frontend/src/components/ui/button.jsx`
- `frontend/src/components/ui/badge.jsx`
- `frontend/src/components/ui/card.jsx`
- `frontend/src/components/ui/dialog.jsx`
- `frontend/src/components/ui/alert-dialog.jsx`
- `frontend/src/components/ui/select.jsx`
- `frontend/src/components/ui/table.jsx`
- `frontend/src/components/ui/input.jsx`
- `frontend/src/components/ui/textarea.jsx`
- `frontend/src/components/ui/checkbox.jsx`
- `frontend/src/components/ui/progress.jsx`
- `frontend/src/components/ui/tooltip.jsx`
- `frontend/src/components/ui/sonner.jsx`

## Role-Based Route Map

### Public/Auth Routes

| Route | Page | Purpose | Main Actions |
|---|---|---|---|
| `/login` | `LoginPage` | Masuk ke portal berdasarkan role JWT. | Sign in, show/hide password, forgot password link, register link, resend verification jika email belum verified. |
| `/register` | `RegisterPage` | Membuat akun candidate baru. | Create account, resend verification, back to login/sign in. |
| `/verify-email` | `VerifyEmailPage` | Memproses kode verifikasi email dari query `code`. | Auto verify, resend verification, back to login, bantuan akun. |
| `/forgot-password` | `ForgotPasswordPage` | Meminta link reset password via email. | Kirim Link Reset, kembali ke Login. |
| `/reset-password` | `ResetPasswordPage` | Membuat password baru dari reset code. | Reset Password, kembali ke Login, minta link baru. |
| `/` | `RootRedirect` in `AuthenticatedShell` | Redirect user ke landing path sesuai role, atau `/login` jika belum auth. | Redirect otomatis. |
| `*` | Navigate to `/` | Fallback untuk route tidak dikenal. | Redirect otomatis. |

### Candidate Routes

| Route | Page | Purpose | Main Actions |
|---|---|---|---|
| `/dashboard` | `candidate/DashboardPage` | Ringkasan periode aktif, progress aplikasi, checklist dokumen, dan announcement. | Start application, manage documents, review/submit, fix documents, view submission. |
| `/profile` | `candidate/ProfilePage` | Ringkasan profil candidate dan aplikasi saat ini. | Edit Profile, Open Application Overview. |
| `/profile/edit` | `candidate/EditProfilePage` | Edit data akun, kontak, akademik, dan password. | Back to Profile, Simpan Perubahan. |
| `/application` | `candidate/ApplicationOverviewPage` | Melihat aplikasi saat ini dan next action. | Start application, Continue documents, Review and submit, View application status. |
| `/application/start` | `candidate/StartApplicationPage` | Memilih divisi dan membuat draft aplikasi. | Select division, Start application, Application overview, Continue documents, View application status. |
| `/documents` | `candidate/DocumentsPage` | Upload enam dokumen wajib, replace dokumen rejected saat correction. | Upload/drop file, Replace, Back, Next Step, Review and Submit, View Status. |
| `/application/review` | `candidate/ReviewPage` | Review profil dan dokumen sebelum final submit. | Edit Profile, Back to documents, checkbox acknowledgement, Submit final application. |
| `/application/status` | `candidate/ApplicationStatusPage` | Status aplikasi, reference ID, journey, correction, dan hasil akhir. | Copy reference, Fix Documents, Back to dashboard, Start application jika belum ada. |
| `/review` | `LegacyReviewRedirect` | Redirect legacy ke review atau status tergantung status aplikasi. | Redirect otomatis setelah `getMyApplication`. |
| `/submitted` | Navigate to `/application/status` | Compatibility route lama. | Redirect otomatis. |
| `/result` | Navigate to `/application/status` | Compatibility route lama. | Redirect otomatis. |
| `/my-applications` | `MyApplicationsPage` | Legacy list aplikasi/CV dan skor lama. Tidak ada di sidebar. | View table only. |
| `/upload` | `UploadPage` | Legacy upload CV/certificate berbasis rubric. Tidak ada di sidebar. | Select rubric, upload CV, optional certificate, skip certificate, remove file, Upload and Process. |

Allowed role: `candidate`. Semua route candidate memakai `CandidateShell` kecuali `/profile/edit`, tetapi tetap protected candidate-only.

### Recruiter Routes

| Route | Page | Purpose | Main Actions |
|---|---|---|---|
| `/recruiter/dashboard` | `recruiter/OverviewPage` | Overview recruiter, phase card, metrics, dan shortcut workspace. | Open workspace shortcut. |
| `/recruiter/applications` | `recruiter/ApplicationsPage` | List submitted/non-draft applications dengan filter. | Filter division/status, reset filters, open candidate detail jika evaluation tersedia. |
| `/recruiter/evaluation` | `recruiter/EvaluationPage` | Menjalankan evaluasi AI per divisi. | Select division, Run Evaluation, Re-evaluate All, confirm re-evaluate, dismiss/run banner. |
| `/recruiter/candidates` | `recruiter/CandidatesPage` | Ranked/scored candidate list. | Filter division/status, open candidate detail. |
| `/recruiter/documents` | `recruiter/DocumentVerificationPage` | Review dokumen per aplikasi. | Select application, preview/hide preview, verify, reject with reason, finalize. |
| `/recruiter/announcements` | `recruiter/AnnouncementsPage` | Pilih kandidat yang lolos dan publish hasil per divisi. | Filter, checkbox pass, Publish Results, confirm publication. |
| `/recruiter/analytics` | `recruiter/AnalyticsPage` | Dashboard analytics active period dan division filter. | Select division filter. |
| `/rubrics` | `RubricConfigPage` | Kelola rubric evaluasi. | New Rubric, edit, add/remove dimensions/indicators, save, delete. |
| `/candidates/:id` | `CandidateDetailPage` | Detail candidate hasil evaluasi, dokumen, SWOT, score, identity reveal, override. | Back, preview document, supporting doc verified toggle, refresh SWOT, override score, reveal/hide identity, download/open preview. |
| `/recruiter/profile` | `recruiter/ProfilePage` | Account summary recruiter. | Edit Profile. |
| `/recruiter/profile/edit` | `recruiter/EditProfilePage` | Edit nama, email, password recruiter. | Simpan Perubahan. |

Allowed roles: `recruiter` dan `super_admin`.

### Super Admin Routes

| Route | Page | Purpose | Main Actions |
|---|---|---|---|
| `/admin/dashboard` | `admin/OverviewPage` | Overview admin, active period, metrics, dan shortcut admin. | Open shortcut. |
| `/admin/users` | `admin/AdminPage` | User management, role, active status, password reset link. | Search, filter role, change role, deactivate/reactivate, send reset link, pagination. |
| `/admin/periods` | `admin/RecruitmentPeriodPage` | Membuat, edit, menutup, dan melihat periode recruitment. | Tutup Periode, Buat and Aktifkan, Edit, Simpan, Batal. |
| `/admin/audit-logs` | `admin/AuditLogsPage` | Read-only audit log listing dengan filter dan pagination. | Rows select, Apply, Reset, Retry, Prev/Next. |
| `/admin/email-templates` | `admin/EmailTemplatesPage` | Monitoring email notification logs dan provider status. | Rows select, Apply, Reset, Retry, Prev/Next. |
| `/admin/settings` | `admin/SettingsPage` | Placeholder settings, belum ada API konfigurasi. | Tidak ada action mutasi. |
| `/admin/profile` | `admin/ProfilePage` | Account summary super admin. | Edit Profile. |
| `/admin/profile/edit` | `admin/EditProfilePage` | Edit nama, email, password super admin. | Simpan Perubahan. |

Allowed role: `super_admin`. Super admin juga bisa mengakses semua route recruiter-plus.

## Candidate Feature Guide

### Candidate Journey Overview

Candidate mendaftar akun, melakukan verifikasi email, login, melengkapi profil, memilih divisi pada periode pendaftaran, mengunggah enam dokumen wajib, melakukan review final, lalu submit aplikasi. Setelah submit, candidate tidak lagi mengedit dokumen biasa. Jika recruiter/admin menolak dokumen dan finalisasi menghasilkan `correction_requested`, candidate hanya bisa mengganti dokumen yang rejected. Candidate kemudian memantau status sampai `verified`, `screening`, dan `announced_pass` atau `announced_fail`.

### Candidate Pages and Buttons

#### Dashboard

- Route: `/dashboard`
- Tujuan halaman: Ringkasan home candidate dengan active period, progress dokumen, status aplikasi, announcement banner, journey, dan checklist dokumen.
- Data yang ditampilkan: `getMe`, `getActivePeriod`, `getMyApplication`, `listApplicationDocuments`, dan `getMyAnnouncement` jika status bukan `draft`.
- Tombol/action: `Start application` menuju `/application/start`; `Manage documents` menuju `/documents`; `Review & Submit` menuju `/application/review`; `Continue uploading` menuju `/documents`; `Fix documents` menuju `/documents`; `View submission` menuju `/application/status`.
- Dampak action: Navigasi saja, tidak memutasi backend.
- API terkait: `getMe`, `getActivePeriod`, `getMyApplication`, `listApplicationDocuments`, `getMyAnnouncement`.
- State: loading spinner, no application card, announcement pass/fail banner, phase card empty jika tidak ada active period, progress dokumen, locked mode setelah submit.

#### Profile

- Route: `/profile`
- Tujuan halaman: Menampilkan data personal, kontak, akademik, role/account status, current application, dan reference ID.
- Data yang ditampilkan: `getMyProfile`, `getMyApplication`.
- Tombol/action: `Edit Profile` menuju `/profile/edit`; `Open Application Overview` menuju `/application`.
- Dampak action: Navigasi saja.
- API terkait: `getMyProfile`, `getMyApplication`.
- State: loading spinner; jika belum ada aplikasi, field application menampilkan `No application`.

#### Edit Profile

- Route: `/profile/edit`
- Tujuan halaman: Melengkapi atau mengubah profil candidate.
- Data yang ditampilkan: `getMyProfile`, missing profile fields dari location state jika guard mengarahkan ke halaman ini.
- Tombol/action: `Back to Profile`; `Simpan Perubahan`.
- Dampak action: `Simpan Perubahan` mengirim payload partial ke `PUT /users/me`. Setelah status post-submit, field akademik seperti NIM/fakultas/jurusan/angkatan dikunci; nama, email, WhatsApp, password tetap bisa diedit.
- API terkait: `getMyProfile`, `updateMyProfile`.
- State: loading spinner, warning "Lengkapi profil sebelum lanjut", saving spinner, toast validasi password/WhatsApp, toast success/error.

#### Application Overview

- Route: `/application`
- Tujuan halaman: Menampilkan aplikasi saat ini, status, reference ID, submitted date, document progress, dan next action.
- Data yang ditampilkan: `getMyProfile`, `getMyApplication`, `listApplicationDocuments`.
- Tombol/action: `Start application`, `Continue documents`, `Review and submit`, `View application status`.
- Dampak action: Navigasi berdasarkan `nextApplicationTarget`.
- API terkait: `getMyProfile`, `getMyApplication`, `listApplicationDocuments`.
- State: loading spinner, no application empty state, uploaded/missing badge, status badge.

#### Start Application

- Route: `/application/start`
- Tujuan halaman: Memilih salah satu divisi dan membuat draft aplikasi.
- Data yang ditampilkan: `getMyProfile`, `getActivePeriod`, `getMyApplication`.
- Tombol/action: kartu divisi Big Data, Cyber Security, Game Technology, GIS; `Start application`; `Application overview`; `Continue documents`; `View application status`.
- Dampak action: `Start application` memanggil `POST /applications` lewat `createApplication(division)`, lalu navigasi ke `/documents`.
- API terkait: `getMyProfile`, `getActivePeriod`, `getMyApplication`, `createApplication`.
- State: division locked jika aplikasi sudah ada; submit disabled jika tidak ada active period fase `SUBMISSION`; warning memakai `submissionPhaseMessage`.

#### Documents

- Route: `/documents`
- Tujuan halaman: Upload dokumen wajib dan mengganti dokumen rejected saat correction.
- Data yang ditampilkan: `getMyApplication`, `getActivePeriod`, `listApplicationDocuments`, document limits.
- Tombol/action: drop zone/click browse file, `Replace`, `Back`, `Next Step`, `Review & Submit`, `View Status`.
- Dampak action: Upload memanggil `POST /documents/upload/{docType}` lewat `uploadApplicationDocument`. Dalam correction, hanya dokumen rejected yang bisa diganti.
- API terkait: `getMyApplication`, `getActivePeriod`, `listApplicationDocuments`, `uploadApplicationDocument`.
- State: loading, redirect ke `/application/start` jika belum ada aplikasi, locked message setelah final submit atau di luar submission phase, review status panel untuk verified/rejected/pending, rejected reason.

#### Review and Submit

- Route: `/application/review`
- Tujuan halaman: Review profil dan dokumen sebelum final submit.
- Data yang ditampilkan: `getMyProfile`, `getMyApplication`, `getActivePeriod`, `listApplicationDocuments`.
- Tombol/action: `Edit Profile`, tiga checkbox acknowledgement, `Back to documents`, `Submit final application`.
- Dampak action: `Submit final application` memanggil `POST /applications/{id}/submit`, lalu navigasi ke `/application/status`.
- API terkait: `getMyProfile`, `getMyApplication`, `getActivePeriod`, `listApplicationDocuments`, `submitApplication`.
- Precondition: aplikasi `draft`, semua dokumen wajib ada, profil lengkap, periode berada di `SUBMISSION`, tiga checkbox dicentang.
- State: irreversible warning, missing profile warning, submit-disabled state, loading/saving spinner, redirect otomatis ke status jika aplikasi sudah bukan draft.

#### Application Status

- Route: `/application/status`
- Tujuan halaman: Satu tempat untuk status aplikasi, reference ID, journey, correction, dan hasil akhir.
- Data yang ditampilkan: `getMyApplication`, `listApplicationDocuments`, `getMyAnnouncement`.
- Tombol/action: `Copy`, `Start application`, `Review and submit`, `Continue documents`, `Fix Documents`, `Back to dashboard`.
- Dampak action: `Copy` menyalin reference ID ke clipboard; action lain navigasi.
- API terkait: `getMyApplication`, `listApplicationDocuments`, `getMyAnnouncement`.
- State: no application, draft progress, status hero, pass/fail announcement, correction card dengan rejection reason, copy success/error toast.

#### Legacy Candidate Routes

- `/review`: resolver lama yang membaca `getMyApplication`, lalu redirect ke `/application/review`, `/application/status`, atau `/application/start`.
- `/submitted` dan `/result`: redirect langsung ke `/application/status`.
- `/my-applications`: menampilkan list aplikasi/CV legacy dari `listMyApplications`; tidak ada tombol mutasi.
- `/upload`: upload CV/certificate legacy dengan `uploadFiles(files, rubricId)` dan `listRubrics`; memiliki `Remove`, `Skip (no certificate)`, dan `Upload & Process`. Halaman ini tidak masuk sidebar candidate baru.

## Recruiter Feature Guide

### Recruiter Journey Overview

Recruiter memantau dashboard dan periode aktif, memfilter aplikasi, melakukan review dokumen, menjalankan evaluasi AI per divisi, membuka ranked candidates dan detail evidence, melakukan override skor jika diperlukan, lalu publish hasil pass/fail per divisi saat fase announcement. Recruiter juga bisa mengelola rubric evaluasi dan profil akun sendiri. Super admin menggunakan workspace recruiter yang sama untuk kebutuhan oversight.

### Recruiter Pages and Buttons

#### Recruiter Dashboard

- Route: `/recruiter/dashboard`
- Tujuan halaman: Overview metrics dan shortcut workspace recruiter.
- Data yang ditampilkan: `listRecruiterApplications`, `getActivePeriod`.
- Tombol/action: `Open` pada shortcuts Applications, Evaluation, Candidates, Announcements, Analytics, Documents, Rubrics.
- Dampak action: Navigasi saja.
- State: phase card, registration-ended prompt, metric loading dengan `...`.

#### Applications

- Route: `/recruiter/applications`
- Tujuan halaman: Melihat aplikasi non-draft dengan filter divisi/status.
- Data yang ditampilkan: `listRecruiterApplications({ division, status })`.
- Tombol/action: division/status select, `Reset`, click row/open detail jika `candidateEvaluationId` ada.
- Dampak action: Filter memuat ulang list; row click navigasi ke `/candidates/:id`.
- State: loading table, empty state, tooltip "Run evaluation to unlock detail view".

#### Evaluation

- Route: `/recruiter/evaluation`
- Tujuan halaman: Menjalankan evaluasi AI per divisi untuk aplikasi yang dokumennya verified.
- Data yang ditampilkan: `listRecruiterApplications({ division })`, `getActivePeriod`.
- Tombol/action: division select, `Run Evaluation`, banner `Run Evaluation`, dismiss banner, `Re-evaluate All`, dialog confirm `Re-evaluate`.
- Dampak action: `Run Evaluation` memanggil `POST /recruiter/evaluate/batch` dengan `force=false`; `Re-evaluate All` memanggil endpoint yang sama dengan `force=true`.
- API terkait: `evaluateBatch`, `listRecruiterApplications`, `getActivePeriod`.
- Precondition: division terpilih. Backend akan skip candidate yang belum verified, correction, atau sudah dievaluasi jika `force=false`.
- State: phase warning jika bukan fase `EVALUATION`, skipped warning, toast evaluated/skipped/error, AlertDialog untuk re-evaluate.

#### Candidates

- Route: `/recruiter/candidates`
- Tujuan halaman: Ranked/scored candidate review list.
- Data yang ditampilkan: `listRecruiterApplications`, diproses dengan `sortRankedApplications` dan `candidateEvaluationId`.
- Tombol/action: filter division/status, reset, click row ke detail.
- Dampak action: Navigasi ke detail kandidat.
- State: empty state "No scored candidates", recommended badge, score badge, status badge.

#### Document Verification

- Route: `/recruiter/documents`
- Tujuan halaman: Review dokumen per aplikasi, verify/reject per dokumen, lalu finalize satu candidate.
- Data yang ditampilkan: `listRecruiterApplications`, `listApplicationDocuments`, `getActivePeriod`, preview blob via `fetchDocumentBlob`.
- Tombol/action: filter, select application, `Preview`/`Hide Preview`, `Verify`, `Reject`, rejection reason textarea, `Finalize`.
- Dampak action: `Verify`/`Reject` memanggil `PUT /documents/{docId}/review`; `Finalize` memanggil `POST /applications/{id}/finalize-document-review`.
- Precondition: Reject butuh reason. Finalize aktif bila semua dokumen selected application sudah `verified` atau `rejected` dan status application reviewable (`document_review` atau `submitted`).
- State: loading applications, loading documents, per-document working state, preview loading, evaluation phase warning, `window.confirm` sebelum finalize.

#### Announcements

- Route: `/recruiter/announcements`
- Tujuan halaman: Publish hasil pass/fail per divisi.
- Data yang ditampilkan: `listRecruiterApplications`, `getActivePeriod`, current user role.
- Tombol/action: filter division/status, candidate pass checkbox, `Publish Results`, confirm `Publish`.
- Dampak action: `Publish Results` memanggil `POST /announcements/bulk` lewat `bulkAnnounce`.
- Precondition: minimal satu pass selected, filter harus satu divisi bukan `all`, active period ada, phase `ANNOUNCEMENT` kecuali role super admin.
- State: tooltip jika harus pilih division, disabled jika belum fase announcement, super admin bypass warning, AlertDialog publish irreversible.

#### Analytics

- Route: `/recruiter/analytics`
- Tujuan halaman: Active-period analytics untuk aplikasi, dokumen, evaluasi, skor, demografi, dan funnel.
- Data yang ditampilkan: `getRecruiterAnalytics({ division })`.
- Tombol/action: division select.
- Dampak action: Memuat ulang data analytics sesuai scope.
- State: loading block, no active period, no applications, empty chart/table text.

#### Rubrics

- Route: `/rubrics`
- Tujuan halaman: Membuat dan mengubah rubric evaluasi.
- Data yang ditampilkan: `listRubrics`, `getRubric`.
- Tombol/action: `New Rubric`, card row edit, pencil edit, trash delete, `Cancel`, `Add Dimension`, remove dimension, `Add Indicator`, remove indicator, `Save Rubric`, delete dialog `Delete`.
- Dampak action: create/update/delete rubric lewat API.
- Precondition: name dan position wajib; total weight harus 100%.
- State: loading, no rubrics empty state, weight invalid warning, save/delete spinner, delete confirmation dialog.

#### Candidate Detail

- Route: `/candidates/:id`
- Tujuan halaman: Membuka detail candidate hasil evaluasi, documents, SWOT, language certificate, charts, evidence, identity reveal, dan override score.
- Data yang ditampilkan: `getCandidate(id)`, `listApplicationDocuments(application.id)`, `getSwotText`, `fetchDocumentBlob`.
- Tombol/action: `Back`, supporting document `Verified` checkbox, `Preview`, `Refresh` SWOT, pencil override, `Cancel`, `Save Override`, `Reveal Identity`/`Hide Identity`, preview `Open in new tab`, `Download`.
- Dampak action: supporting document checkbox memakai legacy `verifyDocument`; score override memakai `overrideScore`; preview/download memakai blob URL.
- Precondition: override butuh score 0-100 dan reason.
- State: candidate not found, no scores, no SWOT/missing SWOT, preview loading/error, identity hidden by default.

#### Recruiter Profile

- Routes: `/recruiter/profile`, `/recruiter/profile/edit`
- Tujuan halaman: Melihat dan mengedit nama, email, password recruiter.
- Data/API: `getMyProfile`, `updateMyProfile`.
- Tombol/action: `Edit Profile`, `Simpan Perubahan`.
- State: role badge, account active badge, saving/loading, password confirmation validation.

## Super Admin Feature Guide

### Super Admin Journey Overview

Super admin memegang oversight sistem: melihat dashboard dan active period stats, mengelola akun/role, membuat dan menutup recruitment period, memantau audit logs, memantau email notification lifecycle, dan memakai workspace recruiter untuk applications, evaluation, candidates, documents, announcements, analytics, dan rubrics. Super admin juga bisa publish announcements di luar fase announcement sesuai bypass yang terlihat di UI.

### Super Admin Pages and Buttons

#### Admin Dashboard

- Route: `/admin/dashboard`
- Tujuan halaman: Overview sistem, active period card, total users, applications, evaluated, dan shortcut admin.
- Data yang ditampilkan: `getActivePeriod`, `getActivePeriodStats`, `listRecruiterApplications`, `listUsers({ page:1, limit:1 })`.
- Tombol/action: shortcut `Open` ke Users, Periods, Recruiter Applications, Audit Logs, Emails, Analytics, Settings.
- Dampak action: Navigasi saja.
- State: active period none/active, loading metrics.

#### User Management

- Route: `/admin/users`
- Tujuan halaman: List user, search/filter, role update, active status, dan assisted reset password.
- Data yang ditampilkan: `listUsers`, `getActivePeriod`, `getActivePeriodStats`.
- Tombol/action: search input + `Search`, role filter select, per-user role select, `Deactivate`/`Reactivate`, `Send reset link`, `Kelola Periode Rekrutasi`, pagination `Prev`/`Next`.
- Dampak action: `updateUserRole`, `deactivateUser`, `reactivateUser`, `sendAdminPasswordResetLink`.
- Precondition: user tidak bisa memodifikasi akun sendiri untuk role/active status; reset link memakai confirm browser.
- State: loading users, no users match filters, busy per user, self-protection helper text.

#### Recruitment Periods

- Route: `/admin/periods`
- Tujuan halaman: Membuat, edit, menutup, dan melihat riwayat periode recruitment.
- Data yang ditampilkan: `listPeriods`.
- Tombol/action: `Tutup Periode`, dialog `Ya, tutup`, `Batal`, create form `Buat & Aktifkan`, table row `Edit`, edit row `Simpan`, `Batal`.
- Dampak action: `closePeriod`, `createPeriod`, `updatePeriod`.
- Precondition: periode baru hanya bisa dibuat jika tidak ada active period. Frontend memvalidasi urutan tanggal: start < submission end < evaluation end < end.
- State: active period card, no active period, form disabled jika masih ada active period, field errors, loading, empty periods.

#### Audit Logs

- Route: `/admin/audit-logs`
- Tujuan halaman: Read-only listing audit actions.
- Data yang ditampilkan: `getAdminAuditLogs` dengan page, limit, action type, actor ID, affected user ID, date range.
- Tombol/action: rows select, action type select, filter fields, `Apply`, `Reset`, `Retry`, pagination.
- Dampak action: Query ulang data audit; tidak ada mutasi.
- State: loading, error message + Retry, empty filters, pagination.

#### Emails

- Route: `/admin/email-templates`
- Tujuan halaman: Monitoring email notification logs, provider status, summary, dan read-only template names.
- Data yang ditampilkan: `getAdminEmailNotifications`.
- Tombol/action: rows select, notification type/status select, recipient/date filters, `Apply`, `Reset`, `Retry`, pagination.
- Dampak action: Query ulang email logs; tidak ada mutasi.
- State: summary total/sent/failed/mock, provider status, loading, error, empty filters.

#### Settings

- Route: `/admin/settings`
- Tujuan halaman: Placeholder settings untuk stabilitas route/navigation.
- Data/API: Tidak ada API settings.
- Tombol/action: Tidak ada action mutasi.
- State: "Backend support pending".

#### Super Admin Profile

- Routes: `/admin/profile`, `/admin/profile/edit`
- Tujuan halaman: Melihat dan mengedit nama, email, password super admin.
- Data/API: `getMyProfile`, `updateMyProfile`.
- Tombol/action: `Edit Profile`, `Simpan Perubahan`.
- State: role badge, account active badge, saving/loading, password confirmation validation.

## Public/Auth Feature Guide

- Login: User mengisi email/password, klik `Sign in`, lalu `login` menyimpan access token dan redirect berdasarkan role. Jika backend mengembalikan `EMAIL_NOT_VERIFIED`, UI menampilkan error dan tombol `Kirim Ulang Email Verifikasi`.
- Register: Candidate mengisi full name, NIM, email, password, fakultas, jurusan, angkatan. `Create account` memanggil `register`. Setelah sukses, user melihat instruksi verifikasi email dan tombol `Kembali ke Login` serta `Kirim Ulang Email Verifikasi`.
- Verify email: `/verify-email?code=...` otomatis memanggil `verifyEmail`. Jika gagal dan code memungkinkan resend, user bisa mengisi email dan klik `Kirim Ulang Email Verifikasi`.
- Resend verification: Dipakai di Login, Register, dan Verify Email. Message sengaja generik: "Jika akun kandidat belum diverifikasi, email verifikasi telah dikirim."
- Forgot password: User mengisi email dan klik `Kirim Link Reset`; message success juga generik agar tidak membocorkan apakah email terdaftar.
- Reset password: User membuka link reset dengan query `code`, mengisi password baru dan konfirmasi, klik `Reset Password`. Setelah sukses token lokal dihapus dan user diarahkan untuk login ulang.
- Logout behavior: Tombol `Log out` di sidebar memanggil `logout()` dari `auth.js`, menghapus token lokal dan `window.location.assign("/login")`. Helper `logoutApi` ada di `api.js` tetapi tidak terlihat dipakai di UI.

## Button and Action Inventory

| Role | Page | Button/Action | Purpose | API/Helper | Confirmation | Risk Level |
|---|---|---|---|---|---|---|
| Public | Login | Sign in | Login dan redirect sesuai role. | `login`, `saveToken`, `defaultPathForRole` | No | Medium |
| Public | Login | Show/Hide password | Toggle visibility password. | Local state | No | Low |
| Public | Login | Forgot password? | Navigasi ke reset request. | Router link | No | Low |
| Public | Login/Register/Verify | Kirim Ulang Email Verifikasi | Kirim ulang email verification. | `resendVerification` | No | Medium |
| Public | Register | Create account | Membuat akun candidate. | `register` | No | Medium |
| Public | Forgot Password | Kirim Link Reset | Minta reset password email. | `forgotPassword` | No | Medium |
| Public | Reset Password | Reset Password | Set password baru dari code email. | `resetPassword`, `removeToken` | No | High |
| Public | Reset Password | Minta Link Baru | Navigasi ke forgot password. | Router link | No | Low |
| All auth | Sidebar | Log out | Hapus token dan kembali login. | `logout` | No | Medium |
| Candidate | Dashboard | Start application | Mulai flow aplikasi. | Router navigation | No | Low |
| Candidate | Dashboard | Manage documents | Buka upload dokumen. | Router navigation | No | Low |
| Candidate | Dashboard | Review & Submit | Buka review final jika dokumen lengkap. | Router navigation | No | Low |
| Candidate | Dashboard/Status | Fix documents | Buka dokumen saat correction. | Router navigation | No | Low |
| Candidate | Profile | Edit Profile | Buka form edit profile. | Router navigation | No | Low |
| Candidate | Edit Profile | Simpan Perubahan | Update profil/password. | `updateMyProfile` | No | Medium |
| Candidate | Application Overview | Start/Continue/Review/View Status | Navigasi next step aplikasi. | `nextApplicationTarget` | No | Low |
| Candidate | Start Application | Select division | Memilih divisi sebelum draft dibuat. | Local state | No | Low |
| Candidate | Start Application | Start application | Membuat draft aplikasi. | `createApplication` | No | Medium |
| Candidate | Documents | Upload/drop file | Upload dokumen wajib. | `uploadApplicationDocument` | No | Medium |
| Candidate | Documents | Replace | Mengganti dokumen existing/rejected. | `uploadApplicationDocument` | No | Medium |
| Candidate | Documents | Back/Next Step | Navigasi step upload. | Local state | No | Low |
| Candidate | Documents | Review & Submit | Buka halaman review. | Router navigation | No | Low |
| Candidate | Review | Checkbox acknowledgement | Membuka submit final setelah tiga persetujuan. | Local state | No | Medium |
| Candidate | Review | Submit final application | Submit aplikasi final. | `submitApplication` | No, hanya warning + checkbox | High |
| Candidate | Status | Copy | Copy reference ID. | `navigator.clipboard` | No | Low |
| Candidate | Status | Back to dashboard | Navigasi ke dashboard. | Router link | No | Low |
| Candidate legacy | Upload | Select rubric | Pilih rubric legacy upload. | Local state | No | Low |
| Candidate legacy | Upload | Remove | Hapus file pilihan sebelum upload. | Local state | No | Low |
| Candidate legacy | Upload | Skip certificate | Lewati certificate opsional. | Local state | No | Low |
| Candidate legacy | Upload | Upload & Process | Upload CV/certificate legacy. | `uploadFiles` | No | Medium |
| Recruiter | Overview | Open shortcut | Buka workspace. | Router link | No | Low |
| Recruiter | Applications/Candidates | Filter select | Filter list aplikasi. | `listRecruiterApplications` | No | Low |
| Recruiter | Applications/Candidates | Reset | Reset filter. | Local state + reload | No | Low |
| Recruiter | Applications/Candidates | Table row click | Buka candidate detail jika tersedia. | Router navigation | No | Low |
| Recruiter | Evaluation | Run Evaluation | Evaluasi kandidat verified per divisi. | `evaluateBatch(force:false)` | No | High |
| Recruiter | Evaluation | Re-evaluate All | Re-run evaluasi semua candidate divisi. | `evaluateBatch(force:true)` | AlertDialog | High |
| Recruiter | Evaluation | Dismiss banner | Tutup prompt registration ended. | Local state | No | Low |
| Recruiter | Documents | Select application | Memuat dokumen candidate. | `listApplicationDocuments` | No | Low |
| Recruiter | Documents | Preview/Hide Preview | Preview dokumen auth blob. | `fetchDocumentBlob` | No | Low |
| Recruiter | Documents | Verify | Tandai dokumen verified. | `reviewDocument(status:"verified")` | No | Medium |
| Recruiter | Documents | Reject | Tolak dokumen dengan reason. | `reviewDocument(status:"rejected")` | No | Medium |
| Recruiter | Documents | Finalize | Finalisasi review dokumen aplikasi. | `finalizeDocumentReview` | `window.confirm` | High |
| Recruiter | Announcements | Candidate checkbox | Menandai candidate sebagai pass. | Local state | No | Medium |
| Recruiter | Announcements | Publish Results | Publish pass/fail per divisi. | `bulkAnnounce` | AlertDialog | High |
| Recruiter | Analytics | Division filter | Ganti scope analytics. | `getRecruiterAnalytics` | No | Low |
| Recruiter+ | Rubrics | New Rubric/Create First Rubric | Buka form rubric baru. | Local state | No | Low |
| Recruiter+ | Rubrics | Save Rubric | Create/update rubric. | `createRubric`/`updateRubric` | No | High |
| Recruiter+ | Rubrics | Delete | Hapus rubric dan dimension scores terkait. | `deleteRubric` | Dialog | High |
| Recruiter+ | Candidate Detail | Verified checkbox | Toggle legacy supporting document verification. | `verifyDocument` | No | Medium |
| Recruiter+ | Candidate Detail | Refresh SWOT | Reload text SWOT. | `getSwotText` | No | Low |
| Recruiter+ | Candidate Detail | Reveal/Hide Identity | Tampilkan/sembunyikan entity identity hasil anonymization. | Local state | No | High |
| Recruiter+ | Candidate Detail | Save Override | Ubah dimension score dengan reason. | `overrideScore` | Dialog form, no extra confirm | High |
| Recruiter+ | Candidate Detail | Open in new tab/Download | Buka/download preview blob. | Blob URL from `fetchDocumentBlob` | No | Low |
| Recruiter/Admin | Profile Edit | Simpan Perubahan | Update nama/email/password staff. | `updateMyProfile` | No | Medium |
| Super Admin | Admin Dashboard | Open shortcut | Buka workspace admin/shared. | Router link | No | Low |
| Super Admin | Users | Search | Search users. | `listUsers` | No | Low |
| Super Admin | Users | Role select | Mengubah role user. | `updateUserRole` | No | High |
| Super Admin | Users | Deactivate/Reactivate | Mengubah active status user. | `deactivateUser`/`reactivateUser` | No | High |
| Super Admin | Users | Send reset link | Kirim reset password link. | `sendAdminPasswordResetLink` | `window.confirm` | High |
| Super Admin | Users | Prev/Next | Pagination users. | `listUsers` | No | Low |
| Super Admin | Periods | Tutup Periode | Menutup active period. | `closePeriod` | Dialog | High |
| Super Admin | Periods | Buat & Aktifkan | Membuat period baru aktif. | `createPeriod` | No | High |
| Super Admin | Periods | Edit/Simpan | Update period. | `updatePeriod` | No | High |
| Super Admin | Audit Logs | Apply/Reset | Filter audit logs. | `getAdminAuditLogs` | No | Low |
| Super Admin | Audit Logs | Retry | Reload setelah error. | `getAdminAuditLogs` | No | Low |
| Super Admin | Audit Logs | Rows/Prev/Next | Pagination dan page size. | `getAdminAuditLogs` | No | Low |
| Super Admin | Emails | Apply/Reset | Filter email notifications. | `getAdminEmailNotifications` | No | Low |
| Super Admin | Emails | Retry | Reload setelah error. | `getAdminEmailNotifications` | No | Low |
| Super Admin | Emails | Rows/Prev/Next | Pagination dan page size. | `getAdminEmailNotifications` | No | Low |
| Super Admin | Settings | Placeholder only | Menjaga route settings. | None | No | Low |

## Status and Badge Inventory

- Application status:
  - `draft`: aplikasi masih bisa dilengkapi.
  - `submitted`: submit final sudah dilakukan.
  - `document_review`: dokumen sedang diverifikasi recruiter/admin.
  - `correction_requested`: ada dokumen rejected dan candidate harus mengganti dokumen tersebut.
  - `verified`: dokumen diterima dan aplikasi siap evaluasi.
  - `screening`: aplikasi berada di evaluasi AI.
  - `announced_pass`: hasil diumumkan lolos.
  - `announced_fail`: hasil diumumkan tidak lolos.
  - `cancelled`: status backend dikenal helper tetapi tidak terlihat sebagai action UI candidate.
- Document verification status:
  - `pending`: belum direview.
  - `verified`: dokumen diterima.
  - `rejected`: dokumen ditolak, reason wajib saat recruiter reject.
- Recruitment phase:
  - `UPCOMING`: belum dibuka.
  - `SUBMISSION`: pendaftaran.
  - `EVALUATION`: evaluasi AI.
  - `ANNOUNCEMENT`: pengumuman.
  - `CLOSED`: selesai.
- Announcement status:
  - Candidate melihat hasil melalui application status `announced_pass` atau `announced_fail`.
  - Recruiter melihat already announced count dari aplikasi dengan status announced.
- Email notification status:
  - `captured`: email dicatat/mock captured.
  - `sent`: terkirim.
  - `failed`: gagal kirim.
  - `disabled`: email disabled.
  - `pending`: class badge disiapkan, tetapi opsi filter utama tidak menampilkan pending.
- Audit action type:
  - `document_verification`
  - `document_review_finalized`
  - `announcement`
  - `bulk_announcement`
  - `score_override`
- Account/role status:
  - Role badge: `candidate`, `recruiter`, `super_admin`.
  - Account badge: `Active`, `Inactive`/`Deactivated`.
- Legacy candidate upload status:
  - `uploaded`, `extracted`, `anonymized`, `scored` di `/my-applications` atau legacy upload result.
- Score/completeness badges:
  - Score 75+ green, 50-74 yellow, 25-49 orange, below 25 red.
  - Document completeness memakai progress percent dan Uploaded/Missing badge.

## API Helper Usage Map

| API Helper | Endpoint | Used By | Purpose |
|---|---|---|---|
| `login` | `POST /auth/login` | `LoginPage` | Login dan menerima access token/user. |
| `register` | `POST /auth/register` | `RegisterPage` | Register candidate baru. |
| `verifyEmail` | `GET /auth/verify-email?code=...` | `VerifyEmailPage` | Verifikasi email. |
| `resendVerification` | `POST /auth/resend-verification` | `LoginPage`, `RegisterPage`, `VerifyEmailPage` | Kirim ulang email verification. |
| `forgotPassword` | `POST /auth/forgot-password` | `ForgotPasswordPage` | Minta reset password email. |
| `resetPassword` | `POST /auth/reset-password` | `ResetPasswordPage` | Set password baru dari code. |
| `logoutApi` | `POST /auth/logout` | Tidak terlihat dipakai UI | Logout server-side jika dibutuhkan nanti. |
| `getMe` | `GET /auth/me` | Candidate dashboard | Data user login ringan. |
| `getMyProfile` | `GET /users/me` | Candidate/staff profiles, guards, start/review flow | Profil enriched dan application status. |
| `updateMyProfile` | `PUT /users/me` | Candidate/staff edit profile | Update profil/password. |
| `listMyApplications` | `GET /my-applications` | `MyApplicationsPage` | Legacy list aplikasi/CV candidate. |
| `createApplication` | `POST /applications` | `StartApplicationPage` | Membuat draft aplikasi candidate. |
| `getMyApplication` | `GET /applications/my` | Candidate flow, root legacy redirect | Ambil aplikasi candidate saat ini. |
| `submitApplication` | `POST /applications/{id}/submit` | `ReviewPage` | Submit final aplikasi. |
| `uploadApplicationDocument` | `POST /documents/upload/{docType}` | `DocumentsPage` | Upload/replace dokumen candidate. |
| `replaceApplicationDocument` | `PUT /documents/{docId}/replace` | Tidak terlihat dipakai UI saat ini | Helper replace dokumen langsung by id. |
| `listApplicationDocuments` | `GET /documents/{applicationId}` | Candidate documents/status, recruiter docs, candidate detail | List dokumen aplikasi dan limits/progress. |
| `documentFileUrl` | Raw `/documents/{docId}/file` URL | Tidak terlihat dipakai UI langsung | Fallback URL tanpa auth header. |
| `fetchDocumentBlob` | Auth fetch `/documents/{docId}/file` | Document preview/detail | Preview/download file dengan auth header. |
| `verifyDocument` | `PUT /documents/{docId}/verify` | `CandidateDetailPage` | Legacy toggle supporting document verification. |
| `reviewDocument` | `PUT /documents/{docId}/review` | `DocumentVerificationPage` | Verify/reject dokumen dengan status dan reason. |
| `finalizeDocumentReview` | `POST /applications/{id}/finalize-document-review` | `DocumentVerificationPage` | Finalisasi review dokumen aplikasi. |
| `getSwotText` | `GET /applications/{id}/swot-text` | `SwotHighlightPanel` | Extract/display text SWOT. |
| `listRecruiterApplications` | `GET /recruiter/applications` | Recruiter/admin workspaces | List aplikasi dengan filter divisi/status. |
| `getRecruiterAnalytics` | `GET /recruiter/analytics` | `AnalyticsPage` | Metrics active period. |
| `listUsers` | `GET /users` | Admin overview/users | List/search/filter users. |
| `updateUserRole` | `PUT /users/{id}/role` | Admin users | Update role user. |
| `deactivateUser` | `PUT /users/{id}/deactivate` | Admin users | Deactivate user. |
| `reactivateUser` | `PUT /users/{id}/reactivate` | Admin users | Reactivate user. |
| `sendAdminPasswordResetLink` | `POST /auth/admin/users/{id}/send-password-reset` | Admin users | Kirim reset link tanpa melihat password baru. |
| `getAdminAuditLogs` | `GET /admin/audit-logs` | Audit logs page | Read-only audit listing. |
| `getAdminEmailNotifications` | `GET /admin/email-notifications` | Emails page | Read-only email notification monitoring. |
| `uploadFiles` | `POST /upload` | Legacy `UploadPage` | Upload CV/certificate legacy. |
| `listCandidates` | `GET /candidates` | Tidak terlihat dipakai page saat ini | Legacy candidates list helper. |
| `getCandidate` | `GET /candidates/{id}` | `CandidateDetailPage` | Candidate evaluation detail. |
| `overrideScore` | `PUT /candidates/{candidateId}/scores/{dimScoreId}` | Candidate detail override dialog | Override dimension score dengan reason. |
| `listRubrics` | `GET /rubrics` | Rubrics, legacy upload | List rubrics. |
| `getRubric` | `GET /rubrics/{id}` | Rubrics edit | Load rubric detail. |
| `createRubric` | `POST /rubrics` | Rubrics | Create rubric. |
| `updateRubric` | `PUT /rubrics/{id}` | Rubrics | Update rubric. |
| `deleteRubric` | `DELETE /rubrics/{id}` | Rubrics | Delete rubric. |
| `runEvaluation` | `POST /evaluate` | Tidak terlihat dipakai UI saat ini | Legacy batch evaluation by rubric. |
| `evaluateBatch` | `POST /recruiter/evaluate/batch` | Evaluation page | Evaluate/re-evaluate per division. |
| `getEvaluationResult` | `GET /recruiter/results/{applicationId}` | Tidak terlihat dipakai UI saat ini | Helper result detail. |
| `createAnnouncement` | `POST /announcements` | Tidak terlihat dipakai UI saat ini | Single candidate announcement helper. |
| `getMyAnnouncement` | `GET /announcements/my` | Candidate dashboard/status | Candidate announcement result. |
| `bulkAnnounce` | `POST /announcements/bulk` | Announcements page | Publish pass/fail per division/period. |
| `getActivePeriod` | `GET /periods/active` | Candidate/recruiter/admin phase cards and guards | Active period and phase. |
| `getActivePeriodStats` | `GET /periods/active/stats` | Admin overview/users phase card | Active period submitted stats. |
| `listPeriods` | `GET /periods` | Periods page | List all periods. |
| `createPeriod` | `POST /periods` | Periods page | Create active period. |
| `updatePeriod` | `PUT /periods/{id}` | Periods page | Update period. |
| `closePeriod` | `PUT /periods/{id}/close` | Periods page | Close active period. |
| `healthCheck` | `GET /health` | Tidak terlihat dipakai UI saat ini | Health check helper. |

## Language and Copy Consistency Findings

| Area/Page | Current Copy | Issue | Suggested Direction |
|---|---|---|---|
| Global sidebar | Home/Application/Account, Dashboard, Documents, Application Status, Log out | Sidebar full English, sementara beberapa flow utama memakai Bahasa Indonesia. | Pilih satu strategi: English penuh untuk portal internal, atau Bahasa Indonesia utama dengan istilah teknis English. |
| Login | "Sign in to ScreenAI Lab", "Forgot password?", "Email belum diverifikasi..." | Campuran English dan Indonesia dalam satu flow error. | Konsistenkan auth copy. Karena user target lokal, Bahasa Indonesia utama bisa lebih ramah. |
| Register | "NIM must be 13 digits starting with '103'." | Regex frontend hanya `\\d{10,}` dan maxLength 13, sehingga copy tidak presisi terhadap validasi frontend. | Samakan copy dengan validasi backend/frontend. Jangan klaim starts with 103 jika tidak divalidasi frontend. |
| Candidate dashboard | "Application Progress", "Tahapan Seleksi", "LOLOS", "TIDAK LOLOS" | Campuran header English dan status Indonesia. | Buat glossary status: status akhir Indonesia, instruksi umum satu bahasa. |
| Review page | "Submission is final", "Profil belum lengkap", "Submit belum tersedia" | Campuran bahasa di halaman high-stakes. | Untuk final submit, gunakan bahasa yang paling jelas bagi candidate; sebaiknya Indonesia. |
| Documents page | "Upload Documents", "Correction requested", "Upload dokumen belum tersedia" | Mixed English/Indonesia. | Standarisasi title dan warning. |
| Recruiter pages | Applications, Evaluation, Candidates, Announcements, Analytics | Konsisten English, tetapi beberapa phase hints dari `RecruitmentPhaseCard` Indonesia. | Pertahankan English untuk staff workspace atau ubah phase hints ke English. |
| Admin periods | "Kelola Periode Rekrutasi", "Buat & Aktifkan", "Riwayat Periode" | Admin periods dominan Indonesia, berbeda dengan Admin Dashboard/User Management/Audit Logs/Emails. | Super admin area perlu satu voice, idealnya Indonesia untuk operations lokal atau English untuk semua staff. |
| Admin emails | Route `/admin/email-templates`, UI title "Emails", section "Read-only Templates" | Label UI sudah bergeser ke monitoring emails, path masih template. | Terima sebagai compatibility, tetapi dokumentasikan agar tester tidak mencari editor template. |
| Recruiter overview analytics shortcut | "Prepare for recruitment metrics once the API is available." | Copy tampak stale karena Analytics API/dashboard sudah ada. | Update copy nanti menjadi "View active-period recruitment metrics." |
| Legacy `/my-applications` | "Upload a CV to apply for a position." | Tidak selaras dengan flow candidate baru enam dokumen. | Tandai legacy atau redirect/hide dari candidate baru pada fase perapihan berikutnya. |
| Candidate detail | "Run an evaluation from the Dashboard" | Evaluasi sekarang berada di `/recruiter/evaluation`, bukan dashboard utama. | Arahkan copy ke Evaluation workspace. |

## UX/Design Findings

| Area/Page | Finding | Severity | Recommendation |
|---|---|---|---|
| RoleNavSidebar | Sidebar fixed width `w-64` dan main `ml-64`; belum terlihat mobile responsive/collapse. | Moderate | Uji viewport mobile saat Phase 12; siapkan responsive sidebar atau top nav jika mobile masuk scope. |
| Root route `/` | `RootRedirect` dibungkus `AuthenticatedShell`, sehingga unauthenticated user dapat sempat melewati shell sebelum redirect. | Minor | Pertimbangkan root redirect tanpa shell, atau protected shell hanya setelah auth diketahui. |
| User Management | Role change langsung berjalan saat select berubah tanpa confirm. | Major | Tambahkan confirm untuk perubahan role, terutama ke/dari `super_admin`. |
| User Management | Deactivate/reactivate langsung berjalan tanpa confirm. | Major | Tambahkan confirm dan jelaskan dampak login/access user. |
| Review final application | Submit final tidak memakai modal confirm, hanya warning banner dan tiga checkbox. | Moderate | Checkbox cukup membantu, tetapi modal akhir bisa mengurangi salah klik. |
| Document Verification | Finalize memakai `window.confirm`, sementara action high-risk lain memakai Dialog/AlertDialog. | Minor | Ganti ke styled AlertDialog agar konsisten. |
| Admin reset link | `window.confirm` digunakan untuk reset link. | Minor | Ganti ke AlertDialog untuk konsistensi visual. |
| Legacy routes | `/upload` dan `/my-applications` masih aktif tetapi tidak muncul di sidebar dan copy-nya legacy. | Moderate | Putuskan apakah tetap sebagai compatibility route, hidden staff tool, atau redirect ke flow baru. |
| Admin Emails path | UI "Emails" berada di route `/admin/email-templates`. | Minor | Bisa tetap untuk compatibility, tetapi dokumentasi/testing harus menyebut path lama. |
| Analytics | Banyak card panjang dan tabel/sections; perlu uji mobile scroll. | Minor | Pastikan empty/loading states tetap jelas di viewport kecil. |
| Candidate detail | Identity reveal adalah action sensitif tetapi hanya toggle, tidak ada confirm. | Moderate | Tambahkan lightweight confirmation/tooltip audit guidance jika identity reveal berdampak fairness. |
| Rubrics | Delete rubric sudah confirm, tetapi Save Rubric high impact tidak punya review summary. | Minor | Untuk rubric kompleks, pertimbangkan preview/summary sebelum save. |
| Settings | Placeholder jelas, tetapi sidebar "Settings" bisa memberi ekspektasi fitur konfigurasi aktif. | Minor | Label dapat menjadi "Settings (Pending)" jika ingin lebih eksplisit, atau tetap seperti sekarang dengan page copy yang jelas. |
| Tables | Beberapa action dalam satu row user dapat padat dan berisiko salah klik. | Moderate | Pisahkan action destructive/sensitive dengan spacing/menu atau confirm. |
| Copy visual hierarchy | Banyak button text English di candidate flow dengan warning Indonesia. | Minor | Selain language strategy, samakan hierarchy copy untuk primary/secondary action. |

## Phase 12 Manual Testing Support

Candidate checklist:

- Register candidate baru dan pastikan success screen meminta verifikasi email.
- Coba login candidate yang belum verified dan pastikan muncul resend verification.
- Verify email dengan code valid, invalid, expired/used jika data tersedia.
- Login candidate verified, pastikan redirect ke `/dashboard`.
- Buka `/dashboard` tanpa aplikasi dan klik `Start application`.
- Dengan active period `SUBMISSION`, pilih divisi dan klik `Start application`.
- Upload keenam dokumen di `/documents`; uji file type/size invalid.
- Pastikan `Review & Submit` disabled sebelum semua dokumen ada.
- Buka `/application/review`, uji missing profile, checkbox acknowledgement, dan final submit.
- Setelah submit, pastikan documents locked.
- Simulasikan `correction_requested`; pastikan hanya dokumen rejected bisa diganti dan reason terlihat.
- Cek `/application/status` untuk status `document_review`, `verified`, `screening`, `announced_pass`, `announced_fail`.
- Uji copy reference ID.
- Buka route legacy `/review`, `/submitted`, `/result`, `/my-applications`, `/upload` dan catat behavior.

Recruiter checklist:

- Login recruiter dan pastikan redirect ke `/recruiter/dashboard`.
- Buka setiap menu sidebar recruiter.
- Applications: filter division/status, reset, empty state, row detail locked/unlocked.
- Document Verification: pilih candidate, preview dokumen, verify, reject tanpa reason (harus error), reject dengan reason, finalize verified/correction.
- Evaluation: pilih divisi, run evaluation, lihat skipped candidates jika dokumen belum verified, re-evaluate all dan confirm dialog.
- Candidates: filter, cek recommended badge, top score, row detail.
- Candidate Detail: preview/download document, refresh SWOT, reveal/hide identity, override score dengan reason.
- Announcements: filter ke satu divisi, checklist pass, publish saat fase announcement, verify fail count, verify disabled state saat division all/no active period.
- Analytics: ganti division filter, cek no active period/empty data/loading.
- Rubrics: create, edit, invalid weight, add/remove dimension/indicator, delete dengan confirm.
- Recruiter profile: edit name/email/password, test validation.

Super admin checklist:

- Login super admin dan pastikan redirect ke `/admin/dashboard`.
- Pastikan super admin bisa membuka route recruiter-plus dan admin-only.
- Users: search, filter role, pagination, self-action disabled, role change, deactivate/reactivate, send reset link confirm.
- Periods: create period dengan invalid date order, create valid period, close active period dengan dialog, edit period dates/threshold.
- Audit Logs: filter action type, actor ID, affected user ID, date range, reset, pagination, retry saat API error.
- Emails: filter notification type/status/email/date, reset, pagination, provider status, read-only templates.
- Settings: pastikan hanya placeholder dan tidak mengklaim konfigurasi aktif.
- Admin profile: edit name/email/password.

Auth checklist:

- `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password` dapat dibuka tanpa token.
- Authenticated user yang membuka `/login` atau `/register` diarahkan ke default path role.
- Protected route tanpa token redirect ke `/login`.
- Wrong-role route menampilkan 403 Forbidden dan tombol `Go home`.
- Token expired/401 dari protected API menghapus token dan force redirect login.
- Sidebar `Log out` menghapus token dan kembali ke `/login`.

## Known Gaps / Follow-Up Recommendations

- Putuskan language strategy sebelum Phase 12 sign-off. Saat ini campuran English/Indonesia cukup luas dan akan memengaruhi manual testing script.
- Review route legacy candidate (`/upload`, `/my-applications`) apakah masih perlu didukung, diberi label legacy, atau disembunyikan lebih eksplisit.
- Tambahkan confirm untuk role change dan deactivate/reactivate user.
- Pertimbangkan mengganti `window.confirm` dengan AlertDialog untuk admin reset link dan document finalize.
- Periksa copy yang tampak stale: Analytics shortcut di recruiter overview dan candidate detail no-score guidance.
- Tentukan apakah identity reveal perlu confirmation, audit event, atau helper text yang lebih tegas.
- Uji responsive layout khususnya sidebar, analytics dashboard, tables, dan candidate journey tracker.
- Pastikan backend state untuk active period, correction, verified, screening, dan announcement tersedia dalam seed/manual test data Phase 12.
- `logoutApi`, `replaceApplicationDocument`, `runEvaluation`, `createAnnouncement`, `getEvaluationResult`, `listCandidates`, `healthCheck`, dan `documentFileUrl` ada sebagai helper tetapi tidak terlihat dipakai UI utama saat review ini. Ini bukan bug otomatis, tetapi perlu diputuskan apakah helper legacy/dead code.
- UI settings masih placeholder. Jangan masukkan ke regression sebagai fitur konfigurasi aktif.

## Conclusion

Frontend sudah memiliki inventory fitur yang cukup lengkap untuk candidate, recruiter, dan super admin sebelum Phase 12. Jalur candidate utama sudah linear dari register sampai announcement, recruiter workspace sudah task-based, dan super admin sudah memiliki halaman oversight untuk user, period, audit, dan email logs. Risiko terbesar untuk regression bukan route yang hilang, melainkan konsistensi copy, action sensitif tanpa confirm, route legacy yang masih aktif, dan state backend yang harus disiapkan agar semua status bisa diuji secara manual.
