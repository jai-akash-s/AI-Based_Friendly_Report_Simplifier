from flask import Flask, request, send_from_directory
from config import Config
from database.models import db
from routes.upload_routes import upload_bp
from routes.report_routes import report_bp
from routes.patient_routes import patient_bp
from routes.auth_routes import auth_bp, init_oauth

import os
from sqlalchemy import inspect, text

app = Flask(__name__)
app.config.from_object(Config)
app.config["FRONTEND_DIST"] = os.path.join(Config.BASE_DIR, "frontend", "dist")
init_oauth(app)


@app.route("/assets/<path:filename>")
def frontend_assets(filename):
    return send_from_directory(os.path.join(app.config["FRONTEND_DIST"], "assets"), filename)

# Initialize Database Extension
db.init_app(app)

def ensure_database_schema():
    db_dir = os.path.join(Config.BASE_DIR, "database")
    os.makedirs(db_dir, exist_ok=True)
    db.create_all()
    inspector = inspect(db.engine)
    migrations = {
        "patients": "owner_id",
        "medical_reports": "owner_id",
    }
    for table_name, column_name in migrations.items():
        columns = {column["name"] for column in inspector.get_columns(table_name)}
        if column_name not in columns:
            db.session.execute(
                text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} INTEGER")
            )
    db.session.commit()


with app.app_context():
    ensure_database_schema()


@app.before_request
def ensure_database_before_request():
    ensure_database_schema()


# Register Blueprints
app.register_blueprint(upload_bp)
app.register_blueprint(report_bp)
app.register_blueprint(patient_bp)
app.register_blueprint(auth_bp)


@app.after_request
def prevent_authenticated_page_cache(response):
    if not request.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
    return response

if __name__ == "__main__":
    app.run(debug=True)