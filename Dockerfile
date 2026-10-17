# ==============================================================================
# Stage 1: Build Frontend Assets (Vite + React)
# ==============================================================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copy dependency specifications first to leverage Docker layer caching
COPY package*.json ./

# Install frontend dependencies
RUN npm ci --ignore-scripts || npm install

# Copy frontend source files
COPY src/ ./src/
COPY public/ ./public/
COPY index.html vite.config.ts tsconfig*.json ./

# Build production bundle to /app/dist
RUN npm run build


# ==============================================================================
# Stage 2: Production Python & Gunicorn Application Server
# ==============================================================================
FROM python:3.12-slim AS runner

# Optimize Python execution in containers
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FLASK_ENV=production \
    PORT=5000

# Install system dependencies:
# - tesseract-ocr & language data for medical scan optical character recognition
# - libgl1 & libglib2.0-0 for PyMuPDF / OpenCV / image operations
# - curl for container health check
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application backend source files
COPY app.py config.py ./
COPY core/ ./core/
COPY database/ ./database/
COPY routes/ ./routes/
COPY services/ ./services/
COPY templates/ ./templates/
COPY static/ ./static/

# Copy built frontend distribution from builder stage
COPY --from=frontend-builder /app/dist ./dist

# Create runtime directories for SQLite database and report file uploads
RUN mkdir -p /app/database /app/uploads

# Expose HTTP port
EXPOSE 5000

# Container healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

# Launch production WSGI application with Gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--threads", "4", "--timeout", "120", "app:app"]
