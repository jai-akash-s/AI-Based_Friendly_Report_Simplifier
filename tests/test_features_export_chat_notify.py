import json
import unittest
from PIL import Image

from core.extractor import _deskew_image, _remove_shadows_and_normalize, _prepare_ocr_image
from core.simplifier import generate_recommendations, lookup_recommendation
from services.ai_chat import generate_health_chat_reply
from services.notifications import build_reminder_email_html, send_reminder_email
from services.pdf_export import build_simplified_report_pdf


class TestNewFeatures(unittest.TestCase):
    def setUp(self):
        self.sample_report = {
            "id": 101,
            "title": "Comprehensive Metabolic & Lipid Panel",
            "filename": "sample_lab.pdf",
            "created_at": "2026-10-15T10:00:00Z",
            "simplified_text": "Your report shows glucose and cholesterol values to review with your doctor.",
            "lab_results": [
                {
                    "test_name": "Glucose",
                    "value": "118",
                    "unit": "mg/dL",
                    "status": "High",
                    "reference_range": {"low": 70, "high": 99},
                    "meaning": "Fasting blood sugar level.",
                },
                {
                    "test_name": "Hemoglobin",
                    "value": "14.2",
                    "unit": "g/dL",
                    "status": "Normal",
                    "reference_range": {"low": 12.0, "high": 16.0},
                    "meaning": "Oxygen-carrying protein in red blood cells.",
                },
            ],
            "entities": [
                {
                    "entity_text": "Metformin",
                    "entity_label": "MEDICINE",
                    "explanation": "Lowers blood glucose levels in diabetes.",
                }
            ],
            "recommendations": {
                "aggregated": {
                    "foods_to_eat": ["Oats", "Spinach", "Legumes"],
                    "foods_to_avoid": ["Sugary beverages", "Fried foods"],
                }
            },
            "questions_to_ask_doctor": [
                "Should we recheck my fasting glucose in 3 months?",
            ],
        }
        self.sample_patient = {
            "id": 42,
            "patient_code": "PAT-2026-TEST",
            "full_name": "Jane Doe",
            "age": 45,
            "gender": "Female",
        }

    def test_ai_health_chat_responses(self):
        # 1. Ask about glucose
        res1 = generate_health_chat_reply("What does high glucose mean?", self.sample_report, self.sample_patient)
        self.assertIn("glucose", res1["reply"].lower())
        self.assertTrue(len(res1["suggestions"]) >= 2)

        # 2. Ask about diet
        res2 = generate_health_chat_reply("What should I eat or avoid?", self.sample_report, self.sample_patient)
        self.assertTrue("Oats" in res2["reply"] or "Nutritional" in res2["reply"] or "oats" in res2["reply"].lower())
        self.assertTrue(len(res2["suggestions"]) >= 2)

        # 3. Ask about medicines
        res3 = generate_health_chat_reply("Tell me about my medicine", self.sample_report, self.sample_patient)
        self.assertIn("metformin", res3["reply"].lower())

    def test_reminder_notifications(self):
        reminders = [
            {
                "id": 1,
                "title": "Glucose follow-up",
                "due_text": "In 2 weeks",
                "tag": "warning",
                "patient_name": "Jane Doe",
                "notes": "Fast for 8 hours before repeat draw.",
            }
        ]
        html_doc = build_reminder_email_html(reminders, "Jane")
        self.assertIn("Glucose follow-up", html_doc)
        self.assertIn("In 2 weeks", html_doc)
        self.assertIn("Jane Doe", html_doc)

        result = send_reminder_email("jane@example.com", reminders, "Jane")
        self.assertIn(result["status"], {"sent", "simulated"})
        self.assertEqual(result["recipient"], "jane@example.com")

    def test_image_preprocessing(self):
        # Create a synthetic image
        img = Image.new("RGB", (300, 300), color=(240, 240, 240))
        processed = _prepare_ocr_image(img)
        self.assertGreaterEqual(processed.width, 1400)
        self.assertEqual(processed.mode, "L")

    def test_abnormal_lab_results_recommendations(self):
        labs = [
            {"test_name": "Glucose", "value": "158", "unit": "mg/dL", "status": "High"},
            {"test_name": "Uric Acid", "value": "8.4", "unit": "mg/dL", "status": "High"},
            {"test_name": "Hemoglobin", "value": "10.2", "unit": "g/dL", "status": "Low"},
        ]
        recs = generate_recommendations(entities=[], text="", lab_results=labs)
        conditions = [c["condition"] for c in recs["by_condition"]]
        self.assertTrue(any("Glucose" in c for c in conditions))
        self.assertTrue(any("Uric Acid" in c for c in conditions))
        self.assertTrue(any("Hemoglobin" in c or "Anemia" in c for c in conditions))

        # Check aggregated foods and exercises
        eat = " ".join(recs["aggregated"]["foods_to_eat"]).lower()
        avoid = " ".join(recs["aggregated"]["foods_to_avoid"]).lower()
        self.assertTrue("vegetables" in eat or "hydration" in eat or "cherries" in eat)
        self.assertTrue("sugar" in avoid or "purine" in avoid)

    def test_pdf_export_includes_recommendations(self):
        data = {
            "title": "Comprehensive Panel",
            "patient": {"name": "Jane Doe", "age": 45, "gender": "Female", "blood_group": "A+"},
            "created_at": "2026-10-15",
            "simplified_summary": "Your lab results show elevated glucose.",
            "disclaimer": "Educational summary only.",
            "recommendations": {
                "aggregated": {
                    "foods_to_eat": ["Oats", "Spinach"],
                    "foods_to_avoid": ["Sugary drinks"],
                    "recommended_exercise": ["Daily 30 min walking"],
                    "general_precautions": ["Stay hydrated."],
                }
            },
        }
        pdf_stream = build_simplified_report_pdf(data)
        pdf_bytes = pdf_stream.getvalue()
        self.assertTrue(len(pdf_bytes) > 500)
        self.assertTrue(pdf_bytes.startswith(b"%PDF"))


if __name__ == "__main__":
    unittest.main()
