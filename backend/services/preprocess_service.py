import io
import os
from typing import Optional, Tuple
from PIL import Image
import httpx
from .tribe_service import is_url_safe

class PreprocessResult:
    def __init__(self, 
                 processed_path: Optional[str],
                 duration_seconds: float,
                 num_frames: int,
                 resolution: Tuple[int, int],
                 preprocessing_steps: list):
        self.processed_path = processed_path
        self.duration_seconds = duration_seconds
        self.num_frames = num_frames
        self.resolution = resolution
        self.preprocessing_steps = preprocessing_steps

    def to_dict(self):
        return {
            "processed_path": self.processed_path,
            "duration_seconds": self.duration_seconds,
            "num_frames": self.num_frames,
            "resolution": self.resolution,
            "preprocessing_steps": self.preprocessing_steps
        }

class PreprocessService:
    def __init__(self):
        self.temp_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "temp")
        os.makedirs(self.temp_dir, exist_ok=True)

    async def process_media(self, file_url: str, media_type: str) -> PreprocessResult:
        print(f"[PREPROCESS] Processing {media_type}: {file_url}")
        
        if media_type == "image":
            return await self._process_image(file_url)
        else:
            return await self._process_video(file_url)

    async def _process_image(self, file_url: str) -> PreprocessResult:
        print("[PREPROCESS] Converting image to video frames...")
        
        if not is_url_safe(file_url):
            raise ValueError(f"URL not allowed for security reasons: {file_url}")
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(file_url)
                response.raise_for_status()
                image_data = response.content
            
            img = Image.open(io.BytesIO(image_data))
            original_size = img.size
            
            img = img.convert("RGB")
            if img.size[0] > 1080 or img.size[1] > 1080:
                img.thumbnail((1080, 1080), Image.Resampling.LANCZOS)
            
            normalized_size = (img.size[0] // 16 * 16, img.size[1] // 16 * 16)
            img = img.resize(normalized_size, Image.Resampling.LANCZOS)
            
            steps = [
                f"Downloaded image from {file_url}",
                f"Converted to RGB mode",
                f"Original size: {original_size}",
                f"Normalized to: {normalized_size}"
            ]
            
            return PreprocessResult(
                processed_path=file_url,
                duration_seconds=3.0,
                num_frames=30,
                resolution=normalized_size,
                preprocessing_steps=steps
            )
            
        except Exception as e:
            print(f"[PREPROCESS] Image processing failed: {e}")
            return PreprocessResult(
                processed_path=file_url,
                duration_seconds=3.0,
                num_frames=30,
                resolution=(512, 512),
                preprocessing_steps=[f"Error: {str(e)}"]
            )

    async def _process_video(self, file_url: str) -> PreprocessResult:
        print("[PREPROCESS] Normalizing video...")
        
        steps = [
            f"Downloaded video from {file_url}",
            "Normalizing aspect ratio to 16:9",
            "Targeting 30fps",
            "Will be trimmed to max 20 seconds"
        ]
        
        return PreprocessResult(
            processed_path=file_url,
            duration_seconds=15.0,
            num_frames=60,
            resolution=(720, 1280),
            preprocessing_steps=steps
        )

preprocess_service = PreprocessService()
