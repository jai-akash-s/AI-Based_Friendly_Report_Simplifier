"""Normalize medicine names for local and cached lookup."""

import json
import re
from pathlib import Path

from rapidfuzz import fuzz, process

from services.medical_safety import is_safe_medicine_content


_PREFIX_PATTERN = re.compile(
    r"^\s*(?:(?:tab(?:let)?|cap(?:sule)?|syp|syrup|inj(?:ection)?|t)"
    r"(?=\s|\.|$)\.?\s*)+",
    re.IGNORECASE,
)
_DOSAGE_PATTERN = re.compile(
    r"\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|kg|ml|mL|iu|units?|%)\b"
    r"|\b\d+(?:\.\d+)?(?:d|ds|sr|xr|cr|er)\b"
    r"|\b\d+(?:\.\d+)?\b",
    re.IGNORECASE,
)
_CATALOG_PATH = Path(__file__).resolve().parents[1] / "data" / "medicines.json"


def clean_name(raw: str | None) -> str:
    """Remove common prescription prefixes, strengths, and punctuation."""
    if not raw:
        return ""

    cleaned = _PREFIX_PATTERN.sub("", str(raw).lower())
    cleaned = _DOSAGE_PATTERN.sub(" ", cleaned)
    cleaned = re.sub(r"[^a-z0-9\s]", " ", cleaned)
    return " ".join(cleaned.split())


def load_medicine_catalog() -> dict:
    """Load the bundled medicine catalog and build normalized generic keys."""
    with _CATALOG_PATH.open(encoding="utf-8") as catalog_file:
        catalog = json.load(catalog_file)
    if not isinstance(catalog, dict):
        raise ValueError("Medicine catalog must be a JSON object.")

    normalized_catalog = {}
    for generic_name, details in catalog.items():
        if not isinstance(details, dict):
            raise ValueError(f"Invalid catalog entry for {generic_name!r}.")
        normalized_name = clean_name(generic_name)
        if not normalized_name:
            raise ValueError(f"Invalid generic medicine name: {generic_name!r}.")
        normalized_catalog[normalized_name] = details
    return normalized_catalog


def build_brand_index(catalog: dict) -> dict[str, str]:
    """Map normalized brand names to their normalized generic names."""
    brand_targets = {}
    for generic_name, details in catalog.items():
        brands = details.get("brands", [])
        if not isinstance(brands, list):
            raise ValueError(f"Brands for {generic_name!r} must be a list.")
        for brand in brands:
            normalized_brand = clean_name(brand)
            if normalized_brand:
                brand_targets.setdefault(normalized_brand, set()).add(generic_name)
    return {
        brand: next(iter(generic_names))
        for brand, generic_names in brand_targets.items()
        if len(generic_names) == 1
    }


def _find_ambiguous_brands(catalog: dict) -> set[str]:
    brand_targets = {}
    for generic_name, details in catalog.items():
        for brand in details.get("brands", []):
            normalized_brand = clean_name(brand)
            if normalized_brand:
                brand_targets.setdefault(normalized_brand, set()).add(generic_name)
    return {
        brand for brand, generic_names in brand_targets.items()
        if len(generic_names) > 1
    }


MEDICINE_CATALOG = load_medicine_catalog()
BRAND_INDEX = build_brand_index(MEDICINE_CATALOG)
AMBIGUOUS_BRANDS = _find_ambiguous_brands(MEDICINE_CATALOG)
_BUNDLED_MEDICINE_CATALOG = {
    generic_name: {**details, "brands": list(details.get("brands", []))}
    for generic_name, details in MEDICINE_CATALOG.items()
}


def refresh_medicine_index() -> None:
    """Merge entries in the app SQLite table and rebuild the startup indexes."""
    from database.models import MedicineCatalogEntry

    MEDICINE_CATALOG.clear()
    MEDICINE_CATALOG.update(
        {
            generic_name: {**details, "brands": list(details.get("brands", []))}
            for generic_name, details in _BUNDLED_MEDICINE_CATALOG.items()
        }
    )
    for entry in MedicineCatalogEntry.query.order_by(MedicineCatalogEntry.generic_name):
        generic_name = clean_name(entry.generic_name)
        if not generic_name:
            continue
        try:
            brands = json.loads(entry.brands)
        except (TypeError, json.JSONDecodeError):
            raise ValueError(
                f"Invalid brands JSON in medicines table for {entry.generic_name!r}."
            ) from None
        if not isinstance(brands, list) or not all(isinstance(brand, str) for brand in brands):
            raise ValueError(
                f"Invalid brands list in medicines table for {entry.generic_name!r}."
            )
        details = MEDICINE_CATALOG.setdefault(
            generic_name,
            {
                "class": entry.drug_class,
                "use": entry.use,
                "brands": [],
            },
        )
        known_brands = {brand.casefold() for brand in details.get("brands", [])}
        for brand in brands:
            if brand.casefold() not in known_brands:
                details["brands"].append(brand)
                known_brands.add(brand.casefold())

    global BRAND_INDEX, AMBIGUOUS_BRANDS
    BRAND_INDEX = build_brand_index(MEDICINE_CATALOG)
    AMBIGUOUS_BRANDS = _find_ambiguous_brands(MEDICINE_CATALOG)


def _result(
    name: str,
    cleaned_name: str,
    *,
    status: str,
    generic_name: str | None = None,
    drug_class: str | None = None,
    use: str | None = None,
    confidence: str = "low",
    source: str = "none",
    note: str,
    matched_name: str | None = None,
) -> dict:
    return {
        "name": name,
        "cleaned_name": cleaned_name,
        "generic_name": generic_name,
        "drug_class": drug_class,
        "use": use,
        "status": status,
        "confidence": confidence,
        "source": source,
        "note": note,
        "matched_name": matched_name,
        "needs_confirmation": status != "verified",
    }


def lookup_medicine(
    raw_name: str,
    other_medicines: list[str] | None = None,
    conditions: list[str] | None = None,
) -> dict:
    """Resolve known generic or brand names without inferring unknown uses."""
    name = str(raw_name or "").strip()
    cleaned = clean_name(name)
    if not cleaned:
        return _result(
            name, cleaned, status="not_found",
            note="Could not identify this medicine name. Please confirm it with a doctor or pharmacist.",
        )

    if cleaned in AMBIGUOUS_BRANDS:
        return _result(
            name, cleaned, status="not_found",
            note="This brand name may refer to more than one medicine. Please confirm it with a doctor or pharmacist.",
        )

    generic_name = cleaned if cleaned in MEDICINE_CATALOG else BRAND_INDEX.get(cleaned)
    if generic_name:
        details = MEDICINE_CATALOG[generic_name]
        if not all(
            is_safe_medicine_content(details.get(field))
            for field in ("class", "use")
        ):
            return _result(
                name, cleaned, status="not_found",
                note="Could not safely verify the use of this medicine. Please ask your doctor or pharmacist.",
            )
        return _result(
            name,
            cleaned,
            status="verified",
            generic_name=generic_name.title(),
            drug_class=details["class"],
            use=details["use"],
            confidence="high",
            source="database",
            note="Please confirm this medicine and its purpose with your doctor or pharmacist.",
            matched_name=generic_name.title(),
        )

    candidates = {
        generic_name: generic_name for generic_name in MEDICINE_CATALOG
    }
    candidates.update(BRAND_INDEX)
    match = process.extractOne(cleaned, candidates.keys(), scorer=fuzz.WRatio)
    if match and match[1] >= 85:
        matched_key = match[0]
        generic_name = candidates[matched_key]
        details = MEDICINE_CATALOG[generic_name]
        if not all(
            is_safe_medicine_content(details.get(field))
            for field in ("class", "use")
        ):
            return _result(
                name, cleaned, status="not_found",
                note="Could not safely verify the use of this medicine. Please ask your doctor or pharmacist.",
            )
        return _result(
            name,
            cleaned,
            status="possible_match",
            generic_name=generic_name.title(),
            drug_class=details["class"],
            use=details["use"],
            confidence="medium",
            source="database",
            note="Please confirm whether this is the intended medicine with your doctor or pharmacist.",
            matched_name=generic_name.title(),
        )

    from services.medicine_explainer import explain_unknown_medicine

    return explain_unknown_medicine(
        name,
        cleaned,
        other_medicines=other_medicines or [],
        conditions=conditions or [],
    )
