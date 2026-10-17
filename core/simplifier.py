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
    d = load_dictionary()
    for category in ["diseases", "medicines", "lab_terms"]:
        terms = d.get(category, {})
        if term in terms:
            return terms[term]
    return None


def lookup_recommendation(term: str):
    """Search dictionary recommendations for a specific term, with alias support."""
    term = term.lower().strip().split(":", 1)[0].strip()
    recs = load_dictionary().get("recommendations", {})
    if term in recs:
        return recs[term]

    # Check common aliases
    aliases = {
        "diabetes": "diabetes mellitus",
        "type 2 diabetes": "diabetes mellitus",
        "type 1 diabetes": "diabetes mellitus",
        "prediabetes": "glucose",
        "blood sugar": "glucose",
        "fasting blood sugar": "glucose",
        "fbs": "glucose",
        "postprandial blood sugar": "glucose",
        "ppbs": "glucose",
        "random blood sugar": "glucose",
        "rbs": "glucose",
        "high blood pressure": "hypertension",
        "bp": "hypertension",
        "high bp": "hypertension",
        "cholesterol": "hyperlipidemia",
        "high cholesterol": "hyperlipidemia",
        "total cholesterol": "hyperlipidemia",
        "triglyceride": "triglycerides",
        "tg": "triglycerides",
        "hypertriglyceridemia": "triglycerides",
        "uric acid": "uric acid",
        "serum uric acid": "uric acid",
        "hyperuricemia": "uric acid",
        "gout": "uric acid",
        "gouty arthritis": "uric acid",
        "fatty liver": "fatty liver",
        "nafld": "fatty liver",
        "hepatic steatosis": "fatty liver",
        "sgot": "fatty liver",
        "sgpt": "fatty liver",
        "alt": "fatty liver",
        "ast": "fatty liver",
        "liver enzymes": "fatty liver",
        "vitamin d": "vitamin d",
        "vit d": "vitamin d",
        "vitamin d3": "vitamin d",
        "25-hydroxy vitamin d": "vitamin d",
        "vitamin b12": "vitamin b12",
        "vit b12": "vitamin b12",
        "cobalamin": "vitamin b12",
        "gerd": "gerd",
        "acid reflux": "gerd",
        "heartburn": "gerd",
        "gastric reflux": "gerd",
        "heart attack": "myocardial infarction",
        "kidney disease": "chronic kidney disease",
        "ckd": "chronic kidney disease",
        "renal failure": "chronic kidney disease",
        "serum creatinine": "creatinine",
        "bun": "chronic kidney disease",
        "blood urea nitrogen": "chronic kidney disease",
        "low iron": "anemia",
        "iron deficiency": "anemia",
        "iron deficiency anemia": "anemia",
        "thyroid": "hypothyroidism",
        "elevated tsh": "hypothyroidism",
        "low tsh": "hyperthyroidism",
        "cold": "cold and fever",
        "fever": "cold and fever",
        "common cold": "cold and fever",
        "viral fever": "cold and fever",
        "cough and cold": "cold and fever",
        "cold and cough": "cold and fever",
        "pyrexia": "cold and fever",
        "flu": "cold and fever",
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
    if not entities:
        return "No medical terms detected. Please consult your doctor."

    terms = {entity["text"].split(":", 1)[0].strip().lower() for entity in entities}
    if {"anxiety", "gastric"}.issubset(terms):
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

        if any(entity.get("label") in {"MEDICINE", "MEDICATION"} for entity in entities):
            summary += (
                "The prescription includes handwritten medicine names; confirm any unclear name or "
                "dose with your prescriber or pharmacist. Follow the prescription and do not change "
                "medicines based on this summary. "
            )

        if re.search(r"follow[\s-]*up[^\n]{0,30}(?:1|one)\s*month", text, re.IGNORECASE):
            summary += "The report asks you to follow up in one month."

        return f"{summary.strip()} Please consult your doctor for interpretation."

    term_texts = [entity["text"].split(":", 1)[0].strip() for entity in entities]
    unique_terms = []
    for t in term_texts:
        if t and t not in unique_terms:
            unique_terms.append(t)

    mentioned = ", ".join(unique_terms[:6])
    if len(unique_terms) > 6:
        mentioned += f", and {len(unique_terms) - 6} other findings"

    summary_parts = [
        f"The report mentions {mentioned}. These findings may need interpretation in clinical context."
    ]

    bp_match = re.search(r"\bBP\s*[:=\-]?\s*(\d{2,3})\s*/\s*(\d{2,3})\b", text, re.IGNORECASE)
    if bp_match:
        reading = f"{bp_match.group(1)}/{bp_match.group(2)}"
        summary_parts.append(
            f"It records a blood pressure of {reading}. One reading alone does not diagnose "
            "high blood pressure, but it is worth rechecking and discussing with your clinician."
        )

    has_medicines = any(
        entity.get("label") in {"MEDICINE", "MEDICATION"} for entity in entities
    )
    if has_medicines:
        summary_parts.append(
            "Medications are noted in your report; please confirm all instructions, dosages, "
            "and schedules with your doctor or pharmacist, and do not change medicines based on this summary."
        )

    if re.search(r"follow[\s-]*up[^\n]{0,30}(?:1|one)\s*month", text, re.IGNORECASE):
        summary_parts.append("The report asks you to follow up in one month.")
    elif re.search(r"follow[\s-]*up", text, re.IGNORECASE):
        summary_parts.append("The report includes follow-up guidance.")

    summary_parts.append("Please consult your doctor for interpretation.")
    return " ".join(summary_parts)


def generate_recommendations(
    entities: list,
    text: str = "",
    lab_results: list = None,
    use_ai_fallback: bool = True,
):
    """
    Generates personalized diet (food) and exercise recommendations based on
    detected medical conditions and abnormal laboratory findings.
    """
    by_condition = []
    seen_conditions = set()

    all_eat = []
    all_avoid = []
    all_exercise = []
    all_precautions = []

    # 1. Disease / Symptom / Condition Entity Matches
    for ent in entities:
        term_clean = ent["text"].lower().strip()
        label = ent.get("label", "")

        rec = lookup_recommendation(term_clean)
        if label not in {"DISEASE", "LAB_TERM", "SYMPTOM", "CONDITION"} and not rec:
            continue

        if term_clean in seen_conditions:
            continue
        seen_conditions.add(term_clean)

        if rec:
            cond_data = {
                "condition": ent["text"].title(),
                "source_flag": "Report Finding",
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

    # 2. Abnormal Lab Findings Integration (Flagged High / Low values)
    if lab_results is None and text:
        try:
            from core.lab_extractor import extract_lab_results
            lab_results = extract_lab_results(text)
        except Exception:
            lab_results = []

    for lab in (lab_results or []):
        status = str(lab.get("status") or "").capitalize()
        if status not in {"High", "Low"}:
            continue

        name_lower = str(lab.get("test_name", "")).strip().lower()
        target_key = None
        condition_title = None

        if any(g in name_lower for g in ["glucose", "sugar", "fbs", "rbs", "ppbs"]):
            if status == "High":
                target_key = "glucose"
                condition_title = f"{lab.get('test_name')} (Elevated)"
        elif "hba1c" in name_lower:
            if status == "High":
                target_key = "hba1c"
                condition_title = "HbA1c (Elevated / Diabetes Risk)"
        elif any(c in name_lower for c in ["cholesterol", "lipid"]):
            if status == "High":
                target_key = "hyperlipidemia"
                condition_title = f"{lab.get('test_name')} (Elevated)"
        elif "ldl" in name_lower:
            if status == "High":
                target_key = "ldl"
                condition_title = "LDL Cholesterol (Elevated)"
        elif "hdl" in name_lower:
            if status == "Low":
                target_key = "hdl"
                condition_title = "HDL Cholesterol (Low)"
        elif "triglyceride" in name_lower:
            if status == "High":
                target_key = "triglycerides"
                condition_title = "Triglycerides (Elevated)"
        elif "uric acid" in name_lower:
            if status == "High":
                target_key = "uric acid"
                condition_title = "Serum Uric Acid (Elevated / Gout Risk)"
        elif any(h in name_lower for h in ["hemoglobin", "haemoglobin"]):
            if status == "Low":
                target_key = "anemia"
                condition_title = "Hemoglobin (Low / Anemia)"
        elif "creatinine" in name_lower:
            if status == "High":
                target_key = "creatinine"
                condition_title = "Serum Creatinine (Elevated)"
        elif any(k in name_lower for k in ["bun", "urea"]):
            if status == "High":
                target_key = "chronic kidney disease"
                condition_title = "Blood Urea / Renal Marker (Elevated)"
        elif "tsh" in name_lower:
            if status == "High":
                target_key = "tsh"
                condition_title = "TSH (Elevated / Hypothyroid Trend)"
            elif status == "Low":
                target_key = "hyperthyroidism"
                condition_title = "TSH (Low / Hyperthyroid Trend)"
        elif "bilirubin" in name_lower:
            if status == "High":
                target_key = "bilirubin"
                condition_title = "Bilirubin (Elevated)"
        elif any(l in name_lower for l in ["sgot", "sgpt", "alt", "ast"]):
            if status == "High":
                target_key = "fatty liver"
                condition_title = f"{lab.get('test_name')} (Elevated Liver Enzyme)"
        elif "platelet" in name_lower:
            if status == "Low":
                target_key = "platelet count"
                condition_title = "Platelet Count (Low)"
        elif "wbc" in name_lower or "white blood cell" in name_lower:
            target_key = "wbc count"
            condition_title = f"WBC Count ({status})"
        elif any(e in name_lower for e in ["esr", "crp"]):
            if status == "High":
                target_key = "esr"
                condition_title = f"{lab.get('test_name')} (Elevated Inflammation)"

        if target_key and target_key not in seen_conditions:
            rec = lookup_recommendation(target_key)
            if rec:
                seen_conditions.add(target_key)
                cond_data = {
                    "condition": condition_title or target_key.title(),
                    "source_flag": f"{lab.get('test_name')}: {lab.get('value')} {lab.get('unit') or ''} ({status})",
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

    # 3. Blood Pressure in Text Detection
    bp_match = re.search(r"\bBP\s*[:=\-]?\s*(\d{2,3})\s*/\s*(\d{2,3})\b", text, re.IGNORECASE)
    if bp_match and "hypertension" not in seen_conditions and not any("hypertension" in c for c in seen_conditions):
        sys_bp, dia_bp = int(bp_match.group(1)), int(bp_match.group(2))
        if sys_bp >= 130 or dia_bp >= 85:
            rec = lookup_recommendation("hypertension")
            if rec:
                seen_conditions.add("hypertension")
                cond_data = {
                    "condition": f"Blood Pressure ({sys_bp}/{dia_bp} mmHg Elevated)",
                    "source_flag": f"BP {sys_bp}/{dia_bp} mmHg",
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

    # 4. Cold & Fever contextual detection (from text keywords, or medication combinations)
    has_cold_fever_text = bool(re.search(r"\b(cold\s*(?:and|&)?\s*fever|cold|fever|cough|flu|pyrexia|coryza)\b", text, re.IGNORECASE))

    t_lower = text.lower()
    med_names = [e.get("text", "").lower() for e in entities]
    has_fever_med = any(any(f in m for f in ["dolomi", "dolo", "paracetamol", "crocin", "calpol", "pacimol"]) for m in med_names) or any(f in t_lower for f in ["dolomi", "dolo", "paracetamol", "crocin", "calpol", "pacimol"])
    has_cold_med = any(any(c in m for c in ["cetzine", "cetirizine", "levocetirizine", "chlorpheniramine", "cold", "cough", "antihistamine"]) for m in med_names) or any(c in t_lower for c in ["cetzine", "cetirizine", "levocetirizine", "chlorpheniramine", "cold", "cough"])

    if (has_cold_fever_text or (has_fever_med and has_cold_med)) and not any(c in seen_conditions for c in ["cold and fever", "cold", "fever"]):
        rec = lookup_recommendation("cold and fever")
        if rec:
            seen_conditions.add("cold and fever")
            cond_data = {
                "condition": "Cold and Fever",
                "source_flag": "Symptom / Medication Match",
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
    entities = extract_entities(text)

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

    recommendations = generate_recommendations(entities, text=text, use_ai_fallback=use_ai_fallback)

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