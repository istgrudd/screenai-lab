# Product Requirements Document (PRD)
## ScreenAI Lab — Sistem Screening Rekrutasi Otomatis untuk MBC Laboratory
## Telkom University

---

## Phase Status

| Phase | Scope | Status |
|---|---|---|
| **Phase 1 — Candidate Portal MVP** | Platform pendaftaran + upload dokumen + dashboard kandidat | 🔄 In Progress |
| **Phase 2 — Full Recruitment Flow** | Evaluasi AI + pengumuman hasil + RBAC lengkap | 📋 Planned |
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
| Candidate portal | Phase 2 (planned) | Phase 1 MVP (prioritas utama) |
| Database | SQLite → PostgreSQL | SQLite → PostgreSQL (sesuai resource lab) |
| Branding | ScreenAI | ScreenAI Lab |
| UI style | Dashboard rekruter | Academic Luminary style (mockup MBC) |

### 1.3 Masalah yang Diselesaikan

1. Proses pendaftaran rekrutasi lab masih manual (Google Form + email) → tidak terintegrasi dengan sistem evaluasi.
2. Pengumpulan dokumen tersebar di berbagai platform → sulit dikelola rekruter.
3. Tidak ada transparansi bagi kandidat soal status lamaran mereka.
4. Evaluasi manual rentan bias dan tidak konsisten antar rekruter.

---

## 2. Ruang Lingkup

### Phase 1 — Candidate Portal MVP (🔄 In Progress)

- Registrasi dan login kandidat (JWT-based).
- Form profil mahasiswa (Nama, NIM, Fakultas, Jurusan, Angkatan).
- Pemilihan divisi/posisi (Big Data, Cyber Security, Game Technology, GIS).
- Upload multi-dokumen dengan zona terpisah per tipe dokumen.
- Checklist kelengkapan dokumen sebelum submit.
- Halaman status lamaran kandidat (tracking progress).
- Dashboard rekruter: melihat daftar pelamar + status kelengkapan dokumen.
- Submit final dengan konfirmasi (irreversible).

### Phase 2 — Full Recruitment Flow (📋 Planned)

- Pipeline evaluasi AI dijalankan oleh rekruter (warisan dari Capstone Phase 1).
- Pengumuman hasil seleksi administrasi via platform.
- Skor per dimensi + justifikasi XAI ditampilkan ke rekruter.
- Override penilaian oleh rekruter (dengan audit log).
- Reveal Identity post-evaluasi.
- RBAC lengkap (Super Admin, Recruiter, Candidate).
- Audit log semua tindakan rekruter.

### Phase 3 — Deployment (📋 Planned)

- Backend deployed ke VPS lab atau Railway/Render.
- Frontend deployed ke Vercel/Netlify.
- Migrasi SQLite → PostgreSQL untuk production.
- Environment variables configured untuk production.
- CORS configured untuk production domain.

### Out-of-Scope (Semua Phase)

- PDF berbasis scan / gambar (OCR).
- Sertifikat bahasa non-EPrT sebagai standar utama.
- Generator pertanyaan wawancara (ada di Capstone, tidak diprioritaskan di Lab).
- Notifikasi email otomatis (Phase 3+ backlog).
- Mobile app native.

---

## 3. Dokumen yang Didukung

| ID | Dokumen | Wajib | Diproses AI | Keterangan |
|---|---|---|---|---|
| D-01 | CV (PDF) | ✅ | ✅ RAG + NER | Sama seperti Capstone |
| D-02 | KHS / Transkrip Nilai (PDF) | ✅ | ✅ Parser khusus | Ekstrak IPK + mata kuliah relevan |
| D-03 | KTM / Student ID (PDF/JPG) | ✅ | ✅ Rule-based validator | Verifikasi NIM, status aktif, prodi |
| D-04 | Motivation Letter (PDF) | ✅ | ✅ RAG | Evaluasi kesesuaian motivasi dengan visi lab |
| D-05 | Analisis SWOT Diri Sendiri (PDF) | ✅ | ⚠️ Highlight only | Tidak dijadikan skor — ditampilkan sebagai highlight untuk dibaca rekruter |
| D-06 | Dokumen Pendukung (PDF) | ✅ | ❌ Manual checklist | Kumpulan screenshot bukti follow IG, share broadcast, dll dalam 1 PDF — diverifikasi manual rekruter |

---

## 4. Fitur

### Phase 1 Features — Candidate Portal MVP

#### Modul Autentikasi

| ID | Fitur | Role | Prioritas |
|---|---|---|---|
| F-01 | Registrasi akun Candidate (email + password + data mahasiswa) | Candidate | Must Have |
| F-02 | Login / Logout (JWT) | All | Must Have |
| F-03 | Route protection per role | All | Must Have |

#### Modul Profil Mahasiswa

| ID | Fitur | Role | Prioritas |
|---|---|---|---|
| F-10 | Form profil: Nama Lengkap, NIM, Fakultas, Jurusan, Angkatan | Candidate | Must Have |
| F-11 | Pemilihan divisi/posisi (satu pilihan per periode rekrutasi) | Candidate | Must Have |
| F-12 | Edit profil sebelum submit final | Candidate | Must Have |

#### Modul Upload Dokumen

| ID | Fitur | Role | Prioritas |
|---|---|---|---|
| F-20 | Upload CV (PDF, max 5MB) | Candidate | Must Have |
| F-21 | Upload KHS / Transkrip (PDF, max 5MB) | Candidate | Must Have |
| F-22 | Upload KTM (PDF/JPG, max 2MB) | Candidate | Must Have |
| F-23 | Upload Motivation Letter (PDF, max 5MB) | Candidate | Must Have |
| F-24 | Upload SWOT Analysis (PDF, max 5MB) | Candidate | Must Have |
| F-25 | Upload Dokumen Pendukung (PDF, max 10MB) | Candidate | Must Have |
| F-26 | Multi-step upload flow (per dokumen, ada progress tracker) | Candidate | Must Have |
| F-27 | Preview dokumen yang sudah diupload | Candidate | Should Have |
| F-28 | Replace dokumen sebelum submit final | Candidate | Must Have |
| F-29 | Checklist kelengkapan — semua dokumen wajib harus ada sebelum submit | Candidate | Must Have |

#### Modul Submission & Status

| ID | Fitur | Role | Prioritas |
|---|---|---|---|
| F-30 | Submit Final Application (irreversible, dengan konfirmasi + checklist) | Candidate | Must Have |
| F-31 | Halaman status lamaran: progress tracker (Submitted → AI Screening → Hasil) | Candidate | Must Have |
| F-32 | Progress % kelengkapan aplikasi di dashboard kandidat | Candidate | Should Have |
| F-33 | Countdown deadline pendaftaran | Candidate | Should Have |

#### Modul Dashboard Rekruter (Phase 1 scope)

| ID | Fitur | Role | Prioritas |
|---|---|---|---|
| F-40 | Daftar pelamar per divisi + status kelengkapan dokumen | Recruiter | Must Have |
| F-41 | Lihat detail dokumen per kandidat (preview/download) | Recruiter | Must Have |
| F-42 | Checklist manual verifikasi Dokumen Pendukung (D-06) | Recruiter | Must Have |
| F-43 | Filter pelamar berdasarkan divisi dan status | Recruiter | Should Have |

### Phase 2 Features — Full Recruitment Flow

| ID | Fitur | Role | Prioritas |
|---|---|---|---|
| F-50 | Jalankan pipeline evaluasi AI (NER + RAG + LLM) per batch | Recruiter | Must Have |
| F-51 | KHS Parser: ekstrak IPK + mata kuliah relevan | System | Must Have |
| F-52 | KTM Validator: verifikasi NIM + status aktif (rule-based) | System | Must Have |
| F-53 | SWOT Highlight: tampilkan SWOT kandidat sebagai panel highlight | Recruiter | Must Have |
| F-54 | Skor per dimensi kompetensi + justifikasi XAI | Recruiter | Must Have |
| F-55 | Ranking kandidat per divisi | Recruiter | Must Have |
| F-56 | Override skor + audit log | Recruiter | Must Have |
| F-57 | Reveal Identity post-evaluasi | Recruiter | Must Have |
| F-58 | Pengumuman hasil seleksi administrasi via platform | Recruiter | Must Have |
| F-59 | Kandidat dapat melihat hasil pengumuman dari dashboard | Candidate | Must Have |
| F-60 | RBAC lengkap: Super Admin, Recruiter, Candidate | All | Must Have |
| F-61 | Super Admin: manajemen user + manajemen rubrik | Super Admin | Must Have |

---

## 5. Stack Teknologi

| Layer | Stack | Keterangan |
|---|---|---|
| PDF Parsing | PyMuPDF | Sama seperti Capstone |
| NER | IndoBERT (ageng-anugrah/indobert-large-p2-finetuned-ner) | Sama seperti Capstone |
| RAG & Orchestration | LangChain | Sama seperti Capstone |
| Vector Store | ChromaDB (persistent) | Sama seperti Capstone |
| LLM Inference | DeepSeek V3 (deepseek-chat) | Sama seperti Capstone |
| KHS Parser | Custom rule-based + PyMuPDF | Baru di Lab |
| KTM Validator | Custom rule-based | Baru di Lab |
| Backend | FastAPI + python-jose (JWT) + passlib (bcrypt) | Extended dari Capstone |
| Frontend | React + Vite + Tailwind + shadcn/ui | Extended dari Capstone, UI style Academic Luminary |
| Database | SQLite (dev/prod awal) | Sesuai resource server lab |
| Auth | JWT-based, httpOnly cookie atau localStorage | Baru di Lab Phase 1 |
| Deployment | VPS lab / Railway + Vercel | Phase 3 |

---

## 6. Alur Sistem

### Phase 1 — Candidate Portal Flow
```
Candidate: Register (NIM, nama, prodi, angkatan)
    → Login
    → Lengkapi profil (pilih divisi)
    → Upload dokumen step-by-step:
        Step 1: CV
        Step 2: Motivation Letter
        Step 3: KHS / Transkrip
        Step 4: KTM
        Step 5: SWOT Analysis
        Step 6: Dokumen Pendukung
    → Review & checklist kelengkapan
    → Submit Final (irreversible)
    → Dashboard: status "Submitted — Menunggu Proses"

Recruiter: Login
    → Dashboard: daftar pelamar + status kelengkapan
    → Lihat dokumen per kandidat
    → Checklist manual Dokumen Pendukung
```

### Phase 2 — Full Recruitment Flow
```
Recruiter: Login
    → Dashboard → Filter per divisi
    → Run Evaluation (batch)
        → KTM Validator (rule-based)
        → KHS Parser (IPK + mata kuliah)
        → NER Anonymization (CV + Motivation Letter)
        → RAG Pipeline (CV + Motivation Letter + KHS → rubrik)
        → LLM Inference (DeepSeek V3)
        → SWOT ditampilkan sebagai highlight (tidak di-score)
        → Dokumen Pendukung: checklist manual rekruter
    → Ranking + Skor + Justifikasi XAI
    → Override (logged) → Reveal Identity
    → Publish pengumuman hasil administrasi

Candidate: Login → Dashboard → Lihat status pengumuman
```

---

## 7. Role Definitions

| Role | Akses |
|---|---|
| **Super Admin** | Semua fitur + manage users + manage rubrics + manage recruitment period |
| **Recruiter** | Dashboard pelamar, detail kandidat, run evaluation, override, reveal identity, publish pengumuman |
| **Candidate** | Registrasi, upload dokumen, submit lamaran, lihat status & pengumuman |

---

## 8. Non-Fungsional

| Kategori | Target |
|---|---|
| Auth security | JWT dengan expiry 8 jam, bcrypt password hashing |
| Data privacy | Data lokal server lab, tidak diunggah ke third-party public service |
| NER accuracy | Miss rate ≤ 5% (sama seperti Capstone) |
| File upload | Max size per dokumen: CV/KHS/ML/SWOT 5MB, KTM 2MB, Dok. Pendukung 10MB |
| Supported format | PDF untuk semua dokumen utama; JPG/PNG untuk KTM (opsional) |
| Database | SQLite untuk development dan production awal (sesuai resource server lab) |
| Batch performance | Mampu memproses 240 dokumen tanpa timeout |
| Availability | Local/VPS lab — target best-effort selama periode rekrutasi aktif |

---

## 9. Perbedaan Teknis Dokumen Baru vs Capstone

### KHS Parser (D-02)
- Input: PDF KHS/Transkrip dari Telkom University
- Output: `{ "ipk": float, "total_sks": int, "relevant_courses": [{"name": str, "grade": str, "semester": int}] }`
- Metode: PyMuPDF extraction + rule-based pattern matching (format KHS Telkom)
- Digunakan: sebagai sinyal tambahan dalam RAG context (bukan skor terpisah)

### KTM Validator (D-03)
- Input: PDF/JPG KTM
- Output: `{ "valid": bool, "nim": str, "name": str, "faculty": str, "major": str, "status": "aktif/tidak aktif" }`
- Metode: Rule-based regex matching format NIM Telkom University
- Digunakan: filter awal (mandatory pass), tidak masuk RAG

### SWOT Highlight (D-05)
- Input: PDF SWOT Analysis
- Output: teks ter-ekstrak, ditampilkan sebagai panel highlight di halaman detail kandidat
- Tidak di-score oleh AI — murni untuk dibaca rekruter sebagai bahan pertimbangan kualitatif

### Dokumen Pendukung (D-06)
- Input: 1 file PDF berisi kumpulan screenshot (follow IG, share broadcast, dll)
- Output: checkbox boolean di dashboard rekruter (Verified / Not Verified)
- Diverifikasi manual oleh rekruter — tidak diproses AI

---

## 10. UI/UX Reference

Desain kandidat portal mengikuti mockup "Academic Luminary style" yang telah dibuat oleh anggota tim, mencakup:

- **Dashboard Kandidat**: progress %, checklist dokumen, countdown deadline, status aplikasi
- **Profile Page**: form Personal Info + Division Selection (card-based, single select)
- **Document Upload Center**: multi-step dengan progress tracker (CV → Motivation Letter → Transcript → KTM → SWOT → Proof)
- **Review & Finalize**: ringkasan profil + daftar dokumen + warning irreversible + final checklist
- **Submission Confirmed**: status page dengan recruitment journey tracker
- **Application Result** (Phase 2): AI Score Summary per dimensi + recruitment journey timeline

Warna, tipografi, dan komponen mengikuti sistem yang sudah ada (Tailwind + shadcn/ui), disesuaikan dengan branding MBC Laboratory.
