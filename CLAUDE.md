# CLAUDE.md — Execution Plan
## ScreenAI Lab — Sistem Rekrutasi MBC Laboratory, Telkom University

> **Source:** [PRD.md](./PRD.md)
> **Forked from:** https://github.com/istgrudd/screenai
> **Repository:** https://github.com/istgrudd/screenai-lab
> **Last Updated:** 2026-04-25

---

## Phase Status

| Phase | Description | Status |
|---|---|---|
| Phase 0 | Fork & cleanup dari repo Capstone | ✅ Complete |
| Phase 1 | Candidate Portal MVP (Auth + Upload + Status + Admin) | ✅ Complete |
| Phase 2 | Full Recruitment Flow (NER submit-time + Periode + Evaluasi + Seleksi) | 🔄 In Progress |
| Phase 3 | Deployment (VPS lab / cloud) | 📋 Planned |

---

## Table of Contents

1. [Phase 1 Summary](#1-phase-1-summary)
2. [Phase 2 Scope](#2-phase-2-scope)
3. [Architecture Notes](#3-architecture-notes)
4. [Phase 2 Breakdown](#4-phase-2-breakdown)
5. [API Design (Phase 2 Additions)](#5-api-design-phase-2-additions)
6. [Frontend Pages (Phase 2 Additions)](#6-frontend-pages-phase-2-additions)
7. [Environment & Config](#7-environment--config)
8. [Deployment Plan](#8-deployment-plan)
9. [Risk & Mitigation](#9-risk--mitigation)
10. [Post-Phase-3 Backlog](#10-post-phase-3-backlog)

---

## 1. Phase 1 Summary

All Phase 1 tasks complete. The following is implemented and working:

**Backend**
- ✅ JWT auth: register, login, logout, /me
- ✅ Role-based access control (candidate, recruiter, super_admin)
- ✅ Application CRUD: create, submit (irreversible), list
- ✅ Document upload: 6 types, MIME + size enforcement, post-submit lock
- ✅ File storage: uploads/{application_id}/{doc_type}.{ext}
- ✅ GET /api/applications/{id}/swot-text (PyMuPDF extraction)
- ✅ Recruiter: list applications, filter division/status, verify D-06
- ✅ Super Admin: list users, change role, activate/deactivate
- ✅ Evaluation pipeline: KTM→KHS→NER→RAG→LLM→store (Task 8)
- ✅ POST /api/recruiter/evaluate/batch (division-based)
- ✅ POST /api/announcements + GET /api/announcements/my
- ✅ Audit log for announcements
- ✅ 4 empty rubrics auto-seeded on startup (idempotent)
- ✅ Alembic migrations (3 versions)

**Frontend**
- ✅ LoginPage, RegisterPage
- ✅ Candidate: DashboardPage, ProfilePage, DocumentsPage (6-step),
     ReviewPage, SubmittedPage, ResultPage
- ✅ Recruiter: RecruiterDashboard (filter + completeness),
     CandidateDetailPage (docs + SWOT + verify)
- ✅ AdminPage (/admin/users)
- ✅ ProtectedRoute, DocumentUploadStep, SwotHighlightPanel,
     DocumentPreviewDialog, RecruitmentJourney components

**Known State**
- NER runs at evaluation-time (not submit-time) — Phase 2 Fix
- Countdown in DashboardPage uses hardcoded date — Phase 2 Fix
- Legacy Capstone endpoints still mounted: `/api/upload`, `/api/evaluate`
- `xai.py` is a stub (TODO Phase 4)
- Audit log covers announcements only (not score overrides yet)

---

## 2. Phase 2 Scope

### Must Ship

| Feature | PRD ID | Description |
|---|---|---|
| Submit-time NER | F-70,71,72 | BackgroundTask NER saat submit, cached untuk evaluasi |
| RecruitmentPeriod model | F-80,81,82,83 | Buka/tutup periode, lock submission |
| Countdown dari periode aktif | F-84 | Ganti hardcode date di DashboardPage |
| Threshold highlight | F-85,90 | Super Admin set top N, kandidat di-highlight di rekruter |
| Seleksi manual rekruter | F-91,92,93,94 | Checklist + bulk publish hasil |
| Kandidat lihat hasil | F-95 | Dashboard banner (sudah ada, pastikan flow benar) |
| Division validation di evaluate | F-102 | Pydantic Division enum di EvaluateBatchRequest |

### Should Ship

| Feature | PRD ID | Description |
|---|---|---|
| Deprecate legacy endpoints | F-100 | Tandai `/api/upload` + `/api/evaluate` sebagai deprecated |
| Audit log score override | F-101 | Log semua override di candidates.py |
| Rubric.division type safety | — | Ganti String(20) ke Enum(Division) |

---

## 3. Architecture Notes

### Dual Pipeline State
Dua pipeline saat ini berjalan paralel. Phase 2 akan memfokuskan ke Lab pipeline:

```
Legacy (Capstone):         Lab Portal:
/api/upload                /api/documents/upload/{doc_type}
  → NER saat upload          → NER saat submit (Phase 2)
/api/evaluate              /api/recruiter/evaluate/batch
  → rubric_id based          → division based
```

Legacy endpoints tidak dihapus di Phase 2, hanya ditandai deprecated.

### NER Timing Change
```
Phase 1 (current):
  submit → [nothing] → evaluate → NER → RAG → LLM

Phase 2 (target):
  submit → BackgroundTask(NER) → store anonymized_text
  evaluate → check cached? → skip NER → RAG → LLM
```

### Announcement Flow (Phase 2)
```
Current (Phase 1):
  POST /api/announcements (one by one per application)

Phase 2 (bulk):
  POST /api/announcements/bulk
    body: { division, application_ids: [lolos], period_id }
    → lolos → announced_pass
    → sisanya di divisi → announced_fail
    → log semua ke audit_logs
```

---

## 4. Phase 2 Breakdown

### Task 10 — Submit-time NER (Week 1)

| # | Task | Detail |
|---|------|--------|
| 10.1 | `run_submit_anonymization(application_id)` | New function di `evaluation_service.py` atau service baru. Loads CV + ML documents, runs NER, stores result di `CandidateDocument.anonymized_text`. Creates `Candidate` record dengan `rubric_id=None`. |
| 10.2 | Inject BackgroundTasks ke submit endpoint | `applications.py:submit_application` — tambah `background_tasks: BackgroundTasks` param, call `background_tasks.add_task(run_submit_anonymization, app.id, db)` setelah `db.commit()` |
| 10.3 | Update `_evaluate_one` | Check `CandidateDocument.anonymized_text is not None` → skip NER, use cached. Fallback ke inline NER jika belum ada. |
| 10.4 | Update `_ensure_candidate` | Izinkan `rubric_id=None` saat create. Set rubric_id saat evaluasi dijalankan. |
| 10.5 | Smoke test | Test: submit → background NER → check anonymized_text tersimpan → evaluate → NER skip log |

**Milestone:** Submit otomatis trigger NER. Evaluasi lebih cepat karena NER sudah cached.

---

### Task 11 — RecruitmentPeriod (Week 1-2)

| # | Task | Detail |
|---|------|--------|
| 11.1 | Model `RecruitmentPeriod` | `id, name, start_date, end_date, is_active, threshold_n (nullable int), created_by (FK users), created_at` |
| 11.2 | Alembic migration | Add `recruitment_periods` table. Add nullable `period_id` FK to `applications` table. |
| 11.3 | `POST /api/periods` | Super Admin only. Body: `{ name, start_date, end_date, threshold_n? }`. Enforce satu active period (deactivate others on create). |
| 11.4 | `GET /api/periods/active` | Public. Return active period atau 404. Used by frontend countdown. |
| 11.5 | `GET /api/periods` | Super Admin only. List all periods. |
| 11.6 | `PUT /api/periods/{id}` | Super Admin only. Edit name, dates, threshold_n, is_active. |
| 11.7 | Submit lock | Di `submit_application`: check active period exists. If not → 403: "Tidak ada periode rekrutasi yang aktif saat ini." |
| 11.8 | Update DashboardPage countdown | Fetch `GET /api/periods/active`, use `end_date` for countdown. Show "Tidak ada periode aktif" jika 404. |
| 11.9 | RecruitmentPeriodPage | Super Admin page: `/admin/periods`. Form create/edit period + threshold_n. List periods dengan status badge. |

**Milestone:** Super Admin bisa buka/tutup periode. Kandidat tidak bisa submit di luar periode. Countdown real.

---

### Task 12 — Seleksi Manual Rekruter + Bulk Announce (Week 2)

| # | Task | Detail |
|---|------|--------|
| 12.1 | Threshold highlight di RecruiterDashboard | Fetch active period `threshold_n`. Kandidat dengan rank ≤ threshold_n di divisi tersebut → row di-highlight hijau. Badge "Rekomendasi AI". |
| 12.2 | Checklist kolom di RecruiterDashboard | Tambah checkbox per row kandidat (evaluated only). State lokal di frontend sampai "Publish". |
| 12.3 | "Publish Hasil" button | Muncul setelah ≥1 kandidat dicentang. Klik → confirmation dialog: "X kandidat lolos, Y kandidat tidak lolos. Lanjutkan?" |
| 12.4 | `POST /api/announcements/bulk` | Body: `{ division, period_id, passed_application_ids: [int] }`. Logic: passed → `announced_pass`, semua submitted/screening lain di divisi itu → `announced_fail`. Log semua ke `audit_logs`. |
| 12.5 | Update `GET /api/recruiter/applications` | Tambah field `rank` (urutan berdasarkan composite_score per divisi) dan `is_recommended` (rank ≤ threshold_n). |
| 12.6 | Disable individual announce | `POST /api/announcements` (single) tetap ada tapi di-hide dari UI rekruter. Bulk adalah flow utama. |

**Milestone:** Rekruter bisa centang kandidat lolos, preview hasilnya, lalu bulk publish. Kandidat langsung lihat hasil.

---

## Task 13 — Phase-Aware Recruitment Period

### Task 13.1 — Model & Migration (Session 1)

| # | Task | Detail |
|---|---|---|
| 13.1.1 | Update model `RecruitmentPeriod` | Tambah `submission_end_date` (DateTime), `evaluation_end_date` (DateTime). `end_date` tetap ada sebagai penutup ANNOUNCEMENT phase. |
| 13.1.2 | Helper `get_current_phase(period, now)` | Pure function, derived — return `UPCOMING/SUBMISSION/EVALUATION/ANNOUNCEMENT/CLOSED`. Taruh di `utils/period_utils.py` atau dalam model sebagai property. |
| 13.1.3 | Alembic migration | Add dua kolom baru. Handle nullable untuk compat data lama. |
| 13.1.4 | Update `POST /api/periods` + `PUT /api/periods/{id}` | Validasi: `start_date < submission_end_date < evaluation_end_date < end_date`. |
| 13.1.5 | Update `GET /api/periods/active` response | Tambah field `current_phase` dan `phases` (object berisi semua tanggal). |

**Milestone:** Model baru live, `current_phase` bisa di-consume frontend.

---

### Task 13.2 — Backend Enforcement (Session 2)

| # | Task | Detail |
|---|---|---|
| 13.2.1 | Submit lock update | Cek `current_phase == SUBMISSION` (bukan sekadar `is_active`). Return 403 dengan pesan phase-aware. |
| 13.2.2 | Evaluate batch — soft warn | Jika phase bukan `EVALUATION`, tetap proses tapi response include `warning: "Di luar window evaluasi"`. |
| 13.2.3 | Bulk announce lock | `POST /api/announcements/bulk` hanya bisa di phase `ANNOUNCEMENT`. Return 403 di luar itu. Super Admin bypass. |
| 13.2.4 | Super Admin phase override | `PUT /api/periods/{id}` bisa update `submission_end_date` / `evaluation_end_date` / `end_date` kapan saja untuk extend atau cut short. |
| 13.2.5 | `GET /api/periods/active` soft-prompt flag | Tambah field `evaluation_prompt: bool` — True jika phase baru masuk EVALUATION (untuk trigger banner di RecruiterDashboard). |

**Milestone:** Phase enforcement aktif di backend. Submit/announce terkunci sesuai phase.

---

### Task 13.3 — Frontend Phase-Aware Update (Session 3)

| # | Task | Detail |
|---|---|---|
| 13.3.1 | `DashboardPage` countdown kontekstual | Phase SUBMISSION → countdown ke `submission_end_date`. Phase EVALUATION → "Sedang dalam tahap evaluasi". Phase ANNOUNCEMENT → "Pengumuman sedang berlangsung". CLOSED → "Periode telah berakhir". |
| 13.3.2 | Recruitment Journey tracker — highlight aktif | Step yang sesuai `current_phase` di-highlight aktif (bukan semua green). Submitted ✅, AI Screening aktif saat EVALUATION, dst. |
| 13.3.3 | RecruiterDashboard — evaluation prompt banner | Jika `evaluation_prompt == true` dari API, tampilkan banner: *"Submission period telah berakhir. Jalankan evaluasi sekarang?"* per divisi. |
| 13.3.4 | RecruiterDashboard — phase-aware UI state | Tombol "Run Evaluation" + "Publish Hasil" disabled dengan tooltip jika di luar phase yang tepat. Super Admin tidak kena disable. |
| 13.3.5 | `RecruitmentPeriodPage` (`/admin/periods`) update | Form create/edit period dengan 4 tanggal. Validasi urutan tanggal di frontend. Tampilkan current phase badge per periode di list. |

**Milestone:** UI sepenuhnya kontekstual terhadap phase aktif.

---

## Task 14 — Hardening & Deprecation

| # | Task | Detail |
|---|---|---|
| 14.1 | Division enum validation | `EvaluateBatchRequest`: ganti `division: str` → `division: Division` |
| 14.2 | Rubric type safety | `Rubric.division`: `String(20)` → `Enum(Division)` + migration |
| 14.3 | Audit log score override | `candidates.py`: log setiap `is_override=True` |
| 14.4 | Deprecate legacy endpoints | Header `Deprecation: true` + log warning di `/api/upload` dan `/api/evaluate` |
| 14.5 | Smoke tests update | Cover Period phases + phase enforcement + bulk announce |

---

## 5. API Design (Phase 2 Additions)

### RecruitmentPeriod Endpoints

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| `POST` | `/api/periods` | Super Admin | Buat periode baru, auto-deactivate yang lain |
| `GET` | `/api/periods/active` | Public | Get periode aktif (untuk countdown) |
| `GET` | `/api/periods` | Super Admin | List semua periode |
| `PUT` | `/api/periods/{id}` | Super Admin | Edit periode |
| `PUT` | `/api/periods/{id}/close` | Super Admin | Tutup periode lebih awal |

### Announcement Bulk Endpoint

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| `POST` | `/api/announcements/bulk` | Recruiter+ | Bulk pass/fail per divisi + period |

### Evaluation Update

| Method | Endpoint | Role | Notes |
|--------|----------|------|-------|
| `POST` | `/api/recruiter/evaluate/batch` | Recruiter+ | Updated: `division` now typed as `Division` enum |
| `GET` | `/api/recruiter/applications` | Recruiter+ | Updated: returns `rank`, `is_recommended` fields |

---

## 6. Frontend Pages (Phase 2 Additions)

| Page | Route | Role | Key Elements |
|------|-------|------|-------------|
| **Recruitment Periods** | `/admin/periods` | Super Admin | Form create/edit period, threshold_n, list + status badge |
| **RecruiterDashboard** (update) | `/recruiter` | Recruiter | Tambah: checkbox per row, threshold highlight, "Publish Hasil" button |

Existing pages yang di-update:
- `DashboardPage.jsx` — countdown dari `/api/periods/active` (ganti hardcode)
- `AdminPage.jsx` — tambah link ke `/admin/periods`
- `RecruiterDashboard.jsx` — checkbox + highlight + bulk publish flow

---

## 7. Environment & Config

Tambahan `.env` untuk Phase 2:

```env
# Tidak ada env baru yang wajib untuk Phase 2.
# VITE_RECRUITMENT_DEADLINE removed in Batch 5 — CountdownCard now reads
# /api/periods/active.
```

Tambahan dependencies:
```
# Tidak ada dependency baru untuk Phase 2
# BackgroundTasks sudah built-in di FastAPI
```

---

## 8. Deployment Plan

Sama seperti sebelumnya. Phase 3 target:

| Service | Platform | Notes |
|---|---|---|
| Backend | VPS lab (self-hosted) | `uvicorn` di belakang Nginx/Caddy, dikelola systemd |
| Frontend | VPS lab (self-hosted) | `npm run build` → static assets disajikan oleh reverse proxy yang sama |
| Database | SQLite → PostgreSQL self-hosted di VPS lab | Instalasi & konfigurasi manual |
| File Storage | Disk lokal VPS (`uploads/`) | Backup manual / volume snapshot |

---

## 9. Risk & Mitigation

| Risk | Impact | Mitigasi |
|------|--------|----------|
| BackgroundTask gagal (NER crash) | anonymized_text null, evaluasi fallback ke inline NER | Log error, evaluasi tetap jalan dengan inline fallback |
| Period active constraint race condition | Dua period aktif bersamaan | DB-level: add unique constraint WHERE is_active=True via partial index |
| Bulk announce partial failure | Sebagian kandidat ter-announce, sebagian tidak | Wrap dalam DB transaction — rollback semua jika ada error |
| Candidate submit saat periode hampir tutup | Background NER belum selesai saat evaluasi dimulai | Check anonymized_text, fallback ke inline; log warning |
| Threshold berubah setelah evaluasi jalan | Highlight berubah tapi kandidat sudah di-announce | Threshold hanya visual — tidak affect announced status |

---

## 10. Post-Phase-3 Backlog

| Item | Notes |
|------|-------|
| OCR untuk KTM gambar | Tesseract via pytesseract |
| Notifikasi email | Kandidat notif saat status berubah |
| xai.py implementation | Stub saat ini, justifikasi sudah di dimension_scores |
| Non-EPrT certificate support | TOEFL ITP, IELTS, ECCT |
| Analytics dashboard | Statistik agregat per divisi |
| Code splitting frontend | React.lazy untuk bundle > 500KB |
| PostgreSQL migration | Bila resource server lab memadai |
| Peer review status | Tambah ke ApplicationStatus enum jika dibutuhkan |
| Hapus legacy endpoints | Setelah Lab pipeline confirmed stable |
