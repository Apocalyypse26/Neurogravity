from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from contextlib import asynccontextmanager
import httpx
from PIL import Image
import io
import math
import os
import asyncio

from services import (
    job_manager,
    tribe_service,
    preprocess_service,
    ocr_service,
    score_mapper,
    JobStatus,
    USE_REAL_TRIBE
)

limiter = Limiter(key_func=get_remote_address)

@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"[STARTUP] NEUROX Backend v2.0 starting...")
    print(f"[STARTUP] TRIBE mode: {'REAL' if USE_REAL_TRIBE else 'MOCK'}")
    print(f"[STARTUP] Rate limiting enabled")
    yield
    print("[SHUTDOWN] Cleaning up...")
    job_manager.cleanup_old_jobs(0)

app = FastAPI(title="NEUROX API", version="2.0.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/webm"}
MAX_IMAGE_SIZE_MB = 8
MAX_VIDEO_SIZE_MB = 25
MAX_VIDEO_DURATION_SEC = 20
MAX_FILES_PER_PROJECT = 10

class AnalysisRequest(BaseModel):
    upload_id: str
    media_type: str
    file_url: str

    @field_validator('upload_id')
    @classmethod
    def validate_upload_id(cls, v):
        if not v or len(v) < 1 or len(v) > 255:
            raise ValueError('Invalid upload_id length')
        if not v.replace('-', '').replace('_', '').isalnum():
            raise ValueError('upload_id contains invalid characters')
        return v

    @field_validator('media_type')
    @classmethod
    def validate_media_type(cls, v):
        allowed = ['image', 'video']
        if v.lower() not in allowed:
            raise ValueError(f'media_type must be one of: {", ".join(allowed)}')
        return v.lower()

    @field_validator('file_url')
    @classmethod
    def validate_file_url(cls, v):
        if not v:
            raise ValueError('file_url is required')
        if len(v) > 2048:
            raise ValueError('file_url exceeds maximum length')
        if not v.startswith(('http://', 'https://')):
            raise ValueError('file_url must be a valid HTTP(S) URL')
        allowed_domains = ['supabase.co', 'localhost']
        if not any(domain in v for domain in allowed_domains):
            raise ValueError('file_url must be from an allowed domain')
        return v

class CreateJobRequest(BaseModel):
    upload_id: str
    media_type: str
    file_url: str

    @field_validator('upload_id')
    @classmethod
    def validate_upload_id(cls, v):
        if not v or len(v) < 1 or len(v) > 255:
            raise ValueError('Invalid upload_id length')
        if not v.replace('-', '').replace('_', '').isalnum():
            raise ValueError('upload_id contains invalid characters')
        return v

    @field_validator('media_type')
    @classmethod
    def validate_media_type(cls, v):
        allowed = ['image', 'video']
        if v.lower() not in allowed:
            raise ValueError(f'media_type must be one of: {", ".join(allowed)}')
        return v.lower()

    @field_validator('file_url')
    @classmethod
    def validate_file_url(cls, v):
        if not v:
            raise ValueError('file_url is required')
        if len(v) > 2048:
            raise ValueError('file_url exceeds maximum length')
        if not v.startswith(('http://', 'https://')):
            raise ValueError('file_url must be a valid HTTP(S) URL')
        allowed_domains = ['supabase.co', 'localhost']
        if not any(domain in v for domain in allowed_domains):
            raise ValueError('file_url must be from an allowed domain')
        return v

class FileValidationRequest(BaseModel):
    file_name: str
    file_type: str
    file_size: int
    media_type: str

    @field_validator('file_name')
    @classmethod
    def validate_file_name(cls, v):
        if not v or len(v) < 1:
            raise ValueError('file_name is required')
        if len(v) > 255:
            raise ValueError('file_name too long')
        allowed_ext = ['.jpg', '.jpeg', '.png', '.webp', '.mp4', '.webm']
        if not any(v.lower().endswith(ext) for ext in allowed_ext):
            raise ValueError(f'file extension must be one of: {", ".join(allowed_ext)}')
        return v

    @field_validator('file_type')
    @classmethod
    def validate_file_type(cls, v):
        all_allowed = ALLOWED_IMAGE_TYPES | ALLOWED_VIDEO_TYPES
        if v.lower() not in all_allowed:
            raise ValueError(f'file_type not allowed. Allowed: {", ".join(all_allowed)}')
        return v.lower()

    @field_validator('file_size')
    @classmethod
    def validate_file_size(cls, v):
        if v <= 0:
            raise ValueError('file_size must be positive')
        max_size = MAX_VIDEO_SIZE_MB * 1024 * 1024
        if v > max_size:
            raise ValueError(f'file_size exceeds maximum of {MAX_VIDEO_SIZE_MB}MB')
        return v

    @field_validator('media_type')
    @classmethod
    def validate_media_type(cls, v):
        allowed = ['image', 'video']
        if v.lower() not in allowed:
            raise ValueError(f'media_type must be one of: {", ".join(allowed)}')
        return v.lower()

def seeded_random(seed, offset):
    x = math.sin(seed + offset) * 10000
    return x - math.floor(x)

@app.get("/api/health")
async def health_check():
    return {
        "status": "operational",
        "version": "2.0.0",
        "tribe_mode": "REAL" if USE_REAL_TRIBE else "MOCK",
        "jobs_active": len([j for j in job_manager.jobs.values() if j.status not in [JobStatus.COMPLETED, JobStatus.FAILED]])
    }

@app.post("/api/validate-upload")
@limiter.limit("30/minute")
async def validate_upload(request: Request, validation: FileValidationRequest):
    errors = []

    if validation.media_type == 'image':
        if validation.file_type not in ALLOWED_IMAGE_TYPES:
            errors.append(f'Image files must be one of: {", ".join(ALLOWED_IMAGE_TYPES)}')
        if validation.file_size > MAX_IMAGE_SIZE_MB * 1024 * 1024:
            errors.append(f'Image size exceeds {MAX_IMAGE_SIZE_MB}MB limit')
    elif validation.media_type == 'video':
        if validation.file_type not in ALLOWED_VIDEO_TYPES:
            errors.append(f'Video files must be one of: {", ".join(ALLOWED_VIDEO_TYPES)}')
        if validation.file_size > MAX_VIDEO_SIZE_MB * 1024 * 1024:
            errors.append(f'Video size exceeds {MAX_VIDEO_SIZE_MB}MB limit')

    if errors:
        raise HTTPException(status_code=400, detail={"errors": errors})

    return {"valid": True, "message": "File validation passed"}

@app.post("/api/validate-project-files")
@limiter.limit("20/minute")
async def validate_project_files(request: Request, data: dict):
    current_count = data.get("current_file_count", 0)
    if current_count >= MAX_FILES_PER_PROJECT:
        raise HTTPException(
            status_code=400,
            detail=f"Project already has maximum of {MAX_FILES_PER_PROJECT} files"
        )
    return {"valid": True, "remaining_slots": MAX_FILES_PER_PROJECT - current_count}

@app.post("/api/jobs/create")
@limiter.limit("10/minute")
async def create_analysis_job(request: Request, req: CreateJobRequest):
    existing_job = job_manager.get_job_by_upload(req.upload_id)
    if existing_job and existing_job.status == JobStatus.COMPLETED:
        return {
            "job_id": existing_job.job_id,
            "status": existing_job.status.value,
            "message": "Analysis already completed",
            "result": existing_job.result
        }
    
    if existing_job:
        return {
            "job_id": existing_job.job_id,
            "status": existing_job.status.value,
            "progress": existing_job.progress,
            "message": "Existing job found"
        }
    
    job_id = job_manager.create_job(req.upload_id, req.media_type, req.file_url)
    
    asyncio.create_task(
        job_manager.run_job(
            job_id,
            preprocess_service.process_media,
            ocr_service.extract_text,
            tribe_service.analyze,
            score_mapper.map
        )
    )
    
    return {
        "job_id": job_id,
        "status": "pending",
        "message": "Analysis job created and started"
    }

@app.get("/api/jobs/{job_id}")
@limiter.limit("30/minute")
async def get_job_status(request: Request, job_id: str):
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return job.to_dict()

@app.get("/api/jobs/upload/{upload_id}")
@limiter.limit("30/minute")
async def get_job_by_upload(request: Request, upload_id: str):
    job = job_manager.get_job_by_upload(upload_id)
    if not job:
        raise HTTPException(status_code=404, detail="No job found for this upload")
    
    return job.to_dict()

@app.post("/api/analyze")
@limiter.limit("10/minute")
async def analyze_target(request: Request, req: AnalysisRequest):
    job_id = job_manager.create_job(req.upload_id, req.media_type, req.file_url)
    
    try:
        result = await job_manager.run_job(
            job_id,
            preprocess_service.process_media,
            ocr_service.extract_text,
            tribe_service.analyze,
            score_mapper.map
        )
        return result
    except Exception as e:
        print(f"[ERROR] Analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyze-sync")
@limiter.limit("10/minute")
async def analyze_sync(request: Request, req: AnalysisRequest):
    seed = sum(ord(c) for c in req.upload_id)
    brightness_modifier = 0

    if req.media_type == "image":
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.get(req.file_url)
                if res.status_code == 200:
                    img = Image.open(io.BytesIO(res.content)).convert("L")
                    stat = sum(img.getdata()) / (img.size[0] * img.size[1])
                    brightness_modifier = (stat - 128) / 10
                elif res.status_code == 404:
                    raise HTTPException(status_code=404, detail="File not found at provided URL")
                else:
                    raise HTTPException(status_code=502, detail="Failed to fetch media file")
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="Media fetch timed out")
        except Exception as e:
            print(f"[ERROR] Failed to process image: {e}")
            raise HTTPException(status_code=422, detail="Failed to process media file")

    global_score = min(max(int(60 + (seeded_random(seed, 1) * 38) + brightness_modifier), 0), 100)
    
    sub_scores = [
        { "name": "Attention Pull", "val": min(max(int(40 + (seeded_random(seed, 2) * 59) + brightness_modifier), 0), 100) },
        { "name": "Visual Impact", "val": min(max(int(40 + (seeded_random(seed, 3) * 59) + (brightness_modifier * 2)), 0), 100) },
        { "name": "Text Clarity", "val": min(max(int(40 + (seeded_random(seed, 4) * 59)), 0), 100) },
        { "name": "Meme Strength", "val": min(max(int(40 + (seeded_random(seed, 5) * 59)), 0), 100) },
        { "name": "Crypto Relevance", "val": min(max(int(40 + (seeded_random(seed, 6) * 59)), 0), 100) }
    ]

    conf_seed = seeded_random(seed, 7)
    confidence = (
        { "text": "HIGH CONFIDENCE", "color": "#10b981" } if conf_seed > 0.65 else 
        { "text": "MEDIUM CONFIDENCE", "color": "#f59e0b" } if conf_seed > 0.3 else 
        { "text": "EXPERIMENTAL", "color": "#8b5cf6" }
    )

    ranks = [
        "[ALPHA] Top 3% of X/Twitter Shitpost Meta", 
        "[WARNING] Low visibility ranking on TikTok algos", 
        "[OPTIMAL] High retention span expected", 
        "[BETA] Needs memetic structural refinement", 
        "[CRITICAL] Extremely volatile engagement trap"
    ]
    rank = ranks[math.floor(seeded_random(seed, 8) * len(ranks))]

    fixes = [
        "Increase shadow contrast by 15% to trigger higher dopamine retention.",
        "Crop outer margins by 10% to force focal entity recognition.",
        f"Saturation levels read as slightly {'bright' if brightness_modifier > 0 else 'dark'}. Deep-fry metrics require inversion.",
        "Text layout conflicts with visual anchor. Center or increase weight by 200.",
        "Cryptic elements too subtle for mass adoption. Add glowing eyes or explicit ticker.",
        "Aspect ratio triggers algorithmic throttling. Remount to 4:5 for feed dominance."
    ]
    fix1 = fixes[math.floor(seeded_random(seed, 9) * len(fixes))]
    fix2 = fixes[(math.floor(seeded_random(seed, 9) * len(fixes)) + 1) % len(fixes)]
    fix3 = fixes[(math.floor(seeded_random(seed, 9) * len(fixes)) + 2) % len(fixes)]

    return {
        "globalScore": global_score,
        "subScores": sub_scores,
        "confidence": confidence,
        "rank": rank,
        "fixes": [fix1, fix2, fix3]
    }

@app.get("/api/tribe/info")
async def tribe_info():
    return {
        "mode": "REAL" if USE_REAL_TRIBE else "MOCK",
        "version": "v2.0",
        "description": "TRIBE v2 mapping pipeline for neuro-virality analysis",
        "endpoints": {
            "/api/jobs/create": "Create async analysis job",
            "/api/jobs/{job_id}": "Get job status",
            "/api/jobs/upload/{upload_id}": "Get job by upload ID",
            "/api/analyze": "Sync analyze with TRIBE pipeline",
            "/api/analyze-sync": "Legacy sync analyze"
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
