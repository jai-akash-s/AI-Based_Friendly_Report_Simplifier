import sys
import unittest
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

from services.doctor_questions import generate_doctor_questions


class TestDoctorQuestions(unittest.TestCase):
    def test_generates_test_specific_prompts_for_abnormal_results(self):
        questions = generate_doctor_questions([{
            "test_name": "Hemoglobin",
            "value": 10.2,
            "unit": "g/dL",
            "status": "Low",
        }])

        self.assertEqual(len(questions), 3)
        self.assertTrue(all("Hemoglobin" in question for question in questions))
        self.assertIn("10.2 g/dL", questions[0])
        self.assertIn("may this mean", questions[0])
        self.assertIn("repeating or monitoring", questions[2])

    def test_ignores_normal_results(self):
        questions = generate_doctor_questions([{
            "test_name": "WBC",
            "value": 5.0,
            "unit": "10^3/uL",
            "status": "Normal",
        }])

        self.assertEqual(len(questions), 2)
        self.assertTrue(all("these results" in question or "follow-up" in question for question in questions))

    def test_deduplicates_repeated_abnormal_test_prompts(self):
        result = {
            "test_name": "TSH",
            "value": 5.0,
            "unit": "mIU/L",
            "status": "High",
        }

        self.assertEqual(generate_doctor_questions([result, result]), generate_doctor_questions([result]))


if __name__ == "__main__":
    unittest.main()
