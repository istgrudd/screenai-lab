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

# Persisted directories — declared so a `docker run` without docker-compose
# still gets durable storage. In normal use the docker-compose.yml mounts
# host directories over these paths.
#
#   /app/models/ner  — HuggingFace IndoBERT cache (~1.3 GB first download)
#   /app/data        — SQLite dev DB, uploads, raw_pdfs, extracted, anonymized
VOLUME ["/app/models/ner", "/app/data"]

EXPOSE 8000

# Run uvicorn as the package entry point. The absolute-import path is the
# one used everywhere in the codebase (`backend.main:app`); `main:app` would
# fail because backend imports its own package.
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
