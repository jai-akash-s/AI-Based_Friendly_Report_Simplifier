from flask import Blueprint, jsonify, render_template, request, current_app
from werkzeug.utils import secure_filename
import os
import json
from uuid import uuid4

from core.extractor import OCRNotAvailableError, extract_text
from core.gemini_analyzer import GeminiAnalysisError, analyze_medical_report
from core.simplifier import simplify_report
from core.patient_extractor import extract_patient_info
from core.lab_extractor import extract_lab_results
from services.doctor_questions import generate_doctor_questions
from services.medical_safety import DISCLAIMER, enforce_safe_explanation, enforce_safe_summary
from services.medicine_lookup import lookup_medicine
from database.models import db, Patient, MedicalReport, MedicalEntity, Recommendation
from routes.auth_routes import get_current_user, log_audit, login_required

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
    extraction_confidence = None
    gemini_result = None
    gemini_error = None

    # -----------------------------
    # Case 1 : User uploaded a file
    # -----------------------------
    if file and file.filename != "":
        original_filename = secure_filename(file.filename)
        extension = os.path.splitext(original_filename)[1].lower()
        allowed_extensions = current_app.config.get("ALLOWED_EXTENSIONS", set())
        if extension.lstrip(".") not in allowed_extensions:
            message = "Unsupported file type. Upload a PDF, JPG, PNG, or TXT report."
            if request.path.startswith("/api/"):
                return jsonify({"error": message}), 400
            return render_template("index.html", patients=Patient.query.filter_by(owner_id=user.id).all(), error=message), 400

        filename = f"{uuid4().hex}{extension}"
        upload_folder = current_app.config["UPLOAD_FOLDER"]
        os.makedirs(upload_folder, exist_ok=True)

        filepath = os.path.join(upload_folder, filename)
        file.save(filepath)

        saved_filename = original_filename
        saved_filepath = filepath

        if extension == ".txt":
            try:
                extracted = extract_text(filepath)
                text = extracted["text"]
            except (OSError, ValueError) as error:
                if os.path.exists(filepath):
                    os.remove(filepath)
                message = "Unable to read this file. Please upload a clear PDF, JPG, PNG, or TXT report."
                current_app.logger.warning("Report extraction failed: %s", error)
                patients = Patient.query.filter_by(owner_id=user.id).order_by(Patient.full_name.asc()).all()
                if request.path.startswith("/api/"):
                    return jsonify({"error": message}), 400
                return render_template("index.html", patients=patients, error=message), 400
        else:
            try:
                gemini_result = analyze_medical_report(file_path=filepath)
            except GeminiAnalysisError as error:
                gemini_error = str(error)
                current_app.logger.warning("Gemini report analysis failed: %s", error)

            if gemini_result:
                text = str(gemini_result.get("extracted_text", "")).strip()
            if not text:
                try:
                    extracted = extract_text(filepath)
                    text = extracted["text"]
                    extraction_confidence = extracted.get("confidence")
                except OCRNotAvailableError as error:
                    if os.path.exists(filepath):
                        os.remove(filepath)
                    patients = Patient.query.filter_by(owner_id=user.id).order_by(Patient.full_name.asc()).all()
                    if request.path.startswith("/api/"):
                        return jsonify({"error": str(error)}), 503
                    return render_template("index.html", patients=patients, error=str(error)), 503
                except (OSError, ValueError) as error:
                    if os.path.exists(filepath):
                        os.remove(filepath)
                    message = "Unable to read this file. Please upload a clear PDF, JPG, PNG, or TXT report."
                    current_app.logger.warning("Report extraction failed: %s", error)
                    patients = Patient.query.filter_by(owner_id=user.id).order_by(Patient.full_name.asc()).all()
                    if request.path.startswith("/api/"):
                        return jsonify({"error": message}), 400
                    return render_template("index.html", patients=patients, error=message), 400
        if not text.strip():
            if os.path.exists(filepath):
                os.remove(filepath)
            message = "The uploaded report does not contain readable text."
            if request.path.startswith("/api/"):
                return jsonify({"error": message}), 400
            return render_template("index.html", patients=Patient.query.filter_by(owner_id=user.id).all(), error=message), 400

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

    needs_ocr_review = extraction_confidence is not None and extraction_confidence < 65 and not gemini_result

    # -----------------------------
    # Auto-Extract Patient Details
    # -----------------------------
    extracted_patient_info = {} if needs_ocr_review else extract_patient_info(text)
    gemini_patient_info = (gemini_result or {}).get("patient_info") or {}

    # Merge extracted details with form values (form values take priority if explicitly filled)
    patient_name = form_name or gemini_patient_info.get("full_name") or extracted_patient_info.get("full_name")
    patient_age = form_age if form_age is not None else gemini_patient_info.get("age") or extracted_patient_info.get("age")
    patient_gender = form_gender or gemini_patient_info.get("gender") or extracted_patient_info.get("gender")
    patient_blood = form_blood or gemini_patient_info.get("blood_group") or extracted_patient_info.get("blood_group")
    patient_phone = form_phone or gemini_patient_info.get("contact_phone") or extracted_patient_info.get("contact_phone")
    patient_email = form_email or gemini_patient_info.get("contact_email") or extracted_patient_info.get("contact_email")

    target_patient = None

    try:
        # Step 1: Check if an existing patient was selected in dropdown
        if selected_patient_id:
            target_patient = Patient.query.filter_by(id=selected_patient_id, owner_id=user.id).first()

        # Step 2: If no patient selected, look up by name or phone in database
        if not target_patient and patient_name:
            target_patient = Patient.query.filter(
                db.func.lower(Patient.full_name) == patient_name.lower(),
                Patient.owner_id == user.id,
            ).first()

        if not target_patient and patient_phone:
            target_patient = Patient.query.filter(
                Patient.contact_phone == patient_phone,
                Patient.owner_id == user.id,
            ).first()

        # Step 3: Automatically create a new patient if still not found
        if not target_patient and not needs_ocr_review:
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
        elif target_patient and not needs_ocr_review:
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
        result = simplify_report(text, use_ai_fallback=False)
        if needs_ocr_review:
            result["entities"] = []
            result["simplified_summary"] = (
                "I could not read this handwritten report reliably. "
                "Review and correct the extracted text below, then analyze it again."
            )
            result["recommendations"]["by_condition"] = []
            result["recommendations"]["aggregated"] = {
                "foods_to_eat": [],
                "foods_to_avoid": [],
                "recommended_exercise": [],
                "general_precautions": [],
            }
        elif gemini_result:
            merged_entities = []
            seen_entities = set()
            for entity in gemini_result.get("entities", []):
                entity_text = str(entity.get("text", "")).strip()
                if not entity_text:
                    continue
                key = entity_text.casefold()
                if key in seen_entities:
                    continue
                seen_entities.add(key)
                merged_entities.append({
                    "text": entity_text,
                    "label": entity.get("label", "SYMPTOM"),
                    "explanation": enforce_safe_explanation(
                        entity.get("explanation", ""),
                        entity_text,
                    ),
                    "source": "gemini_ai",
                    "confidence": "Moderate",
                })
            for entity in result.get("entities", []):
                key = entity["text"].casefold()
                if key not in seen_entities:
                    seen_entities.add(key)
                    merged_entities.append(entity)
            result["entities"] = merged_entities
            result["simplified_summary"] = enforce_safe_summary(
                result.get("simplified_summary"),
                merged_entities,
            )

            recommendations = result["recommendations"]
            aggregated = recommendations["aggregated"]
            has_dictionary_guidance = bool(recommendations.get("by_condition"))
            for output_key in ("foods_to_eat", "foods_to_avoid", "recommended_exercise"):
                rule_items = aggregated[output_key] if has_dictionary_guidance else []
                aggregated[output_key] = list(dict.fromkeys(rule_items))
            precautions = [
                *(aggregated["general_precautions"] if has_dictionary_guidance else []),
            ]
            aggregated["general_precautions"] = list(dict.fromkeys(item for item in precautions if item))

            result["safety"]["medication_warning"] = result["safety"]["medication_warning"] or any(
                entity.get("label") == "MEDICINE" for entity in merged_entities
            )
            if result["safety"]["medication_warning"]:
                result["safety"]["message"] = (
                    "Do not start, stop, or change medication based only on this explanation. "
                    "Confirm prescription details with your doctor or pharmacist."
                )
        result["extraction_confidence"] = extraction_confidence
        result["analysis_warning"] = (
            "Gemini could not read this image. Check the API key, model access, and network, or review the extracted text manually."
            if needs_ocr_review and gemini_error
            else "Add GEMINI_API_KEY to the root .env file and restart for multimodal handwriting recognition. Local OCR is uncertain; review the extracted text before analysis."
            if needs_ocr_review
            else None
        )
        result["simplified_summary"] = enforce_safe_summary(
            result.get("simplified_summary"),
            result.get("entities", []),
        )
        result["disclaimer"] = DISCLAIMER
        lab_results = extract_lab_results(text)
        result["lab_results"] = lab_results
        result["questions_to_ask_doctor"] = generate_doctor_questions(lab_results)
        medicine_entities = [
            entity for entity in result.get("entities", [])
            if str(entity.get("label", "")).upper() in {"MEDICINE", "MEDICATION"}
        ]
        other_medicines = [entity.get("text", "") for entity in medicine_entities]
        conditions = [
            entity.get("text", "")
            for entity in result.get("entities", [])
            if str(entity.get("label", "")).upper() in {"DISEASE", "SYMPTOM"}
        ]
        medicine_results = []
        for entity in medicine_entities:
            medicine_result = lookup_medicine(
                entity.get("text", ""),
                other_medicines=other_medicines,
                conditions=conditions,
            )
            medicine_results.append(medicine_result)
            entity.update(medicine_result)
            entity["explanation"] = ""
        result["medicine_results"] = medicine_results

        # Step 4: Save Medical Report record linked to target_patient
        report_record = MedicalReport(
            owner_id=user.id,
            patient_id=target_patient.id if target_patient else None,
            title=request.form.get("report_title", "").strip() or saved_filename,
            filename=saved_filename,
            file_path=saved_filepath,
            extracted_text=text,
            simplified_text=result.get("simplified_summary"),
            lab_results=json.dumps(lab_results),
            medicine_results=json.dumps(medicine_results, ensure_ascii=False),
        )
        db.session.add(report_record)
        db.session.flush()

        # Save extracted entities
        medicine_entities_by_name = {}
        for ent in result.get("entities", []):
            entity_rec = MedicalEntity(
                report_id=report_record.id,
                entity_text=ent.get("text", ""),
                entity_label=ent.get("label", ""),
                explanation=ent.get("explanation", ""),
            )
            db.session.add(entity_rec)
            if str(ent.get("label", "")).upper() in {"MEDICINE", "MEDICATION"}:
                medicine_entities_by_name.setdefault(
                    str(ent.get("text", "")).casefold(), []
                ).append((entity_rec, ent))

        db.session.flush()
        for medicine_result in medicine_results:
            matching_entities = medicine_entities_by_name.get(
                str(medicine_result.get("name", "")).casefold(), []
            )
            if matching_entities:
                entity_rec, entity_data = matching_entities.pop(0)
                medicine_result["entity_id"] = entity_rec.id
                entity_data["entity_id"] = entity_rec.id
        report_record.medicine_results = json.dumps(medicine_results, ensure_ascii=False)
        result["medicine_results"] = medicine_results

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
        log_audit("report_upload", "medical_report", report_record.id, user)
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error saving patient/report to database: {e}")
        result = simplify_report(text, use_ai_fallback=False)

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
        disclaimer=DISCLAIMER,
    )