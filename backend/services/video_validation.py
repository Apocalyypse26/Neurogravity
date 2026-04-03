import os
import json
import subprocess
from typing import Optional, Tuple
from dataclasses import dataclass

MAX_VIDEO_DURATION_SEC = 20
MAX_VIDEO_SIZE_MB = 25

@dataclass
class VideoValidationResult:
    valid: bool
    duration: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    codec: Optional[str] = None
    errors: list = None
    
    def __post_init__(self):
        if self.errors is None:
            self.errors = []


def get_video_metadata(file_path: str) -> Tuple[bool, dict]:
    """
    Get video metadata using ffprobe.
    Returns (success, metadata_dict)
    """
    try:
        cmd = [
            'ffprobe',
            '-v', 'error',
            '-show_entries', 'stream=width,height,codec_name,duration:format=duration,size',
            '-show_entries', 'stream_tags=language,title',
            '-of', 'json',
            file_path
        ]
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode != 0:
            return False, {"error": result.stderr}
        
        metadata = json.loads(result.stdout)
        return True, metadata
        
    except subprocess.TimeoutExpired:
        return False, {"error": "ffprobe timed out"}
    except json.JSONDecodeError:
        return False, {"error": "Failed to parse ffprobe output"}
    except FileNotFoundError:
        return False, {"error": "ffprobe not found - install ffmpeg"}
    except Exception as e:
        return False, {"error": str(e)}


def validate_video_file(file_path: str, max_duration: int = MAX_VIDEO_DURATION_SEC) -> VideoValidationResult:
    """
    Validate a video file using ffprobe.
    Checks duration, codec validity, and basic integrity.
    """
    errors = []
    
    # Get metadata
    success, metadata = get_video_metadata(file_path)
    
    if not success:
        return VideoValidationResult(valid=False, errors=[metadata.get("error", "Unknown error")])
    
    # Extract duration
    duration = None
    try:
        duration = float(metadata.get("format", {}).get("duration", 0))
    except (ValueError, TypeError):
        errors.append("Could not determine video duration")
    
    # Check duration limit
    if duration is not None and duration > max_duration:
        errors.append(f"Video duration ({duration:.1f}s) exceeds {max_duration}s limit")
    
    # Get video stream info
    streams = metadata.get("streams", [])
    video_stream = None
    
    for stream in streams:
        if stream.get("codec_type") == "video":
            video_stream = stream
            break
    
    if not video_stream:
        errors.append("No video stream found in file")
    
    # Check codec
    codec = video_stream.get("codec_name") if video_stream else None
    if codec:
        # Reject common non-web codecs
        invalid_codecs = ["h263", "mpeg2video", "vc1", "wmv1", "wmv2", "wmv3"]
        if codec.lower() in invalid_codecs:
            errors.append(f"Codec '{codec}' is not supported. Use H.264 (libx264) or VP9.")
    
    # Check resolution
    width = video_stream.get("width") if video_stream else None
    height = video_stream.get("height") if video_stream else None
    
    if width and height:
        # Check minimum resolution
        if width < 128 or height < 128:
            errors.append(f"Video resolution too small ({width}x{height}). Minimum: 128x128")
        
        # Check maximum resolution (reasonable limit for virality scoring)
        if width > 4096 or height > 4096:
            errors.append(f"Video resolution too large ({width}x{height}). Maximum: 4096x4096")
    
    # Get file size
    try:
        file_size = int(metadata.get("format", {}).get("size", 0))
        max_size_bytes = MAX_VIDEO_SIZE_MB * 1024 * 1024
        if file_size > max_size_bytes:
            errors.append(f"Video file size ({file_size / 1024 / 1024:.1f}MB) exceeds {MAX_VIDEO_SIZE_MB}MB limit")
    except (ValueError, TypeError):
        pass
    
    is_valid = len(errors) == 0
    
    return VideoValidationResult(
        valid=is_valid,
        duration=duration,
        width=width,
        height=height,
        codec=codec,
        errors=errors
    )


def validate_video_url(url: str, max_duration: int = MAX_VIDEO_DURATION_SEC) -> VideoValidationResult:
    """
    Validate a video URL using ffprobe with HTTP range request.
    Downloads only the header portion for validation.
    """
    errors = []
    
    try:
        cmd = [
            'ffprobe',
            '-v', 'error',
            '-show_entries', 'stream=width,height,codec_name,duration:format=duration,size',
            '-of', 'json',
            '-infbuf',  # Enable infinite buffer for streaming
            url
        ]
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60  # Longer timeout for remote URLs
        )
        
        if result.returncode != 0:
            return VideoValidationResult(valid=False, errors=[result.stderr])
        
        metadata = json.loads(result.stdout)
        
        # Extract duration
        duration = None
        try:
            duration = float(metadata.get("format", {}).get("duration", 0))
        except (ValueError, TypeError):
            pass
        
        # Check duration limit
        if duration is not None and duration > max_duration:
            errors.append(f"Video duration ({duration:.1f}s) exceeds {max_duration}s limit")
        
        # Get video stream info
        streams = metadata.get("streams", [])
        video_stream = None
        
        for stream in streams:
            if stream.get("codec_type") == "video":
                video_stream = stream
                break
        
        if not video_stream:
            errors.append("No video stream found")
        
        codec = video_stream.get("codec_name") if video_stream else None
        if codec:
            invalid_codecs = ["h263", "mpeg2video", "vc1", "wmv1", "wmv2", "wmv3"]
            if codec.lower() in invalid_codecs:
                errors.append(f"Codec '{codec}' is not supported. Use H.264 (libx264) or VP9.")
        
        width = video_stream.get("width") if video_stream else None
        height = video_stream.get("height") if video_stream else None
        
        is_valid = len(errors) == 0
        
        return VideoValidationResult(
            valid=is_valid,
            duration=duration,
            width=width,
            height=height,
            codec=codec,
            errors=errors
        )
        
    except subprocess.TimeoutExpired:
        return VideoValidationResult(valid=False, errors=["Video validation timed out"])
    except json.JSONDecodeError:
        return VideoValidationResult(valid=False, errors=["Failed to parse video metadata"])
    except FileNotFoundError:
        return VideoValidationResult(valid=False, errors=["ffprobe not found - install ffmpeg"])
    except Exception as e:
        return VideoValidationResult(valid=False, errors=[str(e)])
