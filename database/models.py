from datetime import datetime, timezone
import json
import random
import string
from flask_sqlalchemy import SQLAlchemy
from services.doctor_questions import generate_doctor_questions
from services.medical_safety import enforce_safe_explanation, enforce_safe_summary
from services.drug_interactions import check_drug_interactions

db = SQLAlchemy()


def safe_json_list(value):
    """Return a list from JSON-encoded data without crashing on legacy or malformed values."""
    if not value:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except (TypeError, ValueError):
            return []
        return parsed if isinstance(parsed, list) else []
    return []


def utc_now():
    return datetime.now(timezone.utc)


def generate_patient_code():
    """Generates a unique professional patient code like PAT-2026-8A3F."""
    year = datetime.now(timezone.utc).strftime("%Y")
    random_str = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"PAT-{year}-{random_str}"


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    display_name = db.Column(db.String(120), nullable=True)
    provider = db.Column(db.String(30), nullable=False, default="local")
    role = db.Column(db.String(30), nullable=False, default="patient")
    password_hash = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=utc_now)

    patients = db.relationship("Patient", backref="owner", lazy=True)
    reports = db.relationship("MedicalReport", backref="owner", lazy=True)
    audit_events = db.relationship("AuditLog", backref="user", lazy=True)
    user_reminders = db.relationship("Reminder", backref="owner", lazy=True, cascade="all, delete-orphan")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def to_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "display_name": self.display_name or self.email.split("@")[0].title(),
            "provider": self.provider,
            "role": self.role or "user",
            "report_count": len(self.reports) if self.reports else 0,
            "patient_count": len(self.patients) if self.patients else 0,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class AuditLog(db.Model):
    __tablename__ = "audit_logs"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    action = db.Column(db.String(80), nullable=False)
    resource_type = db.Column(db.String(50), nullable=True)
    resource_id = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, default=utc_now, index=True)

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class Patient(db.Model):
    __tablename__ = "patients"

    id = db.Column(db.Integer, primary_key=True)
    owner_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    patient_code = db.Column(
        db.String(30), unique=True, nullable=False, index=True, default=generate_patient_code
    )
    full_name = db.Column(db.String(120), nullable=False)
    age = db.Column(db.Integer, nullable=True)
    gender = db.Column(db.String(20), nullable=True)
    blood_group = db.Column(db.String(10), nullable=True)
    contact_email = db.Column(db.String(120), nullable=True)
    contact_phone = db.Column(db.String(30), nullable=True)
    created_at = db.Column(db.DateTime, default=utc_now)
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now)

    # Relationships
    reports = db.relationship(
        "MedicalReport", backref="patient", lazy=True, cascade="all, delete-orphan"
    )

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def to_dict(self):
        return {
            "id": self.id,
            "patient_code": self.patient_code,
            "full_name": self.full_name,
            "age": self.age,
            "gender": self.gender,
            "blood_group": self.blood_group,
            "contact_email": self.contact_email,
            "contact_phone": self.contact_phone,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "report_count": len(self.reports) if self.reports else 0,
        }


class MedicalReport(db.Model):
    __tablename__ = "medical_reports"

    id = db.Column(db.Integer, primary_key=True)
    owner_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), nullable=True)
    title = db.Column(db.String(255), nullable=True)
    lab_results = db.Column(db.Text, nullable=True)
    medicine_results = db.Column(db.Text, nullable=True)
    filename = db.Column(db.String(255), nullable=True)
    file_path = db.Column(db.String(500), nullable=True)
    extracted_text = db.Column(db.Text, nullable=True)
    simplified_text = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=utc_now)

    # Relationships
    entities = db.relationship(
        "MedicalEntity", backref="report", lazy=True, cascade="all, delete-orphan"
    )
    recommendations = db.relationship(
        "Recommendation", backref="report", lazy=True, cascade="all, delete-orphan"
    )

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def to_dict(self):
        lab_results = safe_json_list(self.lab_results)
        medicine_results = safe_json_list(self.medicine_results)
        entities = [entity.to_dict() for entity in self.entities]
        medicine_results_by_id = {
            item.get("entity_id"): item
            for item in medicine_results
            if item.get("entity_id") is not None
        }
        for entity in entities:
            if str(entity.get("entity_label") or "").upper() not in {"MEDICINE", "MEDICATION"}:
                continue
            medicine_result = medicine_results_by_id.get(entity["id"])
            if medicine_result:
                entity.update(medicine_result)
                if not entity.get("explanation"):
                    entity["explanation"] = (
                        medicine_result.get("general_use")
                        or medicine_result.get("use")
                        or ""
                    )
            else:
                entity.update({
                    "name": entity["entity_text"],
                    "cleaned_name": "",
                    "generic_name": None,
                    "drug_class": None,
                    "use": None,
                    "status": "not_found",
                    "confidence": "low",
                    "source": "none",
                    "note": "Could not identify this medicine. Please ask your doctor or pharmacist what it is used for.",
                    "matched_name": None,
                    "needs_confirmation": True,
                })
        medicine_names = [
            entity["entity_text"] for entity in entities
            if str(entity.get("entity_label") or "").upper() in {"MEDICINE", "MEDICATION"}
        ]
        return {
            "id": self.id,
            "patient_id": self.patient_id,
            "patient": self.patient.to_dict() if self.patient else None,
            "title": self.title,
            "lab_results": lab_results,
            "medicine_results": medicine_results,
            "drug_interactions": check_drug_interactions(medicine_names),
            "questions_to_ask_doctor": generate_doctor_questions(lab_results),
            "filename": self.filename,
            "file_path": self.file_path,
            "extracted_text": self.extracted_text,
            "simplified_text": enforce_safe_summary(self.simplified_text, entities),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "entities": entities,
            "recommendations": [rec.to_dict() for rec in self.recommendations],
        }


class MedicineLookupCache(db.Model):
    __tablename__ = "medicine_lookup_cache"

    cleaned_name = db.Column(db.String(255), primary_key=True)
    result_json = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now, nullable=False)


class MedicineCatalogEntry(db.Model):
    __tablename__ = "medicines"

    generic_name = db.Column(db.String(255), primary_key=True)
    drug_class = db.Column(db.String(255), nullable=False)
    use = db.Column(db.Text, nullable=False)
    brands = db.Column(db.Text, nullable=False, default="[]")


class MedicalEntity(db.Model):
    __tablename__ = "medical_entities"

    id = db.Column(db.Integer, primary_key=True)
    report_id = db.Column(db.Integer, db.ForeignKey("medical_reports.id"), nullable=False)
    entity_text = db.Column(db.String(255), nullable=False)
    entity_label = db.Column(db.String(100), nullable=True)
    explanation = db.Column(db.Text, nullable=True)

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def to_dict(self):
        is_medicine = str(self.entity_label or "").upper() in {"MEDICINE", "MEDICATION"}
        return {
            "id": self.id,
            "report_id": self.report_id,
            "entity_text": self.entity_text,
            "entity_label": self.entity_label,
            "explanation": (
                ""
                if is_medicine
                else enforce_safe_explanation(self.explanation, self.entity_text)
            ),
        }


class Recommendation(db.Model):
    __tablename__ = "recommendations"

    id = db.Column(db.Integer, primary_key=True)
    report_id = db.Column(db.Integer, db.ForeignKey("medical_reports.id"), nullable=False)
    condition_name = db.Column(db.String(255), nullable=True)
    foods_to_eat = db.Column(db.Text, nullable=True)  # JSON-encoded string
    foods_to_avoid = db.Column(db.Text, nullable=True)  # JSON-encoded string
    recommended_exercise = db.Column(db.Text, nullable=True)  # JSON-encoded string
    exercise_precautions = db.Column(db.Text, nullable=True)

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def set_list_field(self, field_name, list_data):
        if isinstance(list_data, list):
            setattr(self, field_name, json.dumps(list_data))
        else:
            setattr(self, field_name, json.dumps([str(list_data)] if list_data else []))

    def get_list_field(self, field_name):
        val = getattr(self, field_name)
        if not val:
            return []
        try:
            return json.loads(val)
        except Exception:
            return [val]

    def to_dict(self):
        return {
            "id": self.id,
            "report_id": self.report_id,
            "condition_name": self.condition_name,
            "foods_to_eat": self.get_list_field("foods_to_eat"),
            "foods_to_avoid": self.get_list_field("foods_to_avoid"),
            "recommended_exercise": self.get_list_field("recommended_exercise"),
            "exercise_precautions": self.exercise_precautions,
        }


class Reminder(db.Model):
    __tablename__ = "reminders"

    id = db.Column(db.Integer, primary_key=True)
    owner_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), nullable=True, index=True)
    report_id = db.Column(db.Integer, db.ForeignKey("medical_reports.id"), nullable=True, index=True)
    title = db.Column(db.String(200), nullable=False)
    due_text = db.Column(db.String(100), nullable=True)
    tag = db.Column(db.String(30), default="info")        # "warning", "info", "success"
    notes = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(20), default="pending")  # "pending", "completed"
    created_at = db.Column(db.DateTime, default=utc_now)

    patient = db.relationship("Patient", backref="reminders", lazy=True)
    report = db.relationship("MedicalReport", backref="reminders", lazy=True)

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def to_dict(self):
        return {
            "id": self.id,
            "patient_id": self.patient_id,
            "patient_name": self.patient.full_name if self.patient else None,
            "report_id": self.report_id,
            "title": self.title,
            "due_text": self.due_text,
            "tag": self.tag,
            "notes": self.notes,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

