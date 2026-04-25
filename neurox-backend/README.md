# NEUROX Backend

Crypto Token Visual Trust Scoring Engine - Backend API

## Overview

NEUROX is a backend service that analyzes crypto token images for trust scoring. It processes images (logos, banners, social posts) through multiple analysis modules to generate a trust score and risk assessment.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Frontend   │────▶│   Express    │────▶│  Pipeline   │
│  (upload)   │     │   Server    │     │  (modules) │
└─────────────┘     └──────────────┘     └─────────────┘
                                               │
                    ┌──────────────┐           ▼
                    │  Supabase    │◀─── aggregate()
                    │  (persist) │
                    └──────────────┘
```

## Image Scanning Pipeline

The scan processes through 5 stages:

### 1. Preprocess (`src/modules/preprocessor.js`)
- Validate file size (max 10MB) and MIME type (PNG, JPEG, WebP, GIF)
- Resize to 512x512 with black padding
- Generate perceptual hash (pHash) for duplicate detection
- Check Redis cache for existing scans
- Upload to Cloudflare R2 for storage

### 2. GPT-4o Mini Scoring (`src/modules/gptScorer.js`)
- Analyze image with OpenAI GPT-4o mini (vision)
- Extract scam indicators, claim credibility, hype manipulation, launch quality
- OCR text extraction

### 3. Brand Originality (`src/modules/brandOriginal.js`)
- Compare against known brand logos via HuggingFace CLIP
- Detect potential brand imitation

### 4. Visual Consistency (`src/modules/visualConsist.js`)
- Compare multiple images from same token
- Detect inconsistencies indicating fake/forged images

### 5. Aggregate (`src/modules/aggregator.js`)
- Combine all scores into final trust score (0-100)
- Generate risk level (low/medium/high/critical)
- Determine verdict (verified/trustable/caution/high_risk)

## API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|------------|------|
| POST | `/api/scan/image` | Upload image for scanning | ✅ Required |
| POST | `/api/scan/url` | Scan URL for images | ✅ Required |
| GET | `/api/scan/:scanId` | Get scan result | Optional |
| GET | `/api/scan/history` | Get user's scan history | ✅ Required |
| GET | `/api/health` | Health check | - |
| GET | `/metrics` | Prometheus metrics | - |

## Environment Variables

```env
# Required
OPENAI_API_KEY=sk-...           # OpenAI API key
SUPABASE_URL=https://...          # Supabase project URL
SUPABASE_SERVICE_KEY=eyJ...     # Supabase service role key

# Optional
UPSTASH_REDIS_REST_URL=         # Upstash Redis URL (for queue/caching)
UPSTASH_REDIS_REST_TOKEN=      # Upstash Redis token
CLOUDFLARE_R2_ACCOUNT_ID=      # R2 account ID
CLOUDFLARE_R2_ACCESS_KEY=      # R2 access key
CLOUDFLARE_R2_SECRET_KEY=     # R2 secret key
CLOUDFLARE_R2_BUCKET_NAME=    # R2 bucket name
HUGGINGFACE_API_KEY=           # HuggingFace token (for CLIP)

# Configuration
PORT=3000
ALLOWED_ORIGINS=https://...     # Comma-separated CORS origins
HTTP2_ENABLED=false           # Enable HTTP/2
NODE_ENV=development
LOG_LEVEL=info
```

## Running Locally

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your API keys

# Start development server
npm run dev

# Or start production
npm start
```

## Running with Docker

```bash
# Build and run
docker build -t neurox-backend .
docker run -p 3000:3000 --env-file .env neurox-backend

# Or with docker-compose
docker-compose up --build
```

## Deployment

### Vercel
Import the `neurox-backend` directory as a Node.js project.

### Render
Use the included `render.yaml` blueprint or configure manually:
- Build Command: `npm install`
- Start Command: `npm start`

### Custom Server
```bash
# Install Node.js 20+
# Set environment variables
# Run npm start
```

## Response Format

### Scan Result
```json
{
  "scan_id": "NRX-20260425-ABCD",
  "trust_score": 72,
  "risk_level": "medium",
  "verdict": "trustable",
  "scores": {
    "scam_risk": 28,
    "claim_credibility": 75,
    "hype_manipulation": 35,
    "launch_quality": 68,
    "brand_originality": 85,
    "visual_consistency": 92
  },
  "flags": ["high_hype_language"],
  "recommendation": "Proceed with caution. Verify claims independently.",
  "ocr_text": "...",
  "platform_data": {
    "input_type": "image",
    "analyzed_assets": 1,
    "duplicate_detected": false,
    "cache_hit": false,
    "quality_flags": []
  },
  "timestamp": "2026-04-25T12:00:00.000Z"
}
```

## Security Features

- **CORS**: Whitelist allowed origins
- **Rate Limiting**: Per-endpoint limits (10-30 req/min)
- **SSRF Protection**: Block internal/private URLs
- **Authentication**: Supabase JWT validation
- **Input Validation**: Zod schema validation

## Performance Features

- **Multi-layer Caching**: L1 (in-memory) → L2 (Redis) → L3 (Supabase)
- **Response Compression**: Gzip
- **HTTP/2**: Optional (requires SSL certificates)

## Testing

```bash
# Run unit tests
npm test

# Run specific test file
node --test tests/validate.test.js
```

## Project Structure

```
neurox-backend/
├── src/
│   ├── server.js           # Express app entry
│   ├── routes/
│   │   └── scan.js       # API routes
│   ├── modules/
│   │   ├── preprocessor.js
│   │   ├── gptScorer.js
│   │   ├── brandOriginal.js
│   │   ├── visualConsist.js
│   │   └── aggregator.js
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── rateLimit.js
│   │   ├── cache.js
│   │   └── validate.js
│   ├── services/
│   │   ├── supabase.js
│   │   ├── redis.js
│   │   ├── openai.js
│   │   ├── scraper.js
│   │   └── r2.js
│   ├── cache/
│   │   └── l1.js        # In-memory LRU cache
│   └── utils/
│       ├── phash.js
│       └── formatter.js
├── tests/
│   ├── validate.test.js
│   └── ssrf.test.js
├── Dockerfile
├── docker-compose.yml
└── vercel.json
```

## License

MIT