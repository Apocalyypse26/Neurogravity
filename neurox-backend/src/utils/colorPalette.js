// ═══════════════════════════════════════════════════════
// Color Palette — Dominant color extraction via median cut
// Uses sharp for pixel data, pure JS for clustering
// ═══════════════════════════════════════════════════════
import sharp from "sharp";

/**
 * Extract the top N dominant colors from an image buffer
 * using the Median Cut algorithm.
 *
 * @param {Buffer} imageBuffer - Raw image buffer
 * @param {number} count       - Number of dominant colors to extract (default: 5)
 * @returns {Promise<Array<{r: number, g: number, b: number, hex: string, population: number}>>}
 */
export async function extractDominantColors(imageBuffer, count = 5) {
  // Resize to 50x50 for speed and read raw RGB pixels
  const { data } = await sharp(imageBuffer)
    .resize(50, 50, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Build pixel array
  const pixels = [];
  for (let i = 0; i < data.length; i += 3) {
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }

  // Median Cut algorithm
  const buckets = medianCut(pixels, count);

  // Average each bucket to get dominant color
  const colors = buckets
    .map((bucket) => {
      if (bucket.length === 0) return null;
      const avg = [0, 0, 0];
      for (const px of bucket) {
        avg[0] += px[0];
        avg[1] += px[1];
        avg[2] += px[2];
      }
      const r = Math.round(avg[0] / bucket.length);
      const g = Math.round(avg[1] / bucket.length);
      const b = Math.round(avg[2] / bucket.length);
      return {
        r,
        g,
        b,
        hex: `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`,
        population: bucket.length,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.population - a.population);

  return colors.slice(0, count);
}

/**
 * Median Cut: recursively split pixel groups along their widest color channel.
 */
function medianCut(pixels, depth) {
  if (depth <= 1 || pixels.length === 0) {
    return [pixels];
  }

  // Find channel with greatest range
  const ranges = [0, 1, 2].map((ch) => {
    const vals = pixels.map((p) => p[ch]);
    return Math.max(...vals) - Math.min(...vals);
  });

  const splitChannel = ranges.indexOf(Math.max(...ranges));

  // Sort pixels by that channel
  pixels.sort((a, b) => a[splitChannel] - b[splitChannel]);

  const mid = Math.floor(pixels.length / 2);
  const left = pixels.slice(0, mid);
  const right = pixels.slice(mid);

  return [...medianCut(left, depth - 1), ...medianCut(right, depth - 1)];
}

/**
 * Compare two color palettes and return overlap percentage.
 * "Overlap" = how many colors in palette A have a close match in palette B.
 *
 * @param {Array} paletteA - Array of {r, g, b} objects
 * @param {Array} paletteB - Array of {r, g, b} objects
 * @param {number} threshold - Max Euclidean distance to consider a "match" (default: 60)
 * @returns {number} Overlap percentage 0–100
 */
export function comparePalettes(paletteA, paletteB, threshold = 60) {
  if (!paletteA.length || !paletteB.length) return 0;

  const topA = paletteA.slice(0, 3);
  let matches = 0;

  for (const colorA of topA) {
    for (const colorB of paletteB) {
      const dist = Math.sqrt(
        (colorA.r - colorB.r) ** 2 + (colorA.g - colorB.g) ** 2 + (colorA.b - colorB.b) ** 2
      );
      if (dist <= threshold) {
        matches++;
        break;
      }
    }
  }

  return Math.round((matches / topA.length) * 100);
}
