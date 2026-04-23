"""SQLAlchemy engine, session, and base model setup."""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from backend.config import settings

# Railway's DATABASE_URL historically uses the legacy "postgres://" scheme
# which SQLAlchemy 2.x no longer recognizes. Normalize it here.
_database_url = settings.database_url
if _database_url.startswith("postgres://"):
    _database_url = _database_url.replace("postgres://", "postgresql://", 1)

_is_sqlite = _database_url.startswith("sqlite")

connect_args: dict = {}
engine_kwargs: dict = {"echo": False}
if _is_sqlite:
    # check_same_thread=False is required for FastAPI's threaded request handling.
    connect_args["check_same_thread"] = False
else:
    # pool_pre_ping avoids stale-connection errors on managed Postgres (Railway, etc).
    engine_kwargs["pool_pre_ping"] = True

engine = create_engine(_database_url, connect_args=connect_args, **engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""
    pass


def get_db():
    """FastAPI dependency that yields a database session.

    Usage in routers:
        @router.get("/items")
        def list_items(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Ensure the database schema is up to date.

    Schema is managed by Alembic (see ``backend/alembic``). On startup
    we apply any pending migrations so devs never boot against a stale
    schema. Run ``alembic revision --autogenerate`` to create new ones.
    """
    from alembic import command
    from alembic.config import Config
    from pathlib import Path

    alembic_ini = Path(__file__).resolve().parent.parent / "alembic.ini"
    cfg = Config(str(alembic_ini))
    command.upgrade(cfg, "head")
