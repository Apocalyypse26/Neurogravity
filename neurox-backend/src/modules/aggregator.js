// ═══════════════════════════════════════════════════════
// Aggregator Module — Step 5 of scan pipeline
// Weighted trust score calculation + risk classification
// ═══════════════════════════════════════════════════════
import { WEIGHTS } from "../config/weights.js";

/**
 * Aggregate all module scores into a single trust score with risk classification.
 *
 * Inversion logic:
 *  - scam_risk and hype_manipulation are INVERTED (higher = lower trust)
 *  - All other scores contribute directly (higher = higher trust)
 *
 * @param {object} scores
 * @param {number} scores.scam_risk           - 0–100 from GPT
 * @param {number} scores.claim_credibility   - 0–100 from GPT
 * @param {number} scores.hype_manipulation   - 0–100 from GPT
 * @param {number} scores.launch_quality      - 0–100 from GPT
 * @param {number} scores.brand_originality   - 0–100 from CLIP
 * @param {number} scores.visual_consistency  - 0–100 from palette
 * @returns {{ trustScore: number, riskLevel: string, verdict: string, recommendation: string }}
 */
export function aggregate(scores) {
  // Weighted contributions
  const scamContrib = (100 - scores.scam_risk) * WEIGHTS.scam_risk;
  const credContrib = scores.claim_credibility * WEIGHTS.claim_credibility;
  const hypeContrib = (100 - scores.hype_manipulation) * WEIGHTS.hype_manipulation;
  const launchContrib = scores.launch_quality * WEIGHTS.launch_quality;
  const brandContrib = scores.brand_originality * WEIGHTS.brand_originality;
  const consistContrib = scores.visual_consistency * WEIGHTS.visual_consistency;

  const trustScore = Math.round(
    scamContrib + credContrib + hypeContrib + launchContrib + brandContrib + consistContrib
  );

  // Clamp to 0–100
  const clampedScore = Math.max(0, Math.min(100, trustScore));

  // Risk classification
  let riskLevel, verdict;

  if (clampedScore <= 25) {
    riskLevel = "CRITICAL RISK";
    verdict = "Do not engage";
  } else if (clampedScore <= 45) {
    riskLevel = "HIGH RISK";
    verdict = "Proceed with extreme caution";
  } else if (clampedScore <= 65) {
    riskLevel = "MODERATE RISK";
    verdict = "Unverified — DYOR";
  } else if (clampedScore <= 80) {
    riskLevel = "LOOKS LEGIT";
    verdict = "Passes visual trust check";
  } else {
    riskLevel = "HIGH TRUST";
    verdict = "Strong brand signals";
  }

  // Generate recommendation from scores
  const recommendation = generateRecommendation(scores, clampedScore);

  return {
    trustScore: clampedScore,
    riskLevel,
    verdict,
    recommendation,
  };
}

/**
 * Generate a human-readable recommendation based on score breakdown.
 */
function generateRecommendation(scores, trustScore) {
  const issues = [];

  if (scores.scam_risk >= 70) {
    issues.push("High scam probability detected");
  }
  if (scores.hype_manipulation >= 70) {
    issues.push("Extreme hype/FOMO manipulation tactics");
  }
  if (scores.claim_credibility <= 30) {
    issues.push("Claims appear unverifiable or exaggerated");
  }
  if (scores.brand_originality <= 30) {
    issues.push("Possible brand/logo copying detected");
  }
  if (scores.launch_quality <= 30) {
    issues.push("Very low production quality");
  }
  if (scores.visual_consistency <= 30) {
    issues.push("Inconsistent visual branding");
  }

  if (issues.length === 0) {
    if (trustScore >= 80) {
      return "Visual analysis shows strong trust signals. Standard due diligence still recommended.";
    }
    return "No critical visual red flags detected. Verify claims independently.";
  }

  return `${issues.length > 1 ? "Multiple" : "A"} high-risk visual signal${issues.length > 1 ? "s" : ""} detected. ${issues.join(". ")}.`;
}
