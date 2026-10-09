"""Database model and route tests."""

# SQLAlchemy generates model constructors and relationship attributes dynamically.
# Pylance cannot infer those members from Flask-SQLAlchemy's runtime API.
# pyright: reportCallIssue=false

import unittest
import os
import sys
from io import BytesIO
from unittest.mock import patch
from typing import cast

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from app import app
from database.models import AuditLog, db, Patient, MedicalReport, MedicalEntity, Recommendation, User
from core.lab_extractor import extract_lab_results


class TestDatabaseModels(unittest.TestCase):

    def setUp(self):
        app.config["TESTING"] = True
        app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
        self.app_context = app.app_context()
        self.app_context.push()
        db.create_all()
        self.client = app.test_client()
        register_response = self.client.post(
            "/register",
            data={
                "email": "test@example.com",
                "password": "password123",
                "password_confirmation": "password123",
            },
        )
        self.assertEqual(register_response.status_code, 302)

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.app_context.pop()

    def test_patient_creation(self):
        patient = Patient(
            full_name="Test Patient",
            age=30,
            gender="Male",
            blood_group="O+",
            contact_email="test@example.com",
            contact_phone="1234567890",
        )
        db.session.add(patient)
        db.session.commit()

        fetched = Patient.query.filter_by(full_name="Test Patient").first()
        self.assertIsNotNone(fetched)
        assert fetched is not None
        self.assertTrue(fetched.patient_code.startswith("PAT-"))
        self.assertEqual(fetched.age, 30)

    def test_report_and_relationships(self):
        patient = Patient(full_name="Jane Doe", age=25)
        db.session.add(patient)
        db.session.commit()
        assert patient.id is not None

        report = MedicalReport(
            patient_id=patient.id,
            extracted_text="Patient has Hypertension.",
            simplified_text="High blood pressure detected.",
        )
        db.session.add(report)
        db.session.commit()

        entity = MedicalEntity(
            report_id=report.id,
            entity_text="Hypertension",
            entity_label="DISEASE_OR_SYMPTOM",
            explanation="High blood pressure condition.",
        )
        db.session.add(entity)

        rec = Recommendation(
            report_id=report.id,
            condition_name="Hypertension",
            exercise_precautions="Consult doctor before heavy lifting.",
        )
        rec.set_list_field("foods_to_eat", ["Leafy greens", "Bananas"])
        rec.set_list_field("foods_to_avoid", ["High sodium foods", "Pickles"])
        rec.set_list_field("recommended_exercise", ["Brisk walking for 30 minutes"])
        db.session.add(rec)
        db.session.commit()

        # Test querying patient reports relationship
        reports = cast(list[MedicalReport], patient.reports)
        entities = cast(list[MedicalEntity], report.entities)
        recommendations = cast(list[Recommendation], report.recommendations)
        self.assertEqual(len(reports), 1)
        self.assertEqual(reports[0].simplified_text, "High blood pressure detected.")
        self.assertEqual(len(entities), 1)
        self.assertEqual(entities[0].entity_text, "Hypertension")
        self.assertEqual(recommendations[0].get_list_field("foods_to_eat"), ["Leafy greens", "Bananas"])

    def test_report_serialization_replaces_unsafe_legacy_generated_text(self):
        user = User.query.filter_by(email="test@example.com").one()
        report = MedicalReport(
            owner_id=user.id,
            simplified_text="You have diabetes. Take your medication.",
        )
        db.session.add(report)
        db.session.flush()
        entity = MedicalEntity(
            report_id=report.id,
            entity_text="Diabetes",
            entity_label="DISEASE",
            explanation="You have this disease. Start treatment.",
        )
        db.session.add(entity)
        db.session.commit()

        serialized = report.to_dict()

        self.assertIn("report mentions Diabetes", serialized["simplified_text"])
        self.assertNotIn("Take your medication", serialized["simplified_text"])
        self.assertIn("may depend on context", serialized["entities"][0]["explanation"])

    def test_patient_routes(self):
        # GET /patients
        response = self.client.get("/patients/")
        self.assertEqual(response.status_code, 200)

        # POST /patients/add
        post_resp = self.client.post(
            "/patients/add",
            data={
                "full_name": "Alice Wonderland",
                "age": 29,
                "gender": "Female",
                "blood_group": "B+",
                "contact_email": "alice@example.com",
            },
            follow_redirects=True,
        )
        self.assertEqual(post_resp.status_code, 200)
        self.assertIn(b"Alice Wonderland", post_resp.data)

    def test_logout_redirects_to_browser_login(self):
        response = self.client.post("/logout")
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.location, "/login")
        login_page = self.client.get(response.location)
        self.assertEqual(login_page.status_code, 200)

    def test_low_confidence_image_upload_pauses_patient_and_recommendations(self):
        upload_path = None
        try:
            with patch("routes.upload_routes.analyze_medical_report", return_value=None), patch(
                "routes.upload_routes.extract_text",
                return_value={"text": "uncertain handwriting", "confidence": 46, "pages": []},
            ):
                response = self.client.post(
                    "/api/upload",
                    data={"report": (BytesIO(b"test image data"), "prescription.png")},
                    content_type="multipart/form-data",
                )

            self.assertEqual(response.status_code, 200)
            result = response.json["result"]
            self.assertIsNone(response.json["patient"])
            self.assertEqual(result["extraction_confidence"], 46)
            self.assertEqual(result["entities"], [])
            self.assertIn("GEMINI_API_KEY", result["analysis_warning"])
            self.assertEqual(result["recommendations"]["aggregated"]["foods_to_eat"], [])
            self.assertEqual(result["recommendations"]["aggregated"]["foods_to_avoid"], [])
            self.assertEqual(result["recommendations"]["aggregated"]["recommended_exercise"], [])
            upload_path = response.json["report"]["file_path"]
            self.assertEqual(Patient.query.count(), 0)
        finally:
            if upload_path and os.path.exists(upload_path):
                os.remove(upload_path)

    def test_gemini_image_analysis_populates_report_for_signed_in_user(self):
        upload_path = None
        gemini_result = {
            "extracted_text": "Karuna Chauhan, 36, Anxiety/Gastric, BP 130/90.",
            "patient_info": {"full_name": "Karuna Chauhan", "age": 36, "gender": "Female"},
            "entities": [
                {"text": "Anxiety", "label": "DISEASE", "explanation": "A feeling of worry."},
                {"text": "Gastric", "label": "DISEASE", "explanation": "Stomach-related discomfort."},
            ],
            "simplified_summary": "You have diabetes. Take your medication.",
            "foods_to_eat": ["Balanced meals"],
            "foods_to_avoid": ["Foods that worsen symptoms"],
            "recommended_exercise": ["Gentle walking"],
            "exercise_precautions": "Ask your clinician if symptoms continue.",
        }
        try:
            with patch("routes.upload_routes.analyze_medical_report", return_value=gemini_result):
                response = self.client.post(
                    "/api/upload",
                    data={"report": (BytesIO(b"test image data"), "prescription.png")},
                    content_type="multipart/form-data",
                )

            self.assertEqual(response.status_code, 200)
            result = response.json["result"]
            self.assertEqual(response.json["patient"]["full_name"], "Karuna Chauhan")
            self.assertEqual(response.json["report"]["extracted_text"], gemini_result["extracted_text"])
            self.assertIn("130/90", result["simplified_summary"])
            self.assertIn("does not diagnose", result["simplified_summary"])
            self.assertIn("Please consult", result["simplified_summary"])
            self.assertNotIn("Take your medication", result["simplified_summary"])
            self.assertIn("Educational summary only", result["disclaimer"])
            self.assertEqual(
                {entity["text"] for entity in result["entities"]},
                {"Anxiety", "Gastric", "BP: 130/90"},
            )
            self.assertNotIn(
                "Balanced meals",
                result["recommendations"]["aggregated"]["foods_to_eat"],
            )
            self.assertTrue(result["recommendations"]["aggregated"]["foods_to_eat"])
            upload_path = response.json["report"]["file_path"]
            saved_report = db.session.get(MedicalReport, response.json["report"]["id"])
            self.assertEqual(saved_report.owner_id, User.query.filter_by(email="test@example.com").one().id)
        finally:
            if upload_path and os.path.exists(upload_path):
                os.remove(upload_path)

    def test_passwords_are_hashed_and_wrong_password_is_rejected(self):
        user = User.query.filter_by(email="test@example.com").first()
        self.assertIsNotNone(user)
        assert user is not None
        self.assertNotEqual(user.password_hash, "password123")
        self.assertTrue(user.password_hash)

        self.client.get("/logout")
        response = self.client.post(
            "/api/login",
            data={"email": "test@example.com", "password": "wrong-password"},
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json["error"], "Invalid email or password.")

    def test_api_logout_clears_session(self):
        response = self.client.post("/api/logout")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, {"authenticated": False})
        self.assertEqual(self.client.get("/api/auth/session").status_code, 401)

    def test_lab_extraction_uses_catalog_reference_ranges_when_missing(self):
        results = extract_lab_results("HbA1c: 7.8%\nLDL: 145 mg/dL")
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]["status"], "High")
        self.assertEqual(results[0]["reference_range"]["source"], "default")
        self.assertEqual(results[1]["test_name"], "LDL")
        self.assertEqual(results[1]["status"], "High")

    def test_report_search_and_patient_timeline(self):
        response = self.client.post(
            "/api/upload",
            data={"report_text": "Patient Name: Timeline Patient\nHbA1c: 7.8%\nImpression: Hypertension."},
        )
        self.assertEqual(response.status_code, 200)
        patient_id = response.json["patient"]["id"]
        report_id = response.json["report"]["id"]
        search = self.client.get("/api/reports/search?q=timeline")
        self.assertEqual(search.status_code, 200)
        self.assertEqual(search.json[0]["id"], report_id)
        timeline = self.client.get(f"/api/patients/{patient_id}/timeline")
        self.assertEqual(timeline.status_code, 200)
        self.assertEqual(timeline.json[0]["lab_results"][0]["test_name"], "HbA1c")

        stats = self.client.get("/api/dashboard/stats")
        self.assertEqual(stats.status_code, 200)
        self.assertEqual(stats.json["reports_this_month"], 1)

    def test_patient_lab_trends_are_test_specific_and_owner_scoped(self):
        first = self.client.post(
            "/api/upload",
            data={"report_text": "Patient Name: Trend Patient\nHemoglobin 11 g/dL (12-16)"},
        )
        patient_id = first.json["patient"]["id"]
        self.client.post(
            "/api/upload",
            data={
                "patient_id": patient_id,
                "report_text": "Patient Name: Trend Patient\nHemoglobin 13 g/dL (12-16)\nWBC 5 10^3/uL",
            },
        )

        trend = self.client.get(
            f"/api/patients/{patient_id}/lab-trends?test=Hemoglobin"
        )
        self.assertEqual(trend.status_code, 200)
        self.assertEqual(len(trend.json["points"]), 2)
        self.assertEqual([point["value"] for point in trend.json["points"]], [11.0, 13.0])

        missing_test = self.client.get(f"/api/patients/{patient_id}/lab-trends")
        self.assertEqual(missing_test.status_code, 400)

        self.client.get("/logout")
        self.client.post(
            "/register",
            data={
                "email": "trend-owner2@example.com",
                "password": "password123",
                "password_confirmation": "password123",
            },
        )
        self.assertEqual(
            self.client.get(f"/api/patients/{patient_id}/lab-trends?test=Hemoglobin").status_code,
            404,
        )

    def test_report_translation_is_owner_scoped_and_uses_generated_text_only(self):
        uploaded = self.client.post(
            "/api/upload",
            data={"report_text": "Patient Name: Translation Patient\nHemoglobin 11 g/dL (12-16)"},
        )
        report_id = uploaded.json["report"]["id"]
        expected_output = {
            "summary": "Tamil summary",
            "entities": [],
            "lab_meanings": ["Tamil meaning"],
            "questions": ["Tamil question"],
        }
        with patch("routes.report_routes.translate_report_output", return_value=expected_output) as translate:
            response = self.client.post(
                f"/api/reports/{report_id}/translate",
                json={"language": "ta"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["output"], expected_output)
        translated_input = translate.call_args.args[0]
        self.assertIn("summary", translated_input)
        self.assertNotIn("Patient Name", str(translated_input))
        self.assertNotIn("original_text", translated_input)

        self.client.get("/logout")
        self.client.post(
            "/register",
            data={
                "email": "translation-owner2@example.com",
                "password": "password123",
                "password_confirmation": "password123",
            },
        )
        self.assertEqual(
            self.client.post(
                f"/api/reports/{report_id}/translate",
                json={"language": "ta"},
            ).status_code,
            404,
        )

    def test_report_evaluation_endpoint_compares_text_and_labeled_samples(self):
        uploaded = self.client.post(
            "/api/upload",
            data={
                "report_text": "Hemoglobin 14 g/dL (12-17.5). Please review the result with your doctor."
            },
        )
        report_id = uploaded.json["report"]["id"]

        response = self.client.get(f"/api/reports/{report_id}/evaluation")

        self.assertEqual(response.status_code, 200)
        self.assertIn("flesch_reading_ease", response.json["readability"]["original"])
        self.assertIn("flesch_kincaid_grade", response.json["readability"]["simplified"])
        self.assertEqual(response.json["lab_extraction"]["sample_count"], 4)
        self.assertEqual(response.json["lab_extraction"]["exact_match_accuracy"], 1.0)

    def test_account_deletion_removes_reports_patients_audit_logs_and_files(self):
        user = User.query.filter_by(email="test@example.com").one()
        patient = Patient(owner_id=user.id, full_name="Private Patient")
        db.session.add(patient)
        db.session.flush()
        os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
        filename = f"account-delete-{user.id}.txt"
        file_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
        with open(file_path, "w", encoding="utf-8") as report_file:
            report_file.write("Private report contents")
        report = MedicalReport(
            owner_id=user.id,
            patient_id=patient.id,
            file_path=file_path,
            extracted_text="Private report contents",
        )
        db.session.add(report)
        db.session.flush()
        db.session.add(MedicalEntity(
            report_id=report.id,
            entity_text="Private term",
            entity_label="LAB_TERM",
        ))
        db.session.add(AuditLog(user_id=user.id, action="test_account_delete"))
        db.session.commit()
        user_id = user.id
        report_id = report.id

        response = self.client.delete("/api/account")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, {"deleted": True})
        self.assertFalse(os.path.exists(file_path))
        self.assertIsNone(db.session.get(User, user_id))
        self.assertIsNone(db.session.get(MedicalReport, report_id))
        self.assertEqual(Patient.query.filter_by(owner_id=user_id).count(), 0)
        self.assertEqual(AuditLog.query.filter_by(user_id=user_id).count(), 0)
        self.assertEqual(self.client.get("/api/auth/session").status_code, 401)

    def test_report_deletion_removes_file_and_cascaded_records(self):
        user = User.query.filter_by(email="test@example.com").one()
        os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
        file_path = os.path.join(app.config["UPLOAD_FOLDER"], f"report-delete-{user.id}.txt")
        with open(file_path, "w", encoding="utf-8") as report_file:
            report_file.write("Private report contents")
        report = MedicalReport(owner_id=user.id, file_path=file_path)
        db.session.add(report)
        db.session.flush()
        db.session.add(MedicalEntity(
            report_id=report.id,
            entity_text="Hemoglobin",
            entity_label="LAB_TERM",
        ))
        db.session.add(Recommendation(report_id=report.id, condition_name="General"))
        db.session.commit()
        report_id = report.id

        response = self.client.delete(f"/api/reports/{report_id}")

        self.assertEqual(response.status_code, 200)
        self.assertFalse(os.path.exists(file_path))
        self.assertEqual(MedicalEntity.query.filter_by(report_id=report_id).count(), 0)
        self.assertEqual(Recommendation.query.filter_by(report_id=report_id).count(), 0)

    def test_audit_logs_and_admin_protection(self):
        self.assertGreaterEqual(AuditLog.query.filter_by(action="login").count(), 1)
        self.assertEqual(self.client.get("/api/admin/audit-logs").status_code, 403)

    def test_report_management_and_export_are_owner_scoped(self):
        self.client.post(
            "/api/upload",
            data={"report_text": "Patient Name: Export Patient\nImpression: Hypertension."},
        )
        report = MedicalReport.query.first()
        self.assertIsNotNone(report)
        assert report is not None

        renamed = self.client.patch(
            f"/api/reports/{report.id}",
            json={"title": "Annual health review"},
        )
        self.assertEqual(renamed.status_code, 200)
        self.assertEqual(renamed.json["title"], "Annual health review")

        exported_json = self.client.get(f"/api/reports/{report.id}/export/json")
        self.assertEqual(exported_json.status_code, 200)
        self.assertEqual(exported_json.json["title"], "Annual health review")
        exported_text = self.client.get(f"/api/reports/{report.id}/export/txt")
        self.assertEqual(exported_text.status_code, 200)
        self.assertIn(b"Annual health review", exported_text.data)
        exported_pdf = self.client.get(f"/api/reports/{report.id}/export/pdf")
        self.assertEqual(exported_pdf.status_code, 200)
        self.assertEqual(exported_pdf.mimetype, "application/pdf")
        self.assertTrue(exported_pdf.data.startswith(b"%PDF-"))

        self.client.get("/logout")
        self.client.post(
            "/register",
            data={
                "email": "report-owner2@example.com",
                "password": "password123",
                "password_confirmation": "password123",
            },
        )
        self.assertEqual(self.client.patch(f"/api/reports/{report.id}", json={"title": "Stolen"}).status_code, 404)
        self.assertEqual(self.client.delete(f"/api/reports/{report.id}").status_code, 404)

        self.client.get("/logout")
        self.client.post(
            "/login",
            data={"email": "test@example.com", "password": "password123"},
        )
        self.assertEqual(self.client.delete(f"/api/reports/{report.id}").status_code, 200)

    def test_users_have_isolated_patient_and_report_data(self):
        self.client.post(
            "/upload",
            data={
                "report_text": "Patient Name: Alice Report\nAge: 40\nImpression: Hypertension."
            },
            follow_redirects=True,
        )
        alice = User.query.filter_by(email="test@example.com").first()
        self.assertIsNotNone(alice)
        assert alice is not None
        self.assertEqual(Patient.query.filter_by(owner_id=alice.id).count(), 1)
        self.assertEqual(MedicalReport.query.filter_by(owner_id=alice.id).count(), 1)

        self.client.get("/logout")
        self.client.post(
            "/register",
            data={
                "email": "other@example.com",
                "password": "password123",
                "password_confirmation": "password123",
            },
        )
        other_reports = self.client.get("/api/reports")
        other_patients = self.client.get("/patients/api/list")
        self.assertEqual(other_reports.status_code, 200)
        self.assertEqual(other_reports.json, [])
        self.assertEqual(other_patients.status_code, 200)
        self.assertEqual(other_patients.json, [])

    def test_auto_extract_and_create_patient_on_upload(self):
        # Upload report with patient header text
        report_text = """
        Patient Name: Robert Smith
        Age: 54  Sex: Male
        Blood Group: O+
        Phone: +1-555-0199
        Impression: Patient exhibits Hypertension and Diabetes Mellitus.
        """
        response = self.client.post(
            "/upload",
            data={"report_text": report_text},
            follow_redirects=True,
        )
        self.assertEqual(response.status_code, 200)

        # Verify that Robert Smith was automatically created in Patient table
        patient = Patient.query.filter_by(full_name="Robert Smith").first()
        self.assertIsNotNone(patient)
        assert patient is not None
        self.assertEqual(patient.age, 54)
        self.assertEqual(patient.gender, "Male")
        self.assertEqual(patient.blood_group, "O+")
        self.assertEqual(patient.contact_phone, "+1-555-0199")

        # Verify that the medical report was automatically linked to Robert Smith
        reports = cast(list[MedicalReport], patient.reports)
        self.assertEqual(len(reports), 1)
        self.assertIn("Hypertension", reports[0].extracted_text)


if __name__ == "__main__":
    unittest.main()
