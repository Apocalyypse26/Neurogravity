import asyncio
import uuid
import time
import os
import httpx
import logging
from typing import Dict, Optional, Any, Callable
from enum import Enum
from dataclasses import dataclass, field
from datetime import datetime
from .media_cache import media_cache
from .retry import retry_with_backoff

logger = logging.getLogger("neurox")

class JobStatus(Enum):
    PENDING = "pending"
    PREPROCESSING = "preprocessing"
    OCR_EXTRACTING = "ocr_extracting"
    TRIBE_ANALYZING = "tribe_analyzing"
    MAPPING_SCORES = "mapping_scores"
    COMPLETED = "completed"
    FAILED = "failed"

@dataclass
class AnalysisJob:
    job_id: str
    upload_id: str
    user_id: str
    media_type: str
    file_url: str
    status: JobStatus
    progress: int
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "job_id": self.job_id,
            "upload_id": self.upload_id,
            "user_id": self.user_id,
            "media_type": self.media_type,
            "file_url": self.file_url,
            "status": self.status.value,
            "progress": self.progress,
            "result": self.result,
            "error": self.error,
            "created_at": self.created_at,
            "updated_at": self.updated_at
        }

class JobManager:
    def __init__(self):
        self.jobs: Dict[str, AnalysisJob] = {}
        self._running_tasks: Dict[str, asyncio.Task] = {}
        self._cleanup_task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()
        self._cleanup_interval = int(os.getenv("JOB_CLEANUP_INTERVAL_SECONDS", "300"))
        self._max_job_age = int(os.getenv("MAX_JOB_AGE_SECONDS", "3600"))
        self._download_timeout = float(os.getenv("MEDIA_DOWNLOAD_TIMEOUT", "30"))
        self._preprocess_timeout = float(os.getenv("PREPROCESS_TIMEOUT", "60"))
        self._ocr_timeout = float(os.getenv("OCR_TIMEOUT", "120"))
        self._tribe_timeout = float(os.getenv("TRIBE_TIMEOUT", "60"))
        
        self._supabase_url = os.getenv("SUPABASE_URL", "")
        self._supabase_service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        self._db_enabled = bool(self._supabase_url and self._supabase_service_key)
        
        if self._db_enabled:
            logger.info("[JOB_MANAGER] Database persistence enabled")
        else:
            logger.warning("[JOB_MANAGER] WARNING: Running without database persistence (SUPABASE_SERVICE_ROLE_KEY not set)")
        
        logger.info(f"[JOB_MANAGER] Initialized (cleanup every {self._cleanup_interval}s, max age {self._max_job_age}s)")

    async def start(self):
        """Call this from lifespan to initialize async tasks after event loop exists"""
        if self._db_enabled:
            await self._load_jobs_from_db()
        self.start_cleanup_scheduler()

    def start_cleanup_scheduler(self):
        if self._cleanup_task is not None and not self._cleanup_task.done():
            logger.info("[JOB_MANAGER] Cleanup scheduler already running")
            return
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())
        logger.info("[JOB_MANAGER] Started scheduled cleanup task")

    async def _cleanup_loop(self):
        while True:
            await asyncio.sleep(self._cleanup_interval)
            await self.cleanup_old_jobs(self._max_job_age)
            if self._db_enabled:
                await self._cleanup_db_jobs()

    def stop_cleanup_scheduler(self):
        if self._cleanup_task is not None:
            self._cleanup_task.cancel()
            self._cleanup_task = None
            logger.info("[JOB_MANAGER] Stopped cleanup scheduler")

    def _get_db_headers(self) -> Dict[str, str]:
        """Get headers for service role authentication - synchronous"""
        return {
            "apikey": self._supabase_service_key,
            "Authorization": f"Bearer {self._supabase_service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }

    async def _load_jobs_from_db(self):
        """Load active jobs from database on startup"""
        if not self._db_enabled:
            return
        
        async def _fetch():
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self._supabase_url}/rest/v1/jobs",
                    headers=self._get_db_headers(),
                    params={
                        "status": f"in.(pending,preprocessing,ocr_extracting,tribe_analyzing,mapping_scores)",
                        "select": "*"
                    }
                )
                response.raise_for_status()
                return response.json()
        
        try:
            db_jobs = await retry_with_backoff(_fetch, max_retries=3, base_delay=1.0)
            
            for db_job in db_jobs:
                job = AnalysisJob(
                    job_id=db_job["job_id"],
                    upload_id=db_job["upload_id"],
                    user_id=db_job["user_id"],
                    media_type=db_job["media_type"],
                    file_url=db_job["file_url"],
                    status=JobStatus(db_job["status"]),
                    progress=db_job["progress"],
                    result=db_job.get("result"),
                    error=db_job.get("error"),
                    created_at=datetime.fromisoformat(db_job["created_at"].replace("Z", "+00:00")).timestamp(),
                    updated_at=datetime.fromisoformat(db_job["updated_at"].replace("Z", "+00:00")).timestamp()
                )
                self.jobs[job.job_id] = job
            logger.info(f"[JOB_MANAGER] Loaded {len(db_jobs)} active jobs from database")
        except Exception as e:
            logger.error(f"[JOB_MANAGER] Error loading jobs from database: {e}")

    async def _persist_job(self, job: AnalysisJob, update_only: bool = False):
        """Persist job to database with retry logic"""
        if not self._db_enabled:
            return
        
        job_data = {
            "job_id": job.job_id,
            "upload_id": job.upload_id,
            "user_id": job.user_id,
            "media_type": job.media_type,
            "file_url": job.file_url,
            "status": job.status.value,
            "progress": job.progress,
            "result": job.result,
            "error": job.error
        }
        
        async def _persist():
            async with httpx.AsyncClient(timeout=10.0) as client:
                if update_only:
                    response = await client.patch(
                        f"{self._supabase_url}/rest/v1/jobs",
                        headers=self._get_db_headers(),
                        params={"job_id": f"eq.{job.job_id}"},
                        json=job_data
                    )
                else:
                    response = await client.post(
                        f"{self._supabase_url}/rest/v1/jobs",
                        headers=self._get_db_headers(),
                        json=job_data
                    )
                if response.status_code not in (200, 201, 204):
                    raise httpx.HTTPStatusError(
                        f"Unexpected status {response.status_code}",
                        request=response.request,
                        response=response
                    )
        
        try:
            await retry_with_backoff(_persist, max_retries=2, base_delay=0.5)
        except Exception as e:
             logger.warning(f"[JOB_MANAGER] Failed to persist job {job.job_id} after retries: {e}")

    def _safe_persist_job(self, job: AnalysisJob, update_only: bool = False):
        """Safely create a background task for persisting job with error handling"""
        try:
            task = asyncio.create_task(self._persist_job(job, update_only))
            task.add_done_callback(
                lambda t: (
                     logger.error(f"[JOB_MANAGER] Persist failed for job {job.job_id}: {t.exception()}")
                    if t.cancelled() or t.exception()
                    else None
                )
            )
        except Exception as e:
             logger.warning(f"[JOB_MANAGER] Failed to create persist task for job {job.job_id}: {e}")

    async def _cleanup_db_jobs(self):
        """Clean up old jobs in database"""
        if not self._db_enabled:
            return
        
        max_age_hours = self._max_job_age // 3600
        
        async def _cleanup():
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"{self._supabase_url}/rest/v1/rpc/cleanup_old_jobs",
                    headers=self._get_db_headers(),
                    json={"max_age_hours": max_age_hours}
                )
                response.raise_for_status()
                return response.json()
        
        try:
            result = await retry_with_backoff(_cleanup, max_retries=2, base_delay=1.0)
            logger.info(f"[JOB_MANAGER] Cleaned up {result} old jobs from database")
        except Exception as e:
            logger.warning(f"[JOB_MANAGER] Warning: Exception cleaning up DB jobs after retries: {e}")

    async def create_job(self, upload_id: str, user_id: str, media_type: str, file_url: str) -> str:
        async with self._lock:
            # Check for existing active job under lock to prevent duplicates
            existing = self.get_job_by_upload(upload_id)
            if existing and existing.status not in (JobStatus.FAILED,):
                return existing.job_id

            job_id = str(uuid.uuid4())
            job = AnalysisJob(
                job_id=job_id,
                upload_id=upload_id,
                user_id=user_id,
                media_type=media_type,
                file_url=file_url,
                status=JobStatus.PENDING,
                progress=0
            )
            self.jobs[job_id] = job

            if self._db_enabled:
                self._safe_persist_job(job)

            logger.info(f"[JOB_MANAGER] Created job {job_id} for upload {upload_id}")
            return job_id

    def get_job(self, job_id: str) -> Optional[AnalysisJob]:
        return self.jobs.get(job_id)

    def get_job_by_upload(self, upload_id: str) -> Optional[AnalysisJob]:
        for job in self.jobs.values():
            if job.upload_id == upload_id and job.status != JobStatus.FAILED:
                return job
        return None

    def get_jobs_by_user(self, user_id: str) -> list[AnalysisJob]:
        return [job for job in self.jobs.values() if job.user_id == user_id]

    async def run_job(
        self,
        job_id: str,
        preprocess_func: Callable,
        ocr_func: Callable,
        tribe_func: Callable,
        score_mapper_func: Callable
    ) -> Dict[str, Any]:
        job = self.jobs.get(job_id)
        if not job:
            raise ValueError(f"Job {job_id} not found")
        
        logger.info(f"[JOB_MANAGER] Starting job {job_id}")
        
        # Add job timeout (5 minutes)
        try:
            # Step 1: Download media once and cache for reuse
            logger.info(f"[JOB_MANAGER] Downloading media: {job.file_url}")
            media_path = job.file_url  # fallback: use URL directly
            try:
                media_data, media_path = await asyncio.wait_for(
                    media_cache.get_or_download(job.file_url), 
                    timeout=self._download_timeout
                )
                logger.info(f"[JOB_MANAGER] Media cached at: {media_path}")
            except Exception as e:
                logger.warning(f"[JOB_MANAGER] Media download failed ({type(e).__name__}: {e}), using URL directly")
                media_path = job.file_url
            
            # Step 2: Preprocessing (extract features)
            job.status = JobStatus.PREPROCESSING
            job.progress = 10
            job.updated_at = time.time()
            if self._db_enabled:
                self._safe_persist_job(job, update_only=True)
            
            try:
                preprocess_result = await asyncio.wait_for(
                    preprocess_func(media_path, job.media_type),
                    timeout=self._preprocess_timeout
                )
                logger.info(f"[JOB_MANAGER] Preprocessing done, features extracted: {len(preprocess_result.features)} metrics")
            except Exception as e:
                logger.warning(f"[JOB_MANAGER] Preprocessing failed ({type(e).__name__}: {e}), using defaults")
                from .preprocess_service import PreprocessResult, PreprocessService
                preprocess_result = PreprocessResult(
                    processed_path=media_path,
                    duration_seconds=3.0,
                    num_frames=30,
                    resolution=(512, 512),
                    preprocessing_steps=[f"Error: {str(e)}"],
                    features=PreprocessService()._default_features()
                )
            
            # Step 3: OCR (text detection)
            job.status = JobStatus.OCR_EXTRACTING
            job.progress = 25
            job.updated_at = time.time()
            if self._db_enabled:
                self._safe_persist_job(job, update_only=True)
            
            try:
                ocr_result = await asyncio.wait_for(
                    ocr_func(media_path, job.media_type),
                    timeout=self._ocr_timeout
                )
                logger.info(f"[JOB_MANAGER] OCR done: {ocr_result.text[:80] if ocr_result.text else 'empty'}")
            except Exception as e:
                logger.warning(f"[JOB_MANAGER] OCR failed ({type(e).__name__}: {e}), using defaults")
                from .ocr_service import OCRResult
                ocr_result = OCRResult(text="", readability_score=0.0, detected_language="unknown", text_regions=[])
            
            # Step 4: Tribe analysis (deterministic + optional AI)
            job.status = JobStatus.TRIBE_ANALYZING
            job.progress = 50
            job.updated_at = time.time()
            if self._db_enabled:
                self._safe_persist_job(job, update_only=True)
            
            seed = sum(ord(c) for c in job.upload_id)
            try:
                tribe_output = await asyncio.wait_for(
                    tribe_func(media_path, job.media_type, seed, ocr_result.text,
                               preprocess_result.features),
                    timeout=self._tribe_timeout
                )
                tribe_output.ocr_text = ocr_result.text
                tribe_output.ocr_readability = ocr_result.readability_score
                logger.info(f"[JOB_MANAGER] TRIBE analysis done")
            except Exception as e:
                logger.warning(f"[JOB_MANAGER] Tribe failed ({type(e).__name__}: {e}), using deterministic")
                # Tribe service always works with defaults
                from .tribe_service import TribeService
                ts = TribeService()
                tribe_output = await ts.analyze(media_path, job.media_type, seed, ocr_result.text, preprocess_result.features)
            
            # Step 5: Score mapping (always deterministic, never fails)
            job.status = JobStatus.MAPPING_SCORES
            job.progress = 75
            job.updated_at = time.time()
            if self._db_enabled:
                self._safe_persist_job(job, update_only=True)
            
            neuro_metrics = score_mapper_func(tribe_output)
            final_result = neuro_metrics.to_neurox_format()
            
            job.result = final_result
            job.status = JobStatus.COMPLETED
            job.progress = 100
            job.updated_at = time.time()
            if self._db_enabled:
                self._safe_persist_job(job, update_only=True)
            
            # Consume credit only after successful job completion
            await self._consume_credit_for_job(job)
            
            # Clean up temp files
            if hasattr(preprocess_result, 'cleanup'):
                preprocess_result.cleanup()
            if media_path != job.file_url:
                await media_cache.cleanup_file(media_path)
            
            logger.info(f"[JOB_MANAGER] Job {job_id} completed with score {final_result['globalScore']}")
            return final_result
            
        except asyncio.TimeoutError:
            job.status = JobStatus.FAILED
            job.error = "Job timed out"
            job.updated_at = time.time()
            if self._db_enabled:
                self._safe_persist_job(job, update_only=True)
            logger.error(f"[JOB_MANAGER] Job {job_id} timed out")
            # Ensure cleanup happens even on timeout
            if 'media_path' in locals():
                await media_cache.cleanup_file(media_path)
            raise
        except Exception as e:
            job.status = JobStatus.FAILED
            job.error = str(e)
            job.updated_at = time.time()
            if self._db_enabled:
                self._safe_persist_job(job, update_only=True)
            logger.error(f"[JOB_MANAGER] Job {job_id} failed: {e}")
            # Ensure cleanup happens even on failure
            if 'media_path' in locals():
                await media_cache.cleanup_file(media_path)
            raise

    async def update_job_status(self, job_id: str, status: JobStatus, progress: int):
        async with self._lock:
            if job_id in self.jobs:
                self.jobs[job_id].status = status
                self.jobs[job_id].progress = progress
                self.jobs[job_id].updated_at = time.time()
                if self._db_enabled:
                    asyncio.create_task(self._persist_job(self.jobs[job_id], update_only=True))

    async def _consume_credit_for_job(self, job: AnalysisJob):
        """Consume credit for a successfully completed job"""
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
                if response.status_code != 200:
                    logger.error("[JOB_MANAGER] Failed to consume credit for job %s: %s", job.job_id, response.text)
                else:
                    logger.info("[JOB_MANAGER] Credit consumed for job %s", job.job_id)
        except Exception as e:
            logger.error("[JOB_MANAGER] Error consuming credit for job %s: %s", job.job_id, e)

    async def get_all_jobs(self) -> Dict[str, Dict[str, Any]]:
        async with self._lock:
            return {job_id: job.to_dict() for job_id, job in self.jobs.items()}

    async def cleanup_old_jobs(self, max_age_seconds: int = 3600):
        async with self._lock:
            current_time = time.time()
            to_remove = []
            for job_id, job in self.jobs.items():
                if current_time - job.updated_at > max_age_seconds:
                    to_remove.append(job_id)
            for job_id in to_remove:
                del self.jobs[job_id]
                logger.info(f"[JOB_MANAGER] Cleaned up old job {job_id}")

job_manager = JobManager()
