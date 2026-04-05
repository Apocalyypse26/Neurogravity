import pytest
import asyncio
import os
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from services.ocr_service import ocr_service, OCRService, OCRResult

@pytest.mark.asyncio
async def test_10_second_video_extract_text():
    """Test that a 10-second video correctly extracts text"""
    result = await ocr_service.extract_text("https://example.com/test_video_10s.mp4", "video")
    
    assert isinstance(result, OCRResult)
    assert hasattr(result, 'text')
    assert hasattr(result, 'readability_score')
    assert hasattr(result, 'detected_language')
    assert hasattr(result, 'text_regions')
    assert result.readability_score >= 0.0
    assert result.readability_score <= 1.0
    assert result.detected_language == "en"

@pytest.mark.asyncio
async def test_image_meme_processing():
    """Test that an image meme is correctly processed"""
    result = await ocr_service.extract_text("https://example.com/test_meme.png", "image")
    
    assert isinstance(result, OCRResult)
    assert hasattr(result, 'text')
    assert hasattr(result, 'readability_score')
    assert hasattr(result, 'detected_language')
    assert hasattr(result, 'text_regions')
    assert result.detected_language == "en"

@pytest.mark.asyncio
async def test_video_with_no_speech():
    """Test that a video with no speech returns appropriate result"""
    result = await ocr_service.extract_text("https://example.com/test_video_no_speech.mp4", "video")
    
    assert isinstance(result, OCRResult)
    # Video may have text from OCR even without speech
    assert result.detected_language == "en"

@pytest.mark.asyncio
async def test_corrupted_video_graceful_failure():
    """Test that corrupted video fails gracefully"""
    video_url = "https://example.com/definitely_does_not_exist.mp4"
    result = await ocr_service.extract_text(video_url, "video")
    
    assert isinstance(result, OCRResult)
    # Should return empty result on failure
    assert result.text == ""
    assert result.readability_score == 0.0
    assert result.detected_language == "unknown"
    assert len(result.text_regions) == 0

@pytest.mark.asyncio
async def test_very_short_video():
    """Test that very short video is handled correctly"""
    result = await ocr_service.extract_text("https://example.com/test_video_1s.mp4", "video")
    
    assert isinstance(result, OCRResult)
    assert hasattr(result, 'text')
    assert hasattr(result, 'readability_score')
    assert result.detected_language == "en"

@pytest.mark.asyncio
async def test_very_long_video():
    """Test that very long video is handled (should be processed normally)"""
    result = await ocr_service.extract_text("https://example.com/test_video_60s.mp4", "video")
    
    assert isinstance(result, OCRResult)
    assert hasattr(result, 'text')
    assert hasattr(result, 'readability_score')
    assert result.detected_language == "en"
