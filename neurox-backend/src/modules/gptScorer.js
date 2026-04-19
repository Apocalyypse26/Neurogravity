// ═══════════════════════════════════════════════════════
// GPT Scorer Module — Step 2 of scan pipeline
// Single GPT-4o mini vision call per scan
// ═══════════════════════════════════════════════════════
import { openai } from "../services/openai.js";

const SYSTEM_PROMPT = `You are NEUROX, a crypto token visual trust analyzer. 
You specialize in detecting scam signals, manipulative design, 
low-effort launches, and unverifiable claims in crypto token visuals.
Always respond with valid JSON only. No markdown. No explanation outside JSON.`;

const USER_PROMPT = `Analyze this crypto token visual and return ONLY this JSON structure with no additional text:

{
  "scam_risk": <integer 0-100>,
  "scam_flags": [<specific red flags found, empty array if none>],
  "claim_credibility": <integer 0-100>,
  "claim_flags": [<unverifiable or exaggerated claims found in text>],
  "hype_manipulation": <integer 0-100>,
  "hype_flags": [<manipulation tactics detected>],
  "launch_quality": <integer 0-100>,
  "launch_notes": "<brief quality observation>",
  "ocr_text": "<all text visible in the image, empty string if none>"
}

Scoring guide:
- scam_risk: 0=no scam signals, 100=definite scam pattern
- claim_credibility: 0=all claims are fake/unverifiable, 100=all claims credible
- hype_manipulation: 0=no manipulation, 100=extreme FOMO tactics
- launch_quality: 0=extremely low effort, 100=professional grade

Specific things to flag in scam_flags:
- Logo copied or highly similar to known projects
- Celebrity faces used without verified association  
- Guaranteed return language ('100x guaranteed', 'can't lose')
- Fake partnership or exchange logos (Binance, Coinbase, etc.)
- Countdown timers or artificial urgency overlays
- Suspicious watermarks or copyright violations

Specific things to flag in hype_flags:
- Rocket, moon, lambo imagery used as primary visual
- Red/green candle overlays without context
- 'FOMO', 'last chance', 'limited slots' text
- Excessively bright colors designed to trigger impulse
- Fake price chart manipulations`;

const SIMPLIFIED_PROMPT = `Analyze this crypto token image. Return ONLY valid JSON:
{"scam_risk":<0-100>,"scam_flags":[],"claim_credibility":<0-100>,"claim_flags":[],"hype_manipulation":<0-100>,"hype_flags":[],"launch_quality":<0-100>,"launch_notes":"","ocr_text":""}`;

const DEFAULT_SCORES = {
  scam_risk: 50,
  scam_flags: ["analysis_failed"],
  claim_credibility: 50,
  claim_flags: ["analysis_failed"],
  hype_manipulation: 50,
  hype_flags: ["analysis_failed"],
  launch_quality: 50,
  launch_notes: "GPT analysis unavailable — default scores applied",
  ocr_text: "",
};

/**
 * Run GPT-4o mini vision analysis on an image.
 * Makes exactly ONE API call per scan. Retries once on parse failure.
 *
 * @param {Buffer} imageBuffer - Resized 512x512 WebP image buffer
 * @returns {Promise<object>} GPT scoring results
 */
export async function scoreWithGPT(imageBuffer) {
  const base64Image = imageBuffer.toString("base64");
  const imageDataUrl = `data:image/webp;base64,${base64Image}`;

  // First attempt — full prompt
  try {
    const result = await callGPT(imageDataUrl, USER_PROMPT);
    if (result) return result;
  } catch (err) {
    console.warn("[GPT_SCORER] First attempt failed:", err.message);
  }

  // Retry with simplified prompt
  try {
    const result = await callGPT(imageDataUrl, SIMPLIFIED_PROMPT);
    if (result) return result;
  } catch (err) {
    console.warn("[GPT_SCORER] Retry failed:", err.message);
  }

  // Both attempts failed — return defaults
  console.error("[GPT_SCORER] Both attempts failed — returning default scores");
  return { ...DEFAULT_SCORES };
}

/**
 * Make the actual GPT-4o mini vision API call and parse the JSON response.
 */
async function callGPT(imageDataUrl, userPrompt) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          { type: "image_url", image_url: { url: imageDataUrl, detail: "low" } },
        ],
      },
    ],
    max_tokens: 800,
    temperature: 0.3,
  });

  const raw = response.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("Empty GPT response");

  // Try to extract JSON from the response (handle markdown code fences)
  let jsonStr = raw;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }

  const parsed = JSON.parse(jsonStr);

  // Validate required fields exist and clamp scores
  return {
    scam_risk: clamp(parsed.scam_risk),
    scam_flags: Array.isArray(parsed.scam_flags) ? parsed.scam_flags : [],
    claim_credibility: clamp(parsed.claim_credibility),
    claim_flags: Array.isArray(parsed.claim_flags) ? parsed.claim_flags : [],
    hype_manipulation: clamp(parsed.hype_manipulation),
    hype_flags: Array.isArray(parsed.hype_flags) ? parsed.hype_flags : [],
    launch_quality: clamp(parsed.launch_quality),
    launch_notes: parsed.launch_notes || "",
    ocr_text: parsed.ocr_text || "",
  };
}

function clamp(val) {
  const n = parseInt(val, 10);
  if (isNaN(n)) return 50;
  return Math.max(0, Math.min(100, n));
}
