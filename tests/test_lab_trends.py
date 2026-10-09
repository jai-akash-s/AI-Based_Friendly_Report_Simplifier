import sys
import unittest
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

from services.lab_trends import build_lab_trend


class TestLabTrends(unittest.TestCase):
    def test_returns_matching_values_with_dates(self):
        reports = [
            {
                "id": 3,
                "created_at": "2026-02-01T00:00:00",
                "lab_results": [
                    {"test_name": "Hemoglobin", "value": 12.3, "unit": "g/dL", "status": "Normal"},
                    {"test_name": "WBC", "value": 5.0, "unit": "10^3/uL", "status": "Normal"},
                ],
            },
            {
                "id": 4,
                "created_at": "2026-03-01T00:00:00",
                "lab_results": [
                    {"test_name": "Hemoglobin", "value": 11.1, "unit": "g/dL", "status": "Low"},
                ],
            },
        ]

        trend = build_lab_trend(reports, "hemoglobin")

        self.assertEqual(trend["test_name"], "Hemoglobin")
        self.assertEqual([point["value"] for point in trend["points"]], [12.3, 11.1])
        self.assertEqual([point["report_id"] for point in trend["points"]], [3, 4])

    def test_empty_results_and_invalid_test_name(self):
        self.assertEqual(build_lab_trend([], "WBC"), {"test_name": "WBC", "points": []})
        with self.assertRaises(ValueError):
            build_lab_trend([], "  ")


if __name__ == "__main__":
    unittest.main()
