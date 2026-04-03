from fastapi import FastAPI, HTTPException, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from pydantic import BaseModel, field_validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from contextlib import asynccontextmanager


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; font-src 'self'"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        return response
import httpx
from PIL import Image
import io
import math
import os
import asyncio
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

from services import (
    job_manager,
    tribe_service,
    preprocess_service,
    ocr_service,
    score_mapper,
    JobStatus,
    USE_REAL_TRIBE,
    auth_service,
    admin_service
)
from services.stripe_service import stripe_service, CREDIT_PACKAGES, SUBSCRIPTION_PLANS

limiter = Limiter(key_func=get_remote_address)

def get_user_based_key(request: Request) -> str:
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            from services.auth_service import auth_service
            user_id = auth_service.get_user_id_from_token(auth_header)
            if user_id:
                return f"user:{user_id}"
        except (ImportError, AttributeError):
            pass
    return get_remote_address(request)


user_limiter = Limiter(key_func=get_user_based_key)

@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"[STARTUP] NEUROX Backend v2.0 starting...")
    print(f"[STARTUP] TRIBE mode: {'REAL' if USE_REAL_TRIBE else 'MOCK'}")
    print(f"[STARTUP] Rate limiting enabled")
    job_manager.start_cleanup_scheduler()
    yield
    print("[SHUTDOWN] Cleaning up...")
    job_manager.stop_cleanup_scheduler()
    job_manager.cleanup_old_jobs(0)

app = FastAPI(title="NEUROX API", version="2.0.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

def get_cors_origins() -> list[str]:
    env = os.getenv("ENVIRONMENT", "development")
    cors_config = os.getenv("CORS_ORIGINS", "")
    
    if not cors_config:
        if env == "production":
            raise ValueError("CORS_ORIGINS must be configured in production")
        print("[CORS] WARNING: No CORS_ORIGINS configured - defaulting to localhost only")
        return ["http://localhost:5173", "http://127.0.0.1:5173"]
    
    origins = [o.strip() for o in cors_config.split(",") if o.strip()]
    
    if env == "production":
        for origin in origins:
            if "*" in origin:
                raise ValueError(f"Wildcard CORS origins not allowed in production: {origin}")
    
    return origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
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
@user_limiter.limit("10/minute")
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
@user_limiter.limit("10/minute")
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
            "/api/analyze-sync": "Legacy sync analyze",
            "/api/packages": "List available credit packages",
            "/api/checkout": "Create Stripe checkout session",
            "/api/checkout/status/{session_id}": "Check checkout status",
            "/api/webhook/stripe": "Stripe webhook endpoint"
        }
    }


# --- Stripe Payment Endpoints ---

class CheckoutRequest(BaseModel):
    package_id: str
    user_id: str
    email: str
    success_url: str
    cancel_url: str

    @field_validator('package_id')
    @classmethod
    def validate_package_id(cls, v):
        valid = list(CREDIT_PACKAGES.keys()) + list(SUBSCRIPTION_PLANS.keys())
        if v not in valid:
            raise ValueError(f'package_id must be one of: {", ".join(valid)}')
        return v

    @field_validator('email')
    @classmethod
    def validate_email(cls, v):
        if not v or '@' not in v:
            raise ValueError('Valid email required')
        return v


@app.get("/api/packages")
@limiter.limit("60/minute")
async def get_packages(request: Request):
    return {
        "credit_packages": {
            k: {
                "name": v["name"],
                "credits": v["credits"],
                "price_display": v["price_display"],
            }
            for k, v in CREDIT_PACKAGES.items()
        },
        "subscription_plans": {
            k: {
                "name": v["name"],
                "credits_per_month": v["credits_per_month"],
                "price_display": v["price_display"],
            }
            for k, v in SUBSCRIPTION_PLANS.items()
        },
        "stripe_enabled": stripe_service.enabled,
    }


@app.post("/api/checkout")
@user_limiter.limit("5/minute")
async def create_checkout(request: Request, req: CheckoutRequest):
    try:
        if req.package_id in CREDIT_PACKAGES:
            result = stripe_service.create_checkout_session(
                package_id=req.package_id,
                user_id=req.user_id,
                email=req.email,
                success_url=req.success_url,
                cancel_url=req.cancel_url,
            )
        elif req.package_id in SUBSCRIPTION_PLANS:
            result = stripe_service.create_subscription_checkout(
                plan_id=req.package_id,
                user_id=req.user_id,
                email=req.email,
                success_url=req.success_url,
                cancel_url=req.cancel_url,
            )
        else:
            raise HTTPException(status_code=400, detail="Invalid package_id")

        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[CHECKOUT ERROR] {e}")
        raise HTTPException(status_code=500, detail="Failed to create checkout session")


@app.get("/api/checkout/status/{session_id}")
@limiter.limit("30/minute")
async def get_checkout_status(request: Request, session_id: str):
    try:
        result = stripe_service.get_session(session_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[CHECKOUT STATUS ERROR] {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve checkout status")


@app.post("/api/webhook/stripe")
async def stripe_webhook(request: Request, stripe_signature: str = Header(None)):
    try:
        payload = await request.body()
        result = stripe_service.handle_webhook(payload, stripe_signature)
        print(f"[WEBHOOK] Processed: {result}")
        return {"received": True, "result": result}
    except ValueError as e:
        print(f"[WEBHOOK ERROR] {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[WEBHOOK ERROR] {e}")
        raise HTTPException(status_code=400, detail="Webhook processing failed")


# --- Admin Endpoints ---

class AdminFeedbackRequest(BaseModel):
    upload_id: str
    feedback: str

@app.get("/api/admin/verify")
@limiter.limit("30/minute")
async def verify_admin_status(request: Request):
    """
    Verify if the current user is an admin.
    This endpoint requires a valid JWT token in the Authorization header.
    """
    try:
        # Get user from JWT token
        user = await auth_service.get_current_user(request.headers.get("authorization"))
        user_id = user["user_id"]
        
        # Check if user is admin
        is_admin = await admin_service.verify_admin(user_id)
        
        return {
            "is_admin": is_admin,
            "user_id": user_id
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ADMIN VERIFY ERROR] {e}")
        raise HTTPException(status_code=500, detail="Failed to verify admin status")


@app.get("/api/admin/uploads")
@user_limiter.limit("30/minute")
async def get_admin_uploads(request: Request):
    """
    Get all uploads for admin dashboard.
    Requires admin privileges.
    """
    try:
        # Verify admin
        user = await auth_service.get_current_user(request.headers.get("authorization"))
        if not await admin_service.verify_admin(user["user_id"]):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        # Get all uploads
        uploads = await admin_service.get_all_uploads()
        
        return {
            "uploads": uploads,
            "count": len(uploads)
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ADMIN UPLOADS ERROR] {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch uploads")


@app.post("/api/admin/feedback")
@user_limiter.limit("30/minute")
async def submit_admin_feedback(request: Request, req: AdminFeedbackRequest):
    """
    Submit admin feedback for an upload.
    Requires admin privileges.
    """
    try:
        # Verify admin
        user = await auth_service.get_current_user(request.headers.get("authorization"))
        if not await admin_service.verify_admin(user["user_id"]):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        # Update feedback
        success = await admin_service.update_upload_feedback(req.upload_id, req.feedback)
        
        if success:
            return {"success": True, "message": "Feedback submitted successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to submit feedback")
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ADMIN FEEDBACK ERROR] {e}")
        raise HTTPException(status_code=500, detail="Failed to submit feedback")


@app.get("/api/admin/stats")
@user_limiter.limit("30/minute")
async def get_admin_stats(request: Request):
    """
    Get platform-wide statistics for admin dashboard.
    Requires admin privileges.
    """
    try:
        # Verify admin
        user = await auth_service.get_current_user(request.headers.get("authorization"))
        if not await admin_service.verify_admin(user["user_id"]):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        # Get stats
        stats = await admin_service.get_upload_stats()
        
        return stats
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ADMIN STATS ERROR] {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch statistics")


@app.get("/api/admin/upload/{upload_id}")
@user_limiter.limit("30/minute")
async def get_admin_upload(request: Request, upload_id: str):
    """
    Get a single upload by ID for admin view.
    Requires admin privileges.
    """
    try:
        # Verify admin
        user = await auth_service.get_current_user(request.headers.get("authorization"))
        if not await admin_service.verify_admin(user["user_id"]):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        # Get upload
        upload = await admin_service.get_upload_by_id(upload_id)
        
        if upload:
            return upload
        else:
            raise HTTPException(status_code=404, detail="Upload not found")
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ADMIN GET UPLOAD ERROR] {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch upload")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
