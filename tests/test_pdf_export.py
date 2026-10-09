import sys
import unittest
from pathlib import Path

import pymupdf

BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

from services.pdf_export import build_simplified_report_pdf


class TestPdfExport(unittest.TestCase):
    def test_pdf_includes_safe_summary_labs_questions_and_disclaimer(self):
        pdf = build_simplified_report_pdf({
            "title": "Annual report",
            "created_at": "2026-06-01",
            "patient": {"name": "Test Patient", "age": 42},
            "simplified_summary": "The report mentions Hemoglobin. Please consult your doctor.",
            "lab_results": [{
                "test_name": "Hemoglobin",
                "value": 10.5,
                "unit": "g/dL",
                "reference_range": {"low": 12, "high": 16, "unit": None},
                "status": "Low",
            }],
            "entities": [{"text": "Hemoglobin", "explanation": "A blood test."}],
            "questions_to_ask_doctor": ["What may this result mean?"],
            "disclaimer": "This is not a diagnosis. Please consult your doctor.",
        })

        document = pymupdf.open(stream=pdf.getvalue(), filetype="pdf")
        text = "\n".join(page.get_text() for page in document)

        self.assertTrue(text.strip())
        self.assertIn("Annual report", text)
        self.assertIn("10.5 g/dL", text)
        self.assertIn("Questions to ask your doctor", text)
        self.assertIn("What may this result mean?", text)
        self.assertIn("not a diagnosis", text)


if __name__ == "__main__":
    unittest.main()
