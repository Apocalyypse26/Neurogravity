import io
import os
import tempfile
import subprocess
from typing import Optional, Tuple, List
from PIL import Image
import httpx
from .tribe_service import is_url_safe
from .retry import retry_with_backoff

class PreprocessResult:
    def __init__(self, 
                 processed_path: Optional[str],
                 duration_seconds: float,
                 num_frames: int,
                 resolution: Tuple[int, int],
                 preprocessing_steps: list,
                 frame_paths: Optional[List[str]] = None):
        self.processed_path = processed_path
        self.duration_seconds = duration_seconds
        self.num_frames = num_frames
        self.resolution = resolution
        self.preprocessing_steps = preprocessing_steps
        self.frame_paths = frame_paths or []

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
        self.temp_dir = tempfile.mkdtemp(prefix="neurox_preprocess_")

    async def process_media(self, file_url: str, media_type: str) -> PreprocessResult:
        print(f"[PREPROCESS] Processing {media_type}: {file_url}")
        
        if media_type == "image":
            return await self._process_image(file_url)
        else:
            return await self._process_video(file_url)

    async def _process_image(self, file_path: str) -> PreprocessResult:
        # Handle both HTTP URLs and local file paths
        is_http = file_path.startswith('http')
        
        if is_http:
            if not is_url_safe(file_path):
                raise ValueError(f"URL not allowed: {file_path}")
        
        try:
            if is_http:
                async def _download():
                    async with httpx.AsyncClient(timeout=30.0) as client:
                        response = await client.get(file_path)
                        response.raise_for_status()
                        return response.content
                
                image_data = await retry_with_backoff(_download)
            else:
                with open(file_path, 'rb') as f:
                    image_data = f.read()
            
            img = Image.open(io.BytesIO(image_data))
            original_size = img.size
            
            img = img.convert("RGB")
            if img.size[0] > 1080 or img.size[1] > 1080:
                img.thumbnail((1080, 1080), Image.Resampling.LANCZOS)
            
            normalized_size = (img.size[0] // 16 * 16, img.size[1] // 16 * 16)
            img = img.resize(normalized_size, Image.Resampling.LANCZOS)
            
            steps = [
                f"{'Downloaded' if is_http else 'Loaded'} image from {file_path}",
                f"Converted to RGB mode",
                f"Original size: {original_size}",
                f"Normalized to: {normalized_size}"
            ]
            
            return PreprocessResult(
                processed_path=file_path,
                duration_seconds=3.0,
                num_frames=30,
                resolution=normalized_size,
                preprocessing_steps=steps
            )
            
        except Exception as e:
            print(f"[PREPROCESS] Image processing failed: {e}")
            return PreprocessResult(
                processed_path=file_path,
                duration_seconds=3.0,
                num_frames=30,
                resolution=(512, 512),
                preprocessing_steps=[f"Error: {str(e)}"]
            )

    async def _process_video(self, file_path: str) -> PreprocessResult:
        # Handle both HTTP URLs and local file paths
        is_http = file_path.startswith('http')
        
        if is_http:
            if not is_url_safe(file_path):
                raise ValueError(f"URL not allowed: {file_path}")
        
        try:
            if is_http:
                async def _download():
                    async with httpx.AsyncClient(timeout=120.0) as client:
                        response = await client.get(file_path)
                        response.raise_for_status()
                        return response.content
                
                video_data = await retry_with_backoff(_download)
            else:
                with open(file_path, 'rb') as f:
                    video_data = f.read()
            
            # Save to temp file
            temp_path = os.path.join(self.temp_dir, f"video_{hash(file_path)}.mp4")
            with open(temp_path, 'wb') as f:
                f.write(video_data)
            
            # Get video info using ffprobe
            probe_result = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "stream=duration,width,height,r_frame_rate", "-of", "json", temp_path],
                capture_output=True, text=True
            )
            
            if probe_result.returncode != 0:
                raise Exception(f"ffprobe failed: {probe_result.stderr}")
            
            import json
            probe_data = json.loads(probe_result.stdout)
            video_stream = probe_data['streams'][0]
            
            duration = float(video_stream.get('duration', 0))
            width = int(video_stream.get('width', 0))
            height = int(video_stream.get('height', 0))
            fps_str = video_stream.get('r_frame_rate', '30/1')
            fps = float(fps_str.split('/')[0]) if '/' in fps_str else float(fps_str)
            
            # Cap at 20 seconds
            actual_duration = min(duration, 20.0)
            num_frames = int(actual_duration * fps)
            
            # Extract key frames for analysis
            frame_paths = self._extract_key_frames(temp_path, num_frames_to_extract=8)
            
            steps = [
                f"{'Downloaded' if is_http else 'Loaded'} video from {file_path}",
                f"Duration: {actual_duration:.2f}s (capped from {duration:.2f}s)",
                f"Resolution: {width}x{height}",
                f"FPS: {fps:.1f}",
                f"Extracted {len(frame_paths)} key frames"
            ]
            
            # Clean up video file
            os.remove(temp_path)
            
            return PreprocessResult(
                processed_path=frame_paths[0] if frame_paths else file_path,
                duration_seconds=actual_duration,
                num_frames=num_frames,
                resolution=(width, height),
                preprocessing_steps=steps,
                frame_paths=frame_paths
            )
            
        except Exception as e:
            print(f"[PREPROCESS] Video processing failed: {e}")
            return PreprocessResult(
                processed_path=file_path,
                duration_seconds=15.0,
                num_frames=60,
                resolution=(720, 1280),
                preprocessing_steps=[f"Error: {str(e)}"]
            )

    def _extract_key_frames(self, video_path: str, num_frames_to_extract: int = 8) -> List[str]:
        """Extract evenly distributed key frames using ffmpeg"""
        frame_paths = []
        
        # Get video duration
        probe_result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video_path],
            capture_output=True, text=True
        )
        
        if probe_result.returncode != 0:
            print(f"[PREPROCESS] Failed to get video duration: {probe_result.stderr}")
            return frame_paths
        
        duration = float(probe_result.stdout.strip())
        
        if duration <= 0:
            return frame_paths
        
        # Calculate timestamps
        interval = duration / (num_frames_to_extract + 1)
        
        for i in range(1, num_frames_to_extract + 1):
            timestamp = i * interval
            frame_path = os.path.join(self.temp_dir, f"frame_{i}.jpg")
            
            try:
                subprocess.run(
                    ["ffmpeg", "-y", "-ss", str(timestamp), "-i", video_path, "-vframes", "1", "-q:v", "2", frame_path],
                    capture_output=True, check=True
                )
                
                if os.path.exists(frame_path):
                    frame_paths.append(frame_path)
                    
            except Exception as e:
                print(f"[PREPROCESS] Failed to extract frame at {timestamp}s: {e}")
        
        return frame_paths

preprocess_service = PreprocessService()