# pyright: reportCallIssue=false

import os
import sys
import tempfile
import unittest

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from app import app
from database.models import db, Patient, MedicalReport, Reminder, User


class TestPatientDeletionAndRoutes(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        app.config["TESTING"] = True
        app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
        app.config["UPLOAD_FOLDER"] = self.temp_dir.name
        app.config["CSRF_ENABLED"] = False
        self.app_context = app.app_context()
        self.app_context.push()
        db.create_all()
        self.client = app.test_client()
        self.client.post(
            "/register",
            data={
                "email": "doctor@test.com",
                "password": "password123",
                "password_confirmation": "password123",
            },
        )
        self.user = User.query.filter_by(email="doctor@test.com").first()
        assert self.user is not None
        self.user_id = self.user.id

    def tearDown(self):
        self.temp_dir.cleanup()
        db.session.remove()
        db.drop_all()
        self.app_context.pop()

    def test_dual_route_prefixes_for_patients(self):
        """Verify that both /patients/api and /api/patients prefixes are reachable."""
        res1 = self.client.get("/patients/api/list")
        self.assertEqual(res1.status_code, 200)

        res2 = self.client.get("/api/patients/list")
        self.assertEqual(res2.status_code, 200)

        res3 = self.client.get("/api/patients")
        self.assertEqual(res3.status_code, 200)

    def test_patient_deletion_cleans_up_files_and_reminders(self):
        """Verify patient deletion cascades to physical files, reminders, and database records."""
        with app.app_context():
            patient = Patient(
                owner_id=self.user_id,
                full_name="Jane Doe",
                age=38,
                gender="Female",
            )
            db.session.add(patient)
            db.session.commit()
            patient_id = patient.id

            # Create dummy uploaded file on disk
            report_file = os.path.join(self.temp_dir.name, "report_jane.pdf")
            with open(report_file, "w") as f:
                f.write("Clinical report dummy")
            self.assertTrue(os.path.exists(report_file))

            report = MedicalReport(
                owner_id=self.user_id,
                patient_id=patient_id,
                title="Jane Lab Report",
                file_path=report_file,
                filename="report_jane.pdf",
            )
            db.session.add(report)
            db.session.commit()
            report_id = report.id

            reminder = Reminder(
                owner_id=self.user_id,
                patient_id=patient_id,
                report_id=report_id,
                title="Follow-up test",
                status="pending",
            )
            db.session.add(reminder)
            db.session.commit()
            reminder_id = reminder.id

        # Delete patient via API endpoint
        del_res = self.client.delete(f"/api/patients/{patient_id}")
        self.assertEqual(del_res.status_code, 200)
        self.assertTrue(del_res.get_json().get("deleted"))

        # Verify physical file was deleted
        self.assertFalse(os.path.exists(report_file))

        # Verify records are gone from database
        with app.app_context():
            self.assertIsNone(db.session.get(Patient, patient_id))
            self.assertIsNone(db.session.get(MedicalReport, report_id))
            self.assertIsNone(db.session.get(Reminder, reminder_id))


if __name__ == "__main__":
    unittest.main()
