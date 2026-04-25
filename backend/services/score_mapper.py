from typing import Dict, List, Any
from .tribe_service import TribeOutput


class NeuroMetrics:
    def __init__(self, neuro_virality_score: int, hook_score: int,
                 peak_response: int, sustained_attention: int,
                 ending_strength: int, drop_off_risk: float,
                 emotion_spike: int, visual_punch: int,
                 readability_relevance_blend: int, best_platform: str,
                 confidence: Dict[str, Any], rank: str,
                 sub_scores: List[Dict[str, Any]], fixes: List[str],
                 time_series: List[float], raw_tribe_data: Dict[str, Any]):
        self.neuro_virality_score = neuro_virality_score
        self.hook_score = hook_score
        self.peak_response = peak_response
        self.sustained_attention = sustained_attention
        self.ending_strength = ending_strength
        self.drop_off_risk = drop_off_risk
        self.emotion_spike = emotion_spike
        self.visual_punch = visual_punch
        self.readability_relevance_blend = readability_relevance_blend
        self.best_platform = best_platform
        self.confidence = confidence
        self.rank = rank
        self.sub_scores = sub_scores
        self.fixes = fixes
        self.time_series = time_series
        self.raw_tribe_data = raw_tribe_data

    def to_neurox_format(self) -> Dict[str, Any]:
        return {
            "globalScore": self.neuro_virality_score,
            "confidence": self.confidence,
            "rank": self.rank,
            "subScores": self.sub_scores,
            "fixes": self.fixes,
            "timeSeries": self.time_series,
            "bestPlatform": self.best_platform,      # now = recommendedAction (BUY/HOLD/AVOID/DANGER)
            "dropOffRisk": round(self.drop_off_risk, 2),  # now = rugRisk
            "rawTribeData": self.raw_tribe_data
        }


class ScoreMapper:
    """Maps TribeOutput → NeuroMetrics for crypto token trust scoring.
    
    Score semantics (renamed from meme-virality to token trust):
      raw_hook_score        → Contract Safety
      raw_attention_peak    → Liquidity Health
      raw_attention_mean    → Market Credibility
      raw_ending_strength   → Team Transparency
      raw_emotion_spike     → Volatility Risk (inverted — lower = safer)
      raw_visual_punch      → Social Signals
      ocr_readability       → Data Clarity
    """

    def map(self, tribe_output: TribeOutput) -> NeuroMetrics:
        # Raw signal scores (0-100)
        contract_safety   = int(tribe_output.raw_hook_score * 100)
        liquidity_health  = int(tribe_output.raw_attention_peak * 100)
        mkt_credibility   = int(tribe_output.raw_attention_mean * 100)
        transparency      = int(tribe_output.raw_ending_strength * 100)
        # Volatility risk: invert so higher = more volatile = lower trust contribution
        volatility_risk   = int((1.0 - tribe_output.raw_emotion_spike) * 100)
        social_signals    = int(tribe_output.raw_visual_punch * 100)
        data_clarity      = int(tribe_output.ocr_readability * 100)

        # ── Deterministic trust base score ─────────────────────────────
        # Contract safety and liquidity are most important for token trust
        base_score = int(
            0.30 * contract_safety +
            0.25 * liquidity_health +
            0.20 * mkt_credibility +
            0.15 * transparency +
            0.10 * data_clarity
        )

        # ── Apply Gemini AI trust adjustment (clamped -25 to +25) ──────
        ai_adj = tribe_output.ai_adjustment
        trust_score = max(0, min(100, base_score + ai_adj))

        # Rug risk = how quickly trust signals drop off over the time series
        ts = tribe_output.time_series
        if len(ts) >= 10:
            early = sum(ts[:3]) / 3
            late = sum(ts[-7:]) / 7
            rug_risk = max(0, 1 - (late / early)) if early > 0 else 0.5
        else:
            rug_risk = 0.5

        # Recommended action — prefer AI's pick, else compute from score
        if tribe_output.ai_best_platform:
            recommended_action = tribe_output.ai_best_platform
        else:
            recommended_action = self._determine_action(trust_score)

        confidence = self._calculate_confidence(tribe_output)

        # Rank — prefer AI's pick, else generate from score
        rank = tribe_output.ai_rank if tribe_output.ai_rank else \
            self._generate_rank(trust_score)

        # Risk flags — prefer AI's analysis, else generate deterministic
        fixes = tribe_output.ai_fixes[:3] if tribe_output.ai_fixes else \
            self._generate_risk_flags(tribe_output, contract_safety, rug_risk, data_clarity)
        while len(fixes) < 3:
            fixes.append("Verify token contract on blockchain explorer before investing.")
        fixes = fixes[:3]

        sub_scores = [
            {"name": "Contract Safety",    "val": contract_safety},
            {"name": "Liquidity Health",   "val": liquidity_health},
            {"name": "Market Credibility", "val": mkt_credibility},
            {"name": "Team Transparency",  "val": transparency},
            {"name": "Social Signals",     "val": social_signals},
            {"name": "Volatility Risk",    "val": volatility_risk},
            {"name": "Data Clarity",       "val": data_clarity},
        ]

        return NeuroMetrics(
            neuro_virality_score=trust_score,
            hook_score=contract_safety,
            peak_response=liquidity_health,
            sustained_attention=mkt_credibility,
            ending_strength=transparency,
            drop_off_risk=rug_risk,
            emotion_spike=volatility_risk,
            visual_punch=social_signals,
            readability_relevance_blend=data_clarity,
            best_platform=recommended_action,
            confidence=confidence,
            rank=rank,
            sub_scores=sub_scores,
            fixes=fixes,
            time_series=tribe_output.time_series,
            raw_tribe_data=tribe_output.to_dict()
        )

    def _determine_action(self, score: int) -> str:
        if score >= 80: return "BUY"
        if score >= 65: return "HOLD"
        if score >= 45: return "AVOID"
        return "DANGER"

    def _calculate_confidence(self, t: TribeOutput) -> Dict[str, Any]:
        mode = t.metadata.get("mode", "deterministic")
        if mode == "hybrid_ai":
            return {"text": "HIGH CONFIDENCE", "color": "#10b981"}
        var = self._variance(t.time_series)
        if var < 0.05 and len(t.time_series) >= 30:
            return {"text": "HIGH CONFIDENCE", "color": "#10b981"}
        if var < 0.15:
            return {"text": "MEDIUM CONFIDENCE", "color": "#f59e0b"}
        return {"text": "EXPERIMENTAL", "color": "#8b5cf6"}

    def _variance(self, data: List[float]) -> float:
        if not data:
            return 1.0
        m = sum(data) / len(data)
        return sum((x - m) ** 2 for x in data) / len(data)

    def _generate_rank(self, score: int) -> str:
        if score >= 85: return "[SAFE] High Trust Token — Strong Fundamentals"
        if score >= 70: return "[CAUTION] Due Diligence Required — Mixed Signals"
        if score >= 55: return "[RISK] Suspicious Signals — Proceed Carefully"
        if score >= 40: return "[DANGER] High Rug Risk — Multiple Red Flags"
        return "[SCAM] Critical Threat — Likely Fraudulent"

    def _generate_risk_flags(self, t: TribeOutput, contract: int,
                              rug_risk: float, clarity: int) -> List[str]:
        flags = []
        if contract < 50:
            flags.append("Contract safety signals are weak — verify contract address on Etherscan/Solscan.")
        if rug_risk > 0.4:
            flags.append("High rug risk detected — liquidity lock status should be verified.")
        if t.raw_attention_peak < 0.5:
            flags.append("Low liquidity indicators — check pool depth before entering a position.")
        if clarity < 40:
            flags.append("Screenshot data is unclear — poor quality may indicate information hiding.")
        if t.raw_ending_strength < 0.4:
            flags.append("Team transparency signals are weak — check for doxxed team or KYC audit.")
        if not flags:
            flags.append("Basic trust signals look positive — always DYOR before investing.")
        return flags[:4]


score_mapper = ScoreMapper()
