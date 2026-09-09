"""Authentication routes and account management."""

# Flask-SQLAlchemy generates model constructors dynamically at runtime.
# pyright: reportCallIssue=false

from functools import wraps
import os
from urllib.parse import urlencode

from flask import Blueprint, current_app, flash, jsonify, redirect, render_template, request, send_from_directory, session, url_for
from authlib.integrations.flask_client import OAuth
from database.models import User, db


auth_bp = Blueprint("auth", __name__)
oauth = OAuth()
OAUTH_PLACEHOLDERS = {
    "your-client-id.apps.googleusercontent.com",
    "your-client-secret",
    "your-real-google-client-id",
    "your-real-google-client-secret",
    "your_real_google_client_id",
    "your_real_google_client_secret",
    "actual-client-id",
    "actual-client-secret",
    "paste-your-real-client-id-here",
    "paste-your-real-client-secret-here",
}


def _is_api_request():
    return "/api/" in request.path or request.is_json


def get_current_user():
    user_id = session.get("user_id")
    if user_id:
        user = db.session.get(User, user_id)
        if user:
            return user
    email = session.get("user_email")
    if not email:
        return None
    user = User.query.filter_by(email=email.lower()).first()
    if not user:
        user = ensure_user(
            email,
            provider=session.get("auth_provider", "local"),
        )
    return user


def ensure_user(email, display_name=None, provider="local"):
    email = email.strip().lower()
    user = User.query.filter_by(email=email).first()
    if not user:
        user = User(email=email, display_name=display_name, provider=provider)
        db.session.add(user)
    else:
        if display_name and not user.display_name:
            user.display_name = display_name
        if provider != "local":
            user.provider = provider
    db.session.commit()
    return user


def sign_in_user(email, display_name=None, provider="local"):
    user = ensure_user(email, display_name, provider)
    session.clear()
    session["authenticated"] = True
    session["user_id"] = user.id
    session["user_email"] = user.email
    session["auth_provider"] = user.provider
    session.permanent = True
    return user


def google_oauth_configured():
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "")
    return bool(
        client_id
        and client_secret
        and client_id.lower() not in OAUTH_PLACEHOLDERS
        and client_secret.lower() not in OAUTH_PLACEHOLDERS
    )


def init_oauth(app):
    oauth.init_app(app)
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    if client_id and client_secret:
        oauth.register(
            name="google",
            client_id=client_id,
            client_secret=client_secret,
            server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
            client_kwargs={"scope": "openid email profile"},
        )


@auth_bp.route("/login", methods=["GET", "POST"])
@auth_bp.route("/api/login", methods=["POST"])
def login():
    """Authenticate a local workspace user and start their session."""
    if session.get("authenticated"):
        if _is_api_request():
            return jsonify({"authenticated": True, "user_email": session.get("user_email", "Workspace user")})
        return redirect(url_for("upload.home"))

    error = None
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")

        if not email or "@" not in email:
            error = "Enter a valid email address."
        elif len(password) < 6:
            error = "Your password must be at least 6 characters."
        else:
            sign_in_user(email)
            session.permanent = request.form.get("remember") == "on"
            if _is_api_request():
                return jsonify({"authenticated": True, "user_email": email})
            return redirect(url_for("upload.home"))

    if _is_api_request():
        return jsonify({"error": error or "Authentication required."}), 401
    return render_template("login.html", error=error, google_enabled=google_oauth_configured())


@auth_bp.route("/", methods=["GET"])
def entrypoint():
    frontend_index = os.path.join(current_app.config["FRONTEND_DIST"], "index.html")
    if os.path.exists(frontend_index):
        return send_from_directory(current_app.config["FRONTEND_DIST"], "index.html")
    if session.get("authenticated"):
        return redirect(url_for("upload.home"))
    return render_template("login.html", google_enabled=google_oauth_configured())


@auth_bp.route("/register", methods=["GET", "POST"])
@auth_bp.route("/api/register", methods=["POST"])
def register():
    if session.get("authenticated"):
        if _is_api_request():
            return jsonify({"authenticated": True, "user_email": session.get("user_email", "Workspace user")})
        return redirect(url_for("upload.home"))

    error = None
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        confirmation = request.form.get("password_confirmation", "")
        if not email or "@" not in email:
            error = "Enter a valid email address."
        elif len(password) < 6:
            error = "Your password must be at least 6 characters."
        elif password != confirmation:
            error = "Your passwords do not match."
        else:
            sign_in_user(email)
            if _is_api_request():
                return jsonify({"authenticated": True, "user_email": email})
            return redirect(url_for("upload.home"))

    if _is_api_request():
        return jsonify({"error": error or "Unable to create account."}), 400
    return render_template("register.html", error=error)


@auth_bp.route("/api/auth/session", methods=["GET"])
def api_session():
    if not session.get("authenticated"):
        return jsonify({"authenticated": False}), 401
    return jsonify({
        "authenticated": True,
        "user_email": session.get("user_email", "Workspace user"),
    })


@auth_bp.route("/api/auth/config", methods=["GET"])
def api_auth_config():
    return jsonify({"google_enabled": google_oauth_configured()})


@auth_bp.route("/auth/google", methods=["GET"])
def google_login():
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "")
    if not google_oauth_configured():
        return render_template(
            "login.html",
            google_enabled=False,
            error="Google Login is not configured yet. Add your Google Client ID and Client Secret to the .env file.",
        )
    redirect_uri = os.environ.get("GOOGLE_REDIRECT_URI", url_for("auth.google_callback", _external=True))
    return oauth.google.authorize_redirect(redirect_uri, prompt="select_account")


@auth_bp.route("/auth/google/callback", methods=["GET"])
def google_callback():
    try:
        token = oauth.google.authorize_access_token()
        user_info = token.get("userinfo") or {}
        email = user_info.get("email")
        if not email:
            return render_template("login.html", error="Google did not return an email address.")
        sign_in_user(email, user_info.get("name"), "google")
        return redirect(url_for("auth.entrypoint"))
    except Exception as error:
        current_app.logger.exception("Google OAuth callback failed: %s", error)
        return render_template(
            "login.html",
            google_enabled=google_oauth_configured(),
            error="Google sign-in could not be completed. Check the Client Secret and redirect URI in Google Cloud Console.",
        )


@auth_bp.route("/logout", methods=["POST", "GET"])
def logout():
    session.clear()
    if _is_api_request():
        return jsonify({"authenticated": False})
    response = redirect("/login")
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return response


def login_required(view):
    @wraps(view)
    def wrapped_view(*args, **kwargs):
        if not session.get("authenticated") or not get_current_user():
            session.clear()
            if _is_api_request():
                return jsonify({"error": "Authentication required."}), 401
            return redirect(url_for("auth.login", next=request.path))
        return view(*args, **kwargs)

    return wrapped_view
