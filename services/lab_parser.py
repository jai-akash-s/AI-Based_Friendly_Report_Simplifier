"""Parse common laboratory values and classify them against reference ranges."""

import json
import re
from pathlib import Path


_CATALOG_PATH = Path(__file__).with_name("common_lab_tests.json")
_RANGE_PATTERN = re.compile(
    r"(?P<low>\d+(?:[.,]\d+)?)\s*(?:-|–|—|to)\s*"
    r"(?P<high>\d+(?:[.,]\d+)?)(?:\s*(?P<unit>[A-Za-zµμ/%^0-9]+(?:\s*/\s*[A-Za-zµμ0-9]+)?))?",
    re.IGNORECASE,
)
_NUMBER_PATTERN = re.compile(r"(?P<operator>[<>]?)\s*(?P<value>\d+(?:[.,]\d+)?)")
_UNIT_PATTERN = re.compile(
    r"^(?:mg\s*/\s*dL|mmol\s*/\s*L|g\s*/\s*dL|g\s*/\s*L|"
    r"mIU\s*/\s*L|uIU\s*/\s*mL|10\^?[36]\s*/\s*(?:uL|µL|μL)|"
    r"10\^?[36]\s*/\s*L|[A-Za-zµμ%]+(?:\s*/\s*[A-Za-zµμ0-9]+)?)",
    re.IGNORECASE,
)
_RANGE_LABEL_PATTERN = re.compile(r"\b(?:reference|ref(?:erence)?\.?)\s*range\b", re.I)


def _load_catalog():
    with _CATALOG_PATH.open(encoding="utf-8") as catalog_file:
        catalog = json.load(catalog_file)
    if not isinstance(catalog, dict) or not isinstance(catalog.get("tests"), list):
        raise ValueError("The common laboratory test catalog has an invalid format.")
    return catalog["tests"]


_TESTS = _load_catalog()
_ALIASES = sorted(
    (
        (alias, test)
        for test in _TESTS
        for alias in test["aliases"]
    ),
    key=lambda item: len(item[0]),
    reverse=True,
)


_SINGLE_BOUND_RANGE_PATTERN = re.compile(
    r"(?P<op>[<>]=?)\s*(?P<bound>\d+(?:[.,]\d+)?)(?:\s*(?P<unit>[A-Za-zµμ/%^0-9]+(?:\s*/\s*[A-Za-zµμ0-9]+)?))?",
    re.IGNORECASE,
)


def _number(value):
    return float(value.replace(",", "."))


def _find_range(text):
    match = _RANGE_PATTERN.search(text)
    if match:
        return {
            "low": _number(match.group("low")),
            "high": _number(match.group("high")),
            "unit": (match.group("unit") or "").strip() or None,
            "source": "report",
        }
    single_match = _SINGLE_BOUND_RANGE_PATTERN.search(text)
    if single_match:
        bound = _number(single_match.group("bound"))
        op = single_match.group("op")
        unit = (single_match.group("unit") or "").strip() or None
        if op.startswith("<"):
            return {"low": 0.0, "high": bound, "unit": unit, "source": "report"}
        elif op.startswith(">"):
            return {"low": bound, "high": float("inf"), "unit": unit, "source": "report"}
    return None


def _test_match(line):
    for alias, test in _ALIASES:
        match = re.search(rf"(?<![\w]){re.escape(alias)}(?![\w])", line, re.IGNORECASE)
        if match:
            remainder = line[match.end():].lstrip(" :\t=|,-")
            value_match = _NUMBER_PATTERN.match(remainder)
            if value_match:
                return test, remainder, value_match
    return None


def _classify(value, reference_range):
    if value < reference_range["low"]:
        return "Low"
    if value > reference_range["high"]:
        return "High"
    return "Normal"


def parse_lab_results(text):
    """Extract known test results; use report ranges before adult defaults."""
    results = []
    for line in (text or "").splitlines():
        detected = _test_match(line)
        if not detected:
            continue

        test, remainder, value_match = detected
        value = _number(value_match.group("value"))
        tail = remainder[value_match.end():].strip()
        range_match = _find_range(tail)

        unit_match = _UNIT_PATTERN.match(tail.lstrip(" ,;("))
        unit = unit_match.group(0).strip() if unit_match else test.get("unit")
        if range_match:
            if range_match["unit"]:
                unit = range_match["unit"]
        else:
            reference_label = _RANGE_LABEL_PATTERN.search(tail)
            if reference_label:
                range_match = _find_range(tail[reference_label.end():])

        if range_match is None:
            reference_range = {
                "low": test["low"],
                "high": test["high"],
                "unit": test.get("unit"),
                "source": "default",
            }
        else:
            reference_range = range_match

        status = _classify(value, reference_range)
        meaning = (
            test["low_meaning"] if status == "Low"
            else test["high_meaning"] if status == "High"
            else None
        )
        results.append({
            "test_name": test["name"],
            "value": value,
            "unit": unit,
            "reference_range": reference_range,
            "status": status,
            "meaning": meaning,
        })

    return results
