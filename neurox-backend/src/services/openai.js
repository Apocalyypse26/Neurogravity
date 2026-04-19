// ═══════════════════════════════════════════════════════
// OpenAI Client — GPT-4o mini vision access
// ═══════════════════════════════════════════════════════
import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error("[OPENAI] Missing OPENAI_API_KEY — GPT scoring disabled");
}

export const openai = new OpenAI({ apiKey: apiKey || "sk-placeholder" });
