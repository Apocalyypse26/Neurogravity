# NEUROX Backend — Crypto Token Visual Trust Scoring Engine

> Scans crypto token visuals (logos, banners, memes, social posts) and returns a trust score breakdown to help traders identify scam tokens and evaluate launch quality before investing.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      POST /api/scan/image                    │
│                      POST /api/scan/url                      │
└──────────────┬───────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────┐
│   Step 1: Preprocessor   │  sharp resize → pHash → Redis cache check → R2 upload
└──────────────┬───────────┘
               │ (cache miss)
               ▼
┌──────────────────────────┐
│  Step 2: GPT-4o mini     │  Single vision call → scam/hype/quality/claims scoring
└──────────────┬───────────┘
               │
               ▼
┌──────────────────────────┐
│ Step 3: Brand Originality│  CLIP embedding → pgvector similarity → known project match
└──────────────┬───────────┘
               │
               ▼
┌──────────────────────────┐
│ Step 4: Visual Consist.  │  Median cut palette → cross-image color comparison (local)
└──────────────┬───────────┘
               │
               ▼
┌──────────────────────────┐
│   Step 5: Aggregator     │  Weighted scoring → risk classification → verdict
└──────────────┬───────────┘
               │
               ▼
┌──────────────────────────┐
│   Result: JSON output    │  Persisted to Supabase + cached in Redis
└──────────────────────────┘
```

## Tech Stack

| Component     | Technology                        |
|---------------|-----------------------------------|
| Runtime       | Node.js + Express                 |
| Language      | JavaScript (ESM modules)          |
| LLM           | OpenAI GPT-4o mini (vision)       |
| Image proc    | sharp                             |
| Hashing       | Custom pHash (DCT-based)          |
| Embeddings    | HuggingFace CLIP ViT-B/32         |
| Vector DB     | Supabase pgvector                 |
| Database      | Supabase PostgreSQL               |
| Cache         | Upstash Redis (REST API)          |
| File Storage  | Cloudflare R2 (S3 SDK)            |
| Queue         | BullMQ (Upstash Redis)            |
| Scraper       | Playwright                        |
| Hosting       | Railway.app                       |

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Install Playwright browsers
npx playwright install chromium

# 3. Copy environment template and fill in values
cp .env.example .env

# 4. Run Supabase migration
# Apply supabase/migrations/001_init.sql to your Supabase project

# 5. Start the server
npm run dev
```

## API Endpoints

### `POST /api/scan/image`
Upload an image for trust analysis.

```bash
curl -X POST http://localhost:3000/api/scan/image \
  -F "image=@token_logo.png"
```

### `POST /api/scan/url`
Scrape and analyze visual assets from a URL.

```bash
curl -X POST http://localhost:3000/api/scan/url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example-token.com"}'
```

### `GET /api/scan/:scanId`
Retrieve a previously stored scan result.

```bash
curl http://localhost:3000/api/scan/NRX-20260420-0042
```

### `GET /api/health`
Health check endpoint.

```bash
curl http://localhost:3000/api/health
```

## Output Format

```json
{
  "scan_id": "NRX-20260420-0042",
  "trust_score": 34,
  "risk_level": "HIGH RISK",
  "verdict": "Proceed with extreme caution",
  "scores": {
    "scam_risk": 78,
    "claim_credibility": 29,
    "hype_manipulation": 82,
    "launch_quality": 38,
    "brand_originality": 41,
    "visual_consistency": 55
  },
  "flags": [
    "Logo is 91% similar to SafeMoon v1",
    "Detected: guaranteed returns text in banner",
    "Celebrity face detected — no verified association",
    "Countdown timer overlay detected"
  ],
  "recommendation": "Multiple high-risk visual signals detected.",
  "ocr_text": "BUY NOW 100X GUARANTEED LIMITED TIME",
  "platform_data": {
    "input_type": "image",
    "analyzed_assets": 1,
    "duplicate_detected": false,
    "cache_hit": false,
    "quality_flags": []
  },
  "timestamp": "2026-04-20T00:00:00Z"
}
```

## Trust Score Weights

| Module              | Weight | Direction |
|---------------------|--------|-----------|
| Scam Risk           | 25%    | Inverted  |
| Brand Originality   | 20%    | Direct    |
| Claim Credibility   | 15%    | Direct    |
| Hype Manipulation   | 15%    | Inverted  |
| Visual Consistency  | 15%    | Direct    |
| Launch Quality      | 10%    | Direct    |

## Risk Classification

| Score | Risk Level     | Verdict                          |
|-------|----------------|----------------------------------|
| 0–25  | CRITICAL RISK  | Do not engage                    |
| 26–45 | HIGH RISK      | Proceed with extreme caution     |
| 46–65 | MODERATE RISK  | Unverified — DYOR                |
| 66–80 | LOOKS LEGIT    | Passes visual trust check        |
| 81–100| HIGH TRUST     | Strong brand signals             |

## Environment Variables

See `.env.example` for all required configuration.

## Deployment (Railway)

1. Connect your GitHub repo to Railway
2. Set all environment variables from `.env.example`
3. Railway auto-detects Node.js and runs `npm start`
4. Health check: `GET /api/health`
