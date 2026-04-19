// ═══════════════════════════════════════════════════════
// Scoring Weights Configuration
// Controls how each module contributes to the final trust score
// ═══════════════════════════════════════════════════════

export const WEIGHTS = {
  scam_risk: 0.25,          // inverted — higher scam = lower trust
  claim_credibility: 0.15,
  hype_manipulation: 0.15,  // inverted — higher hype = lower trust
  launch_quality: 0.10,
  brand_originality: 0.20,
  visual_consistency: 0.15,
};
