# Production Deployment Guide: Separated Frontend & Backend

This guide outlines how to deploy the **AI-Based Friendly Report Simplifier** with the **React/Vite Frontend** deployed independently on **Vercel** and the **Flask/Python Backend** deployed on **Render**.

---

## Architecture Overview

```
+---------------------------------------+         +--------------------------------------------+
|         Vercel (Frontend)             |         |              Render (Backend)              |
|  - React 18 + Vite (SPA)              |  HTTPS  |  - Flask + Gunicorn + Tesseract OCR        |
|  - Single-Page Routing (vercel.json)  | ------> |  - Medical Analysis & Extraction Core      |
|  - Base API URL: VITE_API_URL         |  (CORS) |  - Cross-Origin Cookie Session (SameSite)  |
+---------------------------------------+         +--------------------------------------------+
                                                                |
                                                                +---> Gemini API (Cloud AI)
                                                                +---> Google OAuth (Authlib)
                                                                +---> SQLite / PostgreSQL
```

---

## Step 1: Deploy Backend to Render

The Flask backend requires Python 3.12, Gunicorn, system OCR packages (`tesseract-ocr`), and graphics libraries (`libgl1`, `libglib2.0-0`). We provide a preconfigured `Dockerfile.backend` and a `render.yaml` Blueprint for deployment.

### Option A: Using Render Blueprint (Recommended)
1. Push your repository to GitHub.
2. Sign in to your [Render Dashboard](https://dashboard.render.com/).
3. Click **Blueprints** -> **New Blueprint Instance**.
4. Select your repository. Render will automatically detect `render.yaml`.
5. Fill in the required environment variables:
   - `GEMINI_API_KEY`: Your Google Gemini API key.
   - `CORS_ORIGINS`: Set to your Vercel URL (e.g., `https://your-app.vercel.app`).
   - `FRONTEND_URL`: Set to your Vercel URL (e.g., `https://your-app.vercel.app`).
6. Click **Apply**. Render will build and deploy the container.

### Option B: Manual Web Service Creation
1. In the Render Dashboard, click **New +** -> **Web Service**.
2. Connect your GitHub repository.
3. Choose the **Docker** runtime:
   - **Dockerfile Path**: `./Dockerfile.backend`
   - **Instance Type**: Free or Starter
   - **Health Check Path**: `/health`
4. Under **Environment Variables**, add:
   | Key | Value | Description |
   | --- | --- | --- |
   | `FLASK_ENV` | `production` | Production mode |
   | `PORT` | `5000` | Port Gunicorn listens on |
   | `SECRET_KEY` | *(Click Generate or paste random 32-char string)* | Flask session signing key |
   | `SESSION_COOKIE_SECURE` | `true` | Required for HTTPS cross-site cookies |
   | `SESSION_COOKIE_SAMESITE` | `None` | Allows frontend on Vercel to authenticate |
   | `CORS_ORIGINS` | `https://your-frontend.vercel.app` | Your Vercel frontend domain |
   | `FRONTEND_URL` | `https://your-frontend.vercel.app` | Destination after OAuth callbacks |
   | `GEMINI_API_KEY` | `your-gemini-api-key` | Google Gemini API key |
   | `DATABASE_URL` | `sqlite:///database/medreport.db` *(or PostgreSQL URI)* | Persistent storage URI |
5. Click **Create Web Service**.
6. Note your Render URL: `https://your-backend-name.onrender.com`.

---

## Step 2: Deploy Frontend to Vercel

The frontend is a modern React 18 single-page application built with Vite.

1. Sign in to [Vercel](https://vercel.com/) and click **Add New...** -> **Project**.
2. Import your GitHub repository.
3. Configure the project:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `./` (leave default)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Under **Environment Variables**, add:
   | Key | Value |
   | --- | --- |
   | `VITE_API_URL` | `https://your-backend-name.onrender.com` (Your Render backend URL, without trailing slash) |
5. Click **Deploy**.
6. Once deployed, note your Vercel URL (e.g., `https://your-app.vercel.app`).

> [!NOTE]
> If you deployed Vercel first with a placeholder URL, return to your Render Dashboard and update `CORS_ORIGINS` and `FRONTEND_URL` to match your real Vercel URL, then redeploy.

---

## Step 3: Google OAuth Configuration (Optional)

If using Google Sign-in:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Edit your **OAuth 2.0 Client ID**:
   - **Authorized JavaScript origins**:
     - `https://your-frontend.vercel.app`
     - `https://your-backend-name.onrender.com`
   - **Authorized redirect URIs**:
     - `https://your-backend-name.onrender.com/auth/google/callback`
3. Add these credentials to your Render backend environment variables:
   - `GOOGLE_CLIENT_ID`: `your-client-id.apps.googleusercontent.com`
   - `GOOGLE_CLIENT_SECRET`: `your-client-secret`
   - `GOOGLE_REDIRECT_URI`: `https://your-backend-name.onrender.com/auth/google/callback`

---

## Step 4: Verification & Smoke Test Checklist

Once both services are running:

1. **Backend Health Check**:
   Visit `https://your-backend-name.onrender.com/health` in your browser.
   Expected response:
   ```json
   {
     "status": "ok",
     "service": "medical-report-simplifier",
     "database": "ready"
   }
   ```

2. **Frontend Authentication**:
   - Open your Vercel URL (`https://your-frontend.vercel.app`).
   - Register a new account or log in.
   - Verify that session cookies are set and authentication persists across refreshes.

3. **Report Analysis & OCR**:
   - Upload a test medical report (PDF or Image).
   - Check that text extraction, entity recognition, laboratory status gauges, and simplified summary display correctly.

4. **AI Clarification Chat**:
   - Open the clarification assistant drawer on the report view and ask a question.
   - Confirm Gemini response or structured fallback.

---

## Local Development (Monolithic & Separated)

- **Standard full-stack local dev** (Vite + Flask together):
  ```powershell
  npm run dev
  ```
  Runs Flask on port `5000` and Vite dev server on port `3000` with automated proxying.

- **Independent local testing with separated URLs**:
  - Backend:
    ```powershell
    .\.venv\Scripts\python.exe app.py
    ```
  - Frontend:
    ```powershell
    $env:VITE_API_URL="http://127.0.0.1:5000"
    npx vite --port 3000
    ```
