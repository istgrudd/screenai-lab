# Deployment Guide — ScreenAI Lab on a Self-Hosted VPS

> Target audience: MBC Lab members deploying ScreenAI Lab to a single Linux VPS for the first time, and operators maintaining it afterwards.
>
> This guide is the long-form companion to the 12-step shortlist in [ISSUES_AND_NOTES.md §9](ISSUES_AND_NOTES.md). Read both — the shortlist is the checklist; this file explains *why* each step matters and how to recover when something breaks.

---

## 1. Overview

ScreenAI Lab is shipped as three Docker containers orchestrated by Docker Compose:

| Service | Image | Port (internal / host) | Role |
|---|---|---|---|
| `frontend` | built from [frontend/Dockerfile](../frontend/Dockerfile) (nginx:alpine) | 80 / **80** | Serves the React SPA + proxies `/api/` to the backend |
| `backend` | built from [backend/Dockerfile](../backend/Dockerfile) (python:3.11-slim) | 8000 / not published | FastAPI app under uvicorn |
| `db` | `postgres:16-alpine` | 5432 / not published | PostgreSQL data store |

TLS is **not** handled inside Docker. The VPS itself runs a host-level reverse proxy (Nginx or Caddy on the host OS, outside Docker) that terminates HTTPS and forwards plain HTTP to the frontend container on port 80. This is intentional: it keeps cert renewal isolated from container restarts and lets the same VPS host other services on the same domain.

```
browser ── HTTPS ──> host nginx/caddy ── HTTP ──> :80 frontend (nginx)
                                                    │
                                                    └─ /api/ ─> backend (uvicorn) ─> db (postgres)
```

### Production Domain Convention

ScreenAI Lab is intended to run on an application subdomain in production.

Recommended convention:

- Main domain: `mbclaboratory.com`
- Recruitment app: `recruitment.mbclaboratory.com`
- Optional email sending domain: `mail.mbclaboratory.com`

The main domain can host the laboratory website or a future app portal, while
the recruitment system is isolated under the recruitment subdomain.

Recommended production env:

```env
PUBLIC_FRONTEND_URL=https://recruitment.mbclaboratory.com
ALLOWED_ORIGINS=https://recruitment.mbclaboratory.com
VITE_API_BASE_URL=/api
EMAIL_FROM="MBC Laboratory <noreply@mail.mbclaboratory.com>"
EMAIL_ENABLED=true
```

`PUBLIC_FRONTEND_URL` must point to the public frontend origin because
verification and reset-password email links are opened by users in the browser.

`VITE_API_BASE_URL=/api` is recommended when the frontend and backend are served
under the same app subdomain and the frontend nginx proxies `/api` to the
backend container.

`EMAIL_FROM` must use a sender domain that has already been verified in Resend.
If `mail.mbclaboratory.com` is not configured yet, use
`MBC Laboratory <noreply@mbclaboratory.com>` after verifying that domain.

Resend is only the email delivery provider. ScreenAI Lab backend remains
responsible for generating, hashing, validating, and consuming verification and
reset codes.

---

## 2. Prerequisites

| Requirement | Minimum | Recommended |
|---|---|---|
| OS | Ubuntu 22.04 LTS, Debian 12, or compatible | Ubuntu 22.04 LTS |
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB (NER model needs ~1.5 GB during inference) |
| Disk | 20 GB free | 40 GB (room for `models/`, uploads, Postgres data, backups) |
| Docker Engine | 24.x | 27.x |
| Docker Compose | v2 plugin (`docker compose ...`, not legacy `docker-compose`) | v2 |
| Host reverse proxy | Nginx or Caddy installed on the host (outside Docker) | Caddy (automatic Let's Encrypt) |

Install Docker following the [official docs](https://docs.docker.com/engine/install/). On Ubuntu the short version is:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
    https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"   # log out + back in for this to take effect
```

---

## 3. Environment Variables Reference

All three services read the project-root `.env`. The `# Docker / VPS Production` block of [`.env.example`](../.env.example) is the source of truth; the table below explains each variable.

| Variable | Required | Consumed by | Notes |
|---|---|---|---|
| `ENVIRONMENT` | **yes** | backend | Set to `production` (or anything other than `development`) so the Batch-4 startup guards engage. |
| `SECRET_KEY` | **yes** | backend | JWT HS256 signing key. Generate with `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Startup guard refuses placeholders in non-dev. |
| `ALLOWED_ORIGINS` | **yes** | backend | Comma-separated CORS list, e.g. `https://lab.example.org`. Startup guard refuses empty in non-dev. |
| `DEEPSEEK_API_KEY` | strongly recommended | backend | Server boots without it but evaluation calls fail at runtime. |
| `DATABASE_URL` | **yes** | backend | `postgresql://USER:PASSWORD@db:5432/DBNAME`. Host is `db` (the compose service), not `localhost`. The legacy `postgres://` scheme is auto-normalized in [backend/database.py:11](../backend/database.py#L11). |
| `POSTGRES_USER` | **yes** | db | Must match the user portion of `DATABASE_URL`. |
| `POSTGRES_PASSWORD` | **yes** | db | Strong random string. Must match the password portion of `DATABASE_URL`. |
| `POSTGRES_DB` | **yes** | db | Must match the database portion of `DATABASE_URL`. |
| `VITE_API_BASE_URL` | **yes (build-time)** | frontend (build) | URL the **browser** uses to reach the API — typically `https://your-domain/api`. Inlined at `docker compose build`, NOT at container start. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | no (default 480) | backend | JWT lifetime in minutes. |
| `FRONTEND_URL` | no | backend | Fallback CORS origin when `ALLOWED_ORIGINS` is empty (dev only). Ignored in prod. |
| `DEEPSEEK_BASE_URL` | no | backend | Defaults to `https://api.deepseek.com/v1`. |
| `NER_MODEL_NAME` | no | backend | Defaults to `ageng-anugrah/indobert-large-p2-finetuned-ner`. Pinning is rarely needed. |
| `EMBEDDING_MODEL_NAME` | no | backend | Defaults to `sentence-transformers/all-MiniLM-L6-v2`. |
| `CHROMA_PERSIST_DIR` | no | backend | Defaults to `./backend/vectorstore` (inside the image — see Known Limitations). |

---

## 4. First-Time Deploy Walkthrough

### Step 1 — Clone and configure

```bash
git clone https://github.com/istgrudd/screenai-lab.git
cd screenai-lab
cp .env.example .env
$EDITOR .env       # fill in every variable in the "# Docker / VPS Production" block
```

Generate `SECRET_KEY`:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

Paste the result into `.env`. Repeat for `POSTGRES_PASSWORD` (any strong random string).

Make sure `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` line up — the URL must point at the same credentials the `db` service is created with.

### Step 2 — Set the frontend build-time URL

Vite inlines `VITE_API_BASE_URL` at build time. Set it in `.env` to the URL or relative path the user's browser will use, e.g.:

```
VITE_API_BASE_URL=/api
```

If the host reverse proxy serves the SPA on the same domain that the `/api/` proxy lives on (the default in [frontend/nginx.conf](../frontend/nginx.conf)), the value above is correct: the browser hits `https://recruitment.mbclaboratory.com/api/...`, the host proxy strips TLS and forwards to the frontend container, the frontend nginx proxies `/api/` to the backend container.

### Step 3 — Build and start

```bash
docker compose up --build -d
```

The first build downloads Python + Node deps (~5 min on a 100 Mbps link). When it returns, check the services:

```bash
docker compose ps
```

All three (`db`, `backend`, `frontend`) should show `Up`. If `backend` is `Restarting`, jump to [Troubleshooting](#7-troubleshooting).

### Step 4 — Verify the backend boot

```bash
docker compose logs -f backend
```

You should see, in order:

```
[OK] Database initialized
[OK] Data directories ready
[OK] Division rubrics already present    (or "Seeded division rubrics: ...")
[OK] Server running on port 8000
INFO:     Application startup complete.
```

The Batch-4 startup guards run before `[OK] Database initialized`. If you see a `RuntimeError: SECRET_KEY must be changed before running in production` or `ALLOWED_ORIGINS must be set in production`, fix the `.env` and re-run `docker compose up -d`.

### Step 5 — Verify migrations

```bash
docker compose exec backend alembic current
```

Should print the current head revision. Alembic runs inside the FastAPI lifespan on every boot — this command just confirms it.

### Step 6 — Configure the host-level reverse proxy

On the host (not inside Docker), install Nginx or Caddy. **Caddy is recommended** for the lab because it does Let's Encrypt automatically.

Minimal Caddyfile:

```caddyfile
lab.example.org {
    reverse_proxy localhost:80
}
```

That's it — Caddy fetches a Let's Encrypt cert on first boot, terminates TLS, and forwards to the frontend container on port 80. Restart the host Caddy (`sudo systemctl restart caddy`) and visit `https://lab.example.org`.

Equivalent Nginx snippet (cert managed separately with `certbot`):

```nginx
server {
    listen 443 ssl http2;
    server_name lab.example.org;

    ssl_certificate     /etc/letsencrypt/live/lab.example.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/lab.example.org/privkey.pem;

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Step 7 — First evaluation triggers the NER model download

The IndoBERT model (~1.3 GB) is downloaded lazily the first time the evaluation pipeline runs. The download lands in `./models/` on the host (mounted into the backend container at `/app/models/`), so subsequent restarts skip it.

Monitor: `docker compose logs -f backend` while the first recruiter clicks "Run Evaluation".

### Step 8 — Wire monitoring

`GET /api/health` returns `{"success": true, "data": {"status": "healthy", "version": "0.1.0"}}`. Point your uptime monitor (Uptime Kuma, Healthchecks.io, cron + curl, etc.) at `https://lab.example.org/api/health`.

---

## 5. Updating the App

```bash
cd /path/to/screenai-lab
git pull
docker compose up --build -d
```

`--build` rebuilds any image whose source changed; `-d` keeps it detached. Alembic migrations are applied automatically by the FastAPI lifespan on the next backend boot.

If only the backend changed: `docker compose up --build -d backend` is faster.

If only the frontend changed (and `VITE_API_BASE_URL` hasn't changed): `docker compose up --build -d frontend`.

**Caveat:** if `VITE_API_BASE_URL` changes in `.env`, you must rebuild the frontend (`docker compose build --no-cache frontend`) because Vite inlines the value at build time.

---

## 6. Backup and Restore

### What to back up

| Source | What's in it | How |
|---|---|---|
| PostgreSQL (`postgres_data` volume) | All application data — users, applications, evaluations, audit logs | `pg_dump` (below) |
| `./uploads/` on the host | Candidate-submitted PDFs/images | `rsync` / filesystem snapshot |
| `./models/` on the host | HuggingFace model cache | Optional — re-downloadable |

### Backup

```bash
# Postgres dump — run nightly via cron on the host
docker compose exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
    > "/var/backups/screenai-lab/db-$(date +%F).sql"

# Uploads — rsync off-host
rsync -avz ./uploads/ backup-host:/backups/screenai-lab/uploads/
```

A sample cron line (runs daily at 03:00):

```cron
0 3 * * * cd /opt/screenai-lab && docker compose exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > /var/backups/screenai-lab/db-$(date +\%F).sql && rsync -avz /opt/screenai-lab/uploads/ backup-host:/backups/screenai-lab/uploads/
```

### Restore

```bash
# Stop the backend so nothing writes while we restore.
docker compose stop backend

# Drop and recreate the DB.
docker compose exec db psql -U "$POSTGRES_USER" -d postgres \
    -c "DROP DATABASE IF EXISTS $POSTGRES_DB;" \
    -c "CREATE DATABASE $POSTGRES_DB OWNER $POSTGRES_USER;"

# Pipe the dump in.
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    < /var/backups/screenai-lab/db-2026-05-12.sql

# Restore uploads.
rsync -avz backup-host:/backups/screenai-lab/uploads/ ./uploads/

# Bring the backend back.
docker compose start backend
```

---

## 7. Troubleshooting

### "Startup guard crash-loop" — backend keeps restarting

Symptom: `docker compose ps` shows `backend` as `Restarting`; logs print:

```
RuntimeError: SECRET_KEY must be changed before running in production
```

or:

```
RuntimeError: ALLOWED_ORIGINS must be set in production
```

Cause: `.env` is missing or still has the dev placeholders, *and* `ENVIRONMENT` is not `development`.

Fix: edit `.env`, set the offending value, then `docker compose up -d` to recreate the container with the new env.

### NER model download fails

Symptom: first evaluation request times out or logs show a HuggingFace download error.

Cause: outbound HTTPS to `huggingface.co` is blocked, or disk is full, or the ~1.3 GB write to `./models/` failed.

Fix:

```bash
# Free up space and check the mount is writable
df -h ./models
ls -la ./models

# Optionally pre-warm the cache by running the import inside the container
docker compose exec backend python -c "from transformers import pipeline; pipeline('ner', model='ageng-anugrah/indobert-large-p2-finetuned-ner')"
```

### CORS error in the browser console

Symptom: `Access-Control-Allow-Origin` failure in the browser when the frontend calls `/api/...`.

Cause: `ALLOWED_ORIGINS` in `.env` doesn't include the exact origin the browser is using (scheme + host + port).

Fix: set `ALLOWED_ORIGINS` to the full origin, e.g. `https://lab.example.org`. Trailing slashes are not part of an origin — don't include them. `docker compose up -d backend` to apply.

### Alembic migration failure on first boot

Symptom: backend logs print an Alembic error and the container exits before `[OK] Database initialized`.

Cause: usually a pre-existing Postgres volume with conflicting schema (e.g. a previous deploy or manual `psql` work).

Fix for a fresh deploy (destroys data):

```bash
docker compose down
docker volume rm screenai-lab_postgres_data
docker compose up -d
```

For a recoverable production DB, capture the dump first (`pg_dump`), then inspect what's actually in the DB with `docker compose exec db psql -U "$POSTGRES_USER" "$POSTGRES_DB"`.

### Frontend shows the wrong API URL

Symptom: browser hits `http://127.0.0.1:8000/api/...` (the dev fallback) instead of the production URL.

Cause: `VITE_API_BASE_URL` was not set in `.env` at *build time*, so Vite inlined the dev default.

Fix:

```bash
# Make sure VITE_API_BASE_URL is in .env, then force a clean rebuild
docker compose build --no-cache frontend
docker compose up -d frontend
```

### Backend can't reach the database

Symptom: backend logs print `OperationalError: could not connect to server: Connection refused` or `password authentication failed`.

Cause: `DATABASE_URL` doesn't match the `POSTGRES_*` triplet, or you're pointing at `localhost` instead of the compose service name `db`.

Fix: in the Docker setup, the backend container reaches Postgres at `db:5432`, **never** `localhost`. Double-check `DATABASE_URL=postgresql://USER:PASSWORD@db:5432/DBNAME`.

---

## 8. Note on SSL/TLS

**TLS is not configured inside Docker.** Both [docker-compose.yml](../docker-compose.yml) and [frontend/nginx.conf](../frontend/nginx.conf) only speak plain HTTP. This is intentional — the host-level reverse proxy (Caddy or Nginx running on the VPS OS, *outside* Docker) terminates HTTPS and forwards to `127.0.0.1:80`.

Why outside Docker:

- Cert renewal happens independently of container rebuilds. Caddy refreshes Let's Encrypt without touching the app.
- A single host proxy can host multiple apps on the same VPS without each one carrying its own TLS plumbing.
- The container layer stays portable — the same compose file works in local dev (no TLS) and behind any TLS-terminating proxy.

If you ever need TLS inside Docker (e.g. running this on a managed K8s cluster without an upstream ingress), add a separate Caddy container with its own volume for `/data` — but for the lab VPS target this is unnecessary complexity.

---

## 9. See Also

- [ISSUES_AND_NOTES.md §9](ISSUES_AND_NOTES.md) — 12-step shortlist version of this guide.
- [ARCHITECTURE.md §4](ARCHITECTURE.md) — Tech stack and Infra/DevOps overview.
- [reports/RAILWAY_VERCEL_CLEANUP_REPORT.md](reports/RAILWAY_VERCEL_CLEANUP_REPORT.md) — Context on why the deployment target moved from Railway/Vercel to self-hosted VPS.
- [reports/BATCH_4_REPORT.md](reports/BATCH_4_REPORT.md) — Detail on the startup guards (`SECRET_KEY` + `ALLOWED_ORIGINS`) and slowapi rate limiting that are referenced throughout this guide.
