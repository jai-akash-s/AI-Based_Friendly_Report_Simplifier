from datetime import datetime, timezone
import json
import random
import string
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


def utc_now():
    return datetime.now(timezone.utc)


def generate_patient_code():
    """Generates a unique professional patient code like PAT-2026-8A3F."""
    year = datetime.now(timezone.utc).strftime("%Y")
    random_str = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"PAT-{year}-{random_str}"


class Patient(db.Model):
    __tablename__ = "patients"

    id = db.Column(db.Integer, primary_key=True)
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
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), nullable=True)
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

    def to_dict(self):
        return {
            "id": self.id,
            "patient_id": self.patient_id,
            "filename": self.filename,
            "file_path": self.file_path,
            "extracted_text": self.extracted_text,
            "simplified_text": self.simplified_text,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "entities": [entity.to_dict() for entity in self.entities],
            "recommendations": [rec.to_dict() for rec in self.recommendations],
        }


class MedicalEntity(db.Model):
    __tablename__ = "medical_entities"

    id = db.Column(db.Integer, primary_key=True)
    report_id = db.Column(db.Integer, db.ForeignKey("medical_reports.id"), nullable=False)
    entity_text = db.Column(db.String(255), nullable=False)
    entity_label = db.Column(db.String(100), nullable=True)
    explanation = db.Column(db.Text, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "report_id": self.report_id,
            "entity_text": self.entity_text,
            "entity_label": self.entity_label,
            "explanation": self.explanation,
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
