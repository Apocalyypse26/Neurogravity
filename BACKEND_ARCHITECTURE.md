# 🧠 NEUROX Backend Architecture v2.5 (Finalized)

The NEUROX backend is a high-performance **Node.js/Express** engine designed for forensic-level analysis of crypto-token visual assets. It uses a 5-step asynchronous pipeline to determine a token's **Trust Score**.

## 🚀 Core Technology Stack
- **Framework**: Node.js (v20+) with Express
- **AI Engine**: OpenAI GPT-4o-mini (Vision)
- **Image Processing**: Sharp (High-speed resizing and transformation)
- **Queue System**: BullMQ (Powered by Upstash Redis) for asynchronous task handling
- **Storage**: Supabase (PostgreSQL + pgvector) and Cloudflare R2 (Image CDN)
- **Scraper**: Playwright (for extracting assets from URLs/X/Telegram)

## 🏗️ The 5-Step Analysis Pipeline

Each image scan passes through the following layers:

### 1. Preprocessor (`modules/preprocessor.js`)
- Normalizes images to 512x512 WebP.
- Generates a **pHash (Perceptual Hash)** to detect exact or near-duplicate scans.
- Performs "Lazy Cache" lookups to return instant results for previously scanned images.
- Uploads the normalized asset to **Cloudflare R2**.

### 2. GPT-4o Vision Scorer (`modules/gptScorer.js`)
- Sends the image to OpenAI's GPT-4o-mini vision model.
- Analyzes visual indicators: scam flags, celebrity faces, rocket imagery, and text claims.
- Performs high-accuracy OCR to extract contract addresses and token names.

### 3. Brand Originality (`modules/brandOriginal.js`)
- Generates a **CLIP Embedding** for the image.
- Performs a **Vector Similarity Search** against a database of known established projects.
- Detects if a new token is impersonating a high-profile brand (e.g., Uniswap, Solana).

### 4. Visual Consistency (`modules/visualConsist.js`)
- Compares multiple assets from a single URL (Logo vs. Banner vs. Social Post).
- Checks for professional design alignment vs. "slapdash" low-effort creation.

### 5. Aggregator (`modules/aggregator.js`)
- Fuses all signals into a weighted **Trust Score (0-100)**.
- Determines the **Risk Level** (LOW, MODERATE, HIGH, EXTREME).
- Generates the final **Verdict** and **Actionable Recommendation**.

## 📡 API Endpoints

### `POST /api/scan/image`
Direct image upload (Multipart). The core v2.5 entry point.

### `POST /api/scan/url`
Accepts a URL (X, Telegram, or Website), scrapes all visual assets, and runs a composite consistency scan.

### `POST /api/analyze` (Compatibility)
Legacy wrapper for frontend integration. Accepts `upload_id` and `file_url`, fetches the asset, and triggers the v2.5 pipeline.

### `GET /api/scan/:scanId`
Retrieves full result breakdown and metadata for a specific scan.

---

## 🛠️ Infrastructure Requirements
- **OPENAI_API_KEY**: Required for vision analysis.
- **UPSTASH_REDIS_URL**: Required for the BullMQ background worker.
- **SUPABASE_URL**: Required for persistence and vector search.
