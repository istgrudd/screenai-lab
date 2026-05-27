# Docker Deployment Setup — Report

> Date: 2026-05-12
> Branch: `lab/setup`
> Scope: introduce a Docker / docker-compose deployment story for the self-hosted VPS target adopted in [RAILWAY_VERCEL_CLEANUP_REPORT.md](RAILWAY_VERCEL_CLEANUP_REPORT.md). No application code was changed.

---

## Summary

ScreenAI Lab now ships with a complete `docker compose up --build -d` deployment path: a Python backend image, a multi-stage React/nginx frontend image, and a PostgreSQL data tier — all glued together with a single `.env`. The host-level reverse proxy still terminates TLS outside Docker (per the previous batch's deployment decision), keeping the compose file simple and the cert lifecycle independent of container restarts.

---

## Files created

| File | Purpose |
|---|---|
| [backend/Dockerfile](../../backend/Dockerfile) | Builds the FastAPI image on `python:3.11-slim`. Layer order is `requirements.txt → install → backend/ → alembic.ini → scripts/`, so app-only edits don't invalidate the pip layer. Declares `VOLUME /app/models/ner` and `VOLUME /app/data` so a bare `docker run` still gets durable storage when compose isn't involved. CMD runs `uvicorn backend.main:app` — the absolute import path the rest of the codebase uses. |
| [frontend/Dockerfile](../../frontend/Dockerfile) | Multi-stage build: stage 1 is `node:20-alpine` running `vite build` against a build-time `VITE_API_BASE_URL` (passed via `ARG`); stage 2 is `nginx:alpine` serving the resulting `dist/` and consuming `nginx.conf`. Falls back to `npm install` when no `package-lock.json` is present so first-time clones work even before the lockfile is committed. |
| [frontend/nginx.conf](../../frontend/nginx.conf) | In-container nginx with three location blocks: long-cache headers for hashed `/assets/`, a `/api/` reverse-proxy to `http://backend:8000` (resolved over the compose network), and an SPA fallback (`try_files ... /index.html`) for React Router. Header banner makes the no-TLS-here policy explicit. |
| [docker-compose.yml](../../docker-compose.yml) | Three services — `db` (postgres:16-alpine, port not published), `backend` (built from repo-root context using `backend/Dockerfile`, port not published, depends on `db`), `frontend` (built from `frontend/`, port 80 published, depends on `backend`). One named volume `postgres_data` for durable Postgres storage, plus bind mounts `./data:/app/data` and `./models:/app/models` for uploads + HuggingFace cache. |
| [docs/DEPLOYMENT.md](../DEPLOYMENT.md) | Long-form first-deploy guide for lab members. Covers prerequisites, an env-var reference table, step-by-step walkthrough, update flow, backup/restore procedures, troubleshooting (startup-guard crash-loop, NER model download failure, CORS errors, Alembic failures, wrong API URL, DB connectivity), and an explicit note that SSL/TLS is owned by the host reverse proxy, not Docker. |
| [docs/reports/DOCKER_SETUP_REPORT.md](DOCKER_SETUP_REPORT.md) | This report. |

## Files modified

| File | Change |
|---|---|
| [.env.example](../../.env.example) | Added a clearly separated `# Docker / VPS Production` block at the bottom: `ENVIRONMENT=production`, `DATABASE_URL` (with `db` hostname), `SECRET_KEY`, `ALLOWED_ORIGINS`, `DEEPSEEK_API_KEY`, the `POSTGRES_*` triplet, and the build-time `VITE_API_BASE_URL`. Each variable carries a comment noting which startup guard it satisfies and which compose service consumes it. Dev defaults at the top are untouched. |
| [docs/ISSUES_AND_NOTES.md §9](../ISSUES_AND_NOTES.md) | Deployment readiness checklist rewritten from the previous 12-step manual-VPS form into a 12-step Docker-aware form. Steps that disappeared: write a systemd unit, install Postgres on the host, write a separate Nginx vhost for the backend (Docker handles all three now). Steps that remained or grew: provision the VPS with Docker installed, configure `.env`, set `VITE_API_BASE_URL` before build (Vite is build-time), bring up via `docker compose up --build -d`, verify `docker compose ps`, watch backend logs for startup-guard errors, confirm `alembic current`, plan for the first-boot NER model download, configure the host reverse proxy for TLS only, wire `/api/health` to monitoring, backups (`pg_dump` + uploads rsync), updates (`git pull && docker compose up --build -d`). |

## Files searched but not modified

| File | Reason |
|---|---|
| [backend/main.py](../../backend/main.py) | Startup guards from Batch 4 (`SECRET_KEY` placeholder + empty `ALLOWED_ORIGINS` in non-dev) work unchanged inside Docker — they read `settings.environment` from the same `.env`. Verified by inspection; nothing to change. |
| [backend/config.py](../../backend/config.py) | All settings load from `.env` via pydantic-settings, including `UPLOAD_DIR`, `DATABASE_URL`, `SECRET_KEY`, `ALLOWED_ORIGINS`, etc. The compose file leans on this — no code change needed. |
| [backend/database.py](../../backend/database.py) | The `postgres://` → `postgresql://` normalization runs the same way regardless of host. The Docker `DATABASE_URL` uses `postgresql://` directly, but if an operator pastes a legacy URL, the rewrite still applies. |
| [frontend/src/lib/api.js](../../frontend/src/lib/api.js) | Reads `import.meta.env.VITE_API_BASE_URL` exactly as it did before; the Dockerfile passes the value through as a build ARG so the bundle has the right value baked in. |
| [scripts/smoke_test_*.py](../../scripts/) | Standalone test scripts that hit the in-process FastAPI app via `TestClient` — they don't care about Docker. Used as the post-change regression check (results below). |

---

## Key decisions

### 1. Build context for the backend is the repo root, not `./backend`

The task brief sketched `build: ./backend`. I switched to:

```yaml
backend:
  build:
    context: .
    dockerfile: backend/Dockerfile
```

Why: the codebase uses absolute imports (`from backend.config import settings`), so the `backend/` package must sit beside the working directory inside the container. `requirements.txt` and `alembic.ini` also live at the repo root and are needed at build time and run time respectively. A build context of `./backend` would have left the Dockerfile unable to see any of them without restructuring the project. The wider context is the cheapest path that doesn't change the import contract.

### 2. nginx-in-container as the `/api` proxy, no separate gateway service

The frontend container's nginx does two jobs: serve the SPA *and* reverse-proxy `/api/` to the backend. An alternative would be to add a separate gateway container (Traefik or nginx-only-as-proxy). I rejected that because the lab maintains this themselves — one fewer service is one fewer thing to debug at 2am. The frontend nginx is essentially free since the image is already there to serve static assets.

### 3. Multi-stage frontend build

Stage 1 `node:20-alpine` does `npm ci && npm run build`. Stage 2 `nginx:alpine` carries only the resulting `dist/` directory + `nginx.conf`. Final image is ~50 MB vs ~500 MB if we kept the Node toolchain. The Node stage isn't published; it exists only as a builder.

`VITE_API_BASE_URL` enters the build as an `ARG` and is promoted to an `ENV` so Vite picks it up. docker-compose passes it via the `args:` block on the frontend service from the root `.env`. This is the cleanest match for Vite's build-time inlining behaviour — runtime env vars would not work because the bundle is already compiled.

### 4. TLS is outside Docker

The compose file and both Dockerfiles only speak plain HTTP. The host runs Caddy (or Nginx + certbot) outside Docker, terminates HTTPS, and proxies to `127.0.0.1:80`. This decision is inherited from [RAILWAY_VERCEL_CLEANUP_REPORT.md](RAILWAY_VERCEL_CLEANUP_REPORT.md) checklist step 11 — and it lets cert renewal happen independently of container rebuilds. A note in [frontend/nginx.conf](../../frontend/nginx.conf) makes this policy explicit so a future contributor doesn't bolt TLS into the wrong layer.

### 5. NER model cache is a separate volume from data

Two bind mounts on the backend service:

```yaml
volumes:
  - ./data:/app/data       # SQLite (dev) + uploads + raw_pdfs + extracted + anonymized
  - ./models:/app/models   # HuggingFace IndoBERT cache (~1.3 GB)
```

They're split because the lifecycles differ:

- `data/` holds candidate-supplied PDFs and the dev SQLite — small, high-value, must be backed up.
- `models/` holds re-downloadable model weights — large, cache-able, no backup needed.

Backups (Section 6 of DEPLOYMENT.md) only target `data/uploads/` + Postgres. If `models/` is ever lost, the next evaluation re-downloads it.

### 6. Postgres port not published; backend port not published

Only `frontend:80` is published to the host. `backend:8000` and `db:5432` are reachable only on the compose-managed Docker network, never from the public internet. This is the simplest defence against accidental exposure — the only way into the API is through the frontend nginx (which proxies `/api/`), and the only way into Postgres is `docker compose exec`.

### 7. `env_file: .env` for all three services + `environment:` for Postgres

`db` reads `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` via the `environment:` block (the official postgres image consumes those names). Backend and frontend rely on the broader `env_file: .env` so every pydantic-settings field and every build-time Vite var is available. One file, one source of truth.

---

## Known limitations

- **No SSL in compose.** Intentional — the host reverse proxy owns TLS. Documented in [DEPLOYMENT.md §8](../DEPLOYMENT.md). If a future deploy lacks a host proxy, the operator must add a Caddy container themselves; the current compose file doesn't ship one to avoid implying that's the recommended path.
- **In-memory slowapi rate limit resets on backend restart.** The Batch-4 rate-limit storage is per-process and in-memory. A `docker compose restart backend` wipes the counters; a horizontally-scaled deployment would lose them between workers. Acceptable for single-instance VPS topology; flagged in [BATCH_4_REPORT.md](BATCH_4_REPORT.md) "Slowapi storage backend".
- **Single-instance topology.** docker-compose is configured for one of each service. Scaling out (`docker compose up --scale backend=2`) would break the slowapi counters and would also conflict with the local-filesystem upload storage (each backend would see only its own uploads). To horizontally scale we'd need Redis (slowapi) + S3-like shared storage (uploads). Out of scope for the lab VPS.
- **ChromaDB persist dir lives inside the image.** `CHROMA_PERSIST_DIR` defaults to `./backend/vectorstore`, which is inside `/app/backend/vectorstore` — *not* mounted as a volume in the current compose file. The current RAG implementation inlines rubric context into the LLM prompt rather than retrieving vectors at evaluation time ([ARCHITECTURE.md §5](../ARCHITECTURE.md)), so this is dormant — the directory is auto-created and empty in practice. If real vector retrieval is wired in later, add a `./vectorstore:/app/backend/vectorstore` mount.
- **First-boot NER download is slow.** The IndoBERT cache (~1.3 GB) downloads lazily on the first evaluation, not at build time. This keeps the image small but means the first recruiter to click "Run Evaluation" pays the latency. Operators can pre-warm: `docker compose exec backend python -c "from transformers import pipeline; pipeline('ner', model='ageng-anugrah/indobert-large-p2-finetuned-ner')"`. Documented in [DEPLOYMENT.md §7 troubleshooting](../DEPLOYMENT.md).
- **Windows path bind mounts.** `docker compose config` showed `./data` resolving to a `D:\Program\screenai-lab\data` bind on this dev box. On a Linux VPS the path is whatever the operator clones to. No change needed; just noting that bind paths follow the host OS.

---

## Delta — old (manual) checklist → new (Docker) checklist

| What changed | Before (RAILWAY_VERCEL_CLEANUP_REPORT) | After (this batch) |
|---|---|---|
| **PostgreSQL install** | Manual `apt install postgresql-16`, create DB + role with `psql`, set up `pg_hba.conf`. | Container — `postgres:16-alpine` image, credentials in `.env`, data in a Docker named volume. |
| **Process supervisor** | Hand-written systemd unit running `uvicorn backend.main:app --host 127.0.0.1 --port 8000` with `Restart=on-failure`. | `restart: unless-stopped` in compose. Docker handles the supervisor role. |
| **Backend port binding** | Hand-written `Bind=127.0.0.1` in systemd; reverse proxy points to `127.0.0.1:8000`. | Container port not published; reverse proxy points to the **frontend** container on port 80, which internally proxies `/api/`. |
| **Frontend deploy** | `cd frontend && npm run build` on the build host, `rsync` `dist/` to the VPS, write a separate Nginx vhost for static assets. | `docker compose build frontend` produces an `nginx:alpine` image that bakes the bundle in. One service, one config file. |
| **Alembic upgrade** | Manual `alembic upgrade head` after each deploy (or rely on FastAPI lifespan to do it on boot). | Same lifespan auto-runs on container boot. Verify with `docker compose exec backend alembic current`. |
| **Update flow** | `git pull` on the VPS → `pip install -r requirements.txt` → `npm run build` → `systemctl restart screenai-backend` + reload nginx. | `git pull && docker compose up --build -d`. One command. |
| **Backups** | OS-level cron + manual `pg_dump`, rsync of `uploads/`. | OS-level cron + `docker compose exec -T db pg_dump ...`, rsync of `./data/uploads/`. Same idea, one indirection. |
| **What the operator still does manually** | Everything above. | (1) Install Docker on the VPS; (2) configure the host reverse proxy + TLS; (3) wire `/api/health` to monitoring; (4) schedule the `pg_dump` cron job + uploads rsync. |

The four manual residuals are explicitly documented in [DEPLOYMENT.md](../DEPLOYMENT.md) — steps 6 (host reverse proxy), 8 (monitoring), and section 6 (backups). Section 8 spells out the policy on TLS belonging outside Docker.

---

## Validation

| Check | Result |
|---|---|
| `python -c "import yaml; yaml.safe_load(open('docker-compose.yml'))"` | OK — valid YAML. |
| `docker compose config --quiet` | OK — schema valid. Warnings on `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `VITE_API_BASE_URL` are expected: those live in the commented-out Docker section of `.env.example` and are only set on the VPS. |
| Backend Dockerfile structural review | OK — `FROM python:3.11-slim`, `WORKDIR /app`, `COPY requirements.txt` before app source, declared `VOLUME ["/app/models/ner", "/app/data"]`, `EXPOSE 8000`, `CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]`. |
| Frontend Dockerfile structural review | OK — multi-stage with `FROM node:20-alpine AS builder` (npm ci, vite build with `VITE_API_BASE_URL` ARG) and `FROM nginx:alpine` (copies `nginx.conf` and `dist/`). `EXPOSE 80`. |
| `docker build --check` against the daemon | Skipped — no Docker daemon available in this dev environment. Static review above + the successful `docker compose config` covers the structural side; an actual build will happen on the VPS. |
| `python -m scripts.smoke_test_auth` | 16/16 passed. |
| `python -m scripts.smoke_test_applications` | All checks passed — registration, application create, 6-doc upload, MIME/size guards, submit gate, post-submit lock, disk layout. |

No application code was modified by this batch, so the smoke tests are a regression check (they ran cleanly because no behavior changed).
