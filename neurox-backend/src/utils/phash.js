// ═══════════════════════════════════════════════════════
// pHash — Perceptual Hash Generation
// Uses DCT-based approach for image fingerprinting
// ═══════════════════════════════════════════════════════
import sharp from "sharp";

/**
 * Generate a perceptual hash (pHash) for an image buffer.
 *
 * Algorithm:
 *  1. Resize to 32x32 greyscale
 *  2. Compute simplified DCT (Discrete Cosine Transform) on pixel values
 *  3. Take the top-left 8x8 of the DCT (low frequency components)
 *  4. Compute median of those 64 values
 *  5. Set each bit: 1 if value > median, 0 otherwise
 *  6. Return as 16-char hex string (64 bits)
 *
 * @param {Buffer} imageBuffer - Raw image buffer (any format sharp can read)
 * @returns {Promise<string>} 16-character hex string representing the pHash
 */
export async function generatePHash(imageBuffer) {
  // Step 1: Resize to 32x32 greyscale
  const { data } = await sharp(imageBuffer)
    .resize(32, 32, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const size = 32;
  const pixels = new Float64Array(size * size);
  for (let i = 0; i < data.length; i++) {
    pixels[i] = data[i];
  }

  // Step 2: Compute simplified DCT
  const dctSize = 32;
  const dct = new Float64Array(dctSize * dctSize);

  for (let u = 0; u < dctSize; u++) {
    for (let v = 0; v < dctSize; v++) {
      let sum = 0;
      for (let x = 0; x < dctSize; x++) {
        for (let y = 0; y < dctSize; y++) {
          sum +=
            pixels[x * dctSize + y] *
            Math.cos(((2 * x + 1) * u * Math.PI) / (2 * dctSize)) *
            Math.cos(((2 * y + 1) * v * Math.PI) / (2 * dctSize));
        }
      }
      const cu = u === 0 ? 1 / Math.SQRT2 : 1;
      const cv = v === 0 ? 1 / Math.SQRT2 : 1;
      dct[u * dctSize + v] = (cu * cv * sum * 2) / dctSize;
    }
  }

  // Step 3: Take top-left 8x8 (low-frequency components), skip [0][0] (DC)
  const hashSize = 8;
  const lowFreq = [];
  for (let u = 0; u < hashSize; u++) {
    for (let v = 0; v < hashSize; v++) {
      if (u === 0 && v === 0) continue; // skip DC component
      lowFreq.push(dct[u * dctSize + v]);
    }
  }

  // Step 4: Compute median
  const sorted = [...lowFreq].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  // Step 5: Build binary hash — 1 if above median, 0 otherwise
  const bits = [];
  for (let i = 0; i < 64; i++) {
    bits.push(i < lowFreq.length && lowFreq[i] > median ? 1 : 0);
  }

  // Step 6: Convert to 16-char hex string
  let hex = "";
  for (let i = 0; i < 64; i += 4) {
    const nibble = (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3];
    hex += nibble.toString(16);
  }

  return hex;
}

/**
 * Compute Hamming distance between two pHash hex strings.
 * Lower distance = more similar images.
 *
 * @param {string} hash1
 * @param {string} hash2
 * @returns {number} Hamming distance (0-64)
 */
export function hammingDistance(hash1, hash2) {
  if (hash1.length !== hash2.length) return 64;
  let dist = 0;
  for (let i = 0; i < hash1.length; i++) {
    const xor = parseInt(hash1[i], 16) ^ parseInt(hash2[i], 16);
    dist += ((xor >> 3) & 1) + ((xor >> 2) & 1) + ((xor >> 1) & 1) + (xor & 1);
  }
  return dist;
}
