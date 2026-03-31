import os
import math
import random
import numpy as np
from typing import Dict, List, Optional, Any

USE_REAL_TRIBE = os.getenv("USE_REAL_TRIBE", "false").lower() == "true"

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

    async def analyze(self, file_path: str, media_type: str, seed: int) -> TribeOutput:
        if self.use_real:
            return await self._analyze_real(file_path, media_type, seed)
        else:
            return await self._analyze_mock(media_type, seed)

    async def _analyze_real(self, file_path: str, media_type: str, seed: int) -> TribeOutput:
        print(f"[TRIBE] Real analysis for: {file_path}")
        
        # TODO: Plug in actual TRIBE pretrained model here
        # Example:
        # model = load_tribe_model()
        # raw_output = model.predict(file_path)
        # return self._parse_tribe_output(raw_output)
        
        raise NotImplementedError("Real TRIBE integration not yet implemented. Set USE_REAL_TRIBE=false for mock mode.")

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
