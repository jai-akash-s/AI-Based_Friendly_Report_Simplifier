import os
from dotenv import load_dotenv
from datetime import timedelta

load_dotenv()

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

def _build_database_uri() -> str:
    raw_db_url = os.environ.get("DATABASE_URL", "").strip()
    if not raw_db_url:
        return "sqlite:///" + os.path.join(BASE_DIR, "database", "medreport.db").replace("\\", "/")

    if raw_db_url.startswith("sqlite:///") and not raw_db_url.startswith("sqlite:////"):
        subpath = raw_db_url.replace("sqlite:///", "", 1)
        if not os.path.isabs(subpath) and ":" not in subpath[:2]:
            abs_db_path = os.path.abspath(os.path.join(BASE_DIR, subpath)).replace("\\", "/")
            raw_db_url = f"sqlite:///{abs_db_path}"

    # SQLAlchemy compatibility: postgres:// -> postgresql://
    if raw_db_url.startswith("postgres://"):
        raw_db_url = raw_db_url.replace("postgres://", "postgresql://", 1)

    # Supabase / cloud PostgreSQL SSL handling for all PostgreSQL dialect schemes
    if raw_db_url.startswith("postgresql://") or raw_db_url.startswith("postgresql+"):
        cloud_domains = ("supabase", "neon", "render", "aws", "pooler")
        if "sslmode=" not in raw_db_url and any(domain in raw_db_url for domain in cloud_domains):
            sep = "&" if "?" in raw_db_url else "?"
            raw_db_url = f"{raw_db_url}{sep}sslmode=require"

    return raw_db_url


class Config:

    BASE_DIR = BASE_DIR
    SECRET_KEY = os.environ.get("SECRET_KEY", "development-only-change-me")
    PERMANENT_SESSION_LIFETIME = timedelta(days=7)
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SECURE = os.environ.get("SESSION_COOKIE_SECURE", "false").lower() == "true"
    SESSION_COOKIE_SAMESITE = os.environ.get(
        "SESSION_COOKIE_SAMESITE",
        "None" if os.environ.get("SESSION_COOKIE_SECURE", "false").lower() == "true" else "Lax"
    )
    CSRF_ENABLED = os.environ.get("CSRF_ENABLED", "true").lower() == "true"
    CORS_ORIGINS = [
        origin.strip()
        for origin in os.environ.get(
            "CORS_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173"
        ).split(",")
        if origin.strip()
    ]
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 300,
    }

    SQLALCHEMY_DATABASE_URI = _build_database_uri()

    SQLALCHEMY_TRACK_MODIFICATIONS = False

    UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")

    MAX_CONTENT_LENGTH = 16 * 1024 * 1024   # 16 MB

    ALLOWED_EXTENSIONS = {
        "pdf",
        "png",
        "jpg",
        "jpeg",
        "txt"
    }