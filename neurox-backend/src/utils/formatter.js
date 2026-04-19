// ═══════════════════════════════════════════════════════
// Formatter — Final JSON output builder
// Assembles all pipeline results into the NEUROX output format
// ═══════════════════════════════════════════════════════

/**
 * Generate a NEUROX scan ID.
 * Format: NRX-YYYYMMDD-XXXX (4 random hex digits)
 *
 * @returns {string}
 */
export function generateScanId() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, "0")
    .toUpperCase();
  return `NRX-${date}-${rand}`;
}

/**
 * Build the final NEUROX scan result JSON.
 *
 * @param {object} params
 * @param {string} params.scanId
 * @param {number} params.trustScore
 * @param {string} params.riskLevel
 * @param {string} params.verdict
 * @param {object} params.scores       - All 6 sub-scores
 * @param {string[]} params.flags      - Combined flags array
 * @param {string} params.recommendation
 * @param {string} params.ocrText
 * @param {object} params.platformData - Input metadata
 * @returns {object} Final formatted scan result
 */
export function formatScanResult({
  scanId,
  trustScore,
  riskLevel,
  verdict,
  scores,
  flags,
  recommendation,
  ocrText,
  platformData,
}) {
  return {
    scan_id: scanId,
    trust_score: trustScore,
    risk_level: riskLevel,
    verdict,
    scores: {
      scam_risk: scores.scam_risk ?? 50,
      claim_credibility: scores.claim_credibility ?? 50,
      hype_manipulation: scores.hype_manipulation ?? 50,
      launch_quality: scores.launch_quality ?? 50,
      brand_originality: scores.brand_originality ?? 70,
      visual_consistency: scores.visual_consistency ?? 75,
    },
    flags: flags || [],
    recommendation: recommendation || "",
    ocr_text: ocrText || "",
    platform_data: {
      input_type: platformData?.input_type || "image",
      analyzed_assets: platformData?.analyzed_assets || 1,
      duplicate_detected: platformData?.duplicate_detected || false,
      cache_hit: platformData?.cache_hit || false,
      quality_flags: platformData?.quality_flags || [],
    },
    timestamp: new Date().toISOString(),
  };
}
