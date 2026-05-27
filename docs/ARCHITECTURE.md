# Architecture

> Snapshot of the ScreenAI Lab system as of the current `main` branch.
>
> Product-level source of truth: [PRD.md](../PRD.md). Deployment source of truth: [DEPLOYMENT.md](DEPLOYMENT.md).

---

## 1. Overview

**ScreenAI Lab** is the AI-powered recruitment screening system for the **MBC Laboratory, Telkom University**. It replaces a manual recruiting workflow with:

- A **candidate self-service portal**: registration → profile → multi-document upload → review → submit.
- A **phase-aware recruitment period**: `UPCOMING → SUBMISSION → EVALUATION → ANNOUNCEMENT → CLOSED`.
- A **submit-time anonymization pipeline**: CV + Motivation Letter are anonymized through IndoBERT NER in a FastAPI BackgroundTask.
- A **rubric-augmented LLM scoring pipeline**: cached anonymized candidate text, KHS summary, Motivation Letter, and division rubric are sent to DeepSeek V4 Flash for structured scoring.
- A **recruiter / super-admin console**: filtering, evaluation, re-evaluation, score override, threshold highlight, manual checklist, and bulk announcement.

The repo was forked from the Capstone project [`istgrudd/screenai`](https://github.com/istgrudd/screenai). Legacy Capstone endpoints (`POST /api/upload`, `POST /api/evaluate`) remain mounted for compatibility, but the Lab pipeline is the primary path.

| Phase | Description | Status |
|---|---|---|
| 0 | Fork & cleanup | ✅ Complete |
| 1 | Candidate Portal MVP | ✅ Complete |
| 2 | Full Recruitment Flow | ✅ Complete |
| 3 | Docker/VPS deployment | 🔄 In Progress — assets ready, production cutover pending |

---

## 2. High-Level Architecture

Production is designed for a **single self-hosted VPS** using Docker Compose. TLS is terminated by a host-level reverse proxy outside Docker.

```mermaid
graph LR
    subgraph Client
        BR[Browser<br/>React SPA]
    end

    subgraph VPS[Self-hosted VPS]
        RP[Host Nginx/Caddy<br/>TLS termination]

        subgraph Docker[Docker Compose network]
            FE[frontend container<br/>nginx + React build<br/>port 80 published]
            API[backend container<br/>FastAPI + uvicorn<br/>port 8000 internal]
            DB[(db container<br/>PostgreSQL 16<br/>port 5432 internal)]
            BG[FastAPI BackgroundTasks<br/>submit-time NER]

            FE -- /api proxy --> API
            API <--> DB
            API -. schedules .-> BG
        end

        RP -- plain HTTP --> FE
    end

    subgraph HostStorage[Host-mounted / persisted state]
        DATA[./data<br/>SQLite dev, raw/extracted/anonymized data]
        UPLOADS[./uploads<br/>candidate documents]
        MODELS[./models<br/>HuggingFace cache]
        PGVOL[postgres_data volume]
    end

    subgraph ExternalAI[External AI services]
        DS[DeepSeek V4 Flash<br/>api.deepseek.com/v1]
        HF[HuggingFace<br/>IndoBERT model download]
    end

    BR -- HTTPS --> RP
    API --> DS
    API --> HF
    BG --> HF
    API --- DATA
    API --- UPLOADS
    API --- MODELS
    DB --- PGVOL
```

Runtime path:

```text
browser HTTPS -> host Nginx/Caddy -> frontend container :80
                                        ├─ serve React SPA
                                        └─ /api -> backend container :8000 -> db container :5432
```

Key data paths:

1. **Submit-time NER**: `submit_application` commits the application, then schedules a background task that opens its own `SessionLocal`, extracts CV + Motivation Letter, anonymizes text, and caches it in `candidate_documents.anonymized_text`.
2. **Evaluation**: recruiter triggers `POST /api/recruiter/evaluate/batch`; the pipeline checks NER cache, falls back to inline NER when needed, parses KHS, validates KTM, builds a rubric-augmented prompt, calls DeepSeek V4 Flash, persists `DimensionScore`, and updates `Candidate.composite_score`.
3. **Phase derivation**: `backend/utils/period_utils.py::get_current_phase` derives the active phase from calendar boundaries. No cron/scheduler is required.
4. **Announcement**: recruiter selects passing applications and calls `POST /api/announcements/bulk`; the backend updates pass/fail statuses atomically and writes `AuditLog` rows.

---

## 3. Deployment Model

### Canonical production path

| Component | Production runtime | Notes |
|---|---|---|
| Frontend | Docker container built from `frontend/Dockerfile` | nginx serves SPA and proxies `/api/` to backend service |
| Backend | Docker container built from `backend/Dockerfile` | `uvicorn backend.main:app --host 0.0.0.0 --port 8000` |
| Database | Docker Compose service `db` | `postgres:16-alpine`, internal hostname `db` |
| TLS | Host OS, outside Docker | Nginx/Caddy terminates HTTPS and forwards to frontend container port 80 |
| Migrations | Backend lifespan | `alembic upgrade head` runs on FastAPI startup |
| Rubric seeding | Backend lifespan | one empty rubric per division, idempotent |

Manual `uvicorn` via systemd/supervisor is not the recommended production path anymore. It can still be used for local experiments or emergency fallback, but Docker Compose is the canonical deployment documented in [DEPLOYMENT.md](DEPLOYMENT.md).

### Important production env values

```env
ENVIRONMENT=production
SECRET_KEY=<strong random value>
ALLOWED_ORIGINS=https://your-domain.example
DEEPSEEK_API_KEY=<key>
DATABASE_URL=postgresql://screenai:<password>@db:5432/screenai_lab
POSTGRES_USER=screenai
POSTGRES_PASSWORD=<same password>
POSTGRES_DB=screenai_lab
VITE_API_BASE_URL=/api
```

Notes:

- `DATABASE_URL` must use `db` as hostname in Docker Compose, not `localhost`.
- `VITE_API_BASE_URL` is build-time. Rebuild the frontend when it changes.
- TLS is intentionally outside Docker so cert renewal is independent from app containers.

---

## 4. Directory Tree

Annotated view of meaningful paths:

```text
screenai-lab/
├── README.md                 — quick start + canonical deployment summary
├── PRD.md                    — product requirements and phase status
├── CLAUDE.md                 — execution plan / implementation roadmap
├── docker-compose.yml        — canonical VPS deployment topology
├── .env.example              — local dev + Docker/VPS production env template
├── requirements.txt          — Python dependencies
├── alembic.ini               — Alembic config
│
├── backend/
│   ├── Dockerfile            — backend image (Python 3.11 slim)
│   ├── main.py               — FastAPI app entry, lifespan, CORS, router registration
│   ├── config.py             — pydantic-settings Settings
│   ├── database.py           — SQLAlchemy engine/session + Alembic auto-upgrade
│   │
│   ├── alembic/              — migration environment + version files
│   │
│   ├── middleware/
│   │   ├── auth_middleware.py — bearer JWT + require_role
│   │   └── rate_limit.py      — slowapi key function / limiter
│   │
│   ├── models/
│   │   ├── user.py            — User + UserRole
│   │   ├── application.py     — Application + status/division enums
│   │   ├── document.py        — Document + DocumentType
│   │   ├── candidate.py       — Candidate, CandidateDocument, DimensionScore
│   │   ├── rubric.py          — Rubric + Dimension
│   │   ├── period.py          — RecruitmentPeriod + current_phase property
│   │   └── audit.py           — AuditLog
│   │
│   ├── routers/
│   │   ├── auth.py            — register / login / logout / me / admin reset password
│   │   ├── users.py           — self-service profile + super-admin user management
│   │   ├── applications.py    — application CRUD + submit + recruiter list
│   │   ├── documents.py       — upload / list / download / verify
│   │   ├── periods.py         — RecruitmentPeriod CRUD + active stats
│   │   ├── rubrics.py         — rubric CRUD
│   │   ├── candidates.py      — candidate detail + score override + history
│   │   ├── evaluate_batch.py  — division-based batch evaluation
│   │   ├── evaluation.py      — deprecated legacy /api/evaluate
│   │   ├── upload.py          — deprecated legacy /api/upload
│   │   └── announcements.py   — individual + bulk announce + candidate result
│   │
│   ├── services/
│   │   ├── auth_service.py         — JWT + password auth
│   │   ├── extractor.py            — PyMuPDF PDF extraction + EPrT helper
│   │   ├── normalizer.py           — text cleanup + section segmentation
│   │   ├── anonymizer.py           — NER + regex anonymization
│   │   ├── khs_parser.py           — KHS parser
│   │   ├── ktm_validator.py        — KTM validator
│   │   ├── submit_anonymization.py — BackgroundTask submit-time processing
│   │   ├── evaluation_service.py   — full evaluation orchestration
│   │   ├── rag_pipeline.py         — rubric-augmented prompt + DeepSeek JSON parsing
│   │   ├── scoring.py              — persist scores + validate weights
│   │   ├── rubric_seeding.py       — idempotent division-rubric seed
│   │   └── xai.py                  — future formal XAI module stub
│   │
│   └── utils/
│       ├── llm_client.py           — DeepSeek OpenAI-compatible client
│       ├── security.py             — bcrypt helpers
│       ├── period_utils.py         — pure phase derivation
│       └── file_storage.py         — upload validation + persistence helpers
│
├── frontend/
│   ├── Dockerfile            — Vite build + nginx runtime
│   ├── nginx.conf            — SPA static serving + /api proxy
│   ├── package.json          — React 19 + Vite 8 + Tailwind 4
│   └── src/
│       ├── App.jsx           — BrowserRouter + role-aware route tree
│       ├── lib/              — API/auth/phase/utils helpers
│       ├── components/       — protected route, upload step, phase card, UI primitives
│       └── pages/            — candidate, recruiter, admin pages
│
├── docs/
│   ├── DEPLOYMENT.md         — canonical Docker/VPS deployment guide
│   ├── ARCHITECTURE.md       — this file
│   ├── API_REFERENCE.md      — endpoint reference
│   ├── MODULE_ANALYSIS.md    — module notes
│   ├── FLOW_DIAGRAMS.md      — Mermaid diagrams
│   └── reports/              — batch reports / cleanup reports
│
├── data/                     — local/manual runtime state (gitignored)
├── uploads/                  — candidate uploads in local/manual runs (gitignored)
├── models/                   — HuggingFace cache (gitignored)
└── scripts/                  — smoke tests + helper scripts
```

---

## 5. Tech Stack

### Backend

| Package | Role |
|---|---|
| FastAPI | HTTP framework + dependency injection |
| Uvicorn | ASGI server inside backend container |
| SQLAlchemy | ORM |
| Alembic | Schema migrations, auto-run on startup |
| Pydantic / pydantic-settings | Request/response validation + env config |
| python-jose | JWT encode/decode |
| bcrypt | Password hashing |
| slowapi | Rate limiting |
| PyMuPDF | PDF text extraction |
| OpenAI SDK | DeepSeek V4 Flash OpenAI-compatible client |
| transformers + torch | IndoBERT NER pipeline |
| LangChain + ChromaDB | Dependencies available for future vector retrieval; not active retrieval path today |
| psycopg2-binary | PostgreSQL driver |

### Frontend

| Package | Role |
|---|---|
| React / React DOM | UI framework |
| React Router | Client-side routing |
| Vite | Dev server + production bundler |
| Tailwind CSS | Utility CSS |
| shadcn/radix-ui | UI primitives |
| lucide-react | Icons |
| sonner | Toast notifications |
| recharts | Charts in candidate detail |

### AI / ML Pipeline

| Component | Default config |
|---|---|
| LLM | `deepseek-v4-flash`, temperature `0.1`, max 4096 tokens, 3 retries |
| NER | `ageng-anugrah/indobert-large-p2-finetuned-ner` |
| Embeddings | `sentence-transformers/all-MiniLM-L6-v2` |
| Vector store | ChromaDB at `CHROMA_PERSIST_DIR`; reserved/future retrieval |
| PDF extraction | PyMuPDF `page.get_text("text")` |

---

## 6. External Services & Integrations

### DeepSeek V4 Flash

- **Endpoint:** `DEEPSEEK_BASE_URL`, default `https://api.deepseek.com/v1`.
- **Auth:** `DEEPSEEK_API_KEY`.
- **Client:** OpenAI-compatible SDK wrapper in `backend/utils/llm_client.py`.
- **Used by:** `backend/services/rag_pipeline.py` for rubric-augmented JSON scoring.

### HuggingFace Transformers

- **Model:** `NER_MODEL_NAME`, default `ageng-anugrah/indobert-large-p2-finetuned-ner`.
- **Cache:** `./models/ner` by default.
- **Runtime:** first NER/evaluation call may download the model; Docker deployment mounts `./models` so restarts reuse the cache.

### ChromaDB

- **Persistence:** `CHROMA_PERSIST_DIR`, default `./backend/vectorstore`.
- **Current status:** dependency exists and directory is created, but evaluation currently inlines rubric context directly into the LLM prompt.

---

## 7. Environment Variables

Variables are defined in `.env.example`. Backend variables are read by `backend/config.py`; frontend variables prefixed with `VITE_` are inlined by Vite at build time.

| Variable | Scope | Production note |
|---|---|---|
| `ENVIRONMENT` | backend | Set to `production` to activate startup guards |
| `SECRET_KEY` | backend | Strong random JWT signing key; placeholder refused in production |
| `ALLOWED_ORIGINS` | backend | Required in production; exact browser origin(s) |
| `DATABASE_URL` | backend | Docker prod: `postgresql://USER:PASSWORD@db:5432/DBNAME` |
| `POSTGRES_USER` | db | Must match `DATABASE_URL` |
| `POSTGRES_PASSWORD` | db | Must match `DATABASE_URL` |
| `POSTGRES_DB` | db | Must match `DATABASE_URL` |
| `DEEPSEEK_API_KEY` | backend | Required for evaluation calls |
| `VITE_API_BASE_URL` | frontend build | Same-domain Docker path: `/api`; rebuild when changed |
| `FRONTEND_URL` | backend | Dev CORS fallback when `ALLOWED_ORIGINS` empty |
| `CHROMA_PERSIST_DIR` | backend | Optional override |
| `NER_MODEL_NAME` | backend | Optional override |
| `EMBEDDING_MODEL_NAME` | backend | Optional override |

---

## 8. Data Flow at a Glance

1. **Sign-up & profile**: Candidate registers → JWT issued → profile fields stored on `users`.
2. **Application creation**: Candidate selects division → `POST /api/applications` creates a `DRAFT` application.
3. **Document uploads**: Six required document types are uploaded through `/api/documents/upload/{doc_type}` with size, MIME, and magic-byte validation.
4. **Submit gate**: Submission requires an active period in `SUBMISSION` and all required documents. Status flips to `submitted`, file mutations are locked.
5. **Submit-time NER**: BackgroundTask extracts/anonymizes CV + Motivation Letter and caches results.
6. **Recruiter evaluation**: Batch evaluation checks cache, parses KHS, validates KTM, builds prompt, calls DeepSeek, stores scores, and moves application to `screening`.
7. **Manual selection**: Recruiter checks candidates that pass.
8. **Bulk publish**: Backend updates pass/fail statuses atomically and writes audit logs.
9. **Candidate result**: Candidate dashboard/result page reads announcement status.

---

## 9. Storage Layout

### Local/manual runtime

```text
data/
├── screenai_lab.db       # SQLite dev DB
├── raw_pdfs/             # legacy Capstone PDF dump
├── extracted/            # extracted JSON
└── anonymized/           # anonymized JSON

uploads/
└── {application_id}/
    ├── cv.pdf
    ├── khs.pdf
    ├── ktm.{pdf|jpg|png}
    ├── motivation_letter.pdf
    ├── swot.pdf
    └── supporting_docs.pdf

models/ner/               # HuggingFace cache
backend/vectorstore/      # ChromaDB directory
```

### Docker production

- PostgreSQL data is stored in the `postgres_data` Docker volume.
- `./data` is mounted into `/app/data` for legacy raw/extracted/anonymized artifacts.
- `./uploads` is mounted into `/app/uploads`, matching `settings.upload_dir = "./uploads"`, so candidate-submitted documents survive backend container recreation.
- `./models` is mounted into `/app/models` for the HuggingFace model cache.

---

## 10. Known Limitations

- Formal `xai.py` implementation is still future work; current explanations come from stored LLM justifications.
- Current scoring path is rubric-augmented prompting, not live vector retrieval.
- OCR for scanned PDFs/images is not part of the main pipeline yet.
- JWT is stored in localStorage; HttpOnly cookie + CSRF is a security backlog.
- Horizontal scaling would require shared file storage and shared rate-limit state.

---

## 11. Related Documents

- [PRD.md](../PRD.md) — product requirements and phase status.
- [DEPLOYMENT.md](DEPLOYMENT.md) — canonical Docker/VPS deployment guide.
- [API_REFERENCE.md](API_REFERENCE.md) — endpoint reference.
- [FLOW_DIAGRAMS.md](FLOW_DIAGRAMS.md) — Mermaid diagrams.
- [reports/DOCKER_SETUP_REPORT.md](reports/DOCKER_SETUP_REPORT.md) — Docker setup implementation notes.
- [reports/RAILWAY_VERCEL_CLEANUP_REPORT.md](reports/RAILWAY_VERCEL_CLEANUP_REPORT.md) — migration context from cloud PaaS to self-hosted VPS.
