"""Extract laboratory values without inventing reference ranges."""

import re


LAB_PATTERNS = {
    "hba1c": re.compile(r"\b(?:HbA1c|A1c)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*%", re.I),
    "ldl": re.compile(r"\bLDL\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(mg/dL|mmol/L)?", re.I),
    "hdl": re.compile(r"\bHDL\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(mg/dL|mmol/L)?", re.I),
    "creatinine": re.compile(r"\bCreatinine\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(mg/dL|umol/L)?", re.I),
    "tsh": re.compile(r"\bTSH\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(mIU/L|uIU/mL)?", re.I),
}

REFERENCE_PATTERN = re.compile(
    r"(?:reference|ref(?:erence)?\s*range)\s*[:=]?\s*([\d.]+\s*(?:-|to)\s*[\d.]+\s*(?:[%A-Za-z/]+)?)",
    re.I,
)


def _status(value, reference):
    if not reference:
        return "Unknown"
    match = re.search(r"([\d.]+)\s*(?:-|to)\s*([\d.]+)", reference)
    if not match:
        return "Unknown"
    low, high = float(match.group(1)), float(match.group(2))
    number = float(value)
    if number < low:
        return "Low"
    if number > high:
        return "High"
    return "Normal"


def extract_lab_results(text):
    """Return detected values and report-provided reference ranges only."""
    results = []
    reference = REFERENCE_PATTERN.search(text)
    reference_text = reference.group(1) if reference else None
    for name, pattern in LAB_PATTERNS.items():
        match = pattern.search(text)
        if not match:
            continue
        unit = match.group(2) if match.lastindex and match.lastindex >= 2 else "%"
        results.append({
            "test_name": name.upper() if name != "hba1c" else "HbA1c",
            "value": match.group(1),
            "unit": unit or "Unknown",
            "reference_range": reference_text or "Reference range unavailable",
            "status": _status(match.group(1), reference_text),
        })
    return results
