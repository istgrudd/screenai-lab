"""FastAPI application entry point.

Initializes the app, registers middleware & routers, and creates
database tables on startup.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import settings
from backend.database import SessionLocal, init_db
from backend.routers.auth import router as auth_router
from backend.routers.upload import router as upload_router
from backend.routers.rubrics import router as rubrics_router
from backend.routers.evaluation import router as evaluation_router
from backend.routers.evaluate_batch import router as evaluate_batch_router
from backend.routers.announcements import router as announcements_router
from backend.routers.candidates import (
    router as candidates_router,
    my_applications_router,
)
from backend.routers.applications import (
    router as applications_router,
    recruiter_router as applications_recruiter_router,
)
from backend.routers.documents import router as documents_router
from backend.routers.users import router as users_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Runs on application startup and shutdown.

    Startup:
        - Ensure data directories exist
        - Create database tables (if not already present)
    """
    # --- Startup ---
    settings.ensure_data_dirs()

    # Import models so they register with Base before init_db
    import backend.models  # noqa: F401

    init_db()
    print("[OK] Database initialized")
    print("[OK] Data directories ready")

    # Idempotent seed: one empty rubric per MBC Laboratory division.
    from backend.services.rubric_seeding import seed_division_rubrics

    db = SessionLocal()
    try:
        created = seed_division_rubrics(db)
        if created:
            print(f"[OK] Seeded division rubrics: {', '.join(created)}")
        else:
            print("[OK] Division rubrics already present")
    finally:
        db.close()

    print(f"[OK] Server running on port {settings.app_port}")

    yield

    # --- Shutdown ---
    print("Shutting down...")


app = FastAPI(
    title="ScreenAI Lab",
    description="MBC Laboratory recruitment screening system — candidate portal + AI-driven evaluation (NER blind screening, RAG competency evaluation, Explainable AI).",
    version="0.1.0",
    lifespan=lifespan,
)

# --- CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Routers ---
app.include_router(auth_router)
app.include_router(upload_router)
app.include_router(rubrics_router)
app.include_router(evaluation_router)
app.include_router(evaluate_batch_router)
app.include_router(announcements_router)
app.include_router(candidates_router)
app.include_router(my_applications_router)
app.include_router(applications_router)
app.include_router(applications_recruiter_router)
app.include_router(documents_router)
app.include_router(users_router)


# --- Health Check ---
@app.get("/api/health", tags=["system"])
def health_check():
    """Health check endpoint to verify the API is running."""
    return {
        "success": True,
        "data": {
            "status": "healthy",
            "version": "0.1.0",
        },
        "error": None,
    }
