# AI-Based Friendly Report Simplifier

A full-stack AI-assisted medical report simplifier that extracts medical report text (from images, PDFs, or pasted reports), identifies diagnostic entities and lab findings, and presents plain-English patient-friendly explanations and personalized dietary and exercise guidance.

## Features

- **Real Medical Report Extraction & OCR**: Upload image files (PNG, JPG, JPEG), PDF lab reports, or paste medical text directly.
- **Multimodal AI Analysis**: Powered by `@google/genai` (Gemini 3.8 Flash) for clinical OCR and structured text extraction.
- **Offline Medical Dictionary & NER**: Built-in comprehensive medical dictionary matching diseases, medications, and lab markers.
- **Personalized Recommendations**: Automatically suggests foods to eat, foods to avoid, and safe physical exercise routines based on detected conditions (e.g. Hypertension, Diabetes, Hyperlipidemia, CKD, Anemia).
- **Patient & Report History**: Manage patient profiles, unique patient IDs (`PAT-YYYY-XXXX`), and linked report records.

## Quick Start

```bash
npm install
npm run dev
```

App runs on `http://0.0.0.0:3000`.
