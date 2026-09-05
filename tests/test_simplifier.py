import unittest
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

from core.simplifier import simplify_report


class TestSimplifier(unittest.TestCase):

    def test_simplify_report_basic(self):
        sample = "Patient takes Metformin for Diabetes Mellitus."
        result = simplify_report(sample, use_ai_fallback=False)

        self.assertEqual(result["original_text"], sample)
        self.assertTrue(len(result["entities"]) >= 2)
        entity_names = [e["text"].lower() for e in result["entities"]]
        self.assertIn("metformin", entity_names)
        self.assertIn("diabetes mellitus", entity_names)

        self.assertIn("recommendations", result)


if __name__ == "__main__":
    unittest.main()
