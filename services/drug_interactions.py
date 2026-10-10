"""Educational drug-drug interaction checker for multi-medicine reports.

This module provides cautious, educational discussion prompts for patients taking
multiple medications, strictly framed as questions for their healthcare team.
It never advises stopping, starting, or changing dosages.
"""

import re
from rapidfuzz import fuzz

# Bundled catalog of well-established drug pairs that clinicians routinely monitor
KNOWN_INTERACTIONS = [
    {
        "drugs": [("aspirin", "clopidogrel"), ("ibuprofen", "naproxen", "diclofenac", "piroxicam", "meloxicam")],
        "title": "Antiplatelet / Blood Thinner + NSAID Pain Reliever",
        "severity": "Moderate",
        "description": "Taking blood thinners alongside common NSAID pain relievers can increase the chance of stomach irritation or bleeding.",
        "doctor_prompt": "Are these pain relievers safe with my blood thinner, or is an alternative (like paracetamol) better for me?",
    },
    {
        "drugs": [("metformin",), ("glimepiride", "gliclazide", "glipizide", "insulin")],
        "title": "Combined Blood Sugar Lowering Medications",
        "severity": "Caution",
        "description": "Using multiple diabetes medications works well to lower blood sugar, but may occasionally cause low blood sugar (hypoglycemia).",
        "doctor_prompt": "What symptoms of low blood sugar should I watch for, and what should I do if they occur?",
    },
    {
        "drugs": [("atorvastatin", "rosuvastatin", "simvastatin"), ("fenofibrate", "gemfibrozil")],
        "title": "Statin + Fibrate (Cholesterol Medications)",
        "severity": "Caution",
        "description": "Combining two cholesterol-lowering medicines can occasionally increase the chance of muscle aches or soreness.",
        "doctor_prompt": "Should I be monitoring for unexplained muscle soreness or stiffness while taking these cholesterol medications?",
    },
    {
        "drugs": [("telmisartan", "losartan", "ramipril", "enalapril", "lisinopril"), ("spironolactone", "potassium")],
        "title": "Blood Pressure Medication + Potassium / Diuretic",
        "severity": "Moderate",
        "description": "Both of these medications can raise potassium levels in the blood, which doctors typically check with a periodic blood test.",
        "doctor_prompt": "Do I need routine electrolyte or potassium blood tests while taking these medications together?",
    },
    {
        "drugs": [("levothyroxine", "thyroxine"), ("calcium", "iron", "ferrous sulfate", "antacid", "omeprazole", "pantoprazole")],
        "title": "Thyroid Hormone + Mineral / Antacid Supplement",
        "severity": "Caution",
        "description": "Calcium, iron supplements, and antacids can bind to thyroid medicine in the stomach and reduce how much is absorbed.",
        "doctor_prompt": "Should I space my thyroid medication by 2 to 4 hours from any iron or calcium supplements?",
    },
    {
        "drugs": [("warfarin",), ("aspirin", "paracetamol", "antibiotic", "ciprofloxacin", "azithromycin")],
        "title": "Warfarin + Interacting Agent",
        "severity": "Important",
        "description": "Warfarin levels and INR clotting time can fluctuate when combined with antibiotics or pain relievers.",
        "doctor_prompt": "Does my INR or blood clotting time need to be rechecked after starting or finishing this medication?",
    },
    {
        "drugs": [("metoprolol", "atenolol", "bisoprolol", "propranolol"), ("verapamil", "diltiazem", "amlodipine")],
        "title": "Beta-Blocker + Calcium Channel Blocker",
        "severity": "Caution",
        "description": "Both of these medications slow the heart rate and lower blood pressure; taking them together is common but requires blood pressure monitoring.",
        "doctor_prompt": "What target pulse and blood pressure range should I look for while taking these together?",
    },
    {
        "drugs": [("omeprazole", "pantoprazole", "rabeprazole", "esomeprazole"), ("iron", "ferrous ascorbate", "vitamin b12")],
        "title": "Acid Reducer + Iron / B12 Supplement",
        "severity": "Caution",
        "description": "Long-term reduction in stomach acid can slightly decrease the natural absorption of dietary iron and vitamin B12.",
        "doctor_prompt": "Should I periodically check my iron or vitamin B12 levels while on acid-suppressing medication?",
    },
]


def _match_drug(name: str, drug_list: tuple[str, ...]) -> bool:
    clean = re.sub(r"[^a-z0-9\s]", "", (name or "").lower()).strip()
    if not clean:
        return False
    for target in drug_list:
        if target in clean or clean in target:
            return True
        if fuzz.partial_ratio(clean, target) >= 88:
            return True
    return False


def check_drug_interactions(medicine_names: list[str]) -> list[dict]:
    """Check a list of detected medicines for potential pairs of educational interest."""
    if not medicine_names or len(medicine_names) < 2:
        return []

    detected_interactions = []
    seen_keys = set()

    for item in KNOWN_INTERACTIONS:
        group1, group2 = item["drugs"][0], item["drugs"][1]
        matches_g1 = [m for m in medicine_names if _match_drug(m, group1)]
        matches_g2 = [m for m in medicine_names if _match_drug(m, group2)]

        # Ensure that the matches are distinct medications
        for m1 in matches_g1:
            for m2 in matches_g2:
                if m1.lower().strip() == m2.lower().strip():
                    continue
                pair_key = tuple(sorted([m1.lower().strip(), m2.lower().strip()]))
                if pair_key in seen_keys:
                    continue
                seen_keys.add(pair_key)

                detected_interactions.append({
                    "medication_1": m1.title(),
                    "medication_2": m2.title(),
                    "title": item["title"],
                    "severity": item["severity"],
                    "description": item["description"],
                    "doctor_prompt": item["doctor_prompt"],
                })

    return detected_interactions
