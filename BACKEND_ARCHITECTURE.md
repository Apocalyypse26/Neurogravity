# NEUROX Backend Architecture

This document provides a comprehensive overview of the NEUROX backend system, a high-performance analysis pipeline built with FastAPI and powered by the TRIBE v2 engine.

## 🚀 Core Technology Stack
- **Framework**: FastAPI (Python 3.11+)
- **AI Engine**: OpenAI GPT-4o-mini (via `openai`)
- **Image Processing**: PIL (Pillow) for deterministic feature extraction
- **Database**: Supabase (PostgreSQL) for persistence and storage
- **Authentication**: Supabase JWT (Bearer Token)
- **Payments**: Stripe Integration

---

## 🛠️ System Components

### 1. API Layer (`main.py`)
The entry point of the application. It handles:
- **Routing**: RESTful endpoints for analysis, job tracking, and admin tasks.
- **Middleware**: CORS handling, security headers (CSP, XSS protection), and rate limiting (via `slowapi`).
- **Auth Guards**: Standardized authentication using Supabase tokens.

### 2. Job Manager (`services/job_manager.py`)
Orchestrates the asynchronous analysis pipeline. 
- **State Machine**: Tracks jobs through `PENDING` → `PREPROCESSING` → `OCR_EXTRACTING` → `TRIBE_ANALYZING` → `MAPPING_SCORES` → `COMPLETED`.
- **Persistence**: Synchronizes job states with the Supabase `jobs` table for real-time tracking across sessions.
- **Cleanup**: Automated background tasks to remove stale job data.

### 3. TRIBE v2 Engine (`services/tribe_service.py`)
The primary analysis engine, now specialized for **Crypto Token Trust Assessment**.
- **Hybrid Pipeline**:
    - **Deterministic**: PIL-based analysis of visual features (contrast, complexity, text density, color variety).
    - **AI Refinement**: Uses **OpenAI GPT-4o-mini** to analyze extracted OCR text and visual metadata for trust signals (contract legitimacy, liquidity depth, rugpull risks).
- **Output**: Generates raw signals for contract safety, liquidity health, and market credibility.

### 4. Score Mapper (`services/score_mapper.py`)
Translates raw TRIBE signals into user-friendly NEUROX metrics.
- **Trust Score**: A weighted calculation (0-100) combining contract safety, liquidity, and AI sentiment.
- **Metric Mapping**:
    - `raw_hook_score` → **Contract Safety**
    - `raw_attention_peak` → **Liquidity Health**
    - `raw_attention_mean` → **Market Credibility**
    - `raw_ending_strength` → **Team Transparency**
- **Action Logic**: Determines the recommended action (BUY, HOLD, AVOID, DANGER).

### 5. Specialized Services
- **Preprocess Service**: Normalizes images, detects "deep-fry" manipulation, and extracts low-level visual features.
- **OCR Service**: Detects and extracts text from screenshots for AI analysis.
- **Media Cache**: Downloads and localizes remote Supabase files to speed up processing.
- **Stripe Service**: Manages credit balance and subscription state.

---

## 🔄 The Analysis Flow
1. **Request**: Frontend sends an `upload_id` to `/api/analyze`.
2. **Job Creation**: `JobManager` creates a unique job ID and starts a background task.
3. **Preprocessing**: The image is downloaded and analyzed for visual features.
4. **OCR**: Text is extracted from the image.
5. **TRIBE Analysis**: 
    - Deterministic scores are calculated.
    - OCR data is sent to OpenAI AI for a "Deep Scan" of trust signals.
6. **Mapping**: Raw data is converted into the final `TRUST SCORE` format.
7. **Completion**: Job status is updated to `COMPLETED`, and results are pushed to the database.

---

## 🔒 Security & Performance
- **Safe URLs**: Validation to prevent SSRF attacks when downloading media.
- **Rate Limiting**: Per-user and per-IP limits to prevent API abuse.
- **Timeouts**: Strict timeouts for every stage of the pipeline (Download, AI, OCR) to prevent hanging processes.
- **Retries**: Intelligent exponential backoff for database and API calls.
