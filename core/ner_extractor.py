"""
ner_extractor.py
----------------
Finds medical terms (diseases, medicines, lab values) inside a report's text.

How it works (in plain terms):
1. We load our medical dictionary (data/medical_dictionary.json).
2. We build "patterns" from every term in that dictionary -- basically telling
   spaCy "if you see this exact phrase, tag it as DISEASE / MEDICINE / LAB_TERM".
3. spaCy's EntityRuler scans the report text and tags any matches it finds.
4. We return a clean list of {text, label} for every match, de-duplicated.

Why EntityRuler instead of a generic spaCy model?
General spaCy models (en_core_web_sm) are trained on news text, not medical text,
so they don't reliably recognize "hyperlipidemia" as a disease. EntityRuler lets us
guarantee detection for any term already in our dictionary, and we can keep growing
the dictionary over time (as per your project's pending-work list).
"""

import json
import re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
DICT_PATH = BASE_DIR / "data" / "medical_dictionary.json"

LABEL_MAP = {
    "diseases": "DISEASE",
    "medicines": "MEDICINE",
    "lab_terms": "LAB_TERM",
}


def load_dictionary():
    if not DICT_PATH.exists():
        raise FileNotFoundError(f"Dictionary file not found: {DICT_PATH}")
    with open(DICT_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def build_nlp():
    """Build a lightweight dictionary matcher without native NLP dependencies."""
    dictionary = load_dictionary()
    patterns = []
    for category, label in LABEL_MAP.items():
        terms = dictionary.get(category, {})
        for term in terms.keys():
            patterns.append((term, label))
    patterns.sort(key=lambda item: len(item[0]), reverse=True)
    expression = "|".join(re.escape(term) for term, _ in patterns)
    return re.compile(rf"(?<!\w)({expression})(?!\w)", re.IGNORECASE), patterns


def extract_entities(text: str, nlp=None):
    """
    Returns a de-duplicated list of dicts like:
    {"text": "metformin", "label": "MEDICINE"}
    """
    if nlp is None:
        nlp = build_nlp()

    matcher, patterns = nlp
    seen = set()
    results = []
    labels = {term.lower(): label for term, label in patterns}
    for match in matcher.finditer(text):
        entity_text = match.group(1).strip()
        label = labels[entity_text.lower()]
        key = (entity_text.lower(), label)
        if key not in seen:
            seen.add(key)
            results.append({"text": entity_text, "label": label})
    return results


def extract_lab_values(text: str):
    """
    Bonus helper: pulls out simple 'Term: number unit' patterns often found in reports,
    e.g. 'HbA1c: 7.2 %' or 'Creatinine - 1.4 mg/dL'.
    This is regex-based (not NLP) because lab value formatting is very structured.
    """
    pattern = r"([A-Za-z0-9 ]{2,30})[:\-]\s*([\d.]+)\s*([a-zA-Z%/]*)"
    matches = re.findall(pattern, text)
    return [
        {"term": m[0].strip(), "value": m[1].strip(), "unit": m[2].strip()}
        for m in matches
    ]


if __name__ == "__main__":
    sample_report = """
    Patient presents with a history of Hypertension and Diabetes Mellitus.
    Current medications include Metformin and Atorvastatin.
    Lab results: HbA1c: 7.8 %, Creatinine: 1.3 mg/dL, LDL: 145 mg/dL.
    Impression: Poorly controlled Diabetes Mellitus with early signs of
    Chronic Kidney Disease.
    """

    print("=== Entities found ===")
    for ent in extract_entities(sample_report):
        print(f"  {ent['text']:30s} -> {ent['label']}")

    print("\n=== Lab values found (regex) ===")
    for lv in extract_lab_values(sample_report):
        print(f"  {lv}")