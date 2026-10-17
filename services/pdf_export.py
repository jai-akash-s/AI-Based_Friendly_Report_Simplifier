"""Create downloadable PDF summaries from structured report output."""

import os
from html import escape
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

DEFAULT_FONT = "Helvetica"
DEFAULT_BOLD = "Helvetica-Bold"

# Check for Windows Indic TrueType font to support Tamil and Hindi exports
for font_candidate in ["C:/Windows/Fonts/Nirmala.ttc", "C:/Windows/Fonts/arial.ttf"]:
    if os.path.exists(font_candidate):
        try:
            if font_candidate.endswith(".ttc"):
                pdfmetrics.registerFont(TTFont("IndicFont", font_candidate, subfontIndex=0))
            else:
                pdfmetrics.registerFont(TTFont("IndicFont", font_candidate))
            DEFAULT_FONT = "IndicFont"
            DEFAULT_BOLD = "IndicFont"
            break
        except Exception:
            continue


def build_simplified_report_pdf(data):
    """Return a readable, multi-page PDF without copying the original report text."""
    output = BytesIO()
    document = SimpleDocTemplate(
        output,
        pagesize=letter,
        rightMargin=0.65 * inch,
        leftMargin=0.65 * inch,
        topMargin=0.65 * inch,
        bottomMargin=0.65 * inch,
        title=data.get("title") or "Simplified medical report",
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Title"],
        fontName=DEFAULT_BOLD,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#123b56"),
        spaceAfter=14,
    )
    section_style = ParagraphStyle(
        "ReportSection",
        parent=styles["Heading2"],
        fontName=DEFAULT_BOLD,
        textColor=colors.HexColor("#0f706a"),
        spaceBefore=12,
        spaceAfter=7,
    )
    body_style = ParagraphStyle(
        "ReportBody",
        parent=styles["BodyText"],
        fontName=DEFAULT_FONT,
    )
    italic_style = ParagraphStyle(
        "ReportItalic",
        parent=styles["Italic"],
        fontName=DEFAULT_FONT,
    )
    heading3_style = ParagraphStyle(
        "ReportHeading3",
        parent=styles["Heading3"],
        fontName=DEFAULT_BOLD,
    )
    story = [
        Paragraph("AI-Based Friendly Report Simplifier", heading3_style),
        Paragraph(escape(data.get("title") or "Simplified medical report"), title_style),
    ]

    patient = data.get("patient") or {}
    metadata = [
        f"Patient: {escape(str(patient.get('name') or 'Unassigned'))}",
        f"Date: {escape(str(data.get('created_at') or 'Unavailable'))}",
    ]
    if patient.get("age") is not None:
        metadata.append(f"Age: {escape(str(patient['age']))}")
    if patient.get("gender"):
        metadata.append(f"Gender: {escape(str(patient['gender']))}")
    story.extend([Paragraph(" &nbsp; · &nbsp; ".join(metadata), body_style), Spacer(1, 10)])

    story.extend([
        Paragraph("Simplified explanation", section_style),
        Paragraph(escape(data.get("simplified_summary") or "No summary available."), body_style),
    ])

    lab_results = data.get("lab_results") or []
    if lab_results:
        story.append(Paragraph("Laboratory results", section_style))
        rows = [[
            Paragraph("<b>Test</b>", body_style),
            Paragraph("<b>Result</b>", body_style),
            Paragraph("<b>Reference range</b>", body_style),
            Paragraph("<b>Status</b>", body_style),
        ]]
        for result in lab_results:
            reference = result.get("reference_range")
            if isinstance(reference, dict):
                reference_text = (
                    f"{reference.get('low', '')}–{reference.get('high', '')} "
                    f"{reference.get('unit') or result.get('unit') or ''}"
                ).strip()
            else:
                reference_text = str(reference or "Not available")
            rows.append([
                Paragraph(escape(str(result.get("test_name") or "")), body_style),
                Paragraph(escape(f"{result.get('value', '')} {result.get('unit') or ''}"), body_style),
                Paragraph(escape(reference_text), body_style),
                Paragraph(escape(str(result.get("status") or "Unknown")), body_style),
            ])
        table = Table(rows, colWidths=[1.5 * inch, 1.25 * inch, 1.65 * inch, 1.1 * inch], repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8f4ee")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#18324b")),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#dce6e5")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.extend([table, Spacer(1, 6)])

    entities = data.get("entities") or []
    if entities:
        story.append(Paragraph("Medical terms", section_style))
        for entity in entities:
            term = escape(str(entity.get("text") or entity.get("name") or entity.get("entity_text") or ""))
            explanation = escape(str(entity.get("explanation") or entity.get("general_use") or entity.get("use") or ""))
            if not explanation and str(entity.get("label") or "").upper() in {"MEDICINE", "MEDICATION"}:
                explanation = "Prescription medication noted in report."
            story.append(Paragraph(f"<b>{term}</b>: {explanation}", body_style))
            story.append(Spacer(1, 4))

    recs = data.get("recommendations") or []
    foods_to_eat = []
    foods_to_avoid = []
    recommended_exercise = []
    precautions = []
    if isinstance(recs, dict):
        agg = recs.get("aggregated") or {}
        foods_to_eat = agg.get("foods_to_eat") or []
        foods_to_avoid = agg.get("foods_to_avoid") or []
        recommended_exercise = agg.get("recommended_exercise") or []
        precautions = agg.get("general_precautions") or []
    elif isinstance(recs, list):
        for item in recs:
            if isinstance(item, dict):
                foods_to_eat.extend(item.get("foods_to_eat") or [])
                foods_to_avoid.extend(item.get("foods_to_avoid") or [])
                recommended_exercise.extend(item.get("recommended_exercise") or [])
                if item.get("exercise_precautions"):
                    precautions.append(item["exercise_precautions"])
        foods_to_eat = list(dict.fromkeys(foods_to_eat))
        foods_to_avoid = list(dict.fromkeys(foods_to_avoid))
        recommended_exercise = list(dict.fromkeys(recommended_exercise))
        precautions = list(dict.fromkeys(precautions))

    if foods_to_eat or foods_to_avoid or recommended_exercise:
        story.append(Paragraph("Lifestyle & Wellness Guidance (Educational)", section_style))
        if foods_to_eat:
            story.append(Paragraph("<b>Foods to Prioritize:</b> " + escape(", ".join(str(f) for f in foods_to_eat[:6])), body_style))
            story.append(Spacer(1, 3))
        if foods_to_avoid:
            story.append(Paragraph("<b>Foods to Limit:</b> " + escape(", ".join(str(f) for f in foods_to_avoid[:6])), body_style))
            story.append(Spacer(1, 3))
        if recommended_exercise:
            story.append(Paragraph("<b>Movement & Physical Activity:</b> " + escape(", ".join(str(e) for e in recommended_exercise[:4])), body_style))
            story.append(Spacer(1, 3))
        if precautions:
            story.append(Paragraph("<b>Precautions:</b> " + escape(" · ".join(str(p) for p in precautions[:3])), body_style))
            story.append(Spacer(1, 4))

    questions = data.get("questions_to_ask_doctor") or []
    if questions:
        story.append(Paragraph("Questions to ask your doctor", section_style))
        for question in questions:
            story.append(Paragraph(f"• {escape(str(question))}", body_style))
            story.append(Spacer(1, 3))

    story.extend([
        Spacer(1, 12),
        Paragraph(escape(data.get("disclaimer") or ""), italic_style),
    ])
    document.build(story)
    output.seek(0)
    return output
