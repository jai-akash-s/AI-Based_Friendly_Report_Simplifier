"""Medicine name normalization, lookup, safety, and API tests."""

import json
import os
import re
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from app import app
from database.import_medicine_csv import _write_sqlite, read_medicine_csv
from database.models import MedicalEntity, MedicineCatalogEntry, MedicineLookupCache, db
from services.medicine_lookup import (
    BRAND_INDEX,
    MEDICINE_CATALOG,
    clean_name,
    lookup_medicine,
    refresh_medicine_index,
)


def llm_response(input_name="Qzxvbrand", **changes):
    response = {
        "input_name": input_name,
        "possible_generic_name": "Example ingredient",
        "drug_class": "antacid",
        "use": "Commonly used to reduce stomach acid.",
        "confidence": "medium",
        "needs_confirmation": True,
        "note": "Please confirm this medicine and its purpose with your doctor or pharmacist.",
    }
    response.update(changes)
    return response


class TestMedicineLookup(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
        self.app_context = app.app_context()
        self.app_context.push()
        db.create_all()
        self.client = app.test_client()
        register_response = self.client.post(
            "/register",
            data={
                "email": "medicine-test@example.com",
                "password": "password123",
                "password_confirmation": "password123",
            },
        )
        self.assertEqual(register_response.status_code, 302)

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.app_context.pop()

    def test_clean_name_removes_prescription_prefixes_strengths_and_punctuation(self):
        examples = {
            "T. Eropet 40": "eropet",
            "Cap. Rozad-10D": "rozad",
            "Tab. Amulox 500mg": "amulox",
            "Telmisartan 40": "telmisartan",
            "Tadalafil 20mg": "tadalafil",
            "TestBrand 250mg": "testbrand",
            "Tablet Paracetamol 500 mg": "paracetamol",
            "Capsule Vitamin-B12 5mcg": "vitamin b12",
            "Syp. Cough Syrup 5ml": "cough syrup",
            "Inj. Example 1.5ml": "example",
        }
        for original, expected in examples.items():
            with self.subTest(original=original):
                self.assertEqual(clean_name(original), expected)
        self.assertEqual(clean_name(None), "")

    def test_catalog_contains_at_least_one_hundred_medicines(self):
        self.assertGreaterEqual(len(MEDICINE_CATALOG), 100)

    def test_exact_generic_and_brand_matches_are_verified(self):
        generic = lookup_medicine("Paracetamol 500mg")
        brand = lookup_medicine("Dolo-650")
        self.assertEqual(generic["status"], "verified")
        self.assertEqual(brand["status"], "verified")
        self.assertEqual(brand["generic_name"], "Paracetamol")
        self.assertEqual(brand["source"], "database")
        self.assertEqual(lookup_medicine("Telmisartan")["status"], "verified")
        self.assertEqual(lookup_medicine("Foracort")["generic_name"], "Budesonide Formoterol")

    def test_fuzzy_misspelling_requires_confirmation(self):
        result = lookup_medicine("paracetmol")
        self.assertEqual(result["status"], "possible_match")
        self.assertEqual(result["generic_name"], "Paracetamol")
        self.assertTrue(result["needs_confirmation"])

    def test_unknown_name_returns_not_found_when_llm_is_not_configured(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": ""}):
            result = lookup_medicine("Qzxvbrand")
        self.assertEqual(result["status"], "not_found")
        self.assertIsNone(result["use"])
        self.assertEqual(result["source"], "none")

    def test_llm_parses_valid_json(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}), patch(
            "services.medicine_explainer.generate_gemini_json",
            return_value=json.dumps(llm_response()),
        ) as generate:
            result = lookup_medicine("Qzxvbrand")
        self.assertEqual(result["status"], "possible_match")
        self.assertEqual(result["confidence"], "medium")
        self.assertEqual(result["source"], "llm")
        generate.assert_called_once()

    def test_llm_parses_json_inside_code_fences(self):
        response = json.dumps(llm_response("Fencetestbrand"))
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}), patch(
            "services.medicine_explainer.generate_gemini_json",
            return_value=f"```json\n{response}\n```",
        ) as generate:
            result = lookup_medicine("Fencetestbrand")
        self.assertEqual(result["generic_name"], "Example ingredient")
        generate.assert_called_once()

    def test_invalid_llm_json_is_low_confidence_and_not_found(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}), patch(
            "services.medicine_explainer.generate_gemini_json",
            return_value="```json\n{invalid}\n```",
        ) as generate:
            result = lookup_medicine("Invalidjsonbrand")
        self.assertEqual(result["status"], "not_found")
        self.assertEqual(result["confidence"], "low")
        self.assertEqual(result["source"], "llm")
        generate.assert_called_once()

    def test_llm_cache_prevents_second_provider_call(self):
        response = json.dumps(llm_response())
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}), patch(
            "services.medicine_explainer.generate_gemini_json",
            return_value=response,
        ) as generate:
            first = lookup_medicine("Qzxvbrand 500mg")
            second = lookup_medicine("T. Qzxvbrand 250mg")

        self.assertEqual(first["generic_name"], second["generic_name"])
        self.assertEqual(second["name"], "T. Qzxvbrand 250mg")
        self.assertEqual(generate.call_count, 1)
        self.assertEqual(generate.call_args.kwargs["temperature"], 0.2)
        self.assertEqual(MedicineLookupCache.query.count(), 1)

    def test_llm_dosage_or_treatment_instructions_are_not_returned(self):
        unsafe_response = json.dumps(llm_response(
            use="Take 500 mg twice daily for 7 days."
        ))
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}), patch(
            "services.medicine_explainer.generate_gemini_json",
            return_value=unsafe_response,
        ):
            result = lookup_medicine("Qzxvbrand")
        self.assertEqual(result["status"], "not_found")
        self.assertIsNone(result["use"])

    def test_upload_api_medicine_explanation_contains_no_dosage_advice(self):
        response = self.client.post(
            "/api/upload",
            data={
                "report_text": (
                    "Patient Name: Medicine Test\n"
                    "Prescription: Paracetamol 500 mg."
                )
            },
        )
        self.assertEqual(response.status_code, 200)
        medicines = [
            entity for entity in response.json["result"]["entities"]
            if entity["label"] == "MEDICINE"
        ]
        self.assertTrue(medicines)
        medicine = medicines[0]
        self.assertEqual(medicine["status"], "verified")
        self.assertNotRegex(
            " ".join(str(medicine.get(field) or "") for field in (
                "generic_name", "drug_class", "use", "note"
            )),
            re.compile(r"\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|units?)\b", re.I),
        )
        saved = response.json["report"]["entities"]
        self.assertEqual(saved[0]["status"], "verified")
        self.assertIn("medicine_results", response.json["report"])

    def test_edited_medicine_lookup_persists_to_owned_report(self):
        uploaded = self.client.post(
            "/api/upload",
            data={"report_text": "Patient Name: Edit Test\nMedicine: Paracetamol"},
        )
        report = uploaded.json["report"]
        medicine = next(
            entity for entity in report["entities"]
            if entity["entity_label"] == "MEDICINE"
        )
        response = self.client.post(
            f"/api/reports/{report['id']}/medicine-lookup",
            json={"entity_id": medicine["id"], "name": "Dolo-650"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["generic_name"], "Paracetamol")
        stored_entity = db.session.get(MedicalEntity, medicine["id"])
        self.assertEqual(stored_entity.entity_text, "Dolo-650")
        self.assertEqual(stored_entity.report.to_dict()["entities"][0]["status"], "verified")

    def test_csv_import_accepts_brand_composition_and_use_columns(self):
        import csv

        with tempfile.NamedTemporaryFile(
            mode="w", newline="", encoding="utf-8", suffix=".csv", delete=False
        ) as csv_file:
            writer = csv.DictWriter(
                csv_file,
                fieldnames=["Brand Name", "Composition", "Use"],
            )
            writer.writeheader()
            writer.writerow({
                "Brand Name": "SampleBrand 250mg",
                "Composition": "Sample ingredient 250mg",
                "Use": "Commonly used to relieve a symptom.",
            })
            path = csv_file.name
        try:
            imported = read_medicine_csv(path)
        finally:
            Path(path).unlink(missing_ok=True)
        self.assertEqual(imported["sample ingredient"]["brands"], ["SampleBrand 250mg"])

    def test_sqlite_import_is_loaded_into_startup_medicine_index(self):
        entry = MedicineCatalogEntry(
            generic_name="test active ingredient",
            drug_class="test medicine",
            use="Commonly used to support a test condition.",
            brands=json.dumps(["TestBrand"]),
        )
        db.session.add(entry)
        db.session.commit()

        refresh_medicine_index()
        result = lookup_medicine("TestBrand")
        self.assertEqual(result["status"], "verified")
        self.assertEqual(result["generic_name"], "Test Active Ingredient")
        db.session.delete(entry)
        db.session.commit()
        refresh_medicine_index()

    def test_csv_import_can_write_to_medicines_sqlite_table(self):
        imported = {
            "sample ingredient": {
                "class": "test medicine",
                "use": "Commonly used to support a test condition.",
                "brands": ["SampleBrand"],
            }
        }
        with tempfile.TemporaryDirectory() as directory:
            database_path = os.path.join(directory, "medicines.db")
            _write_sqlite(database_path, imported)
            connection = sqlite3.connect(database_path)
            try:
                row = connection.execute(
                    "SELECT generic_name, drug_class, use, brands FROM medicines"
                ).fetchone()
            finally:
                connection.close()
        self.assertEqual(row[0], "sample ingredient")
        self.assertEqual(json.loads(row[3]), ["SampleBrand"])


if __name__ == "__main__":
    unittest.main()
