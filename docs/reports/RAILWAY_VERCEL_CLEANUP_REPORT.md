# Railway / Vercel → VPS Lab Cleanup — Report

> Date: 2026-05-12
> Branch: `lab/setup`
> Scope: remove all references to Railway, Vercel, Netlify, and Render from the codebase and pivot Phase 3 deployment to a self-hosted VPS lab.

---

## Summary

The previous "Backend on Railway + Frontend on Vercel" target was retired in favour of a single self-hosted VPS in the MBC Lab. All managed-platform config files were deleted, and every doc/comment that referenced those platforms was rewritten to describe the equivalent VPS setup (uvicorn behind Nginx/Caddy, manual PostgreSQL, systemd unit, `npm run build` static assets).

The DB URL normalization (`postgres://` → `postgresql://`) and the `VITE_API_BASE_URL` pattern are kept intact — both are useful regardless of host.

---

## Files deleted

| File | Reason |
|---|---|
| `railway.json` | Railway-specific deploy spec (Nixpacks builder, healthcheck, restart policy). Not consumed by anything outside Railway. |
| `Procfile` | Heroku/Railway buildpack convention (`web: uvicorn ...`). Equivalent on VPS is the operator's systemd unit, which is not committed. |

`runtime.txt` was **kept** — it pins `python-3.11` and remains useful as a Python-version hint for `pyenv`, `asdf`, and human readers setting up the VPS. The ARCHITECTURE.md entry was updated to flag it as informational rather than Railway-specific.

---

## Files modified

### Code & config
| File | Change |
|---|---|
| [.env.example](../../.env.example) | Lines 12–14 — replaced "Production (Railway PostgreSQL) — Railway injects this automatically when you attach a Postgres plugin" with VPS guidance (manual install, dedicated DB+user, set `DATABASE_URL` by hand). Line 29 — replaced the `*.vercel.app` example for `ALLOWED_ORIGINS` with `screenai-lab.example.com`. |
| [frontend/.env.example](../../frontend/.env.example) | Line 5 — "deploy environment (e.g. Vercel)" → "VPS / build host before `npm run build`". |
| [backend/database.py](../../backend/database.py) | Comment on line 8 — "Railway's DATABASE_URL historically uses the legacy `postgres://` scheme" → generic ("older Heroku-style, copy-pasted managed-DB strings"). Comment on line 22 — "stale-connection errors on managed Postgres (Railway, etc)" → "stale-connection errors on long-lived Postgres pools". **Behaviour unchanged** — the normalization logic and `pool_pre_ping` are kept intact. |
| [backend/config.py](../../backend/config.py) | `cors_origins` docstring — example domain changed from `screenai-lab.vercel.app` to `screenai-lab.example.com`. |
| [README.md](../../README.md) | Tech-stack table row 1 — added `(dev) / PostgreSQL (prod)` qualifier. Row 2 — "bcrypt (passlib)" → "bcrypt (direct, no passlib)", correcting a long-standing inaccuracy noticed during this sweep (the code calls bcrypt directly per [backend/utils/security.py](../../backend/utils/security.py)). |

### Documentation
| File | Change |
|---|---|
| [PRD.md](../../PRD.md) | Phase 3 status row updated. §2 Phase 3 scope bullets rewritten (VPS lab self-hosted backend+frontend, `uvicorn` behind reverse proxy, static frontend via `npm run build`). §5 stack table — Database row now says "self-hosted di VPS lab"; Deployment (Backend) and Deployment (Frontend) rows both rewritten to point at VPS + reverse proxy. |
| [CLAUDE.md](../../CLAUDE.md) | §8 Deployment Plan table — Backend now says "VPS lab (self-hosted), `uvicorn` behind Nginx/Caddy, dikelola systemd". Frontend now says "VPS lab (self-hosted), `npm run build` → static". Database row clarified ("instalasi & konfigurasi manual"). |
| [docs/ARCHITECTURE.md](../ARCHITECTURE.md) | High-level Mermaid graph — collapsed the separate Frontend Host (Vercel) and Backend Host (Railway) subgraphs into a single "VPS Lab (self-hosted)" subgraph showing Reverse Proxy → Static Frontend + FastAPI app. Directory-tree section — removed the `Procfile` and `railway.json` rows, updated the `runtime.txt` description, bumped requirements.txt package count from 21 to 22 to reflect `slowapi` from Batch 4. Tech-stack table — uvicorn note no longer mentions `railway.json`; psycopg2-binary note says "self-hosted Postgres on VPS". Infra / DevOps table — rewritten end-to-end: backend deploy, process spec, frontend deploy, and database (prod) rows now describe the VPS setup. "Railway (backend hosting target)" and "Vercel (frontend hosting target)" sections renamed to "VPS Lab (backend hosting target)" and "VPS Lab (frontend hosting target)" with content rewritten for the new shape. Env-var table — `APP_PORT` and `DATABASE_URL` purpose columns reworded to remove Railway/Procfile mentions. |
| [docs/ISSUES_AND_NOTES.md](../ISSUES_AND_NOTES.md) | §6 rate-limiting note — "Cloudflare/Railway rate limits" → "reverse-proxy rate-limit module (Nginx `limit_req`, Caddy `rate_limit` plugin)" and a pointer to [BATCH_4_REPORT.md](BATCH_4_REPORT.md) where slowapi was wired. §9 Deployment readiness checklist — completely rewritten from 7 Railway-flavoured steps into 12 VPS-flavoured steps (provision the VPS, install Postgres manually, write a systemd unit, configure Nginx/Caddy, wire `/api/health` to monitoring, etc). |
| [docs/API_REFERENCE.md](../API_REFERENCE.md) | `GET /api/health` "Notes" line — "Used by Railway healthcheck (`railway.json`)" → "Intended as the health endpoint for the VPS reverse proxy / uptime monitor". |

---

## Files searched but not modified

| File / location | Reason |
|---|---|
| [docs/reports/BATCH_1_REPORT.md](BATCH_1_REPORT.md), [BATCH_3_REPORT.md](BATCH_3_REPORT.md), [BATCH_4_REPORT.md](BATCH_4_REPORT.md) | Historical reports — they describe what the deployment target *was* at the time the batch was written. Rewriting them retroactively would lie about the project's history. They each reference Railway/Vercel in passing (notably BATCH_4 §"Slowapi storage backend" and §"Production checklist update"); those references should be read in their original temporal context. |
| `frontend/node_modules/@hono/node-server/dist/vercel.*` | Third-party package code (Hono's optional Vercel adapter). Not used by this project — Vite is the frontend bundler. Untouched. |
| `analysis.md` | Phase-1 historical analysis at the repo root; flagged in [ISSUES_AND_NOTES.md §7](../ISSUES_AND_NOTES.md) as "not necessarily kept in sync." Verified there are no Railway/Vercel references inside it (grep returned no matches). |
| `runtime.txt` | Kept (see "Files deleted" rationale above). Still useful as a `python-3.11` hint for `pyenv`/`asdf` on the VPS. |
| `.github/workflows/` | Does not exist in the repo — no CI/CD config to update. |
| `vercel.json`, `.vercel/` | None present at repo root. Only matches were node_modules transitive deps (see above). |
| [backend/database.py](../../backend/database.py) — DB-URL normalization logic itself | Per the task brief: kept intact. The `postgres://` → `postgresql://` rewrite still applies to any managed or self-hosted Postgres that hands out the legacy scheme. Only the surrounding *comments* were rebranded. |
| [frontend/src/lib/api.js](../../frontend/src/lib/api.js) `VITE_API_BASE_URL` pattern | Per the task brief: kept intact. The env-driven base URL is needed regardless of host. |

---

## References intentionally kept (and why)

- **`postgres://` → `postgresql://` normalization** in [backend/database.py](../../backend/database.py). Useful for any Postgres provider that still emits the legacy URL form (PaaS panels, Heroku exports, copy-paste from older docs).
- **`pool_pre_ping=True`** on the non-SQLite engine. Sensible default for any long-lived Postgres pool — not Railway-specific.
- **`runtime.txt`** at the repo root. Documents the supported Python version (`python-3.11`) and is read by `pyenv` / `asdf` plugins.
- **`VITE_API_BASE_URL`** pattern in [frontend/src/lib/api.js:8](../../frontend/src/lib/api.js#L8). Same env-driven approach works on any host.
- **All env-var *names***. Only descriptions/examples changed; the schema in [backend/config.py](../../backend/config.py) is unchanged.

---

## Updated deployment checklist (VPS — first deploy)

Mirror of the new [docs/ISSUES_AND_NOTES.md §9](../ISSUES_AND_NOTES.md). Operator runs through these in order before the first cutover:

1. **Provision the VPS.** Linux (Ubuntu/Debian recommended), Python 3.11, Node ≥18, Nginx or Caddy, systemd. Open ports 80/443 only.
2. **Install PostgreSQL** on the VPS (or a sibling DB host on the LAN). Create the `screenai_lab` DB + role, set `DATABASE_URL=postgresql://...` in the backend `.env`.
3. **Set `SECRET_KEY`** — `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Startup guard refuses to boot with the placeholder.
4. **Set `ENVIRONMENT=production`** so the startup guards actually engage.
5. **Set `ALLOWED_ORIGINS`** to the production frontend domain(s), comma-separated. Startup guard refuses boot if empty in non-dev.
6. **Set `DEEPSEEK_API_KEY`** — server boots without it but evaluation will fail.
7. **Configure the frontend `VITE_API_BASE_URL`** before `npm run build` — Vite inlines env vars at build time.
8. **Persist `models/ner/`** (HuggingFace cache) on durable storage to avoid re-downloading IndoBERT on every restart.
9. **Plan backups for `data/` and `uploads/`** (filesystem snapshot or nightly `rsync` off-host).
10. **Write a systemd unit** running `uvicorn backend.main:app --host 127.0.0.1 --port 8000`, loading the `.env`, with `Restart=on-failure`. Confirm `alembic upgrade head` (auto-run in the FastAPI lifespan) is clean on first boot.
11. **Configure the reverse proxy** (Nginx / Caddy) to terminate TLS, proxy `/api/*` → `127.0.0.1:8000`, and serve `frontend/dist/` as static assets for everything else.
12. **Wire `/api/health` to monitoring** (Uptime Kuma, cron + curl, etc).

---

## Smoke-test results

| Test | Result |
|---|---|
| `python -m scripts.smoke_test_auth` | 16/16 passed |
| `python -m scripts.smoke_test_applications` | All checks passed (registration → application create → upload 6 docs → MIME/size guards → submit gate → post-submit lock + disk layout) |

Nothing broke. The deletions and doc rewrites are pure config/text changes — no runtime code paths touched beyond comment edits.
