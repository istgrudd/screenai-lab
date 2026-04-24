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
| Phase 0 | Fork & cleanup dari repo Capstone (screenai) | ✅ Complete |
| Phase 1 | Candidate Portal MVP (Auth + Upload + Status) | 🔄 In Progress |
| Phase 2 | Full Recruitment Flow (AI Eval + Pengumuman + RBAC) | 📋 Planned |
| Phase 3 | Deployment (VPS lab / cloud) | 📋 Planned |

---

## Table of Contents

1. [Phase 0 Summary](#1-phase-0-summary)
2. [Perubahan dari Capstone](#2-perubahan-dari-capstone)
3. [Architecture (Phase 1)](#3-architecture-phase-1)
4. [Project Structure](#4-project-structure)
5. [Phase 1 Breakdown](#5-phase-1-breakdown)
6. [Phase 2 Breakdown](#6-phase-2-breakdown)
7. [API Design](#7-api-design)
8. [Frontend Pages](#8-frontend-pages)
9. [Document Processors](#9-document-processors)
10. [Environment & Config](#10-environment--config)
11. [Deployment Plan](#11-deployment-plan)
12. [Risk & Mitigation](#12-risk--mitigation)

---

## 1. Phase 0 Summary

Fork dari `istgrudd/screenai` ke `istgrudd/screenai-lab` menggunakan metode `--mirror` (bukan GitHub fork biasa). Seluruh commit history terbawa, kedua repo bersifat independen sepenuhnya.

Cleanup yang sudah / harus dilakukan setelah fork:

- ✅ Repository baru dibuat: `https://github.com/istgrudd/screenai-lab`
- ⬜ Ganti nama project di `README.md`, `package.json`
- ⬜ Buat `.env` baru (jangan pakai `.env` dari Capstone)
- ⬜ Reset / hapus database SQLite lama
- ⬜ Hapus data ChromaDB lama (vector store)
- ⬜ Update branding: "ScreenAI" → "ScreenAI Lab" di seluruh codebase

---

## 2. Perubahan dari Capstone

### Yang DIPERTAHANKAN persis dari Capstone

- Pipeline ekstraksi PDF (PyMuPDF)
- NER anonymization (IndoBERT)
- RAG pipeline (LangChain + ChromaDB + DeepSeek V3)
- Rubrik 4 divisi (Big Data, Cyber Security, Game Technology, GIS)
- Batch processing endpoint
- Dashboard rekruter (ranking, detail, override, reveal identity)
- EPrT certificate bonus scoring
- Score override

### Yang DITAMBAHKAN di Lab

- Candidate Portal (auth + profile + upload + status)
- KHS Parser (ekstrak IPK + mata kuliah relevan)
- KTM Validator (rule-based NIM Telkom verification)
- SWOT Highlight panel (tidak di-score, hanya ditampilkan)
- Dokumen Pendukung (PDF checklist manual rekruter)
- Multi-step document upload flow
- Submission flow (irreversible final submit)
- Recruitment journey tracker untuk kandidat
- Pengumuman hasil seleksi (Phase 2)

### Yang DIMODIFIKASI

- UI style kandidat: mengikuti Academic Luminary mockup
- Database schema: tambah tabel `users`, `applications`, `documents`, `audit_logs`
- Auth: JWT untuk semua role (Capstone tidak punya auth)
- File storage: upload dokumen disimpan lokal server (bukan hanya di-process langsung)

### Yang DIHAPUS dari Capstone

- Generator pertanyaan wawancara (tidak diprioritaskan di Lab)
- Setup multi-user tanpa auth (semua route sekarang protected)

---

## 3. Architecture (Phase 1)

```
┌──────────────────────────────────────────────────────────────┐
│               FRONTEND (React + Vite)                         │
│  Tailwind CSS + shadcn/ui  |  Academic Luminary style         │
│                                                               │
│  Public:     /login  /register                                │
│  Candidate:  /dashboard  /profile  /documents  /review       │
│              /status  /result                                 │
│  Recruiter:  /recruiter  /recruiter/candidates/:id            │
│              /recruiter/rubrics                               │
│  Super Admin: /admin/users  /admin/rubrics                    │
└──────────────────────────┬───────────────────────────────────┘
                            │ REST API (JSON) + Authorization: Bearer <token>
┌──────────────────────────▼───────────────────────────────────┐
│                   BACKEND (FastAPI)                            │
│                                                               │
│  Auth Middleware (JWT verify + role check)                    │
│                                                               │
│  ┌────────────┐  ┌─────────────┐  ┌──────────────────────┐  │
│  │ Doc Upload │  │ KTM Valid.  │  │  RAG Pipeline        │  │
│  │ (FastAPI)  │  │ KHS Parser  │  │  (LangChain)         │  │
│  └────────────┘  └─────────────┘  └──────────────────────┘  │
│                                                               │
│  ┌─────────────┐  ┌────────────────────────────────────────┐ │
│  │ NER Anonym. │  │ DeepSeek V3 (LLM Inference)            │ │
│  │ (IndoBERT)  │  └────────────────────────────────────────┘ │
│  └─────────────┘                                             │
│                                                               │
│  DB: SQLite  |  Vector Store: ChromaDB  |  Files: /uploads   │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. Project Structure

File dan folder baru yang ditambahkan ke struktur existing Capstone:

```
backend/
├── models/
│   ├── user.py              # User, Role enum (NEW)
│   ├── application.py       # Application, ApplicationStatus (NEW)
│   ├── document.py          # Document, DocumentType enum (NEW)
│   └── audit.py             # AuditLog (NEW)
├── routers/
│   ├── auth.py              # POST /api/auth/register, /login, /logout (NEW)
│   ├── users.py             # Super Admin user management (NEW)
│   ├── applications.py      # Candidate application CRUD (NEW)
│   ├── documents.py         # Upload + retrieve per-document (NEW)
│   └── announcements.py     # Publish + get hasil seleksi (NEW, Phase 2)
├── services/
│   ├── auth_service.py      # JWT creation, bcrypt hashing (NEW)
│   ├── khs_parser.py        # Ekstrak IPK + mata kuliah dari PDF KHS (NEW)
│   ├── ktm_validator.py     # Rule-based NIM Telkom verification (NEW)
│   └── swot_extractor.py    # Text extraction dari PDF SWOT (NEW)
├── middleware/
│   └── auth_middleware.py   # JWT verify + role guard (NEW)
├── utils/
│   ├── security.py          # bcrypt helpers (NEW)
│   └── file_storage.py      # Simpan + retrieve uploaded files lokal (NEW)
└── uploads/                 # Folder penyimpanan dokumen kandidat (NEW)
    └── {application_id}/
        ├── cv.pdf
        ├── khs.pdf
        ├── ktm.pdf
        ├── motivation_letter.pdf
        ├── swot.pdf
        └── supporting_docs.pdf

frontend/src/
├── pages/
│   ├── candidate/
│   │   ├── DashboardPage.jsx         # Progress + checklist + countdown (NEW)
│   │   ├── ProfilePage.jsx           # Personal info + division selection (NEW)
│   │   ├── DocumentsPage.jsx         # Multi-step upload center (NEW)
│   │   ├── ReviewPage.jsx            # Review & finalize + final checklist (NEW)
│   │   ├── SubmittedPage.jsx         # Confirmation + recruitment journey (NEW)
│   │   └── ResultPage.jsx            # Application result + AI scores (NEW, Phase 2)
│   ├── recruiter/
│   │   ├── RecruiterDashboard.jsx    # Daftar pelamar + doc completeness (MODIFIED)
│   │   └── CandidateDetail.jsx       # Detail + SWOT highlight + manual checklist (MODIFIED)
│   ├── admin/
│   │   └── AdminPage.jsx             # User management (NEW)
│   ├── LoginPage.jsx                 # (NEW)
│   └── RegisterPage.jsx              # (NEW)
├── components/
│   ├── ProtectedRoute.jsx            # Route guard by role (NEW)
│   ├── DocumentUploadStep.jsx        # Single step upload component (NEW)
│   ├── DocumentChecklist.jsx         # Checklist status per dokumen (NEW)
│   ├── SwotHighlightPanel.jsx        # Read-only SWOT display (NEW)
│   └── RecruitmentJourney.jsx        # Timeline tracker (NEW)
└── lib/
    ├── auth.js                       # Token storage + auth helpers (NEW)
    └── api.js                        # Axios instance + interceptors (NEW/MODIFIED)
```

---

## 5. Phase 1 Breakdown

### Task 1 — Cleanup & Branding (Sebelum Mulai)

| # | Task | Detail |
|---|------|--------|
| 0.1 | Ganti branding | Replace semua "ScreenAI" → "ScreenAI Lab" di README, package.json, dan UI |
| 0.2 | Buat `.env` baru | Copy dari `.env.example`, isi ulang semua nilai |
| 0.3 | Reset database | Hapus `screenai.db`, buat ulang dengan schema baru |
| 0.4 | Reset ChromaDB | Hapus vector store lama di `/chroma_db` |

**Milestone:** Codebase bersih, tidak ada sisa data Capstone.

---

### Task 2 — Database Schema Baru (Week 1)

| # | Task | Detail |
|---|------|--------|
| 1.1 | Model `User` | `id, email, password_hash, full_name, nim, faculty, major, year, role (enum: super_admin/recruiter/candidate), is_active, created_at` |
| 1.2 | Model `Application` | `id, user_id, division (enum: big_data/cyber_security/game_tech/gis), status (enum: draft/submitted/screening/announced), submitted_at, created_at` |
| 1.3 | Model `Document` | `id, application_id, doc_type (enum: cv/khs/ktm/motivation_letter/swot/supporting_docs), file_path, file_name, file_size, uploaded_at, is_verified (untuk supporting_docs)` |
| 1.4 | Model `AuditLog` | `id, recruiter_id, candidate_id, action_type, old_value, new_value, reason, timestamp` |
| 1.5 | Alembic migration | Setup Alembic, buat initial migration dari schema baru |

**Milestone:** Schema baru jalan di SQLite lokal.

---

### Task 3 — Auth Backend (Week 1)

| # | Task | Detail |
|---|------|--------|
| 2.1 | `auth_service.py` | bcrypt hashing, JWT create/verify (python-jose) |
| 2.2 | `POST /api/auth/register` | Candidate only, validasi NIM format Telkom (10 digit: `10305XXXXXXX`) |
| 2.3 | `POST /api/auth/login` | Semua role, return `{ token, user }` |
| 2.4 | `POST /api/auth/logout` | Invalidate token (blacklist atau client-side) |
| 2.5 | `GET /api/auth/me` | Return current user info |
| 2.6 | `auth_middleware.py` | `get_current_user()` + `require_role(role)` sebagai FastAPI dependency |
| 2.7 | Protect existing routes | Apply role guard ke semua route existing (evaluate, override, rubrics) |

**Milestone:** Register + login + protected routes berjalan.

---

### Task 4 — Application & Document Backend (Week 2)

| # | Task | Detail |
|---|------|--------|
| 3.1 | `POST /api/applications` | Buat application baru (candidate only, satu per periode) |
| 3.2 | `GET /api/applications/my` | Get application milik candidate yang login |
| 3.3 | `POST /api/documents/upload/{doc_type}` | Upload satu dokumen, simpan ke `/uploads/{app_id}/`, update record di DB |
| 3.4 | `GET /api/documents/{application_id}` | List semua dokumen per application (untuk kandidat & rekruter) |
| 3.5 | `PUT /api/documents/{doc_id}/replace` | Replace dokumen sebelum submit final |
| 3.6 | `POST /api/applications/{id}/submit` | Submit final — validasi semua D-01 s/d D-06 ada, ubah status ke `submitted`, lock dokumen |
| 3.7 | `file_storage.py` | Helper: simpan file ke disk, generate secure path, validasi mime type + size |

**Milestone:** Kandidat bisa upload semua dokumen dan submit.

---

### Task 5 — Auth & Upload Frontend (Week 2–3)

| # | Task | Detail |
|---|------|--------|
| 4.1 | `LoginPage.jsx` | Form email + password, link ke register |
| 4.2 | `RegisterPage.jsx` | Form nama, email, password, NIM, fakultas, jurusan, angkatan — auto-assign role Candidate |
| 4.3 | `auth.js` | Token storage (localStorage), helper `getToken()`, `isAuthenticated()`, `getUserRole()` |
| 4.4 | `api.js` | Axios instance, auto-attach Authorization header, 401 interceptor → redirect login |
| 4.5 | `ProtectedRoute.jsx` | HOC untuk guard route by role, redirect jika unauthorized |
| 4.6 | `ProfilePage.jsx` | Personal Info form + Division Selection (card-based, 4 divisi) |
| 4.7 | `DocumentsPage.jsx` | Multi-step upload: step 1 CV → 2 Motivation Letter → 3 KHS → 4 KTM → 5 SWOT → 6 Dokumen Pendukung. Progress tracker di atas. |
| 4.8 | `DocumentUploadStep.jsx` | Reusable component: drag & drop zone, file validation, preview nama file, replace button |
| 4.9 | `ReviewPage.jsx` | Ringkasan profil + daftar dokumen uploaded + warning irreversible + 3 checkbox konfirmasi |
| 4.10 | `SubmittedPage.jsx` | Halaman konfirmasi submit: verified icon, status "Waiting for AI Screening", recruitment journey tracker, reference ID |

**Milestone:** Full flow kandidat: register → login → profile → upload → review → submit → status.

---

### Task 6 — Dashboard Kandidat & Rekruter (Week 3)

| # | Task | Detail |
|---|------|--------|
| 5.1 | `DashboardPage.jsx` (Candidate) | Progress % aplikasi, checklist dokumen (status per item), countdown deadline, info divisi dipilih |
| 5.2 | `RecruiterDashboard.jsx` (update) | Tambahkan kolom: divisi, status submit, kelengkapan dokumen (%) per kandidat |
| 5.3 | `CandidateDetail.jsx` (update) | Tambahkan: preview/download per dokumen, checklist manual Dokumen Pendukung (toggle verified) |
| 5.4 | `GET /api/recruiter/applications` | List semua aplikasi yang sudah submitted, dengan filter divisi + status |
| 5.5 | `PUT /api/documents/{id}/verify` | Recruiter toggle verified status untuk Dokumen Pendukung (D-06) |

**Milestone:** Rekruter bisa lihat semua pelamar, dokumen mereka, dan verifikasi manual Dokumen Pendukung.

---

## 6. Phase 2 Breakdown

### Task 7 — Document Processors Baru (Week 4–5)

| # | Task | Detail |
|---|------|--------|
| 6.1 | `khs_parser.py` | PyMuPDF extraction + regex pattern matching format KHS Telkom University. Output: `{ ipk, total_sks, relevant_courses[] }` |
| 6.2 | `ktm_validator.py` | Regex matching NIM Telkom (`103XXXXXXXXXXX`), ekstrak nama + prodi. Output: `{ valid, nim, name, faculty, major }` |
| 6.3 | `swot_extractor.py` | PyMuPDF text extraction dari PDF SWOT. Output: plain text untuk ditampilkan sebagai highlight |
| 6.4 | Integrasi ke RAG pipeline | KHS data (IPK + mata kuliah) ditambahkan ke context CV + Motivation Letter sebelum masuk RAG |
| 6.5 | `SwotHighlightPanel.jsx` | Panel read-only di CandidateDetail, tampilkan teks SWOT yang diekstrak |

---

### Task 7.5 — Screening Bridge: Portal → Pipeline (Week 5)

Menghubungkan data dari Candidate Portal (tabel `applications` + `documents`) ke AI Pipeline (tabel `candidates` + `candidate_documents`). Tanpa bridge ini, kandidat yang submit melalui portal tidak terdeteksi oleh evaluation pipeline.

| # | Task | Detail |
|---|------|--------|
| 6.6 | `screening_bridge.py` | Service bridge yang dijalankan sebagai pre-processing saat recruiter klik "Run Evaluation". Memetakan `application.division` → `rubric.id`, membuat record `Candidate` + `CandidateDocument` |
| 6.7 | CV processing | Extract (PyMuPDF) → Normalize → Anonymize (IndoBERT NER + regex) → simpan `anonymized_text` ke `candidate_documents` (doc_type="cv") |
| 6.8 | Motivation Letter processing | Extract → Normalize → Anonymize → simpan `anonymized_text` ke `candidate_documents` (doc_type="motivation_letter") |
| 6.9 | Idempotency | Cek existing `Candidate(user_id, rubric_id)` agar tidak duplikasi jika "Run Evaluation" diklik ulang |
| 6.10 | Status update | Setelah bridge berhasil, update `application.status` → `SCREENING` |

**Pipeline blind screening:**
```
CV (PDF) ──→ extract → normalize → anonymize_text() → [PERSON_1], [ORG_1], [LOC_1]
Motiv. Letter (PDF) ──→ extract → normalize → anonymize_text() → [PERSON_1], [ORG_1]
                                                    ↓
                              candidate_documents.anonymized_text
                                                    ↓
                              RAG Pipeline (hanya terima teks anonim)
```

**Milestone:** Recruiter klik "Run Evaluation" → kandidat portal otomatis ter-bridge → evaluasi jalan.

---

### Task 8 — Full Evaluation Flow (Week 5–6)

| # | Task | Detail |
|---|------|--------|
| 7.1 | `POST /api/evaluate` | Bridge (Task 7.5) + jalankan RAG pipeline untuk semua candidates status "anonymized" per rubric |
| 7.2 | Multi-doc evaluation | Gabungkan anonymized CV + Motivation Letter sebagai satu context untuk RAG |
| 7.3 | Update pipeline prompt | Instruksikan LLM mengevaluasi CV **dan** Motivation Letter. Sertakan data KHS (IPK + mata kuliah relevan) sebagai konteks tambahan |
| 7.4 | Update result schema | Tambah field `khs_summary`, `ktm_valid`, `swot_text` ke result JSON |
| 7.5 | `ResultPage.jsx` | AI Score Summary per dimensi (progress bar), recruitment journey timeline, schedule interview button |

---

### Task 9 — Pengumuman & RBAC Lengkap (Week 6–7)

| # | Task | Detail |
|---|------|--------|
| 8.1 | `POST /api/announcements` | Recruiter publish hasil seleksi administrasi per divisi (lolos/tidak lolos per kandidat) |
| 8.2 | `GET /api/announcements/my` | Candidate get status pengumuman miliknya |
| 8.3 | Update `ApplicationStatus` | Tambah status `announced_pass` dan `announced_fail` |
| 8.4 | Update `ResultPage.jsx` | Tampilkan hasil pengumuman (PASSED / NOT PASSED) dengan recruitment journey tracker |
| 8.5 | `AdminPage.jsx` | Super Admin: tabel user, change role, deactivate account |
| 8.6 | `GET/PUT /api/users` | Super Admin only: list users, update role |

---

## 7. API Design

### Auth Endpoints

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/register` | Public | Register sebagai candidate |
| `POST` | `/api/auth/login` | Public | Login, return JWT |
| `POST` | `/api/auth/logout` | Auth | Logout |
| `GET` | `/api/auth/me` | Auth | Get current user |

### Application Endpoints

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| `POST` | `/api/applications` | Candidate | Buat application baru |
| `GET` | `/api/applications/my` | Candidate | Get application milik sendiri |
| `POST` | `/api/applications/{id}/submit` | Candidate | Submit final (lock) |
| `GET` | `/api/recruiter/applications` | Recruiter+ | List semua submitted applications |

### Document Endpoints

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| `POST` | `/api/documents/upload/{doc_type}` | Candidate | Upload satu dokumen |
| `GET` | `/api/documents/{application_id}` | Auth | List dokumen per application |
| `PUT` | `/api/documents/{id}/replace` | Candidate | Replace sebelum submit |
| `GET` | `/api/documents/{id}/file` | Auth | Download/preview file |
| `PUT` | `/api/documents/{id}/verify` | Recruiter+ | Toggle verified (Dok. Pendukung) |

### Evaluation Endpoints (Phase 2)

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| `POST` | `/api/recruiter/evaluate/batch` | Recruiter+ | Run AI evaluation batch |
| `GET` | `/api/recruiter/results/{application_id}` | Recruiter+ | Get evaluation result |
| `PUT` | `/api/recruiter/results/{id}/override` | Recruiter+ | Override skor |
| `POST` | `/api/announcements` | Recruiter+ | Publish hasil seleksi |
| `GET` | `/api/announcements/my` | Candidate | Get status pengumuman |

### Admin Endpoints

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| `GET` | `/api/users` | Super Admin | List semua users |
| `PUT` | `/api/users/{id}/role` | Super Admin | Update role |
| `PUT` | `/api/users/{id}/deactivate` | Super Admin | Deactivate account |

---

## 8. Frontend Pages

### Candidate Pages

| Page | Route | Key Elements |
|------|-------|-------------|
| **Login** | `/login` | Email + password, link ke register |
| **Register** | `/register` | Nama, email, password, NIM, fakultas, jurusan, angkatan |
| **Dashboard** | `/dashboard` | Progress %, checklist dokumen, countdown deadline, status aplikasi |
| **Profile** | `/profile` | Personal info form + division selection (4 card) |
| **Documents** | `/documents` | Multi-step upload (6 steps) + progress tracker |
| **Review** | `/review` | Summary profil + daftar dokumen + warning + 3 checkbox |
| **Submitted** | `/submitted` | Konfirmasi + recruitment journey tracker + reference ID |
| **Result** | `/result` | AI Score Summary + recruitment journey (Phase 2) |

### Recruiter Pages

| Page | Route | Key Elements |
|------|-------|-------------|
| **Dashboard** | `/recruiter` | Daftar pelamar, filter divisi, status kelengkapan |
| **Candidate Detail** | `/recruiter/candidates/:id` | Semua dokumen, SWOT highlight, manual checklist Dok. Pendukung, skor XAI (Phase 2) |
| **Rubrics** | `/recruiter/rubrics` | CRUD rubrik per divisi (dari Capstone) |

### Admin Pages

| Page | Route | Key Elements |
|------|-------|-------------|
| **Admin Panel** | `/admin/users` | Tabel user, role badge, change role, deactivate |

---

## 9. Document Processors

### KHS Parser

```python
# Input: PDF file path
# Output:
{
  "ipk": 3.75,
  "total_sks": 120,
  "relevant_courses": [
    {"name": "Machine Learning", "grade": "A", "semester": 5},
    {"name": "Big Data Analytics", "grade": "B+", "semester": 6}
  ]
}
# Method: PyMuPDF + regex pattern untuk format KHS Telkom University
# Catatan: test dulu dengan sample KHS Telkom sebelum deploy
```

### KTM Validator

```python
# Input: PDF atau image file path
# Output:
{
  "valid": True,
  "nim": "1030523XXXXX",
  "name": "[ANONYMIZED]",
  "faculty": "Fakultas Informatika",
  "major": "Data Science",
  "year": "2023"
}
# Method: rule-based regex matching format NIM Telkom (103XXXXXXXXXX, 13 digit)
# NIM tidak dianonimkan karena digunakan untuk verifikasi, bukan penilaian
```

### SWOT Extractor

```python
# Input: PDF file path
# Output: plain text (seluruh konten SWOT)
# Method: PyMuPDF simple text extraction
# Tidak diproses AI — hanya ditampilkan sebagai highlight di CandidateDetail
```

---

## 10. Environment & Config

```env
# App
APP_NAME=ScreenAI Lab
ENVIRONMENT=development

# Auth
SECRET_KEY=your-screenai-lab-secret-key-min-32-chars
ACCESS_TOKEN_EXPIRE_MINUTES=480

# Database
DATABASE_URL=sqlite:///./screenai_lab.db

# DeepSeek LLM
DEEPSEEK_API_KEY=your-deepseek-api-key
DEEPSEEK_BASE_URL=https://api.deepseek.com

# File Storage
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=10

# CORS
ALLOWED_ORIGINS=http://localhost:5173

# ChromaDB
CHROMA_PERSIST_DIR=./chroma_db_lab
```

Dependencies tambahan (di atas Capstone):

```
python-jose[cryptography]>=3.3.0
passlib[bcrypt]>=1.7.4
python-multipart>=0.0.9   # untuk file upload FastAPI
alembic>=1.13.0           # DB migrations
```

---

## 11. Deployment Plan

### Target Stack (Phase 3)

| Service | Platform | Notes |
|---|---|---|
| Backend | VPS lab atau Railway | Auto-deploy dari GitHub |
| Frontend | Vercel | Free tier, auto-deploy |
| Database | SQLite → PostgreSQL (bila resource memadai) | Migration via Alembic |
| File Storage | Server local (VPS) atau object storage | Dokumen kandidat |

### Catatan Resource

SQLite digunakan untuk development dan production awal mengingat keterbatasan resource server lab. Migrasi ke PostgreSQL dilakukan bila traffic dan volume rekrutasi meningkat.

---

## 12. Risk & Mitigation

| Risk | Impact | Kemungkinan | Mitigasi |
|------|--------|-------------|----------|
| Format KHS Telkom berubah antar periode | KHS Parser gagal ekstrak | Sedang | Test dengan sample KHS dari beberapa periode; buat parser toleran terhadap variasi layout |
| KTM tidak bisa di-extract teks (hasil scan) | KTM Validator tidak bisa baca NIM | Sedang | Fallback: manual input NIM saat registrasi, KTM tetap diupload untuk verifikasi visual |
| Storage server lab penuh | Upload dokumen gagal | Rendah | Set max file size per dokumen; tambah cleanup job untuk application yang expired |
| Kandidat upload dokumen orang lain | Integritas data | Sedang | KTM validator cocokkan NIM dengan NIM registrasi; flag mismatch untuk review manual |
| Concurrent submission saat deadline | Server overload | Rendah | Test load sebelum periode rekrutasi; pertimbangkan async queue jika perlu |
| JWT token theft | Unauthorized access | Rendah | httpOnly cookie, expiry 8 jam, logout invalidation |

---

## 13. Post-Phase-3 Backlog

| Item | Notes |
|------|-------|
| Notifikasi email | Notify kandidat saat status berubah (submitted, announced) |
| Periode rekrutasi management | Admin bisa buka/tutup periode rekrutasi, set deadline |
| Non-EPrT certificate support | TOEFL ITP, IELTS, ECCT |
| OCR support | Untuk KTM yang berbasis scan/gambar |
| Analytics dashboard | Rekruter lihat statistik agregat per divisi |
| Mobile responsiveness polish | Optimasi untuk akses via HP saat pameran atau open house lab |
