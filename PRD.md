# Product Requirements Document (PRD)
## ScreenAI Lab — Sistem Screening Rekrutasi Otomatis untuk MBC Laboratory
## Telkom University

---

## Phase Status

| Phase | Scope | Status |
|---|---|---|
| **Phase 1 — Candidate Portal MVP** | Platform pendaftaran + upload dokumen + dashboard kandidat | ✅ Complete |
| **Phase 2 — Full Recruitment Flow** | Evaluasi AI + post-review processing cache + periode rekrutmen + seleksi manual rekruter | ✅ Complete |
| **Phase 3 — Deployment** | Docker/VPS lab self-hosted + production config | 🔄 In Progress — deployment assets ready, production cutover pending |

---

## 1. Overview

### 1.1 Ringkasan Produk

ScreenAI Lab adalah fork dari ScreenAI (Capstone) yang diadaptasi untuk kebutuhan rekrutasi internal MBC Laboratory, Telkom University. Platform ini mengintegrasikan **AI-Anonymized Evaluation** berbasis NER (identitas pribadi dihapus dari teks dokumen sebelum dikirim ke AI), **evaluasi kompetensi berbasis LLM dengan konteks rubrik**, dan **justifikasi evaluasi** ke dalam alur rekrutmen end-to-end: kandidat mendaftar, memilih divisi, mengunggah dokumen, melakukan submit final, kemudian rekruter menjalankan evaluasi AI, melakukan crosscheck manual, dan mempublikasikan hasil seleksi. Ini bukan full blind recruitment — recruiter tetap dapat melihat identitas kandidat untuk verifikasi administratif dan pengambilan keputusan akhir; anonymization hanya berlaku pada input AI.

Pada implementasi saat ini, pipeline evaluasi menggunakan pendekatan **rubric-augmented LLM scoring**: konteks rubrik dimasukkan langsung ke prompt bersama teks kandidat yang sudah dianonimkan, ringkasan KHS, dan Motivation Letter. Dependensi LangChain dan ChromaDB masih tersedia di codebase untuk kompatibilitas/future retrieval, tetapi retrieval vektor aktif belum menjadi bagian utama alur evaluasi produksi.

### 1.2 Perbedaan dengan ScreenAI (Capstone)

| Aspek | ScreenAI (Capstone) | ScreenAI Lab |
|---|---|---|
| Target pengguna | Perusahaan umum | MBC Laboratory, Telkom University |
| Dokumen input | CV + sertifikat EPrT | CV + KHS + KTM + Motivation Letter + SWOT + Dokumen Pendukung |
| Candidate portal | Phase 2 (planned) | Phase 1 MVP ✅ Complete |
| NER timing | Saat upload / evaluasi | Saat submit final via BackgroundTask, dengan fallback inline saat evaluasi |
| Periode rekrutmen | Tidak ada | Super Admin kelola via platform |
| Penentuan kelulusan | Tidak ada | Rekruter checklist manual + bulk publish |
| Database | SQLite → PostgreSQL | SQLite untuk dev, PostgreSQL untuk Docker/VPS production |
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
- Form profil mahasiswa (Nama, NIM, Fakultas, Jurusan, Angkatan, WhatsApp).
- Pemilihan divisi/posisi (Big Data, Cyber Security, Game Technology, GIS).
- Upload multi-dokumen dengan zona terpisah per tipe dokumen (6 dokumen).
- Validasi MIME, ukuran file, dan magic-byte untuk mencegah spoofing file upload.
- Checklist kelengkapan dokumen sebelum submit.
- Halaman status lamaran kandidat (tracking progress + journey tracker).
- Dashboard rekruter: melihat daftar pelamar + status kelengkapan dokumen.
- Submit final dengan konfirmasi (irreversible).
- Super Admin: manajemen user (role, aktivasi/deaktivasi, reset password admin-assisted).

### Phase 2 — Full Recruitment Flow (✅ Complete)

#### 2A — Post-review Processing Cache

- Processing dokumen dijalankan otomatis via **BackgroundTask** setelah recruiter/super_admin memfinalisasi document review sebagai accepted.
- CV + Motivation Letter dianonimkan dan disimpan di DB setelah dokumen verified.
- KHS text-based PDF diekstrak, direduksi PII, diparse oleh DeepSeek V4 Flash menjadi structured academic summary, lalu di-cache di `candidate_documents.sections_json`.
- Background task membuka session DB sendiri melalui `SessionLocal`, bukan memakai request-scoped session.
- Saat batch evaluation, NER dilewati jika anonymized text sudah ada (cached).
- Jika cache belum tersedia atau background task gagal, evaluasi fallback ke inline NER agar pipeline tetap berjalan.
- SWOT text ikut diekstrak dan di-cache sebagai `CandidateDocument.raw_text` untuk panel highlight rekruter, tetapi tidak dianonimkan dan tidak masuk skor.

#### 2B — Manajemen Periode Rekrutmen

- Super Admin membuat dan mengelola **RecruitmentPeriod** dengan empat tanggal batas: `start_date`, `submission_end_date`, `evaluation_end_date`, `end_date`.
- Hanya satu periode aktif pada satu waktu.
- Invariant single-active period dijaga di application layer, dan pada PostgreSQL production diperkuat dengan partial unique index `WHERE is_active = true`.
- Periode aktif memiliki **5 fase yang dihitung dari kalender** (computed, bukan kolom DB):
  - `UPCOMING` — sebelum `start_date`.
  - `SUBMISSION` — kandidat dapat submit (`start_date` ≤ now < `submission_end_date`).
  - `EVALUATION` — rekruter menjalankan evaluasi AI (`submission_end_date` ≤ now < `evaluation_end_date`).
  - `ANNOUNCEMENT` — rekruter mempublikasikan hasil (`evaluation_end_date` ≤ now < `end_date`).
  - `CLOSED` — periode berakhir (now ≥ `end_date`).
- Sistem otomatis lock submission jika tidak ada periode aktif **atau** fase saat ini bukan `SUBMISSION`.
- **Bulk announce hanya boleh di fase `ANNOUNCEMENT`**; Super Admin dapat bypass untuk koreksi manual.
- Evaluasi di luar fase `EVALUATION` tetap dijalankan, tetapi response berisi `warning` (soft warn).
- Countdown di dashboard kandidat dan recruiter mengikuti fase aktif.
- Super Admin dapat menutup periode lebih awal (set `is_active=false` + `end_date=now`).

#### 2C — Evaluasi AI + Seleksi Manual Rekruter

- Rekruter menjalankan batch evaluation per divisi.
- Default: kandidat yang sudah memiliki `composite_score` di-skip; rekruter dapat **force re-evaluate** untuk re-score kandidat yang sudah dievaluasi.
- Filter status `SUBMITTED` selalu berlaku — kandidat di status `DRAFT`, `SCREENING`, atau `ANNOUNCED_*` tidak ikut dievaluate ulang kecuali alurnya dikembalikan ke `SUBMITTED`.
- Hasil evaluasi: ranking kandidat + skor per dimensi + justifikasi berbasis `DimensionScore.justification`.
- Super Admin set **threshold highlight**: angka N (misal top 10) sebagai rekomendasi visual.
- Kandidat di atas threshold di-highlight hijau di tabel rekruter (rekomendasi, bukan keputusan otomatis).
- Rekruter melakukan **crosscheck manual**: centang kandidat yang lolos.
- Rekruter klik **"Publish Hasil"**: semua yang dicentang → `announced_pass`, sisanya di scope evaluasi yang sama → `announced_fail`.
- Bulk announce diwrap dalam transaksi DB tunggal dan menulis `AuditLog` (`action_type="bulk_announcement"`) per perubahan status.
- Kandidat melihat hasil di dashboard mereka.
- Rekruter dapat override skor per dimensi; setiap override menulis `AuditLog` (`action_type="score_override"`).

#### 2D — Pipeline Evaluation Update

- Pipeline evaluasi menggunakan cache NER dan cache KHS dari post-review processing jika tersedia.
- Jika cache KHS belum ada atau stale, evaluation fallback parse inline agar pipeline tetap berjalan.
- KHS summary block hanya diinjeksikan ke konteks AI jika rubrik/dimensi/indikator membutuhkan academic evidence.
- Raw KHS tidak dikirim ke AI scoring; hanya structured academic summary yang aman. Untuk parser KHS, teks PDF direduksi PII sebelum dikirim ke DeepSeek V4 Flash.
- KTM validation bersifat soft warning, tidak memblokir evaluasi.
- SWOT bersifat highlight only, tidak masuk skor.
- Legacy Capstone endpoints (`/api/upload`, `/api/evaluate`) tetap mounted untuk kompatibilitas, tetapi sudah diberi deprecation header dan warning log.
- `EvaluateBatchRequest.division` sudah divalidasi dengan enum `Division`.
- `Rubric.division` sudah menggunakan enum-compatible storage dan DB CHECK constraint untuk mencegah nilai divisi invalid.
- Rubric weight divalidasi agar total bobot dimensi ≈ 1.0 sebelum evaluasi maupun override skor.

### Phase 3 — Deployment (🔄 In Progress)

- Deployment canonical menggunakan **Docker Compose** pada VPS lab self-hosted.
- Tiga service utama:
  - `frontend`: image React build + nginx; serve SPA dan reverse-proxy `/api/` ke backend.
  - `backend`: image FastAPI Python 3.11; menjalankan `uvicorn backend.main:app`.
  - `db`: PostgreSQL 16 Alpine.
- TLS tidak diterminasi di container. Host-level reverse proxy (Nginx/Caddy di luar Docker) menangani HTTPS dan meneruskan HTTP ke frontend container port 80.
- PostgreSQL menjadi target production; SQLite hanya untuk local development.
- Environment variables diatur melalui `.env` project root.
- `VITE_API_BASE_URL` bersifat build-time karena Vite meng-inline env var saat build.
- Healthcheck tersedia di `/api/health`.
- Backup production mencakup PostgreSQL dump dan direktori upload kandidat.
- Code splitting frontend (React.lazy) masih backlog pasca deployment.

### Out-of-Scope (Semua Phase)

- PDF berbasis scan / gambar (OCR) — kecuali KTM sebagai backlog.
- Sertifikat bahasa non-EPrT sebagai standar utama.
- Generator pertanyaan wawancara.
- Notifikasi email otomatis.
- Mobile app native.
- Auto-announce berdasarkan threshold (threshold hanya highlight, bukan keputusan otomatis).

---

## 3. Dokumen yang Didukung

| ID | Dokumen | Wajib | Diproses AI | Timing NER | Keterangan |
|---|---|---|---|---|---|
| D-01 | CV (PDF) | ✅ | ✅ LLM scoring + NER | Post-review background, fallback evaluation-time | Anonymized text cached di DB |
| D-02 | KHS / Transkrip Nilai (PDF) | ✅ | ✅ LLM parser khusus | Post-review cache, fallback evaluation-time | Text-based PDF saja; PII direduksi sebelum parser; structured academic summary masuk AI scoring hanya jika rubrik membutuhkan academic evidence |
| D-03 | KTM / Student ID (PDF/JPG/PNG) | ✅ | ✅ Rule-based validator | Evaluation-time | Soft warning jika invalid |
| D-04 | Motivation Letter (PDF) | ✅ | ✅ LLM scoring + NER | Post-review background, fallback evaluation-time | Anonymized text cached di DB |
| D-05 | Analisis SWOT Diri Sendiri (PDF) | ✅ | ⚠️ Highlight only | Post-review text cache, tanpa NER | Tidak di-score, dibaca rekruter |
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
| F-04 | Rate limit login/register | System | ✅ |

#### Modul Profil Mahasiswa
| ID | Fitur | Role | Status |
|---|---|---|---|
| F-10 | Form profil: Nama, NIM, Fakultas, Jurusan, Angkatan, WhatsApp | Candidate | ✅ |
| F-11 | Pemilihan divisi/posisi | Candidate | ✅ |
| F-12 | Edit profil sebelum submit final sesuai lock rules | Candidate | ✅ |

#### Modul Upload Dokumen
| ID | Fitur | Role | Status |
|---|---|---|---|
| F-20 | Upload CV (PDF, max 5MB) | Candidate | ✅ |
| F-21 | Upload KHS (PDF, max 5MB) | Candidate | ✅ |
| F-22 | Upload KTM (PDF/JPG/PNG, max 2MB) | Candidate | ✅ |
| F-23 | Upload Motivation Letter (PDF, max 5MB) | Candidate | ✅ |
| F-24 | Upload SWOT Analysis (PDF, max 5MB) | Candidate | ✅ |
| F-25 | Upload Dokumen Pendukung (PDF, max 10MB) | Candidate | ✅ |
| F-26 | Multi-step upload flow (6 steps + progress tracker) | Candidate | ✅ |
| F-27 | Preview dokumen yang sudah diupload | Candidate | ✅ |
| F-28 | Replace dokumen sebelum submit final | Candidate | ✅ |
| F-29 | Checklist kelengkapan sebelum submit | Candidate | ✅ |
| F-30A | Magic-byte validation untuk mencegah MIME spoofing | System | ✅ |

#### Modul Submission & Status
| ID | Fitur | Role | Status |
|---|---|---|---|
| F-30 | Submit Final (irreversible + konfirmasi) | Candidate | ✅ |
| F-31 | Recruitment journey tracker | Candidate | ✅ |
| F-32 | Progress % kelengkapan aplikasi | Candidate | ✅ |
| F-33 | Countdown deadline dari RecruitmentPeriod, fase-aware | Candidate | ✅ |
| F-34 | Dashboard: LOLOS/TIDAK LOLOS banner | Candidate | ✅ |

#### Modul Dashboard Rekruter
| ID | Fitur | Role | Status |
|---|---|---|---|
| F-40 | Daftar pelamar per divisi + kelengkapan dokumen | Recruiter | ✅ |
| F-41 | Preview/download dokumen per kandidat | Recruiter | ✅ |
| F-42 | Checklist manual verifikasi Dokumen Pendukung (D-06) | Recruiter | ✅ |
| F-43 | Filter pelamar berdasarkan divisi dan status | Recruiter | ✅ |
| F-44 | Optimasi query dashboard: joinedload + grouped document count | System | ✅ |

#### Modul Super Admin
| ID | Fitur | Role | Status |
|---|---|---|---|
| F-60 | Manajemen user: list, change role, activate/deactivate | Super Admin | ✅ |
| F-61 | Admin-assisted password reset | Super Admin | ✅ |
| F-62 | Self-action guard: super_admin tidak dapat deactivate / demote akun sendiri | System | ✅ |

### Phase 2 Features (✅ Complete)

#### 2A — Post-review Processing Cache
| ID | Fitur | Role | Prioritas | Status |
|---|---|---|---|---|
| F-70 | NER anonymization otomatis saat submit (BackgroundTask) | System | Must Have | ✅ |
| F-71 | Cache anonymized text di `candidate_documents` | System | Must Have | ✅ |
| F-72 | Evaluation pipeline skip NER jika cached, fallback inline jika cache miss | System | Must Have | ✅ |
| F-73 | Background task menggunakan `SessionLocal` sendiri | System | Must Have | ✅ |
| F-74 | SWOT text cache di post-review processing untuk panel rekruter | System | Should Have | ✅ |

#### 2B — Manajemen Periode Rekrutmen
| ID | Fitur | Role | Prioritas | Status |
|---|---|---|---|---|
| F-80 | Buat / edit / tutup RecruitmentPeriod | Super Admin | Must Have | ✅ |
| F-81 | Set 4 tanggal batas (`start`, `submission_end`, `evaluation_end`, `end`) | Super Admin | Must Have | ✅ |
| F-82 | Satu periode aktif pada satu waktu | System | Must Have | ✅ |
| F-83 | Lock submission jika periode tidak aktif **atau** fase ≠ SUBMISSION | System | Must Have | ✅ |
| F-84 | Countdown fase-aware di dashboard kandidat dari periode aktif | Candidate | Must Have | ✅ |
| F-85 | Set threshold highlight (top N per divisi) | Super Admin | Should Have | ✅ |
| F-86 | `current_phase` computed property (UPCOMING/SUBMISSION/EVALUATION/ANNOUNCEMENT/CLOSED) | System | Must Have | ✅ |
| F-87 | Bulk announce dikunci ke fase ANNOUNCEMENT (Super Admin bypass) | System | Must Have | ✅ |
| F-88 | Evaluation di luar fase EVALUATION tetap berjalan + soft warning | System | Should Have | ✅ |
| F-89 | `evaluation_prompt` flag pada `/api/periods/active` | Recruiter | Should Have | ✅ |
| F-89A | `/api/periods/active/stats` untuk ringkasan jumlah submitted per divisi | Recruiter/Admin | Should Have | ✅ |

#### 2C — Evaluasi + Seleksi Manual
| ID | Fitur | Role | Prioritas | Status |
|---|---|---|---|---|
| F-50 | Batch evaluation per divisi (NER cached → context-augmented LLM scoring) | Recruiter | Must Have | ✅ |
| F-51 | KHS LLM Parser: IPK + IPS + mata kuliah → konteks evaluasi | System | Must Have | ✅ |
| F-52 | KTM Validator: soft warning (tidak blokir) | System | Must Have | ✅ |
| F-53 | SWOT Highlight panel di detail kandidat | Recruiter | Must Have | ✅ |
| F-54 | Skor per dimensi + justifikasi dari `DimensionScore.justification` | Recruiter | Must Have | ✅ |
| F-55 | Ranking kandidat per divisi | Recruiter | Must Have | ✅ |
| F-56 | Override skor dengan audit log `score_override` | Recruiter | Must Have | ✅ |
| F-57 | Candidate Profile selalu terlihat oleh recruiter (identitas tidak disembunyikan; hanya input AI yang dianonimkan) | Recruiter | Must Have | ✅ |
| F-58 | Force re-evaluate (`force=true`) | Recruiter | Should Have | ✅ |
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
| F-100 | Deprecate legacy endpoints `/api/upload` + `/api/evaluate` | System | Should Have | ✅ |
| F-101 | Audit log: score override | System | Should Have | ✅ |
| F-102 | Division enum validation di `EvaluateBatchRequest` | System | Should Have | ✅ |
| F-103 | `Rubric.division` type safety + DB CHECK constraint | System | Should Have | ✅ |
| F-104 | Idempotent seeding: 4 rubrik divisi kosong di-seed otomatis saat startup | System | Must Have | ✅ |
| F-105 | WhatsApp field di User profile (editable di setiap fase sesuai rules) | Candidate | Should Have | ✅ |
| F-106 | Sanitized error handling pada batch evaluation | System | Should Have | ✅ |
| F-107 | Rubric weight validation sebelum evaluasi dan override | System | Should Have | ✅ |
| F-108 | Bounded concurrent LLM calls (`asyncio.Semaphore(5)`) | System | Should Have | ✅ |

### Phase 3 Features (🔄 In Progress)

| ID | Fitur | Role | Prioritas | Status |
|---|---|---|---|---|
| F-120 | Dockerfile backend | System | Must Have | ✅ |
| F-121 | Dockerfile frontend multi-stage + nginx SPA proxy | System | Must Have | ✅ |
| F-122 | `docker-compose.yml` untuk frontend/backend/db | System | Must Have | ✅ |
| F-123 | Host-level reverse proxy TLS guide | Operator | Must Have | ✅ docs ready |
| F-124 | Production `.env` block untuk Docker/VPS | Operator | Must Have | ✅ |
| F-125 | Backup/restore guide untuk Postgres + uploads | Operator | Should Have | ✅ docs ready |
| F-126 | Production cutover di VPS lab | Operator | Must Have | 📋 Pending |
| F-127 | Frontend code splitting | System | Could Have | 📋 Backlog |

---

## 5. Stack Teknologi

| Layer | Stack | Keterangan |
|---|---|---|
| PDF Parsing | PyMuPDF | Ekstraksi text PDF pada CV, KHS, ML, SWOT, dan legacy upload |
| NER | IndoBERT (`ageng-anugrah/indobert-large-p2-finetuned-ner`) | Post-review via BackgroundTasks, fallback inline saat evaluasi |
| Evaluation Prompting | Rubric-augmented LLM scoring | Rubrik dimasukkan langsung ke prompt bersama CV/ML/KHS; bukan retrieval vektor aktif |
| RAG / Vector Store | LangChain + ChromaDB | Dependency tersedia/future retrieval; current production path memakai inline rubric context |
| LLM Inference | DeepSeek V4 Flash (`deepseek-v4-flash`) via OpenAI-compatible SDK | temperature 0.1, max 4096 token, 3× retry exponential backoff |
| KHS Parser | DeepSeek V4 Flash + PyMuPDF text extraction + validation layer | Text-based KHS PDF direduksi PII, diparse strict JSON, lalu divalidasi sebelum cache |
| KTM Validator | Custom rule-based | Soft warning, tidak memblokir evaluasi |
| Background Tasks | FastAPI BackgroundTasks | Untuk post-review NER, SWOT text cache, dan KHS parsed cache |
| Backend | FastAPI + SQLAlchemy + Alembic + python-jose + bcrypt | bcrypt pinned `==4.0.1`; slowapi rate limiting |
| Frontend | React 19 + Vite 8 + Tailwind 4 + shadcn/ui | Academic Luminary style |
| Database | SQLite (dev) / PostgreSQL 16 Docker service (prod) | Legacy `postgres://` URL dinormalisasi otomatis di `database.py` |
| Migrations | Alembic — `alembic upgrade head` dijalankan otomatis di FastAPI lifespan | Schema migration auto-run saat startup backend |
| Auth | JWT-based (HS256, expiry 8 jam), token di localStorage | HttpOnly cookie + CSRF masih backlog keamanan |
| Deployment | Docker Compose di VPS lab self-hosted | `frontend` nginx proxy `/api/`, `backend` uvicorn, `db` Postgres |
| TLS | Host-level Nginx/Caddy di luar Docker | Container hanya plain HTTP; TLS/cert renewal dipisahkan dari lifecycle container |

---

## 6. Alur Sistem

### Phase 1 — Candidate Portal Flow (✅ Complete)

```text
Candidate: Register → Login → Profile (pilih divisi)
    → Upload 6 dokumen (step-by-step)
    → Review & checklist → Submit Final (irreversible)
    → Dashboard: journey tracker + status

Recruiter: Login → Dashboard (filter divisi/status)
    → CandidateDetail: preview dok + SWOT + verify D-06

Super Admin: Login → Admin Panel: manage users + periods
```

### Phase 2 — Full Recruitment Flow (✅ Complete)

```text
[Post-document-review — otomatis]
Recruiter finalize accepted document review → BackgroundTask:
    NER anonymize (CV + Motivation Letter)
    → simpan anonymized_text di candidate_documents
    → cache raw SWOT text untuk panel rekruter
    → redact PII KHS, LLM-parse KHS, dan cache structured academic summary

[Super Admin — setup]
Super Admin: buat RecruitmentPeriod (buka/tutup)
    → set threshold highlight (top N)

[Recruiter — evaluasi]
Recruiter: Login → Dashboard → pilih/filter divisi
    → Run Evaluation (batch):
        cached NER (skip jika ada)
        → fallback inline NER jika cache belum tersedia
        → KTM validate (soft warning)
        → KHS cache-first, fallback LLM parse inline jika cache belum tersedia
        → rubric-driven academic evidence gating
        → rubric-augmented prompt (CV + ML + KHS summary bila relevan + rubrik divisi)
        → LLM Inference (DeepSeek V4 Flash)
        → store hasil: skor + justifikasi
    → Lihat ranking: kandidat rank ≤ threshold di-highlight hijau
    → Override skor jika perlu (logged)
    → Lihat Candidate Profile (identitas selalu terlihat untuk verifikasi)
    → Checklist manual: centang kandidat yang lolos
    → "Publish Hasil" → bulk announce

[Candidate — hasil]
Candidate: Login → Dashboard / Result
    → Banner LOLOS atau TIDAK LOLOS
```

### Phase 3 — Deployment Flow (🔄 In Progress)

```text
Operator VPS:
    git pull
    cp .env.example .env
    isi ENVIRONMENT, SECRET_KEY, ALLOWED_ORIGINS, DATABASE_URL,
        POSTGRES_*, DEEPSEEK_API_KEY, VITE_API_BASE_URL
    docker compose up --build -d
    host Nginx/Caddy terminate HTTPS → reverse_proxy localhost:80
    monitor /api/health
    backup: pg_dump + rsync uploads
```

---

## 7. Role Definitions

| Role | Akses |
|---|---|
| **Super Admin** | Semua fitur + manage users + reset password + manage recruitment period + set threshold + bypass bulk-announce phase lock |
| **Recruiter** | Dashboard pelamar, run evaluation, force re-evaluate, override skor, lihat candidate profile, checklist manual, publish hasil |
| **Candidate** | Registrasi, upload dokumen, submit, lihat status & hasil pengumuman |

---

## 8. Model Data Baru (Phase 2)

### RecruitmentPeriod

```text
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

Validasi dan constraint:
- `start_date` harus di masa depan saat create.
- `start_date` immutable setelah create.
- Setiap update yang menyentuh boundary dates divalidasi sebagai satu set agar `start < submission_end < evaluation_end < end` selalu konsisten.
- Single-active period dijaga di application layer dengan menonaktifkan periode aktif lain dalam transaksi yang sama.
- Pada PostgreSQL production, invariant ini diperkuat dengan partial unique index untuk `is_active = true`.

### Perubahan pada Application

```text
period_id       INTEGER     FK recruitment_periods.id (nullable, untuk compat)
                            Di-stamp dari periode aktif saat submit.
```

Catatan implementasi saat ini: kandidat hanya dapat memiliki satu application aktif secara global. Jika multi-period re-application dibutuhkan, constraint/check perlu diperluas menjadi `(user_id, period_id)`.

### CandidateDocument

```text
document_type      VARCHAR     cv | motivation_letter | swot | certificate | ...
raw_text           TEXT        hasil ekstraksi PDF asli
normalized_text    TEXT        hasil normalisasi text
anonymized_text    TEXT        hasil NER anonymization untuk CV/ML
entities_json      JSON        entitas yang ditemukan NER/regex
sections_json      JSON        section segmentation
page_count         INTEGER     jumlah halaman PDF bila tersedia
```

Catatan:
- CV dan Motivation Letter menyimpan `anonymized_text`.
- SWOT menyimpan `raw_text` untuk panel highlight, tanpa NER dan tanpa skor.
- KHS menyimpan `raw_text` internal dan parsed structured JSON di `sections_json` (`parsed_khs`, `processing_status`, `parser_version`, `model`, `last_scoring`), tanpa NER. Parser LLM menerima teks yang sudah direduksi PII; scoring LLM hanya menerima structured academic summary.

---

## 9. Non-Fungsional

| Kategori | Target |
|---|---|
| Auth security | JWT dengan expiry 8 jam, bcrypt password hashing, startup guard untuk `SECRET_KEY` production |
| CORS security | `ALLOWED_ORIGINS` wajib di non-development environment |
| Rate limiting | Login/register dan bulk announce memiliki rate limit berbasis slowapi |
| Data privacy | File kandidat disimpan lokal di server lab; teks evaluasi yang sudah diproses dikirim ke DeepSeek untuk scoring |
| NER accuracy | Miss rate target ≤ 5% untuk entitas utama, dengan regex fallback |
| NER timing | Background task — tidak memblokir submit response |
| File upload | Max size: CV/KHS/ML/SWOT 5MB, KTM 2MB, Dok. Pendukung 10MB |
| File validation | Validasi MIME + magic bytes untuk PDF/JPG/PNG |
| Supported format | PDF untuk semua; JPG/PNG tambahan untuk KTM |
| Database | SQLite untuk local development; PostgreSQL untuk Docker/VPS production |
| Batch performance | Batch evaluation menggunakan bounded concurrency untuk LLM calls (`Semaphore(5)`) |
| Availability | Local/VPS lab — best-effort selama periode rekrutasi aktif |
| Backup | PostgreSQL dump + backup direktori upload kandidat |

---

## 10. Catatan Teknis

### Dual Pipeline (Legacy vs Lab)

Saat ini dua pipeline masih tersedia:
- **Legacy Capstone**: `/api/upload` + `/api/evaluate` (rubric_id based)
- **Lab Portal**: `/api/documents/upload/{doc_type}` + `/api/recruiter/evaluate/batch` (division based)

Legacy endpoints tetap mounted untuk kompatibilitas, tetapi sudah deprecated:
- response success membawa header `Deprecation: true`;
- response success membawa `X-Deprecated-Message`;
- server menulis warning log pada setiap pemanggilan.

### NER Timing

- **Capstone legacy**: NER dijalankan saat upload (`/api/upload`).
- **Lab current**: NER dijalankan setelah accepted document-review finalization via `BackgroundTasks` dan disimpan di `candidate_documents`.
- **Fallback**: jika cache kosong saat evaluasi, pipeline menjalankan inline NER agar evaluasi tidak gagal hanya karena background task belum selesai.
- **KHS current**: KHS text-based PDF direduksi PII dan diparse oleh DeepSeek V4 Flash pada post-review background processing; evaluation fallback parse inline jika cache belum tersedia atau stale. Image-based/scanned KHS tanpa text layer ditandai `machine_unreadable`; OCR out-of-scope.

### Evaluation Prompting vs RAG

Istilah "RAG" di project ini mengacu pada pola evaluasi yang memperkaya prompt dengan konteks rubrik dan data kandidat yang aman. Implementasi aktif saat ini belum melakukan retrieval vektor dari ChromaDB saat evaluasi; rubric context dibangun langsung dari tabel `rubrics` dan `dimensions`. KHS hanya masuk prompt sebagai structured academic summary jika rubrik membutuhkan academic evidence.

Konsekuensi:
- Evaluasi tetap berbasis konteks rubrik yang terstruktur.
- LangChain/ChromaDB tetap ada sebagai dependency dan direktori persist, tetapi retrieval vektor dapat dianggap future enhancement.
- Dokumentasi teknis sebaiknya memakai istilah **rubric-augmented LLM scoring** untuk menghindari overclaim.

### Threshold Highlight vs Auto-Announce

Threshold N yang di-set Super Admin adalah **rekomendasi visual** saja:
- Kandidat rank 1-N: highlight hijau di tabel rekruter.
- Keputusan final tetap di tangan rekruter via checklist manual.
- Tidak ada auto-announce berdasarkan threshold.

### Phase Enforcement Matrix

Tabel ringkasan tindakan yang diizinkan per fase:

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
- Server clock-skew dapat menyebabkan kandidat melihat countdown 0 sebelum server benar-benar lock submission; risiko ini acceptable untuk konteks rekrutasi lab.

### Idempotent Rubric Seeding

Saat startup (`main.py` lifespan), `seed_division_rubrics()` memastikan satu rubrik kosong (tanpa dimensi) ada untuk setiap dari 4 divisi. Idempotent: hanya membuat rubrik untuk divisi yang belum punya. Rekruter mengisi dimensi via UI rubric editor sebelum evaluasi pertama.

### Deployment Canonical

Deployment canonical saat ini adalah Docker Compose:

```text
browser → host Nginx/Caddy TLS → frontend container :80
                                     ├─ serve React SPA
                                     └─ /api/ proxy → backend container :8000 → db container :5432
```

Manual `uvicorn` via systemd masih mungkin untuk development/alternative deployment, tetapi bukan jalur deployment utama yang direkomendasikan.

---

## 11. UI/UX Reference

- **Candidate Portal**: Academic Luminary style (mockup MBC).
- **Recruiter Dashboard**: Extended dari Capstone + phase card + evaluation prompt + threshold highlight + bulk publish.
- **Super Admin**: User management + Recruitment Period management + profile management.
- **Announcement**: Bulk publish dengan preview kandidat lolos/tidak sebelum konfirmasi.
- **Legacy Upload**: `/upload` tetap ada off-nav untuk kompatibilitas Capstone, bukan alur utama Lab.

---

## 12. Backlog

| Area | Item |
|---|---|
| Security | Migrasi JWT dari localStorage ke HttpOnly cookie + CSRF token |
| Security | Virus scanning upload (ClamAV atau service setara) |
| AI | Retrieval vektor aktif dengan ChromaDB bila rubric/document context makin besar |
| AI | Implementasi `xai.py` yang lebih formal di luar LLM justification |
| OCR | OCR untuk KTM gambar / scan PDF |
| Notification | Email/WhatsApp notification saat hasil diumumkan |
| Frontend | Code splitting dengan React.lazy untuk bundle size |
| Infra | Redis/shared storage jika suatu saat perlu horizontal scaling |
| Legacy | Hapus `/api/upload` dan `/api/evaluate` setelah Lab pipeline confirmed stable |
