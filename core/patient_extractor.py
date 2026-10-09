import re
from typing import Any


NAME_PATTERNS = (
    r"(?:patient\s*name|full\s*name|name)\s*[:\-]\s*"
    r"([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*?)"
    r"(?=\s*(?:\n|,?\s*(?:Age|Sex|Gender|Blood(?:\s+Group)?|Phone|DOB|Date\s+of\s+Birth)|$))",
)


def _clean_name(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = re.sub(r"\s+", " ", value.strip())
    return cleaned or None


def _find_first(patterns: list[str], text: str) -> str | None:
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return None


def extract_patient_info(text: str) -> dict[str, Any]:
    """Extract common patient demographics from a free-form medical report."""
    if not text or not isinstance(text, str):
        return {}

    normalized = text.strip()
    if not normalized:
        return {}

    full_name = None
    for pattern in NAME_PATTERNS:
        match = re.search(pattern, normalized, re.IGNORECASE)
        if match:
            full_name = _clean_name(match.group(1))
            break

    # Fallback: capture a typical capitalized name from the beginning of the text.
    if not full_name:
        for candidate in re.findall(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b", normalized):
            if candidate.lower() in {"bp", "spo2", "rx", "t.", "pharmacy"}:
                continue
            if re.search(r"\b(?:Age|Sex|Gender|Blood|Phone|DOB)\b", candidate, re.IGNORECASE):
                continue
            full_name = candidate
            break

    match_age = re.search(r"(?:age|years?)\s*[:\-]?\s*(\d{1,3})\b", normalized, re.IGNORECASE)
    age = int(match_age.group(1)) if match_age else None

    gender = None
    gender_match = re.search(r"(?:sex|gender)\s*[:\-]?\s*(male|female|m|f)", normalized, re.IGNORECASE)
    if gender_match:
        raw = gender_match.group(1).lower()
        gender = "Male" if raw in {"male", "m"} else "Female" if raw in {"female", "f"} else raw.title()

    blood_group = None
    blood_match = re.search(r"(?:blood\s*(?:group|type)|bld|bg)\s*[:\-]?\s*([A-Z]{1,3}[+-])", normalized, re.IGNORECASE)
    if blood_match:
        blood_group = blood_match.group(1).upper()

    phone = None
    phone_match = re.search(r"(?:phone|mobile|contact)\s*[:\-]?\s*(\+?\d[\d\s().-]{7,}\d)", normalized, re.IGNORECASE)
    if phone_match:
        phone = re.sub(r"\s+", " ", phone_match.group(1)).strip()

    email = None
    email_match = re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", normalized)
    if email_match:
        email = email_match.group(0).strip()

    result: dict[str, Any] = {}
    if full_name:
        result["full_name"] = full_name
    if age is not None:
        result["age"] = age
    if gender:
        result["gender"] = gender
    if blood_group:
        result["blood_group"] = blood_group
    if phone:
        result["contact_phone"] = phone
    if email:
        result["contact_email"] = email
    return result
