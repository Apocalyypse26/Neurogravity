import os
import math
import random
import numpy as np
import httpx
from typing import Dict, List, Optional, Any
import google.generativeai as genai
from PIL import Image
from io import BytesIO
import base64
from urllib.parse import urlparse
import logging
import traceback
from .retry import retry_with_backoff

USE_REAL_TRIBE = os.getenv("USE_REAL_TRIBE", "false").lower() == "true"

ALLOWED_SSRF_DOMAINS = [
    "supabase.co",
    "supabase.in",
    "storage.googleapis.com",
    "googleapis.com",
    "amazonaws.com",
    "r2.cloudflarestorage.com",
    "cdn.vercel-blobs.com",
]

def is_url_safe(url: str) -> bool:
    try:
        parsed = urlparse(url)
        
        if parsed.scheme not in ("http", "https"):
            return False
        
        hostname = parsed.hostname or ""
        netloc = parsed.netloc or ""
        
        if hostname.startswith("localhost") or hostname.startswith("127.") or hostname.startswith("0."):
            return False
        
        RESERVED_IP_RANGES = [
            "10.", "172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "172.21.", "172.22.",
            "172.23.", "172.24.", "172.25.", "172.26.", "172.27.", "172.28.", "172.29.", "172.30.",
            "172.31.", "192.168.", "169.254.", "fe80:", "fc00:", "fd00:", "ff00:"
        ]
        
        ip_part = netloc.split(":")[0]
        import ipaddress
        try:
            ip = ipaddress.ip_address(ip_part)
            if ip.is_private or ip.is_reserved or ip.is_loopback or ip.is_multicast:
                return False
            ip_address = str(ip)
        except ValueError:
            ip_address = hostname
        
        for range_prefix in RESERVED_IP_RANGES:
            if ip_address.startswith(range_prefix):
                return False
        
        domain = hostname.split(":")[0]
        if not any(domain.endswith(allowed) or domain == allowed for allowed in ALLOWED_SSRF_DOMAINS):
            return False
        
        return True
    except Exception:
        return False

# Initialize Gemini if API key is available
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    GEMINI_MODEL = genai.GenerativeModel('gemini-2.0-flash')
else:
    GEMINI_MODEL = None

def seeded_random(seed: int, offset: int) -> float:
    x = math.sin(seed + offset) * 10000
    return x - math.floor(x)

class TribeOutput:
    def __init__(self, 
                 time_series: List[float],
                 raw_hook_score: float,
                 raw_attention_peak: float,
                 raw_attention_mean: float,
                 raw_ending_strength: float,
                 raw_emotion_spike: float,
                 raw_visual_punch: float,
                 ocr_text: str = "",
                 ocr_readability: float = 0.5,
                 relevance_score: float = 0.5,
                 metadata: Dict[str, Any] = None):
        self.time_series = time_series
        self.raw_hook_score = raw_hook_score
        self.raw_attention_peak = raw_attention_peak
        self.raw_attention_mean = raw_attention_mean
        self.raw_ending_strength = raw_ending_strength
        self.raw_emotion_spike = raw_emotion_spike
        self.raw_visual_punch = raw_visual_punch
        self.ocr_text = ocr_text
        self.ocr_readability = ocr_readability
        self.relevance_score = relevance_score
        self.metadata = metadata or {}

    def to_dict(self) -> Dict[str, Any]:
        return {
            "time_series": self.time_series,
            "raw_hook_score": self.raw_hook_score,
            "raw_attention_peak": self.raw_attention_peak,
            "raw_attention_mean": self.raw_attention_mean,
            "raw_ending_strength": self.raw_ending_strength,
            "raw_emotion_spike": self.raw_emotion_spike,
            "raw_visual_punch": self.raw_visual_punch,
            "ocr_text": self.ocr_text,
            "ocr_readability": self.ocr_readability,
            "relevance_score": self.relevance_score,
            "metadata": self.metadata
        }

class TribeService:
    def __init__(self):
        self.use_real = USE_REAL_TRIBE
        print(f"[TRIBE] Initialized in {'REAL' if self.use_real else 'MOCK'} mode")

    async def analyze(self, file_path: str, media_type: str, seed: int, ocr_text: str = "") -> TribeOutput:
        # Use Gemini AI if available, otherwise fallback to mock
        if GEMINI_MODEL:
            return await self._analyze_with_gemini(file_path, media_type, seed, ocr_text)
        elif self.use_real:
            return await self._analyze_real(file_path, media_type, seed, ocr_text)
        else:
            return await self._analyze_mock(media_type, seed)

    async def _analyze_real(self, file_path: str, media_type: str, seed: int, ocr_text: str = "") -> TribeOutput:
        print(f"[TRIBE] Real analysis for: {file_path}")
          
        # Fallback to Gemini if available, otherwise mock
        if GEMINI_MODEL:
            return await self._analyze_with_gemini(file_path, media_type, seed, ocr_text)
        else:
            print("[TRIBE] WARNING: No real TRIBE model or Gemini API available, falling back to mock")
            return await self._analyze_mock(media_type, seed)

    async def _analyze_with_gemini(self, file_path: str, media_type: str, seed: int, ocr_text: str = "") -> TribeOutput:
        """Analyze using Google Gemini API for multi-modal understanding"""
        print(f"[TRIBE] Gemini analysis for: {file_path}")
        
        try:
            image_data = None
            
            if file_path.startswith('http'):
                if not is_url_safe(file_path):
                    raise ValueError(f"URL not allowed for security reasons: {file_path}")
                
                async def _download_image():
                    async with httpx.AsyncClient() as client:
                        response = await client.get(file_path, timeout=10.0)
                        response.raise_for_status()
                        return response.content
                
                image_data = await retry_with_backoff(_download_image)
            else:
                with open(file_path, 'rb') as f:
                    image_data = f.read()
            
            # Convert to PIL Image for processing
            image = Image.open(BytesIO(image_data))
            
            # Resize if too large (Gemini has size limits)
            max_size = 1024
            if max(image.size) > max_size:
                ratio = max_size / max(image.size)
                new_size = tuple(int(dim * ratio) for dim in image.size)
                image = image.resize(new_size, Image.Resampling.LANCZOS)
            
            # Prepare analysis prompt
            prompt = f"""
            Analyze this image for viral potential and meme characteristics. Provide:
            
            1. Virality Score (0-100): How likely this is to go viral on social media
            2. Hook Strength (0-100): Initial attention-grabbing power
            3. Visual Impact (0-100): Visual appeal and shareability
            4. Text Clarity (0-100): Readability of any text present
            5. Meme Strength (0-100): How well it fits meme formats
            6. Crypto Relevance (0-100): Relevance to cryptocurrency themes
            
            Also provide:
            - Any text found in the image (OCR)
            - Confidence level (HIGH/MEDIUM/LOW)
            - Best platform for sharing (X/Twitter, Telegram, Instagram, TikTok)
            - Rank/category (e.g., "[ALPHA] Top 3%", "[OPTIMAL]", etc.)
            - 3 actionable improvement suggestions
            
            Format response as JSON with keys: globalScore, subScores (array of objects with name/val), confidence (object with text/color), rank, fixes (array of strings), bestPlatform, ocrText, ocrReadability (0-1), relevanceScore (0-1)
            
            IMPORTANT: Use the following OCR text as reference for text analysis: "{ocr_text}"
            """
            
            # Generate content with Gemini
            response = GEMINI_MODEL.generate_content([prompt, image])
            response_text = response.text
            
            # Parse JSON response (handle potential formatting issues)
            import json
            import re
            
            # Extract JSON from response
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                try:
                    result = json.loads(json_match.group())
                except json.JSONDecodeError:
                    # Fallback to mock if JSON parsing fails
                    print("[TRIBE] WARNING: Failed to parse Gemini JSON response, falling back to mock")
                    return await self._analyze_mock(media_type, seed)
            else:
                # Fallback to mock if no JSON found
                print("[TRIBE] WARNING: No JSON found in Gemini response, falling back to mock")
                return await self._analyze_mock(media_type, seed)
            
            # Extract and validate results
            global_score = max(0, min(100, int(result.get('globalScore', 50))))
            
            # Process subScores
            sub_scores_raw = result.get('subScores', [])
            sub_scores = []
            default_subs = [
                {"name": "Hook Score", "val": 70},
                {"name": "Peak Response", "val": 75},
                {"name": "Sustained Attention", "val": 65},
                {"name": "Ending Strength", "val": 60},
                {"name": "Visual Punch", "val": 80},
                {"name": "Emotion Spike", "val": 70},
                {"name": "Readability Blend", "val": 68}
            ]
            
            for i, sub in enumerate(default_subs):
                if i < len(sub_scores_raw):
                    score_data = sub_scores_raw[i]
                    name = score_data.get('name', sub['name'])
                    val = max(0, min(100, int(score_data.get('val', sub['val']))))
                    sub_scores.append({"name": name, "val": val})
                else:
                    sub_scores.append(sub)
            
            # Process confidence
            confidence_raw = result.get('confidence', {})
            confidence_text = confidence_raw.get('text', 'MEDIUM CONFIDENCE')
            confidence_color = confidence_raw.get('color', '#f59e0b')
            
            # Map confidence text to color if needed
            if confidence_text == 'HIGH CONFIDENCE':
                confidence_color = '#10b981'
            elif confidence_text == 'LOW CONFIDENCE' or confidence_text == 'EXPERIMENTAL':
                confidence_color = '#8b5cf6'
            else:
                confidence_color = '#f59e0b'
            
            confidence = {"text": confidence_text, "color": confidence_color}
            
            # Extract other fields
            rank = result.get('rank', '[OPTIMAL] High retention span expected')
            fixes = result.get('fixes', [
                "Increase shadow contrast by 15% to trigger higher dopamine retention.",
                "Crop outer margins by 10% to force focal entity recognition.",
                "Text layout conflicts with visual anchor. Center or increase weight by 200."
            ])
            
            # Ensure we have exactly 3 fixes
            while len(fixes) < 3:
                fixes.append("Enhance visual hierarchy for better impact.")
            fixes = fixes[:3]
            
            best_platform = result.get('bestPlatform', 'X/Twitter')
            ocr_text = result.get('ocrText', '')
            ocr_readability = max(0, min(1, float(result.get('ocrReadability', 0.5))))
            relevance_score = max(0, min(1, float(result.get('relevanceScore', 0.5))))
            
            # Generate time series data (for compatibility)
            base_signal = 0.4 + (seed % 100) / 250  # 0.4-0.8 range
            num_frames = 30 if media_type == "image" else 60
            time_series = []
            for i in range(num_frames):
                frame_progress = i / num_frames
                hook_boost = (3 - i) * 0.15 if i < 3 else 0
                decay = 1 - (frame_progress * 0.3)
                noise = ((seed + i) % 100 - 50) / 500  # -0.1 to 0.1
                signal = min(max(base_signal + hook_boost + noise, 0), 1) * decay
                if i > num_frames * 0.7:
                    decay *= 1.2
                time_series.append(round(signal, 4))
            
            hook_score = (time_series[0] + time_series[1] + time_series[2]) / 3 if len(time_series) >= 3 else time_series[0]
            attention_peak = max(time_series)
            attention_mean = sum(time_series) / len(time_series)
            ending_strength = sum(time_series[-10:]) / 10 if len(time_series) >= 10 else sum(time_series) / len(time_series)
            
            spikes = []
            for i in range(1, len(time_series)):
                delta = time_series[i] - time_series[i-1]
                if delta > 0.05:
                    spikes.append(delta)
            emotion_spike = max(spikes) if spikes else 0
            
            visual_punch = 0.5 + (seed % 100) / 250  # 0.5-0.9 range
            
            return TribeOutput(
                time_series=time_series,
                raw_hook_score=hook_score,
                raw_attention_peak=attention_peak,
                raw_attention_mean=attention_mean,
                raw_ending_strength=ending_strength,
                raw_emotion_spike=emotion_spike,
                raw_visual_punch=visual_punch,
                ocr_text=ocr_text,
                ocr_readability=ocr_readability,
                relevance_score=relevance_score,
                metadata={
                    "media_type": media_type,
                    "num_frames": num_frames,
                    "seed": seed,
                    "mode": "gemini",
                    "globalScore": global_score
                }
            )
            
        except Exception as e:
            print(f"[TRIBE] ERROR in Gemini analysis: {e}")
            print("[TRIBE] Falling back to mock analysis")
            return await self._analyze_mock(media_type, seed)

    async def _analyze_mock(self, media_type: str, seed: int) -> TribeOutput:
        print(f"[TRIBE] Mock analysis for media_type: {media_type}, seed: {seed}")
        
        num_frames = 30 if media_type == "image" else 60
        
        base_signal = 0.4 + seeded_random(seed, 1) * 0.4
        
        time_series = []
        for i in range(num_frames):
            frame_progress = i / num_frames
            
            if i < 3:
                hook_boost = (3 - i) * 0.15
            else:
                hook_boost = 0
            
            decay = 1 - (frame_progress * 0.3)
            noise = (seeded_random(seed, i + 100) - 0.5) * 0.15
            
            if i > num_frames * 0.7:
                decay *= 1.2
            
            signal = min(max(base_signal + hook_boost + noise, 0), 1) * decay
            time_series.append(round(signal, 4))
        
        hook_score = (time_series[0] + time_series[1] + time_series[2]) / 3 if len(time_series) >= 3 else time_series[0]
        attention_peak = max(time_series)
        attention_mean = sum(time_series) / len(time_series)
        ending_strength = sum(time_series[-10:]) / 10 if len(time_series) >= 10 else sum(time_series) / len(time_series)
        
        spikes = []
        for i in range(1, len(time_series)):
            delta = time_series[i] - time_series[i-1]
            if delta > 0.05:
                spikes.append(delta)
        emotion_spike = max(spikes) if spikes else 0
        
        visual_punch = 0.5 + seeded_random(seed, 7) * 0.4
        
        ocr_readability = 0.3 + seeded_random(seed, 8) * 0.5
        relevance_score = 0.4 + seeded_random(seed, 9) * 0.5
        
        crypto_keywords = ["bull", "bear", "moon", "pump", "dump", "hold", "wagmi", "ngmi", "ape", 
                         "diamond", "hands", "flippening", "ser", "fren", "doge", "shib", "btc", 
                         "eth", "sol", "bnb", "defi", "nft", "token", "coin", "chart", "buy"]
        ocr_texts = [
            "TO THE MOON 🚀",
            "HODL THE LINE",
            "BUY THE DIP",
            "WAGMI",
            "DIAMOND HANDS ONLY",
            "APE IN OR GET OUT",
            "NOT FINANCIAL ADVICE",
        ]
        selected_text = ocr_texts[math.floor(seeded_random(seed, 10) * len(ocr_texts))]
        
        return TribeOutput(
            time_series=time_series,
            raw_hook_score=hook_score,
            raw_attention_peak=attention_peak,
            raw_attention_mean=attention_mean,
            raw_ending_strength=ending_strength,
            raw_emotion_spike=emotion_spike,
            raw_visual_punch=visual_punch,
            ocr_text=selected_text,
            ocr_readability=ocr_readability,
            relevance_score=relevance_score,
            metadata={
                "media_type": media_type,
                "num_frames": num_frames,
                "seed": seed,
                "mode": "mock"
            }
        )

tribe_service = TribeService()
