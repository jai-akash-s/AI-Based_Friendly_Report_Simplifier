from functools import wraps
from flask import Blueprint, jsonify, request, current_app
from database.models import db, User, Patient, MedicalReport, Reminder, AuditLog
from routes.auth_routes import get_current_user, login_required, log_audit
from services.privacy import delete_report_file

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")

PROTECTED_ADMINS = {"akash.saravanan1797@gmail.com"}


def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = get_current_user()
        if not user or (user.role != "admin" and user.email.lower() not in PROTECTED_ADMINS):
            return jsonify({"error": "Admin authorization required."}), 403
        return view(*args, **kwargs)
    return wrapped


@admin_bp.route("/overview", methods=["GET"])
@login_required
@admin_required
def admin_overview():
    """Returns high-level system metrics and recent registrations for admin dashboard."""
    total_users = User.query.count()
    total_patients = Patient.query.count()
    total_reports = MedicalReport.query.count()
    total_reminders = Reminder.query.count()
    admins_count = User.query.filter((User.role == "admin") | (User.email.in_(PROTECTED_ADMINS))).count()

    latest_users = (
        User.query.order_by(User.created_at.desc())
        .limit(6)
        .all()
    )

    return jsonify({
        "total_users": total_users,
        "total_patients": total_patients,
        "total_reports": total_reports,
        "total_reminders": total_reminders,
        "admins_count": admins_count,
        "system_status": "All systems operational",
        "latest_users": [u.to_dict() for u in latest_users],
    })


@admin_bp.route("/users", methods=["GET"])
@login_required
@admin_required
def admin_list_users():
    """Returns full directory of registered users with role and record metrics."""
    users = User.query.order_by(User.created_at.desc()).all()
    return jsonify([u.to_dict() for u in users])


@admin_bp.route("/users/<int:user_id>/role", methods=["PATCH"])
@login_required
@admin_required
def admin_update_user_role(user_id):
    """Update role for a user (promote/demote)."""
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found."}), 404

    if user.email.lower() in PROTECTED_ADMINS:
        return jsonify({"error": "Primary administrator role cannot be altered."}), 400

    payload = request.get_json(silent=True) or {}
    new_role = str(payload.get("role", "")).strip().lower()
    if new_role not in {"admin", "user"}:
        return jsonify({"error": "Role must be 'admin' or 'user'."}), 400

    user.role = new_role
    db.session.commit()
    log_audit("user_role_change", "user", user.id)
    return jsonify(user.to_dict())


@admin_bp.route("/users/<int:user_id>", methods=["DELETE"])
@login_required
@admin_required
def admin_delete_user(user_id):
    """Deletes a user account and cascades file and database cleanup."""
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found."}), 404

    if user.email.lower() in PROTECTED_ADMINS:
        return jsonify({"error": "Primary administrator account cannot be deleted."}), 400

    upload_folder = current_app.config.get("UPLOAD_FOLDER")
    for report in list(user.reports):
        if report.file_path and upload_folder:
            try:
                delete_report_file(report.file_path, upload_folder)
            except OSError as err:
                current_app.logger.warning("Could not delete report file during user deletion: %s", err)

    Reminder.query.filter_by(owner_id=user.id).delete(synchronize_session=False)
    AuditLog.query.filter_by(user_id=user.id).delete(synchronize_session=False)
    Patient.query.filter_by(owner_id=user.id).delete(synchronize_session=False)

    db.session.delete(user)
    db.session.commit()
    log_audit("admin_user_deleted", "user", user_id)
    return jsonify({"deleted": True})


@admin_bp.route("/audit-logs", methods=["GET"])
@login_required
@admin_required
def admin_audit_logs():
    """Returns recent system audit events."""
    logs = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(150).all()
    results = []
    for log in logs:
        results.append({
            "id": log.id,
            "action": log.action,
            "resource_type": log.resource_type,
            "resource_id": log.resource_id,
            "created_at": log.created_at.isoformat() if log.created_at else None,
            "user_email": log.user.email if log.user else "Anonymous/System",
        })
    return jsonify(results)
