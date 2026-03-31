import asyncio
import uuid
import time
from typing import Dict, Optional, Any, Callable
from enum import Enum
from dataclasses import dataclass, field
from datetime import datetime

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
        print("[JOB_MANAGER] Initialized")

    def create_job(self, upload_id: str, media_type: str, file_url: str) -> str:
        job_id = str(uuid.uuid4())
        job = AnalysisJob(
            job_id=job_id,
            upload_id=upload_id,
            media_type=media_type,
            file_url=file_url,
            status=JobStatus.PENDING,
            progress=0
        )
        self.jobs[job_id] = job
        print(f"[JOB_MANAGER] Created job {job_id} for upload {upload_id}")
        return job_id

    def get_job(self, job_id: str) -> Optional[AnalysisJob]:
        return self.jobs.get(job_id)

    def get_job_by_upload(self, upload_id: str) -> Optional[AnalysisJob]:
        for job in self.jobs.values():
            if job.upload_id == upload_id and job.status != JobStatus.FAILED:
                return job
        return None

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
        
        print(f"[JOB_MANAGER] Starting job {job_id}")
        
        try:
            job.status = JobStatus.PREPROCESSING
            job.progress = 10
            job.updated_at = time.time()
            
            preprocess_result = await preprocess_func(job.file_url, job.media_type)
            print(f"[JOB_MANAGER] Preprocessing done: {preprocess_result.to_dict()}")
            
            job.status = JobStatus.OCR_EXTRACTING
            job.progress = 25
            job.updated_at = time.time()
            
            ocr_result = await ocr_func(job.file_url, job.media_type)
            print(f"[JOB_MANAGER] OCR done: {ocr_result.to_dict()}")
            
            job.status = JobStatus.TRIBE_ANALYZING
            job.progress = 50
            job.updated_at = time.time()
            
            seed = sum(ord(c) for c in job.upload_id)
            tribe_output = await tribe_func(job.file_url, job.media_type, seed)
            
            tribe_output.ocr_text = ocr_result.text
            tribe_output.ocr_readability = ocr_result.readability_score
            print(f"[JOB_MANAGER] TRIBE analysis done")
            
            job.status = JobStatus.MAPPING_SCORES
            job.progress = 75
            job.updated_at = time.time()
            
            neuro_metrics = score_mapper_func(tribe_output)
            final_result = neuro_metrics.to_neurox_format()
            
            job.result = final_result
            job.status = JobStatus.COMPLETED
            job.progress = 100
            job.updated_at = time.time()
            
            print(f"[JOB_MANAGER] Job {job_id} completed with score {final_result['globalScore']}")
            return final_result
            
        except Exception as e:
            job.status = JobStatus.FAILED
            job.error = str(e)
            job.updated_at = time.time()
            print(f"[JOB_MANAGER] Job {job_id} failed: {e}")
            raise

    def update_job_status(self, job_id: str, status: JobStatus, progress: int):
        if job_id in self.jobs:
            self.jobs[job_id].status = status
            self.jobs[job_id].progress = progress
            self.jobs[job_id].updated_at = time.time()

    def get_all_jobs(self) -> Dict[str, Dict[str, Any]]:
        return {job_id: job.to_dict() for job_id, job in self.jobs.items()}

    def cleanup_old_jobs(self, max_age_seconds: int = 3600):
        current_time = time.time()
        to_remove = []
        for job_id, job in self.jobs.items():
            if current_time - job.updated_at > max_age_seconds:
                to_remove.append(job_id)
        for job_id in to_remove:
            del self.jobs[job_id]
            print(f"[JOB_MANAGER] Cleaned up old job {job_id}")

job_manager = JobManager()
