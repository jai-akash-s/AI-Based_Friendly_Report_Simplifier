import sys
import unittest
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

from services.medical_safety import (
    DISCLAIMER,
    build_cautious_summary,
    enforce_safe_explanation,
    enforce_safe_summary,
)


class TestMedicalSafety(unittest.TestCase):
    def test_cautious_summary_only_reports_mentions(self):
        summary = build_cautious_summary([
            {"text": "Diabetes Mellitus"},
            {"text": "HbA1c"},
        ])

        self.assertIn("report mentions", summary)
        self.assertIn("may need interpretation", summary)
        self.assertIn("do not confirm a diagnosis", summary)
        self.assertIn("Please consult your doctor", summary)

    def test_replaces_diagnosis_or_treatment_instructions(self):
        fallback = enforce_safe_summary("You have diabetes. Take your medication.", [
            {"text": "HbA1c"},
        ])

        self.assertIn("report mentions HbA1c", fallback)
        self.assertNotIn("Take your medication", fallback)

    def test_replaces_unsafe_medical_term_explanation(self):
        explanation = enforce_safe_explanation(
            "You have this condition and should start treatment.",
            "A1c",
        )

        self.assertIn("may depend on context", explanation)
        self.assertIn("please consult your doctor", explanation)

    def test_disclaimer_forbids_diagnosis_and_treatment_changes(self):
        self.assertIn("not a diagnosis or treatment plan", DISCLAIMER)
        self.assertIn("Do not start, stop, or change treatment", DISCLAIMER)


if __name__ == "__main__":
    unittest.main()
