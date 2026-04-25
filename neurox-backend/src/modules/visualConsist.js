// ═══════════════════════════════════════════════════════
// Visual Consistency Module — Step 4 of scan pipeline
// Local color palette comparison — zero API cost
// ═══════════════════════════════════════════════════════
import { extractDominantColors, comparePalettes } from "../utils/colorPalette.js";

/**
 * Check visual consistency across one or more images.
 *
 * - If single image: returns neutral 75 (cannot compare)
 * - If multiple images: compares palettes and scores overlap
 *
 * @param {Buffer[]} imageBuffers - Array of image buffers to compare
 * @returns {Promise<{ visual_consistency: number, flags: string[], note: string }>}
 */
export async function checkVisualConsistency(imageBuffers) {
  // ── Single image — neutral score ────────────────────
  if (!imageBuffers || imageBuffers.length <= 1) {
    return {
      visual_consistency: 75,
      flags: [],
      note: "Single asset — consistency check requires multiple images",
    };
  }

  // ── Multiple images — extract palettes and compare ──
  const palettes = [];

  for (const buffer of imageBuffers) {
    try {
      const colors = await extractDominantColors(buffer, 5);
      palettes.push(colors);
    } catch (err) {
      console.warn("[VISUAL_CONSIST] Failed to extract palette:", err.message);
    }
  }

  if (palettes.length < 2) {
    return {
      visual_consistency: 75,
      flags: [],
      note: "Could not extract sufficient palettes for comparison",
    };
  }

  // Compare all palette pairs and compute average overlap
  let totalOverlap = 0;
  let comparisons = 0;

  for (let i = 0; i < palettes.length; i++) {
    for (let j = i + 1; j < palettes.length; j++) {
      const overlap = comparePalettes(palettes[i], palettes[j]);
      totalOverlap += overlap;
      comparisons++;
    }
  }

  const avgOverlap = comparisons > 0 ? totalOverlap / comparisons : 0;

  // ── Score based on overlap percentage ───────────────
  let visual_consistency;
  const flags = [];

  if (avgOverlap >= 67) {
    visual_consistency = Math.round(85 + (avgOverlap - 67) * (15 / 33));
  } else if (avgOverlap >= 30) {
    visual_consistency = Math.round(50 + (avgOverlap - 30) * (34 / 37));
  } else {
    visual_consistency = Math.round(avgOverlap * (49 / 30));
    flags.push("Inconsistent visual branding detected across assets");
  }

  visual_consistency = Math.max(0, Math.min(100, visual_consistency));

  return {
    visual_consistency,
    flags,
    note: `Color palette overlap: ${Math.round(avgOverlap)}% across ${comparisons} comparisons`,
  };
}
