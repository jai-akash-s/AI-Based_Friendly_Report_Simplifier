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

## Run the Flask application

```powershell
cd "d:\AI-Based_Friendly_Report_Simplifier-main"
.\.venv\Scripts\Activate.ps1
python app.py
```

Open `http://127.0.0.1:5000`.

The local SQLite database is created at `database/medreport.db` and is intentionally ignored by Git.

## Run the React frontend separately

Install Node.js 18 or newer, then open a second terminal:

```powershell
cd "d:\AI-Based_Friendly_Report_Simplifier-main\frontend"
npm install
npm run dev
```

Open the Vite URL shown in the terminal, normally `http://127.0.0.1:5173`.

The frontend uses the Flask server for authentication and API requests. Keep Flask running while using the Vite development server.

For a production-style build served by Flask:

```powershell
cd "d:\AI-Based_Friendly_Report_Simplifier-main\frontend"
npm run build
cd ..
.\.venv\Scripts\Activate.ps1
python app.py
```

Then open `http://127.0.0.1:5000`. The React app uses Flask session authentication and JSON endpoints for uploads, patients, reports, and report analysis.

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
