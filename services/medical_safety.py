"""Safety wording helpers for generated report text."""

import re


DISCLAIMER = (
    "This tool is for understanding only, not a medical diagnosis or prescription. "
    "Educational summary only; this is not a diagnosis or treatment plan. "
    "Findings may have several explanations. Do not start, stop, or change "
    "treatment or medicines based on this summary; please consult your doctor."
)

_UNSAFE_MEDICINE_CONTENT = re.compile(
    r"\b(?:\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|units?|%)|"
    r"once|twice|three times|daily|per day|every\s+\d+\s+hours?|"
    r"for\s+\d+\s+(?:days?|weeks?|months?)|"
    r"morning|evening|at night|at bedtime|before food|after food|"
    r"before meals|after meals|with food|as needed|"
    r"take|administer|apply|start|stop|increase|decrease|change|"
    r"dose|dosage|frequency|duration|"
    r"\d+(?:\.\d+)?(?:d|ds|sr|xr|cr|er)\b|"
    r"you have|patient has|diagnosed|diagnosis|diagnose|"
    r"prescribe|prescribed|cure|treatment plan)\b",
    re.IGNORECASE,
)

_UNSAFE_SUMMARY_PATTERNS = (
    re.compile(r"\b(?:you have|you suffer from|diagnosed with|confirmed diagnosis)\b", re.I),
    re.compile(
        r"\b(?:take|start|stop|increase|decrease|change|double)\s+"
        r"(?:your\s+)?(?:medication|medicine|drug|dose|tablet|treatment)\b",
        re.I,
    ),
    re.compile(r"\b(?:prescribe|prescribed|cure|treatment plan)\b", re.I),
)

_UNSAFE_EXPLANATION_PATTERNS = (
    re.compile(r"\b(?:you have|you suffer from|diagnosed with|confirmed diagnosis)\b", re.I),
    re.compile(
        r"\b(?:take|start|stop|increase|decrease|change|double)\s+"
        r"(?:your\s+)?(?:medication|medicine|drug|dose|tablet|treatment)\b",
        re.I,
    ),
    re.compile(r"\b(?:prescribe|prescribed|cure|treatment plan)\b", re.I),
)


def build_cautious_summary(entities):
    """Describe reported terms without confirming a diagnosis or recommending treatment."""
    terms = list(dict.fromkeys(
        str(entity.get("text") or entity.get("entity_text") or "").strip()
        for entity in entities or []
        if str(entity.get("text") or entity.get("entity_text") or "").strip()
    ))
    if terms:
        mentioned = ", ".join(terms[:8])
        if len(terms) > 8:
            mentioned += ", and other terms"
        return (
            f"The report mentions {mentioned}. These findings may need interpretation "
            "in context and do not confirm a diagnosis. Please consult your doctor."
        )
    return (
        "This report may include findings that need interpretation in context. "
        "Please consult your doctor."
    )


def enforce_safe_summary(summary, entities):
    """Replace generated wording that asserts a diagnosis or directs treatment."""
    text = str(summary or "").strip()
    if any(pattern.search(text) for pattern in _UNSAFE_SUMMARY_PATTERNS):
        return build_cautious_summary(entities)
    return text or build_cautious_summary(entities)


def enforce_safe_explanation(explanation, term):
    """Replace unsafe term explanations with a neutral clinician-review prompt."""
    text = str(explanation or "").strip()
    if any(pattern.search(text) for pattern in _UNSAFE_EXPLANATION_PATTERNS):
        return (
            f"{term} is mentioned in the report. Its meaning may depend on context; "
            "please consult your doctor."
        )
    return text


def is_safe_medicine_content(text):
    """Reject medicine text containing directions, dosage, or diagnosis claims."""
    return isinstance(text, str) and bool(text.strip()) and not _UNSAFE_MEDICINE_CONTENT.search(text)
