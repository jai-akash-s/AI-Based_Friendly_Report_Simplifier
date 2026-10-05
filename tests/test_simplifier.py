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

    def test_handwritten_prescription_report(self):
        sample = (
            "Name: Karuna Chauhan, Sex: F, Age: 36. Anxiety/Gastric. "
            "Rx Cap Rozad-100 AC 7 AM. T. Ambulax 1 BD. T. Pathil Plus 1 OHS. "
            "T. Placed 1 OD. T. Eropet 40 1 OD 6 PM. Follow up 1 Month. "
            "BP: 130/90, SPO2: 98%."
        )
        result = simplify_report(sample, use_ai_fallback=False)

        detected = {(entity["text"], entity["label"]) for entity in result["entities"]}
        self.assertIn(("Anxiety", "DISEASE"), detected)
        self.assertIn(("Gastric", "DISEASE"), detected)
        self.assertIn(("BP: 130/90", "LAB_TERM"), detected)
        for medicine in ("Rozad-100", "Ambulax", "Pathil Plus", "Placed", "Eropet 40"):
            self.assertIn((medicine, "MEDICINE"), detected)

        summary = result["simplified_summary"].lower()
        self.assertIn("130/90", summary)
        self.assertIn("follow up in one month", summary)
        self.assertTrue(result["safety"]["medication_warning"])

        recommendations = result["recommendations"]["aggregated"]
        self.assertTrue(recommendations["foods_to_eat"])
        self.assertTrue(recommendations["foods_to_avoid"])
        self.assertTrue(recommendations["recommended_exercise"])


if __name__ == "__main__":
    unittest.main()
