import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

from services.translation import (
    TranslationNotConfiguredError,
    TranslationProviderError,
    translate_report_output,
)


class TestTranslation(unittest.TestCase):
    def setUp(self):
        self.output = {
            "summary": "This result may need review. Please consult your doctor.",
            "entities": ["A plain-language explanation."],
            "lab_meanings": ["This result may have several causes."],
            "questions": ["What may this result mean?"],
        }

    def test_english_returns_input_without_provider(self):
        self.assertIs(translate_report_output(self.output, "en"), self.output)

    def test_missing_api_key_is_explicit(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": ""}):
            with self.assertRaises(TranslationNotConfiguredError):
                translate_report_output(self.output, "ta")

    def test_translates_json_output_and_preserves_shape(self):
        translated = {
            "summary": "தமிழ் summary",
            "entities": ["தமிழ் term"],
            "lab_meanings": ["தமிழ் meaning"],
            "questions": ["தமிழ் question"],
        }
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}), patch(
            "services.translation.generate_gemini_json",
            return_value=json.dumps(translated, ensure_ascii=False),
        ):
            result = translate_report_output(self.output, "ta")

        self.assertEqual(result, translated)

    def test_rejects_incomplete_provider_output(self):
        incomplete = {"summary": "Hindi"}
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}), patch(
            "services.translation.generate_gemini_json",
            return_value=json.dumps(incomplete),
        ):
            with self.assertRaises(TranslationProviderError):
                translate_report_output(self.output, "hi")

    def test_rejects_translated_diagnosis_or_treatment_instructions(self):
        unsafe = {
            "summary": "आपको मधुमेह रोग है। दवा लें।",
            "entities": ["term"],
            "lab_meanings": ["meaning"],
            "questions": ["question"],
            "disclaimer": "disclaimer",
        }
        output = {**self.output, "disclaimer": "Educational use only."}
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}), patch(
            "services.translation.generate_gemini_json",
            return_value=json.dumps(unsafe),
        ):
            with self.assertRaises(TranslationProviderError):
                translate_report_output(output, "hi")

    def test_rejects_unsupported_language(self):
        with self.assertRaises(ValueError):
            translate_report_output(self.output, "fr")


if __name__ == "__main__":
    unittest.main()
