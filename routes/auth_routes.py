from functools import wraps

from flask import Blueprint, flash, redirect, render_template, request, session, url_for


auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    """Authenticate a local workspace user and start their session."""
    if session.get("authenticated"):
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
            session.clear()
            session["authenticated"] = True
            session["user_email"] = email
            session.permanent = request.form.get("remember") == "on"
            return redirect(url_for("upload.home"))

    return render_template("login.html", error=error)


@auth_bp.route("/", methods=["GET"])
def entrypoint():
    if session.get("authenticated"):
        return redirect(url_for("upload.home"))
    return render_template("login.html")


@auth_bp.route("/register", methods=["GET", "POST"])
def register():
    if session.get("authenticated"):
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
            session.clear()
            session["authenticated"] = True
            session["user_email"] = email
            session.permanent = True
            return redirect(url_for("upload.home"))

    return render_template("register.html", error=error)


@auth_bp.route("/logout", methods=["POST", "GET"])
def logout():
    session.clear()
    response = redirect(url_for("auth.login"))
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return response


def login_required(view):
    @wraps(view)
    def wrapped_view(*args, **kwargs):
        if not session.get("authenticated"):
            return redirect(url_for("auth.login", next=request.path))
        return view(*args, **kwargs)

    return wrapped_view
