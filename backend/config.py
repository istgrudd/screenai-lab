"""Application configuration loaded from environment variables."""

import os

from pydantic_settings import BaseSettings
from pathlib import Path

# Hugging Face offline mode — opt-in via HF_HUB_OFFLINE=1. Once the NER model is
# cached on disk (dev/staging after the first download, or pre-baked into the
# production image), this skips the boot-time round-trips to huggingface.co
# (config/tokenizer/vocab/safetensors HEAD+GET, refs/commits/discussions) and the
# "unauthenticated requests to HF Hub" warning. The HF libraries read these env
# vars at import time, so this must run before `transformers`/`huggingface_hub`
# are imported — config is the earliest backend module imported by main.py, which
# is why it lives here rather than in the lifespan. Leave HF_HUB_OFFLINE unset for
# the first run so the model can still download.
if os.getenv("HF_HUB_OFFLINE") == "1":
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")


class Settings(BaseSettings):
    """Central configuration for the application.

    Values are loaded from a .env file at the project root,
    with environment variables taking precedence.
    """

    # --- DeepSeek LLM ---
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com/v1"

    # --- Database ---
    database_url: str = "sqlite:///./data/screenai_lab.db"

    # --- Vector Store ---
    chroma_persist_dir: str = "./backend/vectorstore"

    # --- NER Model ---
    ner_model_name: str = "ageng-anugrah/indobert-large-p2-finetuned-ner"
    ner_cache_dir: str = "./models/ner"

    # --- Embedding Model ---
    embedding_model_name: str = "sentence-transformers/all-MiniLM-L6-v2"

    # --- App ---
    app_port: int = 8000
    frontend_url: str = "http://localhost:5173"
    environment: str = "development"
    # Comma-separated list of allowed CORS origins. Falls back to frontend_url when empty.
    allowed_origins: str = ""

    # --- Auth ---
    secret_key: str = "dev-secret-change-me-in-production-min-32-chars"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 480

    # --- Email / account verification ---
    resend_api_key: str = ""
    email_from: str = ""
    public_frontend_url: str = "http://localhost:5173"
    email_enabled: bool = False
    email_verification_expire_minutes: int = 60
    email_resend_cooldown_seconds: int = 60
    password_reset_expire_minutes: int = 60
    password_reset_cooldown_seconds: int = 60

    @property
    def cors_origins(self) -> list[str]:
        """Return the list of origins allowed to call the API.

        Production deployments set ALLOWED_ORIGINS to a comma-separated list
        (e.g. "https://screenai-lab.example.com,https://www.example.com").
        Local dev falls back to a single FRONTEND_URL.
        """
        if self.allowed_origins.strip():
            return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]
        return [self.frontend_url]

    # --- Data directories ---
    raw_pdfs_dir: str = "./data/raw_pdfs"
    extracted_dir: str = "./data/extracted"
    anonymized_dir: str = "./data/anonymized"

    # --- Candidate uploads (Phase 1) ---
    # Root directory for candidate-submitted application documents.
    # Files are stored at {upload_dir}/{application_id}/{doc_type}.{ext}.
    upload_dir: str = "./uploads"

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }

    def ensure_data_dirs(self) -> None:
        """Create data directories if they don't exist."""
        for dir_path in [
            self.raw_pdfs_dir,
            self.extracted_dir,
            self.anonymized_dir,
            self.upload_dir,
        ]:
            Path(dir_path).mkdir(parents=True, exist_ok=True)
        Path(self.chroma_persist_dir).mkdir(parents=True, exist_ok=True)


settings = Settings()
