"""Translate generated report output using the configured Gemini provider."""

import json
import re

from core.gemini_analyzer import GeminiAnalysisError, generate_gemini_json, has_gemini_api_key


SUPPORTED_LANGUAGES = {"ta": "Tamil", "hi": "Hindi"}
_UNSAFE_TRANSLATED_PHRASES = {
    "en": re.compile(
        r"\b(?:you have|you suffer from|diagnosed with|take your medicine|"
        r"start treatment|stop treatment|increase your dose|prescribed treatment)\b",
        re.I,
    ),
    "ta": re.compile(
        r"(?:உங்களுக்கு .{0,40}(?:நோய்|உள்ளது)|நோய் கண்டறியப்பட்டது|"
        r"மருந்து (?:எடுக்க|தொடங்க|நிறுத்த)|சிகிச்சை தொடங்க)"
    ),
    "hi": re.compile(
        r"(?:आपको .{0,40}(?:बीमारी|रोग) है|निदान किया गया|"
        r"दवा (?:लें|शुरू करें|बंद करें)|इलाज शुरू करें)"
    ),
}


class TranslationNotConfiguredError(RuntimeError):
    """Raised when the user requests cloud translation without configuring Gemini."""


class TranslationProviderError(RuntimeError):
    """Raised when Gemini cannot provide a valid translation."""


def translate_report_output(output, language):
    """Translate generated summary, glossary, lab meanings, and questions only."""
    if language == "en":
        return output
    language_name = SUPPORTED_LANGUAGES.get(language)
    if not language_name:
        raise ValueError("Supported languages are en, ta, and hi.")
    if not has_gemini_api_key():
        raise TranslationNotConfiguredError(
            "Tamil and Hindi translation requires GEMINI_API_KEY. No report text was sent."
        )

    prompt = (
        f"Translate the JSON string values below into {language_name}. "
        "Return only valid JSON with exactly the same keys and array lengths. "
        "Do not add, remove, summarize, or infer medical facts. Preserve test names, "
        "numbers, units, and reference values. Keep cautious wording such as 'may' and "
        "'please consult your doctor'. Do not state a diagnosis or prescribe treatment. "
        "The input contains only generated report explanations, not the original report.\n"
        f"JSON:\n{json.dumps(output, ensure_ascii=False)}"
    )
    try:
        translated_text = generate_gemini_json([{"text": prompt}])
        translated = json.loads(translated_text)
    except (GeminiAnalysisError, json.JSONDecodeError) as error:
        raise TranslationProviderError("The translation provider did not return valid output.") from error

    if not isinstance(translated, dict):
        raise TranslationProviderError("The translation provider returned an invalid output shape.")
    if translated.keys() != output.keys():
        raise TranslationProviderError("The translation provider returned an invalid output shape.")
    for key, value in output.items():
        translated_value = translated.get(key)
        if isinstance(value, list):
            if not isinstance(translated_value, list) or len(translated_value) != len(value):
                raise TranslationProviderError("The translation provider returned an invalid output shape.")
            if not all(isinstance(item, str) for item in translated_value):
                raise TranslationProviderError("The translation provider returned invalid translated text.")
        elif not isinstance(translated_value, str):
            raise TranslationProviderError("The translation provider returned invalid translated text.")
    translated_strings = [
        item
        for value in translated.values()
        for item in (value if isinstance(value, list) else [value])
    ]
    if any(_UNSAFE_TRANSLATED_PHRASES[language].search(item) for item in translated_strings):
        raise TranslationProviderError(
            "The translation provider returned wording that needs clinician review; no translation was shown."
        )
    return translated
