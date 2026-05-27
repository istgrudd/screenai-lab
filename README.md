# ScreenAI Lab — MBC Laboratory Recruitment Screening System

An AI-powered candidate screening platform for **MBC Laboratory, Telkom University**, forked and adapted from [ScreenAI (Capstone)](https://github.com/istgrudd/screenai). ScreenAI Lab adds a candidate portal for student registration and multi-document upload (CV, KHS, KTM, Motivation Letter, SWOT, Dokumen Pendukung), recruitment-period management, submit-time NER anonymization, AI-assisted scoring, recruiter crosscheck, and bulk announcement.

The canonical production deployment path is **Docker Compose on a self-hosted VPS**: frontend nginx, FastAPI backend, and PostgreSQL run as containers; TLS is terminated by a host-level Nginx/Caddy reverse proxy outside Docker.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI + SQLAlchemy + Alembic + SQLite (dev) / PostgreSQL 16 (Docker prod) |
| Auth | JWT (python-jose) + bcrypt (direct, no passlib) |
| PDF Parsing | PyMuPDF |
| NER (Anonymization) | IndoBERT (`ageng-anugrah/indobert-large-p2-finetuned-ner`) |
| AI Scoring | Rubric-augmented LLM scoring |
| RAG / Vector Store | LangChain + ChromaDB dependencies are present for compatibility/future retrieval; current scoring inlines rubric context |
| LLM Inference | DeepSeek V4 Flash (`deepseek-v4-flash`, OpenAI-compatible API) |
| Frontend | React + Vite + Tailwind CSS + shadcn/ui |
| Production Runtime | Docker Compose (`frontend`, `backend`, `db`) behind host Nginx/Caddy TLS |

---

## Prerequisites

### Local development

- Python 3.10+
- Node.js 18+
- DeepSeek API key for evaluation calls
- ~4 GB disk space for the IndoBERT model cache

### Production / VPS deployment

- Linux VPS (Ubuntu 22.04 LTS or Debian 12 recommended)
- Docker Engine + Docker Compose v2 plugin
- Host-level Nginx or Caddy for HTTPS termination
- Public domain or IP pointing to the VPS

---

## Quick Start — Local Development

### 1. Clone the repository

```bash
git clone https://github.com/istgrudd/screenai-lab.git
cd screenai-lab
```

### 2. Backend

```bash
python -m venv venv
source venv/bin/activate       # Linux/macOS
# venv\Scripts\activate       # Windows

pip install -r requirements.txt
cp .env.example .env
# Fill in DEEPSEEK_API_KEY if you want to run evaluation.

uvicorn backend.main:app --reload --port 8000
```

API will be available at `http://localhost:8000`. Health check: `GET /api/health`.

The backend runs Alembic migrations and idempotent division-rubric seeding automatically during FastAPI startup. `scripts/seed_rubric.py` is only for optional local/sample data workflows.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

UI will be available at `http://localhost:5173`.

---

## Production Deployment — Canonical Docker Compose Path

Production is expected to run from the project root with `docker compose`:

```bash
cp .env.example .env
# Fill in the "Docker / VPS Production" block in .env.

docker compose up --build -d
docker compose ps
```

Runtime topology:

```text
browser HTTPS -> host Nginx/Caddy -> frontend container :80
                                        ├─ serves React SPA
                                        └─ /api -> backend container :8000 -> db container :5432
```

Key production notes:

- `DATABASE_URL` must point to the Compose database service, for example `postgresql://screenai:<password>@db:5432/screenai_lab`.
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` must match `DATABASE_URL`.
- `ENVIRONMENT` must be non-`development` for production startup guards.
- `SECRET_KEY` must not use the dev placeholder.
- `ALLOWED_ORIGINS` must include the exact browser origin, for example `https://screenai.example.org`.
- `VITE_API_BASE_URL` is build-time. For same-domain deployment through `frontend/nginx.conf`, use `VITE_API_BASE_URL=/api`.
- TLS is handled by the host-level reverse proxy, not inside Docker.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full VPS walkthrough, backup/restore steps, and troubleshooting.

---

## Project Structure

```text
screenai-lab/
├── backend/
│   ├── main.py              # FastAPI entry point, lifespan, router registration
│   ├── models/              # SQLAlchemy ORM models
│   ├── routers/             # API route handlers
│   ├── services/            # Core business / AI pipeline logic
│   │   ├── extractor.py     # PDF → raw text (PyMuPDF)
│   │   ├── anonymizer.py    # NER-based identity masking
│   │   ├── rag_pipeline.py  # Rubric-augmented LLM prompt + DeepSeek call
│   │   └── scoring.py       # Weighted score aggregation
│   └── utils/               # LLM client, security, period, file storage helpers
├── frontend/
│   ├── Dockerfile           # Multi-stage Vite build + nginx runtime
│   ├── nginx.conf           # SPA server + /api proxy to backend service
│   └── src/
│       ├── pages/           # Candidate, Recruiter, Admin pages
│       └── components/      # UI components
├── docs/                    # Architecture, API reference, deployment, reports
├── docker-compose.yml       # Canonical VPS deployment topology
├── data/                    # Local data (gitignored)
├── uploads/                 # Candidate uploads in local/manual runs (gitignored)
├── models/                  # HuggingFace cache (gitignored)
├── requirements.txt
├── .env.example
├── PRD.md                   # Product requirements
└── CLAUDE.md                # Execution plan / implementation roadmap
```

---

## Features

### Inherited from Capstone / adapted

- **Blind Screening** — automatic anonymization of names, contacts, institutions via IndoBERT NER + regex fallback.
- **Rubric Configuration** — define competency dimensions, weights, and indicators per division.
- **AI Scoring** — generate structured per-dimension scores via DeepSeek V4 Flash using anonymized candidate text and rubric context.
- **Explainability** — every score stores evidence/justification in `DimensionScore`.
- **Candidate Ranking** — dashboard ranking by composite score.
- **Score Override** — recruiters can manually adjust dimension scores; overrides are audit-logged.
- **Batch Processing** — evaluate candidates per division.

### Added in ScreenAI Lab

- **Candidate Portal** — registration, login, profile, and multi-step document upload.
- **Recruitment Period Management** — phase-aware `UPCOMING → SUBMISSION → EVALUATION → ANNOUNCEMENT → CLOSED` flow.
- **Submit-time NER** — CV and Motivation Letter anonymized in a FastAPI BackgroundTask after submit.
- **KHS Parser** — extract IPK + relevant courses from Telkom University transcripts.
- **KTM Validator** — rule-based NIM verification for Telkom students.
- **SWOT Highlight** — read-only panel for recruiter qualitative review.
- **Dokumen Pendukung** — manual verification checklist for supporting evidence.
- **Bulk Announcement** — recruiter checklist + publish pass/fail results per division and period.
- **RBAC** — Super Admin, Recruiter, Candidate roles with JWT-based auth.

See [PRD.md](./PRD.md) for the full product spec and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the architecture snapshot.

---

## Team

**MBC Laboratory** — Telkom University 2026
Forked from Capstone Design *Kelompok 26* (ScreenAI).
