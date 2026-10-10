"""
extractor.py
------------
Turns an uploaded medical report (PDF or image) into plain text, so the
NER + simplification modules have something to work with.

Two situations, two strategies:

1. DIGITAL PDF (text is embedded, like a Word export or lab-generated report)
   -> pdfplumber can just "read" the text directly. Fast and 100% accurate.

2. SCANNED PDF or IMAGE (it's really just a photo/scan of a paper report)
   -> There's no embedded text at all, just pixels. We render each page as an
      image and run Tesseract OCR on it -- the same tech that lets your phone
      "read" a business card photo and turn it into contacts.

We don't ask the user which type they uploaded -- we detect it automatically:
if pdfplumber finds barely any text on a page, we assume it's a scanned image
and fall back to OCR for that page.
"""

from pathlib import Path
import os

import pymupdf as fitz  # PyMuPDF, used to rasterize PDF pages for OCR
import pdfplumber
import pytesseract
from pytesseract.pytesseract import TesseractNotFoundError
from PIL import Image, ImageEnhance, ImageOps

# If a page has fewer than this many characters of extractable text,
# we treat it as "scanned" and run OCR instead.
MIN_CHARS_FOR_DIGITAL_PAGE = 20


class OCRNotAvailableError(RuntimeError):
    """Raised when the native Tesseract executable cannot be started."""


configured_tesseract_cmd = os.environ.get("TESSERACT_CMD")
if configured_tesseract_cmd:
    pytesseract.pytesseract.tesseract_cmd = configured_tesseract_cmd


def _prepare_ocr_image(image: Image.Image) -> Image.Image:
    image = ImageOps.autocontrast(ImageOps.exif_transpose(image).convert("L"))
    if image.width < 1200:
        scale = min(3, 1200 / image.width)
        image = image.resize(
            (int(image.width * scale), int(image.height * scale)),
            Image.Resampling.LANCZOS,
        )
    return ImageEnhance.Sharpness(image).enhance(1.5)


def _run_ocr(image: Image.Image) -> tuple[str, int | None]:
    image = _prepare_ocr_image(image)
    try:
        data = pytesseract.image_to_data(
            image,
            config="--psm 11",
            output_type=pytesseract.Output.DICT,
        )
    except TesseractNotFoundError as error:
        raise OCRNotAvailableError(
            "Image OCR requires Tesseract. Install Tesseract or set TESSERACT_CMD to its executable path."
        ) from error

    lines = {}
    confidences = []
    for block, paragraph, line, word, raw_confidence in zip(
        data["block_num"],
        data["par_num"],
        data["line_num"],
        data["text"],
        data["conf"],
    ):
        word = word.strip()
        if not word:
            continue
        lines.setdefault((block, paragraph, line), []).append(word)
        try:
            confidence = float(raw_confidence)
            if confidence >= 0:
                confidences.append(confidence)
        except (TypeError, ValueError):
            continue

    text = "\n".join(" ".join(words) for words in lines.values())
    confidence = round(sum(confidences) / len(confidences)) if confidences else None
    return text, confidence


def _ocr_page_with_pymupdf(pdf_path: str, page_number: int, zoom: float = 2.0) -> tuple[str, int | None]:
    """Renders a single PDF page to an image and runs Tesseract OCR on it."""
    with fitz.open(pdf_path) as doc:
        page = doc[page_number]
        matrix = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=matrix)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    return _run_ocr(img)


def extract_text_from_pdf(pdf_path: str) -> dict:
    """
    Extracts text from a PDF, page by page, automatically choosing between
    direct text extraction and OCR depending on the page.

    Returns:
        {
            "text": "<full combined report text>",
            "pages": [ {"page": 1, "method": "digital", "text": "..."}, ... ]
        }
    """
    pages_info = []

    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages):
            digital_text = (page.extract_text() or "").strip()

            # Extract any structured tables from this page to handle multi-column reports
            extracted_tables = []
            try:
                tables = page.extract_tables() or []
                for table in tables:
                    for row in table:
                        cells = [str(c).strip() for c in (row or []) if c is not None and str(c).strip()]
                        if len(cells) >= 2:
                            extracted_tables.append(" | ".join(cells))
            except Exception:
                pass

            if extracted_tables:
                table_block = "\n".join(extracted_tables)
                if digital_text:
                    digital_text = f"{digital_text}\n\n{table_block}"
                else:
                    digital_text = table_block

            if len(digital_text) >= MIN_CHARS_FOR_DIGITAL_PAGE:
                pages_info.append({"page": i + 1, "method": "digital", "text": digital_text, "confidence": None})
            else:
                ocr_text, confidence = _ocr_page_with_pymupdf(pdf_path, i)
                pages_info.append({"page": i + 1, "method": "ocr", "text": ocr_text.strip(), "confidence": confidence})

    full_text = "\n".join(p["text"] for p in pages_info)
    confidences = [p["confidence"] for p in pages_info if p["confidence"] is not None]
    confidence = round(sum(confidences) / len(confidences)) if confidences else None
    return {"text": full_text, "pages": pages_info, "confidence": confidence}


def extract_text_from_image(image_path: str) -> dict:
    """For when the user uploads a raw image (JPG/PNG) instead of a PDF."""
    with Image.open(image_path) as img:
        text, confidence = _run_ocr(img.copy())
    text = text.strip()
    return {
        "text": text,
        "confidence": confidence,
        "pages": [{"page": 1, "method": "ocr", "text": text, "confidence": confidence}],
    }


def extract_text(file_path: str) -> dict:
    """
    Main entry point -- routes to the right extractor based on file extension.
    This is the function the Flask upload route will call.
    """
    suffix = Path(file_path).suffix.lower()

    if suffix == ".pdf":
        return extract_text_from_pdf(file_path)
    elif suffix in {".png", ".jpg", ".jpeg"}:
        return extract_text_from_image(file_path)
    elif suffix == ".txt":
        text = Path(file_path).read_text(encoding="utf-8", errors="ignore")
        return {"text": text, "confidence": None, "pages": [{"page": 1, "method": "text_file", "text": text, "confidence": None}]}
    else:
        raise ValueError(f"Unsupported file type: {suffix}")


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        result = extract_text(sys.argv[1])
        print(f"--- Extracted ({len(result['pages'])} page(s)) ---")
        for p in result["pages"]:
            print(f"[Page {p['page']} | method: {p['method']}]")
        print("\n--- Full text ---")
        print(result["text"])
    else:
        print("Usage: python extractor.py <path_to_pdf_or_image>")