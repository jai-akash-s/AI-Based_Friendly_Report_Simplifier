# AI-Based Friendly Report Simplifier

An AI-assisted Flask application that extracts medical report text, identifies important entities, and presents clearer explanations and recommendations.

## Features

- Upload PDF, image, or text-based medical reports.
- Extract patient details and medical entities.
- Generate simplified report summaries and recommendations.
- Sign in locally or with Google OAuth.
- Store patients and reports separately for each signed-in account.
- Automatically initialize and repair the local SQLite schema at startup.

## Setup

Install Python 3.12 or newer, create a virtual environment, and install the dependencies:

```powershell
cd "d:\AI-Based_Friendly_Report_Simplifier-main"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Create a local `.env` file from `.env.example`. Keep real OAuth credentials only in `.env`; never commit them.

## Run the application

The project-root React app runs with the Flask authentication and SQLite API backend. If you have existing Express JSON records, import them once:

```powershell
python -m database.migrate_json_store
npm install
npm run dev
```

Open `http://127.0.0.1:3000`. `npm run dev` starts Flask on port 5000 and the React app on port 3000. The first local image OCR run downloads Tesseract.js's English data, so an internet connection is needed once. Keep the Python environment and dependencies from Setup available for image preprocessing and scanned-PDF rendering.

Google sign-in uses the existing Authlib OAuth flow. In the root `.env`, set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI=http://127.0.0.1:5000/auth/google/callback`; register that exact redirect URI in Google Cloud Console. After sign-in, the browser returns to port 3000. Keep credentials in `.env`, never `.env.example`.

For handwritten reports, set `GEMINI_API_KEY` in the root `.env`. Without it, local OCR is used; uncertain handwriting is shown for correction before recommendations are generated.

## Run tests

```powershell
cd "d:\AI-Based_Friendly_Report_Simplifier-main"
.\.venv\Scripts\Activate.ps1
python -m unittest discover -s tests -v
```

## Google OAuth

Set these values in `.env` when Google sign-in is enabled:

```text
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://127.0.0.1:5000/auth/google/callback
```

Google sign-in requests an account chooser so users can switch accounts or add another account. Configure the same callback URL in Google Cloud Console.
