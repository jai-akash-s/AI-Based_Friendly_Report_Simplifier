import os
from dotenv import load_dotenv
from datetime import timedelta

load_dotenv()

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

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
    }

    _raw_db_url = os.environ.get("DATABASE_URL", "").strip()
    if not _raw_db_url:
        _raw_db_url = "sqlite:///" + os.path.join(BASE_DIR, "database", "medreport.db").replace("\\", "/")
    elif _raw_db_url.startswith("sqlite:///") and not _raw_db_url.startswith("sqlite:////"):
        subpath = _raw_db_url.replace("sqlite:///", "", 1)
        if not os.path.isabs(subpath) and ":" not in subpath[:2]:
            abs_db_path = os.path.abspath(os.path.join(BASE_DIR, subpath)).replace("\\", "/")
            _raw_db_url = f"sqlite:///{abs_db_path}"

    # SQLAlchemy 1.4+ compatibility: postgres:// -> postgresql://
    if _raw_db_url.startswith("postgres://"):
        _raw_db_url = _raw_db_url.replace("postgres://", "postgresql://", 1)

    SQLALCHEMY_DATABASE_URI = _raw_db_url

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