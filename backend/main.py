from fastapi import FastAPI, HTTPException, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response, StreamingResponse, JSONResponse
from pydantic import BaseModel, field_validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from contextlib import asynccontextmanager
import logging
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("neurox")


def api_error(status_code: int, message: str, code: str = "API_ERROR", field: str | None = None):
    """Return a standardized JSON error response."""
    detail = {"code": code, "message": message}
    if field:
        detail["field"] = field
    raise HTTPException(status_code=status_code, detail=detail)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; font-src 'self'"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        return response

class RequestSizeMiddleware(BaseHTTPMiddleware):
    MAX_BODY_SIZE = 10 * 1024 * 1024  # 10MB

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > self.MAX_BODY_SIZE:
            return Response(status_code=413, content="Request body too large")
        body = await request.body()
        if len(body) > self.MAX_BODY_SIZE:
            return Response(status_code=413, content="Request body too large")
        response = await call_next(request)
        return response
import httpx
from PIL import Image
import io
import json
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
from services.tribe_service import is_url_safe
from services.stripe_service import stripe_service, CREDIT_PACKAGES, SUBSCRIPTION_PLANS
from services.video_validation import validate_video_url, VideoValidationResult
from services.retry import retry_with_backoff

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
    logger.info("NEUROX Backend v2.0 starting...")
    logger.info("TRIBE mode: %s", 'REAL' if USE_REAL_TRIBE else 'MOCK')
    logger.info("Rate limiting enabled")
    
    jwt_secret = os.getenv("SUPABASE_JWT_SECRET", "")
    if not jwt_secret or jwt_secret == "YOUR_JWT_SECRET_HERE":
        env = os.getenv("ENVIRONMENT", "development")
        if env == "production":
            logger.critical("SUPABASE_JWT_SECRET is not configured! Authentication will fail.")
            logger.critical("Set your Supabase JWT secret from: Project Settings -> API -> JWT Secret")
            raise RuntimeError("Missing required SUPABASE_JWT_SECRET in production")
        else:
            logger.warning("SUPABASE_JWT_SECRET is not configured! Authentication will fail in production.")
            logger.warning("Set your Supabase JWT secret from: Project Settings -> API -> JWT Secret")
    
    await job_manager.start()
    yield
    logger.info("Shutting down...")
    job_manager.stop_cleanup_scheduler()
    await job_manager.cleanup_old_jobs(0)

app = FastAPI(title="NEUROX API", version="2.0.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(RequestSizeMiddleware)
app.add_middleware(SecurityHeadersMiddleware)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Ensure all HTTPException responses return consistent JSON format."""
    if isinstance(exc.detail, dict):
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": "HTTP_ERROR", "message": str(exc.detail)}
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch all unhandled exceptions and return standardized error."""
    logger.error("Unhandled exception: %s", exc, exc_info=True)
    env = os.getenv("ENVIRONMENT", "development")
    message = "Internal server error" if env == "production" else str(exc)
    return JSONResponse(
        status_code=500,
        content={"code": "SERVER_ERROR", "message": message}
    )

def get_cors_origins() -> list[str]:
    env = os.getenv("ENVIRONMENT", "development")
    cors_config = os.getenv("CORS_ORIGINS", "")
    
    if not cors_config:
        if env == "production":
            raise ValueError("CORS_ORIGINS must be configured in production")
        logger.warning("No CORS_ORIGINS configured - defaulting to localhost only")
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
MAX_IMAGE_SIZE_MB = int(os.getenv("MAX_IMAGE_SIZE_MB", "8"))
MAX_VIDEO_SIZE_MB = int(os.getenv("MAX_VIDEO_SIZE_MB", "25"))
MAX_VIDEO_DURATION_SEC = int(os.getenv("MAX_VIDEO_DURATION_SEC", "20"))
MAX_FILES_PER_PROJECT = int(os.getenv("MAX_FILES_PER_PROJECT", "10"))

class JobRequestBase(BaseModel):
    upload_id: str
    user_id: str
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

    @field_validator('user_id')
    @classmethod
    def validate_user_id(cls, v):
        if not v or len(v) < 1:
            raise ValueError('user_id is required')
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
        if not is_url_safe(v):
            raise ValueError('file_url must be from an allowed domain (Supabase storage)')
        return v

class AnalysisRequest(JobRequestBase):
    pass

class CreateJobRequest(JobRequestBase):
    pass

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


class VideoValidationRequest(BaseModel):
    file_url: str
    max_duration: int = 20

    @field_validator('file_url')
    @classmethod
    def validate_file_url(cls, v):
        if not v:
            raise ValueError('file_url is required')
        if not v.startswith(('http://', 'https://')):
            raise ValueError('file_url must be a valid HTTP(S) URL')
        if not is_url_safe(v):
            raise ValueError('file_url must be from an allowed domain (Supabase storage)')
        return v

    @field_validator('max_duration')
    @classmethod
    def validate_max_duration(cls, v):
        if v <= 0 or v > 300:
            raise ValueError('max_duration must be between 1 and 300 seconds')
        return v


def seeded_random(seed, offset):
    x = math.sin(seed + offset) * 10000
    return x - math.floor(x)

@app.get("/api/health")
async def health_check():
    status = "operational"
    checks = {}
    
    try:
        supabase_url = os.getenv("SUPABASE_URL", "")
        if supabase_url:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{supabase_url}/rest/v1/")
                checks["supabase"] = "ok" if resp.status_code < 500 else f"error: {resp.status_code}"
        else:
            checks["supabase"] = "not_configured"
    except Exception as e:
        checks["supabase"] = f"error: {str(e)}"
        status = "degraded"
    
    try:
        openai_key = os.getenv("OPENAI_API_KEY", "")
        checks["openai"] = "configured" if openai_key else "not_configured"
    except Exception:
        checks["openai"] = "unknown"
    
    active_jobs = len([j for j in job_manager.jobs.values() if j.status not in [JobStatus.COMPLETED, JobStatus.FAILED]])
    
    return {
        "status": status,
        "version": "2.0.0",
        "tribe_mode": "REAL" if USE_REAL_TRIBE else "MOCK",
        "jobs_active": active_jobs,
        "checks": checks
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
        api_error(400, "; ".join(errors), code="VALIDATION_ERROR")

    return {"valid": True, "message": "File validation passed"}

@app.post("/api/validate-project-files")
@limiter.limit("20/minute")
async def validate_project_files(request: Request, data: dict):
    current_count = data.get("current_file_count", 0)
    if current_count >= MAX_FILES_PER_PROJECT:
        api_error(
            400,
            detail=f"Project already has maximum of {MAX_FILES_PER_PROJECT} files"
        )
    return {"valid": True, "remaining_slots": MAX_FILES_PER_PROJECT - current_count}


@app.post("/api/validate-video")
@user_limiter.limit("30/minute")
async def validate_video(request: Request, video_req: VideoValidationRequest):
    """
    Validate video URL using ffprobe.
    Checks duration, codec, and basic integrity.
    This is a server-side validation to prevent users from bypassing limits.
    """
    logger.info("Validating video: %s", video_req.file_url)
    
    result = validate_video_url(video_req.file_url, video_req.max_duration)
    
    if not result.valid:
        logger.warning("Video validation failed: %s", result.errors)
        raise HTTPException(
            status_code=400,
            detail={
                "valid": False,
                "errors": result.errors,
                "message": "Video validation failed"
            }
        )
    
    logger.info("Video validation passed: duration=%ss, codec=%s", result.duration, result.codec)
    
    return {
        "valid": True,
        "duration": result.duration,
        "width": result.width,
        "height": result.height,
        "codec": result.codec,
        "message": "Video validation passed"
    }


@app.post("/api/jobs/create")
@user_limiter.limit("10/minute")
async def create_analysis_job(request: Request, req: CreateJobRequest):
    auth_header = request.headers.get("authorization", "")
    auth_user_id = auth_service.get_user_id_from_token(auth_header)
    
    if auth_user_id and auth_user_id != req.user_id:
        api_error(403, "User ID mismatch", code="AUTH_ERROR")
    
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
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            supabase_url = os.getenv("SUPABASE_URL", "")
            supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
            response = await client.post(
                f"{supabase_url}/rest/v1/rpc/consume_credit",
                headers={
                    "apikey": supabase_key,
                    "Authorization": f"Bearer {supabase_key}",
                    "Content-Type": "application/json"
                },
                json={}
            )
            if response.status_code == 200:
                has_credits = response.json()
            else:
                has_credits = False
    except Exception as e:
        logger.error("Failed to check credits: %s", e)
        has_credits = False
    
    if not has_credits:
        api_error(402, "Insufficient credits. Please purchase more scans.", code="INSUFFICIENT_CREDITS")
    
    job_id = await job_manager.create_job(req.upload_id, req.user_id, req.media_type, req.file_url)
    
    existing_job = job_manager.get_job(job_id)
    if existing_job and existing_job.status in (JobStatus.COMPLETED, JobStatus.PREPROCESSING, JobStatus.OCR_EXTRACTING, JobStatus.TRIBE_ANALYZING, JobStatus.MAPPING_SCORES):
        return {
            "job_id": job_id,
            "status": existing_job.status.value,
            "message": "Existing job found",
            "progress": existing_job.progress,
            "result": existing_job.result if existing_job.status == JobStatus.COMPLETED else None
        }
    
    task = asyncio.create_task(
        job_manager.run_job(
            job_id,
            preprocess_service.process_media,
            ocr_service.extract_text,
            tribe_service.analyze,
            score_mapper.map
        )
    )
    task.add_done_callback(
        lambda t: logger.error("Background task %s failed: %s", job_id, t.exception())
        if t.exception() else None
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
        api_error(404, "Job not found", code="NOT_FOUND")
    
    return job.to_dict()


@app.get("/api/jobs/{job_id}/stream")
async def stream_job_status(request: Request, job_id: str, token: str = None):
    """
    SSE endpoint for real-time job status updates.
    Requires authentication via Authorization header or short-lived job_token.
    """
    user_id = None
    
    if token:
        job_token = auth_service.verify_job_token(token)
        if job_token and job_token.get("job_id") == job_id:
            user_id = job_token.get("user_id")
    
    if not user_id:
        auth_header = request.headers.get("authorization", "")
        user_id = auth_service.get_user_id_from_token(auth_header)
    
    if not user_id:
        api_error(401, "Authentication required", code="AUTH_ERROR")
    
    async def event_generator():
        last_status = None
        last_progress = None
        check_count = 0
        
        while check_count < 600:
            if await request.is_disconnected():
                break
            
            job = job_manager.get_job(job_id)
            
            if not job:
                yield f"data: {{\"error\": \"Job not found\", \"type\": \"error\"}}\n\n"
                break
            
            job_dict = job.to_dict()
            
            if job.status.value != last_status or job.progress != last_progress:
                yield f"data: {json.dumps(job_dict)}\n\n"
                last_status = job.status.value
                last_progress = job.progress
            
            if job.status in [JobStatus.COMPLETED, JobStatus.FAILED]:
                yield f"data: {json.dumps({**job_dict, 'type': job.status.value})}\n\n"
                break
            
            check_count += 1
            await asyncio.sleep(0.5)
        
        yield f"data: {{\"type\": \"done\", \"reason\": \"timeout\"}}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@app.get("/api/jobs/{job_id}/token")
@limiter.limit("60/minute")
async def get_job_token(request: Request, job_id: str):
    """
    Get a short-lived token for SSE reconnection.
    Allows reconnection without full re-authentication.
    """
    auth_header = request.headers.get("authorization", "")
    user_id = auth_service.get_user_id_from_token(auth_header)
    
    if not user_id:
        api_error(401, "Authentication required", code="AUTH_ERROR")
    
    job = job_manager.get_job(job_id)
    if not job:
        api_error(404, "Job not found", code="NOT_FOUND")
    
    if job.user_id != user_id:
        api_error(403, "Not authorized to access this job", code="AUTH_ERROR")
    
    job_token = auth_service.create_job_token(job_id, user_id, expires_in=3600)
    
    return {
        "job_id": job_id,
        "token": job_token,
        "expires_in": 3600
    }


@app.get("/api/jobs/upload/{upload_id}")
@limiter.limit("30/minute")
async def get_job_by_upload(request: Request, upload_id: str):
    job = job_manager.get_job_by_upload(upload_id)
    if not job:
        api_error(404, "No job found for this upload", code="NOT_FOUND")
    
    return job.to_dict()

@app.post("/api/analyze")
@user_limiter.limit("10/minute")
async def analyze_target(request: Request, req: AnalysisRequest):
    auth_header = request.headers.get("authorization", "")
    auth_user_id = auth_service.get_user_id_from_token(auth_header)
    
    if auth_user_id and auth_user_id != req.user_id:
        api_error(403, "User ID mismatch", code="AUTH_ERROR")
    
    use_real_tribe = os.getenv("USE_REAL_TRIBE", "false").lower() == "true"
    
    logger.info(f"[ANALYZE] Request: upload_id={req.upload_id}, media_type={req.media_type}")
    logger.info(f"[ANALYZE] USE_REAL_TRIBE={use_real_tribe}")
    logger.info(f"[ANALYZE] file_url={req.file_url[:100]}...")
    
    # If USE_REAL_TRIBE is false, use mock
    if not use_real_tribe:
        logger.info(f"[ANALYZE] Using mock analysis (USE_REAL_TRIBE=false)")
        return await analyze_sync(request, req)
    
    # Try the real pipeline
    try:
        job_id = await job_manager.create_job(req.upload_id, req.user_id, req.media_type, req.file_url)
        logger.info(f"[ANALYZE] Created job: {job_id}")
        
        existing_job = job_manager.get_job(job_id)
        if existing_job and existing_job.status == JobStatus.COMPLETED:
            logger.info(f"[ANALYZE] Returning cached result for job: {job_id}")
            return existing_job.result
        
        if existing_job and existing_job.status != JobStatus.PENDING:
            api_error(409, "Job already in progress", code="CONFLICT")
        
        logger.info(f"[ANALYZE] Running full job pipeline for: {job_id}")
        result = await job_manager.run_job(
            job_id,
            preprocess_service.process_media,
            ocr_service.extract_text,
            tribe_service.analyze,
            score_mapper.map
        )
        logger.info(f"[ANALYZE] Job completed successfully: {job_id}")
        return result
        
    except Exception as e:
        logger.error(f"[ANALYZE] Pipeline failed: {type(e).__name__}: {str(e)}")
        # Don't fallback silently - raise the error so frontend knows it failed
        api_error(500, f"Analysis pipeline failed: {str(e)}", code="SERVER_ERROR")

@app.post("/api/analyze-sync")
@limiter.limit("10/minute")
async def analyze_sync(request: Request, req: AnalysisRequest):
    """
    DEVELOPMENT-ONLY ENDPOINT.
    Uses seeded random / placeholder data instead of real TRIBE analysis.
    Blocked in production to prevent returning fake results to users.
    For production analysis, use POST /api/analyze or POST /api/jobs/create.
    """
    env = os.getenv("ENVIRONMENT", "development")
    if env == "production":
        api_error(403, "/api/analyze-sync is disabled in production. Use /api/analyze or /api/jobs/create instead.", code="FEATURE_DISABLED")

    seed = sum(ord(c) for c in req.upload_id)
    brightness_modifier = 0

    if req.media_type == "image":
        try:
            async def _fetch_image():
                async with httpx.AsyncClient(timeout=30.0) as client:
                    res = await client.get(req.file_url)
                    res.raise_for_status()
                    return res.content
            
            image_content = await retry_with_backoff(_fetch_image)
            img = Image.open(io.BytesIO(image_content)).convert("L")
            stat = sum(img.getdata()) / (img.size[0] * img.size[1])
            brightness_modifier = (stat - 128) / 10
        except httpx.TimeoutException:
            api_error(504, "Media fetch timed out", code="TIMEOUT")
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                api_error(404, "File not found at provided URL", code="NOT_FOUND")
            api_error(502, "Failed to fetch media file", code="BAD_GATEWAY")
        except Exception as e:
            logger.error("Failed to process image: %s", e)
            api_error(422, "Failed to process media file", code="PROCESSING_ERROR")

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
    auth_header = request.headers.get("authorization", "")
    auth_user_id = auth_service.get_user_id_from_token(auth_header)
    
    if auth_user_id and auth_user_id != req.user_id:
        api_error(403, "User ID mismatch. Please use your authenticated user ID.", code="AUTH_ERROR")
    
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
            api_error(400, "Invalid package_id", code="VALIDATION_ERROR")

        return result
    except ValueError as e:
        api_error(400, str(e), code="VALIDATION_ERROR")
    except Exception as e:
        logger.error("Checkout error: %s", e)
        api_error(500, "Failed to create checkout session", code="SERVER_ERROR")


@app.get("/api/checkout/status/{session_id}")
@limiter.limit("30/minute")
async def get_checkout_status(request: Request, session_id: str):
    try:
        result = stripe_service.get_session(session_id)
        return result
    except ValueError as e:
        api_error(400, str(e), code="VALIDATION_ERROR")
    except Exception as e:
        logger.error("Checkout status error: %s", e)
        api_error(500, "Failed to retrieve checkout status", code="SERVER_ERROR")


class VerifyPaymentRequest(BaseModel):
    session_id: str


@app.post("/api/checkout/verify-and-credit")
@user_limiter.limit("10/minute")
async def verify_and_credit(request: Request, req: VerifyPaymentRequest):
    """
    Verify payment and add credits/subscription.
    Called by frontend after Stripe redirect (when webhooks not available).
    """
    auth_header = request.headers.get("authorization", "")
    user_id = auth_service.get_user_id_from_token(auth_header)
    
    if not user_id:
        api_error(401, "Authentication required", code="AUTH_ERROR")
    
    try:
        result = await stripe_service.verify_session_and_credit(req.session_id, user_id)
        
        if result.get("success"):
            return result
        else:
            api_error(400, result.get("error", "Verification failed"), code="VALIDATION_ERROR")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Verify and credit error: %s", e)
        api_error(500, "Failed to verify payment", code="SERVER_ERROR")


@app.get("/api/subscription/status")
@limiter.limit("30/minute")
async def get_subscription_status(request: Request):
    """Get current user's subscription status"""
    try:
        auth_header = request.headers.get("authorization", "")
        user_id = auth_service.get_user_id_from_token(auth_header)
        
        if not user_id:
            api_error(401, "Not authenticated", code="AUTH_ERROR")
        
        supabase_url = os.getenv("SUPABASE_URL", "")
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{supabase_url}/rest/v1/rpc/get_user_subscription",
                headers={
                    "apikey": supabase_key,
                    "Authorization": f"Bearer {supabase_key}",
                    "Content-Type": "application/json"
                },
                json={}
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                return {"has_subscription": False, "error": "Failed to fetch subscription"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Subscription status error: %s", e)
        return {"has_subscription": False, "error": str(e)}


@app.post("/api/subscription/cancel")
@limiter.limit("10/minute")
async def cancel_subscription(request: Request):
    """Cancel current user's subscription at period end"""
    try:
        auth_header = request.headers.get("authorization", "")
        user_id = auth_service.get_user_id_from_token(auth_header)
        
        if not user_id:
            api_error(401, "Not authenticated", code="AUTH_ERROR")
        
        # Get user's subscription from DB
        supabase_url = os.getenv("SUPABASE_URL", "")
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{supabase_url}/rest/v1/user_subscriptions",
                headers={
                    "apikey": supabase_key,
                    "Authorization": f"Bearer {supabase_key}",
                    "Content-Type": "application/json"
                },
                params={
                    "user_id": f"eq.{user_id}",
                    "status": "eq.active",
                    "select": "stripe_subscription_id"
                }
            )
            
            if response.status_code == 200 and response.json():
                sub = response.json()[0]
                stripe_sub_id = sub.get("stripe_subscription_id")
                
                if stripe_sub_id and stripe_service.enabled:
                    import stripe as stripe_lib
                    stripe_lib.api_key = os.getenv("STRIPE_SECRET_KEY", "")
                    try:
                        stripe_lib.Subscription.modify(
                            stripe_sub_id,
                            cancel_at_period_end=True
                        )
                    except Exception as e:
                        logger.error("Failed to cancel Stripe subscription: %s", e)
                
                return {"success": True, "message": "Subscription will be cancelled at period end"}
            else:
                api_error(404, "No active subscription found", code="NOT_FOUND")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Subscription cancellation error: %s", e)
        api_error(500, "Failed to cancel subscription", code="SERVER_ERROR")


@app.post("/api/webhook/stripe")
async def stripe_webhook(request: Request, stripe_signature: str = Header(None)):
    try:
        payload = await request.body()
        result = await stripe_service.handle_webhook_async(payload, stripe_signature)
        logger.info("Webhook processed: %s", result)
    except ValueError as e:
        logger.error("Webhook error: %s", e)
        api_error(400, str(e), code="VALIDATION_ERROR")
    except Exception as e:
        logger.error("Webhook error: %s", e)
        api_error(400, "Webhook processing failed", code="WEBHOOK_ERROR")


# --- Admin Endpoints ---

class AdminFeedbackRequest(BaseModel):
    upload_id: str
    feedback: str

    @field_validator('upload_id')
    @classmethod
    def validate_upload_id(cls, v):
        if not v or not v.strip():
            raise ValueError('upload_id is required')
        if len(v) > 255:
            raise ValueError('upload_id exceeds maximum length of 255')
        return v.strip()

    @field_validator('feedback')
    @classmethod
    def validate_feedback(cls, v):
        if not v or not v.strip():
            raise ValueError('Feedback cannot be empty')
        if len(v) > 2000:
            raise ValueError('Feedback exceeds 2000 character limit')
        return v.strip()

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
        logger.error("Admin verify error: %s", e)
        api_error(500, "Failed to verify admin status", code="SERVER_ERROR")


@app.get("/api/admin/uploads")
@user_limiter.limit("30/minute")
async def get_admin_uploads(request: Request, page: int = 1, limit: int = 50):
    """
    Get all uploads for admin dashboard with pagination.
    Requires admin privileges.
    """
    try:
        # Verify admin
        user = await auth_service.get_current_user(request.headers.get("authorization"))
        if not await admin_service.verify_admin(user["user_id"]):
            api_error(403, "Admin access required", code="AUTH_ERROR")
        
        # Validate pagination params
        page = max(1, page)
        limit = min(max(1, limit), 200)  # Cap at 200 per page
        
        # Get all uploads
        uploads = await admin_service.get_all_uploads()
        
        # Apply pagination
        total = len(uploads)
        start = (page - 1) * limit
        end = start + limit
        paginated_uploads = uploads[start:end]
        
        return {
            "uploads": paginated_uploads,
            "count": len(paginated_uploads),
            "total": total,
            "page": page,
            "limit": limit,
            "pages": max(1, (total + limit - 1) // limit)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Admin uploads error: %s", e)
        api_error(500, "Failed to fetch uploads", code="SERVER_ERROR")


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
            api_error(403, "Admin access required", code="AUTH_ERROR")
        
        # Sanitize feedback to prevent stored XSS
        sanitized_feedback = (
            req.feedback
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&#x27;")
        )
        
        # Update feedback
        success = await admin_service.update_upload_feedback(req.upload_id, sanitized_feedback)
        
        if success:
            return {"success": True, "message": "Feedback submitted successfully"}
        else:
            api_error(500, "Failed to submit feedback", code="SERVER_ERROR")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Admin feedback error: %s", e)
        api_error(500, "Failed to submit feedback", code="SERVER_ERROR")


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
            api_error(403, "Admin access required", code="AUTH_ERROR")
        
        # Get stats
        stats = await admin_service.get_upload_stats()
        
        return stats
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Admin stats error: %s", e)
        api_error(500, "Failed to fetch statistics", code="SERVER_ERROR")


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
            api_error(403, "Admin access required", code="AUTH_ERROR")
        
        # Get upload
        upload = await admin_service.get_upload_by_id(upload_id)
        
        if upload:
            return upload
        else:
            api_error(404, "Upload not found", code="NOT_FOUND")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Admin get upload error: %s", e)
        api_error(500, "Failed to fetch upload", code="SERVER_ERROR")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, timeout_graceful_shutdown=30)
