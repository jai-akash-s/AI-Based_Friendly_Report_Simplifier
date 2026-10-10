# AI-Based Friendly Report Simplifier

An AI-assisted Flask and React application that extracts text from medical reports, identifies common medical terms and laboratory results, and presents cautious, plain-language explanations. It is an educational aid, not a diagnostic or treatment service.

## Features

- Upload PDF, image, or text-based medical reports.
- Extract patient details and medical entities.
- Explain the general uses of recognized medicines using a local generic/brand catalog, with fuzzy matches clearly marked for confirmation.
- Allow patients to correct an OCR'd medicine name and rerun its lookup.
- Detect multi-drug combinations and highlight potential drug interactions with doctor discussion prompts.
- Parse common laboratory values (including Hemoglobin, WBC, RBC, Platelets, Glucose, Cholesterol, LDL, HDL, Creatinine, TSH, and HbA1c) using report ranges when present and a bundled adult reference catalog otherwise.
- Differentiate High (amber/orange) vs. Low (cyan/blue) vs. Critical (crimson) vs. Normal (emerald green) lab metrics with exact-color print styling.
- Visualize numeric lab results with interactive, color-zoned reference range gauge bars.
- Generate a Doctor Appointment Summary Sheet with a mobile-scannable QR code directing to a responsive digital summary (`/reports/<id>/summary`).
- Store structured laboratory results with each SQLite report; the existing startup migration safely adds missing columns to databases created by earlier versions.
- Review lab statuses, glossary explanations, the original report text, and a simplified explanation side by side.
- Generate questions for a doctor from abnormal low/high results.
- View a patient's same-test history in an interactive Recharts trend graph and automated clinical timeline.
- Select English, Tamil, or Hindi generated output. Tamil/Hindi translation uses the configured Gemini service; the original report text is not sent by the translation endpoint.
- Read the simplified summary aloud with the browser's Web Speech API and variable playback speeds.
- Show a safety disclaimer on report results and exports; generated summaries avoid confirming diagnoses or prescribing treatment.
- Evaluate Flesch Reading Ease and Flesch-Kincaid grade, and measure lab extraction against a small labeled sample set.
- Delete individual patient records with cascading deletion of uploaded files, reports, and reminders.
- Delete a report or an entire signed-in account, including related database rows and uploaded report files.
- Mask a patient's name and ID in the displayed and printed result view.
- Download a formatted PDF report.
- Sign in locally or with Google OAuth; store patients and reports separately for each account.
- **Role-Based Access Control**:
  - Superadmin account automatically designated for **`akash.saravanan1797@gmail.com`** (protected from demotion/deletion).
  - All other registered accounts default to standard **`user`** roles with self-contained patient and report data isolation.
  - Dedicated **Admin Portal** (`#/admin`) for system administrators to view real-time platform statistics, promote/demote user permissions, audit system events, and purge inactive user accounts.
  - Non-admin users attempting to access administrative endpoints or views receive 403 access control barriers.
- **BytsOne-Inspired Modern Dashboard**:
  - Left navigation sidebar featuring brand styling, categorized navigation groups (Overview, Learning, Management), and active status indicators.
  - Top header bar with hamburger drawer toggle, theme switch, role badges (`Admin` vs. `User`), and initial avatar badges (`JA` / `AS`).
  - Welcome Banner with dynamic user personalization, activity subtext, and quick action buttons.
  - Middle 2-column layout: 2x2 **Assessment Activity** grid (`TESTS ASSIGNED`, `TESTS COMPLETED`, `QUESTIONS ATTEMPTED`, `TOTAL TIME SPENT`) and **Announcements** empty state.
  - Progress section: **Courses in Progress** / active reports card and **Global Platform Profiles** integration.
  - Interactive bottom-right **Floating AI Assistant** widget.

## Project structure

- `app.py`: Flask application setup, blueprint registration, and startup SQLite schema checks.
- `routes/`: authentication, upload, patient, report, evaluation, translation, trend, deletion, and export endpoints.
- `database/models.py`: SQLAlchemy user, patient, report, medicine catalog/cache, entity, and recommendation models.
- `core/`: OCR, extraction, entity recognition, simplification, and Gemini report analysis.
- `services/`: lab parsing, medicine lookup/explanation, trends, questions, safety, privacy, translation, evaluation, and PDF generation.
- `data/medicines.json`: bundled generic medicine names, general-use explanations, and selected brand aliases.
- `database/import_medicine_csv.py`: importer for Kaggle-style medicine CSV files.
- `src/`: active project-root React/Vite application.
- `tests/`: Python unit and route tests, including `tests/data/lab_extraction_samples.json`.
- `scripts/evaluate_reports.py`: command-line evaluation runner.

## Setup

Install Python 3.12 or newer, create a virtual environment, and install the dependencies:

```powershell
cd "d:\AI-Based_Friendly_Report_Simplifier-main"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Create a local `.env` file from `.env.example`. Keep real OAuth and Gemini credentials only in `.env`; never commit them.

## Run the application

The project-root React app runs with the Flask authentication and SQLite API backend. If you have existing Express JSON records, import them once:

```powershell
python -m database.migrate_json_store
npm install
npm run dev
```

Open `http://127.0.0.1:3000`. `npm run dev` starts Flask on port 5000 and the React app on port 3000. The first local image OCR run downloads Tesseract.js's English data, so an internet connection is needed once. Keep the Python environment and dependencies from Setup available for image preprocessing and scanned-PDF rendering.

Google sign-in uses the existing Authlib OAuth flow. In the root `.env`, set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI=http://127.0.0.1:5000/auth/google/callback`; register that exact redirect URI in Google Cloud Console. After sign-in, the browser returns to port 3000. Keep credentials in `.env`, never `.env.example`.

For handwritten image analysis, Tamil/Hindi translation, or lookup of a medicine not recognized locally, set `GEMINI_API_KEY` in the root `.env`. Medicine lookup sends the detected medicine name and any extracted medicine/condition context to Gemini; it does not send the full report. A model-derived medicine explanation is always labeled unverified and is never promoted to a verified catalog match. Translation sends generated summary/explanation strings, not the original report. Without the key, local OCR and the medicine catalog continue to work; unknown medicine names remain unidentified.

## Medicine catalog import

The bundled catalog is available without additional setup. To merge a Kaggle CSV into `data/medicines.json`, use a CSV with brand name, composition, and use columns (headers are matched without regard to spaces or case):

```powershell
python database\import_medicine_csv.py .\medicines.csv
```

The JSON import merges entries by normalized composition and keeps existing entries. Stop and restart Flask after importing so the brand-to-generic index is rebuilt.

To write the CSV into the app's SQLite catalog table instead, point `--sqlite` at the same database file configured by `DATABASE_URL`:

```powershell
python database\import_medicine_csv.py .\medicines.csv --sqlite .\database\medreport.db
```

The SQLite `medicines` table is added safely at startup; existing report data is not replaced. The app merges rows from that table into its local lookup index after startup.

The raw Kaggle dataset is staged at `data/kaggle/A_Z_medicines_dataset_of_India.csv`. It is attributed to Shudhanshu Singh, [A-Z Medicine Dataset of India](https://www.kaggle.com/datasets/shudhanshusingh/az-medicine-dataset-of-india), licensed CC BY-SA 4.0. Its CSV contains `name`, `short_composition1`, and `short_composition2`, but no medicine-use column, so it is not yet compatible with the importer above. It has been kept separate from the trusted lookup catalog; no medicine uses are inferred from composition alone.

## API additions

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/patients` / `/patients/api/list` | List all registered patients for the authenticated account. |
| `DELETE` | `/api/patients/<patient_id>` / `/patients/api/<patient_id>` | Delete a patient, cascading to all owned reports, uploaded files, and reminders. |
| `GET` | `/api/patients/<patient_id>/timeline` | Retrieve chronological report timeline and trajectory for a patient. |
| `GET` | `/api/patients/<patient_id>/lab-trends?test=Hemoglobin` | Return one owned patient's values for a test, in report-date order. |
| `GET` | `/reports/<report_id>/summary` | Public, responsive mobile summary view for doctor visit QR code scans. |
| `GET` | `/api/reports/<report_id>/evaluation` | Return readability metrics for the report and labeled lab-extraction metrics. |
| `POST` | `/api/reports/<report_id>/translate` | Translate generated output; JSON body: `{"language":"ta"}` or `{"language":"hi"}`. `en` returns English output. |
| `POST` | `/api/reports/<report_id>/medicine-lookup` | Rerun an owned medicine entity lookup after correction; JSON body: `{"entity_id":1,"name":"corrected name"}`. |
| `GET` | `/api/reports/<report_id>/export/pdf` | Download a simplified report PDF. |
| `DELETE` | `/api/reports/<report_id>` | Delete an owned report, its dependent rows, and its uploaded file. |
| `DELETE` | `/api/account` | Delete the signed-in account and its related reports, patients, audit rows, and report files. |

All listed endpoints require an authenticated session (except the public QR `/reports/<report_id>/summary` designed for mobile clinician visits). Normal CSRF configuration also applies to deletion, mutation, translation, and medicine lookup requests.

## Run tests

```powershell
cd "d:\AI-Based_Friendly_Report_Simplifier-main"
.\.venv\Scripts\Activate.ps1
python -m unittest discover -s tests -v
```

Run just the medicine lookup tests:

```powershell
python -m unittest discover -s tests -p "test_medicine_lookup.py" -v
```

Run the evaluation script against its checked-in labeled lab samples:

```powershell
python scripts\evaluate_reports.py
```

To also evaluate readability, provide paths to UTF-8 text files:

```powershell
python scripts\evaluate_reports.py --original .\original.txt --simplified .\simplified.txt
```

## Google OAuth

Set these values in `.env` when Google sign-in is enabled:

```text
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://127.0.0.1:5000/auth/google/callback
```

Google sign-in requests an account chooser so users can switch accounts or add another account. Configure the same callback URL in Google Cloud Console.

## Limitations

- Laboratory parsing is regex-based and covers only the tests and result layouts in the common-test catalog. Values on unusual, merged, or poorly OCR'd lines may be missed or misread.
- Bundled ranges are general adult defaults. Laboratory ranges vary by lab, units, age, sex, pregnancy, and clinical context; a report-provided range takes precedence when the parser can read it. A status is not a diagnosis.
- The labeled extraction set is deliberately small and is a software check, not clinical validation. Flesch formulas are English-oriented and should not be interpreted as meaningful readability scores for Tamil or Hindi.
- Gemini translation requires a configured key, network access, and provider availability. The translation route sends generated text to that configured provider; the original report is not sent by that route.
- Handwritten brand names can be misread by OCR. Similar-looking brand names can refer to different medicines; a fuzzy match must be confirmed, and an LLM result remains unverified even when it offers a likely generic name and general use.
- The bundled medicine catalog is not exhaustive or a substitute for a pharmacist's verification. Imported Kaggle records may contain incomplete, outdated, or inconsistent brand/composition/use data and should be reviewed before use; observe the dataset's license and terms.
- Medicine explanations cover general uses only. They do not establish why a medicine was prescribed to a particular patient and must not be used to select, start, stop, or change a medicine.
- Speech playback depends on browser support and installed device voices. The name/ID mask is a display/print-view convenience and does not redact stored records, downloads, or the original uploaded document.
- The application cannot interpret a result for an individual, confirm a diagnosis, or prescribe treatment. Review reports and abnormal findings with a qualified clinician.
