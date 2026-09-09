from flask import Blueprint, jsonify, render_template, request, current_app
from werkzeug.utils import secure_filename
import os

from core.extractor import OCRNotAvailableError, extract_text
from core.simplifier import simplify_report
from core.patient_extractor import extract_patient_info
from database.models import db, Patient, MedicalReport, MedicalEntity, Recommendation
from routes.auth_routes import get_current_user, login_required

upload_bp = Blueprint("upload", __name__)


@upload_bp.route("/dashboard", methods=["GET"])
@login_required
def home():
    user = get_current_user()
    patients = Patient.query.filter_by(owner_id=user.id).order_by(Patient.full_name.asc()).all()
    return render_template("index.html", patients=patients)


@upload_bp.route("/upload", methods=["POST"])
@upload_bp.route("/api/upload", methods=["POST"])
@login_required
def upload():
    user = get_current_user()
    file = request.files.get("report")
    report_text = request.form.get("report_text", "").strip()
    selected_patient_id = request.form.get("patient_id", type=int)

    # Optional manual fields from upload form
    form_name = request.form.get("patient_name", "").strip()
    form_age = request.form.get("patient_age", type=int)
    form_gender = request.form.get("patient_gender", "").strip()
    form_blood = request.form.get("patient_blood_group", "").strip()
    form_phone = request.form.get("patient_phone", "").strip()
    form_email = request.form.get("patient_email", "").strip()

    text = ""
    saved_filename = None
    saved_filepath = None

    # -----------------------------
    # Case 1 : User uploaded a file
    # -----------------------------
    if file and file.filename != "":
        filename = secure_filename(file.filename)
        upload_folder = current_app.config["UPLOAD_FOLDER"]
        os.makedirs(upload_folder, exist_ok=True)

        filepath = os.path.join(upload_folder, filename)
        file.save(filepath)

        saved_filename = filename
        saved_filepath = filepath

        try:
            extracted = extract_text(filepath)
        except OCRNotAvailableError as error:
            if os.path.exists(filepath):
                os.remove(filepath)
            patients = Patient.query.filter_by(owner_id=user.id).order_by(Patient.full_name.asc()).all()
            if request.path.startswith("/api/"):
                return jsonify({"error": str(error)}), 503
            return render_template("index.html", patients=patients, error=str(error)), 503
        text = extracted["text"]

    # -----------------------------
    # Case 2 : User pasted text
    # -----------------------------
    elif report_text:
        text = report_text

    # -----------------------------
    # Nothing supplied
    # -----------------------------
    else:
        patients = Patient.query.filter_by(owner_id=user.id).order_by(Patient.full_name.asc()).all()
        if request.path.startswith("/api/"):
            return jsonify({"error": "Please upload a PDF/Image or paste report text."}), 400
        return render_template(
            "index.html",
            patients=patients,
            error="Please upload a PDF/Image or paste report text.",
        )

    # -----------------------------
    # Auto-Extract Patient Details
    # -----------------------------
    extracted_patient_info = extract_patient_info(text)

    # Merge extracted details with form values (form values take priority if explicitly filled)
    patient_name = form_name or extracted_patient_info.get("full_name")
    patient_age = form_age if form_age is not None else extracted_patient_info.get("age")
    patient_gender = form_gender or extracted_patient_info.get("gender")
    patient_blood = form_blood or extracted_patient_info.get("blood_group")
    patient_phone = form_phone or extracted_patient_info.get("contact_phone")
    patient_email = form_email or extracted_patient_info.get("contact_email")

    target_patient = None

    try:
        # Step 1: Check if an existing patient was selected in dropdown
        if selected_patient_id:
            target_patient = Patient.query.filter_by(id=selected_patient_id, owner_id=user.id).first()

        # Step 2: If no patient selected, look up by name or phone in database
        if not target_patient and patient_name:
            target_patient = Patient.query.filter(
                db.func.lower(Patient.full_name) == patient_name.lower()
            ).first()

        if not target_patient and patient_phone:
            target_patient = Patient.query.filter(
                Patient.contact_phone == patient_phone
            ).first()

        # Step 3: Automatically create a new patient if still not found
        if not target_patient:
            final_name = patient_name if patient_name else "Patient Record"
            target_patient = Patient(
                owner_id=user.id,
                full_name=final_name,
                age=patient_age,
                gender=patient_gender,
                blood_group=patient_blood,
                contact_phone=patient_phone,
                contact_email=patient_email,
            )
            db.session.add(target_patient)
            db.session.flush()  # Assigns target_patient.id
        else:
            # Update existing patient fields if missing
            if not target_patient.age and patient_age:
                target_patient.age = patient_age
            if not target_patient.gender and patient_gender:
                target_patient.gender = patient_gender
            if not target_patient.blood_group and patient_blood:
                target_patient.blood_group = patient_blood
            if not target_patient.contact_phone and patient_phone:
                target_patient.contact_phone = patient_phone
            if not target_patient.contact_email and patient_email:
                target_patient.contact_email = patient_email

        # Run AI simplification pipeline
        result = simplify_report(text)

        # Step 4: Save Medical Report record linked to target_patient
        report_record = MedicalReport(
            owner_id=user.id,
            patient_id=target_patient.id,
            filename=saved_filename,
            file_path=saved_filepath,
            extracted_text=text,
            simplified_text=result.get("simplified_summary"),
        )
        db.session.add(report_record)
        db.session.flush()

        # Save extracted entities
        for ent in result.get("entities", []):
            entity_rec = MedicalEntity(
                report_id=report_record.id,
                entity_text=ent.get("text", ""),
                entity_label=ent.get("label", ""),
                explanation=ent.get("explanation", ""),
            )
            db.session.add(entity_rec)

        # Save recommendations
        recs_data = result.get("recommendations", {})
        for cond in recs_data.get("by_condition", []):
            rec_obj = Recommendation(
                report_id=report_record.id,
                condition_name=cond.get("condition", ""),
                exercise_precautions=cond.get("exercise_precautions", ""),
            )
            rec_obj.set_list_field("foods_to_eat", cond.get("foods_to_eat", []))
            rec_obj.set_list_field("foods_to_avoid", cond.get("foods_to_avoid", []))
            rec_obj.set_list_field("recommended_exercise", cond.get("recommended_exercise", []))
            db.session.add(rec_obj)

        db.session.commit()
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error saving patient/report to database: {e}")
        result = simplify_report(text)

    patients = Patient.query.filter_by(owner_id=user.id).order_by(Patient.full_name.asc()).all()

    if request.path.startswith("/api/"):
        return jsonify({
            "result": result,
            "patient": target_patient.to_dict() if target_patient else None,
            "report": report_record.to_dict() if "report_record" in locals() else None,
        })

    return render_template(
        "results.html",
        result=result,
        patient=target_patient,
        patients=patients,
    )