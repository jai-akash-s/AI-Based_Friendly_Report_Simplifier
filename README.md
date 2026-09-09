# AI-Based Friendly Report Simplifier

## Run the Flask API

```powershell
cd "d:\AI-Based_Friendly_Report_Simplifier-main"
.\.venv\Scripts\Activate.ps1
python app.py
```

The API runs at `http://127.0.0.1:5000`.

## Run the React frontend

Install Node.js 18 or newer, then open a second terminal:

```powershell
cd "d:\AI-Based_Friendly_Report_Simplifier-main\frontend"
npm install
npm run dev
```

Open the Vite URL shown in the terminal, normally `http://127.0.0.1:5173`.

For a production-style build served by Flask:

```powershell
cd "d:\AI-Based_Friendly_Report_Simplifier-main\frontend"
npm run build
cd ..
.\.venv\Scripts\Activate.ps1
python app.py
```

Then open `http://127.0.0.1:5000`. The React app uses Flask session authentication and JSON endpoints for uploads, patients, reports, and report analysis.
