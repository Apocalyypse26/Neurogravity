// ═══════════════════════════════════════════════════════
// Supabase Client — Service Role access for backend ops
// ═══════════════════════════════════════════════════════
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("[SUPABASE] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseKey || "placeholder",
  { auth: { persistSession: false, autoRefreshToken: false } }
);
