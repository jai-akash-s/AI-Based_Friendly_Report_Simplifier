"""Cautious Gemini fallback and SQLite cache for unknown medicine names."""

import json
import re

from core.gemini_analyzer import (
    GeminiAnalysisError,
    generate_gemini_json,
    has_gemini_api_key,
)
from services.medical_safety import is_safe_medicine_content


SYSTEM_PROMPT = """You are a medicine information assistant inside a patient-friendly medical report
simplifier. You explain what a medicine is generally used for, in simple language a
non-medical person can understand.

RULES:
1. Only use the medicine name(s) and context given to you. Do not invent details.
2. If you are not sure what the medicine is (brand names can be misspelled, misread
   from handwriting, or shared by different products), set "confidence" to "low" and
   say so. Never guess a use for an unfamiliar name.
3. Many Indian brand names are similar but contain different drugs. If the name could
   match several medicines, say that and do not pick one.
4. Explain only the general purpose (what condition or symptom it is commonly used
   for) and the drug class. Do NOT give dosage, timing, duration, or advice to start,
   stop, or change a medicine. Do NOT diagnose the patient.
5. Use simple words (about 8th-grade reading level), 1 to 2 sentences for "use".
6. Always end with a reminder to confirm with the doctor or pharmacist.
7. Output ONLY valid JSON, no markdown, no extra text.

OUTPUT FORMAT:
{
  "input_name": "<name exactly as given>",
  "possible_generic_name": "<generic/active ingredient, or null if unsure>",
  "drug_class": "<e.g. antibiotic, antacid, pain reliever, or null>",
  "use": "<simple explanation of what it is generally used for, or 'Could not be identified'>",
  "confidence": "high | medium | low",
  "needs_confirmation": true or false,
  "note": "Please confirm this medicine and its purpose with your doctor or pharmacist."
}"""

_SAFE_PURPOSE_LANGUAGE = re.compile(
    r"\b(?:commonly used|may be used|used for|used to|helps? (?:with|relieve|manage))\b",
    re.IGNORECASE,
)
_NOT_FOUND_NOTE = (
    "Could not identify this medicine. Please ask your doctor or pharmacist what it is used for."
)
_CONFIRM_NOTE = (
    "Please confirm this medicine and its purpose with your doctor or pharmacist."
)


def _not_found(name: str, cleaned_name: str, *, source: str = "none", confidence: str = "low") -> dict:
    return {
        "name": name,
        "cleaned_name": cleaned_name,
        "generic_name": None,
        "drug_class": None,
        "use": None,
        "status": "not_found",
        "confidence": confidence,
        "source": source,
        "note": _NOT_FOUND_NOTE,
        "matched_name": None,
        "needs_confirmation": True,
    }


def _parse_response(raw_response: str, name: str, cleaned_name: str) -> dict:
    response_text = re.sub(
        r"^\s*```(?:json)?\s*|\s*```\s*$",
        "",
        raw_response.strip(),
        flags=re.IGNORECASE,
    )
    try:
        response = json.loads(response_text)
    except (TypeError, json.JSONDecodeError):
        return _not_found(name, cleaned_name, source="llm")
    if not isinstance(response, dict) or response.get("input_name") != name:
        return _not_found(name, cleaned_name, source="llm")

    confidence = str(response.get("confidence", "")).casefold()
    generic_name = response.get("possible_generic_name")
    drug_class = response.get("drug_class")
    use = response.get("use")
    if (
        confidence not in {"high", "medium"}
        or not isinstance(generic_name, str)
        or not generic_name.strip()
        or generic_name.strip().casefold() in {"null", "unknown", "unidentified"}
        or not isinstance(drug_class, str)
        or not drug_class.strip()
        or drug_class.strip().casefold() in {"null", "unknown"}
        or not isinstance(use, str)
        or not use.strip()
        or len(generic_name) > 120
        or len(drug_class) > 120
        or len(use) > 500
        or len(re.split(r"(?<=[.!?])\s+", use.strip())) > 2
        or not is_safe_medicine_content(generic_name)
        or not is_safe_medicine_content(drug_class)
        or not is_safe_medicine_content(use)
        or not _SAFE_PURPOSE_LANGUAGE.search(use)
    ):
        return _not_found(name, cleaned_name, source="llm")

    # LLM guesses are never promoted to database-verified status.
    return {
        "name": name,
        "cleaned_name": cleaned_name,
        "generic_name": generic_name.strip(),
        "drug_class": drug_class.strip(),
        "use": use.strip(),
        "status": "possible_match",
        "confidence": "medium",
        "source": "llm",
        "note": _CONFIRM_NOTE,
        "matched_name": generic_name.strip(),
        "needs_confirmation": True,
    }


def explain_unknown_medicine(
    name: str,
    cleaned_name: str,
    *,
    other_medicines: list[str],
    conditions: list[str],
) -> dict:
    """Use Gemini only after local lookup fails, caching every provider attempt."""
    if not has_gemini_api_key():
        return _not_found(name, cleaned_name)

    from database.models import MedicineLookupCache, db

    cached = db.session.get(MedicineLookupCache, cleaned_name)
    if cached:
        cached_result = json.loads(cached.result_json)
        cached_result["name"] = name
        return cached_result

    user_prompt = (
        f'Medicine name from the report: "{name}"\n'
        f"Other medicines in the same prescription: {json.dumps(other_medicines, ensure_ascii=False)}\n"
        f"Conditions or symptoms mentioned in the report: {json.dumps(conditions, ensure_ascii=False)}\n\n"
        "Explain what this medicine is generally used for."
    )
    try:
        raw_response = generate_gemini_json(
            [{"text": user_prompt}],
            system_instruction=SYSTEM_PROMPT,
            temperature=0.2,
        )
        result = _parse_response(raw_response, name, cleaned_name)
    except (GeminiAnalysisError, TimeoutError):
        result = _not_found(name, cleaned_name, source="none")

    db.session.add(
        MedicineLookupCache(
            cleaned_name=cleaned_name,
            result_json=json.dumps(result, ensure_ascii=False),
        )
    )
    db.session.commit()
    return result
