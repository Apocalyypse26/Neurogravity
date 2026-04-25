import os
import math
import logging
import json
import re
from typing import Dict, List, Any
from urllib.parse import urlparse

logger = logging.getLogger("neurox.tribe")

USE_REAL_TRIBE = os.getenv("USE_REAL_TRIBE", "false").lower() == "true"

ALLOWED_SSRF_DOMAINS = [
    "supabase.co", "supabase.in", "storage.googleapis.com",
    "googleapis.com", "amazonaws.com", "r2.cloudflarestorage.com",
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
        for prefix in RESERVED_IP_RANGES:
            if ip_address.startswith(prefix):
                return False
        domain = hostname.split(":")[0]
        if not any(domain.endswith(a) or domain == a for a in ALLOWED_SSRF_DOMAINS):
            return False
        return True
    except Exception:
        return False


# Initialize OpenAI if API key is available
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_CLIENT = None

if OPENAI_API_KEY:
    try:
        from openai import OpenAI
        OPENAI_CLIENT = OpenAI(api_key=OPENAI_API_KEY)
        logger.info("[TRIBE] OpenAI client initialized successfully")
    except ImportError:
        logger.warning("[TRIBE] openai not installed. Run: pip install openai")
    except Exception as e:
        logger.warning("[TRIBE] OpenAI client init failed: %s", e)


def seeded_random(seed: int, offset: int) -> float:
    x = math.sin(seed + offset) * 10000
    return x - math.floor(x)


class TribeOutput:
    def __init__(self, time_series: List[float],
                 raw_hook_score: float, raw_attention_peak: float,
                 raw_attention_mean: float, raw_ending_strength: float,
                 raw_emotion_spike: float, raw_visual_punch: float,
                 ocr_text: str = "", ocr_readability: float = 0.5,
                 relevance_score: float = 0.5,
                 metadata: Dict[str, Any] = None,
                 ai_adjustment: int = 0, ai_reasoning: str = "",
                 ai_fixes: List[str] = None,
                 ai_best_platform: str = "", ai_rank: str = ""):
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
        self.ai_adjustment = ai_adjustment
        self.ai_reasoning = ai_reasoning
        self.ai_fixes = ai_fixes or []
        self.ai_best_platform = ai_best_platform
        self.ai_rank = ai_rank

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
            "metadata": self.metadata,
            "ai_adjustment": self.ai_adjustment,
            "ai_reasoning": self.ai_reasoning,
            "ai_fixes": self.ai_fixes,
            "ai_best_platform": self.ai_best_platform,
            "ai_rank": self.ai_rank
        }


class TribeService:
    """Hybrid analysis: deterministic PIL visual features + Gemini AI crypto trust refinement."""

    def __init__(self):
        self.use_real = USE_REAL_TRIBE
        logger.info("TRIBE initialized in %s mode", 'REAL' if self.use_real else 'MOCK')

    async def analyze(self, file_path: str, media_type: str, seed: int,
                      ocr_text: str = "", features: Dict[str, Any] = None) -> TribeOutput:
        features = features or {}
        signals = self._compute_signals(features, media_type)

        # Gemini AI refinement for crypto token trust analysis
        if GEMINI_CLIENT and self.use_real:
            try:
                ai = await self._get_ai_trust_analysis(features, ocr_text, media_type, signals)
                signals["ai_adjustment"] = ai.get("trust_adjustment", 0)
                signals["ai_reasoning"] = ai.get("signal_summary", "")
                signals["ai_fixes"] = ai.get("risk_flags", [])
                signals["ai_best_platform"] = ai.get("recommended_action", "HOLD")
                signals["ai_rank"] = ai.get("rank", "")
                signals["mode"] = "hybrid_ai"
                logger.info("[TRIBE] Gemini trust analysis: adjustment=%d", signals["ai_adjustment"])
            except Exception as e:
                logger.warning("[TRIBE] Gemini analysis failed, using deterministic: %s", e)
                signals["mode"] = "deterministic"
        else:
            signals["mode"] = "deterministic"
            logger.info("[TRIBE] Deterministic analysis (no AI or USE_REAL_TRIBE=false)")

        return self._build_output(signals, features, media_type, seed, ocr_text)

    # ── Deterministic Scoring (based on visual features of token screenshots) ─

    def _compute_signals(self, f: Dict, media_type: str) -> Dict[str, Any]:
        brightness = f.get("brightness", 0.5)
        contrast = f.get("contrast", 0.5)
        saturation = f.get("saturation", 0.5)
        edge_density = f.get("edge_density", 0.3)
        complexity = f.get("image_complexity", 0.6)
        text_detected = f.get("text_detected", False)
        text_density = f.get("text_density", 0.0)
        color_variety = f.get("color_variety", 0.5)
        hook_strength = f.get("hook_strength", "medium")

        # For crypto token screenshots: text-heavy, dark-mode, moderate complexity = high trust signals
        # A legitimate token dashboard typically has:
        # - Dark background (professional UI)
        # - High text density (charts, numbers, addresses)
        # - Moderate-high contrast (readable data)
        # - Moderate complexity (structured layout, not chaos)

        # Contract safety signal: high contrast + text = structured data visible
        contract_s = min((contrast / 0.6) * 0.6 + (text_density * 0.4 if text_detected else 0.1), 1.0)

        # Liquidity health: well-lit, clear data visualization
        liquidity_s = max(0, min(1, 1.0 - 2.0 * abs(brightness - 0.45)))

        # Market credibility: text density + complexity (charts, tables)
        credibility_s = 0.4
        if text_detected:
            credibility_s = 0.5 + text_density * 0.5
        credibility_s = min(credibility_s, 1.0)

        # Team transparency: image complexity (more structured data = more info disclosed)
        transparency_s = max(0, min(1, 1.0 - 2.0 * abs(complexity - 0.70)))

        # Social signals: color variety (branded token materials)
        social_s = max(0, min(1, 1.0 - 2.0 * abs(color_variety - 0.45)))

        # Volatility risk: extreme saturation or deep-fried = suspicious
        is_deep_fried = f.get("is_deep_fried", False)
        volatility_s = max(0, 1.0 - (saturation * 0.5) - (0.3 if is_deep_fried else 0))

        # Data clarity: edge density in readable range
        edge_s = max(0, min(1, 1.0 - 2.0 * abs(edge_density - 0.30)))

        hook_map = {"strong": 0.85, "medium": 0.65, "weak": 0.40}
        hook_s = hook_map.get(hook_strength, 0.65)

        return {
            "contract_score": round(contract_s, 3),
            "liquidity_score": round(liquidity_s, 3),
            "credibility_score": round(credibility_s, 3),
            "transparency_score": round(transparency_s, 3),
            "social_score": round(social_s, 3),
            "volatility_score": round(volatility_s, 3),
            "clarity_score": round(edge_s, 3),
            "hook_score": round(hook_s, 3),
            "ai_adjustment": 0, "ai_reasoning": "", "ai_fixes": [],
            "ai_best_platform": "", "ai_rank": "",
        }

    # ── OpenAI AI Trust Analysis ─────────────────────────────────────

    async def _get_ai_trust_analysis(self, features: Dict, ocr_text: str,
                                      media_type: str, signals: Dict) -> Dict[str, Any]:
        report = self._build_token_report(features, ocr_text, media_type, signals)

        prompt = f"""You are NEUROX, an expert crypto token security analyst. Analyze this token screenshot data and provide a trust assessment.

{report}

Analyze for: contract legitimacy, liquidity health, rugpull risk, team transparency, and overall token safety.

Respond ONLY with valid JSON (no markdown, no extra text):
{{"trust_adjustment": <int -25 to +25>, "signal_summary": "<2-3 sentence analysis of the token's trust signals>", "risk_flags": ["<specific risk or positive signal 1>", "<risk or signal 2>", "<risk or signal 3>"], "recommended_action": "<BUY|HOLD|AVOID|DANGER>", "rank": "<one of the ranks below>"}}

Ranks (pick exactly one):
"[SAFE] High Trust Token — Strong Fundamentals"
"[CAUTION] Due Diligence Required — Mixed Signals"
"[RISK] Suspicious Signals — Proceed Carefully"
"[DANGER] High Rug Risk — Multiple Red Flags"
"[SCAM] Critical Threat — Likely Fraudulent"
"""
        logger.info("[TRIBE] Sending token data to OpenAI for trust analysis...")

        try:
            response = OPENAI_CLIENT.chat.completions.create(
                model="gpt-4o-mini",  # Fast and effective for structured analysis
                messages=[
                    {"role": "system", "content": "You are NEUROX, an expert crypto token security analyst."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            text = response.choices[0].message.content.strip()
            logger.info("[TRIBE] OpenAI response: %s", text[:300])
        except Exception as e:
            logger.error("[TRIBE] OpenAI API call failed: %s", e)
            text = "{}"

        # Strip markdown code fences if present
        text = re.sub(r'^```(?:json)?\s*', '', text, flags=re.MULTILINE)
        text = re.sub(r'\s*```$', '', text, flags=re.MULTILINE)
        text = text.strip()

        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            result = json.loads(match.group())
            result["trust_adjustment"] = max(-25, min(25, int(result.get("trust_adjustment", 0))))
            return result

        logger.warning("[TRIBE] Failed to parse OpenAI JSON response")
        return {
            "trust_adjustment": 0,
            "signal_summary": "Analysis completed with limited data.",
            "risk_flags": ["Insufficient data for full analysis.", "Manual review recommended.", "Verify contract on-chain."],
            "recommended_action": "HOLD",
            "rank": "[CAUTION] Due Diligence Required — Mixed Signals"
        }

    def _build_token_report(self, f: Dict, ocr_text: str,
                             media_type: str, signals: Dict) -> str:
        lines = [
            f"Content type: {media_type} (crypto token screenshot)",
            f"Resolution: {f.get('resolution', '?')}",
            f"UI Mode: {'Dark Mode (professional)' if f.get('is_dark_mode') else 'Light Mode'}",
            f"Brightness: {f.get('brightness', 0):.0%} ({f.get('brightness_label', '?')})",
            f"Contrast: {f.get('contrast', 0):.0%} ({f.get('contrast_label', '?')})",
            f"Saturation: {f.get('saturation', 0):.0%} ({f.get('saturation_label', '?')})",
            f"Image complexity: {f.get('image_complexity', 0):.0%} ({f.get('complexity_label', '?')})",
            f"Text detected: {'Yes' if f.get('text_detected') else 'No'}",
        ]
        if f.get("text_detected"):
            lines.append(f"Text density: {f.get('text_density', 0):.0%}")
            lines.append(f"Text position: {f.get('text_position', '?')}")
        lines += [
            f"Appears deep-fried/manipulated: {'Yes — SUSPICIOUS' if f.get('is_deep_fried') else 'No'}",
            f"Color variety: {f.get('color_variety', 0):.0%}",
            f"Dominant colors: {', '.join(f.get('dominant_colors', ['?'])[:4])}",
            f"Visual weight: {f.get('visual_weight', '?')}",
        ]
        if ocr_text and "[no significant" not in ocr_text:
            lines.append(f"\nExtracted text from screenshot:\n{ocr_text[:800]}")
        lines.append(
            f"\nBase deterministic scores: "
            f"contract={signals.get('contract_score', 0):.0%} "
            f"liquidity={signals.get('liquidity_score', 0):.0%} "
            f"credibility={signals.get('credibility_score', 0):.0%}"
        )
        return "\n".join(lines)

    # ── Build Output ─────────────────────────────────────────────────

    def _build_output(self, signals: Dict, features: Dict,
                      media_type: str, seed: int, ocr_text: str) -> TribeOutput:
        num_frames = 30 if media_type == "image" else 60
        hook = signals["hook_score"]
        base = 0.35 + hook * 0.40

        time_series = []
        for i in range(num_frames):
            progress = i / num_frames
            hook_boost = (3 - i) * 0.08 * hook if i < 3 else 0
            decay = 1 - (progress * 0.20)
            noise = math.sin(seed + i * 0.7) * 0.04
            ending = signals["contract_score"] * 0.04 if i > num_frames * 0.75 else 0
            val = min(max(base + hook_boost + noise + ending, 0), 1) * decay
            time_series.append(round(val, 4))

        # Map to raw scores for score_mapper
        raw_hook = signals["contract_score"]           # → Contract Safety
        raw_peak = signals["liquidity_score"]          # → Liquidity Health
        raw_mean = signals["credibility_score"]        # → Market Credibility
        raw_ending = signals["transparency_score"]     # → Team Transparency
        raw_emotion = signals["volatility_score"]      # → Volatility Risk
        raw_vp = signals["social_score"]               # → Social Signals
        ocr_readability = signals["clarity_score"]     # → Data Clarity

        compact_meta = {k: v for k, v in features.items()
                        if k not in ("region_edge_scores", "dominant_colors")}

        return TribeOutput(
            time_series=time_series,
            raw_hook_score=raw_hook,
            raw_attention_peak=raw_peak,
            raw_attention_mean=raw_mean,
            raw_ending_strength=raw_ending,
            raw_emotion_spike=raw_emotion,
            raw_visual_punch=raw_vp,
            ocr_text=ocr_text,
            ocr_readability=ocr_readability,
            relevance_score=signals.get("hook_score", 0.65),
            metadata={
                "media_type": media_type, "num_frames": num_frames,
                "seed": seed, "mode": signals.get("mode", "deterministic"),
                "features_summary": compact_meta
            },
            ai_adjustment=signals.get("ai_adjustment", 0),
            ai_reasoning=signals.get("ai_reasoning", ""),
            ai_fixes=signals.get("ai_fixes", []),
            ai_best_platform=signals.get("ai_best_platform", ""),
            ai_rank=signals.get("ai_rank", "")
        )


tribe_service = TribeService()
