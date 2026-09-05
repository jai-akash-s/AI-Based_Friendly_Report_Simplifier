from flask import Blueprint, render_template, request, redirect, jsonify, flash, url_for
from database.models import db, Patient, MedicalReport
from routes.auth_routes import login_required

patient_bp = Blueprint("patient", __name__, url_prefix="/patients")


@patient_bp.route("/", methods=["GET"])
@login_required
def list_patients():
    """Lists all registered patients in professional table format."""
    patients = Patient.query.order_by(Patient.created_at.desc()).all()
    return render_template("patients.html", patients=patients)


@patient_bp.route("/add", methods=["GET", "POST"])
@login_required
def add_patient():
    """Adds a new patient to the database."""
    if request.method == "POST":
        full_name = request.form.get("full_name", "").strip()
        age = request.form.get("age", type=int)
        gender = request.form.get("gender", "").strip()
        blood_group = request.form.get("blood_group", "").strip()
        contact_email = request.form.get("contact_email", "").strip()
        contact_phone = request.form.get("contact_phone", "").strip()

        if not full_name:
            return render_template("add_patient.html", error="Patient full name is required.")

        patient = Patient(
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


@patient_bp.route("/<int:patient_id>", methods=["GET"])
@login_required
def view_patient(patient_id):
    """Displays detailed patient record and history of medical reports."""
    patient = db.get_or_404(Patient, patient_id)
    return render_template("patient_detail.html", patient=patient)


@patient_bp.route("/api/list", methods=["GET"])
@login_required
def api_list_patients():
    """Returns JSON list of patients for frontend select inputs."""
    patients = Patient.query.order_by(Patient.full_name.asc()).all()
    return jsonify([p.to_dict() for p in patients])
