"""
simplifier.py
-------------
Takes the entities found by ner_extractor.py and turns them into plain-English
explanations, then builds a full simplified report.

Strategy (2 layers, cheapest/most-reliable first):
1. DICTIONARY LOOKUP (fast, 100% accurate, no AI model needed):
   If the term exists in our medical_dictionary.json, just use that explanation.
   This covers most common terms and is instant.

2. AI FALLBACK (Hugging Face Transformers) for terms NOT in our dictionary:
   We use a small pretrained model to paraphrase/simplify the sentence
   containing the unknown term, so the system doesn't just say "unknown".

This mirrors exactly what your Gantt chart / architecture slide describes:
"Detected Entity -> Lookup/Model -> Simplified Text"
"""

import re

from .ner_extractor import build_nlp, extract_entities, load_dictionary
from services.medical_safety import enforce_safe_explanation, enforce_safe_summary

_dictionary = load_dictionary()
_nlp = build_nlp()

# Lazy-loaded so the dictionary-only path stays fast and doesn't need
# to download a transformer model unless it's actually needed.
_hf_pipeline = None


def _get_hf_pipeline():
    global _hf_pipeline
    if _hf_pipeline is None:
        from transformers import pipeline
        # A small, general-purpose text2text model. Swap this out later for a
        # model fine-tuned on medical text simplification (see your Gantt chart
        # week 7-9 task) once you have training data.
        _hf_pipeline = pipeline("text2text-generation", model="google/flan-t5-small")
    return _hf_pipeline


def lookup_term(term: str):
    """Search all dictionary categories for a term, return explanation or None."""
    term = term.lower().strip().split(":", 1)[0].strip()
    for category in ["diseases", "medicines", "lab_terms"]:
        terms = _dictionary.get(category, {})
        if term in terms:
            return terms[term]
    return None


def lookup_recommendation(term: str):
    """Search dictionary recommendations for a specific term, with alias support."""
    term = term.lower().strip().split(":", 1)[0].strip()
    recs = _dictionary.get("recommendations", {})
    if term in recs:
        return recs[term]

    # Check common aliases
    aliases = {
        "diabetes": "diabetes mellitus",
        "high blood pressure": "hypertension",
        "cholesterol": "hyperlipidemia",
        "high cholesterol": "hyperlipidemia",
        "heart attack": "myocardial infarction",
        "kidney disease": "chronic kidney disease",
        "low iron": "anemia",
        "thyroid": "hypothyroidism"
    }
    target = aliases.get(term)
    if target and target in recs:
        return recs[target]

    # Partial substring check
    for key, val in recs.items():
        if key in term or term in key:
            return val

    return None


def ai_simplify(term: str, context_sentence: str):
    """Fallback: ask a language model to explain an unknown medical term simply."""
    pipe = _get_hf_pipeline()
    prompt = (
        f"Define the medical term '{term}' in one simple sentence for a patient. "
        "This is a definition, not confirmation that the patient has a condition. "
        "Do not diagnose, prescribe, or recommend treatment. Use cautious wording, "
        "such as 'may relate to', and advise consulting a doctor. "
        f"Context: {context_sentence}"
    )
    result = pipe(prompt, max_new_tokens=40)
    return result[0]["generated_text"].strip()


def _build_plain_language_summary(text: str, entities: list) -> str | None:
    terms = {entity["text"].split(":", 1)[0].strip().lower() for entity in entities}
    if not {"anxiety", "gastric"}.issubset(terms):
        return None

    summary = (
        "Your report mentions anxiety and gastric (stomach-related) concerns. "
    )
    bp_match = re.search(r"\bBP\s*[:=\-]?\s*(\d{2,3})\s*/\s*(\d{2,3})\b", text, re.IGNORECASE)
    if bp_match:
        reading = f"{bp_match.group(1)}/{bp_match.group(2)}"
        summary += (
            f"It records a blood pressure of {reading}. One reading alone does not diagnose "
            "high blood pressure, but it is worth rechecking and discussing with your clinician. "
        )

    if any(entity["label"] in {"MEDICINE", "MEDICATION"} for entity in entities):
        summary += (
            "The prescription includes handwritten medicine names; confirm any unclear name or "
            "dose with your prescriber or pharmacist. Follow the prescription and do not change "
            "medicines based on this summary. "
        )

    if re.search(r"follow[\s-]*up[^\n]{0,30}(?:1|one)\s*month", text, re.IGNORECASE):
        summary += "The report asks you to follow up in one month."

    return f"{summary.strip()} Please consult your doctor for interpretation."


def generate_recommendations(entities: list, use_ai_fallback: bool = True):
    """
    Generates personalized diet (food) and exercise recommendations based on
    detected medical conditions and lab findings.
    """
    by_condition = []
    seen_conditions = set()

    all_eat = []
    all_avoid = []
    all_exercise = []
    all_precautions = []

    for ent in entities:
        term_clean = ent["text"].lower().strip()
        label = ent["label"]

        if label not in {"DISEASE", "LAB_TERM"}:
            continue

        if term_clean in seen_conditions:
            continue
        seen_conditions.add(term_clean)

        rec = lookup_recommendation(term_clean)

        if rec:
            cond_data = {
                "condition": ent["text"].title(),
                "foods_to_eat": rec.get("foods_to_eat", []),
                "foods_to_avoid": rec.get("foods_to_avoid", []),
                "recommended_exercise": rec.get("recommended_exercise", []),
                "exercise_precautions": rec.get("exercise_precautions", "")
            }
            by_condition.append(cond_data)
            all_eat.extend(rec.get("foods_to_eat", []))
            all_avoid.extend(rec.get("foods_to_avoid", []))
            all_exercise.extend(rec.get("recommended_exercise", []))
            if rec.get("exercise_precautions"):
                all_precautions.append(rec["exercise_precautions"])
    def _dedupe(lst):
        seen = set()
        res = []
        for item in lst:
            if item and item not in seen:
                seen.add(item)
                res.append(item)
        return res

    if not by_condition:
        all_eat = ["Fresh fruits and vegetables", "Whole grains and legumes", "Adequate daily water intake"]
        all_avoid = ["Excessive sodium and refined sugars", "Deep-fried and heavily processed foods"]
        all_exercise = ["30 minutes of moderate physical activity (like walking) 5 days a week"]
        all_precautions = ["Listen to your body and rest when tired."]

    return {
        "by_condition": by_condition,
        "aggregated": {
            "foods_to_eat": _dedupe(all_eat),
            "foods_to_avoid": _dedupe(all_avoid),
            "recommended_exercise": _dedupe(all_exercise),
            "general_precautions": _dedupe(all_precautions)
        },
        "disclaimer": (
            "General lifestyle information only, not a diagnosis or treatment plan. "
            "Please consult your doctor before changing diet, medication, or activity."
        )
    }


def simplify_report(text: str, use_ai_fallback: bool = True):
    """
    Main entry point. Returns a dict:
    {
        "original_text": ...,
        "entities": [ {text, label, explanation, source}, ... ],
        "simplified_summary": "...",
        "recommendations": { ... }
    }
    """
    entities = extract_entities(text, nlp=_nlp)

    enriched = []
    medication_detected = False
    for ent in entities:
        is_medicine = ent["label"] in {"MEDICINE", "MEDICATION"}
        explanation = "" if is_medicine else lookup_term(ent["text"])
        source = "medicine_lookup_pending" if is_medicine else "dictionary"
        confidence = "Low" if is_medicine else "High"
        if is_medicine:
            medication_detected = True
        if explanation is None:
            if use_ai_fallback:
                explanation = ai_simplify(ent["text"], text)
                source = "ai_model"
                confidence = "Moderate"
            else:
                explanation = "No simple explanation available yet for this term."
                source = "not_found"
                confidence = "Low"

        enriched.append({
            "text": ent["text"],
            "label": ent["label"],
            "explanation": explanation,
            "source": source,
            "confidence": confidence,
        })

    summary_lines = [
        f"The report mentions {entity['text']}. This may need interpretation in context. "
        "Please consult your doctor."
        for entity in enriched
    ]
    simplified_summary = _build_plain_language_summary(text, entities)
    if simplified_summary is None:
        simplified_summary = "\n".join(summary_lines) if summary_lines else "No medical terms detected."
    simplified_summary = enforce_safe_summary(simplified_summary, enriched)
    for entity in enriched:
        if entity["label"] not in {"MEDICINE", "MEDICATION"}:
            entity["explanation"] = enforce_safe_explanation(entity["explanation"], entity["text"])

    recommendations = generate_recommendations(entities, use_ai_fallback=use_ai_fallback)

    return {
        "original_text": text.strip(),
        "entities": enriched,
        "simplified_summary": simplified_summary,
        "recommendations": recommendations,
        "safety": {
            "medication_warning": medication_detected,
            "message": "Do not start, stop, or change medication based only on this explanation. Consult your doctor or pharmacist." if medication_detected else None,
        },
    }


if __name__ == "__main__":
    sample_report = """
    Patient presents with a history of Hypertension and Diabetes Mellitus.
    Current medications include Metformin and Atorvastatin.
    Lab results: HbA1c: 7.8%, Creatinine: 1.3 mg/dL, LDL: 145 mg/dL.
    Impression: Poorly controlled Diabetes Mellitus with early signs of
    Chronic Kidney Disease.
    """

    result = simplify_report(sample_report, use_ai_fallback=False)
    print("=== SIMPLIFIED REPORT (dictionary-only) ===")
    print(result["simplified_summary"])
    print("\n=== RECOMMENDATIONS ===")
    import json
    print(json.dumps(result["recommendations"], indent=2))