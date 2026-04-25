// ═══════════════════════════════════════════════════════
// Authentication Middleware — Validates Supabase JWT tokens
// ═══════════════════════════════════════════════════════
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// Lightweight auth client for token verification
const supabaseAuth = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

/**
 * Verify Supabase JWT token from Authorization header.
 * Expects: "Bearer <token>"
 */
export async function authenticate(req, res, next) {
  // Skip auth in development if no Supabase configured
  if (!supabaseAuth) {
    if (process.env.NODE_ENV !== "production") {
      req.user = { id: "dev-user" };
      return next();
    }
    return res.status(503).json({ error: "Authentication not configured" });
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const token = authHeader.slice(7); // Remove "Bearer "

  try {
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    req.user = { id: user.id, email: user.email };
    next();
  } catch (err) {
    console.error("[AUTH] Token verification failed:", err.message);
    return res.status(401).json({ error: "Authentication failed" });
  }
}

/**
 * Optional auth — attaches user if token present, continues without error if missing.
 */
export async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    req.user = null;
    return next();
  }

  // If token present, verify it; otherwise continue as unauthenticated
  await authenticate(req, res, (err) => {
    if (err) {
      req.user = null; // Clear any partial auth
    }
    next();
  });
}
