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
        self.assertIn("report mentions", result["simplified_summary"])
        self.assertIn("may need interpretation", result["simplified_summary"])
        self.assertIn("Please consult your doctor", result["simplified_summary"])

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

    def test_cold_and_fever_recommendations(self):
        sample = "Patient presents with acute cold and fever symptoms."
        result = simplify_report(sample, use_ai_fallback=False)
        recs = result["recommendations"]["aggregated"]
        self.assertIn("Drink hot water", recs["foods_to_eat"])
        self.assertTrue(any("Ginger Tea" in item for item in recs["foods_to_eat"]))
        self.assertTrue(any("Herbal Teas" in item for item in recs["foods_to_eat"]))
        self.assertTrue(any("Warm Soups" in item for item in recs["foods_to_eat"]))
        self.assertTrue(any("Hydration" in item for item in recs["foods_to_eat"]))
        self.assertIn("Avoid cold water", recs["foods_to_avoid"])
        self.assertTrue(any("recovery and alleviate symptoms" in item for item in recs["general_precautions"]))

    def test_cold_fever_prescription_medicines(self):
        sample = "Prescription: Dolomi Plus 1 tab TDS, Cetzine 1 tab OD at night. BP: 115/66."
        result = simplify_report(sample, use_ai_fallback=False)
        recs = result["recommendations"]["aggregated"]
        self.assertIn("Drink hot water", recs["foods_to_eat"])
        self.assertIn("Avoid cold water", recs["foods_to_avoid"])


if __name__ == "__main__":
    unittest.main()
