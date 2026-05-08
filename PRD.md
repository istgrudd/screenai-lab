# Product Requirements Document (PRD)
## ScreenAI Lab — Sistem Screening Rekrutasi Otomatis untuk MBC Laboratory
## Telkom University

---

## Phase Status

| Phase | Scope | Status |
|---|---|---|
| **Phase 1 — Candidate Portal MVP** | Platform pendaftaran + upload dokumen + dashboard kandidat | ✅ Complete |
| **Phase 2 — Full Recruitment Flow** | Evaluasi AI + NER submit-time + periode rekrutmen + seleksi manual rekruter | 🔄 In Progress |
| **Phase 3 — Deployment** | VPS lab / cloud hosting + production config | 📋 Planned |

---

## 1. Overview

### 1.1 Ringkasan Produk

ScreenAI Lab adalah fork dari ScreenAI (Capstone) yang diadaptasi untuk kebutuhan rekrutasi internal MBC Laboratory, Telkom University. Platform ini mengintegrasikan tiga mekanisme utama yang diwarisi dari Capstone — **Blind Screening** berbasis NER, **Evaluasi Kompetensi** berbasis RAG, dan **Explainable AI (XAI)** — dengan penambahan **Candidate Portal** sebagai platform pendaftaran dan pengumpulan dokumen end-to-end, serta dukungan dokumen tambahan yang spesifik untuk konteks rekrutasi lab mahasiswa.

### 1.2 Perbedaan dengan ScreenAI (Capstone)

| Aspek | ScreenAI (Capstone) | ScreenAI Lab |
|---|---|---|
| Target pengguna | Perusahaan umum | MBC Laboratory, Telkom University |
| Dokumen input | CV + sertifikat EPrT | CV + KHS + KTM + Motivation Letter + SWOT + Dokumen Pendukung |
| Candidate portal | Phase 2 (planned) | Phase 1 MVP ✅ Complete |
| NER timing | Saat upload / evaluasi | Saat submit (background task) |
| Periode rekrutmen | Tidak ada | Super Admin kelola via platform |
| Penentuan kelulusan | Tidak ada | Rekruter checklist manual + bulk publish |
| Database | SQLite → PostgreSQL | SQLite → PostgreSQL (sesuai resource lab) |
| Branding | ScreenAI | ScreenAI Lab |
| UI style | Dashboard rekruter | Academic Luminary style |

### 1.3 Masalah yang Diselesaikan

1. Proses pendaftaran rekrutasi lab masih manual (Google Form + email) → tidak terintegrasi dengan sistem evaluasi.
2. Pengumpulan dokumen tersebar di berbagai platform → sulit dikelola rekruter.
3. Tidak ada transparansi bagi kandidat soal status lamaran mereka.
4. Evaluasi manual rentan bias dan tidak konsisten antar rekruter.
5. Tidak ada manajemen periode rekrutmen yang terintegrasi dengan sistem.

---

## 2. Ruang Lingkup

### Phase 1 — Candidate Portal MVP (✅ Complete)

- Registrasi dan login kandidat (JWT-based).
- Form profil mahasiswa (Nama, NIM, Fakultas, Jurusan, Angkatan).
- Pemilihan divisi/posisi (Big Data, Cyber Security, Game Technology, GIS).
- Upload multi-dokumen dengan zona terpisah per tipe dokumen (6 dokumen).
- Checklist kelengkapan dokumen sebelum submit.
- Halaman status lamaran kandidat (tracking progress + journey tracker).
- Dashboard rekruter: melihat daftar pelamar + status kelengkapan dokumen.
- Submit final dengan konfirmasi (irreversible).
- Super Admin: manajemen user (role, aktivasi/deaktivasi).

### Phase 2 — Full Recruitment Flow (🔄 In Progress)

#### 2A — Submit-time NER (Baru)
- NER anonymization dijalankan otomatis via **BackgroundTask** saat kandidat submit.
- CV + Motivation Letter dianonimkan dan disimpan di DB saat itu juga.
- Saat batch evaluation, NER dilewati jika anonymized text sudah ada (cached).
- Kandidat tidak merasakan delay (NER jalan di background).

#### 2B — Manajemen Periode Rekrutmen (Baru — Super Admin)
- Super Admin membuat dan mengelola **RecruitmentPeriod** dengan empat tanggal batas: `start_date`, `submission_end_date`, `evaluation_end_date`, `end_date`.
- Hanya satu periode aktif pada satu waktu (enforce di transaksi pembuatan / update `is_active=true`).
- Periode aktif memiliki **5 fase yang dihitung dari kalender** (computed, bukan kolom DB):
  - `UPCOMING` — sebelum `start_date`.
  - `SUBMISSION` — kandidat dapat submit (`start_date` ≤ now < `submission_end_date`).
  - `EVALUATION` — rekruter menjalankan evaluasi AI (`submission_end_date` ≤ now < `evaluation_end_date`).
  - `ANNOUNCEMENT` — rekruter publikasikan hasil (`evaluation_end_date` ≤ now < `end_date`).
  - `CLOSED` — periode berakhir (now ≥ `end_date`).
- Sistem otomatis lock submission jika tidak ada periode aktif **atau** fase saat ini bukan `SUBMISSION`.
- **Bulk announce hanya boleh di fase `ANNOUNCEMENT`** (Super Admin dapat bypass untuk koreksi manual).
- Evaluasi di luar fase `EVALUATION` tetap dijalankan, tetapi response berisi `warning` (soft warn — keputusan tetap di tangan rekruter).
- Countdown di dashboard kandidat menyesuaikan fase aktif (countdown ke `submission_end_date` saat SUBMISSION, ke `evaluation_end_date` saat EVALUATION, dst).
- Super Admin dapat menutup periode lebih awal (set `is_active=false` + `end_date=now`).

#### 2C — Evaluasi AI + Seleksi Manual Rekruter (Diperjelas)
- Rekruter menjalankan batch evaluation per divisi.
- Default: kandidat yang sudah memiliki `composite_score` di-skip (cache); rekruter dapat **force re-evaluate** untuk re-score seluruh divisi.
- Filter status `SUBMITTED` selalu berlaku — kandidat di status DRAFT / SCREENING / ANNOUNCED tidak ikut di-evaluate ulang.
- Hasil evaluasi: ranking kandidat + skor per dimensi + justifikasi XAI.
- Super Admin set **threshold highlight**: angka N (misal top 10) sebagai rekomendasi visual.
- Kandidat di atas threshold: **di-highlight hijau** di tabel rekruter (rekomendasi, bukan keputusan).
- Rekruter melakukan **crosscheck manual**: centang kandidat yang lolos.
- Rekruter klik **"Publish Hasil"**: semua yang dicentang → `announced_pass`, sisanya di scope yang sama → `announced_fail`.
- Bulk announce diwrap dalam transaksi DB tunggal dan menulis `AuditLog` (`action_type="bulk_announcement"`) per perubahan status.
- Kandidat melihat hasil di dashboard mereka.

#### 2D — Pipeline Evaluation Update
- Pipeline evaluasi menggunakan NER cached dari submit-time.
- KHS summary block diinjeksikan ke RAG context.
- KTM validation: soft warning, tidak memblokir evaluasi.
- SWOT: highlight only, tidak masuk RAG.
- Legacy Capstone endpoints (`/api/upload`, `/api/evaluate`) di-deprecate.

### Phase 3 — Deployment (📋 Planned)

- Backend deployed ke VPS lab atau Railway/Render.
- Frontend deployed ke Vercel/Netlify.
- Migrasi SQLite → PostgreSQL untuk production.
- Environment variables configured untuk production.
- CORS configured untuk production domain.
- Code splitting frontend (React.lazy) untuk bundle size.
- Audit log lengkap: semua tindakan rekruter (override, announce, verify).

### Out-of-Scope (Semua Phase)

- PDF berbasis scan / gambar (OCR) — kecuali KTM (backlog Phase 3).
- Sertifikat bahasa non-EPrT sebagai standar utama.
- Generator pertanyaan wawancara.
- Notifikasi email otomatis (Phase 3+ backlog).
- Mobile app native.
- Auto-announce berdasarkan threshold (threshold hanya highlight, bukan keputusan otomatis).

---

## 3. Dokumen yang Didukung

| ID | Dokumen | Wajib | Diproses AI | Timing NER | Keterangan |
|---|---|---|---|---|---|
| D-01 | CV (PDF) | ✅ | ✅ RAG + NER | Submit-time (background) | Anonymized text cached di DB |
| D-02 | KHS / Transkrip Nilai (PDF) | ✅ | ✅ Parser khusus | Evaluation-time | IPK + mata kuliah → RAG context |
| D-03 | KTM / Student ID (PDF/JPG) | ✅ | ✅ Rule-based validator | Evaluation-time | Soft warning jika invalid |
| D-04 | Motivation Letter (PDF) | ✅ | ✅ RAG + NER | Submit-time (background) | Anonymized text cached di DB |
| D-05 | Analisis SWOT Diri Sendiri (PDF) | ✅ | ⚠️ Highlight only | — | Tidak di-score, dibaca rekruter |
| D-06 | Dokumen Pendukung (PDF) | ✅ | ❌ Manual checklist | — | Diverifikasi manual rekruter |

---

## 4. Fitur

### Phase 1 Features (✅ Complete)

#### Modul Autentikasi
| ID | Fitur | Role | Status |
|---|---|---|---|
| F-01 | Registrasi akun Candidate | Candidate | ✅ |
| F-02 | Login / Logout (JWT) | All | ✅ |
| F-03 | Route protection per role | All | ✅ |

#### Modul Profil Mahasiswa
| ID | Fitur | Role | Status |
|---|---|---|---|
| F-10 | Form profil: Nama, NIM, Fakultas, Jurusan, Angkatan | Candidate | ✅ |
| F-11 | Pemilihan divisi/posisi (satu pilihan per periode) | Candidate | ✅ |
| F-12 | Edit profil sebelum submit final | Candidate | ✅ |

#### Modul Upload Dokumen
| ID | Fitur | Role | Status |
|---|---|---|---|
| F-20 | Upload CV (PDF, max 5MB) | Candidate | ✅ |
| F-21 | Upload KHS (PDF, max 5MB) | Candidate | ✅ |
| F-22 | Upload KTM (PDF/JPG, max 2MB) | Candidate | ✅ |
| F-23 | Upload Motivation Letter (PDF, max 5MB) | Candidate | ✅ |
| F-24 | Upload SWOT Analysis (PDF, max 5MB) | Candidate | ✅ |
| F-25 | Upload Dokumen Pendukung (PDF, max 10MB) | Candidate | ✅ |
| F-26 | Multi-step upload flow (6 steps + progress tracker) | Candidate | ✅ |
| F-27 | Preview dokumen yang sudah diupload | Candidate | ✅ |
| F-28 | Replace dokumen sebelum submit final | Candidate | ✅ |
| F-29 | Checklist kelengkapan sebelum submit | Candidate | ✅ |

#### Modul Submission & Status
| ID | Fitur | Role | Status |
|---|---|---|---|
| F-30 | Submit Final (irreversible + konfirmasi) | Candidate | ✅ |
| F-31 | Recruitment journey tracker | Candidate | ✅ |
| F-32 | Progress % kelengkapan aplikasi | Candidate | ✅ |
| F-33 | Countdown deadline (dari RecruitmentPeriod, fase-aware) | Candidate | ✅ |
| F-34 | Dashboard: LOLOS/TIDAK LOLOS banner | Candidate | ✅ |

#### Modul Dashboard Rekruter (Phase 1)
| ID | Fitur | Role | Status |
|---|---|---|---|
| F-40 | Daftar pelamar per divisi + kelengkapan dokumen | Recruiter | ✅ |
| F-41 | Preview/download dokumen per kandidat | Recruiter | ✅ |
| F-42 | Checklist manual verifikasi Dokumen Pendukung (D-06) | Recruiter | ✅ |
| F-43 | Filter pelamar berdasarkan divisi dan status | Recruiter | ✅ |

#### Modul Super Admin (Phase 1)
| ID | Fitur | Role | Status |
|---|---|---|---|
| F-60 | Manajemen user: list, change role, activate/deactivate | Super Admin | ✅ |

### Phase 2 Features (🔄 In Progress)

#### 2A — Submit-time NER
| ID | Fitur | Role | Prioritas | Status |
|---|---|---|---|---|
| F-70 | NER anonymization otomatis saat submit (BackgroundTask) | System | Must Have | ✅ |
| F-71 | Cache anonymized text di `candidate_documents` | System | Must Have | ✅ |
| F-72 | Evaluation pipeline skip NER jika cached, fallback inline jika cache miss | System | Must Have | ✅ |

#### 2B — Manajemen Periode Rekrutmen
| ID | Fitur | Role | Prioritas | Status |
|---|---|---|---|---|
| F-80 | Buat / edit / tutup RecruitmentPeriod | Super Admin | Must Have | ✅ |
| F-81 | Set 4 tanggal batas (`start`, `submission_end`, `evaluation_end`, `end`) | Super Admin | Must Have | ✅ |
| F-82 | Satu periode aktif pada satu waktu (enforce app-level di transaksi) | System | Must Have | ✅ |
| F-83 | Lock submission jika periode tidak aktif **atau** fase ≠ SUBMISSION | System | Must Have | ✅ |
| F-84 | Countdown fase-aware di dashboard kandidat dari periode aktif | Candidate | Must Have | ✅ |
| F-85 | Set threshold highlight (top N per divisi) | Super Admin | Should Have | ✅ |
| F-86 | `current_phase` computed property (UPCOMING/SUBMISSION/EVALUATION/ANNOUNCEMENT/CLOSED) | System | Must Have | ✅ |
| F-87 | Bulk announce dikunci ke fase ANNOUNCEMENT (Super Admin bypass) | System | Must Have | ✅ |
| F-88 | Evaluation di luar fase EVALUATION tetap berjalan + soft warning | System | Should Have | ✅ |
| F-89 | `evaluation_prompt` flag pada `/api/periods/active` (banner "submission ended, run evaluation now?") | Recruiter | Should Have | ✅ |

#### 2C — Evaluasi + Seleksi Manual
| ID | Fitur | Role | Prioritas | Status |
|---|---|---|---|---|
| F-50 | Batch evaluation per divisi (NER cached → RAG → LLM) | Recruiter | Must Have | ✅ |
| F-51 | KHS Parser: IPK + mata kuliah → RAG context | System | Must Have | ✅ |
| F-52 | KTM Validator: soft warning (tidak blokir) | System | Must Have | ✅ |
| F-53 | SWOT Highlight panel di detail kandidat | Recruiter | Must Have | ✅ |
| F-54 | Skor per dimensi + justifikasi XAI (dari `DimensionScore.justification`) | Recruiter | Must Have | ✅ |
| F-55 | Ranking kandidat per divisi | Recruiter | Must Have | ✅ |
| F-56 | Override skor (audit log untuk override **belum** diimplementasi — F-101) | Recruiter | Must Have | 🟧 sebagian |
| F-57 | Reveal Identity post-evaluasi | Recruiter | Must Have | ✅ |
| F-58 | Force re-evaluate (`force=true` — re-score kandidat yang sudah punya `composite_score`) | Recruiter | Should Have | ✅ |
| F-59 | Filter `SUBMITTED`-only selalu berlaku saat batch evaluation | System | Must Have | ✅ |
| F-90 | Highlight hijau kandidat di atas threshold (`is_recommended` flag) | Recruiter | Should Have | ✅ |
| F-91 | Checklist manual rekruter: centang kandidat lolos | Recruiter | Must Have | ✅ |
| F-92 | Tombol "Publish Hasil": bulk announce per divisi (transaksi tunggal) | Recruiter | Must Have | ✅ |
| F-93 | Kandidat yang dicentang → `announced_pass` | System | Must Have | ✅ |
| F-94 | Kandidat yang tidak dicentang → `announced_fail` | System | Must Have | ✅ |
| F-95 | Kandidat lihat hasil di dashboard | Candidate | Must Have | ✅ |
| F-96 | Audit log: bulk announcement (`action_type="bulk_announcement"`) | System | Must Have | ✅ |

#### 2D — Pipeline & Technical
| ID | Fitur | Role | Prioritas | Status |
|---|---|---|---|---|
| F-100 | Deprecate legacy endpoints `/api/upload` + `/api/evaluate` | System | Should Have | 🟧 belum |
| F-101 | Audit log: score override | System | Should Have | 🟧 belum |
| F-102 | Division enum validation di `EvaluateBatchRequest` | System | Should Have | 🟧 belum |
| F-103 | `Rubric.division` migrate dari `String(20)` → `Enum(Division)` | System | Should Have | 🟧 belum |
| F-104 | Idempotent seeding: 4 rubrik divisi kosong di-seed otomatis saat startup | System | Must Have | ✅ |
| F-105 | WhatsApp field di User profile (editable di setiap fase) | Candidate | Should Have | ✅ |
| F-106 | Self-action guard: super_admin tidak dapat deactivate / demote akunnya sendiri | System | Must Have | ✅ |

---

## 5. Stack Teknologi

| Layer | Stack | Keterangan |
|---|---|---|
| PDF Parsing | PyMuPDF | Sama seperti Capstone |
| NER | IndoBERT (ageng-anugrah/indobert-large-p2-finetuned-ner) | Submit-time via BackgroundTasks |
| RAG & Orchestration | LangChain | Sama seperti Capstone |
| Vector Store | ChromaDB (persistent) | Sama seperti Capstone |
| LLM Inference | DeepSeek V4 Flash (`deepseek-v4-flash`) via OpenAI-compatible SDK | temperature 0.1, max 4096 token, 3× retry exponential backoff |
| KHS Parser | Custom rule-based + PyMuPDF | Baru di Lab |
| KTM Validator | Custom rule-based | Baru di Lab |
| Background Tasks | FastAPI BackgroundTasks | Untuk submit-time NER |
| Backend | FastAPI + python-jose (JWT, HS256) + bcrypt (langsung, tanpa passlib) | bcrypt pinned `==4.0.1` |
| Frontend | React + Vite + Tailwind + shadcn/ui | Academic Luminary style |
| Database | SQLite (dev) / PostgreSQL (prod via Railway plugin) | Legacy `postgres://` URL dinormalisasi otomatis di `database.py` |
| Migrations | Alembic — `alembic upgrade head` dijalankan otomatis di FastAPI lifespan | 6 revisions saat ini |
| Auth | JWT-based (HS256, expiry 8 jam), token di localStorage | Phase 1 implemented |
| Deployment (Backend) | **Railway aktif** via `Procfile` + `railway.json` (Nixpacks builder, healthcheck `/api/health`) | Auto-deploy dari GitHub |
| Deployment (Frontend) | Vercel | Phase 3 target — `vercel.json` belum ada |

---

## 6. Alur Sistem

### Phase 1 — Candidate Portal Flow (✅ Complete)
```
Candidate: Register → Login → Profile (pilih divisi)
    → Upload 6 dokumen (step-by-step)
    → Review & checklist → Submit Final (irreversible)
    → Dashboard: journey tracker + status

Recruiter: Login → Dashboard (filter divisi/status)
    → CandidateDetail: preview dok + SWOT + verify D-06

Super Admin: Login → Admin Panel: manage users
```

### Phase 2 — Full Recruitment Flow
```
[Submit-time — otomatis]
Candidate submit → BackgroundTask:
    NER anonymize (CV + Motivation Letter)
    → simpan anonymized_text di candidate_documents

[Super Admin — setup]
Super Admin: buat RecruitmentPeriod (buka/tutup)
    → set threshold highlight (top N)

[Recruiter — evaluasi]
Recruiter: Login → Dashboard → filter divisi
    → Run Evaluation (batch):
        cached NER (skip jika sudah ada)
        → KTM validate (soft warning)
        → KHS parse (IPK + courses → RAG context)
        → RAG Pipeline (CV + ML + KHS → rubrik divisi)
        → LLM Inference (DeepSeek V3)
        → store hasil: skor + justifikasi XAI
    → Lihat ranking: kandidat ≥ threshold di-highlight hijau
    → Override skor jika perlu (logged)
    → Reveal Identity
    → Checklist manual: centang kandidat yang lolos
    → "Publish Hasil" → bulk announce

[Candidate — hasil]
Candidate: Login → Dashboard
    → Banner LOLOS (hijau) atau TIDAK LOLOS (merah)
```

---

## 7. Role Definitions

| Role | Akses |
|---|---|
| **Super Admin** | Semua fitur + manage users + manage recruitment period + set threshold |
| **Recruiter** | Dashboard pelamar, run evaluation, override, reveal identity, checklist manual, publish hasil |
| **Candidate** | Registrasi, upload dokumen, submit, lihat status & hasil pengumuman |

---

## 8. Model Data Baru (Phase 2)

### RecruitmentPeriod
```
id                       INTEGER     pk
name                     VARCHAR     "Rekrutasi Lab MBC 2025-2026"
start_date               DATETIME    awal fase SUBMISSION
submission_end_date      DATETIME    nullable — akhir SUBMISSION / awal EVALUATION
                                     (nullable utk back-compat periode lama;
                                      jika null, collapse ke end_date)
evaluation_end_date      DATETIME    nullable — akhir EVALUATION / awal ANNOUNCEMENT
                                     (nullable utk back-compat; jika null, collapse ke end_date)
end_date                 DATETIME    akhir ANNOUNCEMENT — periode CLOSED setelah ini
is_active                BOOLEAN     hanya satu yang True pada satu waktu
                                     (enforce app-level di transaksi, bukan DB constraint)
threshold_n              INTEGER     top N highlight per divisi (nullable = tidak ada threshold)
created_by               INTEGER     FK users.id (super admin)
created_at               DATETIME

# COMPUTED property — BUKAN kolom DB:
current_phase            Literal     UPCOMING | SUBMISSION | EVALUATION | ANNOUNCEMENT | CLOSED
                                     Diturunkan dari (period dates, datetime.now(UTC))
                                     via backend/utils/period_utils.py::get_current_phase.
                                     Tidak membaca is_active — fase murni fungsi kalender.
                                     Validasi urutan: start < submission_end < evaluation_end < end.
```

Validasi tambahan saat create/update:
- `start_date` harus di masa depan saat create (tidak di-enforce saat update — Super Admin dapat memutar mundur boundary untuk koreksi).
- `start_date` **immutable** setelah create.
- Setiap update yang menyentuh boundary dates di-validate sebagai satu set agar `start < submission_end < evaluation_end < end` selalu konsisten.

### Perubahan pada Application
```
period_id       INTEGER     FK recruitment_periods.id (nullable, untuk compat)
                            Di-stamp dari periode aktif saat submit.
```

---

## 9. Non-Fungsional

| Kategori | Target |
|---|---|
| Auth security | JWT dengan expiry 8 jam, bcrypt password hashing |
| Data privacy | Data lokal server lab, tidak diunggah ke third-party public service |
| NER accuracy | Miss rate ≤ 5% |
| NER timing | Background task — tidak blokir submit response |
| File upload | Max size: CV/KHS/ML/SWOT 5MB, KTM 2MB, Dok. Pendukung 10MB |
| Supported format | PDF untuk semua; JPG/PNG untuk KTM |
| Database | SQLite untuk dev dan production awal |
| Batch performance | 240 dokumen tanpa timeout |
| Availability | Local/VPS lab — best-effort selama periode rekrutasi aktif |

---

## 10. Catatan Teknis

### Dual Pipeline (Legacy vs Lab)
Saat ini dua pipeline berjalan paralel:
- **Legacy Capstone**: `/api/upload` + `/api/evaluate` (rubric_id based)
- **Lab Portal**: `/api/documents/upload` + `/api/recruiter/evaluate/batch` (division based)

Legacy endpoints akan di-deprecate di Phase 2 setelah Lab pipeline stabil.

### NER Timing
- **Capstone**: NER dijalankan saat upload (`/api/upload`)
- **Lab Phase 1**: NER dijalankan saat evaluasi (`evaluation_service.py`)
- **Lab Phase 2**: NER dijalankan saat submit via `BackgroundTasks` (cached untuk evaluasi)

### Threshold Highlight vs Auto-Announce
Threshold N yang di-set Super Admin adalah **rekomendasi visual** saja:
- Kandidat rank 1-N: highlight hijau di tabel rekruter
- Keputusan final tetap di tangan rekruter via checklist manual
- Tidak ada auto-announce berdasarkan threshold

### Phase Enforcement Matrix
Tabel ringkasan: tindakan yang diizinkan per fase. Super Admin dapat bypass semua gating sebagai mekanisme koreksi manual.

| Fase | Submit application | Run evaluation | Bulk announce |
|---|---|---|---|
| `UPCOMING` | ❌ 403 (periode belum dibuka) | ⚠️ soft warn | ❌ 403 (super_admin bypass) |
| `SUBMISSION` | ✅ allowed | ⚠️ soft warn | ❌ 403 (super_admin bypass) |
| `EVALUATION` | ❌ 403 (pendaftaran ditutup) | ✅ in window | ❌ 403 (super_admin bypass) |
| `ANNOUNCEMENT` | ❌ 403 | ⚠️ soft warn | ✅ allowed |
| `CLOSED` | ❌ 403 (periode berakhir) | ⚠️ soft warn | ❌ 403 (super_admin bypass) |

### Computed Phase
`current_phase` adalah Python `@property` di `RecruitmentPeriod` model — bukan kolom DB. Fase di-derive on-the-fly dari `(period dates, datetime.now(UTC))` setiap kali diakses. Konsekuensi:
- Tidak perlu cron job atau scheduler untuk transisi fase.
- Server clock-skew dapat menyebabkan kandidat melihat countdown 0 sebelum server benar-benar lock submission (acceptable untuk konteks rekrutasi lab).

### Idempotent Rubric Seeding
Saat startup (`main.py` lifespan), `seed_division_rubrics()` memastikan satu rubrik kosong (tanpa dimensi) ada untuk setiap dari 4 divisi. Idempotent: hanya membuat rubrik untuk divisi yang belum punya. Rekruter mengisi dimensi via UI rubric editor sebelum evaluasi pertama.

---

## 11. UI/UX Reference

- **Candidate Portal**: Academic Luminary style (mockup MBC)
- **Recruiter Dashboard**: Extended dari Capstone + kolom highlight threshold
- **Super Admin**: User management + Recruitment Period management
- **Announcement**: Bulk publish dengan preview kandidat lolos/tidak sebelum konfirmasi
