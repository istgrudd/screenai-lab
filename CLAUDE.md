# CLAUDE.md — Execution Plan
## ScreenAI Lab — Sistem Rekrutmen MBC Laboratory, Telkom University

> **Source of truth:** [PRD.md](./PRD.md)
> **Forked from:** https://github.com/istgrudd/screenai
> **Repository:** https://github.com/istgrudd/screenai-lab
> **Last Updated:** 2026-05-27

---

## Phase Status

| Phase | Description | Status |
|---|---|---|
| Phase 0 | Fork & cleanup dari repo Capstone | ✅ Complete |
| Phase 1 | Candidate Portal MVP (Auth + Upload + Status + Admin) | ✅ Complete |
| Phase 2 | Full Recruitment Flow (NER submit-time + Periode + Evaluasi + Seleksi) | ✅ Complete |
| Phase 3 | Docker/VPS Deployment | 🔄 In Progress — assets ready, production cutover pending |

---

## 1. Current Source-of-Truth Summary

ScreenAI Lab saat ini sudah memiliki alur utama berikut:

**Backend**
- ✅ JWT auth: register, login, logout, `/me`
- ✅ Role-based access control: candidate, recruiter, super_admin
- ✅ Application CRUD + submit final irreversible
- ✅ Document upload 6 tipe dokumen dengan MIME, size, dan magic-byte validation
- ✅ Submit-time NER via `BackgroundTasks` + `SessionLocal`
- ✅ Cached anonymized CV + Motivation Letter di `candidate_documents`
- ✅ SWOT raw-text cache untuk panel rekruter
- ✅ RecruitmentPeriod 5 fase: `UPCOMING → SUBMISSION → EVALUATION → ANNOUNCEMENT → CLOSED`
- ✅ Phase-aware submit lock, evaluation soft warning, bulk announce lock
- ✅ Division-based batch evaluation: `/api/recruiter/evaluate/batch`
- ✅ Force re-evaluate dengan `force=true`
- ✅ KHS parser + KTM validator + rubric-augmented LLM scoring
- ✅ Score override + audit log `score_override`
- ✅ Bulk announcement + audit log `bulk_announcement`
- ✅ Deprecated legacy endpoints: `/api/upload`, `/api/evaluate`
- ✅ Idempotent division-rubric seeding on startup
- ✅ Alembic migrations auto-run on FastAPI lifespan
- ✅ Production startup guards: `SECRET_KEY`, `ALLOWED_ORIGINS`
- ✅ Rate limiting via slowapi

**Frontend**
- ✅ Candidate pages: Dashboard, Profile, Documents, Review, Submitted, Result, History
- ✅ Recruiter dashboard at `/`: filter, phase card, evaluation prompt, evaluate/re-evaluate, threshold highlight, checklist, bulk publish
- ✅ Candidate detail: document preview, SWOT highlight, score justification, override
- ✅ Super Admin: users, periods, profile
- ✅ ProtectedRoute + role-aware sidebar

**Deployment**
- ✅ `backend/Dockerfile`
- ✅ `frontend/Dockerfile`
- ✅ `frontend/nginx.conf` serving SPA + proxying `/api` to backend
- ✅ `docker-compose.yml` with `frontend`, `backend`, `db`
- ✅ `docs/DEPLOYMENT.md` for the canonical VPS walkthrough
- 📋 Production cutover on the actual lab VPS remains pending

---

## 2. Architecture Notes

### Dual Pipeline State

Two pipelines remain mounted:

```text
Legacy (Capstone):          Lab Portal:
/api/upload                 /api/documents/upload/{doc_type}
  → NER saat upload           → NER saat submit final
/api/evaluate               /api/recruiter/evaluate/batch
  → rubric_id based           → division based
```

Legacy endpoints are retained for compatibility but are deprecated through response headers and server warning logs.

### NER Timing

```text
Current Lab flow:
  submit → BackgroundTask(NER) → store anonymized_text
  evaluate → check cached? → skip NER
           → cache miss? → fallback inline NER
           → rubric-augmented LLM scoring
```

The background task receives the `SessionLocal` factory and opens its own database session. It must not reuse the request-scoped `db` session.

### Evaluation Wording

Use **rubric-augmented LLM scoring** for the current implementation. LangChain/ChromaDB dependencies still exist, but the current production path builds rubric context directly from the database and sends it in the prompt; it does not perform live vector retrieval at evaluation time.

### Announcement Flow

```text
POST /api/announcements/bulk
  body: { division, period_id, passed_application_ids: [...] }
  scope: evaluated apps in that division + period
  passed ids → announced_pass
  remaining evaluated scope → announced_fail
  audit_logs action_type="bulk_announcement"
```

Bulk announce is phase-locked to `ANNOUNCEMENT`, except for Super Admin correction/bypass.

---

## 3. API Snapshot

### RecruitmentPeriod Endpoints

| Method | Endpoint | Role | Description |
|---|---|---|---|
| `POST` | `/api/periods` | Super Admin | Create period, auto-deactivate other active periods |
| `GET` | `/api/periods/active` | Public | Get active period, `current_phase`, `phases`, `evaluation_prompt` |
| `GET` | `/api/periods/active/stats` | Recruiter+ | Submitted counts for active period |
| `GET` | `/api/periods` | Super Admin | List all periods |
| `PUT` | `/api/periods/{id}` | Super Admin | Edit period boundaries, threshold, active flag |
| `PUT` | `/api/periods/{id}/close` | Super Admin | Close period early |

### Evaluation Endpoints

| Method | Endpoint | Role | Notes |
|---|---|---|---|
| `POST` | `/api/recruiter/evaluate/batch` | Recruiter+ | Division enum validated; supports `force=true` |
| `GET` | `/api/recruiter/results/{application_id}` | Recruiter+ | Per-application result detail |
| `GET` | `/api/recruiter/applications` | Recruiter+ | Returns document completeness, `rank`, `is_recommended`, evaluation summary |

### Announcement Endpoints

| Method | Endpoint | Role | Notes |
|---|---|---|---|
| `POST` | `/api/announcements/bulk` | Recruiter+ | Main publish flow; phase-locked except Super Admin |
| `POST` | `/api/announcements` | Recruiter+ | Individual legacy/manual announce path |
| `GET` | `/api/announcements/my` | Candidate | Candidate result/status |

---

## 4. Frontend Routes

| Page | Route | Role | Key Elements |
|---|---|---|---|
| Recruiter Dashboard | `/` | Recruiter / Super Admin | Filter, phase card, evaluation, re-evaluation, bulk publish |
| Rubrics | `/rubrics` | Recruiter / Super Admin | Rubric CRUD |
| Candidate Detail | `/candidates/:id` | Recruiter / Super Admin | Documents, SWOT, scores, override |
| Admin Users | `/admin/users` | Super Admin | User management |
| Recruitment Periods | `/admin/periods` | Super Admin | Period CRUD, threshold, close period |
| Candidate Dashboard | `/dashboard` | Candidate | Status, countdown, journey tracker |
| Candidate Profile | `/profile` | Candidate | Profile + division select |
| Candidate Documents | `/documents` | Candidate | 6-step upload wizard |
| Candidate Review | `/review` | Candidate | Final submit gate |
| Candidate Result | `/result` | Candidate | Pass/fail result |
| Legacy Upload | `/upload` | Candidate | Off-nav Capstone compatibility path |

---

## 5. Environment & Config

Phase 2 does not require additional environment variables beyond the current `.env.example`.

Important production variables:

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

`VITE_API_BASE_URL` is build-time. Rebuild the frontend when this value changes.

---

## 6. Deployment Plan — Canonical Path

Canonical deployment is **Docker Compose on a single self-hosted VPS**.

| Service | Platform | Notes |
|---|---|---|
| Frontend | Docker container | Built from `frontend/Dockerfile`; nginx serves SPA and proxies `/api/` |
| Backend | Docker container | Built from `backend/Dockerfile`; runs `uvicorn backend.main:app --host 0.0.0.0 --port 8000` |
| Database | Docker container | `postgres:16-alpine`; reachable internally as `db:5432` |
| TLS | Host OS | Nginx/Caddy outside Docker terminates HTTPS and forwards to frontend `localhost:80` |
| File/model storage | Host-mounted directories/volumes | Persist uploads, data, and HuggingFace model cache |

Topology:

```text
browser HTTPS -> host Nginx/Caddy -> frontend container :80
                                        ├─ React SPA
                                        └─ /api -> backend container :8000 -> db container :5432
```

Use [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) as the deployment guide.

Manual `uvicorn` via systemd/supervisor is no longer the recommended production path. It may still be used for local experiments or emergency fallback, but all production documentation should point to Docker Compose first.

---

## 7. Risk & Mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| BackgroundTask gagal | anonymized_text null | Evaluation fallback ke inline NER |
| NER model download lambat | First evaluation slower | Mount/cache `./models`, monitor backend logs |
| Period active race condition | Dua period aktif | App-level deactivation + PostgreSQL partial unique index |
| Bulk announce partial failure | Inconsistent announcements | Single DB transaction |
| Candidate submit near phase boundary | NER belum selesai saat eval | Cache check + inline fallback |
| Threshold berubah setelah announce | Highlight changes after decision | Threshold visual only, does not alter announced status |
| Frontend uses wrong API URL | Browser calls dev URL | Set `VITE_API_BASE_URL` before build; rebuild frontend |
| Production secret placeholder | Insecure JWT | Startup guard refuses non-dev boot |
| Missing CORS origins | Browser blocked / unsafe config | Startup guard requires `ALLOWED_ORIGINS` in non-dev |

---

## 8. Backlog

| Item | Notes |
|---|---|
| Production cutover | Deploy to actual lab VPS and verify domain/TLS |
| HttpOnly cookie auth | Replace localStorage token storage + add CSRF protection |
| OCR for image/scan documents | Tesseract/pytesseract or alternative OCR pipeline |
| Email/WhatsApp notification | Notify candidates when results are published |
| Formal XAI module | `xai.py` is still a stub; current explanation comes from `DimensionScore.justification` |
| Non-EPrT certificate support | TOEFL ITP, IELTS, ECCT |
| Analytics dashboard | Aggregate stats per division/period |
| Frontend code splitting | React.lazy for large bundle reduction |
| Horizontal scaling | Redis/shared storage if multi-instance becomes necessary |
| Remove legacy endpoints | After Lab pipeline is stable and no legacy clients remain |
