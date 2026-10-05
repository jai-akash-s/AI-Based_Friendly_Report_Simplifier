"""Import the legacy Express JSON store into the account-scoped SQLite database."""

from datetime import datetime, timezone
import json
from pathlib import Path

from app import app
from database.models import MedicalEntity, MedicalReport, Patient, Recommendation, User, db


SOURCE_PATH = Path(__file__).resolve().parents[1] / "data" / "database.json"


def _parse_datetime(value):
    if not value:
        return None
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def migrate_json_store():
    if not SOURCE_PATH.exists():
        raise FileNotFoundError(f"Legacy data file not found: {SOURCE_PATH}")

    with SOURCE_PATH.open("r", encoding="utf-8") as source_file:
        legacy_data = json.load(source_file)

    legacy_users = {item["id"]: item for item in legacy_data.get("users", [])}
    imported = {"users": 0, "patients": 0, "reports": 0}

    with app.app_context():
        try:
            user_map = {}
            for legacy_id, legacy_user in legacy_users.items():
                email = str(legacy_user.get("email", "")).strip().lower()
                if not email:
                    raise ValueError(f"Legacy user {legacy_id} has no email address.")

                user = User.query.filter_by(email=email).first()
                if user is None:
                    user = User(
                        email=email,
                        display_name=legacy_user.get("display_name"),
                        provider="legacy",
                        created_at=_parse_datetime(legacy_user.get("created_at")),
                    )
                    db.session.add(user)
                    db.session.flush()
                    imported["users"] += 1
                user_map[legacy_id] = user

            patient_map = {}
            for legacy_patient in legacy_data.get("patients", []):
                owner = user_map.get(legacy_patient.get("owner_id"))
                if owner is None:
                    raise ValueError(f"Legacy patient {legacy_patient.get('id')} has no account owner.")

                patient_code = legacy_patient.get("patient_code")
                patient = Patient.query.filter_by(
                    owner_id=owner.id,
                    patient_code=patient_code,
                ).first()
                if patient is None:
                    patient = Patient(
                        owner_id=owner.id,
                        patient_code=patient_code,
                        full_name=legacy_patient.get("full_name") or "Patient Record",
                        age=legacy_patient.get("age"),
                        gender=legacy_patient.get("gender"),
                        blood_group=legacy_patient.get("blood_group"),
                        contact_email=legacy_patient.get("contact_email"),
                        contact_phone=legacy_patient.get("contact_phone"),
                        created_at=_parse_datetime(legacy_patient.get("created_at")),
                        updated_at=_parse_datetime(legacy_patient.get("updated_at")),
                    )
                    db.session.add(patient)
                    db.session.flush()
                    imported["patients"] += 1
                patient_map[(legacy_patient.get("owner_id"), legacy_patient.get("id"))] = patient

            for legacy_report in legacy_data.get("reports", []):
                owner = user_map.get(legacy_report.get("owner_id"))
                if owner is None:
                    raise ValueError(f"Legacy report {legacy_report.get('id')} has no account owner.")

                created_at = _parse_datetime(legacy_report.get("created_at"))
                filename = legacy_report.get("filename")
                extracted_text = legacy_report.get("extracted_text") or ""
                existing_report = next(
                    (
                        report
                        for report in owner.reports
                        if report.filename == filename
                        and report.extracted_text == extracted_text
                        and _parse_datetime(report.created_at.isoformat() if report.created_at else None) == created_at
                    ),
                    None,
                )
                if existing_report:
                    continue

                report = MedicalReport(
                    owner_id=owner.id,
                    patient_id=(
                        patient_map[(legacy_report.get("owner_id"), legacy_report.get("patient_id"))].id
                        if (legacy_report.get("owner_id"), legacy_report.get("patient_id")) in patient_map
                        else None
                    ),
                    title=legacy_report.get("title") or filename,
                    filename=filename,
                    file_path=legacy_report.get("file_path"),
                    extracted_text=extracted_text,
                    simplified_text=legacy_report.get("simplified_text") or "",
                    lab_results=json.dumps(legacy_report.get("lab_results", [])),
                    created_at=created_at,
                )
                db.session.add(report)
                db.session.flush()

                for legacy_entity in legacy_report.get("entities", []):
                    db.session.add(MedicalEntity(
                        report_id=report.id,
                        entity_text=legacy_entity.get("entity_text") or legacy_entity.get("text") or "",
                        entity_label=legacy_entity.get("entity_label") or legacy_entity.get("label"),
                        explanation=legacy_entity.get("explanation"),
                    ))

                for legacy_recommendation in legacy_report.get("recommendations", []):
                    recommendation = Recommendation(
                        report_id=report.id,
                        condition_name=legacy_recommendation.get("condition_name") or legacy_recommendation.get("condition"),
                        exercise_precautions=legacy_recommendation.get("exercise_precautions", ""),
                    )
                    recommendation.set_list_field("foods_to_eat", legacy_recommendation.get("foods_to_eat", []))
                    recommendation.set_list_field("foods_to_avoid", legacy_recommendation.get("foods_to_avoid", []))
                    recommendation.set_list_field("recommended_exercise", legacy_recommendation.get("recommended_exercise", []))
                    db.session.add(recommendation)

                imported["reports"] += 1

            db.session.commit()
        except Exception:
            db.session.rollback()
            raise

    return imported


if __name__ == "__main__":
    print(json.dumps(migrate_json_store()))