import unittest
from services.drug_interactions import check_drug_interactions

class TestDrugInteractions(unittest.TestCase):
    def test_detects_aspirin_and_ibuprofen(self):
        results = check_drug_interactions(["Aspirin 75mg", "Ibuprofen 400mg"])
        self.assertGreaterEqual(len(results), 1)
        self.assertEqual(results[0]["severity"], "Moderate")
        self.assertIn("blood thinner", results[0]["doctor_prompt"].lower())

    def test_detects_metformin_and_glimepiride(self):
        results = check_drug_interactions(["Metformin 500mg", "Glimepiride 2mg"])
        self.assertGreaterEqual(len(results), 1)
        self.assertEqual(results[0]["severity"], "Caution")
        self.assertIn("blood sugar", results[0]["description"].lower())

    def test_single_drug_returns_empty(self):
        self.assertEqual(check_drug_interactions(["Paracetamol"]), [])

    def test_no_known_interaction_returns_empty(self):
        self.assertEqual(check_drug_interactions(["Amoxicillin", "Cetirizine"]), [])

if __name__ == "__main__":
    unittest.main()
