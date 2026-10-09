import json
import sys
import unittest
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

from core.lab_extractor import extract_lab_results
from services.lab_parser import parse_lab_results


class TestLabParser(unittest.TestCase):
    def test_uses_report_range_for_classification(self):
        results = parse_lab_results("Hemoglobin: 11.2 g/dL (12.0 - 16.0)")

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["test_name"], "Hemoglobin")
        self.assertEqual(results[0]["value"], 11.2)
        self.assertEqual(results[0]["unit"], "g/dL")
        self.assertEqual(results[0]["reference_range"], {
            "low": 12.0,
            "high": 16.0,
            "unit": None,
            "source": "report",
        })
        self.assertEqual(results[0]["status"], "Low")
        self.assertIn("may", results[0]["meaning"])

    def test_uses_catalog_default_when_report_range_is_missing(self):
        results = parse_lab_results("TSH 5.2 mIU/L")

        self.assertEqual(results[0]["status"], "High")
        self.assertEqual(results[0]["reference_range"]["source"], "default")
        self.assertEqual(results[0]["unit"], "mIU/L")

    def test_classifies_result_inside_report_range_as_normal(self):
        results = parse_lab_results("Platelet Count 250 10^3/uL (150-450)")

        self.assertEqual(results[0]["status"], "Normal")
        self.assertIsNone(results[0]["meaning"])

    def test_extracts_multiple_tests_on_separate_lines(self):
        results = parse_lab_results("WBC 5.4 10^3/uL\nGlucose 105 mg/dL")

        self.assertEqual([result["test_name"] for result in results], ["WBC", "Glucose"])
        self.assertEqual([result["status"] for result in results], ["Normal", "High"])

    def test_compatibility_extractor_returns_json_serializable_results(self):
        results = extract_lab_results("HbA1c 6.1%")

        self.assertEqual(results[0]["test_name"], "HbA1c")
        self.assertEqual(json.loads(json.dumps(results))[0]["status"], "High")

    def test_ignores_text_without_known_test_results(self):
        self.assertEqual(parse_lab_results("The report should be reviewed by a doctor."), [])


if __name__ == "__main__":
    unittest.main()
