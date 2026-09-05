import unittest
import os
import sys

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import app
from database.models import db, Patient, MedicalReport, MedicalEntity, Recommendation


class TestDatabaseModels(unittest.TestCase):

    def setUp(self):
        app.config["TESTING"] = True
        app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
        self.app_context = app.app_context()
        self.app_context.push()
        db.create_all()
        self.client = app.test_client()

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
        self.assertTrue(fetched.patient_code.startswith("PAT-"))
        self.assertEqual(fetched.age, 30)

    def test_report_and_relationships(self):
        patient = Patient(full_name="Jane Doe", age=25)
        db.session.add(patient)
        db.session.commit()

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
        self.assertEqual(len(patient.reports), 1)
        self.assertEqual(patient.reports[0].simplified_text, "High blood pressure detected.")
        self.assertEqual(len(report.entities), 1)
        self.assertEqual(report.entities[0].entity_text, "Hypertension")
        self.assertEqual(report.recommendations[0].get_list_field("foods_to_eat"), ["Leafy greens", "Bananas"])

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
        self.assertEqual(patient.age, 54)
        self.assertEqual(patient.gender, "Male")
        self.assertEqual(patient.blood_group, "O+")
        self.assertEqual(patient.contact_phone, "+1-555-0199")

        # Verify that the medical report was automatically linked to Robert Smith
        self.assertEqual(len(patient.reports), 1)
        self.assertIn("Hypertension", patient.reports[0].extracted_text)


if __name__ == "__main__":
    unittest.main()
