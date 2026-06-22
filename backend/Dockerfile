# ScreenAI Lab — Backend container
#
# Build from the *repo root*, not from backend/, because:
#   - requirements.txt lives at the repo root.
#   - alembic.ini lives at the repo root and is read by init_db() lifespan.
#   - Application code uses absolute imports like `from backend.config import settings`,
#     so the `backend/` directory must sit beside the working directory.
#
# Use the matching docker-compose service definition:
#   build:
#     context: .
#     dockerfile: backend/Dockerfile

FROM python:3.11-slim

# Keep Python output unbuffered so `docker compose logs` shows uvicorn output
# in real time, and skip writing .pyc files inside the container.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install Python dependencies first so the layer can be cached when only
# application code changes. requirements.txt is the only file we look at here.
COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copy the application source. alembic.ini sits at /app and is resolved by
# backend/database.py::init_db via Path(__file__).resolve().parent.parent.
COPY backend ./backend
COPY alembic.ini ./
COPY scripts ./scripts

# Pre-bake the IndoBERT NER model into the image (W5 ops hardening). This is the
# ~1.3 GB download that Phase 1/2 paid on the *first* boot of every fresh
# deployment; doing it at build time means the runtime container makes ZERO
# huggingface.co round-trips. The model lands in settings.ner_cache_dir
# (./models/ner -> /app/models/ner, the same path the runtime loader reads), so
# get_ner_pipeline() resolves it straight from disk.
#
# Order matters: this RUN happens BEFORE the HF offline ENV below (so the
# download is allowed to reach the Hub) and BEFORE the VOLUME declaration (data
# written to a path that is later declared VOLUME would be discarded). The model
# dir is therefore intentionally NOT a VOLUME — it is immutable, reproducible
# image content, not mutable runtime state.
RUN python -c "from backend.config import settings; \
from transformers import AutoTokenizer, AutoModelForTokenClassification; \
AutoTokenizer.from_pretrained(settings.ner_model_name, cache_dir=settings.ner_cache_dir); \
AutoModelForTokenClassification.from_pretrained(settings.ner_model_name, cache_dir=settings.ner_cache_dir); \
print('[build] NER model cached to', settings.ner_cache_dir)"

# PostgreSQL 16 client (pg_dump/pg_restore) for scripts/archive_period.py.
# The archive's full-DB snapshot has to run from INSIDE this container
# (`--dump-mode local`): the db container is reachable only on the compose
# network as db:5432, and the host has neither Python nor a published Postgres
# port. The client MUST be v16 to match the postgres:16-alpine server — a v15
# pg_dump refuses to dump a v16 server. Debian's bundled postgresql-client is
# too old, so install from the official PGDG apt repo for THIS image's codename
# (read from /etc/os-release, so it tracks whatever Debian python:3.11-slim is
# on). apt lists are cleaned in the same layer to keep the image lean. Placed
# AFTER the ~1.3 GB model bake so that expensive layer stays cached on rebuilds.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends curl ca-certificates gnupg; \
    install -d /usr/share/postgresql-common/pgdg; \
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
        -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc; \
    . /etc/os-release; \
    echo "[build] base image codename: ${VERSION_CODENAME}"; \
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends postgresql-client-16; \
    apt-get purge -y --auto-remove curl gnupg; \
    rm -rf /var/lib/apt/lists/*; \
    pg_dump --version; \
    pg_restore --version

# Runtime is fully offline for Hugging Face: the model is already baked in above,
# so boot performs no network calls (no config/tokenizer/safetensors HEAD+GET,
# no 'unauthenticated requests to HF Hub' warning). The libraries read these at
# import time; setting them here (after the download) makes offline the image
# default without touching .env.
ENV HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1

# Persisted directories — declared so a `docker run` without docker-compose
# still gets durable storage for *mutable* state. In normal use
# docker-compose.yml mounts host directories over these paths. The NER model
# dir is deliberately excluded (baked into the image above, immutable).
#
#   /app/data     — SQLite dev DB, legacy raw_pdfs, extracted, anonymized
#   /app/uploads  — candidate-submitted application documents
VOLUME ["/app/data", "/app/uploads"]

EXPOSE 8000

# Run uvicorn as the package entry point. The absolute-import path is the
# one used everywhere in the codebase (`backend.main:app`); `main:app` would
# fail because backend imports its own package.
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
