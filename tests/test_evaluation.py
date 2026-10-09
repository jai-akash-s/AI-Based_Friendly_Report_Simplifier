import sys
import unittest
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

from services.evaluation import (
    evaluate_lab_extraction,
    evaluate_readability,
    load_labeled_samples,
)


class TestEvaluation(unittest.TestCase):
    def test_readability_returns_both_scores_and_counts(self):
        result = evaluate_readability(
            "The report may include a finding. Please consult your doctor."
        )

        self.assertEqual(result["sentences"], 2)
        self.assertGreater(result["words"], 5)
        self.assertGreater(result["syllables"], 5)
        self.assertIsInstance(result["flesch_reading_ease"], float)
        self.assertIsInstance(result["flesch_kincaid_grade"], float)

    def test_empty_text_has_no_misleading_scores(self):
        result = evaluate_readability(" \n ")

        self.assertIsNone(result["flesch_reading_ease"])
        self.assertIsNone(result["flesch_kincaid_grade"])
        self.assertEqual(result["words"], 0)

    def test_labeled_samples_have_expected_perfect_baseline(self):
        metrics = evaluate_lab_extraction(load_labeled_samples())

        self.assertEqual(metrics["sample_count"], 4)
        self.assertEqual(metrics["exact_match_accuracy"], 1.0)
        self.assertEqual(metrics["value_precision"], 1.0)
        self.assertEqual(metrics["value_recall"], 1.0)

    def test_counts_missing_and_extra_predictions(self):
        metrics = evaluate_lab_extraction([{
            "text": "Glucose 108 mg/dL\nWBC 7 10^3/uL",
            "expected": [{
                "test_name": "Glucose",
                "value": 108.0,
                "unit": "mg/dL",
                "status": "High",
            }],
        }])

        self.assertEqual(metrics["exact_match_accuracy"], 0.0)
        self.assertEqual(metrics["correct_values"], 1)
        self.assertEqual(metrics["false_positive_values"], 1)
        self.assertEqual(metrics["value_precision"], 0.5)
        self.assertEqual(metrics["value_recall"], 1.0)


if __name__ == "__main__":
    unittest.main()
