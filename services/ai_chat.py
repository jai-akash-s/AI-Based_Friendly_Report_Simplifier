"""Interactive AI health clarity and report explanation conversational service.

Provides guarded, educational dialogue regarding laboratory results, recognized
medications, dietary precautions, and doctor discussion points.
"""

import json
import os
import re
from core.gemini_analyzer import has_gemini_api_key, generate_gemini_json
from services.medical_safety import DISCLAIMER


CHAT_SYSTEM_INSTRUCTION = """You are MedReport Clarity Assistant, a gentle, educational, and empathetic health clarity assistant.
Your goal is to help patients understand their laboratory findings, medical terms, and physician discussion points.

CRITICAL MEDICAL SAFETY RULES:
1. You provide educational guidance ONLY. Never provide an autonomous medical diagnosis, never confirm disease status, and never prescribe, discontinue, or alter dosages of medications.
2. Ground all answers firmly on the provided Patient Report Context.
3. If the user asks about an abnormal lab result, explain what the test measures, what common non-emergency factors can influence it, and what questions they can bring to their doctor.
4. If asked about medication timing, dietary interactions, or side effects, provide standard educational information and emphasize verifying with their pharmacist or prescribing doctor.
5. Use plain, compassionate, and reassuring language suitable for patients (6th–8th grade reading level). Avoid harsh clinical jargon without immediate plain-English definitions.
6. Always end your reply with a gentle reminder that their physician understands their individual baseline best.
"""


def format_report_context_for_chat(report_data: dict, patient_data: dict | None = None) -> str:
    """Format report metrics, medicines, and recommendations into concise context for the LLM."""
    lines = []
    if patient_data:
        age_str = f"{patient_data.get('age')} yrs" if patient_data.get('age') else "Age N/A"
        gender_str = patient_data.get('gender') or "Gender N/A"
        lines.append(f"Patient: {patient_data.get('full_name', 'Patient Record')} ({age_str}, {gender_str})")

    report_title = report_data.get("title") or report_data.get("filename") or "Medical Report"
    lines.append(f"Report: {report_title}")

    if report_data.get("simplified_summary") or report_data.get("simplified_text"):
        summary = report_data.get("simplified_summary") or report_data.get("simplified_text")
        lines.append(f"Current Summary: {summary}")

    lab_results = report_data.get("lab_results") or []
    if lab_results:
        lines.append("Laboratory Findings:")
        for lab in lab_results:
            status = lab.get("status") or "Normal"
            lines.append(f"  - {lab.get('test_name')}: {lab.get('value')} {lab.get('unit', '')} [Status: {status}]")

    entities = report_data.get("entities") or []
    meds = [
        ent for ent in entities
        if str(ent.get("entity_label") or ent.get("label") or "").upper() in {"MEDICINE", "MEDICATION"}
    ]
    if meds:
        lines.append("Detected Medications:")
        for m in meds:
            name = m.get("entity_text") or m.get("text") or m.get("name")
            exp = m.get("explanation") or m.get("general_use") or "Prescription medication."
            lines.append(f"  - {name}: {exp}")

    interactions = report_data.get("drug_interactions") or []
    if interactions:
        lines.append("Potential Drug Interactions to Discuss:")
        for item in interactions:
            lines.append(f"  - {item.get('title')}: {item.get('description')}")

    recs = report_data.get("recommendations") or {}
    agg = recs.get("aggregated") if isinstance(recs, dict) else None
    if agg:
        foods_to_eat = agg.get("foods_to_eat") or []
        foods_to_avoid = agg.get("foods_to_avoid") or []
        if foods_to_eat:
            lines.append(f"Foods to Consider: {', '.join(foods_to_eat[:6])}")
        if foods_to_avoid:
            lines.append(f"Foods to Limit: {', '.join(foods_to_avoid[:6])}")

    return "\n".join(lines)


def _generate_rule_based_reply(user_message: str, report_data: dict, patient_data: dict | None = None) -> dict:
    """Intelligent rule-based fallback when Gemini API key is not configured."""
    msg = (user_message or "").lower()
    lab_results = report_data.get("lab_results") or []
    entities = report_data.get("entities") or []
    recs = report_data.get("recommendations") or {}
    agg = recs.get("aggregated") if isinstance(recs, dict) else {}

    # Check for specific lab test mentioned
    matched_lab = None
    for lab in lab_results:
        tname = str(lab.get("test_name") or "").lower()
        if tname and tname in msg:
            matched_lab = lab
            break

    if matched_lab:
        val = matched_lab.get("value")
        unit = matched_lab.get("unit") or ""
        status = matched_lab.get("status") or "Normal"
        meaning = matched_lab.get("meaning") or "Routine laboratory metric."
        reply = (
            f"**Regarding your {matched_lab.get('test_name')} test:**\n\n"
            f"Your report records a value of **{val} {unit}**, flagged as **{status}**.\n\n"
            f"• **What this metric reflects:** {meaning}\n"
            f"• **Important context:** Laboratory numbers fluctuate depending on hydration, recent meals, rest, and your individual baseline. A single flagged value does not confirm an illness on its own.\n\n"
            f"**Suggested question for your physician:**\n"
            f"\"How does my {matched_lab.get('test_name')} of {val} {unit} fit with my overall health, and should we re-test it in a few weeks?\""
        )
        suggestions = [
            f"What dietary choices support healthy {matched_lab.get('test_name')}?",
            "What other lab tests should I review?",
            "Show questions for my next doctor visit.",
        ]
        return {"reply": reply, "suggestions": suggestions}

    # Food and diet query
    if any(k in msg for k in ["food", "diet", "eat", "avoid", "nutrition", "meal"]):
        eat = agg.get("foods_to_eat") or ["Fresh vegetables", "Whole grains", "Lean proteins", "Adequate water"]
        avoid = agg.get("foods_to_avoid") or ["Excessive refined sugars", "High-sodium processed snacks", "Trans fats"]
        reply = (
            "**Nutritional Considerations Based on Your Report:**\n\n"
            f"• **Helpful options to prioritize:** {', '.join(eat[:8])}.\n"
            f"• **Items generally advised to limit:** {', '.join(avoid[:8])}.\n\n"
            "Healthy dietary adjustments work best when tailored to your medical history and lifestyle. Ask your doctor or registered dietitian before starting any restrictive diet."
        )
        suggestions = [
            "Are there any drug interactions with foods?",
            "What exercises are safe for me?",
            "Explain my abnormal lab results.",
        ]
        return {"reply": reply, "suggestions": suggestions}

    # Medications query
    if any(k in msg for k in ["medicine", "medication", "pill", "drug", "dose", "tablet"]):
        meds = [
            ent for ent in entities
            if str(ent.get("entity_label") or ent.get("label") or "").upper() in {"MEDICINE", "MEDICATION"}
        ]
        if meds:
            med_list = "\n".join([f"• **{m.get('entity_text') or m.get('text')}**: {m.get('explanation') or 'Commonly prescribed therapy.'}" for m in meds[:4]])
            reply = (
                f"**Medications Identified in Your Report:**\n\n{med_list}\n\n"
                "⚠️ **Safety Reminder:** Never start, stop, or change your medication schedules based solely on digital guides. Always confirm timings with your doctor or pharmacist."
            )
        else:
            reply = (
                "No specific medications were flagged in this report. If you take regular prescriptions, over-the-counter supplements, or herbal remedies, make sure to bring a list of them to your appointment."
            )
        suggestions = [
            "What should I ask my doctor about my medicines?",
            "What do my lab results mean?",
            "Summarize my report for me.",
        ]
        return {"reply": reply, "suggestions": suggestions}

    # Doctor questions query
    if any(k in msg for k in ["question", "doctor", "physician", "ask", "appointment", "visit"]):
        questions = report_data.get("questions_to_ask_doctor") or [
            "How do these results correlate with my current symptoms or routine care?",
            "Do any medication adjustments or follow-up laboratory intervals make sense?",
            "What lifestyle modifications would be most beneficial for my current baseline?",
        ]
        q_text = "\n".join([f"{idx+1}. {q}" for idx, q in enumerate(questions[:5])])
        reply = (
            f"**Recommended Questions to Ask Your Doctor:**\n\n{q_text}\n\n"
            "Tip: You can print out your report summary or save a PDF to take directly to your consultation!"
        )
        suggestions = [
            "Explain my abnormal lab tests.",
            "What foods should I avoid?",
            "Can you explain the report summary in simpler terms?",
        ]
        return {"reply": reply, "suggestions": suggestions}

    # Default overview
    summary = report_data.get("simplified_summary") or report_data.get("simplified_text") or "Your report contains laboratory and clinical findings."
    abnormal = [
        f"{l.get('test_name')} ({l.get('status')})"
        for l in lab_results
        if str(l.get("status") or "").lower() in {"high", "low", "critical"}
    ]
    abnormal_str = f"Notable findings include: **{', '.join(abnormal)}**." if abnormal else "Most metrics appear within expected limits."

    reply = (
        f"**Medical Report Overview:**\n\n{summary}\n\n"
        f"{abnormal_str}\n\n"
        "Feel free to ask me about specific test names, diet advice, medication purposes, or what questions you should bring to your physician."
    )
    suggestions = [
        "What do my abnormal tests mean?",
        "What foods should I eat or avoid?",
        "What questions should I ask my doctor?",
    ]
    return {"reply": reply, "suggestions": suggestions}


def generate_health_chat_reply(
    user_message: str,
    report_data: dict,
    patient_data: dict | None = None,
    chat_history: list[dict] | None = None,
) -> dict:
    """Generate an empathetic, medically safe clarification response."""
    if not user_message or not user_message.strip():
        return {
            "reply": "Please ask a question about your medical report, lab values, or medications.",
            "suggestions": ["Explain my report", "What do my lab tests mean?", "What foods should I avoid?"],
        }

    report_context = format_report_context_for_chat(report_data, patient_data)

    if has_gemini_api_key():
        try:
            # Build structured parts for Gemini
            history_text = ""
            if chat_history:
                for h in chat_history[-6:]:
                    role = "Patient" if h.get("sender") == "user" else "Assistant"
                    history_text += f"\n{role}: {h.get('text', '')}"

            prompt = f"""[PATIENT REPORT CONTEXT]
{report_context}

[CONVERSATION HISTORY]
{history_text}

[PATIENT QUESTION]
{user_message.strip()}

Please provide a JSON response in the exact format:
{{
  "reply": "Your clear, empathetic, cautious plain-English answer here (markdown supported)",
  "suggestions": ["Follow-up question 1", "Follow-up question 2", "Follow-up question 3"]
}}"""

            response_json = generate_gemini_json(
                [{"text": prompt}],
                system_instruction=CHAT_SYSTEM_INSTRUCTION,
                temperature=0.3,
            )
            parsed = json.loads(response_json)
            if isinstance(parsed, dict) and parsed.get("reply"):
                return {
                    "reply": str(parsed["reply"]).strip(),
                    "suggestions": list(parsed.get("suggestions") or [
                        "What questions should I ask my doctor?",
                        "What foods should I eat or avoid?",
                        "Explain my lab values",
                    ])[:4],
                }
        except Exception:
            pass

    # Safe fallback
    return _generate_rule_based_reply(user_message, report_data, patient_data)
