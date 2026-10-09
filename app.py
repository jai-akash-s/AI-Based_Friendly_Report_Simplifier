from flask import Flask, jsonify, render_template, request, send_from_directory, session
from config import Config
from database.models import db
from routes.upload_routes import upload_bp
from routes.report_routes import report_bp
from routes.patient_routes import patient_bp
from routes.auth_routes import auth_bp, init_oauth
from services.medicine_lookup import refresh_medicine_index

import os
from sqlalchemy import inspect, text

app = Flask(__name__)
app.config.from_object(Config)
app.config["FRONTEND_DIST"] = os.path.join(Config.BASE_DIR, "frontend", "dist")
init_oauth(app)


@app.route("/assets/<path:filename>")
def frontend_assets(filename):
    return send_from_directory(os.path.join(app.config["FRONTEND_DIST"], "assets"), filename)


@app.route("/logo.webp")
def frontend_logo():
    return send_from_directory(app.config["FRONTEND_DIST"], "logo.webp", mimetype="image/webp")


@app.route("/logo-favicon.png")
def frontend_logo_favicon():
    return send_from_directory(app.config["FRONTEND_DIST"], "logo-favicon.png", mimetype="image/png")

# Initialize Database Extension
db.init_app(app)

def ensure_database_schema():
    db_dir = os.path.join(Config.BASE_DIR, "database")
    os.makedirs(db_dir, exist_ok=True)
    db.create_all()
    inspector = inspect(db.engine)
    migrations = [
        ("patients", "owner_id", "INTEGER"),
        ("medical_reports", "owner_id", "INTEGER"),
        ("medical_reports", "title", "VARCHAR(255)"),
        ("medical_reports", "lab_results", "TEXT"),
        ("medical_reports", "medicine_results", "TEXT"),
        ("users", "password_hash", "VARCHAR(255)"),
        ("users", "role", "VARCHAR(30)"),
    ]
    for table_name, column_name, column_type in migrations:
        columns = {column["name"] for column in inspector.get_columns(table_name)}
        if column_name not in columns:
            db.session.execute(
                text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}")
            )
    db.session.execute(text("UPDATE users SET role = 'patient' WHERE role IS NULL"))
    db.session.commit()


with app.app_context():
    ensure_database_schema()
    refresh_medicine_index()


@app.before_request
def ensure_database_before_request():
    ensure_database_schema()
    if (
        app.config.get("CSRF_ENABLED")
        and request.method in {"POST", "PATCH", "PUT", "DELETE"}
        and request.path.startswith("/api/")
        and request.path not in {"/api/login", "/api/register", "/api/logout"}
        and request.headers.get("X-CSRF-Token") != session.get("csrf_token")
    ):
        return jsonify({"error": "Invalid CSRF token."}), 403


# Register Blueprints
app.register_blueprint(upload_bp)
app.register_blueprint(report_bp)
app.register_blueprint(patient_bp)
app.register_blueprint(auth_bp)


@app.get("/health")
def health_check():
    return jsonify({
        "status": "ok",
        "service": "medical-report-simplifier",
        "database": "ready",
    })


@app.after_request
def prevent_authenticated_page_cache(response):
    if not request.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
    return response


@app.errorhandler(413)
def request_too_large(error):
    message = "This file is too large. Please upload a file smaller than 16 MB."
    if request.path.startswith("/api/"):
        return {"error": message}, 413
    return render_template("index.html", error=message), 413

if __name__ == "__main__":
    app.run(debug=True, use_reloader=False)
