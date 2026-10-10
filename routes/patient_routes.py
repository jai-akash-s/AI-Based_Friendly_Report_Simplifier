from flask import Blueprint, render_template, request, redirect, jsonify, flash, url_for, current_app
from database.models import db, Patient, MedicalReport, Reminder
from routes.auth_routes import get_current_user, log_audit, login_required
from services.privacy import delete_report_file

patient_bp = Blueprint("patient", __name__)


@patient_bp.route("/patients", methods=["GET"])
@patient_bp.route("/patients/", methods=["GET"])
@login_required
def list_patients():
    """Lists all registered patients in professional table format."""
    user = get_current_user()
    patients = Patient.query.filter_by(owner_id=user.id).order_by(Patient.created_at.desc()).all()
    return render_template("patients.html", patients=patients)


@patient_bp.route("/patients/add", methods=["GET", "POST"])
@login_required
def add_patient():
    """Adds a new patient to the database."""
    if request.method == "POST":
        user = get_current_user()
        full_name = request.form.get("full_name", "").strip()
        age = request.form.get("age", type=int)
        gender = request.form.get("gender", "").strip()
        blood_group = request.form.get("blood_group", "").strip()
        contact_email = request.form.get("contact_email", "").strip()
        contact_phone = request.form.get("contact_phone", "").strip()

        if not full_name:
            return render_template("add_patient.html", error="Patient full name is required.")

        patient = Patient(
            owner_id=user.id,
            full_name=full_name,
            age=age,
            gender=gender,
            blood_group=blood_group,
            contact_email=contact_email,
            contact_phone=contact_phone,
        )
        db.session.add(patient)
        db.session.commit()

        return redirect(url_for("patient.view_patient", patient_id=patient.id))

    return render_template("add_patient.html")


@patient_bp.route("/patients/<int:patient_id>", methods=["GET"])
@login_required
def view_patient(patient_id):
    """Displays detailed patient record and history of medical reports."""
    patient = Patient.query.filter_by(id=patient_id, owner_id=get_current_user().id).first_or_404()
    return render_template("patient_detail.html", patient=patient)


@patient_bp.route("/patients/<int:patient_id>/delete", methods=["POST"])
@login_required
def delete_patient_html(patient_id):
    """HTML form endpoint to delete a patient record and its associated data."""
    patient = Patient.query.filter_by(id=patient_id, owner_id=get_current_user().id).first_or_404()
    upload_folder = current_app.config.get("UPLOAD_FOLDER")
    for report in list(patient.reports):
        if report.file_path and upload_folder:
            try:
                delete_report_file(report.file_path, upload_folder)
            except OSError as err:
                current_app.logger.warning("Could not delete report file %s: %s", report.file_path, err)

    report_ids = [r.id for r in patient.reports]
    Reminder.query.filter_by(patient_id=patient.id).delete(synchronize_session=False)
    if report_ids:
        Reminder.query.filter(Reminder.report_id.in_(report_ids)).delete(synchronize_session=False)

    db.session.delete(patient)
    db.session.commit()
    log_audit("patient_delete", "patient", patient_id)
    return redirect(url_for("patient.list_patients"))


@patient_bp.route("/patients/api/list", methods=["GET"])
@patient_bp.route("/api/patients/list", methods=["GET"])
@patient_bp.route("/api/patients", methods=["GET"])
@login_required
def api_list_patients():
    """Returns JSON list of patients for frontend select inputs."""
    user = get_current_user()
    patients = Patient.query.filter_by(owner_id=user.id).order_by(Patient.full_name.asc()).all()
    return jsonify([p.to_dict() for p in patients])


@patient_bp.route("/patients/api", methods=["POST"])
@patient_bp.route("/api/patients", methods=["POST"])
@login_required
def api_create_patient():
    user = get_current_user()
    payload = request.get_json(silent=True) or {}
    full_name = str(payload.get("full_name", "")).strip()
    if not full_name:
        return jsonify({"error": "Patient full name is required."}), 400

    patient = Patient(
        owner_id=user.id,
        full_name=full_name,
        age=payload.get("age"),
        gender=str(payload.get("gender", "")).strip(),
        blood_group=str(payload.get("blood_group", "")).strip(),
        contact_email=str(payload.get("contact_email", "")).strip(),
        contact_phone=str(payload.get("contact_phone", "")).strip(),
    )
    db.session.add(patient)
    db.session.commit()
    return jsonify(patient.to_dict()), 201


@patient_bp.route("/patients/api/<int:patient_id>", methods=["GET"])
@patient_bp.route("/api/patients/<int:patient_id>", methods=["GET"])
@login_required
def api_patient_detail(patient_id):
    patient = Patient.query.filter_by(id=patient_id, owner_id=get_current_user().id).first_or_404()
    return jsonify({
        **patient.to_dict(),
        "reports": [report.to_dict() for report in patient.reports],
    })


@patient_bp.route("/patients/api/<int:patient_id>", methods=["PATCH", "DELETE"])
@patient_bp.route("/api/patients/<int:patient_id>", methods=["PATCH", "DELETE"])
@login_required
def manage_patient(patient_id):
    patient = Patient.query.filter_by(id=patient_id, owner_id=get_current_user().id).first_or_404()
    if request.method == "DELETE":
        # 1. Clean up physical report files from storage
        upload_folder = current_app.config.get("UPLOAD_FOLDER")
        for report in list(patient.reports):
            if report.file_path and upload_folder:
                try:
                    delete_report_file(report.file_path, upload_folder)
                except OSError as err:
                    current_app.logger.warning("Could not delete report file %s: %s", report.file_path, err)

        # 2. Delete reminders associated with the patient or patient's reports
        report_ids = [r.id for r in patient.reports]
        Reminder.query.filter_by(patient_id=patient.id).delete(synchronize_session=False)
        if report_ids:
            Reminder.query.filter(Reminder.report_id.in_(report_ids)).delete(synchronize_session=False)

        # 3. Delete patient (cascading reports, entities, recommendations)
        db.session.delete(patient)
        db.session.commit()
        log_audit("patient_delete", "patient", patient_id)
        return jsonify({"deleted": True})

    payload = request.get_json(silent=True) or {}
    full_name = str(payload.get("full_name", patient.full_name)).strip()
    if not full_name:
        return jsonify({"error": "Patient full name is required."}), 400
    patient.full_name = full_name
    for field in ("age", "gender", "blood_group", "contact_email", "contact_phone"):
        if field in payload:
            setattr(patient, field, payload[field])
    db.session.commit()
    log_audit("patient_update", "patient", patient_id)
    return jsonify(patient.to_dict())
