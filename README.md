# ScreenAI Lab

Developer-oriented README for **ScreenAI Lab**, an AI-assisted recruitment screening platform for **MBC Laboratory, Telkom University**.

ScreenAI Lab is forked and adapted from [ScreenAI (Capstone)](https://github.com/istgrudd/screenai). It adds a full candidate portal, recruitment-period management, multi-document upload, submit-time NER anonymization, rubric-based AI scoring, recruiter review, and bulk pass/fail announcement.

Production deployment is standardized on **Docker Compose on a self-hosted VPS**: React/nginx frontend, FastAPI backend, and PostgreSQL run as containers; HTTPS is terminated by a host-level Nginx/Caddy reverse proxy outside Docker.

---

## Table of Contents

- [1. What This Repo Contains](#1-what-this-repo-contains)
- [2. Tech Stack](#2-tech-stack)
- [3. Local Development](#3-local-development)
- [4. Production Deployment](#4-production-deployment)
- [5. Environment Variables](#5-environment-variables)
- [6. Development Workflow](#6-development-workflow)
- [7. Storage and Generated Files](#7-storage-and-generated-files)
- [8. Testing and Smoke Checks](#8-testing-and-smoke-checks)
- [9. Troubleshooting](#9-troubleshooting)
- [10. Documentation Map](#10-documentation-map)

---

## 1. What This Repo Contains

Core product flow:

```text
Candidate:
  register/login → profile → choose division → upload 6 documents
  → review → submit final → wait for result → see pass/fail announcement

System:
  submit final → BackgroundTask anonymizes CV + Motivation Letter
  → cached anonymized text is stored for evaluation

Recruiter:
  dashboard → run batch evaluation per division
  → review scores, documents, SWOT, and justifications
  → optionally override score → checklist passing candidates
  → bulk publish pass/fail result

Super Admin:
  manage users → manage recruitment periods → set threshold highlight
```

Main roles:

| Role | Main access |
|---|---|
| `candidate` | Register, complete profile, upload documents, submit, view status/result |
| `recruiter` | View applications, run evaluation, review candidates, override scores, publish results |
| `super_admin` | Recruiter access + user management + recruitment period management |

Main document types:

| Type | Format | Purpose |
|---|---|---|
| CV | PDF | NER + AI scoring |
| KHS / transcript | PDF | IPK + relevant course extraction |
| KTM / student ID | PDF/JPG/PNG | NIM validation soft warning |
| Motivation Letter | PDF | NER + AI scoring context |
| SWOT | PDF | Recruiter qualitative highlight only |
| Supporting Documents | PDF | Manual verification |

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, SQLAlchemy, Alembic, Pydantic |
| Auth | JWT with `python-jose`, bcrypt password hashing |
| Database | SQLite for local development, PostgreSQL 16 for Docker/VPS production |
| File parsing | PyMuPDF |
| NER | IndoBERT model `ageng-anugrah/indobert-large-p2-finetuned-ner` |
| AI scoring | Rubric-augmented LLM scoring |
| LLM | DeepSeek V4 Flash (`deepseek-v4-flash`) through OpenAI-compatible SDK |
| Vector/RAG dependencies | LangChain + ChromaDB are present for compatibility/future retrieval; current scoring inlines rubric context |
| Frontend | React, Vite, Tailwind CSS, shadcn/ui |
| Production runtime | Docker Compose: `frontend`, `backend`, `db` |

---

## 3. Local Development

### 3.1 Prerequisites

- Python 3.10+; Python 3.11 is recommended because the Docker backend image uses Python 3.11.
- Node.js 18+.
- DeepSeek API key for evaluation calls.
- Around 4 GB free disk space for model/cache files.

### 3.2 Clone and configure

```bash
git clone https://github.com/istgrudd/screenai-lab.git
cd screenai-lab
cp .env.example .env
```

For local development, the default `.env.example` values are enough to boot the app. Add `DEEPSEEK_API_KEY` when you want to run AI evaluation.

Local default database:

```env
DATABASE_URL=sqlite:///./data/screenai_lab.db
```

### 3.3 Backend dev server

```bash
python -m venv venv
source venv/bin/activate       # Linux/macOS
# venv\Scripts\activate       # Windows PowerShell/CMD equivalent

pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8000
```

Backend URL:

```text
http://localhost:8000
```

Health check:

```bash
curl http://localhost:8000/api/health
```

On startup, the backend automatically:

- creates required local directories;
- runs Alembic migrations;
- seeds one empty rubric for each MBC division if missing.

### 3.4 Frontend dev server

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend URL:

```text
http://localhost:5173
```

Frontend API base URL defaults to:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000/api
```

---

## 4. Production Deployment

Canonical production deployment uses Docker Compose from the project root.

```bash
cp .env.example .env
# Fill in the "Docker / VPS Production" block.

docker compose up --build -d
docker compose ps
```

Production topology:

```text
browser HTTPS -> host Nginx/Caddy -> frontend container :80
                                        ├─ serve React SPA
                                        └─ /api -> backend container :8000 -> db container :5432
```

Important production rules:

- `ENVIRONMENT` must be non-`development`, for example `production`.
- `SECRET_KEY` must be replaced with a strong random value.
- `ALLOWED_ORIGINS` must include the exact browser origin, for example `https://screenai.example.org`.
- `DATABASE_URL` must use the Compose service hostname `db`, not `localhost`.
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` must match `DATABASE_URL`.
- `VITE_API_BASE_URL` is build-time. For same-domain deployment through `frontend/nginx.conf`, use `/api`.
- TLS is handled by host-level Nginx/Caddy, not inside Docker.

Example production block:

```env
ENVIRONMENT=production
SECRET_KEY=<strong-random-secret>
ALLOWED_ORIGINS=https://screenai.example.org
DEEPSEEK_API_KEY=<deepseek-key>

POSTGRES_USER=screenai
POSTGRES_PASSWORD=<strong-db-password>
POSTGRES_DB=screenai_lab
DATABASE_URL=postgresql://screenai:<strong-db-password>@db:5432/screenai_lab

VITE_API_BASE_URL=/api
```

Full guide: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## 5. Environment Variables

The project root `.env` is used by both local development and Docker Compose.

| Variable | Scope | Local default / production note |
|---|---|---|
| `ENVIRONMENT` | Backend | Local: `development`; production: `production` |
| `APP_PORT` | Backend | Startup banner / local app port metadata |
| `DATABASE_URL` | Backend | Local SQLite; production PostgreSQL at `db:5432` |
| `SECRET_KEY` | Backend | Must be strong in production; placeholder is refused in non-dev |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Backend | Default 480 minutes |
| `FRONTEND_URL` | Backend | Dev CORS fallback |
| `ALLOWED_ORIGINS` | Backend | Required in production |
| `DEEPSEEK_API_KEY` | Backend | Required for evaluation calls |
| `DEEPSEEK_BASE_URL` | Backend | Defaults to DeepSeek OpenAI-compatible endpoint |
| `NER_MODEL_NAME` | Backend | HuggingFace NER model id |
| `EMBEDDING_MODEL_NAME` | Backend | Reserved/future retrieval embedding model |
| `CHROMA_PERSIST_DIR` | Backend | ChromaDB directory, currently reserved/future retrieval |
| `POSTGRES_USER` | DB container | Production only; must match `DATABASE_URL` |
| `POSTGRES_PASSWORD` | DB container | Production only; must match `DATABASE_URL` |
| `POSTGRES_DB` | DB container | Production only; must match `DATABASE_URL` |
| `VITE_API_BASE_URL` | Frontend build | Build-time API base URL; rebuild frontend when changed |

---

## 6. Development Workflow

### Backend changes

Typical loop:

```bash
source venv/bin/activate
uvicorn backend.main:app --reload --port 8000
```

When changing models:

```bash
alembic revision --autogenerate -m "describe change"
alembic upgrade head
```

The app also runs `alembic upgrade head` on backend startup, but creating the migration file is still a developer responsibility.

### Frontend changes

```bash
cd frontend
npm run dev
```

Production build sanity check:

```bash
cd frontend
npm run build
```

### Docker sanity check

```bash
docker compose config
docker compose up --build -d
docker compose logs -f backend
```

Check important mounts:

```bash
docker compose exec backend ls -la /app/data
docker compose exec backend ls -la /app/uploads
docker compose exec backend ls -la /app/models
```

---

## 7. Storage and Generated Files

Local/manual runtime:

```text
data/
├── screenai_lab.db       # SQLite local DB
├── raw_pdfs/             # legacy Capstone artifacts
├── extracted/            # extracted text artifacts
└── anonymized/           # anonymized text artifacts

uploads/
└── {application_id}/     # candidate-submitted documents

models/ner/               # HuggingFace cache
backend/vectorstore/      # ChromaDB directory, reserved/future retrieval
```

Docker production persistence:

| Host path / volume | Container path | Purpose |
|---|---|---|
| `postgres_data` volume | `/var/lib/postgresql/data` | PostgreSQL data |
| `./data` | `/app/data` | SQLite dev DB and legacy artifacts |
| `./uploads` | `/app/uploads` | Candidate-uploaded documents |
| `./models` | `/app/models` | HuggingFace / IndoBERT cache |

Generated files are intentionally gitignored.

---

## 8. Testing and Smoke Checks

There is no full CI workflow in the repository yet. For now, use targeted smoke scripts and manual checks.

Recommended manual checks after backend boot:

```bash
curl http://localhost:8000/api/health
```

Useful smoke-test entry points live under `scripts/`, for example:

```bash
python scripts/smoke_test_auth.py
python scripts/smoke_test_periods.py
python scripts/smoke_test_applications.py
python scripts/smoke_test_upload.py
python scripts/smoke_test_evaluation.py
python scripts/smoke_test_bulk_announce.py
```

Exact script requirements may vary; inspect the script before running if it needs a live backend, seeded users, uploaded documents, or specific credentials.

Frontend build check:

```bash
cd frontend
npm run build
```

Docker config check:

```bash
docker compose config
```

---

## 9. Troubleshooting

### Backend refuses to start in production

Likely cause: production startup guard.

Check:

```env
ENVIRONMENT=production
SECRET_KEY=<not dev placeholder>
ALLOWED_ORIGINS=https://your-domain.example
```

### Frontend calls `127.0.0.1:8000` in production

Likely cause: `VITE_API_BASE_URL` was not set before build.

Fix:

```bash
# update .env first, then rebuild frontend
VITE_API_BASE_URL=/api
docker compose build --no-cache frontend
docker compose up -d frontend
```

### Backend cannot connect to Postgres in Docker

In Docker Compose, backend reaches Postgres through service name `db`:

```env
DATABASE_URL=postgresql://screenai:<password>@db:5432/screenai_lab
```

Do not use `localhost` inside the backend container.

### First evaluation is slow

The IndoBERT model may be downloaded on first use. Watch backend logs:

```bash
docker compose logs -f backend
```

The model cache is persisted through `./models:/app/models`.

### Uploaded candidate files disappear after Docker recreate

Check that Compose includes the upload mount:

```yaml
./uploads:/app/uploads
```

Then verify:

```bash
docker compose exec backend ls -la /app/uploads
ls -la ./uploads
```

---

## 10. Documentation Map

| Document | Purpose |
|---|---|
| [PRD.md](PRD.md) | Product requirements, scope, phase status, backlog |
| [CLAUDE.md](CLAUDE.md) | Implementation roadmap / execution context |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Architecture snapshot and runtime topology |
| [docs/API_REFERENCE.md](docs/API_REFERENCE.md) | Endpoint reference |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | VPS Docker deployment guide |
| [docs/FLOW_DIAGRAMS.md](docs/FLOW_DIAGRAMS.md) | Mermaid flow/sequence diagrams |
| [docs/MODULE_ANALYSIS.md](docs/MODULE_ANALYSIS.md) | Module-level notes and implementation details |
| [docs/ISSUES_AND_NOTES.md](docs/ISSUES_AND_NOTES.md) | Known issues, decisions, and notes |
| [docs/reports/](docs/reports/) | Batch reports and cleanup reports |

---

## Team

**MBC Laboratory** — Telkom University 2026

Forked from Capstone Design *Kelompok 26* (ScreenAI).
