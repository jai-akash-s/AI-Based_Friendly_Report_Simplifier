"""Gemini multimodal analysis for medical reports."""

import base64
import json
import mimetypes
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


class GeminiAnalysisError(RuntimeError):
    """Raised when Gemini is configured but cannot analyze the report."""


def has_gemini_api_key() -> bool:
    return bool(os.environ.get("GEMINI_API_KEY", "").strip())


def analyze_medical_report(file_path: str | None = None, text: str | None = None) -> dict | None:
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None

    parts = []
    if file_path:
        path = Path(file_path)
        mime_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        try:
            encoded_file = base64.b64encode(path.read_bytes()).decode("ascii")
        except OSError as error:
            raise GeminiAnalysisError("Unable to read the uploaded report for Gemini analysis.") from error
        parts.append({"inlineData": {"mimeType": mime_type, "data": encoded_file}})

    prompt = """Read the attached medical report or supplied text carefully. Transcribe visible content faithfully; mark uncertain handwriting as [unclear] instead of guessing. Do not invent patient details, diagnoses, medication ingredients, lab values, or doses. Explain only what the source supports. Lifestyle advice must be general, cautious, and related to identified findings; medication changes are never advised.

Return only JSON with this shape:
{
  "extracted_text": "faithful transcription",
  "patient_info": {"full_name": null, "age": null, "gender": null, "blood_group": null, "contact_phone": null, "contact_email": null},
  "entities": [{"text": "term or value", "label": "DISEASE, MEDICINE, LAB_TERM, or SYMPTOM", "explanation": "short plain-language explanation"}],
  "simplified_summary": "clear patient-friendly summary grounded in the report",
  "foods_to_eat": [],
  "foods_to_avoid": [],
  "recommended_exercise": [],
  "exercise_precautions": ""
}

Only include recommendations when supported by the findings. Use empty arrays when no specific guidance is appropriate."""
    if text:
        prompt += f"\n\nReport text:\n{text}"
    parts.append({"text": prompt})

    configured_model = os.environ.get("GEMINI_MODEL", "gemini-3.8-flash").strip() or "gemini-3.8-flash"
    models = list(dict.fromkeys((configured_model, "gemini-3.6-flash", "gemini-3.1-flash-lite")))
    request_body = json.dumps({
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"responseMimeType": "application/json"},
    }).encode("utf-8")
    payload = None
    last_http_status = None

    for model in models:
        endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?{urlencode({'key': api_key})}"
        request = Request(
            endpoint,
            data=request_body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=45) as response:
                payload = json.loads(response.read().decode("utf-8"))
            break
        except HTTPError as error:
            last_http_status = error.code
            if error.code in {404, 429, 500, 502, 503, 504}:
                continue
            raise GeminiAnalysisError(f"Gemini request failed with HTTP {error.code}.") from None
        except (URLError, TimeoutError, OSError):
            continue
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue

    if payload is None:
        if last_http_status:
            raise GeminiAnalysisError(
                f"Gemini models are currently unavailable (last HTTP status {last_http_status})."
            )
        raise GeminiAnalysisError("Gemini could not be reached. Check the network and API key.")

    try:
        response_text = "".join(
            part.get("text", "")
            for part in payload["candidates"][0]["content"]["parts"]
        ).strip()
        result = json.loads(response_text)
    except (KeyError, IndexError, TypeError, json.JSONDecodeError):
        raise GeminiAnalysisError("Gemini did not return the expected report analysis.") from None

    if not isinstance(result, dict) or not str(result.get("extracted_text", "")).strip():
        raise GeminiAnalysisError("Gemini could not extract readable text from this report.")

    return result