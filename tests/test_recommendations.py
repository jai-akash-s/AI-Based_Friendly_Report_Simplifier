import unittest
import sys
from pathlib import Path

# Add project root to sys.path
BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

from core.simplifier import simplify_report, generate_recommendations


class TestRecommendations(unittest.TestCase):

    def test_single_condition_recommendations(self):
        sample_report = "Patient was diagnosed with Hypertension."
        result = simplify_report(sample_report, use_ai_fallback=False)

        recs = result.get("recommendations", {})
        self.assertIn("aggregated", recs)
        self.assertIn("disclaimer", recs)

        eat = recs["aggregated"]["foods_to_eat"]
        avoid = recs["aggregated"]["foods_to_avoid"]
        exercise = recs["aggregated"]["recommended_exercise"]

        self.assertTrue(any("Leafy greens" in f for f in eat))
        self.assertTrue(any("sodium" in f.lower() for f in avoid))
        self.assertTrue(any("walking" in e.lower() for e in exercise))

    def test_multiple_conditions_recommendations(self):
        sample_report = "Patient has Diabetes Mellitus and Hyperlipidemia."
        result = simplify_report(sample_report, use_ai_fallback=False)

        recs = result.get("recommendations", {})
        aggregated = recs["aggregated"]

        self.assertTrue(len(aggregated["foods_to_eat"]) > 0)
        self.assertTrue(len(aggregated["foods_to_avoid"]) > 0)
        self.assertTrue(len(aggregated["recommended_exercise"]) > 0)
        self.assertTrue(len(recs["by_condition"]) >= 2)


if __name__ == "__main__":
    unittest.main()
