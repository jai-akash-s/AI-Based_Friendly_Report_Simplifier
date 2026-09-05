import os
import sys

# Ensure project root is in python path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app import app
from database.models import db, Patient, MedicalReport, MedicalEntity, Recommendation


def init_db(seed_sample_data=True):
    """Initializes SQLite database tables and creates sample demo patient data if empty."""
    db_dir = os.path.join(BASE_DIR, "database")
    os.makedirs(db_dir, exist_ok=True)

    with app.app_context():
        print("Creating database tables...")
        db.create_all()
        print("Database tables initialized successfully!")

        if seed_sample_data and Patient.query.count() == 0:
            print("Seeding sample demo patient records...")
            demo_patient_1 = Patient(
                full_name="John Doe",
                age=45,
                gender="Male",
                blood_group="O+",
                contact_email="john.doe@example.com",
                contact_phone="+1-555-0192",
            )
            demo_patient_2 = Patient(
                full_name="Jane Smith",
                age=38,
                gender="Female",
                blood_group="A+",
                contact_email="jane.smith@example.com",
                contact_phone="+1-555-0143",
            )
            db.session.add_all([demo_patient_1, demo_patient_2])
            db.session.commit()
            print(f"Seeded 2 demo patients: {demo_patient_1.patient_code}, {demo_patient_2.patient_code}")


if __name__ == "__main__":
    init_db()
